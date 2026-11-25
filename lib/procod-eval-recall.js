/**
 * FEAT-157 — eval offline de recall de candidato (Fase 2).
 *
 * Mede se cada código esperado do gabarito entra na união de candidatos
 * (BM25 ∪ sinónimos ∪ vetoriais injectados). Sem LLM no caminho por omissão:
 * os atos vêm do stub do gabarito (`atos_esperados`), validados com
 * `procod-extract.validateAtos` (trecho opcional; âncora do gabarito).
 *
 * Portão provisório: casos `synthetic_seed` | `human_reviewed` com
 * `codigos_esperados[]`. Exclui `needs_human` e casos sem códigos.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-extract.js")
      : root.AghuProcodExtract,
    typeof require !== "undefined"
      ? require("./procod-resolve.js")
      : root.AghuProcodResolve,
    typeof require !== "undefined"
      ? require("./sigtap-import.js")
      : root.AghuSigtapImport
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodEvalRecall = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  extract,
  resolve,
  sigtap
) {
  "use strict";

  var GATE_THRESHOLD = 0.95;
  var DEFAULT_K = 30;
  var GATE_LABELS = { synthetic_seed: true, human_reviewed: true };

  // FEAT-212 — canal denso real (RAG2-AC-01/02).
  var DENSE_MODO_VALIDOS = { fixture: true, pgvector: true, openai: true };
  var DENSE_FIXTURE_SCHEMA = 1;
  var DENSE_DIMS = 256;
  /** Dimensões do embedding live (text-embedding-3-small) — alinhado a vectorNeighbors na Edge. */
  var EMBED_DIMS_LIVE = 1536;
  var DENSE_SEED = "aghu-feat212-dense-v1";
  var DENSE_CAP_PADRAO = 40;

  function str(v) {
    return v == null ? "" : String(v);
  }

  /** FNV-1a 32-bit — hash determinístico sem dependência externa. */
  function fnv1a(texto) {
    var h = 0x811c9dc5;
    for (var i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Pseudo-embedding determinístico (bag-of-signed-hashes) de um texto.
   * MESMO texto → mesmo vetor sempre (semear fixa DENSE_SEED) — base da
   * fixture densa sintética (RAG2-AC-08: nada de dado real nem rede).
   */
  function pseudoEmbedding(texto) {
    var vec = new Array(DENSE_DIMS);
    for (var i = 0; i < DENSE_DIMS; i++) vec[i] = 0;
    var tokens = resolve.tokenize(str(texto));
    for (var t = 0; t < tokens.length; t++) {
      var h = fnv1a(DENSE_SEED + "\u0000" + tokens[t]);
      var idx = h % DENSE_DIMS;
      var sinal = (h >>> 31) & 1 ? -1 : 1;
      vec[idx] += sinal;
      // segunda projeção reduz colisões entre tokens distintos
      var h2 = fnv1a(tokens[t] + "\u0000" + DENSE_SEED);
      vec[(h2 >>> 7) % DENSE_DIMS] += ((h2 >>> 31) & 1 ? -0.5 : 0.5);
    }
    var norm = 0;
    for (var j = 0; j < DENSE_DIMS; j++) norm += vec[j] * vec[j];
    norm = Math.sqrt(norm);
    if (!norm) return vec;
    for (var k = 0; k < DENSE_DIMS; k++) vec[k] /= norm;
    return vec;
  }

  function dot(a, b) {
    var s = 0;
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  /**
   * Vizinhos densos sintéticos de uma query contra o catálogo: cosseno
   * entre pseudo-embeddings de `nome descricao` e da query, filtro grupo 04
   * e corte no cap (espelha vectorNeighbors da Edge: k=40, filtro 04).
   */
  function vizinhosDensos(queryTexto, procedimentos, docVecs, opts) {
    opts = opts || {};
    var cap =
      typeof opts.cap === "number" && opts.cap > 0 ? opts.cap : DENSE_CAP_PADRAO;
    var qv = pseudoEmbedding(queryTexto);
    var scored = [];
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var codigo = str(p.codigo);
      if (!codigo) continue;
      var dv =
        (docVecs && docVecs[i]) ||
        pseudoEmbedding(p.nome + " " + str(p.descricao));
      scored.push({ codigo: codigo, score: dot(qv, dv) });
    }
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
    });
    var out = [];
    for (var s = 0; s < scored.length && out.length < cap; s++) {
      if (resolve.isGrupoCirurgico(scored[s].codigo)) {
        out.push(scored[s].codigo);
      }
    }
    return out;
  }

  /**
   * Gera a fixture densa versionada a partir do gabarito + catálogo.
   * Chave estável «idDoCaso/atoId» — ato_ids repetem entre casos.
   */
  function gerarFixtureDensa(gabarito, procedimentos, opts) {
    opts = opts || {};
    var cases =
      gabarito && Array.isArray(gabarito.cases) ? gabarito.cases : [];
    var docVecs = null;
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    if (opts.precomputeDocVecs !== false) {
      docVecs = [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i] || {};
        docVecs.push(pseudoEmbedding(p.nome + " " + str(p.descricao)));
      }
    }
    var neighbors = {};
    for (var c = 0; c < cases.length; c++) {
      var caso = cases[c] || {};
      var esperados = Array.isArray(caso.atos_esperados)
        ? caso.atos_esperados
        : [];
      for (var a = 0; a < esperados.length; a++) {
        var esp = esperados[a] || {};
        var ato = {
          ato: esp.ato,
          via: esp.via,
          sitio: esp.sitio,
          lateralidade: esp.lateralidade,
          trecho: esp.trecho_ancoragem,
        };
        neighbors[str(caso.id) + "/" + str(esp.ato_id)] = vizinhosDensos(
          resolve.queryFromAto(ato),
          list,
          docVecs,
          opts
        );
      }
    }
    return {
      schema_version: DENSE_FIXTURE_SCHEMA,
      source: "synthetic-deterministic",
      seed: DENSE_SEED,
      competencia: str(gabarito && gabarito.competencia),
      neighbors: neighbors,
    };
  }

  /** Fail-fast na fronteira: fixture inválida explode com mensagem acionável. */
  function validarFixtureDensa(fixture) {
    if (!fixture || typeof fixture !== "object") {
      throw new Error("Fixture densa inválida: objeto ausente.");
    }
    if (Number(fixture.schema_version) !== DENSE_FIXTURE_SCHEMA) {
      throw new Error(
        "Fixture densa schema_version=" +
          str(fixture.schema_version) +
          " ≠ " +
          DENSE_FIXTURE_SCHEMA +
          " — regenere com --write-dense-fixture."
      );
    }
    if (
      !fixture.neighbors ||
      typeof fixture.neighbors !== "object" ||
      Array.isArray(fixture.neighbors)
    ) {
      throw new Error("Fixture densa sem mapa neighbors.");
    }
    for (var chave in fixture.neighbors) {
      if (!Object.prototype.hasOwnProperty.call(fixture.neighbors, chave)) continue;
      var arr = fixture.neighbors[chave];
      if (!Array.isArray(arr)) {
        throw new Error(
          "Fixture densa: neighbors[" + chave + "] não é array."
        );
      }
      for (var i = 0; i < arr.length; i++) {
        if (!/^\d{8,10}$/.test(str(arr[i]))) {
          throw new Error(
            "Fixture densa: código inválido em neighbors[" +
              chave +
              "]: " +
              str(arr[i])
          );
        }
      }
    }
    return fixture;
  }

  /**
   * Lê a fixture de texto JSON com validação na fronteira.
   * @param {string} textoJson
   */
  function carregarFixtureDensa(textoJson) {
    var obj;
    try {
      obj = JSON.parse(str(textoJson));
    } catch (e) {
      throw new Error("Fixture densa não parseia como JSON: " + e.message);
    }
    return validarFixtureDensa(obj);
  }

  /**
   * @param {object} gabarito
   * @param {object} [opts]
   * @param {boolean} [opts.includeNeedsHuman]
   * @returns {object[]}
   */
  function selectGateCases(gabarito, opts) {
    opts = opts || {};
    var cases = gabarito && Array.isArray(gabarito.cases) ? gabarito.cases : [];
    var out = [];
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i] || {};
      var status = str(c.label_status);
      if (!opts.includeNeedsHuman && status === "needs_human") continue;
      if (!GATE_LABELS[status] && !opts.includeNeedsHuman) continue;
      var codes = Array.isArray(c.codigos_esperados) ? c.codigos_esperados : [];
      var labeled = [];
      for (var j = 0; j < codes.length; j++) {
        var row = codes[j] || {};
        if (!str(row.codigo).trim()) continue;
        var ls = str(row.label_status || status);
        if (ls === "needs_human" && !opts.includeNeedsHuman) continue;
        labeled.push(row);
      }
      if (!labeled.length) continue;
      out.push({ case: c, codigos: labeled });
    }
    return out;
  }

  /**
   * Stub determinístico: atos do gabarito → shape de extract, com atoId estável.
   * Valida citação contra a descrição (fail-fast se âncora inválida).
   *
   * @param {object} caso
   * @param {string} descricao
   * @returns {{ok: boolean, atos: Array, invalidos: Array, error?: string}}
   */
  function stubAtosFromGabarito(caso, descricao) {
    var esperados = Array.isArray(caso && caso.atos_esperados)
      ? caso.atos_esperados
      : [];
    var raw = {
      atos: esperados.map(function (a) {
        return {
          ato: a.ato,
          via: a.via,
          sitio: a.sitio,
          lateralidade: a.lateralidade,
          trecho: a.trecho_ancoragem,
        };
      }),
    };
    var validated = extract.validateAtos(raw, descricao);
    if (validated.invalidos.length) {
      return {
        ok: false,
        atos: [],
        invalidos: validated.invalidos,
        error:
          "Stub de extract falhou citação em " +
          str(caso && caso.id) +
          " (" +
          validated.invalidos.length +
          " inválido(s)).",
      };
    }
    // Remapeia atoId para o do gabarito (não o índice sequencial do extract).
    var atos = [];
    for (var i = 0; i < validated.atos.length; i++) {
      var v = validated.atos[i];
      var src = esperados[i] || {};
      atos.push({
        atoId: str(src.ato_id || v.atoId),
        ato: v.ato,
        via: v.via,
        sitio: v.sitio,
        lateralidade: v.lateralidade,
        trecho: v.trecho,
      });
    }
    return { ok: true, atos: atos, invalidos: [] };
  }

  /**
   * @param {{codigo: string, nome: string}[]} procedimentos
   * @param {object[]} atos
   * @param {{k?: number, vetoriaisByAto?: Object<string, string[]>,
   *          denseByAtoKey?: Object<string, string[]>}} [opts]
   * @returns {Object<string, string[]>}
   */
  function resolveAtos(procedimentos, atos, opts) {
    opts = opts || {};
    var index = resolve.buildIndex(procedimentos);
    var indexDs = resolve.buildIndex(procedimentos, { fields: "nome_ds" });
    var k = typeof opts.k === "number" && opts.k > 0 ? opts.k : DEFAULT_K;
    var vetMap = opts.vetoriaisByAto || {};
    var denseMap = opts.denseByAtoKey || {};
    var useRag = opts.rag !== false;
    // FEAT-212 (RAG2-AC-01): com canal denso real activo, NÃO fundir BM25
    // nome_ds na lista vetorial do RRF — nome_ds fica só no mapa bm25 de
    // scoreCanais. Stub legado (sem --dense / sem denseByAtoKey) conserva
    // o merge antigo para regressão.
    var denseActivo =
      Object.keys(denseMap).length > 0 ||
      !!(opts.denseMode && DENSE_MODO_VALIDOS[str(opts.denseMode)]);
    var resolvedByAto = {};
    var list = Array.isArray(atos) ? atos : [];
    for (var i = 0; i < list.length; i++) {
      var ato = list[i] || {};
      var id = str(ato.atoId);
      // FEAT-212: canal denso real — chave estável «casoId/atoId» (RAG2-AC-02).
      // Sem chave disponível (atos live), cai no mapa por atoId puro.
      var vet = [];
      var denseKey = str(ato.denseKey) || id;
      if (Array.isArray(denseMap[denseKey])) {
        vet = denseMap[denseKey].slice();
      } else {
        vet = Array.isArray(vetMap[id]) ? vetMap[id].slice() : [];
      }
      if (useRag && !denseActivo) {
        var ragHits = resolve.search(indexDs, resolve.queryFromAto(ato), 20, {
          stemming: opts.stemming === true,
        });
        for (var r = 0; r < ragHits.length; r++) {
          if (vet.indexOf(ragHits[r].codigo) === -1) vet.push(ragHits[r].codigo);
        }
      }
      resolvedByAto[id] = resolve.resolveCandidatos({
        index: index,
        ato: ato,
        k: k,
        kBm25: resolve.BM25_K_LARGO,
        vetoriais: vet,
        memoria: Array.isArray(opts.memoria) ? opts.memoria : [],
        synonyms: opts.synonyms !== false,
        stemming: opts.stemming === true,
      });
    }
    return resolvedByAto;
  }

  /**
   * FEAT-212 (RAG2-AC-02): filtra linhas do RPC `match_sigtap_procedimento`
   * para o grupo 04 — mesmo contrato de `vectorNeighbors` na Edge.
   * @param {Array<{codigo?: string}>|null|undefined} data
   * @returns {string[]}
   */
  function codigosDeMatchSigtap(data) {
    if (!Array.isArray(data)) return [];
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var codigo = str(data[i] && data[i].codigo);
      if (codigo && codigo.replace(/\D/g, "").slice(0, 2) === "04") {
        out.push(codigo);
      }
    }
    return out;
  }

  /**
   * FEAT-212 (RAG2-AC-02): monta mapa chave→códigos via embed+RPC injectáveis
   * (ramo `--dense pgvector` do eval). Sem rede no teste — mock de deps.
   * @param {{chave: string, query: string}[]} itens
   * @param {{embedQuery: function(string): Promise<number[]|null>,
   *          rpcMatch: function(number[], number): Promise<Array>,
   *          k?: number}} deps
   * @returns {Promise<Object<string, string[]>>}
   */
  async function montarVizinhosViaRpc(itens, deps) {
    deps = deps || {};
    if (typeof deps.embedQuery !== "function" || typeof deps.rpcMatch !== "function") {
      throw new Error(
        "montarVizinhosViaRpc exige deps.embedQuery e deps.rpcMatch (fail-fast)"
      );
    }
    var k =
      typeof deps.k === "number" && deps.k > 0 ? deps.k : DENSE_CAP_PADRAO;
    var list = Array.isArray(itens) ? itens : [];
    var out = {};
    for (var i = 0; i < list.length; i++) {
      var it = list[i] || {};
      var chave = str(it.chave);
      if (!chave) continue;
      var emb = await deps.embedQuery(str(it.query));
      if (!emb || !Array.isArray(emb) || emb.length !== EMBED_DIMS_LIVE) {
        out[chave] = [];
        continue;
      }
      var rows = await deps.rpcMatch(emb, k);
      out[chave] = codigosDeMatchSigtap(rows);
    }
    return out;
  }

  /**
   * Itens de query densa a partir do gabarito (chave casoId/atoId).
   * @param {object} gabarito
   * @param {{includeNeedsHuman?: boolean}} [opts]
   * @returns {{chave: string, query: string}[]}
   */
  function listarItensDenseDoGabarito(gabarito, opts) {
    var selected = selectGateCases(gabarito, opts || {});
    var itens = [];
    for (var i = 0; i < selected.length; i++) {
      var caso = selected[i].case;
      var esperados = Array.isArray(caso.atos_esperados) ? caso.atos_esperados : [];
      for (var j = 0; j < esperados.length; j++) {
        var esp = esperados[j] || {};
        itens.push({
          chave: str(caso.id) + "/" + str(esp.ato_id),
          query: [esp.ato, esp.via, esp.sitio, esp.lateralidade]
            .filter(Boolean)
            .join(" "),
        });
      }
    }
    return itens;
  }

  /**
   * @param {{codigo: string, ato_id: string}[]} expected
   * @param {Object<string, string[]>} resolvedByAto
   * @returns {Object<string, {codigo: string, posicao: number}>}
   */
  function posicoesPorAto(expected, resolvedByAto) {
    var out = {};
    var list = Array.isArray(expected) ? expected : [];
    for (var i = 0; i < list.length; i++) {
      var exp = list[i] || {};
      var codigo = str(exp.codigo);
      var cands = (resolvedByAto && resolvedByAto[exp.ato_id]) || [];
      out[codigo + "@" + str(exp.ato_id)] = {
        codigo: codigo,
        posicao: cands.indexOf(codigo),
      };
    }
    return out;
  }

  /**
   * @param {{codigo: string, ato_id: string}[]} expected
   * @param {Object<string, string[]>} resolvedByAto
   */
  function scoreCase(expected, resolvedByAto) {
    var hits = 0;
    var details = [];
    // FEAT-212 (RAG2-AC-03): nDCG por ATO — DCG soma ganhos de rankings
    // distintos se feito no caso inteiro; por ato o ranking é único e a razão
    // fica em [0,1]. nDCG do caso = média simples dos nDCG dos seus atos.
    var atosDoCaso = [];
    var list = Array.isArray(expected) ? expected : [];
    for (var i = 0; i < list.length; i++) {
      var exp = list[i] || {};
      var codigo = str(exp.codigo);
      var atoId = str(exp.ato_id);
      if (atosDoCaso.indexOf(atoId) === -1) atosDoCaso.push(atoId);
      var cands = (resolvedByAto && resolvedByAto[atoId]) || [];
      var pos = cands.indexOf(codigo);
      var hit = pos !== -1;
      if (hit) hits++;
      details.push({
        codigo: codigo,
        ato_id: atoId,
        hit: hit,
        posicao: pos,
        candidateCount: cands.length,
        papel: str(exp.papel),
        slice: str(exp.slice),
      });
    }
    var soma = 0;
    var conta = 0;
    for (var a = 0; a < atosDoCaso.length; a++) {
      var ato = atosDoCaso[a];
      var ranking = (resolvedByAto && resolvedByAto[ato]) || [];
      var esperadosDoAto = [];
      for (var j = 0; j < list.length; j++) {
        if (str(list[j].ato_id) === ato) esperadosDoAto.push(str(list[j].codigo));
      }
      var nd = ndcgAtK(ranking, esperadosDoAto, ranking.length || undefined);
      if (nd != null) {
        soma += nd;
        conta++;
      }
    }
    return {
      total: list.length,
      hits: hits,
      recall: list.length ? hits / list.length : null,
      ndcg: conta ? soma / conta : null,
      details: details,
    };
  }

  /**
   * Recall por papel (principal / secundario) a partir de details do scoreCase.
   * @param {{papel?: string, hit?: boolean}[]} details
   */
  function scorePapel(details) {
    var buckets = {};
    var list = Array.isArray(details) ? details : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var papel = str(row.papel) || "outro";
      if (!buckets[papel]) buckets[papel] = { hits: 0, total: 0 };
      buckets[papel].total += 1;
      if (row.hit) buckets[papel].hits += 1;
    }
    var out = {};
    for (var k in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, k)) continue;
      var b = buckets[k];
      out[k] = {
        hits: b.hits,
        total: b.total,
        recall: b.total ? b.hits / b.total : null,
      };
    }
    return out;
  }

  function f1FromPr(precision, recall) {
    if (precision == null || recall == null) return null;
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  /**
   * FEAT-212 (RAG2-AC-03): nDCG@k pela posição do código esperado no
   * ranking fundido. Ganho binário (relevância = 1): DCG = Σ rel_i/log2(i+1),
   * IDCG = soma dos k primeiros termos com todos relevantes — para um caso
   * com m esperados presentes em qualquer posição, o ideal é m termos.
   * @param {string[]} ranking códigos na ordem do mergeClosedList
   * @param {string[]} esperados códigos rotulados do caso/ato
   * @param {number} [k]
   */
  function ndcgAtK(ranking, esperados, k) {
    var rank = Array.isArray(ranking) ? ranking : [];
    var esp = [];
    var vistos = {};
    var list = Array.isArray(esperados) ? esperados : [];
    for (var i = 0; i < list.length; i++) {
      var c = str(list[i]);
      if (!c || vistos[c]) continue;
      vistos[c] = true;
      esp.push(c);
    }
    if (!esp.length) return null;
    var corte = typeof k === "number" && k > 0 ? Math.min(k, rank.length) : rank.length;
    var dcg = 0;
    var encontrados = 0;
    for (var r = 0; r < corte; r++) {
      if (vistos[rank[r]]) {
        encontrados++;
        dcg += 1 / Math.log2(r + 2);
      }
    }
    var idcg = 0;
    for (var d = 0; d < Math.min(esp.length, corte); d++) {
      idcg += 1 / Math.log2(d + 2);
    }
    return idcg ? dcg / idcg : null;
  }

  /**
   * FEAT-212 (RAG2-AC-04): fatiamento por tag `slice` declarada no gabarito.
   * Complementa scorePapel (papel vem de codigos_esperados[].papel; slice de
   * casos_esperados[].slice ou herda do caso). Buckets: hits/total/recall.
   * @param {{papel?: string, hit?: boolean}[]} details
   * @param {{slice?: string}} [caso]
   */
  function scoreSlices(details, caso) {
    var buckets = {};
    var list = Array.isArray(details) ? details : [];
    var casoSlice = str(caso && caso.slice);
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var tag = str(row.slice) || casoSlice;
      if (!tag) continue;
      if (!buckets[tag]) buckets[tag] = { hits: 0, total: 0 };
      buckets[tag].total += 1;
      if (row.hit) buckets[tag].hits += 1;
    }
    var out = {};
    for (var k in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, k)) continue;
      var b = buckets[k];
      out[k] = {
        hits: b.hits,
        total: b.total,
        recall: b.total ? b.hits / b.total : null,
      };
    }
    return out;
  }

  /**
   * FEAT-212 (RAG2-AC-01): métricas por canal com atribuição de falha.
   * bm25 = canal lexical do eval (BM25 largo ∪ sinónimos ∪ BM25 nome_ds);
   * dense = vizinhos reais injectados (só quando comDense); fused = união
   * final avaliada pelo mergeClosedList/corte k_select. Cada miss é atribuído
   * ao canal que não continha o código; se ambos continham e a fusão perde,
   * a falha é da fusão.
   * @param {{codigo: string, ato_id: string}[]} expected
   * @param {Object<string, string[]>} resolvedByAto
   * @param {{bm25ByAto?: Object<string, string[]>, denseByAto?: Object<string, string[]>}} canais
   * @param {{comDense?: boolean}} [opts]
   */
  function scoreCanais(expected, resolvedByAto, canais, opts) {
    var list = Array.isArray(expected) ? expected : [];
    var comDense = !!(opts && opts.comDense);
    var bm25Total = 0;
    var bm25Hits = 0;
    var denseTotal = 0;
    var denseHits = 0;
    var fusedTotal = 0;
    var fusedHits = 0;
    var misses = [];
    for (var i = 0; i < list.length; i++) {
      var exp = list[i] || {};
      var codigo = str(exp.codigo);
      var atoId = str(exp.ato_id);
      var noBm25 =
        ((canais && canais.bm25ByAto && canais.bm25ByAto[atoId]) || []).indexOf(codigo) !== -1;
      var noDense =
        ((canais && canais.denseByAto && canais.denseByAto[atoId]) || []).indexOf(codigo) !== -1;
      var naFusao =
        ((resolvedByAto && resolvedByAto[atoId]) || []).indexOf(codigo) !== -1;
      if (noBm25) bm25Hits++;
      bm25Total++;
      if (comDense) {
        if (noDense) denseHits++;
        denseTotal++;
      }
      if (naFusao) fusedHits++;
      fusedTotal++;
      if (!naFusao) {
        misses.push({
          codigo: codigo,
          ato_id: atoId,
          canal:
            !noBm25 && !(comDense && noDense)
              ? "ambos"
              : !noBm25
                ? "bm25"
                : comDense
                  ? "dense"
                  : "fusion",
        });
      }
    }
    return {
      recall_bm25: bm25Total ? bm25Hits / bm25Total : null,
      recall_dense: denseTotal ? denseHits / denseTotal : null,
      recall_fused: fusedTotal ? fusedHits / fusedTotal : null,
      hits_bm25: bm25Hits,
      hits_dense: denseHits,
      hits_fused: fusedHits,
      total: fusedTotal,
      misses: misses,
    };
  }

  /**
   * @param {object} input
   * @param {object} input.gabarito
   * @param {Object<string, string>} input.sourcesByRelativePath  path → texto
   * @param {{codigo: string, nome: string}[]} input.procedimentos
   * @param {{k?: number, includeNeedsHuman?: boolean, threshold?: number,
   *          denseMode?: string, fixtureDensa?: object}} [input.opts]
   */
  function evaluateRecall(input) {
    input = input || {};
    var opts = input.opts || {};
    var threshold =
      typeof opts.threshold === "number" ? opts.threshold : GATE_THRESHOLD;
    var denseMode = DENSE_MODO_VALIDOS[str(opts.denseMode)] ? str(opts.denseMode) : null;
    var fixtureDensa = opts.fixtureDensa || null;
    if (fixtureDensa) {
      validarFixtureDensa(fixtureDensa);
      if (!denseMode) denseMode = "fixture";
    }
    if (opts.denseMode && !denseMode) {
      throw new Error(
        "denseMode inválido: «" +
          str(opts.denseMode) +
          "» — use fixture|pgvector|openai."
      );
    }
    var selected = selectGateCases(input.gabarito, opts);
    var caseResults = [];
    var hits = 0;
    var total = 0;
    var errors = [];
    var ndcgSum = 0;
    var ndcgTotal = 0;
    var aggCanais = {
      hits_bm25: 0,
      hits_dense: 0,
      hits_fused: 0,
      total: 0,
      misses: [],
    };

    for (var i = 0; i < selected.length; i++) {
      var sel = selected[i];
      var caso = sel.case;
      var srcKey = str(caso.source_file);
      var descricao = str(
        input.sourcesByRelativePath && input.sourcesByRelativePath[srcKey]
      );
      if (!descricao) {
        errors.push({
          id: caso.id,
          error: "Fonte em falta: " + srcKey,
        });
        continue;
      }
      var stub = stubAtosFromGabarito(caso, descricao);
      if (!stub.ok) {
        errors.push({ id: caso.id, error: stub.error, invalidos: stub.invalidos });
        continue;
      }
      // FEAT-212: anota cada ato com a chave estável «casoId/atoId» para o
      // canal denso real; resolveAtos lê opts.denseByAtoKey por essa chave.
      var denseMap = {};
      var densePresente = false;
      var fonteVizinhos =
        denseMode === "fixture"
          ? fixtureDensa.neighbors
          : opts.vizinhosPorChave || null;
      if (fonteVizinhos) {
        for (var s = 0; s < stub.atos.length; s++) {
          var atoS = stub.atos[s];
          var chave = str(caso.id) + "/" + str(atoS.atoId);
          var viz = fonteVizinhos[chave];
          if (!Array.isArray(viz)) {
            throw new Error(
              (denseMode === "fixture"
                ? "Fixture densa sem entrada para "
                : "Vizinhos densos ausentes para ") +
                chave +
                (denseMode === "fixture"
                  ? " — regenere com --write-dense-fixture."
                  : ".")
            );
          }
          denseMap[atoS.atoId] = viz.slice();
          densePresente = true;
          atoS.denseKey = chave;
        }
      }
      var resolvedByAto = resolveAtos(input.procedimentos, stub.atos, {
        k: opts.k,
        threshold: opts.threshold,
        includeNeedsHuman: opts.includeNeedsHuman,
        rag: opts.rag,
        synonyms: opts.synonyms,
        memoria: opts.memoria,
        denseByAtoKey: fonteVizinhos,
        denseMode: denseMode || undefined,
        stemming: opts.stemming === true,
      });
      // FEAT-212 (RAG2-AC-06): gancho de pós-processamento do ranking fundido
      // (usado pelo --rerank-compare para simular listwise; em produção quem
      // aplica rerank é o fillResolve via deps.rerank + applyRerank).
      if (typeof opts.posProcessa === "function") {
        resolvedByAto = opts.posProcessa(resolvedByAto) || resolvedByAto;
      }

      // Canal lexical do eval replicado fora do mergeClosedList p/ métrica
      // (mesmos índices e parâmetros que resolveAtos usa internamente).
      var bm25Map = {};
      var indexLex = resolve.buildIndex(input.procedimentos || []);
      var indexDsLex = resolve.buildIndex(input.procedimentos || [], {
        fields: "nome_ds",
      });
      var useRag = opts.rag !== false;
      for (var b = 0; b < stub.atos.length; b++) {
        var atoB = stub.atos[b];
        var q = resolve.queryFromAto(atoB);
        var lex = [];
        var idx;
        var hitsLex = indexLex
          ? resolve.search(indexLex, q, resolve.BM25_K_LARGO)
          : [];
        for (idx = 0; idx < hitsLex.length; idx++) {
          if (lex.indexOf(hitsLex[idx].codigo) === -1) lex.push(hitsLex[idx].codigo);
        }
        if (useRag) {
          var hitsDs = resolve.search(indexDsLex, q, 20);
          for (var d2 = 0; d2 < hitsDs.length; d2++) {
            if (lex.indexOf(hitsDs[d2].codigo) === -1) lex.push(hitsDs[d2].codigo);
          }
        }
        bm25Map[atoB.atoId] = lex;
      }

      var scored = scoreCase(sel.codigos, resolvedByAto);
      var canais = scoreCanais(
        sel.codigos,
        resolvedByAto,
        { bm25ByAto: bm25Map, denseByAto: denseMap },
        { comDense: densePresente }
      );
      if (!densePresente) canais.recall_dense = null;
      aggCanais.hits_bm25 += canais.hits_bm25;
      aggCanais.hits_dense += canais.hits_dense;
      aggCanais.hits_fused += canais.hits_fused;
      aggCanais.total += canais.total;
      aggCanais.misses = aggCanais.misses.concat(canais.misses || []);
      if (scored.ndcg != null) {
        ndcgSum += scored.ndcg * scored.total;
        ndcgTotal += scored.total;
      }
      // FEAT-212 (RAG2-AC-04): slice declarado no caso herda para os códigos
      // sem slice próprio — é o que alimenta scoreSlices(allDetails).
      for (var di = 0; di < scored.details.length; di++) {
        if (!scored.details[di].slice) {
          scored.details[di].slice = str(caso.slice);
        }
      }
      hits += scored.hits;
      total += scored.total;
      caseResults.push({
        id: caso.id,
        label_status: caso.label_status,
        recall: scored.recall,
        ndcg: scored.ndcg,
        hits: scored.hits,
        total: scored.total,
        details: scored.details,
        canais: {
          recall_bm25: canais.recall_bm25,
          recall_dense: canais.recall_dense,
          recall_fused: canais.recall_fused,
          misses: canais.misses,
        },
        denseAtivo: densePresente,
        resolvedByAto: resolvedByAto,
        atosExtracted: stub.atos.length,
        atosExpected: Array.isArray(caso.atos_esperados)
          ? caso.atos_esperados.length
          : 0,
      });
    }

    var recall = total ? hits / total : null;
    var pass = recall != null && recall >= threshold && errors.length === 0;
    var allDetails = [];
    for (var d = 0; d < caseResults.length; d++) {
      var det = caseResults[d].details || [];
      for (var e = 0; e < det.length; e++) allDetails.push(det[e]);
    }
    return {
      tier: "recall",
      mode: denseMode ? "offline-dense-" + denseMode : "offline-stub",
      denseMode: denseMode,
      threshold: threshold,
      pass: pass,
      recall: recall,
      canais: {
        recall_bm25: aggCanais.total ? aggCanais.hits_bm25 / aggCanais.total : null,
        recall_dense: denseMode && aggCanais.total
          ? aggCanais.hits_dense / aggCanais.total
          : null,
        recall_fused: aggCanais.total ? aggCanais.hits_fused / aggCanais.total : null,
        hits_bm25: aggCanais.hits_bm25,
        hits_dense: aggCanais.hits_dense,
        hits_fused: aggCanais.hits_fused,
        total: aggCanais.total,
        misses: aggCanais.misses,
      },
      hits: hits,
      total: total,
      ndcg: ndcgTotal ? ndcgSum / ndcgTotal : null,
      casesEvaluated: caseResults.length,
      cases: caseResults,
      papel: scorePapel(allDetails),
      slices: scoreSlices(allDetails),
      errors: errors,
      note:
        "Portão Fase 2 provisório sobre synthetic_seed|human_reviewed; needs_human excluído." +
        (denseMode
          ? " Canal denso real via modo " + denseMode + " (FEAT-212)."
          : ""),
    };
  }

  /**
   * Carrega catálogo a partir de pacote SIGTAP (layout + fixed-width).
   * @param {string} layoutText
   * @param {string|Buffer} dataText
   * @returns {{codigo: string, nome: string}[]}
   */
  function procedimentosFromSigtapTexts(layoutText, dataText) {
    var cols = sigtap.parseLayout(layoutText);
    var rows = sigtap.parseFixedWidth(
      sigtap.decodeSigtapBuffer(dataText),
      cols
    );
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        codigo: str(r.CO_PROCEDIMENTO).trim(),
        nome: str(r.NO_PROCEDIMENTO).trim(),
        descricao: str(r.DS_PROCEDIMENTO).trim() || "",
      });
    }
    return out;
  }

  function mergeDescricaoFromSigtapTexts(procedimentos, layoutText, dataText) {
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    if (!layoutText || dataText == null) return list;
    var cols = sigtap.parseLayout(layoutText);
    var rows = sigtap.parseFixedWidth(
      sigtap.decodeSigtapBuffer(dataText),
      cols
    );
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var codigo = str(rows[i].CO_PROCEDIMENTO).trim();
      if (codigo) map[codigo] = str(rows[i].DS_PROCEDIMENTO).trim();
    }
    for (var j = 0; j < list.length; j++) {
      if (map[list[j].codigo]) list[j].descricao = map[list[j].codigo];
    }
    return list;
  }

  return {
    GATE_THRESHOLD: GATE_THRESHOLD,
    DEFAULT_K: DEFAULT_K,
    DENSE_MODO_VALIDOS: DENSE_MODO_VALIDOS,
    DENSE_FIXTURE_SCHEMA: DENSE_FIXTURE_SCHEMA,
    DENSE_DIMS: DENSE_DIMS,
    EMBED_DIMS_LIVE: EMBED_DIMS_LIVE,
    DENSE_SEED: DENSE_SEED,
    DENSE_CAP_PADRAO: DENSE_CAP_PADRAO,
    selectGateCases: selectGateCases,
    stubAtosFromGabarito: stubAtosFromGabarito,
    fnv1a: fnv1a,
    pseudoEmbedding: pseudoEmbedding,
    vizinhosDensos: vizinhosDensos,
    gerarFixtureDensa: gerarFixtureDensa,
    validarFixtureDensa: validarFixtureDensa,
    carregarFixtureDensa: carregarFixtureDensa,
    resolveAtos: resolveAtos,
    codigosDeMatchSigtap: codigosDeMatchSigtap,
    montarVizinhosViaRpc: montarVizinhosViaRpc,
    listarItensDenseDoGabarito: listarItensDenseDoGabarito,
    scoreCase: scoreCase,
    scorePapel: scorePapel,
    scoreSlices: scoreSlices,
    scoreCanais: scoreCanais,
    ndcgAtK: ndcgAtK,
    posicoesPorAto: posicoesPorAto,
    f1FromPr: f1FromPr,
    evaluateRecall: evaluateRecall,
    procedimentosFromSigtapTexts: procedimentosFromSigtapTexts,
    mergeDescricaoFromSigtapTexts: mergeDescricaoFromSigtapTexts,
  };
});
