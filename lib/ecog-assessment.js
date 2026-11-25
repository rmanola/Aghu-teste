/**
 * Interpretação ECOG + assessment (status ok|missing).
 * @sync web/lib/vendor/ecog-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuEcogAssessment = api;
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

  var _mod = loadMod(root, "ecog-status.js", "AghuEcogStatus");
  var assignEcog = _mod && _mod.assignEcog;

  function interpretEcog(score) {
    var r = assignEcog({ score: score });
    return {
      score: r.score,
      label: r.label,
      ambulatory: r.ambulatory,
      edition: r.edition,
    };
  }

  function buildEcogAssessment(opts) {
    opts = opts || {};
    if (opts.score == null || opts.score === "") {
      return { status: "missing", missing: ["score"], suggested: {}, result: null };
    }
    var result = assignEcog({ score: opts.score });
    return { status: "ok", missing: [], suggested: { score: result.score }, result: result };
  }

  return {
    interpretEcog: interpretEcog,
    buildEcogAssessment: buildEcogAssessment,
  };
});
