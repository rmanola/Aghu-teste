/**
 * Ported from web/lib/patient-records/fena-assessment.mjs
 * @sync web/lib/patient-records/fena-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuFenaAssessment = api;
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
  var tryNormalizeSodium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeSodium;
  var _mod_Fena = loadMod(root, "fena.js", "AghuFena");
  var computeFena = _mod_Fena && _mod_Fena.computeFena;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;




function analyte(exams, sigla, normalize, preferDataISO, opts) {
  const hit = resolveAnalyteForScore(exams, sigla, preferDataISO, opts);
  if (!hit) return null;
  const value = normalize(hit.value, hit.unit);
  if (value == null) return null;
  return { value, dataLabel: hit.dataLabel };
}

function buildFenaAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const naS = analyte(opts.exams, "Na", tryNormalizeSodium, preferDataISO, {
    serumOnly: true,
  });
  if (naS) {
    suggested.sodiumSerumMEqL = naS.value;
    suggested.sodiumSerumDataLabel = naS.dataLabel;
  } else {
    missing.push("sodiumSerum");
  }

  const naU = analyte(opts.exams, "NaU", tryNormalizeSodium, preferDataISO, {
    urineOnly: true,
  });
  if (naU) {
    suggested.sodiumUrineMEqL = naU.value;
    suggested.sodiumUrineDataLabel = naU.dataLabel;
  } else {
    missing.push("sodiumUrine");
  }

  const crS = analyte(opts.exams, "Cr", tryNormalizeCreatinine, preferDataISO, {
    serumOnly: true,
  });
  if (crS) {
    suggested.creatinineSerumMgDl = crS.value;
    suggested.creatinineSerumDataLabel = crS.dataLabel;
  } else {
    missing.push("creatinineSerum");
  }

  const crU = analyte(opts.exams, "CrU", tryNormalizeCreatinine, preferDataISO, {
    urineOnly: true,
  });
  if (crU) {
    suggested.creatinineUrineMgDl = crU.value;
    suggested.creatinineUrineDataLabel = crU.dataLabel;
  } else {
    missing.push("creatinineUrine");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeFena({
    sodiumSerumMEqL: suggested.sodiumSerumMEqL,
    sodiumUrineMEqL: suggested.sodiumUrineMEqL,
    creatinineSerumMgDl: suggested.creatinineSerumMgDl,
    creatinineUrineMgDl: suggested.creatinineUrineMgDl,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildFenaAssessment: buildFenaAssessment,
  };
});
