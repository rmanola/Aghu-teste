/**
 * FEAT-157 — códigos de erro do agente codificador.
 *
 * Lista fechada: erro sem código conhecido é bug, não caso de uso. Os códigos
 * são o vocabulário partilhado entre grafo, state, guardrails e telemetria —
 * o Tier 3 agrega por eles, então mudar um código é mudar uma métrica.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodErrorCodes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** O LLM devolveu código que ninguém propôs — alucinação de código. */
  var CODE_NOT_IN_CANDIDATES = "code_not_in_candidates";
  /** A evidência citada não é substring literal da descrição — alucinação de prova. */
  var CITATION_NOT_SUBSTRING = "citation_not_substring";
  /** Código não existe na competência vigente na data da cirurgia. */
  var CODE_NOT_IN_COMPETENCIA = "code_not_in_competencia";
  /** Guardrails discordaram: vai para HITL, nunca descarte silencioso. */
  var GUARD_DIVERGENCE = "guard_divergence";
  var REPAIR_EXHAUSTED = "repair_exhausted";
  var NO_CANDIDATES = "no_candidates";
  var NO_ATOS_EXTRACTED = "no_atos_extracted";
  var VERDICT_MISSING = "verdict_missing";
  var COMPETENCIA_MISSING = "competencia_missing";
  var TOKEN_BUDGET_EXCEEDED = "token_budget_exceeded";
  var ILLEGAL_TRANSITION = "illegal_transition";
  var EXTRACT_INVALID = "extract_invalid";
  /** Confirmado pelo verify mas abaixo do corte de confiança — omitido da proposta. */
  var BAIXA_CONFIANCA = "baixa_confianca";

  var ALL = Object.freeze([
    CODE_NOT_IN_CANDIDATES,
    CITATION_NOT_SUBSTRING,
    CODE_NOT_IN_COMPETENCIA,
    GUARD_DIVERGENCE,
    REPAIR_EXHAUSTED,
    NO_CANDIDATES,
    NO_ATOS_EXTRACTED,
    VERDICT_MISSING,
    COMPETENCIA_MISSING,
    TOKEN_BUDGET_EXCEEDED,
    ILLEGAL_TRANSITION,
    EXTRACT_INVALID,
    BAIXA_CONFIANCA,
  ]);

  function isKnown(code) {
    return ALL.indexOf(String(code || "")) !== -1;
  }

  /** Erro com `.code` para o loop rotear sem inspecionar mensagem. */
  function makeError(code, message) {
    if (!isKnown(code)) {
      throw new Error("Código de erro desconhecido no agente PROCOD: " + code);
    }
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  return {
    CODE_NOT_IN_CANDIDATES: CODE_NOT_IN_CANDIDATES,
    CITATION_NOT_SUBSTRING: CITATION_NOT_SUBSTRING,
    CODE_NOT_IN_COMPETENCIA: CODE_NOT_IN_COMPETENCIA,
    GUARD_DIVERGENCE: GUARD_DIVERGENCE,
    REPAIR_EXHAUSTED: REPAIR_EXHAUSTED,
    NO_CANDIDATES: NO_CANDIDATES,
    NO_ATOS_EXTRACTED: NO_ATOS_EXTRACTED,
    VERDICT_MISSING: VERDICT_MISSING,
    COMPETENCIA_MISSING: COMPETENCIA_MISSING,
    TOKEN_BUDGET_EXCEEDED: TOKEN_BUDGET_EXCEEDED,
    ILLEGAL_TRANSITION: ILLEGAL_TRANSITION,
    EXTRACT_INVALID: EXTRACT_INVALID,
    BAIXA_CONFIANCA: BAIXA_CONFIANCA,
    ALL: ALL,
    isKnown: isKnown,
    makeError: makeError,
  };
});
