/**
 * lib/exam-table-parse.js — parse da tabela PrimeFaces de exames liberados (AGHU).
 * Usado por content/content.js e testes Node (eval).
 */
(function (root) {
  "use strict";

  function norm(s) {
    return (s || "").toLowerCase().replace(/[\s\xa0]+/g, " ").trim();
  }

  function getRowCells(row) {
    if (!row) return [];
    const grid = row.querySelectorAll("td[role='gridcell']");
    if (grid.length >= 6) return Array.from(grid);
    return Array.from(row.querySelectorAll("td"));
  }

  const LABEL_ALIASES = {
    "data coleta": "date",
    "data da coleta": "date",
    data: "date",
    solicitacao: "solicitation",
    "solicitação": "solicitation",
    "n solic": "solicitation",
    exame: "exam",
    amostra: "sample",
    material: "sample",
    laboratorio: "lab",
    "laboratório": "lab",
    "serviço/laboratório": "lab",
    "servico/laboratorio": "lab",
    lab: "lab",
    resultado: "result",
    result: "result",
  };

  function labelToField(label) {
    const n = norm(label);
    if (!n) return null;
    if (LABEL_ALIASES[n]) return LABEL_ALIASES[n];
    for (const key of Object.keys(LABEL_ALIASES)) {
      if (n.includes(key)) return LABEL_ALIASES[key];
    }
    return null;
  }

  var BR_DATE_TOKEN_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;

  function looksLikeBrDate(text) {
    if (!text) return false;
    return BR_DATE_TOKEN_RE.test(String(text).trim());
  }

  function inferColumnMapFromRow(cells) {
    const map = {};
    if (!cells || cells.length < 6) return map;

    let dateIdx = null;

    cells.forEach((cell, idx) => {
      if (cell.querySelector("input[type='checkbox']")) {
        map.checkbox = idx;
      }
      if (cell.querySelector("a.silk-attach, a.silk-magnifier")) {
        map.actions = idx;
      }
      const dateSpan = cell.querySelector("span[id$=':dataColeta']");
      if (dateSpan || looksLikeBrDate(cellText(cell))) {
        if (dateIdx == null) dateIdx = idx;
      }
    });

    if (dateIdx == null) return map;

    map.date = dateIdx;
    const afterDate = cells.length - dateIdx - 1;
    if (afterDate >= 4) {
      map.solicitation = dateIdx + 1;
      map.exam = dateIdx + 2;
      map.sample = dateIdx + 3;
      map.lab = dateIdx + 4;
      if (afterDate >= 5) map.result = dateIdx + 5;
    }

    return map;
  }

  function getDefaultColumnMap() {
    return {
      checkbox: 0,
      actions: 1,
      date: 2,
      solicitation: 3,
      exam: 4,
      sample: 5,
      lab: 6,
      result: 7,
    };
  }

  function getHeaderRowForTbody(tbody) {
    if (!tbody) return null;
    const table = tbody.closest("table");
    if (table) {
      const headerRow = table.querySelector("thead tr");
      if (headerRow) return headerRow;
    }

    const datatable =
      tbody.closest(".ui-datatable") ||
      tbody.closest(".ui-datatable-scrollable-body")?.closest(".ui-datatable") ||
      tbody.parentElement?.closest(".ui-datatable");

    if (datatable) {
      const headerTable = datatable.querySelector(".ui-datatable-scrollable-header table");
      if (headerTable) {
        const headerRow = headerTable.querySelector("thead tr");
        if (headerRow) return headerRow;
      }
    }

    return null;
  }

  /**
   * Header scrollable pode ter coluna "Selecionar" congelada (8 th) sem td no body (7 td).
   */
  function applyFrozenColumnOffset(fieldIndices, headerThCount, bodyCellCount) {
    if (!headerThCount || !bodyCellCount) return fieldIndices;
    const delta = headerThCount - bodyCellCount;
    if (delta <= 0) return fieldIndices;

    const out = Object.assign({}, fieldIndices);
    if (delta === 1 && out.checkbox === 0) {
      delete out.checkbox;
      for (const key of Object.keys(out)) {
        if (typeof out[key] === "number" && out[key] >= 1) {
          out[key] = out[key] - 1;
        }
      }
      return out;
    }

    let needsShift = false;
    const maxBody = bodyCellCount - 1;
    for (const key of Object.keys(out)) {
      if (key === "checkbox") continue;
      if (typeof out[key] === "number" && out[key] > maxBody) {
        needsShift = true;
        break;
      }
    }
    if (!needsShift) return out;

    for (const key of Object.keys(out)) {
      if (key === "checkbox") {
        if (out.checkbox === 0) delete out.checkbox;
        continue;
      }
      if (typeof out[key] === "number") {
        out[key] = Math.max(0, out[key] - delta);
      }
    }
    return out;
  }

  function buildExamColumnMap(doc, tbody) {
    const cols = getDefaultColumnMap();
    if (!tbody) return cols;

    const fieldIndices = {};
    const headerRow = getHeaderRowForTbody(tbody);
    let headerThCount = 0;

    if (headerRow) {
      const ths = headerRow.querySelectorAll("th");
      headerThCount = ths.length;
      ths.forEach((th, idx) => {
        const title =
          (th.querySelector(".ui-column-title") &&
            th.querySelector(".ui-column-title").textContent) ||
          (th.querySelector("span") && th.querySelector("span").textContent) ||
          th.textContent;
        const field = labelToField(title);
        if (field && !(field in fieldIndices)) {
          fieldIndices[field] = idx;
        }
        const nt = norm(title);
        if (th.querySelector("input[type='checkbox']") || nt.includes("selec")) {
          fieldIndices.checkbox = idx;
        }
      });
    }

    const firstRow = tbody.querySelector("tr[data-ri]");
    let bodyCellCount = 0;
    if (firstRow) {
      const cells = getRowCells(firstRow);
      bodyCellCount = cells.length;
      cells.forEach((cell, idx) => {
        if (cell.querySelector("input[type='checkbox']")) {
          fieldIndices.checkbox = idx;
        }
        if (cell.querySelector("a.silk-attach, a.silk-magnifier")) {
          fieldIndices.actions = idx;
        }
      });

      const heuristic = inferColumnMapFromRow(cells);
      for (const key of [
        "date",
        "exam",
        "result",
        "solicitation",
        "sample",
        "lab",
        "checkbox",
        "actions",
      ]) {
        if (fieldIndices[key] == null && heuristic[key] != null) {
          fieldIndices[key] = heuristic[key];
        }
      }
    }

    const reconciled = applyFrozenColumnOffset(
      fieldIndices,
      headerThCount,
      bodyCellCount,
    );

    if (reconciled.date != null) cols.date = reconciled.date;
    if (reconciled.solicitation != null) cols.solicitation = reconciled.solicitation;
    if (reconciled.exam != null) cols.exam = reconciled.exam;
    if (reconciled.sample != null) cols.sample = reconciled.sample;
    if (reconciled.lab != null) cols.lab = reconciled.lab;
    if (reconciled.result != null) cols.result = reconciled.result;
    if (reconciled.checkbox != null) cols.checkbox = reconciled.checkbox;
    if (reconciled.actions != null) cols.actions = reconciled.actions;

    return cols;
  }

  function cellText(cell) {
    if (!cell) return "";
    return (cell.textContent || "").trim();
  }

  function parseExamRow(row, colMap, opts) {
    const cells = getRowCells(row);
    if (cells.length < 6) return null;

    const get = (key) => {
      const i = colMap[key];
      return i != null && i < cells.length ? cells[i] : null;
    };

    const rowIndex = parseInt(row.getAttribute("data-ri"), 10);
    if (!Number.isFinite(rowIndex)) return null;

    const dateCell = get("date");
    if (!dateCell) return null;

    const dateSpan = dateCell.querySelector("span[id$=':dataColeta']");
    const date = dateSpan ? dateSpan.textContent.trim() : cellText(dateCell);

    const coleta =
      opts && opts.parseDataColeta
        ? opts.parseDataColeta(date)
        : { iso: null, label: "sem data" };

    if (
      opts &&
      !opts.skipDateFilter &&
      (opts.dateFromIso || opts.dateToIso)
    ) {
      if (!coleta.iso) return null;
      if (opts.dateFromIso && coleta.iso < opts.dateFromIso) return null;
      if (opts.dateToIso && coleta.iso > opts.dateToIso) return null;
    }

    const actionsCell = get("actions");
    const checkboxCell = get("checkbox");
    const sampleCell = get("sample");
    const sampleSpan = sampleCell ? sampleCell.querySelector("span[title]") : null;
    const sample = sampleSpan
      ? sampleSpan.getAttribute("title").trim()
      : cellText(sampleCell);

    const checkbox = checkboxCell
      ? checkboxCell.querySelector("input[type='checkbox']")
      : row.querySelector("input[type='checkbox']");

    return {
      rowIndex,
      date,
      solicitation: cellText(get("solicitation")),
      examName: cellText(get("exam")),
      sample,
      lab: cellText(get("lab")),
      result: cellText(get("result")),
      hasAttachment: actionsCell
        ? !!actionsCell.querySelector("a.silk-attach")
        : !!row.querySelector("a.silk-attach"),
      /** Metadado DOM (ícone lupa); partição de fetch ignora — só checkbox lote + anexo. */
      hasDetail: actionsCell
        ? !!actionsCell.querySelector("a.silk-magnifier")
        : !!row.querySelector("a.silk-magnifier"),
      hasCheckbox: !!checkbox,
      checkboxId: checkbox ? checkbox.id : null,
      dataColetaISO: coleta.iso,
      dataColetaLabel: coleta.label,
    };
  }

  function parseExamRows(tbody, doc, opts) {
    const empty = {
      exams: [],
      rowCount: 0,
      sampleCellCount: 0,
      structuralCount: 0,
      reason: "structure",
    };
    if (!tbody) return empty;

    const colMap = buildExamColumnMap(doc || tbody.ownerDocument || null, tbody);
    const rows = tbody.querySelectorAll("tr[data-ri]");
    let sampleCellCount = 0;
    if (rows.length > 0) {
      sampleCellCount = getRowCells(rows[0]).length;
    }

    const skipOpts = Object.assign({}, opts || {}, { skipDateFilter: true });
    let structuralCount = 0;
    let emptyExamNameCount = 0;
    rows.forEach((row) => {
      const structural = parseExamRow(row, colMap, skipOpts);
      if (!structural) return;
      structuralCount++;
      if (!structural.examName || !String(structural.examName).trim()) {
        emptyExamNameCount++;
      }
    });

    const exams = [];
    rows.forEach((row) => {
      const exam = parseExamRow(row, colMap, opts || {});
      if (exam) exams.push(exam);
    });

    let reason = "ok";
    if (structuralCount === 0) {
      reason = "structure";
    } else if (exams.length === 0) {
      reason = "date_filter";
    }

    return {
      exams,
      rowCount: rows.length,
      sampleCellCount,
      colMap,
      structuralCount,
      emptyExamNameCount,
      reason,
    };
  }

  function collectAccessibleDocs(startDoc) {
    const seen = new Set();
    const docs = [];

    function walk(d) {
      if (!d || seen.has(d)) return;
      seen.add(d);
      docs.push(d);
      d.querySelectorAll("iframe").forEach((fr) => {
        try {
          const child =
            fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
          if (child) walk(child);
        } catch (_e) {}
      });
    }

    walk(startDoc);
    return docs;
  }

  function getDocUrl(doc) {
    if (!doc) return "";
    try {
      return doc.defaultView?.location?.href || doc.URL || "";
    } catch (_e) {
      return doc.URL || "";
    }
  }

  function scoreExamTbody(doc, tbody) {
    if (!tbody || !tbody.querySelector("tr[data-ri]")) return -1;

    let score = 0;
    const headerRow = getHeaderRowForTbody(tbody);
    if (headerRow) {
      const headers = Array.from(headerRow.querySelectorAll("th")).map((th) =>
        norm(
          (th.querySelector(".ui-column-title") && th.querySelector(".ui-column-title").textContent) ||
            th.textContent
        )
      );
      if (headers.some((h) => h.includes("exame"))) score += 10;
      if (headers.some((h) => h.includes("resultado"))) score += 10;
    }

    const url = getDocUrl(doc);
    if (/consultarExames|examesLiberados/i.test(url)) score += 20;

    const colMap = buildExamColumnMap(doc, tbody);
    const firstRow = tbody.querySelector("tr[data-ri]");
    if (firstRow && parseExamRow(firstRow, colMap, { skipDateFilter: true })) {
      score += 30;
    }

    return score;
  }

  function findTableBodyInDoc(doc) {
    if (!doc) return null;
    let tbody = doc.querySelector("tbody[id$='resultList_data']");
    if (tbody && tbody.querySelector("tr[data-ri]")) return tbody;
    for (const tb of doc.querySelectorAll("tbody[id*='result']")) {
      if (tb.querySelector("tr[data-ri]")) return tb;
    }
    for (const tb of doc.querySelectorAll("tbody[id]")) {
      const rows = tb.querySelectorAll("tr[data-ri]");
      if (rows.length > 0 && getRowCells(rows[0]).length >= 6) return tb;
    }
    const anyRow = doc.querySelector("tr[data-ri]");
    return anyRow ? anyRow.closest("tbody") : null;
  }

  function findExamDocument(startDoc) {
    const docs = collectAccessibleDocs(startDoc || document);
    let best = { doc: startDoc || document, tbody: null, score: -1 };

    for (const d of docs) {
      const candidates = d.querySelectorAll("tbody[id$='resultList_data']");
      for (const tbody of candidates) {
        if (!tbody.querySelector("tr[data-ri]")) continue;
        const score = scoreExamTbody(d, tbody);
        if (score > best.score) {
          best = { doc: d, tbody, score };
        }
      }
    }

    if (best.tbody) {
      return { doc: best.doc, tbody: best.tbody };
    }

    for (const d of docs) {
      const tbody = findTableBodyInDoc(d);
      if (tbody) return { doc: d, tbody };
    }

    return { doc: startDoc || document, tbody: null };
  }

  function extractExamsFromTable(
    doc,
    tbody,
    dateFrom,
    dateTo,
    _parseBrDate,
    parseDataColeta
  ) {
    return parseExamRows(tbody, doc, {
      dateFromIso: dateFrom || null,
      dateToIso: dateTo || null,
      parseDataColeta,
    });
  }

  function findRowByExamKey(tbody, doc, keys, parseDataColeta) {
    if (!tbody || !keys) return null;
    const colMap = buildExamColumnMap(doc || tbody.ownerDocument || null, tbody);
    const rows = tbody.querySelectorAll("tr[data-ri]");
    const rowOpts = { skipDateFilter: true };
    if (parseDataColeta) rowOpts.parseDataColeta = parseDataColeta;
    for (const row of rows) {
      const exam = parseExamRow(row, colMap, rowOpts);
      if (!exam) continue;
      if (
        keys.solicitation != null &&
        keys.solicitation !== "" &&
        norm(exam.solicitation) !== norm(keys.solicitation)
      ) {
        continue;
      }
      if (
        keys.examName != null &&
        keys.examName !== "" &&
        norm(exam.examName) !== norm(keys.examName)
      ) {
        continue;
      }
      if (
        keys.dataColetaISO != null &&
        keys.dataColetaISO !== "" &&
        exam.dataColetaISO !== keys.dataColetaISO
      ) {
        continue;
      }
      if (
        keys.sample != null &&
        keys.sample !== "" &&
        norm(exam.sample) !== norm(keys.sample)
      ) {
        continue;
      }
      return row;
    }
    return null;
  }

  function resolveExamRow(tbody, doc, rowIndex, examKeys, parseDataColeta) {
    if (!tbody) return null;
    let row = null;
    if (rowIndex != null && Number.isFinite(Number(rowIndex))) {
      row = tbody.querySelector(`tr[data-ri="${rowIndex}"]`);
    }
    if (!row && examKeys) {
      row = findRowByExamKey(tbody, doc, examKeys, parseDataColeta);
    }
    return row;
  }

  root.AghuExamTableParse = {
    norm,
    getRowCells,
    looksLikeBrDate,
    inferColumnMapFromRow,
    getHeaderRowForTbody,
    applyFrozenColumnOffset,
    buildExamColumnMap,
    parseExamRow,
    parseExamRows,
    findExamDocument,
    findTableBodyInDoc,
    findRowByExamKey,
    resolveExamRow,
    extractExamsFromTable,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
