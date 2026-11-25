/**
 * Ported from web/lib/patient-records/calculator-units.mjs
 * @sync web/lib/patient-records/calculator-units.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCalculatorUnits = api;
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
  var normalizeCreatinineMgDl = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeCreatinineMgDl;

  var _mod_ParseLocaleNumber = loadMod(root, "parse-locale-number.js", "AghuParseLocaleNumber");

  function parsePtNumber(s) {
    if (_mod_ParseLocaleNumber && _mod_ParseLocaleNumber.parsePtNumber) {
      return _mod_ParseLocaleNumber.parsePtNumber(s);
    }
    return NaN;
  }




function normalizeBilirubinMgDl(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_bilirubin");
  }
  const u = String(unit || "mg/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/µmol|umol|micromol/.test(u)) {
    return value / 17.1;
  }
  return value;
}

function normalizeAlbuminGDl(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_albumin");
  }
  const u = String(unit || "g/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/g\/l|g\\l/.test(u) && !/dl/.test(u)) {
    return value / 10;
  }
  return value;
}

function normalizeCalciumMgDl(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_calcium");
  }
  const u = String(unit || "mg/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u)) {
    return value * 4;
  }
  return value;
}

function normalizeSodiumMEqL(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_sodium");
  }
  const u = String(unit || "mEq/L")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u) || /meq/.test(u) || !u) {
    return value;
  }
  return value;
}

/**
 * Potássio sérico: mmol/L ≡ mEq/L (FEAT-119 / NEF-SAF-01).
 * @param {number} value
 * @param {string} [unit]
 * @returns {number}
 */
function normalizePotassiumMEqL(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_potassium");
  }
  const u = String(unit || "mEq/L")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u) || /meq/.test(u) || !u) {
    return value;
  }
  return value;
}

function tryNormalizePotassium(value, unit) {
  try {
    return normalizePotassiumMEqL(value, unit);
  } catch {
    return null;
  }
}

function normalizeLipidMgDl(value, unit) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("invalid_lipid");
  }
  const u = String(unit || "mg/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u)) {
    return value * 38.67;
  }
  return value;
}

function tryNormalizeCreatinine(value, unit) {
  try {
    return normalizeCreatinineMgDl(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeBilirubin(value, unit) {
  try {
    return normalizeBilirubinMgDl(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeAlbumin(value, unit) {
  try {
    return normalizeAlbuminGDl(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeCalcium(value, unit) {
  try {
    return normalizeCalciumMgDl(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeSodium(value, unit) {
  try {
    return normalizeSodiumMEqL(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeLipid(value, unit) {
  try {
    return normalizeLipidMgDl(value, unit);
  } catch {
    return null;
  }
}

function normalizeMEqL(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("invalid_meq");
  }
  const u = String(unit || "mEq/L")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u) || /meq/.test(u) || !u) {
    return value;
  }
  return value;
}

function normalizeGlucoseMgDl(value, unit) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("invalid_glucose");
  }
  const u = String(unit || "mg/dL")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/mmol/.test(u)) {
    return value * 18.0182;
  }
  return value;
}

function tryNormalizeMEqL(value, unit) {
  try {
    return normalizeMEqL(value, unit);
  } catch {
    return null;
  }
}

function tryNormalizeGlucose(value, unit) {
  try {
    return normalizeGlucoseMgDl(value, unit);
  } catch {
    return null;
  }
}


  return {
    normalizeBilirubinMgDl: normalizeBilirubinMgDl,
    normalizeAlbuminGDl: normalizeAlbuminGDl,
    normalizeCalciumMgDl: normalizeCalciumMgDl,
    normalizeSodiumMEqL: normalizeSodiumMEqL,
    normalizePotassiumMEqL: normalizePotassiumMEqL,
    normalizeLipidMgDl: normalizeLipidMgDl,
    tryNormalizeCreatinine: tryNormalizeCreatinine,
    tryNormalizeBilirubin: tryNormalizeBilirubin,
    tryNormalizeAlbumin: tryNormalizeAlbumin,
    tryNormalizeCalcium: tryNormalizeCalcium,
    tryNormalizeSodium: tryNormalizeSodium,
    tryNormalizePotassium: tryNormalizePotassium,
    tryNormalizeLipid: tryNormalizeLipid,
    normalizeMEqL: normalizeMEqL,
    normalizeGlucoseMgDl: normalizeGlucoseMgDl,
    tryNormalizeMEqL: tryNormalizeMEqL,
    tryNormalizeGlucose: tryNormalizeGlucose,
    parsePtNumber: parsePtNumber,
  };
});
