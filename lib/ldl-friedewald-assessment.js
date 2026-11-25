/**
 * Ported from web/lib/patient-records/ldl-friedewald-assessment.mjs
 * @sync web/lib/patient-records/ldl-friedewald-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuLdlFriedewaldAssessment = api;
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
  var tryNormalizeLipid = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeLipid;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var _mod_LdlFriedewald = loadMod(root, "ldl-friedewald.js", "AghuLdlFriedewald");
  var computeLdlFriedewald = _mod_LdlFriedewald && _mod_LdlFriedewald.computeLdlFriedewald;




function lipidMgDl(exams, sigla, preferDataISO) {
  const hit = resolveAnalyteForScore(exams, sigla, preferDataISO, {
    serumOnly: true,
  });
  if (!hit) return null;
  const value = tryNormalizeLipid(hit.value, hit.unit);
  if (value == null) return null;
  return {
    value,
    dataLabel: hit.dataLabel,
  };
}

function buildLdlFriedewaldAssessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  const ct = lipidMgDl(opts.exams, "CT", preferDataISO);
  if (ct) {
    suggested.totalCholesterolMgDl = ct.value;
    suggested.ctDataLabel = ct.dataLabel;
  } else {
    missing.push("ct");
  }

  const hdl = lipidMgDl(opts.exams, "HDL", preferDataISO);
  if (hdl) {
    suggested.hdlMgDl = hdl.value;
    suggested.hdlDataLabel = hdl.dataLabel;
  } else {
    missing.push("hdl");
  }

  const tg = lipidMgDl(opts.exams, "TG", preferDataISO);
  if (tg) {
    suggested.triglyceridesMgDl = tg.value;
    suggested.tgDataLabel = tg.dataLabel;
  } else {
    missing.push("tg");
  }

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const computed = computeLdlFriedewald({
    totalCholesterolMgDl: suggested.totalCholesterolMgDl,
    hdlMgDl: suggested.hdlMgDl,
    triglyceridesMgDl: suggested.triglyceridesMgDl,
  });

  if (computed.kind === "tg_too_high") {
    return {
      status: "invalid_tg",
      missing: [],
      suggested,
      result: computed,
    };
  }

  return {
    status: "ok",
    missing: [],
    suggested,
    result: computed,
  };
}


  return {
    buildLdlFriedewaldAssessment: buildLdlFriedewaldAssessment,
  };
});
