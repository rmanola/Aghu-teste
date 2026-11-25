/**
 * Ported from web/lib/patient-records/corrected-sodium.mjs
 * @sync web/lib/patient-records/corrected-sodium.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCorrectedSodium = api;
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


/**
 * Sódio corrigido na hiperglicemia (Hillier): Na + 0,016 × (Gli - 100).
 * Na em mEq/L; glicemia em mg/dL.
 */
function computeCorrectedSodium(opts) {
  const na = opts.sodiumMEqL;
  const gli = opts.glucoseMgDl;

  if (!Number.isFinite(na) || na <= 0 || !Number.isFinite(gli) || gli < 0) {
    throw new Error("invalid_corrected_sodium_inputs");
  }

  const corrected = na + 0.016 * (gli - 100);
  return {
    correctedSodiumMEqL: Math.round(corrected * 10) / 10,
    measuredSodiumMEqL: na,
    glucoseMgDl: gli,
  };
}


  return {
    computeCorrectedSodium: computeCorrectedSodium,
  };
});
