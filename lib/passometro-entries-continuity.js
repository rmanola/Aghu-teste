/**
 * Garante entradas diárias contínuas do DIH (ou data inferida) até hoje.
 * Testável em Node via module.exports; extensão: global AghuPassometroEntriesContinuity.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroEntriesContinuity = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroSchema) {
      return globalThis.AghuPassometroSchema;
    }
    return null;
  }

  function getEntriesOrder() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-order.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroEntriesOrder
    ) {
      return globalThis.AghuPassometroEntriesOrder;
    }
    return null;
  }

  function getAutofill() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-autofill.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroAutofill) {
      return globalThis.AghuPassometroAutofill;
    }
    return null;
  }

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuDateBr) {
      return globalThis.AghuDateBr;
    }
    return null;
  }

  function parseEntryDateMs(data) {
    var order = getEntriesOrder();
    if (order && order.parseEntryDateMs) return order.parseEntryDateMs(data);
    return Infinity;
  }

  function parseFirstBrDate(text) {
    var order = getEntriesOrder();
    if (order && order.parseFirstBrDate) return order.parseFirstBrDate(text);
    return str(text).trim();
  }

  function localTodayBr() {
    var db = getDateBr();
    if (db && db.localTodayBr) return db.localTodayBr();
    var t = new Date();
    return (
      String(t.getDate()).padStart(2, "0") +
      "/" +
      String(t.getMonth() + 1).padStart(2, "0") +
      "/" +
      t.getFullYear()
    );
  }

  /**
   * @param {number} ms
   * @returns {string} DD/MM/AAAA
   */
  function msToBrDate(ms) {
    var d = new Date(ms);
    return (
      String(d.getDate()).padStart(2, "0") +
      "/" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "/" +
      d.getFullYear()
    );
  }

  function msToLocalDate(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function controlEntryDateMs(ce, parsePeriodoDate) {
    if (!ce || typeof ce !== "object") return null;
    var fromPeriodo =
      parsePeriodoDate && ce.periodo ? parsePeriodoDate(ce.periodo) : "";
    var key = fromPeriodo || parseFirstBrDate(ce.data || "");
    if (!key) return null;
    var ms = parseEntryDateMs(key);
    if (!Number.isFinite(ms) || ms === Infinity) return null;
    return ms;
  }

  function earliestControlesMs(controles) {
    if (!controles || !Array.isArray(controles.entries)) return null;
    var autofill = getAutofill();
    var parsePeriodoDate =
      autofill && autofill.parsePeriodoDate
        ? autofill.parsePeriodoDate
        : function (p) {
            return parseFirstBrDate(p);
          };
    var min = null;
    for (var i = 0; i < controles.entries.length; i++) {
      var ms = controlEntryDateMs(controles.entries[i], parsePeriodoDate);
      if (ms === null) continue;
      if (min === null || ms < min) min = ms;
    }
    return min;
  }

  /**
   * @param {object} header
   * @param {object[]} entries
   * @param {{ controles?: object } | undefined} opts
   * @returns {number | null}
   */
  function resolveRangeStart(header, entries, opts) {
    opts = opts || {};
    var dih = str(header && header.dih).trim();
    if (dih) {
      var dihMs = parseEntryDateMs(dih);
      if (Number.isFinite(dihMs) && dihMs !== Infinity) return dihMs;
    }

    var min = null;
    var list = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < list.length; i++) {
      var key = parseFirstBrDate(list[i] && list[i].data);
      if (!key) continue;
      var ms = parseEntryDateMs(key);
      if (!Number.isFinite(ms) || ms === Infinity) continue;
      if (min === null || ms < min) min = ms;
    }

    var ctlMs = earliestControlesMs(opts.controles);
    if (ctlMs !== null && (min === null || ctlMs < min)) min = ctlMs;

    return min;
  }

  /**
   * @param {object | null | undefined} snap
   * @param {{ endDate?: string, endDateMs?: number, controles?: object } | undefined} opts
   * @returns {object}
   */
  function ensureEntriesFromDihToToday(snap, opts) {
    opts = opts || {};
    if (!snap || typeof snap !== "object") return snap;

    var schema = getSchema();
    if (!schema || !schema.emptyEntry) return snap;

    var header = snap.header || {};
    var entries = Array.isArray(snap.entries) ? snap.entries.slice() : [];

    var startMs = resolveRangeStart(header, entries, opts);
    if (startMs === null) return snap;

    var endMs = opts.endDateMs;
    if (endMs == null) {
      var endBr = opts.endDate || localTodayBr();
      endMs = parseEntryDateMs(endBr);
    }
    if (!Number.isFinite(endMs) || endMs === Infinity) return snap;
    if (startMs > endMs) return snap;

    var existingByDate = Object.create(null);
    for (var ei = 0; ei < entries.length; ei++) {
      var dk = parseFirstBrDate(entries[ei] && entries[ei].data);
      if (dk) existingByDate[dk] = true;
    }

    var cursor = msToLocalDate(startMs);
    var end = msToLocalDate(endMs);

    while (cursor.getTime() <= end.getTime()) {
      var br = msToBrDate(cursor.getTime());
      if (!existingByDate[br]) {
        var entry = schema.emptyEntry();
        entry.data = br;
        entries.push(entry);
        existingByDate[br] = true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return Object.assign({}, snap, { entries: entries });
  }

  return {
    resolveRangeStart: resolveRangeStart,
    msToBrDate: msToBrDate,
    ensureEntriesFromDihToToday: ensureEntriesFromDihToToday,
  };
});
