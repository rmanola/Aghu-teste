/**
 * Interpretação SOFA + assessment (status ok|missing).
 * @sync web/lib/vendor/sofa-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuSofaAssessment = api;
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

  var _mod = loadMod(root, "sofa-score.js", "AghuSofaScore");
  var computeSofa = _mod && _mod.computeSofa;

  function interpretSofa(result) {
    var n = result && Number(result.total);
    if (!Number.isFinite(n)) {
      return { label: "SOFA incompleto", band: null };
    }
    var band =
      n >= 15 ? "muito_alto" : n >= 10 ? "alto" : n >= 6 ? "moderado" : "baixo";
    return {
      label: "SOFA " + n + " / 24",
      band: band,
    };
  }

  function buildSofaAssessment(opts) {
    opts = opts || {};
    var result = computeSofa(opts);
    if (result.status === "missing") {
      return {
        status: "missing",
        missing: result.missing,
        suggested: {},
        result: { total: null, definition: result.definition },
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretSofa(result)),
    };
  }

  return {
    interpretSofa: interpretSofa,
    buildSofaAssessment: buildSofaAssessment,
  };
});
