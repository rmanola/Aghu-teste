/**
 * FEAT-071/089 — preview HITL por round (propose→commit) sem PHI.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentHitlPreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SKILL_LABELS = Object.freeze({
    "passometro.nav.pol": "Abrir POL",
    "passometro.nav.controles": "Abrir Controles",
    "passometro.nav.prescricoes": "Abrir Prescrições",
    "passometro.oneclick": "Passômetro completo",
    "passometro.exames": "Exames",
    "passometro.cirurgias": "Cirurgias",
    "passometro.controles": "Controles",
    "passometro.prescricoes": "Prescrições",
  });

  var TOOL_TO_SKILL = Object.freeze({
    openPol: "passometro.nav.pol",
    openControles: "passometro.nav.controles",
    openPrescricoes: "passometro.nav.prescricoes",
    runPassometroOneClick: "passometro.oneclick",
    extractExames: "passometro.exames",
    extractCirurgias: "passometro.cirurgias",
    extractControles: "passometro.controles",
    extractPrescricoes: "passometro.prescricoes",
  });

  var PERIOD_LABELS = Object.freeze({
    hoje: "Hoje",
    ontem: "Ontem",
    semanal: "Semanal",
  });

  function last4Digits(prontuario) {
    var d = String(prontuario == null ? "" : prontuario).replace(/\D/g, "");
    if (!d) return "";
    return d.length <= 4 ? d : d.slice(-4);
  }

  function resolveSkillId(call) {
    call = call || {};
    if (call.skillId) return String(call.skillId);
    var tool = call.name || call.toolName || "";
    return TOOL_TO_SKILL[tool] || tool || "skill";
  }

  function skillLabel(skillId) {
    return SKILL_LABELS[skillId] || skillId;
  }

  function periodLabel(periodo) {
    var p = String(periodo || "").toLowerCase();
    return PERIOD_LABELS[p] || (periodo ? String(periodo) : "—");
  }

  function formatSkillCallPreview(call) {
    call = call || {};
    var args = call.arguments != null ? call.arguments : call.args || {};
    var skillId = resolveSkillId(call);
    var periodo = args.periodo != null ? String(args.periodo) : "";
    var prontuarios = Array.isArray(args.prontuarios) ? args.prontuarios : [];
    var last4Keys = [];
    for (var i = 0; i < prontuarios.length; i++) {
      var k = last4Digits(prontuarios[i]);
      if (k) last4Keys.push(k);
    }
    var count = prontuarios.length;
    var label = skillLabel(skillId);
    var per = periodLabel(periodo);
    var line =
      label +
      " · " +
      per +
      " · " +
      count +
      " prontuário" +
      (count === 1 ? "" : "s");
    if (last4Keys.length && last4Keys.length <= 5) {
      line += " (…" + last4Keys.join(", …") + ")";
    }
    return {
      skillId: skillId,
      skillLabel: label,
      periodo: periodo,
      periodoLabel: per,
      count: count,
      last4Keys: last4Keys,
      line: line,
    };
  }

  function formatSkillCallsPreview(calls) {
    var list = Array.isArray(calls) ? calls : [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      items.push(formatSkillCallPreview(list[i]));
    }
    var lines = items.map(function (it) {
      return "• " + it.line;
    });
    var summary = lines.join("\n");
    var headline =
      items.length === 1
        ? "Confirmar no AGHU: " + items[0].line
        : "Confirmar " + items.length + " skill(s) no AGHU";
    return {
      items: items,
      summary: summary,
      headline: headline,
      confirmPrompt:
        headline +
        (summary ? "\n" + summary : "") +
        "\nConfirmar para executar · Cancelar para descartar.",
    };
  }

  /**
   * Preview HITL com número do round (FEAT-089).
   * @param {Array} calls
   * @param {number} [round]
   */
  function formatRoundPreview(calls, round) {
    var base = formatSkillCallsPreview(calls);
    var roundNum = Number(round) || 1;
    base.headline = "Round " + roundNum + " — " + base.headline;
    base.confirmPrompt =
      base.headline +
      (base.summary ? "\n" + base.summary : "") +
      "\nConfirmar para executar · Cancelar aborta o loop.";
    return base;
  }

  return {
    SKILL_LABELS: SKILL_LABELS,
    PERIOD_LABELS: PERIOD_LABELS,
    last4Digits: last4Digits,
    skillLabel: skillLabel,
    periodLabel: periodLabel,
    formatSkillCallPreview: formatSkillCallPreview,
    formatSkillCallsPreview: formatSkillCallsPreview,
    formatRoundPreview: formatRoundPreview,
  };
});
