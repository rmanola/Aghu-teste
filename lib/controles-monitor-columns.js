/**
 * Mapeamento flexível de colunas da tabela de monitorização AGHU.
 * Testável em Node via module.exports; extensão: global AghuControlesMonitorColumns.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesMonitorColumns = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function loadSanitize() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./controles-vital-sanitize.js");
      } catch (_e) {}
    }
    return typeof globalThis !== "undefined" && globalThis.AghuControlesVitalSanitize
      ? globalThis.AghuControlesVitalSanitize
      : null;
  }

  var sanitizeApi = loadSanitize();

  function maybeSanitize(field, value) {
    if (!field || !sanitizeApi || !sanitizeApi.sanitizeMonitorVital) return value;
    return sanitizeApi.sanitizeMonitorVital(field, value);
  }

  function pushSanitized(vals, field, value) {
    var v = maybeSanitize(field, value);
    if (v !== null && v !== undefined) vals.push(v);
  }

  var PA_COMBINED_ALIASES = ["pa", "p.a", "pressao arterial"];
  var PESO_PRE_TOKEN = "pesopre";
  var PESO_POS_TOKEN = "pesopos";
  var UF_ALIASES = ["uf", "ultrafiltracao", "ultrafiltração"];

  var NORADREN_BLOCKLIST = { adrenalina: true, epinefrina: true };

  var FIELD_ALIASES = {
    fr: ["fr", "freq. resp", "freq resp", "freq.resp", "frequencia respiratoria", "freq respiratoria"],
    spo2: ["spo", "spo2", "saturacao", "saturação", "sato2", "sat"],
    tax: ["tax", "temperatura", "temp"],
    pas: ["pas", "p.a.s", "pressao sistolica", "pressão sistólica", "ps"],
    pad: ["pad", "p.a.d", "pressao diastolica", "pressão diastólica", "pd"],
    pam: ["pam", "p.a.m", "pressao arterial media", "pressão arterial média"],
    fc: ["fc", "f.c", "freq cardiaca", "frequencia cardiaca", "freq. cardiaca"],
    hgt: ["h.g.t", "hgt", "glicemia", "hemoglucoteste"],
    noradren: ["noradren", "noradrenalina", "norepinefrina", "nora"],
    fezes: ["fezes", "evacuacao", "evacuação"],
    urina: ["urina", "miccao", "micção"],
  };

  var DEFAULT_INDEXES = {
    fr: [1],
    spo2: [2],
    tax: [4],
    pas: [5],
    pad: [6],
    fc: [7],
    hgt: [11],
    noradren: [],
    fezes: [9],
    urina: [10],
    paCombined: [],
    pam: [],
    pesoPre: [],
    pesoPos: [],
    uf: [],
  };

  var FLEXIBLE_FIELDS = ["fr", "spo2", "tax", "pas", "pad", "pam", "fc", "hgt", "fezes", "urina"];

  /** Subscritos ₀–₉ e superscritos comuns → ASCII 0–9 (ex.: SPO₂ → spo2). */
  function normalizeScriptDigits(s) {
    return String(s || "")
      .replace(/[\u2080-\u2089]/g, function (c) {
        return String(c.charCodeAt(0) - 0x2080);
      })
      .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]/g, function (c) {
        var map = {
          "\u2070": "0",
          "\u00b9": "1",
          "\u00b2": "2",
          "\u00b3": "3",
          "\u2074": "4",
          "\u2075": "5",
          "\u2076": "6",
          "\u2077": "7",
          "\u2078": "8",
          "\u2079": "9",
        };
        return map[c] || c;
      });
  }

  function normColLabel(s) {
    var t = normalizeScriptDigits(String(s || "").toLowerCase());
    try {
      t = t.normalize("NFD").replace(/\p{M}/gu, "");
    } catch (e) {
      t = t.replace(/[àáâãäåèéêëìíîïòóôõöùúûüçñ]/g, function (c) {
        return (
          { à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", è: "e", é: "e", ê: "e", ë: "e", ì: "i", í: "i", î: "i", ï: "i", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ù: "u", ú: "u", û: "u", ü: "u", ç: "c", ñ: "n" }[c] || c
        );
      });
    }
    t = t.replace(/[\s\xa0]+/g, " ").trim();
    t = t.replace(/\([^)]*\)/g, "");
    t = t.replace(/[./\-:]/g, "");
    t = t.replace(/\s+/g, "");
    return t;
  }

  /** Remove affix HD no início ou fim (hemodiálise). */
  function stripHdAffix(normalized) {
    if (!normalized || normalized === "hd") return normalized;
    if (normalized.indexOf("hd") === 0 && normalized.length > 2) {
      return normalized.slice(2);
    }
    if (normalized.length > 2 && normalized.slice(-2) === "hd") {
      return normalized.slice(0, -2);
    }
    return normalized;
  }

  function labelVariants(normalized) {
    var stripped = stripHdAffix(normalized);
    if (!stripped || stripped === normalized) return [normalized];
    return [normalized, stripped];
  }

  function aliasMatches(normalizedLabel, alias, mode) {
    var na = normColLabel(alias);
    if (!na || !normalizedLabel) return false;
    if (normalizedLabel === na) return true;
    if (mode === "exact") return false;
    if (na.length >= 4 && normalizedLabel.indexOf(na) !== -1) return true;
    if (na.length >= 4 && normalizedLabel.length >= 4 && na.indexOf(normalizedLabel) !== -1) return true;
    return false;
  }

  function matchNoradrenField(normalized) {
    if (!normalized || NORADREN_BLOCKLIST[normalized]) return false;
    var aliases = FIELD_ALIASES.noradren || [];
    var j;
    for (j = 0; j < aliases.length; j++) {
      var mode = aliases[j].length <= 3 ? "exact" : "flexible";
      if (aliasMatches(normalized, aliases[j], mode)) return true;
    }
    return false;
  }

  function matchPesoField(normalized) {
    if (normalized === PESO_PRE_TOKEN || normalized === "pesopredialise") return "pesoPre";
    if (normalized === PESO_POS_TOKEN || normalized === "pesoposdialise") return "pesoPos";
    return null;
  }

  function matchUfField(normalized) {
    var i;
    for (i = 0; i < UF_ALIASES.length; i++) {
      var mode = UF_ALIASES[i].length <= 3 ? "exact" : "flexible";
      if (aliasMatches(normalized, UF_ALIASES[i], mode)) return "uf";
    }
    return null;
  }

  function fieldsForLabelSingle(normalized) {
    var matched = [];
    var i;
    var field;
    var aliases;
    var peso = matchPesoField(normalized);
    if (peso) matched.push(peso);
    var uf = matchUfField(normalized);
    if (uf) matched.push(uf);

    for (i = 0; i < PA_COMBINED_ALIASES.length; i++) {
      if (aliasMatches(normalized, PA_COMBINED_ALIASES[i], "exact")) {
        matched.push("paCombined");
        break;
      }
    }

    for (i = 0; i < FLEXIBLE_FIELDS.length; i++) {
      field = FLEXIBLE_FIELDS[i];
      aliases = FIELD_ALIASES[field] || [];
      for (var j = 0; j < aliases.length; j++) {
        var mode = aliases[j].length <= 3 ? "exact" : "flexible";
        if (aliasMatches(normalized, aliases[j], mode)) {
          matched.push(field);
          break;
        }
      }
    }

    if (matchNoradrenField(normalized)) matched.push("noradren");

    return matched;
  }

  function fieldsForLabel(normalized) {
    var all = [];
    var variants = labelVariants(normalized);
    var vi;
    var pi;
    for (vi = 0; vi < variants.length; vi++) {
      var parts = fieldsForLabelSingle(variants[vi]);
      for (pi = 0; pi < parts.length; pi++) {
        if (all.indexOf(parts[pi]) === -1) all.push(parts[pi]);
      }
    }
    return all;
  }

  function emptyIndexes() {
    return {
      fr: [],
      spo2: [],
      tax: [],
      pas: [],
      pad: [],
      fc: [],
      hgt: [],
      noradren: [],
      fezes: [],
      urina: [],
      paCombined: [],
      pam: [],
      pesoPre: [],
      pesoPos: [],
      uf: [],
    };
  }

  function cloneDefaultIndexes() {
    var out = emptyIndexes();
    var k;
    for (k in DEFAULT_INDEXES) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_INDEXES, k)) {
        out[k] = DEFAULT_INDEXES[k].slice();
      }
    }
    return out;
  }

  /** @param {Record<string, number>|null} mapa label normalizado (norm) → índice coluna */
  function resolveMonitorColumnIndexes(mapa) {
    if (!mapa) return cloneDefaultIndexes();

    var indexes = emptyIndexes();
    var entries = Object.keys(mapa)
      .map(function (label) {
        return { label: label, idx: mapa[label], normalized: normColLabel(label) };
      })
      .sort(function (a, b) {
        return a.idx - b.idx;
      });

    entries.forEach(function (entry) {
      var fields = fieldsForLabel(entry.normalized);
      fields.forEach(function (field) {
        if (indexes[field].indexOf(entry.idx) === -1) indexes[field].push(entry.idx);
      });
    });

    Object.keys(indexes).forEach(function (k) {
      indexes[k].sort(function (a, b) {
        return a - b;
      });
    });

    return indexes;
  }

  function parseCombinedPA(raw) {
    if (raw === null || raw === undefined) return { pas: null, pad: null };
    var t = String(raw).trim();
    if (!t) return { pas: null, pad: null };
    var m = t.match(/(\d{2,4})\s*[\/xX×\-]\s*(\d{2,4})/);
    if (!m) return { pas: null, pad: null };
    return {
      pas: maybeSanitize("pas", parseInt(m[1], 10)),
      pad: maybeSanitize("pad", parseInt(m[2], 10)),
    };
  }

  function parseBrDecimal(raw) {
    if (raw === null || raw === undefined) return null;
    var t = String(raw).trim();
    if (!t) return null;
    t = t.replace(/\s*(kg|ml)\s*/gi, "").trim();
    var v = parseFloat(t.replace(/\./g, "").replace(",", "."));
    return isNaN(v) ? null : v;
  }

  function parsePesoKg(raw) {
    return parseBrDecimal(raw);
  }

  function parseUfMl(raw) {
    return parseBrDecimal(raw);
  }

  /** Infusão noradrenalina (mL/h); rejeita horário/data e booleanos. */
  function parseNoradrenMl(raw) {
    if (raw === null || raw === undefined) return null;
    var t = String(raw).trim();
    if (!t) return null;
    if (/^(sim|n[aã]o|nao|s|n|positivo|negativo|presente|ausente)$/i.test(t)) return null;
    t = t.replace(/\s*ml\/h\s*/gi, "").trim();
    if (/[\/:]/.test(t)) return null;
    if (/^[\d.,]+$/.test(t)) {
      var v = parseBrDecimal(t);
      return v !== null && v >= 0 ? v : null;
    }
    return null;
  }

  function collectNumericFromColumns(get, indices, parse, field) {
    var vals = [];
    if (!indices || !indices.length) return vals;
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (idx === null || idx === undefined) continue;
      var v = parse(get(idx));
      pushSanitized(vals, field, v);
    }
    return vals;
  }

  function toArray(v) {
    if (v === null || v === undefined) return [];
    return Array.isArray(v) ? v.filter(function (x) {
      return x !== null && x !== undefined;
    }) : [v];
  }

  function normalizeScalarOrArray(vals) {
    if (!vals || !vals.length) return null;
    if (vals.length === 1) return vals[0];
    return vals;
  }

  function flattenNumericField(regs, field) {
    var out = [];
    for (var i = 0; i < regs.length; i++) {
      var v = regs[i][field];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        for (var j = 0; j < v.length; j++) {
          if (v[j] !== null && v[j] !== undefined) out.push(v[j]);
        }
      } else {
        out.push(v);
      }
    }
    return out;
  }

  function minMaxVals(vals) {
    if (!vals || !vals.length) return null;
    return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }

  function fmtKg(val) {
    if (val === null || val === undefined) return "";
    if (Number.isInteger(val) || val === Math.floor(val)) return String(Math.round(val));
    return String(val).replace(".", ",");
  }

  function fmtMlResumo(val) {
    if (val === null || val === undefined) return null;
    return val >= 1000
      ? val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : String(Math.round(val));
  }

  function formatPesoSegment(regs) {
    var pre = flattenNumericField(regs, "pesoPre");
    var pos = flattenNumericField(regs, "pesoPos");
    if (!pre.length && !pos.length) return null;

    var preMM = minMaxVals(pre);
    var posMM = minMaxVals(pos);

    if (preMM && posMM) {
      if (preMM.min === preMM.max && posMM.min === posMM.max) {
        return "Peso " + fmtKg(preMM.min) + " > " + fmtKg(posMM.min) + " kg";
      }
      var preStr = preMM.min === preMM.max
        ? fmtKg(preMM.min)
        : fmtKg(preMM.min) + "-" + fmtKg(preMM.max);
      var posStr = posMM.min === posMM.max
        ? fmtKg(posMM.min)
        : fmtKg(posMM.min) + "-" + fmtKg(posMM.max);
      return "Peso pré " + preStr + " > pós " + posStr + " kg";
    }

    if (preMM) {
      return preMM.min === preMM.max
        ? "Peso pré " + fmtKg(preMM.min) + " kg"
        : "Peso pré " + fmtKg(preMM.min) + "-" + fmtKg(preMM.max) + " kg";
    }

    if (posMM) {
      return posMM.min === posMM.max
        ? "Peso pós " + fmtKg(posMM.min) + " kg"
        : "Peso pós " + fmtKg(posMM.min) + "-" + fmtKg(posMM.max) + " kg";
    }

    return null;
  }

  function formatUfSegment(regs) {
    var vals = flattenNumericField(regs, "uf");
    if (!vals.length) return null;
    var mm = minMaxVals(vals);
    if (!mm) return null;
    if (mm.min === mm.max) return "UF " + fmtMlResumo(mm.min) + " mL";
    return "UF " + fmtMlResumo(mm.min) + "-" + fmtMlResumo(mm.max) + " mL";
  }

  function expandPaPts(regs) {
    var pts = [];
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var pasList = toArray(r.pas);
      var padList = toArray(r.pad);
      if (!pasList.length && !padList.length) continue;
      var n = Math.max(pasList.length, padList.length, 1);
      for (var k = 0; k < n; k++) {
        var pas = pasList[k] !== undefined ? pasList[k] : pasList[0];
        var pad = padList[k] !== undefined ? padList[k] : padList[0];
        if (pas !== null && pas !== undefined) {
          pts.push({ pas: pas, pad: pad !== undefined ? pad : null });
        }
      }
    }
    return pts;
  }

  /** FEAT-304 — pares PA com horário da linha (ordem = ordem dos registos). */
  function expandTimedPaPts(regs, hhmmFn) {
    var pts = [];
    var hhmm = hhmmFn || function (h) {
      return h || "";
    };
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var pasList = toArray(r.pas);
      var padList = toArray(r.pad);
      if (!pasList.length && !padList.length) continue;
      var h = hhmm(r.horario);
      var n = Math.max(pasList.length, padList.length, 1);
      for (var k = 0; k < n; k++) {
        var pas = pasList[k] !== undefined ? pasList[k] : pasList[0];
        var pad = padList[k] !== undefined ? padList[k] : padList[0];
        if (pas !== null && pas !== undefined) {
          pts.push({
            pas: pas,
            pad: pad !== undefined ? pad : null,
            h: h,
          });
        }
      }
    }
    return pts;
  }

  function expandTimedPts(regs, field, hhmmFn) {
    var pts = [];
    var hhmm = hhmmFn || function (h) {
      return h || "";
    };
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var vals = toArray(r[field]);
      var h = hhmm(r.horario);
      for (var j = 0; j < vals.length; j++) {
        if (vals[j] !== null && vals[j] !== undefined) pts.push({ val: vals[j], h: h });
      }
    }
    return pts;
  }

  function mergePasPadFromRow(get, indexes, parseBR) {
    var pasVals = collectNumericFromColumns(get, indexes.pas, parseBR, "pas");
    var padVals = collectNumericFromColumns(get, indexes.pad, parseBR, "pad");
    var paCols = indexes.paCombined || [];
    for (var i = 0; i < paCols.length; i++) {
      var parsed = parseCombinedPA(get(paCols[i]));
      if (parsed.pas !== null) pasVals.push(parsed.pas);
      if (parsed.pad !== null) padVals.push(parsed.pad);
    }
    return {
      pas: normalizeScalarOrArray(pasVals),
      pad: normalizeScalarOrArray(padVals),
    };
  }

  function collectTextFromColumns(get, indices) {
    var texts = [];
    if (!indices || !indices.length) return texts;
    for (var i = 0; i < indices.length; i++) {
      var t = get(indices[i]);
      if (t && String(t).trim()) texts.push(String(t).trim());
    }
    return texts;
  }

  return {
    normColLabel: normColLabel,
    stripHdAffix: stripHdAffix,
    resolveMonitorColumnIndexes: resolveMonitorColumnIndexes,
    parseCombinedPA: parseCombinedPA,
    parsePesoKg: parsePesoKg,
    parseUfMl: parseUfMl,
    parseNoradrenMl: parseNoradrenMl,
    collectNumericFromColumns: collectNumericFromColumns,
    flattenNumericField: flattenNumericField,
    expandPaPts: expandPaPts,
    expandTimedPaPts: expandTimedPaPts,
    expandTimedPts: expandTimedPts,
    mergePasPadFromRow: mergePasPadFromRow,
    collectTextFromColumns: collectTextFromColumns,
    normalizeScalarOrArray: normalizeScalarOrArray,
    formatPesoSegment: formatPesoSegment,
    formatUfSegment: formatUfSegment,
    DEFAULT_INDEXES: DEFAULT_INDEXES,
  };
});
