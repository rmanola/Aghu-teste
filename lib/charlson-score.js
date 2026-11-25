/**
 * Charlson Comorbidity Index (Quan ICD-10 weights).
 * @sync web/lib/patient-records/charlson-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCharlsonScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var CHARLSON_WEIGHTS = {
    myocardial_infarction: 1,
    congestive_heart_failure: 1,
    peripheral_vascular_disease: 1,
    cerebrovascular_disease: 1,
    dementia: 1,
    chronic_pulmonary_disease: 1,
    rheumatologic_disease: 1,
    peptic_ulcer_disease: 1,
    liver_mild: 1,
    diabetes_uncomplicated: 1,
    diabetes_complicated: 2,
    hemiplegia_paraplegia: 2,
    chronic_kidney_disease: 2,
    malignancy: 2,
    liver_severe: 3,
    metastatic_solid_tumor: 6,
    aids_hiv: 6,
  };

  var CHARLSON_CONDITION_KEYS = Object.keys(CHARLSON_WEIGHTS);

  var EXCLUSIVE_PAIRS = [
    ["diabetes_complicated", "diabetes_uncomplicated"],
    ["liver_severe", "liver_mild"],
    ["metastatic_solid_tumor", "malignancy"],
  ];

  function charlsonBand(total) {
    if (total <= 0) return "0";
    if (total <= 2) return "1-2";
    if (total <= 4) return "3-4";
    return ">=5";
  }

  /**
   * @param {{ conditions?: string[] }} opts
   * @returns {{ total: number, band: string, points: Record<string, number> }}
   */
  function computeCharlson(opts) {
    opts = opts || {};
    var raw = opts.conditions;
    if (raw != null && !Array.isArray(raw)) {
      throw new Error("invalid_charlson_inputs");
    }
    var list = raw || [];
    var present = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var key = list[i];
      if (typeof key !== "string" || !(key in CHARLSON_WEIGHTS)) {
        throw new Error("invalid_charlson_inputs");
      }
      present[key] = true;
    }

    for (var p = 0; p < EXCLUSIVE_PAIRS.length; p++) {
      var higher = EXCLUSIVE_PAIRS[p][0];
      var lower = EXCLUSIVE_PAIRS[p][1];
      if (present[higher] && present[lower]) {
        delete present[lower];
      }
    }

    var points = {};
    var total = 0;
    for (var k in present) {
      if (!Object.prototype.hasOwnProperty.call(present, k)) continue;
      var w = CHARLSON_WEIGHTS[k];
      points[k] = w;
      total += w;
    }

    return {
      total: total,
      band: charlsonBand(total),
      points: points,
    };
  }

  return {
    CHARLSON_WEIGHTS: CHARLSON_WEIGHTS,
    CHARLSON_CONDITION_KEYS: CHARLSON_CONDITION_KEYS,
    charlsonBand: charlsonBand,
    computeCharlson: computeCharlson,
  };
});
