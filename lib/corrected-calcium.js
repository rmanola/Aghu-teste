/**
 * Ported from web/lib/patient-records/corrected-calcium.mjs
 * @sync web/lib/patient-records/corrected-calcium.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCorrectedCalcium = api;
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


const NORMAL_ALBUMIN_G_DL = 4;

/**
 * Cálcio corrigido pela albumina (Payne) — Ca e Alb em mg/dL e g/dL.
 */
function computeCorrectedCalcium(opts) {
  const ca = opts.calciumMgDl;
  const alb = opts.albuminGDl;

  if (!Number.isFinite(ca) || ca <= 0 || !Number.isFinite(alb) || alb <= 0) {
    throw new Error("invalid_calcium_albumin");
  }

  const corrected =
    ca + 0.8 * (NORMAL_ALBUMIN_G_DL - alb);

  return {
    correctedCalciumMgDl: Math.round(corrected * 100) / 100,
    measuredCalciumMgDl: ca,
    albuminGDl: alb,
  };
}


  return {
    computeCorrectedCalcium: computeCorrectedCalcium,
  };
});
