/**
 * Linhas BH: frozenTbody (Horários) + scrollableTbody (volumes).
 * Testável em Node via module.exports; extensão: global AghuControlesBhRows.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesBhRows = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_TABLE_ID = "tabelaVisualizacaoRegistrosBH";

  function norm(s) {
    return (s || "").toLowerCase().replace(/[\s\xa0]+/g, " ").trim();
  }

  function pareceHorario(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (!t || t.length > 48) return false;
    if (/^\d{1,3}([.,]\d+)?$/.test(t)) return false;
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t) && /\d{1,2}:\d{2}/.test(t)) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
    if (/\d{1,2}:\d{2}/.test(t) && !/mg\/dl|mmhg|irpm|bpm|ml\/h/i.test(t)) return true;
    return false;
  }

  function bhTbodySuffixes(tableId, kind) {
    var base = tableId || DEFAULT_TABLE_ID;
    if (kind === "frozen") return [base + "_frozenTbody"];
    if (kind === "scrollable") return [base + "_scrollableTbody", base + "_data"];
    return [base + "_frozenTbody", base + "_scrollableTbody", base + "_data"];
  }

  /**
   * @param {Document} doc
   * @param {string} [tableId]
   * @param {string|number} ri
   * @param {'frozen'|'scrollable'|'any'} [kind]
   * @returns {Element|null}
   */
  function findBhRowByRi(doc, tableId, ri, kind) {
    if (!doc || ri == null) return null;
    var riStr = String(ri);
    var suffixes = bhTbodySuffixes(tableId, kind || "any");
    for (var i = 0; i < suffixes.length; i++) {
      var tbody = doc.getElementById(suffixes[i]);
      if (!tbody) continue;
      var row = tbody.querySelector('tr[data-ri="' + riStr + '"]');
      if (row) return row;
    }
    return null;
  }

  /**
   * Índice da coluna Horários no thead frozen (ou qualquer thead do widget BH).
   * @param {Document} doc
   * @param {string} [tableId]
   * @returns {number|null}
   */
  function lerIndiceColunaHorarioBH(doc, tableId) {
    var root = doc.getElementById(tableId || DEFAULT_TABLE_ID);
    if (!root) return null;
    var headerRows = root.querySelectorAll("thead tr, .ui-datatable-header tr");
    for (var r = 0; r < headerRows.length; r++) {
      var cells = headerRows[r].querySelectorAll("th, td");
      for (var i = 0; i < cells.length; i++) {
        var label = norm(cells[i].textContent);
        if (
          /^hora$|^hor[aá]rio$|^hor[aá]rios$|data\s*\/\s*hora|data\s*e\s*hora|registro/i.test(
            label,
          )
        ) {
          return i;
        }
      }
    }
    return null;
  }

  /**
   * @param {Element|null} row
   * @param {number|null} colHorarioIdx
   * @returns {string}
   */
  function extrairHorarioTextoFromRow(row, colHorarioIdx) {
    if (!row) return "";
    if (colHorarioIdx != null) {
      var tds = row.querySelectorAll("td");
      var td = tds[colHorarioIdx];
      if (td) {
        var tCol = (td.textContent || "").trim();
        if (pareceHorario(tCol)) return tCol;
      }
    }
    var els = row.querySelectorAll("td, span");
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || "").trim();
      if (pareceHorario(t)) return t;
    }
    return "";
  }

  /**
   * Horário de linha BH: prioriza frozenTbody (coluna Horários).
   * @param {Document} doc
   * @param {string|number} ri
   * @param {number|null} colHorarioIdx
   * @param {Element|null} [rowFallback]
   * @param {string} [tableId]
   * @returns {string}
   */
  function extrairHorarioBh(doc, ri, colHorarioIdx, rowFallback, tableId) {
    var tid = tableId || DEFAULT_TABLE_ID;
    var frozenRow = findBhRowByRi(doc, tid, ri, "frozen");
    var horarioRow = frozenRow || rowFallback || findBhRowByRi(doc, tid, ri, "scrollable");
    return extrairHorarioTextoFromRow(horarioRow, colHorarioIdx);
  }

  /**
   * Lista linhas BH por data-ri (scrollable primeiro, depois frozen).
   * @param {Document} doc
   * @param {string} [tableId]
   * @returns {Array<{ ri: number, row: Element, scrollableRow: Element|null }>}
   */
  function listBhDataRows(doc, tableId) {
    var tid = tableId || DEFAULT_TABLE_ID;
    var seen = new Set();
    var out = [];
    var order = [
      tid + "_scrollableTbody",
      tid + "_data",
      tid + "_frozenTbody",
    ];
    for (var o = 0; o < order.length; o++) {
      var tbody = doc.getElementById(order[o]);
      if (!tbody) continue;
      var rows = tbody.querySelectorAll("tr[data-ri]");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var riAttr = row.getAttribute("data-ri");
        if (!riAttr || seen.has(riAttr)) continue;
        seen.add(riAttr);
        var scrollableRow =
          findBhRowByRi(doc, tid, riAttr, "scrollable") || row;
        out.push({
          ri: parseInt(riAttr, 10),
          row: scrollableRow,
          scrollableRow: scrollableRow,
        });
      }
    }
    out.sort(function (a, b) {
      return a.ri - b.ri;
    });
    return out;
  }

  /**
   * @param {{ windowStartMs?: number|null, windowApi?: object, colHorarioIdx?: number|null, tableId?: string }} filter
   * @param {Document} doc
   * @param {string|number} ri
   * @param {Element|null} row
   * @returns {boolean}
   */
  function linhaBhPassesWindowFilter(doc, row, ri, filter) {
    if (!filter || !filter.windowApi || !filter.windowApi.filterRegsInClinicalWindow) {
      return true;
    }
    var colIdx =
      filter.colHorarioIdx != null
        ? filter.colHorarioIdx
        : lerIndiceColunaHorarioBH(doc, filter.tableId);
    var horario = extrairHorarioBh(doc, ri, colIdx, row, filter.tableId);
    var matched = filter.windowApi.filterRegsInClinicalWindow(
      [{ ri: parseInt(ri, 10), horario: horario }],
      filter.windowStartMs,
    );
    return matched.length > 0;
  }

  return {
    DEFAULT_TABLE_ID: DEFAULT_TABLE_ID,
    norm: norm,
    pareceHorario: pareceHorario,
    bhTbodySuffixes: bhTbodySuffixes,
    findBhRowByRi: findBhRowByRi,
    lerIndiceColunaHorarioBH: lerIndiceColunaHorarioBH,
    extrairHorarioTextoFromRow: extrairHorarioTextoFromRow,
    extrairHorarioBh: extrairHorarioBh,
    listBhDataRows: listBhDataRows,
    linhaBhPassesWindowFilter: linhaBhPassesWindowFilter,
  };
});
