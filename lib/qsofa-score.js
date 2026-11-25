/**
 * Ported from web/lib/patient-records/qsofa-score.mjs
 * @sync web/lib/patient-records/qsofa-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuQsofaScore = api;
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


function computeQsofa(opts) {
  const rr = opts.respiratoryRate;
  const pas = opts.systolicBp;
  const alteredMentation = !!opts.alteredMentation;

  if (!Number.isFinite(rr) || !Number.isFinite(pas)) {
    throw new Error("invalid_qsofa_inputs");
  }

  const points = {
    respiratoryRate: rr >= 22 ? 1 : 0,
    systolicBp: pas <= 100 ? 1 : 0,
    alteredMentation: alteredMentation ? 1 : 0,
  };

  const total = points.respiratoryRate + points.systolicBp + points.alteredMentation;

  return {
    total,
    points,
    highRisk: total >= 2,
  };
}


  return {
    computeQsofa: computeQsofa,
  };
});
