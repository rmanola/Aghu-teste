/**
 * Leitura resiliente de células das tabelas Monitorização / BH no AGHU.
 * Testável em Node via module.exports; extensão: global AghuControlesCellExtract.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesCellExtract = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Texto parece data/hora de registro (não confundir com valor numérico de sinal). */
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

  function textoFromControl(el) {
    if (!el) return "";
    var tag = el.tagName ? String(el.tagName).toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return String(el.value != null ? el.value : "").trim();
    }
    if (el.getAttribute) {
      var title = el.getAttribute("title");
      if (title && String(title).trim()) return String(title).trim();
    }
    return String(el.textContent || "").trim();
  }

  function pickReadableText(candidates, skipHorario) {
    for (var i = 0; i < candidates.length; i++) {
      var t = candidates[i];
      if (t == null || t === "") continue;
      var trimmed = String(t).trim();
      if (!trimmed) continue;
      if (skipHorario && pareceHorario(trimmed)) continue;
      return trimmed;
    }
    return "";
  }

  function collectTextsFromSubtree(root, skipHorario) {
    if (!root) return [];
    var out = [];
    if (root.querySelectorAll) {
      var controls = root.querySelectorAll("input, textarea, select");
      for (var ci = 0; ci < controls.length; ci++) {
        var cv = textoFromControl(controls[ci]);
        if (cv) out.push(cv);
      }
      var spans = root.querySelectorAll("span[title], span");
      for (var si = 0; si < spans.length; si++) {
        var sv = textoFromControl(spans[si]);
        if (sv) out.push(sv);
      }
    }
    var direct = textoFromControl(root);
    if (direct) out.push(direct);
    return out;
  }

  function firstReadableFromSubtree(root, skipHorario) {
    return pickReadableText(collectTextsFromSubtree(root, skipHorario), skipHorario);
  }

  function acceptMonitorCellText(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    if (pareceHorario(t)) return "";
    return t;
  }

  /** Match exato de índice em id AGHU (evita _colunaM:1 casar _colunaM:12). */
  function idMatchesColunaIndex(id, tag, colIdx) {
    var needle = tag + ":" + colIdx;
    var pos = String(id || "").indexOf(needle);
    if (pos === -1) return false;
    var next = id.charAt(pos + needle.length);
    return next === "" || next === ":" || next === "_";
  }

  function findElementsForColunaInRow(row, tag, colIdx) {
    if (!row || !row.querySelectorAll) return [];
    var out = [];
    var all = row.querySelectorAll('[id*="' + tag + ':"]');
    for (var i = 0; i < all.length; i++) {
      if (idMatchesColunaIndex(all[i].id, tag, colIdx)) out.push(all[i]);
    }
    return out;
  }

  function getCelulaByKnownIds(doc, table, ri, colIdx) {
    if (colIdx === null || colIdx === undefined) return "";
    var base = table + ":" + ri + ":_colunaM:" + colIdx;

    var span = doc.getElementById(base + ":j_idt248");
    if (span) {
      var v = acceptMonitorCellText(span.textContent.trim());
      if (v) return v;
    }

    var sfxList = [":limiteForaTxt", ":limiteForaTxt2", ":limiteForaTxt3"];
    for (var i = 0; i < sfxList.length; i++) {
      var spanFora = doc.getElementById(base + sfxList[i]);
      if (spanFora) {
        var vf = acceptMonitorCellText(spanFora.textContent.trim());
        if (vf) return vf;
      }
    }

    var panelSfx = [":panelLimite", ":panelLimite2", ":panelLimite3"];
    for (var p = 0; p < panelSfx.length; p++) {
      var painel = doc.getElementById(base + panelSfx[p]);
      if (painel) {
        var vp = acceptMonitorCellText(firstReadableFromSubtree(painel, true));
        if (vp) return vp;
      }
    }

    return "";
  }

  function findTdForColunaM(doc, table, row, colIdx) {
    if (!row || !row.querySelector) return null;
    var colEls = findElementsForColunaInRow(row, "_colunaM", colIdx);
    for (var ci = 0; ci < colEls.length; ci++) {
      var n = colEls[ci];
      while (n && n !== row) {
        if (n.tagName && String(n.tagName).toUpperCase() === "TD") return n;
        n = n.parentElement;
      }
    }

    var tableEl = doc.getElementById(table);
    if (!tableEl) return null;
    var headerRow =
      tableEl.querySelector("thead tr") ||
      tableEl.querySelector(".ui-datatable-header tr");
    if (!headerRow) return null;
    var headerCells = headerRow.querySelectorAll("th, td");
    var tdIndex = null;
    for (var hi = 0; hi < headerCells.length; hi++) {
      var hid = headerCells[hi].id || "";
      if (idMatchesColunaIndex(hid, "_colunaM", colIdx)) {
        tdIndex = hi;
        break;
      }
    }
    if (tdIndex == null) return null;
    var tds = row.querySelectorAll("td");
    return tds[tdIndex] || null;
  }

  /**
   * @param {Document} doc
   * @param {string} table
   * @param {Element|null} row
   * @param {string|number} ri
   * @param {number} colIdx
   */
  function extrairTextoCelulaMonitor(doc, table, row, ri, colIdx) {
    if (colIdx === null || colIdx === undefined) return "";

    var fromIds = getCelulaByKnownIds(doc, table, ri, colIdx);
    if (fromIds) return fromIds;

    if (row && row.querySelectorAll) {
      var colEls = findElementsForColunaInRow(row, "_colunaM", colIdx);
      for (var ce = 0; ce < colEls.length; ce++) {
        var fromCol = acceptMonitorCellText(firstReadableFromSubtree(colEls[ce], true));
        if (fromCol) return fromCol;
      }

      var td = findTdForColunaM(doc, table, row, colIdx);
      if (td) {
        var fromTd = acceptMonitorCellText(firstReadableFromSubtree(td, true));
        if (fromTd) return fromTd;
      }
    }

    var base = table + ":" + ri + ":_colunaM:" + colIdx;
    if (doc.querySelectorAll) {
      var docEls = doc.querySelectorAll('[id^="' + base + ':"]');
      for (var de = 0; de < docEls.length; de++) {
        if (!idMatchesColunaIndex(docEls[de].id, "_colunaM", colIdx)) continue;
        var fromDoc = acceptMonitorCellText(firstReadableFromSubtree(docEls[de], true));
        if (fromDoc) return fromDoc;
      }
    }

    return "";
  }

  function getCelulaBHByKnownIds(doc, table, ri, colIdx) {
    var base = table + ":" + ri + ":_colunaBH:" + colIdx;

    var span291 = doc.getElementById(base + ":j_idt291");
    if (span291) {
      var inner =
        span291.querySelector("span[title]") ||
        span291.querySelector("span") ||
        span291;
      var raw = inner.getAttribute("title") || inner.textContent || "";
      var t291 = String(raw).trim();
      if (t291) return t291;
    }

    var span293 = doc.getElementById(base + ":j_idt293");
    if (span293) {
      var t293 = span293.textContent.trim();
      if (t293) return t293;
    }

    var panel = doc.getElementById(base + ":panelLimiteBh");
    if (panel) {
      var tp = firstReadableFromSubtree(panel, false);
      if (tp) return tp;
    }

    return "";
  }

  function findTdForColunaBH(doc, table, row, colIdx) {
    if (!row || !row.querySelector) return null;
    var colEls = findElementsForColunaInRow(row, "_colunaBH", colIdx);
    for (var ci = 0; ci < colEls.length; ci++) {
      var n = colEls[ci];
      while (n && n !== row) {
        if (n.tagName && String(n.tagName).toUpperCase() === "TD") return n;
        n = n.parentElement;
      }
    }
    return null;
  }

  /**
   * @param {Document} doc
   * @param {string} table
   * @param {Element|null} row
   * @param {string|number} ri
   * @param {number} colIdx
   */
  function extrairTextoCelulaBH(doc, table, row, ri, colIdx) {
    var fromIds = getCelulaBHByKnownIds(doc, table, ri, colIdx);
    if (fromIds) return fromIds;

    if (row) {
      var colEls = findElementsForColunaInRow(row, "_colunaBH", colIdx);
      for (var i = 0; i < colEls.length; i++) {
        var t = firstReadableFromSubtree(colEls[i], false);
        if (t) return t;
      }
      var td = findTdForColunaBH(doc, table, row, colIdx);
      if (td) {
        var fromTd = firstReadableFromSubtree(td, false);
        if (fromTd) return fromTd;
      }
    }

    var base = table + ":" + ri + ":_colunaBH:" + colIdx;
    if (doc.querySelectorAll) {
      var docEls = doc.querySelectorAll('[id^="' + base + ':"]');
      for (var d = 0; d < docEls.length; d++) {
        if (!idMatchesColunaIndex(docEls[d].id, "_colunaBH", colIdx)) continue;
        var fromDoc = firstReadableFromSubtree(docEls[d], false);
        if (fromDoc) return fromDoc;
      }
    }

    return "";
  }

  return {
    pareceHorario: pareceHorario,
    textoFromControl: textoFromControl,
    idMatchesColunaIndex: idMatchesColunaIndex,
    getCelulaByKnownIds: getCelulaByKnownIds,
    extrairTextoCelulaMonitor: extrairTextoCelulaMonitor,
    extrairTextoCelulaBH: extrairTextoCelulaBH,
    findTdForColunaM: findTdForColunaM,
  };
});
