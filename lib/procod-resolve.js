/**
 * FEAT-157 — resolução ampla de candidatos (camada 2).
 *
 * BM25 próprio (~80 linhas) em vez de biblioteca: `lib/` é espelhado para Deno
 * e para o bundle da extensão, e cada dependência nova paga esse pedágio duas
 * vezes.
 *
 * Pipeline no nó `resolve` (sem mudar GRAPH_REV):
 *   BM25 largo (grupo 04) → RAG/pgvector (nome + DS) → RRF (k=60) →
 *   corte k_select → rerank neural opcional no top-N → memória boost.
 * União, nunca interseção. Query densa = ato+via+sítio — nunca o laudo (PHI).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-synonyms.js")
      : root.AghuProcodSynonyms
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodResolve = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (synonyms) {
  "use strict";

  var K1 = 1.5;
  var B = 0.75;
  var MIN_TOKEN_LEN = 3;
  var CODIGO_RE = /^\d{10}$/;
  /** Grupo SIGTAP 04 — Procedimentos cirúrgicos (prefixo do código de 10 dígitos). */
  var GRUPO_CIRURGICO = "04";
  var BM25_K_LARGO = 80;
  var DEFAULT_K_SELECT = 30;
  /** Cormack et al. SIGIR 2009 — não tunar sem corpus rotulado grande. */
  var RRF_K = 60;
  var RERANK_TOP_N = 20;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function isGrupoCirurgico(codigo, grupo) {
    var g = grupo === undefined ? GRUPO_CIRURGICO : grupo;
    if (g == null || g === false || g === "") return true;
    var digits = str(codigo).replace(/\D/g, "");
    if (digits.length < 2) return false;
    return digits.slice(0, 2) === str(g);
  }

  /** Dobra acentos e caixa; descarta pontuação e tokens curtos. */
  function tokenize(text) {
    var folded = str(text)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    var raw = folded.split(/[^a-z0-9]+/);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].length >= MIN_TOKEN_LEN) out.push(raw[i]);
    }
    return out;
  }

  /**
   * @param {{codigo: string, nome: string, descricao?: string}[]} procedimentos
   * @param {{grupo?: string|false, fields?: "nome"|"nome_ds"}} [opts]
   */
  function buildIndex(procedimentos, opts) {
    opts = opts || {};
    var grupo = opts.grupo === undefined ? GRUPO_CIRURGICO : opts.grupo;
    var fields = opts.fields || "nome";
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    var docs = [];
    var df = {};
    var totalLen = 0;

    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var codigo = str(p.codigo);
      if (grupo && !isGrupoCirurgico(codigo, grupo)) continue;
      var text = str(p.nome);
      if (fields === "nome_ds") text = (text + " " + str(p.descricao)).trim();
      var tokens = tokenize(text);
      var tf = {};
      var seen = {};
      for (var t = 0; t < tokens.length; t++) {
        tf[tokens[t]] = (tf[tokens[t]] || 0) + 1;
        if (!seen[tokens[t]]) {
          seen[tokens[t]] = true;
          df[tokens[t]] = (df[tokens[t]] || 0) + 1;
        }
      }
      docs.push({
        codigo: codigo,
        nome: str(p.nome),
        descricao: str(p.descricao),
        tf: tf,
        len: tokens.length,
      });
      totalLen += tokens.length;
    }

    return {
      docs: docs,
      df: df,
      N: docs.length,
      avgLen: docs.length ? totalLen / docs.length : 0,
      grupo: grupo || "",
    };
  }

  function idf(index, term) {
    var df = index.df[term] || 0;
    return Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
  }

  /**
   * @param {object} index
   * @param {string} query
   * @param {number} k
   * @param {{synonyms?: boolean}} [opts]
   * @returns {{codigo: string, nome: string, score: number}[]}
   */
  function search(index, query, k, opts) {
    opts = opts || {};
    var useSyn = opts.synonyms !== false;
    var terms = tokenize(query);
    if (!terms.length) return [];
    if (useSyn && synonyms && typeof synonyms.expandTokens === "function") {
      terms = synonyms.expandTokens(terms);
    }
    // FEAT-212 (RAG2-AC-14): stemming leve + stopwords — atrás de opt-in
    // (opts.stemming), canary no golden antes de virar default.
    if (
      useSyn &&
      opts.stemming === true &&
      synonyms &&
      typeof synonyms.stemTokens === "function"
    ) {
      terms = synonyms.stemTokens(terms);
    }

    var scored = [];
    for (var d = 0; d < index.docs.length; d++) {
      var doc = index.docs[d];
      var score = 0;
      for (var t = 0; t < terms.length; t++) {
        var tf = doc.tf[terms[t]] || 0;
        if (!tf) continue;
        var norm =
          tf * (K1 + 1) /
          (tf + K1 * (1 - B + (B * doc.len) / (index.avgLen || 1)));
        score += idf(index, terms[t]) * norm;
      }
      if (score > 0) {
        scored.push({ codigo: doc.codigo, nome: doc.nome, score: score });
      }
    }

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
    });
    var limit = typeof k === "number" && k > 0 ? k : scored.length;
    return scored.slice(0, limit);
  }

  /** Texto de consulta a partir do ato estruturado; cai no trecho se preciso. */
  function queryFromAto(ato) {
    ato = ato || {};
    var partes = [ato.ato, ato.via, ato.sitio, ato.lateralidade];
    var q = [];
    for (var i = 0; i < partes.length; i++) {
      if (str(partes[i]).trim()) q.push(str(partes[i]));
    }
    var joined = q.join(" ");
    if (tokenize(joined).length) return joined;
    return str(ato.trecho);
  }

  /**
   * RRF: 1/(k + rank) com rank 1-based. Escala-invariante — não mistura
   * score BM25 com cosseno.
   * @param {number} rank
   * @param {number} [k]
   */
  function rrfContribute(rank, k) {
    var kk = typeof k === "number" && k > 0 ? k : RRF_K;
    var r = Number(rank);
    if (!isFinite(r) || r < 1) return 0;
    return 1 / (kk + r);
  }

  function codigoFromHit(hit) {
    if (hit && typeof hit === "object") return str(hit.codigo);
    return str(hit);
  }

  /**
   * Substitui o prefixo top-N pela ordem do reranker (permutação/subconjunto).
   * Códigos fora do prefixo são ignorados; os que o reranker omitir ficam
   * na ordem original; a cauda depois de topN não mexe.
   */
  function applyRerank(fused, reranked, topN) {
    var list = Array.isArray(fused) ? fused : [];
    var n = typeof topN === "number" && topN > 0 ? topN : RERANK_TOP_N;
    var head = list.slice(0, n);
    var tail = list.slice(n);
    var allowed = {};
    var i;
    for (i = 0; i < head.length; i++) allowed[head[i]] = true;
    var out = [];
    var seen = {};
    var raw = Array.isArray(reranked) ? reranked : [];
    for (i = 0; i < raw.length; i++) {
      var c = codigoFromHit(raw[i]);
      if (!allowed[c] || seen[c]) continue;
      seen[c] = true;
      out.push(c);
    }
    for (i = 0; i < head.length; i++) {
      if (!seen[head[i]]) out.push(head[i]);
    }
    return out.concat(tail);
  }

  /**
   * União BM25 ∪ densos via Reciprocal Rank Fusion, corte k_select,
   * depois memória (boost de posição). Rerank neural é o caller (loop).
   * @param {{bm25?: Array, vetoriais?: Array, memoria?: string[],
   *          k?: number, grupo?: string|false, rrfK?: number}} input
   * @returns {string[]}
   */
  function mergeClosedList(input) {
    input = input || {};
    var grupo = input.grupo === undefined ? GRUPO_CIRURGICO : input.grupo;
    var k =
      typeof input.k === "number" && input.k > 0 ? input.k : DEFAULT_K_SELECT;
    var rrfK =
      typeof input.rrfK === "number" && input.rrfK > 0 ? input.rrfK : RRF_K;
    var score = {};

    function addRanked(hits) {
      var seen = {};
      var rank = 0;
      var list = Array.isArray(hits) ? hits : [];
      for (var i = 0; i < list.length; i++) {
        var c = codigoFromHit(list[i]);
        if (!CODIGO_RE.test(c) || !isGrupoCirurgico(c, grupo) || seen[c]) continue;
        seen[c] = true;
        rank += 1;
        score[c] = (score[c] || 0) + rrfContribute(rank, rrfK);
      }
    }

    addRanked(input.bm25);
    addRanked(input.vetoriais);

    var ranked = [];
    for (var key in score) {
      if (Object.prototype.hasOwnProperty.call(score, key)) ranked.push(key);
    }
    ranked.sort(function (a, b) {
      if (score[b] !== score[a]) return score[b] - score[a];
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var cut = ranked.slice(0, k);

    var seenOut = {};
    var out = [];
    function push(codigo) {
      var c = str(codigo);
      if (!CODIGO_RE.test(c) || seenOut[c]) return;
      if (!isGrupoCirurgico(c, grupo)) return;
      seenOut[c] = true;
      out.push(c);
    }
    var mem = Array.isArray(input.memoria) ? input.memoria : [];
    var i;
    for (i = 0; i < mem.length; i++) push(mem[i]);
    for (i = 0; i < cut.length; i++) push(cut[i]);
    return out;
  }

  /**
   * BM25 largo + união com densos/memória (sync; o caller busca RAG depois).
   * @param {{index: object, ato: object, k?: number, kBm25?: number,
   *          vetoriais?: string[], memoria?: string[], synonyms?: boolean,
   *          stemming?: boolean, grupo?: string|false}} input
   * @returns {string[]}
   */
  function resolveCandidatos(input) {
    input = input || {};
    var query = queryFromAto(input.ato);
    var kBm25 =
      typeof input.kBm25 === "number" && input.kBm25 > 0
        ? input.kBm25
        : BM25_K_LARGO;
    var bm25 = [];
    if (tokenize(query).length && input.index) {
      bm25 = search(input.index, query, kBm25, {
        synonyms: input.synonyms !== false,
        stemming: input.stemming === true,
      });
    }
    return mergeClosedList({
      bm25: bm25,
      vetoriais: input.vetoriais,
      memoria: input.memoria,
      k: input.k,
      grupo: input.grupo,
    });
  }

  return {
    K1: K1,
    B: B,
    MIN_TOKEN_LEN: MIN_TOKEN_LEN,
    GRUPO_CIRURGICO: GRUPO_CIRURGICO,
    BM25_K_LARGO: BM25_K_LARGO,
    DEFAULT_K_SELECT: DEFAULT_K_SELECT,
    RRF_K: RRF_K,
    RERANK_TOP_N: RERANK_TOP_N,
    tokenize: tokenize,
    isGrupoCirurgico: isGrupoCirurgico,
    buildIndex: buildIndex,
    search: search,
    queryFromAto: queryFromAto,
    rrfContribute: rrfContribute,
    applyRerank: applyRerank,
    mergeClosedList: mergeClosedList,
    resolveCandidatos: resolveCandidatos,
  };
});
