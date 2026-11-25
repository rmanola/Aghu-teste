/**
 * Ported from web/lib/patient-records/fena.mjs
 * @sync web/lib/patient-records/fena.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuFena = api;
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
 * Fração de excreção de sódio (%) = (Na_u × Cr_s) / (Na_s × Cr_u) × 100.
 * Na em mEq/L; creatininas em mg/dL.
 */
function computeFena(opts) {
  const naSerum = opts.sodiumSerumMEqL;
  const naUrine = opts.sodiumUrineMEqL;
  const crSerum = opts.creatinineSerumMgDl;
  const crUrine = opts.creatinineUrineMgDl;

  if (
    ![naSerum, naUrine, crSerum, crUrine].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  ) {
    throw new Error("invalid_fena_inputs");
  }

  const fena = ((naUrine * crSerum) / (naSerum * crUrine)) * 100;

  return {
    fenaPct: Math.round(fena * 100) / 100,
    interpretation:
      fena < 1
        ? "Pré-renal provável (<1%)"
        : fena > 2
          ? "Lesão renal intrínseca provável (>2%)"
          : "Zona indeterminada (1–2%)",
  };
}


  return {
    computeFena: computeFena,
  };
});
