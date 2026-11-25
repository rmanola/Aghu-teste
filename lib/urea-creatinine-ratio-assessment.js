/**
 * Ported from web/lib/patient-records/urea-creatinine-ratio-assessment.mjs
 * @sync web/lib/patient-records/urea-creatinine-ratio-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuUreaCreatinineRatioAssessment = api;
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

  var _mod_CalculatorUnits = loadMod(root, "calculator-units.js", "AghuCalculatorUnits");
  var tryNormalizeCreatinine = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeCreatinine;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_UreaCreatinineRatio = loadMod(root, "urea-creatinine-ratio.js", "AghuUreaCreatinineRatio");
  var computeUreaCreatinineRatio = _mod_UreaCreatinineRatio && _mod_UreaCreatinineRatio.computeUreaCreatinineRatio;
  var normalizeUreaMgDl = _mod_UreaCreatinineRatio && _mod_UreaCreatinineRatio.normalizeUreaMgDl;




function buildUreaCreatinineRatioAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const uHit = resolveAnalyteForScore(opts.exams, "U", preferDataISO, {
    serumOnly: true,
  });
  if (uHit && Number.isFinite(uHit.value)) {
    try {
      suggested.ureaMgDl = normalizeUreaMgDl(uHit.value, uHit.unit);
      suggested.ureaDataLabel = uHit.dataLabel;
    } catch {
      missing.push("urea");
    }
  } else {
    missing.push("urea");
  }

  const crHit = resolveAnalyteForScore(opts.exams, "Cr", preferDataISO, {
    serumOnly: true,
  });
  if (crHit) {
    const cr = tryNormalizeCreatinine(crHit.value, crHit.unit);
    if (cr != null) {
      suggested.creatinineMgDl = cr;
      suggested.creatinineDataLabel = crHit.dataLabel;
    } else {
      missing.push("creatinine");
    }
  } else {
    missing.push("creatinine");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeUreaCreatinineRatio({
    ureaMgDl: suggested.ureaMgDl,
    creatinineMgDl: suggested.creatinineMgDl,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildUreaCreatinineRatioAssessment: buildUreaCreatinineRatioAssessment,
  };
});
