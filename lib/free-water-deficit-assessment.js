/**
 * Ported from web/lib/patient-records/free-water-deficit-assessment.mjs
 * @sync web/lib/patient-records/free-water-deficit-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuFreeWaterDeficitAssessment = api;
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
  var parsePesoKg = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.parsePesoKg;
  var _mod_CalculatorUnits = loadMod(root, "calculator-units.js", "AghuCalculatorUnits");
  var tryNormalizeSodium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeSodium;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_FreeWaterDeficit = loadMod(root, "free-water-deficit.js", "AghuFreeWaterDeficit");
  var computeFreeWaterDeficit = _mod_FreeWaterDeficit && _mod_FreeWaterDeficit.computeFreeWaterDeficit;





function buildFreeWaterDeficitAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const naHit = resolveAnalyteForScore(opts.exams, "Na", preferDataISO, {
    serumOnly: true,
  });
  if (naHit) {
    const na = tryNormalizeSodium(naHit.value, naHit.unit);
    if (na != null) {
      suggested.sodiumMEqL = na;
      suggested.sodiumDataLabel = naHit.dataLabel;
    } else {
      missing.push("sodium");
    }
  } else {
    missing.push("sodium");
  }

  const header = opts.passometroHeader || {};
  const weightKg = parsePesoKg(header.peso != null ? String(header.peso) : "");
  if (weightKg != null) {
    suggested.weightKg = weightKg;
  } else {
    missing.push("weight");
  }

  const sex = normalizeSex(opts.pii?.sexo);
  if (sex) {
    suggested.sex = sex;
  } else {
    missing.push("sex");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeFreeWaterDeficit({
    sodiumMEqL: suggested.sodiumMEqL,
    weightKg: suggested.weightKg,
    sex: suggested.sex,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildFreeWaterDeficitAssessment: buildFreeWaterDeficitAssessment,
  };
});
