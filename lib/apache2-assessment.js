/**
 * Interpretação APACHE II + assessment (status ok|missing).
 * @sync web/lib/vendor/apache2-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuApache2Assessment = api;
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

  var _mod = loadMod(root, "apache2-score.js", "AghuApache2Score");
  var computeApache2 = _mod && _mod.computeApache2;

  function mortalityBand(total) {
    if (total <= 4) return { band: "0-4", estimatedMortality: "~4%" };
    if (total <= 9) return { band: "5-9", estimatedMortality: "~8%" };
    if (total <= 14) return { band: "10-14", estimatedMortality: "~15%" };
    if (total <= 19) return { band: "15-19", estimatedMortality: "~25%" };
    if (total <= 24) return { band: "20-24", estimatedMortality: "~40%" };
    if (total <= 29) return { band: "25-29", estimatedMortality: "~55%" };
    if (total <= 34) return { band: "30-34", estimatedMortality: "~75%" };
    return { band: "≥35", estimatedMortality: "~85%" };
  }

  function interpretApache2(result) {
    var n = result && Number(result.total);
    if (!Number.isFinite(n)) {
      return { label: "APACHE II incompleto", band: null, estimatedMortality: null };
    }
    var mort = mortalityBand(n);
    return {
      label: "APACHE II " + n + " (APS " + result.apsTotal + ")",
      band: mort.band,
      estimatedMortality: mort.estimatedMortality,
    };
  }

  function buildApache2Assessment(opts) {
    opts = opts || {};
    var result = computeApache2(opts);
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
      result: Object.assign({}, result, interpretApache2(result)),
    };
  }

  return {
    interpretApache2: interpretApache2,
    buildApache2Assessment: buildApache2Assessment,
  };
});
