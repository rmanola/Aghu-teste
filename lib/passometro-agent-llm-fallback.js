/**
 * FEAT-071 — fallback local one-click quando o LLM da Edge falha.
 * Pedido claro: lista de prontuários parseável + período inferido (default semanal).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-period-shortcuts.js")
      : root.AghuPassometroPeriodShortcuts,
    typeof require !== "undefined"
      ? require("./passometro-agent-openai-errors.js")
      : root.AghuPassometroAgentOpenaiErrors
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentLlmFallback = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  periodApi,
  openaiErrors
) {
  "use strict";

  var PERIOD_LABELS = {
    hoje: "Hoje",
    ontem: "Ontem",
    semanal: "Semanal",
  };

  /**
   * Infere período por palavras no texto; default semanal.
   * @param {string} text
   * @returns {"hoje"|"ontem"|"semanal"}
   */
  function inferPeriodFromUserText(text) {
    var t = String(text || "").toLowerCase();
    if (/\bhoje\b/.test(t)) return "hoje";
    if (/\bontem\b/.test(t)) return "ontem";
    if (/\bsemanal\b|\bsemana\b|\b7\s*dias\b/.test(t)) return "semanal";
    return "semanal";
  }

  /**
   * Se o texto tiver prontuários válidos, monta skill_call one-click.
   * @param {string} userText
   * @param {{ parseProntuarioList?: Function, normalizeProntuario?: Function }} [deps]
   * @returns {{
   *   ok: true,
   *   periodo: "hoje"|"ontem"|"semanal",
   *   periodoLabel: string,
   *   prontuarios: string[],
   *   count: number,
   *   skillCall: { id: string, name: string, skillId: string, arguments: object },
   *   message: string
   * } | { ok: false, reason: string }}
   */
  function tryBuildLocalOneClickFallback(userText, deps) {
    deps = deps || {};
    var parse =
      deps.parseProntuarioList ||
      (periodApi && periodApi.parseProntuarioList);
    if (typeof parse !== "function") {
      return { ok: false, reason: "parse_unavailable" };
    }
    var parseOpts = {};
    if (typeof deps.normalizeProntuario === "function") {
      parseOpts.normalizeProntuario = deps.normalizeProntuario;
    }
    var parsed = parse(String(userText || ""), parseOpts);
    if (!parsed || !parsed.prontuarios || !parsed.prontuarios.length) {
      return { ok: false, reason: "no_prontuarios" };
    }
    var periodo = inferPeriodFromUserText(userText);
    var periodoLabel = PERIOD_LABELS[periodo] || "Semanal";
    var count = parsed.prontuarios.length;
    var message =
      "Modelo indisponível — a executar Passômetro one-click (" +
      periodoLabel +
      ") com " +
      count +
      " prontuário(s)…";
    return {
      ok: true,
      periodo: periodo,
      periodoLabel: periodoLabel,
      prontuarios: parsed.prontuarios.slice(),
      count: count,
      skillCall: {
        id: "local_fallback_oneclick",
        name: "runPassometroOneClick",
        skillId: "passometro.oneclick",
        arguments: {
          prontuarios: parsed.prontuarios.slice(),
          periodo: periodo,
        },
      },
      message: message,
    };
  }

  function isLlmFailureError(code) {
    if (openaiErrors && typeof openaiErrors.isLlmFailureError === "function") {
      return openaiErrors.isLlmFailureError(code);
    }
    return false;
  }

  return {
    PERIOD_LABELS: PERIOD_LABELS,
    inferPeriodFromUserText: inferPeriodFromUserText,
    tryBuildLocalOneClickFallback: tryBuildLocalOneClickFallback,
    isLlmFailureError: isLlmFailureError,
  };
});
