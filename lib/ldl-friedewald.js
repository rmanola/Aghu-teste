/**
 * Ported from web/lib/patient-records/ldl-friedewald.mjs
 * @sync web/lib/patient-records/ldl-friedewald.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuLdlFriedewald = api;
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


const FRIEDEWALD_TG_MAX_MG_DL = 400;

/**
 * LDL estimado (Friedewald) — CT, HDL, TG em mg/dL.
 * Válido quando TG < 400 mg/dL.
 */
function computeLdlFriedewald(opts) {
  const ct = opts.totalCholesterolMgDl;
  const hdl = opts.hdlMgDl;
  const tg = opts.triglyceridesMgDl;

  if (![ct, hdl, tg].every((v) => Number.isFinite(v) && v >= 0)) {
    throw new Error("invalid_lipids");
  }
  if (tg >= FRIEDEWALD_TG_MAX_MG_DL) {
    return {
      kind: "tg_too_high",
      ldlMgDl: null,
      tgMgDl: tg,
    };
  }

  const ldl = ct - hdl - tg / 5;
  return {
    kind: "ok",
    ldlMgDl: Math.round(ldl * 10) / 10,
    tgMgDl: tg,
  };
}


  return {
    FRIEDEWALD_TG_MAX_MG_DL: FRIEDEWALD_TG_MAX_MG_DL,
    computeLdlFriedewald: computeLdlFriedewald,
  };
});
