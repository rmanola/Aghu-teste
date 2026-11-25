/**
 * Interpretação Charlson + assessment para popup (checkboxes).
 * @sync web/lib/patient-records/charlson-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCharlsonAssessment = api;
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

  var _mod = loadMod(root, "charlson-score.js", "AghuCharlsonScore");
  var computeCharlson = _mod && _mod.computeCharlson;
  var CHARLSON_CONDITION_KEYS = _mod && _mod.CHARLSON_CONDITION_KEYS;
  var charlsonBand = _mod && _mod.charlsonBand;

  var BAND_LABELS = {
    "0": "Sem comorbidades pontuadas",
    "1-2": "Comorbidade baixa",
    "3-4": "Comorbidade moderada",
    ">=5": "Comorbidade elevada",
  };

  function interpretCharlson(total) {
    var band = charlsonBand(total);
    return {
      band: band,
      label: BAND_LABELS[band] || band,
      highRisk: total >= 5,
    };
  }

  /**
   * @param {Record<string, boolean>|{ conditions?: string[] }} opts
   */
  function buildCharlsonAssessment(opts) {
    opts = opts || {};
    var conditions = opts.conditions;
    if (!Array.isArray(conditions)) {
      conditions = [];
      var keys = CHARLSON_CONDITION_KEYS || [];
      for (var i = 0; i < keys.length; i++) {
        if (opts[keys[i]]) conditions.push(keys[i]);
      }
    }
    var result = computeCharlson({ conditions: conditions });
    var interp = interpretCharlson(result.total);
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interp),
    };
  }

  return {
    interpretCharlson: interpretCharlson,
    buildCharlsonAssessment: buildCharlsonAssessment,
  };
});
