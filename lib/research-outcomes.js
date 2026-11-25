/**
 * Desfechos agregados para coorte Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchOutcomes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var eligApi = null;
  var hpbOutcomesApi = null;

  try {
    if (typeof require === "function") {
      eligApi = require("./research-protocol-eligibility.js");
      hpbOutcomesApi = require("./hpb-outcomes.js");
    }
  } catch (_e) {}

  function buildRate(numerator, denominator) {
    if (hpbOutcomesApi && hpbOutcomesApi.buildRate) {
      return hpbOutcomesApi.buildRate(numerator, denominator);
    }
    return {
      rate: denominator ? numerator / denominator : 0,
      numerator: numerator,
      denominator: denominator,
      format: "percent",
    };
  }

  function aggregatePrimaryOutcome(patients, protocol, opts) {
    opts = opts || {};
    if (!protocol || !protocol.primaryOutcome || !eligApi) {
      return {
        primary: buildRate(0, 0),
        label: "Desfecho primário",
        grain: opts.grain || "patient",
        denominatorLabel: "por paciente",
      };
    }
    var summary = eligApi.summarizeCohortEligibility(patients, protocol, opts);
    return {
      primary: buildRate(summary.primaryOutcomeFilled, summary.eligiblePatients),
      label: protocol.primaryOutcome.label || protocol.primaryOutcome.field,
      grain: summary.grain || opts.grain || "patient",
      denominatorLabel: summary.denominatorLabel || "por paciente",
    };
  }

  function aggregateOutcomeFields(patients, protocol, opts) {
    var out = [];
    if (!protocol || !Array.isArray(patients)) return out;
    var primary = aggregatePrimaryOutcome(patients, protocol, opts);
    out.push(primary);
    return out;
  }

  return {
    buildRate: buildRate,
    aggregatePrimaryOutcome: aggregatePrimaryOutcome,
    aggregateOutcomeFields: aggregateOutcomeFields,
  };
});
