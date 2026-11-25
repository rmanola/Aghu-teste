/**
 * Ported from web/lib/patient-records/free-water-deficit.mjs
 * @sync web/lib/patient-records/free-water-deficit.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuFreeWaterDeficit = api;
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

  var _mod_CkdEpiEgfr = loadMod(root, "ckd-epi-egfr.js", "AghuCkdEpiEgfr");
  var normalizeSex = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeSex;


function round1(n) {
  return Math.round(n * 10) / 10;
}

function tbwFactorForSex(sex) {
  const s = normalizeSex(sex);
  if (s === "F") return 0.5;
  return 0.6;
}

/**
 * Déficit de água livre (L) para hipernatremia.
 * FWD = TBW × (Na/140 − 1); TBW = peso × fator (0,6 M / 0,5 F).
 */
function computeFreeWaterDeficit(opts) {
  const na = opts.sodiumMEqL;
  const weightKg = opts.weightKg;
  const sex = opts.sex;

  if (!Number.isFinite(na) || na <= 0) {
    throw new Error("invalid_sodium");
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error("invalid_weight");
  }

  const tbwFactor = tbwFactorForSex(sex);
  const tbwL = weightKg * tbwFactor;
  const fwdL = tbwL * (na / 140 - 1);

  return {
    sodiumMEqL: na,
    weightKg,
    sex: normalizeSex(sex) || sex,
    tbwFactor,
    tbwL: round1(tbwL),
    freeWaterDeficitL: round1(Math.max(0, fwdL)),
    hypernatremia: na > 140,
  };
}


  return {
    tbwFactorForSex: tbwFactorForSex,
    computeFreeWaterDeficit: computeFreeWaterDeficit,
  };
});
