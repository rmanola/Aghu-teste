/**
 * BISAP (Wu 2008) — 5 critérios, 1 ponto cada, decomposição obrigatória.
 * Critério em falta → status missing; nunca soma como zero.
 * @sync web/lib/vendor/bisap-score.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuBisapScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var BISAP_EDITION = "Wu-2008";
  var BUN_CUTOFF_MG_DL = 25;
  var AGE_CUTOFF_YEARS = 60;
  var SEVERE_CUTOFF = 3;

  var INPUT_KEYS = [
    "bunMgDl",
    "impairedMentalStatus",
    "sirs",
    "ageYears",
    "pleuralEffusion",
  ];

  function isMissing(v) {
    return v == null || v === "";
  }

  /**
   * @param {{
   *   bunMgDl?: number,
   *   impairedMentalStatus?: boolean,
   *   sirs?: boolean,
   *   ageYears?: number,
   *   pleuralEffusion?: boolean,
   * }} opts
   */
  function scoreBisap(opts) {
    opts = opts || {};
    var missing = [];
    for (var i = 0; i < INPUT_KEYS.length; i++) {
      if (isMissing(opts[INPUT_KEYS[i]])) missing.push(INPUT_KEYS[i]);
    }
    if (missing.length) {
      return {
        status: "missing",
        missing: missing,
        score: null,
        criteria: null,
        severeRisk: null,
        edition: BISAP_EDITION,
      };
    }

    if (!Number.isFinite(opts.bunMgDl)) {
      throw new Error("bisap: bunMgDl deve ser um número finito (mg/dL)");
    }
    if (!Number.isFinite(opts.ageYears)) {
      throw new Error("bisap: ageYears deve ser um número finito");
    }
    if (typeof opts.impairedMentalStatus !== "boolean") {
      throw new Error("bisap: impairedMentalStatus deve ser boolean");
    }
    if (typeof opts.sirs !== "boolean") {
      throw new Error("bisap: sirs deve ser boolean");
    }
    if (typeof opts.pleuralEffusion !== "boolean") {
      throw new Error("bisap: pleuralEffusion deve ser boolean");
    }

    var criteria = {
      bun: opts.bunMgDl > BUN_CUTOFF_MG_DL ? 1 : 0,
      mentalStatus: opts.impairedMentalStatus ? 1 : 0,
      sirs: opts.sirs ? 1 : 0,
      age: opts.ageYears > AGE_CUTOFF_YEARS ? 1 : 0,
      effusion: opts.pleuralEffusion ? 1 : 0,
    };
    var score =
      criteria.bun +
      criteria.mentalStatus +
      criteria.sirs +
      criteria.age +
      criteria.effusion;

    return {
      status: "ok",
      missing: [],
      score: score,
      criteria: criteria,
      severeRisk: score >= SEVERE_CUTOFF,
      edition: BISAP_EDITION,
    };
  }

  return {
    BISAP_EDITION: BISAP_EDITION,
    BUN_CUTOFF_MG_DL: BUN_CUTOFF_MG_DL,
    AGE_CUTOFF_YEARS: AGE_CUTOFF_YEARS,
    scoreBisap: scoreBisap,
  };
});
