/**
 * Ported from web/lib/patient-records/curb65-score.mjs
 * @sync web/lib/patient-records/curb65-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCurb65Score = api;
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
  var parseIdadeAnos = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.parseIdadeAnos;
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;


function normalizeUreaForCurb(value, unit) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("invalid_urea");
  }
  const u = String(unit || "mg/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u)) {
    return { mgDl: value * 6, mmolL: value };
  }
  return { mgDl: value, mmolL: value / 6 };
}

function isUreaElevatedForCurb(ureaMgDl, ureaMmolL) {
  return ureaMmolL > 7 || ureaMgDl >= 50;
}

function computeCurb65(opts) {
  const confusion = !!opts.confusion;
  const ureaElevated = !!opts.ureaElevated;
  const rr = opts.respiratoryRate;
  const pas = opts.systolicBp;
  const ageYears = opts.ageYears;

  if (!Number.isFinite(rr) || !Number.isFinite(pas) || !Number.isFinite(ageYears)) {
    throw new Error("invalid_curb65_inputs");
  }

  const points = {
    confusion: confusion ? 1 : 0,
    urea: ureaElevated ? 1 : 0,
    respiratoryRate: rr >= 30 ? 1 : 0,
    bloodPressure: pas < 90 ? 1 : 0,
    age: ageYears >= 65 ? 1 : 0,
  };

  const total = Object.values(points).reduce((a, b) => a + b, 0);

  let mortality = "baixa";
  if (total >= 4) mortality = "alta (~27%)";
  else if (total === 3) mortality = "moderada (~15%)";
  else if (total === 2) mortality = "intermediária (~9%)";

  return { total, points, mortality };
}

function parseCurbAge(passometroHeader, ageOpts) {
  return resolveAgeYears({
    passometroHeader,
    pii: ageOpts?.pii,
    referenceDateISO: ageOpts?.((referenceDateISO) != null && (referenceDateISO) !== undefined ? (referenceDateISO) : (null)),
  });
}


  return {
    normalizeUreaForCurb: normalizeUreaForCurb,
    isUreaElevatedForCurb: isUreaElevatedForCurb,
    computeCurb65: computeCurb65,
    parseCurbAge: parseCurbAge,
  };
});
