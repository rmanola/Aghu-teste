/**
 * Render de resultados na tabela de exames (popup).
 */
(function (root) {
  "use strict";

  function normalizeMultilineLabResult(text) {
    var fn =
      root.AghuPdfLabParse && root.AghuPdfLabParse.normalizeMultilineLabResult;
    return fn ? fn(text) : String(text || "").trim();
  }

  function formatResultPreview(text, maxLines) {
    maxLines = maxLines == null ? 8 : maxLines;
    var normalized = normalizeMultilineLabResult(text);
    var lines = normalized
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l.length > 0;
      });
    if (lines.length === 0) return { preview: "—", title: "" };
    var shown = lines.slice(0, maxLines);
    var preview = shown.join("\n");
    if (lines.length > maxLines) preview += "\n…";
    var title = lines.slice(0, 24).join("\n");
    return {
      preview: preview,
      title: title.length > 600 ? title.slice(0, 600) + "…" : title,
    };
  }

  function appendFetchedResultSpan(tdResult, text, className, esc) {
    var formatted = formatResultPreview(text);
    var span = document.createElement("span");
    span.className = className;
    if (formatted.title) span.title = esc(formatted.title);
    span.textContent = formatted.preview;
    tdResult.appendChild(span);
  }

  function getExamDisplayMeta(exam, upgradeGasometry) {
    var resolve = root.AghuExamResultResolve;
    if (resolve && resolve.resolveExamDisplayMeta) {
      return resolve.resolveExamDisplayMeta(exam, {
        upgradeGasometry: upgradeGasometry,
      });
    }
    if (exam.fetchHint && !exam.result && !exam.fetchedResult && !exam.detailText) {
      return { text: exam.fetchHint, kind: "hint" };
    }
    if (exam.result) return { text: exam.result, kind: "grid" };
    if (exam.fetchedResult) return { text: exam.fetchedResult, kind: "fetched" };
    if (exam.detailText) return { text: exam.detailText, kind: "detail" };
    return { text: "", kind: "empty" };
  }

  function getExamDisplayText(exam, upgradeGasometry) {
    var resolve = root.AghuExamResultResolve;
    if (resolve && resolve.resolveExamDisplayText) {
      return resolve.resolveExamDisplayText(exam, {
        upgradeGasometry: upgradeGasometry,
      });
    }
    return exam.result || exam.fetchedResult || exam.detailText || "";
  }

  function fillResultCell(cell, exam, esc, upgradeGasometry) {
    cell.replaceChildren();
    var meta = getExamDisplayMeta(exam, upgradeGasometry);
    if (meta.kind === "grid") {
      var span = document.createElement("span");
      span.className = "result-val";
      span.textContent = meta.text;
      cell.appendChild(span);
      return meta.kind;
    }
    if (meta.kind === "fetched" || meta.kind === "detail") {
      appendFetchedResultSpan(cell, meta.text, "result-fetched", esc);
      return meta.kind;
    }
    if (meta.kind === "hint") {
      var hint = document.createElement("span");
      hint.className = "result-warning";
      hint.title = esc(meta.text);
      hint.textContent =
        meta.text.substring(0, 60) + (meta.text.length > 60 ? "…" : "");
      cell.appendChild(hint);
      return meta.kind;
    }
    var empty = document.createElement("span");
    empty.className = "result-empty";
    empty.textContent = "—";
    cell.appendChild(empty);
    return meta.kind;
  }

  function groupByDataColeta(exams, ensureColetaFields) {
    var NO_DATE = "__nodate__";
    var seen = new Map();
    var keyOrder = [];
    for (var i = 0; i < exams.length; i++) {
      var e = ensureColetaFields(exams[i]);
      var key = e.dataColetaISO || NO_DATE;
      if (!seen.has(key)) {
        seen.set(key, {
          dataISO: e.dataColetaISO,
          dataLabel: e.dataColetaLabel,
          items: [],
        });
        keyOrder.push(key);
      }
      seen.get(key).items.push(e);
    }
    var sortedKeys = keyOrder.slice().sort(function (a, b) {
      if (a === NO_DATE) return 1;
      if (b === NO_DATE) return -1;
      return b.localeCompare(a);
    });
    return sortedKeys.map(function (k) {
      return seen.get(k);
    });
  }

  function distinctColetaKeysCount(exams, ensureColetaFields) {
    var keys = new Set();
    for (var i = 0; i < exams.length; i++) {
      var e = ensureColetaFields(exams[i]);
      keys.add(e.dataColetaISO || "");
    }
    return keys.size;
  }

  root.AghuPopupExamsRender = {
    fillResultCell: fillResultCell,
    getExamDisplayText: getExamDisplayText,
    getExamDisplayMeta: getExamDisplayMeta,
    groupByDataColeta: groupByDataColeta,
    distinctColetaKeysCount: distinctColetaKeysCount,
    formatResultPreview: formatResultPreview,
    appendFetchedResultSpan: appendFetchedResultSpan,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
