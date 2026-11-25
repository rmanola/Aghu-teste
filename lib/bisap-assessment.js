/**
 * Interpretação BISAP + assessment (critérios em falta nomeados).
 * @sync web/lib/vendor/bisap-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuBisapAssessment = api;
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

  var _mod = loadMod(root, "bisap-score.js", "AghuBisapScore");
  var scoreBisap = _mod && _mod.scoreBisap;

  function interpretBisap(score) {
    var n = Number(score);
    if (!Number.isFinite(n)) {
      return { label: "BISAP incompleto", severeRisk: null };
    }
    return {
      label: n >= 3 ? "BISAP ≥3 — risco elevado de mortalidade" : "BISAP 0–2 — risco mais baixo",
      severeRisk: n >= 3,
    };
  }

  function buildBisapAssessment(opts) {
    opts = opts || {};
    var result = scoreBisap(opts);
    if (result.status === "missing") {
      return {
        status: "missing",
        missing: result.missing,
        suggested: {},
        result: { score: null, edition: result.edition },
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretBisap(result.score)),
    };
  }

  return {
    interpretBisap: interpretBisap,
    buildBisapAssessment: buildBisapAssessment,
  };
});
