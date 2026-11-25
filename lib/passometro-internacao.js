/**
 * Contagem de dias de internação (D0 no DIH) para rótulo "Dia N" no editor.
 * D0 = dia da internação (DIH); D1 = dia seguinte; etc.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroInternacao = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  function parseDateMs(data) {
    var order = getEntriesOrder();
    if (!order || !order.parseEntryDateMs) return NaN;
    return order.parseEntryDateMs(data);
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * @param {string} dih DD/MM/AAAA
   * @param {string} entryData DD/MM/AAAA
   * @returns {number | null} 0 no DIH; null se inválido ou antes do DIH
   */
  function computeInternacaoDay(dih, entryData) {
    var dihMs = parseDateMs(dih);
    var entryMs = parseDateMs(entryData);
    if (!Number.isFinite(dihMs) || !Number.isFinite(entryMs)) return null;
    if (dihMs === Infinity || entryMs === Infinity) return null;
    var diffDays = Math.round((entryMs - dihMs) / 86400000);
    if (diffDays < 0) return null;
    return diffDays;
  }

  /**
   * @param {string} dih
   * @param {string} entryData
   * @param {number} fallbackIndex índice 0-based no array ordenado
   * @returns {string} ex. "Dia 0", "Dia —", "Dia 2"
   */
  function formatInternacaoLabel(dih, entryData, fallbackIndex) {
    var dihTrim = str(dih).trim();
    if (!dihTrim) {
      return "Dia " + (fallbackIndex + 1);
    }
    var day = computeInternacaoDay(dihTrim, entryData);
    if (day === null) return "Dia —";
    return "Dia " + day;
  }

  /**
   * @param {string} dih
   * @param {string} entryData
   * @param {number} fallbackIndex
   * @returns {string} rótulo + data opcional (ex. "Dia 0 — 05/06/2026")
   */
  function formatEntryTitle(dih, entryData, fallbackIndex) {
    var label = formatInternacaoLabel(dih, entryData, fallbackIndex);
    var dataTrim = str(entryData).trim();
    return dataTrim ? label + " — " + dataTrim : label;
  }

  return {
    computeInternacaoDay: computeInternacaoDay,
    formatInternacaoLabel: formatInternacaoLabel,
    formatEntryTitle: formatEntryTitle,
  };
});
