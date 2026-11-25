/**
 * Ported from web/lib/patient-records/curb65-assessment.mjs
 * @sync web/lib/patient-records/curb65-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCurb65Assessment = api;
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

  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_PassometroEntryVitals = loadMod(root, "passometro-entry-vitals.js", "AghuPassometroEntryVitals");
  var getLatestVitalsForCurb65 = _mod_PassometroEntryVitals && _mod_PassometroEntryVitals.getLatestVitalsForCurb65;
  var _mod_Curb65Score = loadMod(root, "curb65-score.js", "AghuCurb65Score");
  var computeCurb65 = _mod_Curb65Score && _mod_Curb65Score.computeCurb65;
  var isUreaElevatedForCurb = _mod_Curb65Score && _mod_Curb65Score.isUreaElevatedForCurb;
  var normalizeUreaForCurb = _mod_Curb65Score && _mod_Curb65Score.normalizeUreaForCurb;
  var parseCurbAge = _mod_Curb65Score && _mod_Curb65Score.parseCurbAge;




function buildCurb65Assessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const ageYears = parseCurbAge(opts.passometroHeader, {
    pii: opts.pii,
    referenceDateISO: preferDataISO,
  });
  if (ageYears != null) {
    suggested.ageYears = ageYears;
  } else {
    missing.push("idade");
  }

  const uHit = resolveAnalyteForScore(opts.exams, "U", preferDataISO, {
    serumOnly: true,
  });
  if (uHit && Number.isFinite(uHit.value)) {
    try {
      const norm = normalizeUreaForCurb(uHit.value, uHit.unit);
      suggested.ureaMgDl = norm.mgDl;
      suggested.ureaElevated = isUreaElevatedForCurb(norm.mgDl, norm.mmolL);
      suggested.ureaDataLabel = uHit.dataLabel;
    } catch {
      missing.push("urea");
    }
  } else {
    missing.push("urea");
  }

  let vitals = null;
  vitals = getLatestVitalsForCurb65(opts.passometro, opts.controles, {
    preferDataISO,
    entry: ((opts.entry) != null && (opts.entry) !== undefined ? (opts.entry) : (null)),
  });

  if (vitals) {
    if (vitals.frIrpm != null) suggested.respiratoryRate = vitals.frIrpm;
    if (vitals.pas != null) suggested.systolicBp = vitals.pas;
    suggested.vitalsDataLabel = vitals.dataLabel;
  }

  if (suggested.respiratoryRate == null) missing.push("respiratoryRate");
  if (suggested.systolicBp == null) missing.push("systolicBp");

  suggested.confusion = !!opts.confusion;

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeCurb65({
    confusion: suggested.confusion,
    ureaElevated: suggested.ureaElevated,
    respiratoryRate: suggested.respiratoryRate,
    systolicBp: suggested.systolicBp,
    ageYears: suggested.ageYears,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildCurb65Assessment: buildCurb65Assessment,
  };
});
