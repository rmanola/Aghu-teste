/**
 * FEAT-076 — ACE trilho A Research: tips sintéticos (sem PHI).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistantPlaybook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TIPS = Object.freeze([
    {
      id: "clarify_grain_population",
      when: "e1_or_judge_align",
      tip: "Se E1/judge pedem grain ou população, faça 1–3 perguntas curtas de clarificação antes de novo draft.",
    },
    {
      id: "screening_vs_ie",
      when: "screening_ie_cross",
      tip: "Paths AGHU (aghu.*) só em screening*; campos de formulário só em inclusion/exclusion formal.",
    },
    {
      id: "judge_needs_user",
      when: "judge_needs_user",
      tip: "Critiques align_request/completeness com lacunas de desenho → clarify, não repair cego.",
    },
    {
      id: "never_phi_in_prompt",
      when: "safety",
      tip: "Nunca inclua prontuário, nome ou laudo no chat do assistente — só metadados de estudo.",
    },
  ]);

  var ALLOWLISTED_TIP_IDS = Object.freeze(
    TIPS.map(function (t) {
      return t.id;
    }),
  );

  function listTips() {
    return TIPS.slice();
  }

  function isTipAllowlisted(tipId) {
    return ALLOWLISTED_TIP_IDS.indexOf(String(tipId || "")) !== -1;
  }

  /**
   * @param {Array<{ errorCode?: string }>} events
   */
  function tipsForReflect(events) {
    var list = Array.isArray(events) ? events : [];
    var out = [];
    var seen = {};
    function push(tip) {
      if (!tip || seen[tip.id]) return;
      seen[tip.id] = true;
      out.push(tip);
    }
    for (var i = 0; i < list.length; i++) {
      var code = String(
        (list[i] && (list[i].errorCode || list[i].error_code)) || "",
      );
      if (code === "escalate_validation" || code === "e1_validation_failed") {
        push(TIPS[0]);
        push(TIPS[1]);
      }
      if (code === "judge_failed" || code === "plan_incomplete") {
        push(TIPS[2]);
      }
    }
    if (!out.length) push(TIPS[3]);
    return out;
  }

  return {
    TIPS: TIPS,
    ALLOWLISTED_TIP_IDS: ALLOWLISTED_TIP_IDS,
    listTips: listTips,
    isTipAllowlisted: isTipAllowlisted,
    tipsForReflect: tipsForReflect,
  };
});
