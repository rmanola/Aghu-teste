/**
 * Ported from web/lib/patient-records/anion-gap.mjs
 * @sync web/lib/patient-records/anion-gap.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAnionGap = api;
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
 * Anion gap clássico: Na - Cl - HCO3 (mEq/L).
 */
function computeAnionGap(opts) {
  const na = opts.sodiumMEqL;
  const cl = opts.chlorideMEqL;
  const hco3 = opts.bicarbonateMEqL;

  if (![na, cl, hco3].every((v) => Number.isFinite(v))) {
    throw new Error("invalid_anion_gap_inputs");
  }

  const gap = na - cl - hco3;
  return {
    anionGapMEqL: Math.round(gap * 10) / 10,
    sodiumMEqL: na,
    chlorideMEqL: cl,
    bicarbonateMEqL: hco3,
  };
}


  return {
    computeAnionGap: computeAnionGap,
  };
});
