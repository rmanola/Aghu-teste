/**
 * Ported from web/lib/patient-records/chads-vasc-score.mjs
 * @sync web/lib/patient-records/chads-vasc-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuChadsVascScore = api;
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
  var parseIdadeAnos = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.parseIdadeAnos;
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;


function computeChadsVasc(opts) {
  const age = opts.ageYears;
  const sex = opts.sex;

  if (!Number.isFinite(age) || age < 0 || (sex !== "M" && sex !== "F")) {
    throw new Error("invalid_chads_inputs");
  }

  let total = 0;
  const points = {};

  if (opts.chf) {
    points.chf = 1;
    total += 1;
  }
  if (opts.hypertension) {
    points.hypertension = 1;
    total += 1;
  }
  if (age >= 75) {
    points.age = 2;
    total += 2;
  } else if (age >= 65) {
    points.age = 1;
    total += 1;
  }
  if (opts.diabetes) {
    points.diabetes = 1;
    total += 1;
  }
  if (opts.strokeTia) {
    points.strokeTia = 2;
    total += 2;
  }
  if (opts.vascularDisease) {
    points.vascularDisease = 1;
    total += 1;
  }
  if (sex === "F") {
    points.sexCategory = 1;
    total += 1;
  }

  let strokeRisk = "baixo";
  if (total >= 6) strokeRisk = "alto";
  else if (total >= 2) strokeRisk = "moderado";

  return { total, points, strokeRisk };
}

function buildChadsSuggestedAgeSex(
  passometroHeader,
  pii,
  referenceDateISO,
) {
  const suggested = {};
  const age = resolveAgeYears({
    passometroHeader,
    pii,
    referenceDateISO: ((referenceDateISO) != null && (referenceDateISO) !== undefined ? (referenceDateISO) : (null)),
  });
  if (age != null) suggested.ageYears = age;
  const sex = normalizeSex(pii && pii.sexo);
  if (sex) suggested.sex = sex;
  return suggested;
}


  return {
    computeChadsVasc: computeChadsVasc,
    buildChadsSuggestedAgeSex: buildChadsSuggestedAgeSex,
  };
});
