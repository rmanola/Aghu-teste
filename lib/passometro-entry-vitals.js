/**
 * Vitais do passômetro/controles por calculadora.
 * @sync web/lib/patient-records/passometro-entry-vitals.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuPassometroEntryVitals = api;
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

  var vitalsParse = loadMod(root, "passometro-vitals-parse.js", "AghuPassometroVitalsParse");
  var news2Pick = loadMod(root, "news2-vitals-pick.js", "AghuNews2VitalsPick");
  var resolveMod = loadMod(root, "controles-vitals-resolve.js", "AghuControlesVitalsResolve");

  var getVitalsFromControles =
    resolveMod && resolveMod.getVitalsFromControles ? resolveMod.getVitalsFromControles : null;
  var mergeVitalsWithPassometroTouched =
    resolveMod && resolveMod.mergeVitalsWithPassometroTouched
      ? resolveMod.mergeVitalsWithPassometroTouched
      : null;
  var findPassometroEntryForContext =
    resolveMod && resolveMod.findPassometroEntryForContext
      ? resolveMod.findPassometroEntryForContext
      : null;
  var brDateToIso = resolveMod && resolveMod.brDateToIso ? resolveMod.brDateToIso : function () {
    return null;
  };

  function parsePassometroEntry(entry) {
    if (vitalsParse && vitalsParse.parsePassometroEntry) return vitalsParse.parsePassometroEntry(entry);
    return { fcBpm: null, frIrpm: null, spo2Pct: null, pas: null, tempC: null };
  }

  function parsePaString(pa) {
    if (vitalsParse && vitalsParse.parsePaString) return vitalsParse.parsePaString(pa);
    return { pas: null, pad: null };
  }

  function parseRangeMax(raw) {
    if (vitalsParse && vitalsParse.parseRangeMax) return vitalsParse.parseRangeMax(raw);
    return null;
  }

  function getVitalsForEntry(entry) {
    return parsePassometroEntry(entry);
  }

  function getVitalsForQsofaEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return { fcBpm: null, frIrpm: null, spo2Pct: null, pas: null, tempC: null };
    }
    var pa = parsePaString(String(entry.pa || ""));
    var base = parsePassometroEntry(entry);
    var frMax = parseRangeMax(String(entry.fr || ""));
    return Object.assign({}, base, {
      frIrpm: frMax != null ? frMax : base.frIrpm,
      pas: pa.pas,
    });
  }

  function getVitalsForCurb65Entry(entry) {
    return getVitalsForQsofaEntry(entry);
  }

  function getVitalsForNews2Entry(entry) {
    if (news2Pick && news2Pick.parsePassometroEntryForNews2) {
      return news2Pick.parsePassometroEntryForNews2(entry);
    }
    if (vitalsParse && vitalsParse.parsePassometroEntryForNews2) {
      return vitalsParse.parsePassometroEntryForNews2(entry);
    }
    return getVitalsForEntry(entry);
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

  function labelFromParsed(parsed) {
    var parts = [];
    if (parsed.data) parts.push(parsed.data);
    if (parsed.po) parts.push(parsed.po);
    return parts.length ? parts.join(" · ") : "última entrada";
  }

  function getLatestVitalsWithParse(passometro, controles, parseFn, opts) {
    opts = opts || {};
    var preferDataISO = opts.preferDataISO != null ? opts.preferDataISO : null;
    var explicitEntry = opts.entry != null ? opts.entry : null;

    var vitals =
      getVitalsFromControles != null
        ? getVitalsFromControles(controles, parseFn, { preferDataISO: preferDataISO })
        : null;

    var passometroEntry = explicitEntry;
    if (!passometroEntry && findPassometroEntryForContext) {
      var matchISO =
        preferDataISO || (vitals && vitals.data ? brDateToIso(String(vitals.data)) : null);
      if (matchISO) passometroEntry = findPassometroEntryForContext(passometro, matchISO);
    }

    if (passometroEntry && mergeVitalsWithPassometroTouched) {
      vitals = mergeVitalsWithPassometroTouched(vitals, passometroEntry, parseFn);
    }

    if (vitals && entryHasVitals(vitals)) return vitals;

    if (passometroEntry) {
      var parsed = parseFn(passometroEntry);
      var base = parsePassometroEntry(passometroEntry);
      if (entryHasVitals(parsed)) {
        return Object.assign({}, base, parsed, {
          dataLabel: labelFromParsed(base),
          source: "passometro",
        });
      }
    }

    var entries = passometro && passometro.entries ? passometro.entries : null;
    if (Array.isArray(entries) && entries.length > 0) {
      for (var i = entries.length - 1; i >= 0; i--) {
        var raw = entries[i];
        var parsedRow = parseFn(raw);
        var baseRow = parsePassometroEntry(raw);
        if (entryHasVitals(parsedRow)) {
          return Object.assign({}, baseRow, parsedRow, {
            dataLabel: labelFromParsed(baseRow),
            source: "passometro",
          });
        }
      }
    }

    return null;
  }

  function getLatestVitalsForQsofa(passometro, controles, opts) {
    return getLatestVitalsWithParse(passometro, controles, getVitalsForQsofaEntry, opts);
  }

  function getLatestVitalsForCurb65(passometro, controles, opts) {
    return getLatestVitalsWithParse(passometro, controles, getVitalsForCurb65Entry, opts);
  }

  function getLatestVitalsForNews2(passometro, controles, opts) {
    return getLatestVitalsWithParse(passometro, controles, getVitalsForNews2Entry, opts);
  }

  return {
    getVitalsForEntry: getVitalsForEntry,
    getVitalsForQsofaEntry: getVitalsForQsofaEntry,
    getVitalsForCurb65Entry: getVitalsForCurb65Entry,
    getVitalsForNews2Entry: getVitalsForNews2Entry,
    getLatestVitalsForQsofa: getLatestVitalsForQsofa,
    getLatestVitalsForCurb65: getLatestVitalsForCurb65,
    getLatestVitalsForNews2: getLatestVitalsForNews2,
  };
});
