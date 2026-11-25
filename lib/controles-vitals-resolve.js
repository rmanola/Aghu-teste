/**
 * Resolve vitais de controles + merge vitalsTouched (extensão).
 * @sync web/lib/patient-records/controles-vitals-resolve.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuControlesVitalsResolve = api;
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

  var autofill = loadMod(root, "passometro-autofill.js", "AghuPassometroAutofill");
  var vitalsParse = loadMod(root, "passometro-vitals-parse.js", "AghuPassometroVitalsParse");
  var controlesEntryVitals = loadMod(
    root,
    "controles-entry-vitals.js",
    "AghuControlesEntryVitals",
  );

  var parseControlesTexto =
    autofill && autofill.parseControlesTexto ? autofill.parseControlesTexto : function () {
      return {};
    };
  var parsePeriodoDate =
    autofill && autofill.parsePeriodoDate ? autofill.parsePeriodoDate : function () {
      return "";
    };
  var isUsableControlesEntry =
    autofill && autofill.isUsableControlesEntry
      ? autofill.isUsableControlesEntry
      : function () {
          return true;
        };

  function parsePassometroEntry(entry) {
    if (vitalsParse && vitalsParse.parsePassometroEntry) {
      return vitalsParse.parsePassometroEntry(entry);
    }
    return { data: "", po: "", fcBpm: null, frIrpm: null, spo2Pct: null, pas: null, tempC: null };
  }

  function parseControlesPeriodoSortMs(periodo) {
    var p = String(periodo != null ? periodo : "").trim();
    if (!p) return null;
    var canon = p.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (canon) {
      return new Date(
        parseInt(canon[3], 10),
        parseInt(canon[2], 10) - 1,
        parseInt(canon[1], 10),
        parseInt(canon[4], 10),
        parseInt(canon[5], 10),
        0,
        0,
      ).getTime();
    }
    var m = p.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return null;
    var y = parseInt(m[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10), 0, 0, 0, 0).getTime();
  }

  function compareAsc(a, b) {
    var wa = parseControlesPeriodoSortMs(a.periodo);
    var wb = parseControlesPeriodoSortMs(b.periodo);
    if (wa != null && wb != null && wa !== wb) return wa - wb;
    if (wa != null && wb == null) return -1;
    if (wa == null && wb != null) return 1;
    return (a.extractedAt || 0) - (b.extractedAt || 0);
  }

  function compareDesc(a, b) {
    return -compareAsc(a, b);
  }

  function normalizeControles(raw) {
    if (!raw || typeof raw !== "object") return { entries: [] };
    var obj = raw;
    if (!Array.isArray(obj.entries)) {
      if (obj.texto != null || obj.periodo != null) {
        return {
          entries: [
            {
              id: "legacy",
              texto: String(obj.texto || ""),
              periodo: String(obj.periodo || ""),
              n: typeof obj.n === "number" ? obj.n : 0,
              extractedAt: typeof obj.extractedAt === "number" ? obj.extractedAt : 0,
            },
          ],
        };
      }
      return { entries: [] };
    }
    var entries = obj.entries
      .filter(function (e) {
        return e && typeof e === "object";
      })
      .map(function (e) {
        return {
          id: String(e.id || ""),
          texto: String(e.texto || ""),
          periodo: String(e.periodo || ""),
          n: typeof e.n === "number" ? e.n : 0,
          extractedAt: typeof e.extractedAt === "number" ? e.extractedAt : 0,
        };
      });
    var byKey = new Map();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var key = e.periodo ? "p:" + e.periodo : "id:" + e.id;
      var prev = byKey.get(key);
      if (!prev || (e.extractedAt || 0) >= (prev.extractedAt || 0)) byKey.set(key, e);
    }
    return { entries: Array.from(byKey.values()).sort(compareDesc) };
  }

  function isoToBrDate(iso) {
    var m = String(iso != null ? iso : "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function brDateToIso(br) {
    var m = String(br != null ? br : "")
      .trim()
      .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return m[3] + "-" + m[2] + "-" + m[1];
  }

  function controlesEntryMatchesDate(ce, dataISO) {
    var targetBr = isoToBrDate(dataISO);
    if (!targetBr) return false;
    return parsePeriodoDate(String(ce.periodo || "")) === targetBr;
  }

  function resolveControlesEntryForDate(controles, dataISO) {
    var normalized = normalizeControles(controles);
    if (!dataISO) return normalized.entries[0] || null;
    for (var i = 0; i < normalized.entries.length; i++) {
      var ce = normalized.entries[i];
      if (controlesEntryMatchesDate(ce, dataISO) && isUsableControlesEntry(ce)) return ce;
    }
    return null;
  }

  function entryHasVitals(vitals) {
    return (
      vitals.fcBpm != null ||
      vitals.frIrpm != null ||
      vitals.spo2Pct != null ||
      vitals.pas != null ||
      vitals.tempC != null
    );
  }

  function vitalsFromControlesEntry(ce, parseFn) {
    var texto = String(ce.texto || "");
    if (!texto.trim()) return null;

    var persisted =
      controlesEntryVitals && controlesEntryVitals.vitalsFromControlesEntry
        ? controlesEntryVitals.vitalsFromControlesEntry(ce)
        : null;

    if (!persisted) return null;

    var data =
      persisted.data ||
      parsePeriodoDate(String(ce.periodo || "")) ||
      String(ce.periodo || "").split(/\s+/)[0] ||
      "";

    if (!parseFn) {
      return Object.assign({}, persisted, {
        dataLabel: data || "última entrada",
        source: "controles",
      });
    }

    var fields = parseControlesTexto(texto);
    var raw = {
      data: data,
      fr: fields.fr,
      sato2: fields.sato2,
      pa: fields.pa,
      fc: fields.fc,
      tax: fields.tax,
    };
    var parsed = parseFn(raw);
    var base = parsePassometroEntry(raw);
    return Object.assign({}, persisted, base, parsed, {
      dataLabel: data || "última entrada",
      source: "controles",
    });
  }

  function getVitalsFromControles(controles, parseFn, opts) {
    opts = opts || {};
    var preferDataISO = opts.preferDataISO != null ? opts.preferDataISO : null;
    var normalized = normalizeControles(controles);
    if (!normalized.entries.length) return null;
    if (preferDataISO) {
      var ce = resolveControlesEntryForDate(controles, preferDataISO);
      if (!ce) return null;
      var v = vitalsFromControlesEntry(ce, parseFn);
      return v && entryHasVitals(v) ? v : null;
    }
    for (var i = 0; i < normalized.entries.length; i++) {
      var row = normalized.entries[i];
      if (!isUsableControlesEntry(row)) continue;
      var vitals = vitalsFromControlesEntry(row, parseFn);
      if (vitals && entryHasVitals(vitals)) return vitals;
    }
    return null;
  }

  var TOUCHED_TO_PARSED = {
    fc: ["fcBpm", "fcMin", "fcMax"],
    fr: ["frIrpm", "frMin", "frMax"],
    sato2: ["spo2Pct", "spo2Min", "spo2Max"],
    tax: ["tempC", "tempMin", "tempMax"],
    pa: ["pas", "pad", "pasMin", "pasMax", "padMin", "padMax"],
  };

  function mergeVitalsWithPassometroTouched(base, passometroEntry, parseFn) {
    if (!passometroEntry || typeof passometroEntry !== "object") return base;
    var touched = passometroEntry.vitalsTouched;
    if (!touched || typeof touched !== "object") return base;
    var entryParsed = parseFn(passometroEntry);
    var entryBase = parsePassometroEntry(passometroEntry);
    var merged = Object.assign({}, base || entryBase, base ? {} : entryParsed);
    for (var key in touched) {
      if (!touched[key]) continue;
      var parsedKeys = TOUCHED_TO_PARSED[key];
      if (!parsedKeys) continue;
      for (var j = 0; j < parsedKeys.length; j++) {
        var pk = parsedKeys[j];
        var val = entryParsed[pk] != null ? entryParsed[pk] : entryBase[pk];
        if (val != null) merged[pk] = val;
      }
    }
    merged.dataLabel =
      (base && base.dataLabel) ||
      [entryBase.data, entryBase.po].filter(Boolean).join(" · ") ||
      "última entrada";
    merged.source = (base && base.source) || "passometro";
    return merged;
  }

  function findPassometroEntryForContext(passometro, preferDataISO) {
    var entries = passometro && passometro.entries ? passometro.entries : null;
    if (!Array.isArray(entries) || !entries.length) return null;
    if (preferDataISO) {
      var targetBr = isoToBrDate(preferDataISO);
      for (var i = 0; i < entries.length; i++) {
        var row = entries[i];
        if (!row || typeof row !== "object") continue;
        var dataBr = parsePeriodoDate(String(row.data || "")) || String(row.data || "").trim();
        if (dataBr === targetBr) return row;
      }
      return null;
    }
    for (var k = entries.length - 1; k >= 0; k--) {
      if (entries[k] && typeof entries[k] === "object") return entries[k];
    }
    return null;
  }

  return {
    getVitalsFromControles: getVitalsFromControles,
    mergeVitalsWithPassometroTouched: mergeVitalsWithPassometroTouched,
    findPassometroEntryForContext: findPassometroEntryForContext,
    brDateToIso: brDateToIso,
    isoToBrDate: isoToBrDate,
    normalizeControles: normalizeControles,
  };
});
