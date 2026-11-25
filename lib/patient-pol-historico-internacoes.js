/**
 * Parse da grelha Internações no Histórico do Paciente (#field_internacoes).
 * FEAT-109 — CAD-AC-03..05.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientPolHistoricoInternacoes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var HEADER_COLS = ["data inicial", "data final", "descricao"];

  function loadDateBr() {
    if (root.AghuDateBr) return root.AghuDateBr;
    if (typeof require === "function") {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return null;
  }

  function normHeader(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function cellText(el) {
    if (!el) return "";
    return String(el.textContent || el.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseBrDateToIso(raw) {
    if (!raw) return null;
    var cleaned = String(raw).trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$/, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    var br = loadDateBr();
    if (br && br.brToIso) return br.brToIso(cleaned);
    return null;
  }

  /**
   * {unidade} - {especialidade}, {staff}
   * @returns {{ unidade: string, especialidade: string, staff: string }}
   */
  function parseDescricaoInternacao(raw) {
    var notes = String(raw || "").replace(/\s+/g, " ").trim();
    var unidade = "";
    var especialidade = "";
    var staff = "";
    if (!notes) {
      return { unidade: unidade, especialidade: especialidade, staff: staff };
    }

    var dashIdx = notes.indexOf(" - ");
    var beforeDash = dashIdx >= 0 ? notes.slice(0, dashIdx).trim() : notes;
    var afterDash = dashIdx >= 0 ? notes.slice(dashIdx + 3).trim() : "";

    unidade = beforeDash;

    if (afterDash) {
      var lastComma = afterDash.lastIndexOf(",");
      if (lastComma >= 0) {
        especialidade = afterDash.slice(0, lastComma).trim();
        staff = afterDash.slice(lastComma + 1).trim();
      } else {
        especialidade = afterDash;
      }
    }

    staff = staff.replace(/^(Dr\.?a?|Dra\.?)\s+/i, "").trim();

    return { unidade: unidade, especialidade: especialidade, staff: staff };
  }

  function tableHasExactHeaders(table) {
    if (!table || !table.querySelectorAll) return false;
    var headerRow =
      table.querySelector("thead tr") ||
      table.querySelector("tr");
    if (!headerRow) return false;
    var cells = headerRow.querySelectorAll("th, td");
    if (cells.length < 3) return false;
    var texts = [];
    for (var i = 0; i < Math.min(cells.length, 3); i++) {
      texts.push(normHeader(cellText(cells[i])));
    }
    return (
      texts[0] === HEADER_COLS[0] &&
      texts[1] === HEADER_COLS[1] &&
      texts[2] === HEADER_COLS[2]
    );
  }

  function dataRowsFromTable(table) {
    var rows = [];
    if (!table || !table.querySelectorAll) return rows;
    var bodies = table.querySelectorAll("tbody tr");
    if (!bodies.length) {
      var all = table.querySelectorAll("tr");
      bodies = [];
      for (var i = 1; i < all.length; i++) bodies.push(all[i]);
    }
    for (var r = 0; r < bodies.length; r++) {
      var tr = bodies[r];
      var cells = tr.querySelectorAll ? tr.querySelectorAll("td, th") : [];
      if (cells.length < 3) continue;
      var h0 = normHeader(cellText(cells[0]));
      if (h0 === HEADER_COLS[0]) continue;
      rows.push(tr);
    }
    return rows;
  }

  /**
   * @param {Document|Element} docOrRoot
   * @returns {Array<{
   *   startedAt: string|null,
   *   endedAt: string|null,
   *   startedAtBr: string,
   *   endedAtBr: string,
   *   description: string,
   *   unidade: string,
   *   especialidade: string,
   *   staff: string,
   *   label: string,
   *   notes: string,
   * }>}
   */
  function extractInternacoesFromDoc(docOrRoot) {
    if (!docOrRoot || !docOrRoot.querySelector) return [];
    var rootEl =
      docOrRoot.querySelector("#field_internacoes") ||
      (docOrRoot.id === "field_internacoes" ? docOrRoot : null);
    if (!rootEl || !rootEl.querySelectorAll) return [];

    var tables = rootEl.querySelectorAll("table");
    var out = [];
    var seen = Object.create(null);

    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      if (!tableHasExactHeaders(table)) continue;
      var rows = dataRowsFromTable(table);
      if (!rows.length) continue;

      for (var ri = 0; ri < rows.length; ri++) {
        var tr = rows[ri];
        var cells = tr.querySelectorAll("td, th");
        if (cells.length < 3) continue;
        var startBr = cellText(cells[0]);
        var endBr = cellText(cells[1]);
        var desc = cellText(cells[2]);
        var startedAt = parseBrDateToIso(startBr);
        if (!startedAt) continue;

        var dedupeKey = startedAt + "|" + desc;
        if (seen[dedupeKey]) continue;
        seen[dedupeKey] = true;

        var parsed = parseDescricaoInternacao(desc);
        var label =
          parsed.especialidade ||
          parsed.unidade ||
          ("Internação " + (startBr || startedAt));

        out.push({
          startedAt: startedAt,
          endedAt: endBr ? parseBrDateToIso(endBr) : null,
          startedAtBr: startBr,
          endedAtBr: endBr || "",
          description: desc,
          unidade: parsed.unidade,
          especialidade: parsed.especialidade,
          staff: parsed.staff,
          label: label,
          notes: desc,
        });
      }
    }

    return out;
  }

  function frameLooksLikeHistoricoInternacoes(doc) {
    if (!doc || !doc.querySelector) return false;
    var rootEl = doc.querySelector("#field_internacoes");
    if (!rootEl) return false;
    var rows = extractInternacoesFromDoc(doc);
    if (rows.length) return true;
    var tables = rootEl.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      if (tableHasExactHeaders(tables[i])) return true;
    }
    return false;
  }

  /**
   * Entre linhas sem Data Final, só a de startedAt mais recente fica active.
   * @returns {Array<object>} rows com status/endedAt canónicos
   */
  function canonicalizeActiveRows(rows) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    var openIdx = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i].endedAt) openIdx.push(i);
    }
    var activeIdx = -1;
    for (var j = 0; j < openIdx.length; j++) {
      var idx = openIdx[j];
      if (
        activeIdx < 0 ||
        String(list[idx].startedAt) > String(list[activeIdx].startedAt)
      ) {
        activeIdx = idx;
      }
    }
    return list.map(function (row, i) {
      var hasEnd = !!row.endedAt;
      var isActive = !hasEnd && i === activeIdx;
      return Object.assign({}, row, {
        status: isActive ? "active" : "closed",
        endedAt: hasEnd ? row.endedAt : null,
      });
    });
  }

  return {
    parseDescricaoInternacao: parseDescricaoInternacao,
    parseBrDateToIso: parseBrDateToIso,
    extractInternacoesFromDoc: extractInternacoesFromDoc,
    frameLooksLikeHistoricoInternacoes: frameLooksLikeHistoricoInternacoes,
    canonicalizeActiveRows: canonicalizeActiveRows,
    tableHasExactHeaders: tableHasExactHeaders,
  };
});
