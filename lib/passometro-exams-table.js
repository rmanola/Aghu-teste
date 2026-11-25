/**
 * Tabela matricial de exames para passômetro (editor preview + impressão).
 * Testável em Node via module.exports; extensão: global AghuPassometroExamsTable.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroExamsTable = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getExamResultResolve() {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuExamResultResolve || null;
  }

  /**
   * @returns {import("./exam-categories.js")|null}
   */
  function getExamCategories() {
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./exam-categories.js");
      } catch (_e) {
        /* ignore */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuExamCategories) {
      return globalThis.AghuExamCategories;
    }
    return null;
  }

  function getExamMatrixDisplay() {
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./exam-matrix-display.js");
      } catch (_e) {
        /* ignore */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuExamMatrixDisplay
    ) {
      return globalThis.AghuExamMatrixDisplay;
    }
    return null;
  }

  function getUrineCreatinineMatrix() {
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./urine-creatinine-matrix.js");
      } catch (_e) {
        /* ignore */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuUrineCreatinineMatrix
    ) {
      return globalThis.AghuUrineCreatinineMatrix;
    }
    return null;
  }

  function getHemogramMatrix() {
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./hemogram-matrix.js");
      } catch (_e) {
        /* ignore */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuHemogramMatrix) {
      return globalThis.AghuHemogramMatrix;
    }
    return null;
  }

  var NO_DATE = "__nodate__";

  /**
   * @param {unknown} s
   * @returns {string}
   */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {string} raw
   * @returns {{ iso: string|null, label: string }}
   */
  function parseDataColetaFromRaw(raw) {
    if (!raw || String(raw).trim() === "") return { iso: null, label: "sem data" };
    var token = String(raw).trim().split(/\s+/)[0];
    var m = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return { iso: null, label: "sem data" };
    var d = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
      return { iso: null, label: "sem data" };
    }
    var iso =
      String(y).padStart(4, "0") +
      "-" +
      String(mo).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0");
    var label =
      String(d).padStart(2, "0") +
      "/" +
      String(mo).padStart(2, "0") +
      "/" +
      String(y);
    return { iso: iso, label: label };
  }

  /**
   * @param {Record<string, unknown>} exam
   * @returns {Record<string, unknown>}
   */
  function ensureColetaFields(exam) {
    var hasIso = Object.prototype.hasOwnProperty.call(exam, "dataColetaISO");
    var hasLbl = Object.prototype.hasOwnProperty.call(exam, "dataColetaLabel");
    if (hasIso && hasLbl) return exam;
    var p = parseDataColetaFromRaw(String(exam.date || ""));
    if (!hasIso) exam.dataColetaISO = p.iso;
    if (!hasLbl) exam.dataColetaLabel = p.label;
    return exam;
  }

  /**
   * @param {Record<string, unknown>} exam
   * @returns {number}
   */
  function resultPriority(exam) {
    var resolve = getExamResultResolve();
    if (resolve && resolve.resolveExamDisplayText) {
      return resolve.resolveExamDisplayText(exam) ? 3 : 0;
    }
    if (String(exam.result || "").trim()) return 3;
    if (String(exam.fetchedResult || "").trim()) return 2;
    if (String(exam.detailText || "").trim()) return 1;
    return 0;
  }

  /**
   * @param {Record<string, unknown>} a
   * @param {Record<string, unknown>} b
   * @returns {Record<string, unknown>}
   */
  function pickBetterExam(a, b) {
    var pa = resultPriority(a);
    var pb = resultPriority(b);
    if (pa !== pb) return pa > pb ? a : b;
    return a;
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  function rowKey(name) {
    return String(name || "").trim().toLowerCase() || "__unnamed__";
  }

  function normalizeSampleKey(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Chave de linha: nome + amostra normalizada (quando houver).
   * Amostras distintas nunca compartilham a mesma linha da matriz.
   * @param {string} examName
   * @param {string} [sample]
   * @returns {string}
   */
  function matrixRowKey(examName, sample) {
    var base = rowKey(examName);
    var sk = normalizeSampleKey(sample);
    return sk ? base + "|" + sk : base;
  }

  function ensureColumnMeta(columnMeta, colKey, exam) {
    if (!columnMeta.has(colKey)) {
      columnMeta.set(colKey, {
        key: colKey,
        dataISO: /** @type {string|null} */ (exam.dataColetaISO ?? null),
        dataLabel: /** @type {string|null} */ (exam.dataColetaLabel ?? null),
      });
    }
  }

  function isHemogramMatrixCell(cell) {
    var hemogram = getHemogramMatrix();
    if (!hemogram || !hemogram.isHemogramMatrixExam) return false;
    var src = String(cell._hemogramSourceExamName || cell.examName || "");
    return hemogram.isHemogramMatrixExam(src);
  }

  function upsertMatrixCell(rows, rowExamName, rowSample, colKey, cellExam) {
    var rk = matrixRowKey(rowExamName, rowSample);
    if (!rows.has(rk)) {
      rows.set(rk, { examName: rowExamName, cells: new Map() });
    }
    var row = rows.get(rk);
    var existing = row.cells.get(colKey);
    var hemogram = getHemogramMatrix();
    if (
      existing &&
      hemogram &&
      hemogram.mergeHemogramMatrixCells &&
      isHemogramMatrixCell(existing) &&
      isHemogramMatrixCell(cellExam)
    ) {
      row.cells.set(
        colKey,
        hemogram.mergeHemogramMatrixCells(existing, cellExam),
      );
    } else {
      row.cells.set(
        colKey,
        existing ? pickBetterExam(existing, cellExam) : cellExam,
      );
    }
  }

  function hoistedUrineCreatinineExam(exam, sample, valueText) {
    return Object.assign({}, exam, {
      examName: "CREATININA",
      sample: sample || "URINA",
      result: String(valueText || "").trim(),
      fetchedResult: "",
      detailText: "",
    });
  }

  function maybeHoistUrineCreatinineFromPanel(rows, columnMeta, exam) {
    var urineCr = getUrineCreatinineMatrix();
    var matrixDisplay = getExamMatrixDisplay();
    if (!urineCr || !matrixDisplay || !matrixDisplay.parseExamSubitemsFromText) {
      return;
    }
    var examName = String(exam.examName || "").trim() || "—";
    var sample = String(exam.sample || "");
    if (!urineCr.isUrineCreatininePanelSource(examName, sample)) return;

    var full = resultFullText(exam);
    if (!full || full === "—") return;
    var items = matrixDisplay.parseExamSubitemsFromText(full, {
      examName: examName,
    });
    var colKey = String(exam.dataColetaISO || NO_DATE);
    var identity = urineCr.normalizeUrineCreatinineMatrixIdentity(
      "CREATININA",
      sample || "URINA",
    );
    for (var i = 0; i < items.length; i++) {
      if (!urineCr.isUrineCreatinineSubitemLabel(items[i].label)) continue;
      upsertMatrixCell(
        rows,
        identity.examName,
        identity.sample,
        colKey,
        hoistedUrineCreatinineExam(exam, identity.sample, items[i].value),
      );
      break;
    }
  }

  /**
   * @param {unknown} examsRaw
   * @returns {Record<string, unknown>[]}
   */
  function listExamsFromArchive(examsRaw) {
    if (!examsRaw || typeof examsRaw !== "object") return [];
    var byKey =
      /** @type {{ examsByKey?: Record<string, unknown> }} */ (examsRaw)
        .examsByKey &&
      typeof /** @type {{ examsByKey?: Record<string, unknown> }} */ (examsRaw)
        .examsByKey === "object"
        ? /** @type {{ examsByKey: Record<string, unknown> }} */ (examsRaw)
            .examsByKey
        : /** @type {Record<string, unknown>} */ (examsRaw);
    var out = [];
    for (var k in byKey) {
      if (Object.prototype.hasOwnProperty.call(byKey, k)) {
        var v = byKey[k];
        if (v && typeof v === "object") out.push(v);
      }
    }
    out.sort(function (a, b) {
      var ia = String(
        /** @type {{ dataColetaISO?: string }} */ (a).dataColetaISO || "",
      );
      var ib = String(
        /** @type {{ dataColetaISO?: string }} */ (b).dataColetaISO || "",
      );
      return ib.localeCompare(ia);
    });
    return out;
  }

  /**
   * @param {string} examName
   * @param {string} [sample]
   * @returns {string}
   */
  function formatExamNameWithSample(examName, sample) {
    var name = String(examName || "").trim() || "—";
    var s = String(sample || "").trim();
    return s ? name + " (" + s + ")" : name;
  }

  /**
   * @param {string} examName
   * @param {Record<string, Record<string, unknown>|null>} cells
   * @returns {string}
   */
  function examRowDisplayLabel(examName, cells) {
    for (var k in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, k)) continue;
      var exam = cells[k];
      if (exam && String(exam.sample || "").trim()) {
        return formatExamNameWithSample(examName, String(exam.sample).trim());
      }
    }
    return formatExamNameWithSample(examName);
  }

  function normalizeMultilineLabResult(text) {
    var t = String(text || "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!t || t.indexOf("\n") >= 0) return t;
    if (/\s\|\s/.test(t) && /:\s*[\d<≥≤+\-]/.test(t)) {
      return t
        .split(/\s*\|\s*/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean)
        .join("\n");
    }
    return t;
  }

  /**
   * @param {Record<string, unknown>} exam
   * @returns {string}
   */
  function resultFullText(exam) {
    var resolve = getExamResultResolve();
    if (resolve && resolve.resolveExamDisplayText) {
      var text = resolve.resolveExamDisplayText(exam);
      return text ? normalizeMultilineLabResult(text) : "—";
    }
    if (String(exam.result || "").trim()) return String(exam.result).trim();
    if (String(exam.fetchedResult || "").trim())
      return normalizeMultilineLabResult(String(exam.fetchedResult).trim());
    if (String(exam.detailText || "").trim())
      return normalizeMultilineLabResult(String(exam.detailText).trim());
    return "—";
  }

  /**
   * @param {unknown[]} exams
   * @param {number} [maxColumns]
   * @returns {{ columns: object[], rows: object[] }}
   */
  function buildExamMatrix(exams, maxColumns) {
    /** @type {Map<string, { key: string, dataISO: string|null, dataLabel: string|null }>} */
    var columnMeta = new Map();
    /** @type {Map<string, { examName: string, cells: Map<string, Record<string, unknown>> }>} */
    var rows = new Map();

    for (var i = 0; i < exams.length; i++) {
      var raw = exams[i];
      if (!raw || typeof raw !== "object") continue;
      var exam = ensureColetaFields(
        Object.assign({}, /** @type {Record<string, unknown>} */ (raw)),
      );
      if (resultPriority(exam) <= 0) continue;

      var examName = String(exam.examName || "").trim() || "—";
      var sample = String(exam.sample || "");
      var colKey = String(exam.dataColetaISO || NO_DATE);
      ensureColumnMeta(columnMeta, colKey, exam);

      var urineCr = getUrineCreatinineMatrix();
      var hemogram = getHemogramMatrix();
      var urineIdentity =
        urineCr && urineCr.normalizeUrineCreatinineMatrixIdentity
          ? urineCr.normalizeUrineCreatinineMatrixIdentity(examName, sample)
          : { examName: examName, sample: sample };
      var hemogramIdentity =
        hemogram && hemogram.normalizeHemogramMatrixIdentity
          ? hemogram.normalizeHemogramMatrixIdentity(
              urineIdentity.examName,
              urineIdentity.sample || sample,
            )
          : { examName: urineIdentity.examName, sample: urineIdentity.sample || sample };
      var identity = {
        examName: hemogramIdentity.examName,
        sample: hemogramIdentity.sample || urineIdentity.sample || sample,
      };
      var rawCellExam =
        identity.examName !== examName ||
        identity.sample !== sample ||
        urineIdentity.examName !== examName
          ? Object.assign({}, exam, {
              examName: identity.examName,
              sample: identity.sample || sample,
            })
          : exam;
      var cellExam =
        hemogram && hemogram.tagHemogramMatrixCell
          ? hemogram.tagHemogramMatrixCell(rawCellExam, examName)
          : rawCellExam;
      upsertMatrixCell(
        rows,
        identity.examName,
        identity.sample,
        colKey,
        cellExam,
      );
      maybeHoistUrineCreatinineFromPanel(rows, columnMeta, exam);
    }

    var datedKeys = [];
    columnMeta.forEach(function (_v, k) {
      if (k !== NO_DATE) datedKeys.push(k);
    });
    datedKeys.sort(function (a, b) {
      return a.localeCompare(b);
    });
    var hasNoDate = columnMeta.has(NO_DATE);

    var selectedKeys = datedKeys;
    if (
      maxColumns != null &&
      Number.isFinite(maxColumns) &&
      datedKeys.length > maxColumns
    ) {
      selectedKeys = datedKeys.slice(-maxColumns);
    }
    if (hasNoDate) selectedKeys = selectedKeys.concat([NO_DATE]);

    var columns = selectedKeys.map(function (k) {
      return columnMeta.get(k);
    });

    var categoriesApi = getExamCategories();
    var matrixRows = [];
    rows.forEach(function (row) {
      matrixRows.push(row);
    });

    var outRows = matrixRows
      .map(function (row) {
        /** @type {Record<string, Record<string, unknown>|null>} */
        var cells = {};
        var sample;
        row.cells.forEach(function (exam) {
          if (!sample && exam && String(exam.sample || "").trim()) {
            sample = String(exam.sample).trim();
          }
        });
        for (var ci = 0; ci < columns.length; ci++) {
          var col = columns[ci];
          cells[col.key] = row.cells.get(col.key) ?? null;
        }
        return {
          examName: row.examName,
          examNameKey: matrixRowKey(row.examName, sample),
          rowCategory:
            categoriesApi && categoriesApi.classifyExamPanel
              ? categoriesApi.classifyExamPanel(row.examName, sample)
              : undefined,
          cells: cells,
        };
      })
      .filter(function (row) {
        return Object.keys(row.cells).some(function (k) {
          return !!row.cells[k];
        });
      });

    if (categoriesApi && categoriesApi.compareExamPanelRows) {
      outRows.sort(categoriesApi.compareExamPanelRows);
    } else {
      outRows.sort(function (a, b) {
        return a.examName.localeCompare(b.examName, "pt-BR", {
          sensitivity: "base",
        });
      });
    }

    return { columns: columns, rows: outRows };
  }

  /**
   * @param {object} displayRow
   * @param {object[]} columns
   * @returns {string}
   */
  function renderDisplayRowHtml(displayRow, columns) {
    if (displayRow.kind === "principal") {
      var principalHtml =
        '<tr class="exams-row-principal"><th scope="row" class="exams-th-name exams-th-parent">' +
        escapeHtml(displayRow.label) +
        "</th>";
      for (var pi = 0; pi < columns.length; pi++) {
        var pCol = columns[pi];
        var pCell = displayRow.values[pCol.key];
        principalHtml +=
          '<td class="exams-cell-value">' +
          escapeHtml(pCell ? pCell.value : "—") +
          "</td>";
      }
      return principalHtml + "</tr>";
    }

    if (displayRow.kind === "parent") {
      var parentHtml =
        '<tr class="exams-row-parent"><th scope="row" class="exams-th-name exams-th-parent">' +
        escapeHtml(displayRow.label) +
        "</th>";
      for (var pai = 0; pai < columns.length; pai++) {
        parentHtml += '<td class="exams-cell-empty">—</td>';
      }
      return parentHtml + "</tr>";
    }

    if (displayRow.kind === "subitem") {
      var subHtml =
        '<tr class="exams-row-subitem"><th scope="row" class="exams-th-name exams-th-subitem">' +
        escapeHtml(displayRow.label) +
        "</th>";
      for (var si = 0; si < columns.length; si++) {
        var sCol = columns[si];
        var sCell = displayRow.values[sCol.key];
        subHtml +=
          '<td class="exams-cell-value">' +
          escapeHtml(sCell ? sCell.value : "—") +
          "</td>";
      }
      return subHtml + "</tr>";
    }

    var flatHtml =
      '<tr class="exams-row-flat"><th scope="row" class="exams-th-name">' +
      escapeHtml(displayRow.label) +
      "</th>";
    for (var fi = 0; fi < columns.length; fi++) {
      var fCol = columns[fi];
      var fExam = displayRow.cells[fCol.key];
      var fText = fExam ? resultFullText(fExam) : "—";
      flatHtml +=
        '<td class="exams-cell-multiline">' + escapeHtml(fText) + "</td>";
    }
    return flatHtml + "</tr>";
  }

  /**
   * @param {object} displayRow
   * @param {Set<string>|null} selectedFilter
   * @param {function|null} getRowKey
   * @returns {boolean}
   */
  function shouldIncludeDisplayRow(displayRow, selectedFilter, getRowKey) {
    if (!selectedFilter) return true;
    if (!getRowKey) return true;
    var key = getRowKey(displayRow);
    return !!key && selectedFilter.has(key);
  }

  /**
   * @param {unknown} examsRaw
   * @param {{ title?: string, maxColumns?: number, selectedRowKeys?: string[] }} [options]
   * @returns {string}
   */
  function buildExamsTableHtml(examsRaw, options) {
    var opts = options || {};
    var title = opts.title != null ? String(opts.title) : "Exames";
    var exams = listExamsFromArchive(examsRaw);
    var matrix = buildExamMatrix(exams, opts.maxColumns);
    if (!matrix.rows.length) return "";

    /** @type {Set<string>|null} */
    var selectedFilter = null;
    if (opts.selectedRowKeys !== undefined && opts.selectedRowKeys !== null) {
      if (!opts.selectedRowKeys.length) return "";
      selectedFilter = new Set(opts.selectedRowKeys);
    }

    var matrixDisplay = getExamMatrixDisplay();
    var expandRow =
      matrixDisplay && matrixDisplay.expandExamMatrixRowForDisplay
        ? matrixDisplay.expandExamMatrixRowForDisplay
        : null;
    var getRowKey =
      matrixDisplay && matrixDisplay.getExportRowKey
        ? matrixDisplay.getExportRowKey
        : null;
    var displayDeps = {
      resultFullText: resultFullText,
      examRowDisplayLabel: examRowDisplayLabel,
    };

    var thead =
      "<thead><tr><th class=\"exams-th-name\">Exame</th>";
    for (var ci = 0; ci < matrix.columns.length; ci++) {
      var col = matrix.columns[ci];
      thead +=
        "<th class=\"exams-th-date\">" +
        escapeHtml(col.dataLabel || "sem data") +
        "</th>";
    }
    thead += "</tr></thead>";

    var categoriesApi = getExamCategories();
    var tbody = "<tbody>";
    var hasDataRows = false;
    var sections =
      categoriesApi && categoriesApi.groupMatrixRows
        ? categoriesApi.groupMatrixRows(matrix.rows)
        : [{ category: { label: "", subtitle: "" }, rows: matrix.rows }];
    var colSpan = matrix.columns.length + 1;
    for (var si = 0; si < sections.length; si++) {
      var section = sections[si];
      var sectionHtml = "";
      for (var ri = 0; ri < section.rows.length; ri++) {
        var row = section.rows[ri];
        var displayRows = expandRow
          ? expandRow(row, matrix.columns, displayDeps)
          : [
              {
                kind: "flat",
                rowKey: row.examNameKey,
                label: examRowDisplayLabel(row.examName, row.cells),
                cells: row.cells,
              },
            ];
        for (var di = 0; di < displayRows.length; di++) {
          var displayRow = displayRows[di];
          if (
            !shouldIncludeDisplayRow(displayRow, selectedFilter, getRowKey)
          ) {
            continue;
          }
          sectionHtml += renderDisplayRowHtml(displayRow, matrix.columns);
        }
      }
      if (!sectionHtml) continue;
      hasDataRows = true;
      if (
        categoriesApi &&
        categoriesApi.formatCategoryTitle &&
        section.category &&
        section.category.label
      ) {
        tbody +=
          '<tr class="exams-category-header"><th colspan="' +
          colSpan +
          '" scope="colgroup" class="exams-category-title">' +
          escapeHtml(categoriesApi.formatCategoryTitle(section.category)) +
          "</th></tr>";
      }
      tbody += sectionHtml;
    }
    tbody += "</tbody>";
    if (!hasDataRows) return "";

    return (
      '<section class="exams-block">' +
      '<h2 class="exams-title">' +
      escapeHtml(title) +
      "</h2>" +
      '<table class="exams-table" cellspacing="0" cellpadding="0">' +
      thead +
      tbody +
      "</table></section>"
    );
  }

  return {
    NO_DATE: NO_DATE,
    listExamsFromArchive: listExamsFromArchive,
    buildExamMatrix: buildExamMatrix,
    resultFullText: resultFullText,
    formatExamNameWithSample: formatExamNameWithSample,
    examRowDisplayLabel: examRowDisplayLabel,
    buildExamsTableHtml: buildExamsTableHtml,
    escapeHtml: escapeHtml,
  };
});
