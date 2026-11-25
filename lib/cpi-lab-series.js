/**
 * FEAT-119 — Extractor de série laboratorial (creatinina / potássio) para CPI Nefrologia.
 * Consome exames já sincronizados; sem extracção nova AGHU.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiLabSeries = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  /** Sinónimos versionados (padrão FEAT-116 charlson-from-text). */
  var ANALYTE_SYNONYMS = {
    creatinina: ["creatinina", "creat", "cr"],
    potassio: ["potassio", "potássio", "k"],
  };

  var MIN_MEASUREMENTS = 2;

  function loadUnits() {
    if (typeof require === "function") {
      try {
        return require("./calculator-units.js");
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root.AghuCalculatorUnits) ||
      (typeof globalThis !== "undefined" && globalThis.AghuCalculatorUnits) ||
      null
    );
  }

  function loadCkd() {
    if (typeof require === "function") {
      try {
        return require("./ckd-epi-egfr.js");
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root.AghuCkdEpiEgfr) ||
      (typeof globalThis !== "undefined" && globalThis.AghuCkdEpiEgfr) ||
      null
    );
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function normalizeName(name) {
    return str(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isUrineCreatinine(name, sample) {
    var n = normalizeName(name);
    var s = normalizeName(sample);
    if (!n) return false;
    if (n.indexOf("creatinina") === -1 && n !== "cr" && n.indexOf("creat") === -1) {
      return false;
    }
    if (/\burina\b|\burinario\b|\burinaria\b/.test(n)) return true;
    if (/\burina\b|\burinario\b/.test(s)) return true;
    return false;
  }

  function matchesAnalyte(name, analyte) {
    var n = normalizeName(name);
    if (!n) return false;
    var synonyms = ANALYTE_SYNONYMS[analyte] || [];
    for (var i = 0; i < synonyms.length; i++) {
      var syn = normalizeName(synonyms[i]);
      if (!syn) continue;
      if (n === syn || n.indexOf(syn) !== -1) return true;
    }
    return false;
  }

  function parseNumeric(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (raw == null || raw === "") return NaN;
    var s = str(raw).trim().replace(",", ".");
    var n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function parseAt(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return new Date(raw).toISOString();
    }
    var t = Date.parse(str(raw));
    if (!Number.isFinite(t)) return null;
    return new Date(t).toISOString();
  }

  function examFields(exam) {
    if (!exam || typeof exam !== "object") return null;
    var name = exam.examName || exam.nome || exam.name || exam.label || "";
    var value = parseNumeric(
      exam.value != null
        ? exam.value
        : exam.valor != null
          ? exam.valor
          : exam.result != null
            ? exam.result
            : exam.resultado,
    );
    var unit = exam.unit || exam.unidade || exam.units || "";
    var at = parseAt(exam.at || exam.data || exam.collectedAt || exam.date);
    var sample = exam.sample || exam.amostra || exam.material || "";
    return { name: name, value: value, unit: unit, at: at, sample: sample };
  }

  function inRange(iso, range) {
    if (!range || typeof range !== "object") return true;
    var t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    if (range.from != null) {
      var from = Date.parse(str(range.from));
      if (Number.isFinite(from) && t < from) return false;
    }
    if (range.to != null) {
      var to = Date.parse(str(range.to));
      if (Number.isFinite(to) && t > to) return false;
    }
    return true;
  }

  /**
   * @param {object|null|undefined} patient — { exams: [...] }
   * @param {{ analyte: "creatinina"|"potassio", range?: { from?: string, to?: string } }} options
   * @returns {{
   *   measurements: Array<{ value: number, unit: string, at: string }>,
   *   usable: boolean,
   *   reason: string|null,
   *   converted: number,
   *   undated: number
   * }}
   */
  function extractLabSeries(patient, options) {
    var opts = options && typeof options === "object" ? options : {};
    var analyte = str(opts.analyte).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (analyte === "potassium") analyte = "potassio";
    if (analyte !== "creatinina" && analyte !== "potassio") {
      return {
        measurements: [],
        usable: false,
        reason: "unknown_analyte",
        converted: 0,
        undated: 0,
      };
    }

    var exams = asArray(patient && patient.exams);
    var units = loadUnits();
    var ckd = loadCkd();
    var measurements = [];
    var converted = 0;
    var undated = 0;

    for (var i = 0; i < exams.length; i++) {
      var fields = examFields(exams[i]);
      if (!fields) continue;
      if (!matchesAnalyte(fields.name, analyte)) continue;
      if (analyte === "creatinina" && isUrineCreatinine(fields.name, fields.sample)) {
        continue;
      }
      if (!Number.isFinite(fields.value)) continue;
      if (!fields.at) {
        undated += 1;
        continue;
      }
      if (!inRange(fields.at, opts.range)) continue;

      var normalized = null;
      var targetUnit = analyte === "creatinina" ? "mg/dL" : "mEq/L";
      var rawUnit = str(fields.unit);
      try {
        if (analyte === "creatinina") {
          var normCr =
            (units && typeof units.tryNormalizeCreatinine === "function"
              ? units.tryNormalizeCreatinine(fields.value, rawUnit || "mg/dL")
              : null) ||
            (ckd && typeof ckd.normalizeCreatinineMgDl === "function"
              ? ckd.normalizeCreatinineMgDl(fields.value, rawUnit || "mg/dL")
              : null);
          if (normCr == null || !Number.isFinite(normCr)) continue;
          normalized = normCr;
          if (/µmol|umol|micromol/i.test(rawUnit)) converted += 1;
        } else {
          var normK =
            units && typeof units.normalizePotassiumMEqL === "function"
              ? units.normalizePotassiumMEqL(fields.value, rawUnit || "mEq/L")
              : units && typeof units.normalizeMEqL === "function"
                ? units.normalizeMEqL(fields.value, rawUnit || "mEq/L")
                : fields.value;
          if (normK == null || !Number.isFinite(normK)) continue;
          normalized = normK;
          if (/mmol/i.test(rawUnit) && !/meq/i.test(rawUnit)) converted += 1;
        }
      } catch (_err) {
        continue;
      }

      measurements.push({
        value: normalized,
        unit: targetUnit,
        at: fields.at,
      });
    }

    measurements.sort(function (a, b) {
      return Date.parse(a.at) - Date.parse(b.at);
    });

    var usable = measurements.length >= MIN_MEASUREMENTS;
    return {
      measurements: measurements,
      usable: usable,
      reason: usable ? null : "insufficient_measurements",
      converted: converted,
      undated: undated,
    };
  }

  return {
    ANALYTE_SYNONYMS: ANALYTE_SYNONYMS,
    MIN_MEASUREMENTS: MIN_MEASUREMENTS,
    extractLabSeries: extractLabSeries,
  };
});
