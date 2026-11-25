/**
 * Ported from web/lib/patient-records/meld-assessment.mjs
 * @sync web/lib/patient-records/meld-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuMeldAssessment = api;
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
  var tryNormalizeCreatinine = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeCreatinine;
  var tryNormalizeSodium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeSodium;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_MeldScore = loadMod(root, "meld-score.js", "AghuMeldScore");
  var computeMeldNa = _mod_MeldScore && _mod_MeldScore.computeMeldNa;




function analyteMgDl(exams, sigla, normalize, preferDataISO) {
  const hit = resolveAnalyteForScore(exams, sigla, preferDataISO, {
    serumOnly: true,
  });
  if (!hit) return null;
  const value = normalize(hit.value, hit.unit);
  if (value == null) return null;
  return {
    value,
    dataISO: hit.dataISO,
    dataLabel: hit.dataLabel,
  };
}

function buildMeldAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};

  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const bili = analyteMgDl(opts.exams, "BT", tryNormalizeBilirubin, preferDataISO);
  if (bili) {
    suggested.bilirubinMgDl = bili.value;
    suggested.bilirubinDataLabel = bili.dataLabel;
  } else {
    missing.push("bilirubin");
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

  const cr = analyteMgDl(opts.exams, "Cr", tryNormalizeCreatinine, preferDataISO);
  if (cr) {
    suggested.creatinineMgDl = cr.value;
    suggested.creatinineDataLabel = cr.dataLabel;
  } else {
    missing.push("creatinine");
  }

  const na = analyteMgDl(opts.exams, "Na", tryNormalizeSodium, preferDataISO);
  if (na) {
    suggested.sodiumMEqL = na.value;
    suggested.sodiumDataLabel = na.dataLabel;
  } else {
    missing.push("sodium");
  }

  const onDialysis = !!opts.onDialysis;
  const coreMissing = missing.filter((m) => m !== "sodium");

  if (coreMissing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeMeldNa({
    bilirubinMgDl: suggested.bilirubinMgDl,
    inr: suggested.inr,
    creatinineMgDl: suggested.creatinineMgDl,
    sodiumMEqL: suggested.sodiumMEqL,
    onDialysis,
  });

  if (result.missingSodium) {
    return {
      status: "partial",
      missing: ["sodium"],
      suggested,
      result: { meld: result.meld, meldNa: result.meld },
    };
  }

  return {
    status: "ok",
    missing: [],
    suggested,
    result: {
      meld: result.meld,
      meldNa: result.meldNa,
      sodiumUsed: result.sodiumUsed,
    },
  };
}


  return {
    buildMeldAssessment: buildMeldAssessment,
  };
});
