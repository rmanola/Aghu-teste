/**
 * Ported from web/lib/patient-records/corrected-sodium-assessment.mjs
 * @sync web/lib/patient-records/corrected-sodium-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCorrectedSodiumAssessment = api;
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

  var _mod_CorrectedSodium = loadMod(root, "corrected-sodium.js", "AghuCorrectedSodium");
  var computeCorrectedSodium = _mod_CorrectedSodium && _mod_CorrectedSodium.computeCorrectedSodium;
  var _mod_CalculatorUnits = loadMod(root, "calculator-units.js", "AghuCalculatorUnits");
  var tryNormalizeGlucose = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeGlucose;
  var tryNormalizeSodium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeSodium;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;




function analyte(exams, sigla, normalize, preferDataISO) {
  const hit = resolveAnalyteForScore(exams, sigla, preferDataISO, {
    serumOnly: true,
  });
  if (!hit) return null;
  const value = normalize(hit.value, hit.unit);
  if (value == null) return null;
  return { value, dataLabel: hit.dataLabel };
}

function buildCorrectedSodiumAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const na = analyte(opts.exams, "Na", tryNormalizeSodium, preferDataISO);
  if (na) {
    suggested.sodiumMEqL = na.value;
    suggested.sodiumDataLabel = na.dataLabel;
  } else {
    missing.push("sodium");
  }

  const gli = analyte(opts.exams, "Gli", tryNormalizeGlucose, preferDataISO);
  if (gli) {
    suggested.glucoseMgDl = gli.value;
    suggested.glucoseDataLabel = gli.dataLabel;
  } else {
    missing.push("glucose");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeCorrectedSodium({
    sodiumMEqL: suggested.sodiumMEqL,
    glucoseMgDl: suggested.glucoseMgDl,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildCorrectedSodiumAssessment: buildCorrectedSodiumAssessment,
  };
});
