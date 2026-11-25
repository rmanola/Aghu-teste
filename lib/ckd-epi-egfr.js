/**
 * TFG estimada (eGFR) — equação CKD-EPI 2021 (creatinina, sem fator de raça).
 * Testável em Node via module.exports; extensão: global AghuCkdEpiEgfr.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuCkdEpiEgfr = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MIN_AGE_YEARS = 18;

  var root =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : this;
  var localeNumber = root.AghuParseLocaleNumber;
  if (!localeNumber && typeof require === "function") {
    try {
      localeNumber = require("./parse-locale-number.js");
    } catch (_e) {}
  }

  function computeAgeYearsFromIso(dobIso, referenceIso) {
    var ageFromDob = root.AghuAgeFromDob;
    if (!ageFromDob && typeof require === "function") {
      try {
        ageFromDob = require("./age-from-dob.js");
      } catch (_e2) {}
    }
    if (ageFromDob && ageFromDob.computeAgeYearsFromIso) {
      return ageFromDob.computeAgeYearsFromIso(dobIso, referenceIso);
    }
    return null;
  }

  function parsePtNumber(s) {
    if (localeNumber && localeNumber.parsePtNumber) {
      return localeNumber.parsePtNumber(s);
    }
    return NaN;
  }

  /**
   * @param {string} raw
   * @returns {number | null}
   */
  function parseIdadeAnos(raw) {
    if (raw == null || raw === "") return null;
    var t = String(raw).trim();
    var m = t.match(/(\d{1,3})/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Peso em kg a partir de texto do passômetro (ex.: "70", "70 kg"). @sync web/lib/patient-records/ckd-epi-egfr.mjs */
  function parsePesoKg(raw) {
    if (raw == null || raw === "") return null;
    var t = String(raw).trim().replace(",", ".");
    var m = t.match(/(\d{1,3}(?:\.\d{1,2})?)/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 && n < 500 ? n : null;
  }

  /**
   * @param {'M'|'F'|string|null|undefined} raw
   * @returns {'M'|'F'|null}
   */
  function normalizeSex(raw) {
    if (!raw) return null;
    var t = String(raw).trim().toUpperCase();
    if (t === "M" || t === "MASC" || t === "MASCULINO" || t === "MALE") return "M";
    if (t === "F" || t === "FEM" || t === "FEMININO" || t === "FEMALE") return "F";
    return null;
  }

  /**
   * @param {{ pii?: { dataNascimento?: string }|null, passometroHeader?: object|null, referenceDateISO?: string|null }} opts
   * @returns {number|null}
   */
  function resolveAgeYears(opts) {
    opts = opts || {};
    var pii = opts.pii || null;
    var header = opts.passometroHeader || null;
    var ref = opts.referenceDateISO || null;
    var dob =
      pii &&
      (pii.dataNascimento || pii.dataNascimentoISO);
    if (dob) {
      var fromDob = computeAgeYearsFromIso(dob, ref);
      if (fromDob != null) return fromDob;
    }
    return parseIdadeAnos(
      header && header.idade != null ? header.idade : "",
    );
  }

  /**
   * @param {number} value
   * @param {string} [unit]
   * @returns {number}
   */
  function normalizeCreatinineMgDl(value, unit) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("invalid_creatinine");
    }
    var u = String(unit || "mg/dL")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (/µmol|umol|micromol/.test(u)) {
      return value / 88.4;
    }
    return value;
  }

  /**
   * @param {number} egfr
   * @returns {{ stageId: string, stageLabel: string }}
   */
  function classifyEgfrStage(egfr) {
    if (!Number.isFinite(egfr)) {
      return { stageId: "unknown", stageLabel: "—" };
    }
    if (egfr >= 90) return { stageId: "G1", stageLabel: "G1 (≥90)" };
    if (egfr >= 60) return { stageId: "G2", stageLabel: "G2 (60–89)" };
    if (egfr >= 45) return { stageId: "G3a", stageLabel: "G3a (45–59)" };
    if (egfr >= 30) return { stageId: "G3b", stageLabel: "G3b (30–44)" };
    if (egfr >= 15) return { stageId: "G4", stageLabel: "G4 (15–29)" };
    return { stageId: "G5", stageLabel: "G5 (<15)" };
  }

  /**
   * CKD-EPI 2021 creatinine (race-free).
   * @param {{ creatinineMgDl: number, ageYears: number, sex: 'M'|'F' }} opts
   * @returns {{ egfrMlMin: number, stageId: string, stageLabel: string }}
   */
  function computeCkdEpiEgfr(opts) {
    opts = opts || {};
    var scr = opts.creatinineMgDl;
    var age = opts.ageYears;
    var sex = normalizeSex(opts.sex);

    if (!Number.isFinite(scr) || scr <= 0) {
      throw new Error("invalid_creatinine");
    }
    if (!Number.isFinite(age) || age < MIN_AGE_YEARS) {
      throw new Error("invalid_age");
    }
    if (!sex) {
      throw new Error("invalid_sex");
    }

    var kappa = sex === "F" ? 0.7 : 0.9;
    var alpha = sex === "F" ? -0.241 : -0.302;
    var scrK = scr / kappa;
    var minPart = Math.min(scrK, 1);
    var maxPart = Math.max(scrK, 1);

    var egfr =
      142 *
      Math.pow(minPart, alpha) *
      Math.pow(maxPart, -1.2) *
      Math.pow(0.9938, age);

    var rounded = Math.round(egfr);
    var stage = classifyEgfrStage(rounded);
    return {
      egfrMlMin: rounded,
      stageId: stage.stageId,
      stageLabel: stage.stageLabel,
    };
  }

  return {
    MIN_AGE_YEARS: MIN_AGE_YEARS,
    parsePtNumber: parsePtNumber,
    parseIdadeAnos: parseIdadeAnos,
    parsePesoKg: parsePesoKg,
    normalizeSex: normalizeSex,
    computeAgeYearsFromIso: computeAgeYearsFromIso,
    resolveAgeYears: resolveAgeYears,
    normalizeCreatinineMgDl: normalizeCreatinineMgDl,
    classifyEgfrStage: classifyEgfrStage,
    computeCkdEpiEgfr: computeCkdEpiEgfr,
  };
});
