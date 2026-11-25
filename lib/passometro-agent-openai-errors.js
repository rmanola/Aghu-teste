/**
 * FEAT-071 — mapeamento HTTP OpenAI → códigos estáveis (sem body/secrets).
 * Espelha supabase/functions/passometro-agent/lib.ts (mapOpenAiHttpToErrorCode).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentOpenaiErrors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Códigos de falha LLM devolvidos pela Edge (502) ou config (500). */
  var LLM_FAILURE_CODES = Object.freeze([
    "llm_failed",
    "openai_request_failed",
    "openai_unauthorized",
    "openai_rate_limited",
    "openai_empty_response",
    "server_misconfigured",
  ]);

  /**
   * @param {number} status
   * @returns {"openai_unauthorized"|"openai_rate_limited"|"openai_request_failed"}
   */
  function mapOpenAiHttpToErrorCode(status) {
    var s = Number(status) || 0;
    if (s === 401 || s === 403) {
      return "openai_unauthorized";
    }
    if (s === 429) {
      return "openai_rate_limited";
    }
    return "openai_request_failed";
  }

  /**
   * @param {string} code
   * @returns {boolean}
   */
  function isLlmFailureError(code) {
    return LLM_FAILURE_CODES.indexOf(String(code || "")) !== -1;
  }

  return {
    LLM_FAILURE_CODES: LLM_FAILURE_CODES,
    mapOpenAiHttpToErrorCode: mapOpenAiHttpToErrorCode,
    isLlmFailureError: isLlmFailureError,
  };
});
