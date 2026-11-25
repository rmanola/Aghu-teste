/**
 * FEAT-157 — sinónimos cirúrgicos PT-BR para expansão de consulta.
 *
 * Serve à RESOLUÇÃO (recall), não ao guardrail. Aqui expandir é bom: quanto
 * mais formas de dizer a mesma coisa, mais provável que o código certo entre
 * na lista de candidatos. O travão contra excesso está depois, na seleção e
 * nos guardrails — errar para o lado do recall é barato, errar para o lado da
 * precisão custa uma glosa.
 *
 * A lista é curada à mão de propósito: é conhecimento clínico, e cada entrada
 * deve ser defensável por alguém do domínio.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodSynonyms = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * Chave e valores em forma dobrada (sem acento, minúsculas) — a expansão
   * acontece depois da normalização do tokenizador.
   */
  var SYNONYMS = Object.freeze({
    // Vias de acesso
    vlp: ["videolaparoscopica", "videolaparoscopico", "laparoscopica"],
    video: ["videolaparoscopica", "videolaparoscopico"],
    videolaparoscopia: ["videolaparoscopica", "videolaparoscopico"],
    laparoscopia: ["laparoscopica", "videolaparoscopica"],
    laparotomia: ["laparotomica", "aberta"],
    convencional: ["aberta", "laparotomica"],

    // Sufixos cirúrgicos como conceito
    rafia: ["sutura", "rafia"],
    enterorrafia: ["enterorrafia", "sutura", "intestino", "delgado"],
    ectomia: ["ressecao", "retirada", "exerese"],
    exerese: ["ressecao", "retirada", "ectomia"],
    ressecao: ["exerese", "retirada", "ectomia"],
    ostomia: ["derivacao", "estomia"],
    plastia: ["reconstrucao", "correcao"],
    pexia: ["fixacao"],
    tomia: ["abertura", "incisao"],

    // Órgãos e termos frequentes em laudo
    vesicula: ["vesicula", "biliar", "colecisto"],
    colecisto: ["vesicula", "biliar"],
    colangio: ["colangiografia", "vias", "biliares"],
    aderencias: ["aderencias", "aderenciolise", "lise"],
    aderenciolise: ["lise", "aderencias"],
    hernia: ["hernia", "herniorrafia", "hernioplastia"],
    apendice: ["apendice", "apendicectomia"],
    delgado: ["intestino", "delgado", "enterico"],
    colon: ["colon", "colica", "intestino", "grosso"],
    biopsia: ["biopsia", "biopsias"],
    drenagem: ["drenagem", "dreno"],
    dreno: ["drenagem", "dreno", "laminar"],
    laminar: ["dreno", "drenagem"],
    colectomia: ["colectomia", "colon", "ressecao"],
    ileocolica: ["ileocolica", "ileocolicos", "colectomia"],
    ileocolicos: ["ileocolica", "colectomia"],
  });

  /**
   * Expande uma lista de tokens com os sinónimos conhecidos.
   * Idempotente e sem duplicados — a ordem preserva os tokens originais à frente.
   * @param {string[]} tokens já normalizados (dobrados)
   * @returns {string[]}
   */
  function expandTokens(tokens) {
    var list = Array.isArray(tokens) ? tokens : [];
    var out = [];
    var seen = {};
    function push(t) {
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    for (var i = 0; i < list.length; i++) push(list[i]);
    for (var j = 0; j < list.length; j++) {
      var syn = SYNONYMS[list[j]];
      if (!syn) continue;
      for (var k = 0; k < syn.length; k++) push(syn[k]);
    }
    return out;
  }

  function synonymsFor(token) {
    return SYNONYMS[String(token || "")] || [];
  }

  // FEAT-212 (RAG2-AC-14/T10): stopwords PT-BR mínimas — termos funcionais
  // que só engordam o índice BM25 e a query sem discriminativo algum.
  var STOPWORDS = Object.freeze([
    "com", "sem", "para", "pela", "pelo", "das", "dos", "que", "por",
    "uma", "uno", "apos", "antes", "durante", "entre", "sobre", "ate",
    "foi", "sendo", "sendos", "realizada", "realizado", "procedida",
  ]);

  var STOPWORDS_SET = (function () {
    var s = {};
    for (var i = 0; i < STOPWORDS.length; i++) s[STOPWORDS[i]] = true;
    return s;
  })();

  function isStopword(token) {
    return STOPWORDS_SET[str(token)] === true;
  }

  /**
   * Stemmer leve PT-BR: plurais e sufixos nominais frequentes. NUNCA corta
   * tokens curtos (≤ 5 chars) nem formas que já são o radical — regra de
   * segurança contra colisões ("vesícula" ≠ "vesículas" é aceitável;
   * "colon" → "col" não é). Determinístico, sem dependências.
   * @param {string} token já dobrado (sem acento, minúsculas)
   */
  function stemLeve(token) {
    var orig = str(token);
    var t = orig;
    if (t.length <= 5) return t;
    // Colide o plural na forma singular ANTES de cortar -s:
    // -coes → -cao (complicacoes → complicacao), -oes → -ao
    // (exclusoes → exclusao); singular -cao/-ao fica intocado.
    if (/coes$/.test(t)) t = t.slice(0, -4) + "cao";
    else if (/oes$/.test(t)) t = t.slice(0, -3) + "ao";
    else if (/s$/.test(t) && !/ss$/.test(t)) t = t.slice(0, -1);
    return t.length >= 5 ? t : orig;
  }

  /**
   * Pipeline lexical completo: remove stopwords e reduz cada token ao radical.
   * @param {string[]} tokens já normalizados (dobrados)
   * @returns {string[]}
   */
  function stemTokens(tokens) {
    var list = Array.isArray(tokens) ? tokens : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || isStopword(t)) continue;
      var st = stemLeve(t);
      if (out.indexOf(st) === -1) out.push(st);
    }
    return out;
  }

  return {
    SYNONYMS: SYNONYMS,
    expandTokens: expandTokens,
    synonymsFor: synonymsFor,
    STOPWORDS: STOPWORDS,
    isStopword: isStopword,
    stemLeve: stemLeve,
    stemTokens: stemTokens,
  };
});
