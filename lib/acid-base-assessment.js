/**
 * Ported from web/lib/patient-records/acid-base-assessment.mjs
 * @sync web/lib/patient-records/acid-base-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAcidBaseAssessment = api;
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

  var _mod_AcidBase = loadMod(root, "acid-base.js", "AghuAcidBase");
  var computeAcidBasePanel = _mod_AcidBase && _mod_AcidBase.computeAcidBasePanel;
  var _mod_CalculatorUnits = loadMod(root, "calculator-units.js", "AghuCalculatorUnits");
  var tryNormalizeAlbumin = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeAlbumin;
  var tryNormalizeMEqL = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeMEqL;
  var tryNormalizeSodium = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeSodium;
  var _mod_ExamLatestValue = loadMod(root, "exam-latest-value.js", "AghuExamLatestValue");
  var getLatestSerumAnalyteValue = _mod_ExamLatestValue && _mod_ExamLatestValue.getLatestSerumAnalyteValue;
  var resolveAnalyteForScore = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveAnalyteForScore;
  var resolveIsolatedElectrolyte = _mod_ExamLatestValue && _mod_ExamLatestValue.resolveIsolatedElectrolyte;
  var _mod_GasometryLatestBundle = loadMod(root, "gasometry-latest-bundle.js", "AghuGasometryLatestBundle");
  var getGasometryBundleOnDate = _mod_GasometryLatestBundle && _mod_GasometryLatestBundle.getGasometryBundleOnDate;
  var getLatestGasometryBundle = _mod_GasometryLatestBundle && _mod_GasometryLatestBundle.getLatestGasometryBundle;





function numFromAnalyte(hit) {
  if (!hit || !Number.isFinite(hit.value)) return null;
  return hit.value;
}

function mEqFromAnalyte(hit, useSodium) {
  if (!hit) return null;
  const norm = useSodium
    ? tryNormalizeSodium(hit.value, hit.unit)
    : tryNormalizeMEqL(hit.value, hit.unit);
  return norm;
}

function electrolyteFromHit(hit, useSodium) {
  if (!hit) return null;
  const value = useSodium
    ? tryNormalizeSodium(hit.value, hit.unit)
    : tryNormalizeMEqL(hit.value, hit.unit);
  if (value == null) return null;
  return { value, dataLabel: hit.dataLabel };
}

function buildAcidBaseAssessment(opts) {
  opts = opts || {};
  const warnings = [];
  const missing = [];
  const suggested = {};

  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));
  const bundle = preferDataISO
    ? getGasometryBundleOnDate(opts.exams, preferDataISO)
    : getLatestGasometryBundle(opts.exams);
  let gasometryDataISO = preferDataISO || null;

  if (bundle) {
    if (!gasometryDataISO) gasometryDataISO = bundle.dataISO;
    suggested.channel = bundle.channel;
    suggested.dataLabel = bundle.dataLabel;
    suggested.examName = bundle.examName;
    if (bundle.channel === "venous") {
      warnings.push("Gasometria venosa — pH e PaCO₂ podem diferir da arterial.");
    }

    const ph = numFromAnalyte(bundle.analytes.pH);
    if (ph != null) suggested.ph = ph;

    const pco2 = numFromAnalyte(bundle.analytes.PaCO2);
    if (pco2 != null) suggested.pco2MmHg = pco2;

    const hco3 = mEqFromAnalyte(bundle.analytes.HCO3, false);
    if (hco3 != null) suggested.bicarbonateMEqL = hco3;

    const agLab = numFromAnalyte(bundle.analytes.AG);
    if (agLab != null) suggested.anionGapFromLab = agLab;

    const lact = numFromAnalyte(bundle.analytes.Lact);
    if (lact != null) suggested.lactateMmolL = lact;

    const pao2 = numFromAnalyte(bundle.analytes.PaO2);
    if (pao2 != null) suggested.pao2MmHg = pao2;

    const sto2 = numFromAnalyte(bundle.analytes.StO2);
    if (sto2 != null) suggested.sao2Percent = sto2;

    const be = mEqFromAnalyte(bundle.analytes.BE, false);
    if (be != null) suggested.baseExcessMEqL = be;
  }

  const naHit = preferDataISO
    ? resolveAnalyteForScore(opts.exams, "Na", preferDataISO, { serumOnly: true })
    : resolveIsolatedElectrolyte(opts.exams, "Na", gasometryDataISO);
  const clHit = preferDataISO
    ? resolveAnalyteForScore(opts.exams, "Cl", preferDataISO, { serumOnly: true })
    : resolveIsolatedElectrolyte(opts.exams, "Cl", gasometryDataISO);

  const na = electrolyteFromHit(naHit, true);
  if (na) {
    suggested.sodiumMEqL = na.value;
    suggested.sodiumDataLabel = na.dataLabel;
  }

  const cl = electrolyteFromHit(clHit, false);
  if (cl) {
    suggested.chlorideMEqL = cl.value;
    suggested.chlorideDataLabel = cl.dataLabel;
  }

  if (
    gasometryDataISO &&
    ((naHit?.dataISO && naHit.dataISO !== gasometryDataISO) ||
      (clHit?.dataISO && clHit.dataISO !== gasometryDataISO))
  ) {
    warnings.push(
      "Sódio/cloreto de coleta diferente da gasometria — conferir eletrólitos.",
    );
  }

  const albHit = preferDataISO
    ? resolveAnalyteForScore(opts.exams, "Alb", preferDataISO, { serumOnly: true })
    : getLatestSerumAnalyteValue(opts.exams, "Alb");
  if (albHit) {
    const alb = tryNormalizeAlbumin(albHit.value, albHit.unit);
    if (alb != null) {
      suggested.albuminGDl = alb;
      suggested.albuminDataLabel = albHit.dataLabel;
    }
  }

  if (suggested.ph == null) missing.push("ph");
  if (suggested.pco2MmHg == null) missing.push("pco2");
  if (suggested.bicarbonateMEqL == null) missing.push("bicarbonate");

  const hasAgInputs =
    suggested.sodiumMEqL != null &&
    suggested.chlorideMEqL != null &&
    suggested.bicarbonateMEqL != null;

  if (!hasAgInputs && suggested.anionGapFromLab == null) {
    if (!missing.includes("sodium") && suggested.sodiumMEqL == null) {
      missing.push("sodium");
    }
    if (!missing.includes("chloride") && suggested.chlorideMEqL == null) {
      missing.push("chloride");
    }
  }

  const canClassify =
    suggested.ph != null &&
    suggested.pco2MmHg != null &&
    suggested.bicarbonateMEqL != null;

  if (!canClassify) {
    return { status: "missing", missing, suggested, warnings };
  }

  const result = computeAcidBasePanel({
    ph: suggested.ph,
    pco2MmHg: suggested.pco2MmHg,
    bicarbonateMEqL: suggested.bicarbonateMEqL,
    sodiumMEqL: suggested.sodiumMEqL,
    chlorideMEqL: suggested.chlorideMEqL,
    albuminGDl: suggested.albuminGDl,
    anionGapFromLab: suggested.anionGapFromLab,
    channel: suggested.channel || null,
  });

  return {
    status: "ok",
    missing: [],
    suggested,
    warnings,
    result,
  };
}


  return {
    buildAcidBaseAssessment: buildAcidBaseAssessment,
  };
});
