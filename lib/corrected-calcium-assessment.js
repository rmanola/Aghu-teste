/**
 * Ported from web/lib/patient-records/corrected-calcium-assessment.mjs
 * @sync web/lib/patient-records/corrected-calcium-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCorrectedCalciumAssessment = api;
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
  var tryNormalizeAlbumin = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeAlbumin;
  var tryNormalizeCalcium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeCalcium;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_CorrectedCalcium = loadMod(root, "corrected-calcium.js", "AghuCorrectedCalcium");
  var computeCorrectedCalcium = _mod_CorrectedCalcium && _mod_CorrectedCalcium.computeCorrectedCalcium;




/** Payne: só cálcio total sérico — nunca iônico nem urinário. */
const RE_EXCLUDED_TOTAL_CA = /IONIC|IONIZAD|CA\+\+|URIN/i;

/** @param {unknown} exams @param {string|null|undefined} preferDataISO */
function analyteTotalCalcium(exams, preferDataISO) {
  const cat = resolveAnalyteForScore(exams, "CaT", preferDataISO, {
    serumOnly: true,
  });
  if (cat) {
    const value = tryNormalizeCalcium(cat.value, cat.unit);
    if (value != null) {
      return { value, dataLabel: cat.dataLabel };
    }
  }

  const hit = resolveAnalyteForScore(exams, "Ca", preferDataISO, {
    serumOnly: true,
  });
  if (!hit) return null;
  if (RE_EXCLUDED_TOTAL_CA.test(String(hit.examName || ""))) return null;
  const value = tryNormalizeCalcium(hit.value, hit.unit);
  if (value == null) return null;
  return { value, dataLabel: hit.dataLabel };
}

/** Payne: albumina sérica (g/dL) — nunca urinária. */
function analyteSerumAlbumin(exams, preferDataISO) {
  const hit = resolveAnalyteForScore(exams, "Alb", preferDataISO, {
    serumOnly: true,
  });
  if (!hit) return null;
  const value = tryNormalizeAlbumin(hit.value, hit.unit);
  if (value == null) return null;
  return { value, dataLabel: hit.dataLabel };
}

function buildCorrectedCalciumAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const ca = analyteTotalCalcium(opts.exams, preferDataISO);
  if (ca) {
    suggested.calciumMgDl = ca.value;
    suggested.calciumDataLabel = ca.dataLabel;
  } else {
    missing.push("calcium");
  }

  const alb = analyteSerumAlbumin(opts.exams, preferDataISO);
  if (alb) {
    suggested.albuminGDl = alb.value;
    suggested.albuminDataLabel = alb.dataLabel;
  } else {
    missing.push("albumin");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeCorrectedCalcium({
    calciumMgDl: suggested.calciumMgDl,
    albuminGDl: suggested.albuminGDl,
  });

  return {
    status: "ok",
    missing: [],
    suggested,
    result,
  };
}


  return {
    analyteTotalCalcium: analyteTotalCalcium,
    analyteSerumAlbumin: analyteSerumAlbumin,
    buildCorrectedCalciumAssessment: buildCorrectedCalciumAssessment,
  };
});
