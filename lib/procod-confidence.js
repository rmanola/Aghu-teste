/**
 * FEAT-157 — score de confiança 0–1 e corte da proposta.
 *
 * Independente da tabela de compatibilidade (senão todo «sem linha»
 * cairia abaixo do corte e a glosa nunca apareceria). Composto só de
 * verify cego + citação literal + rank na lista fechada do acto.
 *
 * O corte omite não-principais; o âncora permanece com o score visível.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodConfidence = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONFIANCA_CORTE = 0.7;
  var W_VERIFY = 0.5;
  var W_CITATION = 0.3;
  var W_RETRIEVE = 0.2;

  function clamp01(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function verifyScore(verdict) {
    var v = String(verdict || "").toLowerCase();
    if (v === "confirm") return 1;
    if (v === "uncertain") return 0.4;
    return 0;
  }

  function citationScore(literalOk) {
    return literalOk === true ? 1 : 0.5;
  }

  /**
   * Rank 0-based na lista fechada do acto. Ausente → 0.
   * 1 - (rank / k); k = comprimento da lista.
   */
  function retrieveScore(rank, k) {
    var r = Number(rank);
    var kk = Number(k);
    if (!isFinite(kk) || kk <= 0 || !isFinite(r) || r < 0) return 0;
    return clamp01(1 - r / kk);
  }

  /**
   * @param {{verdict?: string, citationOk?: boolean, rank?: number, k?: number}} input
   * @returns {number} em [0, 1]
   */
  function scoreConfianca(input) {
    input = input || {};
    return clamp01(
      W_VERIFY * verifyScore(input.verdict) +
        W_CITATION * citationScore(input.citationOk) +
        W_RETRIEVE * retrieveScore(input.rank, input.k)
    );
  }

  function passaCorte(confianca) {
    return clamp01(confianca) >= CONFIANCA_CORTE;
  }

  function normalizeCodigo(raw) {
    var digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(0, 10);
    return String(raw == null ? "" : raw).trim();
  }

  /**
   * Conserva o principal mesmo abaixo do corte. Não-principais abaixo
   * de CONFIANCA_CORTE saem de kept (e portanto de faturaveis/todos/baldes).
   *
   * @param {Array} itens
   * @param {string} principalCodigo
   * @returns {{kept: Array, dropped: Array}}
   */
  function aplicarCorte(itens, principalCodigo) {
    var list = Array.isArray(itens) ? itens : [];
    var prin = normalizeCodigo(principalCodigo);
    var kept = [];
    var dropped = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i] && typeof list[i] === "object" ? list[i] : null;
      if (!item) continue;
      var codigo = normalizeCodigo(item.codigo);
      var ehPrincipal = Boolean(prin) && codigo === prin;
      if (ehPrincipal || passaCorte(item.confianca)) {
        kept.push(item);
      } else {
        dropped.push(
          Object.assign({}, item, { errorCode: "baixa_confianca" })
        );
      }
    }
    return { kept: kept, dropped: dropped };
  }

  return {
    CONFIANCA_CORTE: CONFIANCA_CORTE,
    W_VERIFY: W_VERIFY,
    W_CITATION: W_CITATION,
    W_RETRIEVE: W_RETRIEVE,
    clamp01: clamp01,
    verifyScore: verifyScore,
    citationScore: citationScore,
    retrieveScore: retrieveScore,
    scoreConfianca: scoreConfianca,
    passaCorte: passaCorte,
    aplicarCorte: aplicarCorte,
  };
});
