/**
 * FEAT-150 — Baseline interna de custo esperado (linha × banda Charlson).
 * Janela deslizante de períodos fechados; nunca literatura externa.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCostBaseline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_MIN_PERIODS = 6;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function periodCost(period) {
    if (!period || typeof period !== "object") return null;
    var n = num(period.meanCostPerCase);
    if (n == null) n = num(period.expectedCostPerCase);
    if (n == null) n = num(period.costPerCase);
    if (n == null || n < 0) return null;
    return n;
  }

  /**
   * Média histórica por linha × banda Charlson sobre períodos fechados.
   * Não usa o período corrente nem referência de literatura.
   */
  function computeExpectedCostBaseline(input) {
    var opts = input && typeof input === "object" ? input : {};
    var careLineId = str(opts.careLineId);
    var charlsonBand = str(opts.charlsonBand);
    var minPeriods =
      opts.minPeriods == null ? DEFAULT_MIN_PERIODS : Number(opts.minPeriods);
    if (!Number.isFinite(minPeriods) || minPeriods < 1) minPeriods = DEFAULT_MIN_PERIODS;

    var used = [];
    var periods = asArray(opts.trailingPeriods);
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (!p || typeof p !== "object") continue;
      if (careLineId && str(p.careLineId) && str(p.careLineId) !== careLineId) {
        continue;
      }
      if (charlsonBand && str(p.charlsonBand) && str(p.charlsonBand) !== charlsonBand) {
        continue;
      }
      var cost = periodCost(p);
      if (cost == null) continue;
      used.push(cost);
    }

    if (used.length < minPeriods) {
      return {
        expectedCostPerCase: null,
        periodsUsed: used.length,
        insufficient: true,
      };
    }

    var sum = 0;
    for (var u = 0; u < used.length; u++) sum += used[u];
    return {
      expectedCostPerCase: sum / used.length,
      periodsUsed: used.length,
      insufficient: false,
    };
  }

  function oeSuppressed(oe) {
    return !oe || oe.suppressed === true || oe.ratio == null;
  }

  /**
   * valueRatio = (1 / outcomeOE) / costOE.
   * Qualquer lado suppressed ou baseline insuficiente → ratio inteiro suppressed.
   */
  function computeValueRatio(input) {
    var opts = input && typeof input === "object" ? input : {};
    var baseline = opts.costBaseline;
    if (baseline && baseline.insufficient) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: "cost_baseline_insufficient",
        riskAdjustedOutcome: null,
        riskAdjustedCost: null,
      };
    }
    var outcomeOE = opts.outcomeOE;
    if (oeSuppressed(outcomeOE)) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: (outcomeOE && outcomeOE.reason) || "outcome_oe_suppressed",
        riskAdjustedOutcome: null,
        riskAdjustedCost: null,
      };
    }
    var costOE = opts.costOE;
    if (oeSuppressed(costOE)) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: (costOE && costOE.reason) || "cost_oe_suppressed",
        riskAdjustedOutcome: null,
        riskAdjustedCost: null,
      };
    }
    var outcomeRatio = Number(outcomeOE.ratio);
    var costRatio = Number(costOE.ratio);
    if (!Number.isFinite(outcomeRatio) || outcomeRatio <= 0) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: "zero_expected",
        riskAdjustedOutcome: null,
        riskAdjustedCost: null,
      };
    }
    if (!Number.isFinite(costRatio) || costRatio <= 0) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: "zero_expected",
        riskAdjustedOutcome: null,
        riskAdjustedCost: null,
      };
    }
    var riskAdjustedOutcome = 1 / outcomeRatio;
    var riskAdjustedCost = costRatio;
    var valueRatio = riskAdjustedOutcome / riskAdjustedCost;
    if (!Number.isFinite(valueRatio)) {
      return {
        valueRatio: null,
        suppressed: true,
        reason: "zero_expected",
        riskAdjustedOutcome: riskAdjustedOutcome,
        riskAdjustedCost: riskAdjustedCost,
      };
    }
    return {
      valueRatio: valueRatio,
      suppressed: false,
      reason: null,
      riskAdjustedOutcome: riskAdjustedOutcome,
      riskAdjustedCost: riskAdjustedCost,
    };
  }

  return {
    DEFAULT_MIN_PERIODS: DEFAULT_MIN_PERIODS,
    computeExpectedCostBaseline: computeExpectedCostBaseline,
    computeValueRatio: computeValueRatio,
  };
});
