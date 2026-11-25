/**
 * Ordenação cronológica de entradas diárias do passômetro (ascendente por data).
 * Rótulo "Dia N" com D0 no DIH: ver passometro-internacao.js.
 * Testável em Node via module.exports; extensão: global AghuPassometroEntriesOrder.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroEntriesOrder = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function expandYear(yy) {
    var n = parseInt(yy, 10);
    if (!Number.isFinite(n)) return yy;
    return n >= 100 ? String(n) : String(2000 + n);
  }

  /** Primeira data DD/MM/YYYY em texto (entrada data ou periodo AGHU). */
  function parseFirstBrDate(text) {
    var p = str(text).trim();
    if (!p) return "";
    var m = p.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + expandYear(m[3]);
  }

  /**
   * @param {string} data
   * @returns {number} ms desde epoch; Infinity se vazio/inválido (vai para o fim)
   */
  function parseEntryDateMs(data) {
    var key = parseFirstBrDate(data);
    if (!key) return Infinity;
    var parts = key.split("/");
    if (parts.length !== 3) return Infinity;
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
      return Infinity;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return Infinity;
    return new Date(year, month - 1, day).getTime();
  }

  /**
   * Ordenação estável ascendente por data clínica (D1 = mais antigo).
   * @param {object[]} entries
   * @returns {object[]}
   */
  function sortPassometroEntries(entries) {
    if (!Array.isArray(entries) || entries.length < 2) {
      return Array.isArray(entries) ? entries.slice() : [];
    }
    return entries
      .map(function (entry, index) {
        return { entry: entry, index: index, ms: parseEntryDateMs(entry && entry.data) };
      })
      .sort(function (a, b) {
        if (a.ms !== b.ms) return a.ms - b.ms;
        return a.index - b.index;
      })
      .map(function (row) {
        return row.entry;
      });
  }

  return {
    parseFirstBrDate: parseFirstBrDate,
    parseEntryDateMs: parseEntryDateMs,
    sortPassometroEntries: sortPassometroEntries,
  };
});
