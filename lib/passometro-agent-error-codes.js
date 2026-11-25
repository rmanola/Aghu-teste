/**
 * FEAT-071 — taxonomia de errorCode (nav/extract) sem PHI.
 * Espelha falhas estáveis do casca-nav / domain-extract / orch.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentErrorCodes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @type {ReadonlyArray<string>} */
  var ERROR_CODES = Object.freeze([
    "ajax_idle_timeout",
    "suggestion_missing",
    "list_missing",
    "patient_mismatch",
    "dead_object",
    "liberados_stale",
    "clear_failed",
    "nav_timeout",
    "extract_failed",
    "empty_ok",
    "invalid_args",
    "unknown_skill",
    "forbidden_tool",
    "gate_paciente",
    "tab_missing",
    "batch_aborted",
    "nav_required",
    "nav_already_ready",
    "nav_retry_exceeded",
    "max_rounds_exceeded",
    "token_budget_exceeded",
  ]);

  /** @type {ReadonlyArray<string>} */
  var PHASES = Object.freeze([
    "nav",
    "clear",
    "suggest",
    "pesquisar",
    "extract",
    "gate_paciente",
    "liberados_fp",
    "autofill",
    "close_tabs",
  ]);

  /** @type {ReadonlyArray<string>} */
  var DOMAINS = Object.freeze([
    "exames",
    "cirurgias",
    "controles",
    "prescricoes",
    "composite",
  ]);

  function isKnownErrorCode(code) {
    return ERROR_CODES.indexOf(String(code || "")) !== -1;
  }

  function isKnownPhase(phase) {
    return PHASES.indexOf(String(phase || "")) !== -1;
  }

  function isKnownDomain(domain) {
    return DOMAINS.indexOf(String(domain || "")) !== -1;
  }

  /**
   * Mapeia mensagem de erro livre (sem PHI) → errorCode estável.
   * @param {string} message
   * @returns {string}
   */
  function classifyErrorMessage(message) {
    var m = String(message || "").toLowerCase();
    if (!m) return "extract_failed";
    if (/carregando|processando|ajax|idle/.test(m)) return "ajax_idle_timeout";
    if (/suggestion|sugest/.test(m)) return "suggestion_missing";
    if (/lista|list_missing|consultar/.test(m)) return "list_missing";
    if (/mismatch|≠|diferente|paciente no aghu/.test(m)) {
      return "patient_mismatch";
    }
    if (/dead object|dead_object/.test(m)) return "dead_object";
    if (/liberados|fingerprint|stale/.test(m)) return "liberados_stale";
    if (/limpar|clear/.test(m)) return "clear_failed";
    if (/timeout|tempo/.test(m)) return "nav_timeout";
    if (/gate|prontu/.test(m) && /lote|mismatch/.test(m)) {
      return "gate_paciente";
    }
    if (/aba|tab/.test(m) && /encontr|ausente|missing/.test(m)) {
      return "tab_missing";
    }
    if (/interromp|parar|abort|cancelad/.test(m)) return "batch_aborted";
    return "extract_failed";
  }

  /**
   * Evento de obs sem PHI (PA-AC-15).
   * @param {object} partial
   * @returns {{ ok: boolean, skillId?: string, domain?: string, phase?: string, errorCode?: string, empty?: boolean, ms?: number } | { ok: false, error: string }}
   */
  function buildRunEvent(partial) {
    partial = partial || {};
    var skillId = partial.skillId != null ? String(partial.skillId) : "";
    var domain = partial.domain != null ? String(partial.domain) : "";
    var phase = partial.phase != null ? String(partial.phase) : "";
    var errorCode =
      partial.errorCode != null ? String(partial.errorCode) : "";

    if (domain && !isKnownDomain(domain)) {
      return { ok: false, error: "domain inválido." };
    }
    if (phase && !isKnownPhase(phase)) {
      return { ok: false, error: "phase inválida." };
    }
    if (errorCode && !isKnownErrorCode(errorCode)) {
      return { ok: false, error: "errorCode desconhecido." };
    }

    var evt = {
      ok: partial.ok !== false,
      skillId: skillId || undefined,
      domain: domain || undefined,
      phase: phase || undefined,
      errorCode: errorCode || undefined,
      empty: Boolean(partial.empty),
    };
    if (typeof partial.ms === "number" && isFinite(partial.ms)) {
      evt.ms = Math.max(0, Math.round(partial.ms));
    }
    return evt;
  }

  return {
    ERROR_CODES: ERROR_CODES,
    PHASES: PHASES,
    DOMAINS: DOMAINS,
    isKnownErrorCode: isKnownErrorCode,
    isKnownPhase: isKnownPhase,
    isKnownDomain: isKnownDomain,
    classifyErrorMessage: classifyErrorMessage,
    buildRunEvent: buildRunEvent,
  };
});
