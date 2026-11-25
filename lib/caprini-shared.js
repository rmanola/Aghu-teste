/**
 * Ported from web/lib/patient-records/caprini-shared.mjs
 * @sync web/lib/patient-records/caprini-shared.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCapriniShared = api;
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
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;


/**
 * Pontos de idade Caprini (faixas mutuamente exclusivas).
 * @param {number} ageYears
 * @returns {0 | 1 | 2 | 3}
 */
function computeCapriniAgePoints(ageYears) {
  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new Error("invalid_caprini_age");
  }
  if (ageYears >= 75) return 3;
  if (ageYears >= 61) return 2;
  if (ageYears >= 41) return 1;
  return 0;
}

function parseCapriniAge(passometroHeader, pii, referenceDateISO) {
  return resolveAgeYears({
    passometroHeader,
    pii,
    referenceDateISO: ((referenceDateISO) != null && (referenceDateISO) !== undefined ? (referenceDateISO) : (null)),
  });
}

/**
 * Soma pontos de flags booleanas.
 * @param {Record<string, boolean | undefined>} opts
 * @param {Array<[string, number]>} factors
 * @param {Record<string, number>} points
 */
function sumCapriniFlags(opts, factors, points) {
  let total = 0;
  for (const [key, pts] of factors) {
    if (opts[key]) {
      points[key] = pts;
      total += pts;
    }
  }
  return total;
}


  return {
    computeCapriniAgePoints: computeCapriniAgePoints,
    parseCapriniAge: parseCapriniAge,
    sumCapriniFlags: sumCapriniFlags,
  };
});
