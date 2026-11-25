/**
 * Ported from web/lib/patient-records/cockcroft-gault.mjs
 * @sync web/lib/patient-records/cockcroft-gault.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCockcroftGault = api;
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
 * Clearance de creatinina (Cockcroft-Gault) — mL/min.
 */
function computeCockcroftGault(opts) {
  const age = opts.ageYears;
  const weightKg = opts.weightKg;
  const cr = opts.creatinineMgDl;
  const sex = opts.sex;

  if (
    !Number.isFinite(age) ||
    age <= 0 ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isFinite(cr) ||
    cr <= 0 ||
    (sex !== "M" && sex !== "F")
  ) {
    throw new Error("invalid_cockcroft_inputs");
  }

  let crCl = ((140 - age) * weightKg) / (72 * cr);
  if (sex === "F") crCl *= 0.85;

  return {
    creatinineClearanceMlMin: Math.round(crCl),
    ageYears: age,
    weightKg,
    creatinineMgDl: cr,
    sex,
  };
}


  return {
    computeCockcroftGault: computeCockcroftGault,
  };
});
