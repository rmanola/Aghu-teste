/**
 * Ported from web/lib/patient-records/cockcroft-assessment.mjs
 * @sync web/lib/patient-records/cockcroft-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCockcroftAssessment = api;
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
  var MIN_AGE_YEARS = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.MIN_AGE_YEARS;
  var normalizeCreatinineMgDl = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeCreatinineMgDl;
  var normalizeSex = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeSex;
  var parsePesoKg = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.parsePesoKg;
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;
  var _mod_CockcroftGault = loadMod(root, "cockcroft-gault.js", "AghuCockcroftGault");
  var computeCockcroftGault = _mod_CockcroftGault && _mod_CockcroftGault.computeCockcroftGault;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;




function buildCockcroftAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};

  const header = opts.passometroHeader || null;
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));
  const crHit = resolveAnalyteForScore(opts.exams, "Cr", preferDataISO, {
    serumOnly: true,
  });
  const referenceDateISO = crHit?.((dataISO) != null && (dataISO) !== undefined ? (dataISO) : (preferDataISO)) ?? null;

  const ageYears = resolveAgeYears({
    pii: opts.pii || null,
    passometroHeader: header,
    referenceDateISO,
  });
  if (ageYears != null) {
    suggested.ageYears = ageYears;
  } else {
    missing.push("idade");
  }

  const weightKg =
    opts.weightKg != null && Number.isFinite(opts.weightKg)
      ? opts.weightKg
      : parsePesoKg(header && header.peso != null ? header.peso : "");
  if (weightKg != null) {
    suggested.weightKg = weightKg;
  } else {
    missing.push("peso");
  }

  const sex = normalizeSex(opts.pii && opts.pii.sexo);
  if (sex) {
    suggested.sex = sex;
  } else {
    missing.push("sexo");
  }

  if (crHit) {
    try {
      suggested.creatinineMgDl = normalizeCreatinineMgDl(
        crHit.value,
        crHit.unit,
      );
      suggested.creatinineDataLabel = crHit.dataLabel;
    } catch {
      missing.push("creatinine");
    }
  } else {
    missing.push("creatinine");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  if (suggested.ageYears < MIN_AGE_YEARS) {
    return {
      status: "invalid_age",
      missing: ["idade"],
      suggested,
    };
  }

  const result = computeCockcroftGault({
    ageYears: suggested.ageYears,
    weightKg: suggested.weightKg,
    creatinineMgDl: suggested.creatinineMgDl,
    sex: suggested.sex,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildCockcroftAssessment: buildCockcroftAssessment,
  };
});
