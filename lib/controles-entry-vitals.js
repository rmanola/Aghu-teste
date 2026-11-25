/**
 * Vitals numéricos persistidos em controles.entries[] — parse na fronteira (save/sync).
 * Testável em Node; extensão: global AghuControlesEntryVitals.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesEntryVitals = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadAutofill() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-autofill.js");
      } catch (_e) {}
    }
    return root.AghuPassometroAutofill || null;
  }

  function loadParsePtNumber() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./parse-locale-number.js").parsePtNumber;
      } catch (_e) {}
    }
    if (root.AghuParseLocaleNumber && root.AghuParseLocaleNumber.parsePtNumber) {
      return root.AghuParseLocaleNumber.parsePtNumber;
    }
    return function (s) {
      var n = parseFloat(String(s || "").replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };
  }

  var autofill = loadAutofill();
  var parseControlesTexto =
    autofill && autofill.parseControlesTexto
      ? autofill.parseControlesTexto
      : function () {
          return {};
        };
  var parsePeriodoDate =
    autofill && autofill.parsePeriodoDate
      ? autofill.parsePeriodoDate
      : function () {
          return "";
        };
  var parsePtNumber = loadParsePtNumber();

  function loadSanitize() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./controles-vital-sanitize.js");
      } catch (_e) {}
    }
    if (root.AghuControlesVitalSanitize) {
      return root.AghuControlesVitalSanitize;
    }
    return null;
  }

  var sanitizeApi = loadSanitize();

  var CONTROLES_VITALS_PARSE_VERSION = 2;

  var VITALS_STRIP_KEYS = ["data", "po", "source", "_textDigest"];

  function parseRangeOrNumber(raw) {
    var t = String(raw || "").trim();
    if (!t) return null;
    var range = t.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    if (range) {
      var a = parsePtNumber(range[1]);
      var b = parsePtNumber(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }
    var n = parsePtNumber(t);
    return Number.isFinite(n) ? n : null;
  }

  function parseRangeEndpoints(raw, field) {
    var t = String(raw || "").trim();
    if (!t) return [];
    if (field && sanitizeApi && sanitizeApi.sanitizeVitalEndpoints) {
      var sanitized = sanitizeApi.sanitizeVitalEndpoints(t, field);
      var ends = [];
      if (sanitized.min != null) ends.push(sanitized.min);
      if (sanitized.max != null && sanitized.max !== sanitized.min) ends.push(sanitized.max);
      return ends;
    }
    var range = t.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    if (range) {
      var a = parsePtNumber(range[1]);
      var b = parsePtNumber(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
      return [];
    }
    var n = parsePtNumber(t);
    return Number.isFinite(n) ? [n] : [];
  }

  function parseVitalEndpoints(raw, field) {
    var ends = parseRangeEndpoints(raw, field);
    if (!ends.length) return { min: null, max: null, mid: null };
    var min = Math.min.apply(null, ends);
    var max = Math.max.apply(null, ends);
    return { min: min, max: max, mid: min === max ? min : (min + max) / 2 };
  }

  function parsePaString(raw) {
    var t = String(raw || "").trim();
    if (!t) return { pas: null, pad: null };
    var pairs = [];
    var re = /(\d+)\s*[xX/]\s*(\d+)/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var pas = parseInt(m[1], 10);
      var pad = parseInt(m[2], 10);
      if (sanitizeApi && sanitizeApi.sanitizeMonitorVital) {
        pas = sanitizeApi.sanitizeMonitorVital("pas", pas);
        pad = sanitizeApi.sanitizeMonitorVital("pad", pad);
      }
      if (pas != null && pad != null) pairs.push({ pas: pas, pad: pad });
    }
    if (!pairs.length) return { pas: null, pad: null };
    var minPair = pairs.reduce(function (a, b) {
      return b.pas < a.pas ? b : a;
    });
    return { pas: minPair.pas, pad: minPair.pad };
  }

  function parsePaRange(raw) {
    var t = String(raw || "").trim();
    var pairs = [];
    var re = /(\d+)\s*[xX/]\s*(\d+)/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var pas = parseInt(m[1], 10);
      var pad = parseInt(m[2], 10);
      if (sanitizeApi && sanitizeApi.sanitizeMonitorVital) {
        pas = sanitizeApi.sanitizeMonitorVital("pas", pas);
        pad = sanitizeApi.sanitizeMonitorVital("pad", pad);
      }
      if (pas != null && pad != null) pairs.push({ pas: pas, pad: pad });
    }
    if (!pairs.length) {
      return { pasMin: null, pasMax: null, padMin: null, padMax: null };
    }
    var minPair = pairs.reduce(function (a, b) {
      return b.pas < a.pas ? b : a;
    });
    var maxPair = pairs.reduce(function (a, b) {
      return b.pas > a.pas ? b : a;
    });
    return {
      pasMin: minPair.pas,
      pasMax: maxPair.pas,
      padMin: minPair.pad,
      padMax: maxPair.pad,
    };
  }

  function parseHgtEndpoints(raw) {
    var t = String(raw || "").trim();
    if (!t) return { min: null, max: null, mid: null };
    var nums = [];
    var valueRe = /([\d.,]+)\s*(?:\(\d{1,2}:\d{2}\))?/g;
    var m;
    while ((m = valueRe.exec(t)) !== null) {
      var n = parsePtNumber(m[1]);
      if (sanitizeApi && sanitizeApi.sanitizeMonitorVital) {
        n = sanitizeApi.sanitizeMonitorVital("hgt", n);
      }
      if (Number.isFinite(n)) nums.push(n);
    }
    if (!nums.length) {
      var rangeMatch = t.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
      if (rangeMatch) {
        return parseVitalEndpoints(rangeMatch[1] + "-" + rangeMatch[2], "hgt");
      }
      return { min: null, max: null, mid: null };
    }
    var min = Math.min.apply(null, nums);
    var max = Math.max.apply(null, nums);
    return { min: min, max: max, mid: (min + max) / 2 };
  }

  function parseNoraEndpoints(raw) {
    var t = String(raw || "").trim();
    if (!t) return { min: null, max: null, mid: null };
    var arrow = t.match(/^([\d.,]+)\s*->\s*([\d.,]+)$/);
    if (arrow) {
      var a = parsePtNumber(arrow[1]);
      var b = parsePtNumber(arrow[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        var min = Math.min(a, b);
        var max = Math.max(a, b);
        return { min: min, max: max, mid: (min + max) / 2 };
      }
    }
    return parseVitalEndpoints(t);
  }

  function parseDiuresis(raw) {
    var t = String(raw || "").trim();
    if (!t) return { diuresisMl: null, qualitative: null };
    if (/^presente$/i.test(t)) return { diuresisMl: null, qualitative: "presente" };
    var m = t.match(/([\d.,]+)\s*mL/i) || t.match(/^([\d.,]+)$/);
    if (m) {
      var n = parsePtNumber(m[1]);
      if (Number.isFinite(n)) return { diuresisMl: n, qualitative: null };
    }
    var n2 = parsePtNumber(t);
    if (Number.isFinite(n2)) return { diuresisMl: n2, qualitative: null };
    return { diuresisMl: null, qualitative: t || null };
  }

  function parseBalanceMl(raw) {
    var t = String(raw || "").trim();
    if (!t) return null;
    var m = t.match(/^([+-]?[\d.,]+)\s*mL?/i) || t.match(/^([+-]?[\d.,]+)/);
    if (!m) return null;
    var n = parsePtNumber(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function emptyVitalRangeFields() {
    return {
      fcMin: null,
      fcMax: null,
      frMin: null,
      frMax: null,
      spo2Min: null,
      spo2Max: null,
      tempMin: null,
      tempMax: null,
      hgtMin: null,
      hgtMax: null,
      pasMin: null,
      pasMax: null,
      padMin: null,
      padMax: null,
      noradrenMin: null,
      noradrenMax: null,
      pesoPreMin: null,
      pesoPreMax: null,
      pesoPosMin: null,
      pesoPosMax: null,
      ufMin: null,
      ufMax: null,
    };
  }

  function parsePassometroEntryFromRaw(entry) {
    if (!entry || typeof entry !== "object") {
      return Object.assign(
        {
          fcBpm: null,
          frIrpm: null,
          spo2Pct: null,
          pas: null,
          pad: null,
          tempC: null,
          hgtMgDl: null,
          diuresisMl: null,
          diuresisQualitative: null,
          balanceMl: null,
        },
        emptyVitalRangeFields(),
      );
    }
    var pa = parsePaString(entry.pa);
    var paRange = parsePaRange(entry.pa);
    var diu = parseDiuresis(entry.diurese);
    var fc = parseVitalEndpoints(entry.fc, "fc");
    var fr = parseVitalEndpoints(entry.fr, "fr");
    var spo2 = parseVitalEndpoints(entry.sato2, "spo2");
    var tax = parseVitalEndpoints(entry.tax, "tax");
    var hgt = parseHgtEndpoints(entry.hgt);
    var nora = parseNoraEndpoints(entry.noradren || entry.nora);
    var pesoPre = parseVitalEndpoints(entry.pesoPre);
    var pesoPos = parseVitalEndpoints(entry.pesoPos);
    var uf = parseVitalEndpoints(entry.uf);

    return {
      fcBpm: fc.mid,
      frIrpm: fr.mid,
      spo2Pct: spo2.mid,
      pas: pa.pas,
      pad: pa.pad,
      tempC: tax.mid,
      hgtMgDl: hgt.mid,
      diuresisMl: diu.diuresisMl,
      diuresisQualitative: diu.qualitative,
      balanceMl: parseBalanceMl(entry.bh),
      fcMin: fc.min,
      fcMax: fc.max,
      frMin: fr.min,
      frMax: fr.max,
      spo2Min: spo2.min,
      spo2Max: spo2.max,
      tempMin: tax.min,
      tempMax: tax.max,
      hgtMin: hgt.min,
      hgtMax: hgt.max,
      pasMin: paRange.pasMin,
      pasMax: paRange.pasMax,
      padMin: paRange.padMin,
      padMax: paRange.padMax,
      noradrenMin: nora.min,
      noradrenMax: nora.max,
      pesoPreMin: pesoPre.min,
      pesoPreMax: pesoPre.max,
      pesoPosMin: pesoPos.min,
      pesoPosMax: pesoPos.max,
      ufMin: uf.min,
      ufMax: uf.max,
    };
  }

  function textDigest(texto) {
    return String(texto || "").trim();
  }

  function hasNumericVitals(vitals) {
    if (!vitals || typeof vitals !== "object") return false;
    var keys = [
      "fcBpm",
      "frIrpm",
      "spo2Pct",
      "pas",
      "pad",
      "tempC",
      "hgtMgDl",
      "diuresisMl",
      "balanceMl",
      "noradrenMin",
      "noradrenMax",
      "ufMin",
      "ufMax",
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = vitals[keys[i]];
      if (v != null && Number.isFinite(v)) return true;
    }
    if (vitals.diuresisQualitative) return true;
    return false;
  }

  function rawFromControlesTexto(texto) {
    var parsed = parseControlesTexto(texto);
    return {
      fr: parsed.fr,
      sato2: parsed.sato2,
      tax: parsed.tax,
      pa: parsed.pa,
      fc: parsed.fc,
      hgt: parsed.hgt,
      diurese: parsed.diurese,
      bh: parsed.bh,
      noradren: parsed.noradren,
      uf: parsed.uf,
      pesoPre: parsed.pesoPre,
      pesoPos: parsed.pesoPos,
    };
  }

  /**
   * @param {string} texto
   * @returns {object|null}
   */
  function buildControlesEntryVitals(texto) {
    var digest = textDigest(texto);
    if (!digest) return null;
    var numeric = parsePassometroEntryFromRaw(rawFromControlesTexto(digest));
    if (!hasNumericVitals(numeric)) return null;
    return Object.assign({}, numeric, {
      parseVersion: CONTROLES_VITALS_PARSE_VERSION,
      _textDigest: digest,
    });
  }

  function vitalsAreCurrent(entry) {
    if (!entry || !entry.vitals || typeof entry.vitals !== "object") return false;
    if (entry.vitals.parseVersion !== CONTROLES_VITALS_PARSE_VERSION) return false;
    return entry.vitals._textDigest === textDigest(entry.texto);
  }

  /**
   * @param {object|null|undefined} entry
   * @returns {object}
   */
  function enrichControlesEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return {
        id: "",
        texto: "",
        periodo: "",
        n: 0,
        extractedAt: Date.now(),
        vitals: null,
      };
    }
    var base = {
      id: entry.id || "",
      texto: entry.texto || "",
      periodo: entry.periodo || "",
      n: typeof entry.n === "number" ? entry.n : parseInt(String(entry.n || "0"), 10) || 0,
      extractedAt:
        typeof entry.extractedAt === "number" ? entry.extractedAt : Date.now(),
    };
    if (vitalsAreCurrent(entry)) {
      return Object.assign({}, base, { vitals: entry.vitals });
    }
    if (sanitizeApi && sanitizeApi.sanitizeControlesTexto) {
      var sanitizedTexto = sanitizeApi.sanitizeControlesTexto(base.texto);
      if (sanitizedTexto !== base.texto) {
        base = Object.assign({}, base, { texto: sanitizedTexto });
      }
    }
    var vitals = buildControlesEntryVitals(base.texto);
    return Object.assign({}, base, { vitals: vitals });
  }

  function resolveControlesEntryData(entry) {
    return (
      parsePeriodoDate(String(entry.periodo || "")) ||
      String(entry.periodo || "").split(/\s+/)[0] ||
      (entry.extractedAt
        ? new Date(entry.extractedAt).toLocaleDateString("pt-BR")
        : "")
    );
  }

  function seriesFromPersistedVitals(entry, vitals) {
    return Object.assign({}, vitals, {
      data: resolveControlesEntryData(entry),
      po: "",
      source: "controles",
    });
  }

  function seriesFromTexto(entry, texto) {
    var data = resolveControlesEntryData(entry);
    var parsed = parsePassometroEntryFromRaw(
      Object.assign({ data: data }, rawFromControlesTexto(texto)),
    );
    return Object.assign({}, parsed, {
      data: data,
      po: "",
      source: "controles",
    });
  }

  /**
   * @param {object} entry
   * @returns {object|null}
   */
  function vitalsFromControlesEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    var texto = String(entry.texto || "");
    if (!texto.trim()) return null;
    if (vitalsAreCurrent(entry) && entry.vitals) {
      return seriesFromPersistedVitals(entry, entry.vitals);
    }
    return seriesFromTexto(entry, texto);
  }

  function stripVitalsForPersist(vitals) {
    if (!vitals || typeof vitals !== "object") return null;
    var out = {};
    var keys = Object.keys(vitals);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (VITALS_STRIP_KEYS.indexOf(k) >= 0) continue;
      out[k] = vitals[k];
    }
    return out;
  }

  return {
    CONTROLES_VITALS_PARSE_VERSION: CONTROLES_VITALS_PARSE_VERSION,
    buildControlesEntryVitals: buildControlesEntryVitals,
    enrichControlesEntry: enrichControlesEntry,
    vitalsFromControlesEntry: vitalsFromControlesEntry,
    vitalsAreCurrent: vitalsAreCurrent,
    hasNumericVitals: hasNumericVitals,
    stripVitalsForPersist: stripVitalsForPersist,
    parsePassometroEntryFromRaw: parsePassometroEntryFromRaw,
    rawFromControlesTexto: rawFromControlesTexto,
  };
});
