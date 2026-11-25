/**
 * Ported from web/lib/patient-records/qsofa-assessment.mjs
 * @sync web/lib/patient-records/qsofa-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuQsofaAssessment = api;
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
  var getLatestVitalsForQsofa = _mod_PassometroEntryVitals && _mod_PassometroEntryVitals.getLatestVitalsForQsofa;
  var _mod_QsofaScore = loadMod(root, "qsofa-score.js", "AghuQsofaScore");
  var computeQsofa = _mod_QsofaScore && _mod_QsofaScore.computeQsofa;




function buildQsofaAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const vitals = getLatestVitalsForQsofa(opts.passometro, opts.controles, {
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

  const lact = resolveAnalyteForScore(opts.exams, "Lact", preferDataISO);
  if (lact && Number.isFinite(lact.value)) {
    suggested.lactateValue = lact.value;
    suggested.lactateUnit = lact.unit || "mmol/L";
    suggested.lactateDataLabel = lact.dataLabel;
  }

  suggested.alteredMentation = !!opts.alteredMentation;

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeQsofa({
    respiratoryRate: suggested.respiratoryRate,
    systolicBp: suggested.systolicBp,
    alteredMentation: suggested.alteredMentation,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildQsofaAssessment: buildQsofaAssessment,
  };
});
