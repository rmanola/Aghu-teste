/**
 * Interpretação NIHSS + assessment (status ok|missing).
 * @sync web/lib/vendor/nihss-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuNihssAssessment = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod = loadMod(root, "nihss-score.js", "AghuNihssScore");
  var computeNihss = _mod && _mod.computeNihss;
  var severityFromTotal = _mod && _mod.severityFromTotal;

  var SEVERITY_LABELS = {
    no_stroke_symptoms: "Sem sintomas de AVC",
    minor: "Menor (1–4)",
    moderate: "Moderado (5–15)",
    moderate_severe: "Moderado-grave (16–20)",
    severe: "Grave (21–42)",
  };

  function interpretNihss(totalOrResult) {
    var n =
      totalOrResult && typeof totalOrResult === "object"
        ? Number(totalOrResult.total)
        : Number(totalOrResult);
    if (!Number.isFinite(n)) {
      return { label: "NIHSS incompleto", severity: null };
    }
    var severity = severityFromTotal(n);
    return {
      severity: severity,
      label: "NIHSS " + n + " — " + (SEVERITY_LABELS[severity] || severity),
    };
  }

  function buildNihssAssessment(opts) {
    opts = opts || {};
    var result = computeNihss(opts);
    if (result.status === "missing") {
      return {
        status: "missing",
        missing: result.missing,
        suggested: {},
        result: { total: null, edition: result.edition },
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretNihss(result)),
    };
  }

  return {
    interpretNihss: interpretNihss,
    buildNihssAssessment: buildNihssAssessment,
  };
});
