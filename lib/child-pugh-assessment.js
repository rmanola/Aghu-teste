/**
 * Ported from web/lib/patient-records/child-pugh-assessment.mjs
 * @sync web/lib/patient-records/child-pugh-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuChildPughAssessment = api;
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
  var tryNormalizeBilirubin = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeBilirubin;
  var _mod_ChildPughScore = loadMod(root, "child-pugh-score.js", "AghuChildPughScore");
  var computeChildPugh = _mod_ChildPughScore && _mod_ChildPughScore.computeChildPugh;
  var _mod_CorrectedCalciumAssessment = loadMod(root, "corrected-calcium-assessment.js", "AghuCorrectedCalciumAssessment");
  var analyteSerumAlbumin = _mod_CorrectedCalciumAssessment && _mod_CorrectedCalciumAssessment.analyteSerumAlbumin;
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

function buildChildPughAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const bili = analyte(opts.exams, "BT", tryNormalizeBilirubin, preferDataISO);
  if (bili) {
    suggested.bilirubinMgDl = bili.value;
    suggested.bilirubinDataLabel = bili.dataLabel;
  } else {
    missing.push("bilirubin");
  }

  const alb = analyteSerumAlbumin(opts.exams, preferDataISO);
  if (alb) {
    suggested.albuminGDl = alb.value;
    suggested.albuminDataLabel = alb.dataLabel;
  } else {
    missing.push("albumin");
  }

  const inrHit = resolveAnalyteForScore(opts.exams, "INR", preferDataISO, {
    serumOnly: true,
  });
  if (inrHit && Number.isFinite(inrHit.value) && inrHit.value > 0) {
    suggested.inr = inrHit.value;
    suggested.inrDataLabel = inrHit.dataLabel;
  } else {
    missing.push("inr");
  }

  const ascites = opts.ascites || null;
  if (ascites) {
    suggested.ascites = ascites;
  } else {
    missing.push("ascites");
  }

  const encephalopathy = opts.encephalopathy || null;
  if (encephalopathy) {
    suggested.encephalopathy = encephalopathy;
  } else {
    missing.push("encephalopathy");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeChildPugh({
    bilirubinMgDl: suggested.bilirubinMgDl,
    albuminGDl: suggested.albuminGDl,
    inr: suggested.inr,
    ascites: suggested.ascites,
    encephalopathy: suggested.encephalopathy,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildChildPughAssessment: buildChildPughAssessment,
  };
});
