/**
 * Expansão de linhas da matriz de exames (itens/subitens) para impressão e preview.
 * Testável em Node via module.exports; extensão: global AghuExamMatrixDisplay.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamMatrixDisplay = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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
   * @param {string} line
   * @returns {{ label: string, value: string }|null}
   */
  function parseLabResultSubitem(line) {
    var t = String(line || "").trim();
    if (!t || t === "—") return null;

    var colon = t.match(/^([^:]+):\s*(.+)$/);
    if (colon) {
      var label = colon[1].trim();
      var value = colon[2].trim();
      if (label.length >= 2 && value.length >= 1) return { label: label, value: value };
    }

    var spaced = t.match(
      /^([A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇÜ][A-Za-záàâãéêíóôõúçüÁÀÂÃÉÊÍÓÔÕÚÇÜ.\s]{0,56}?)\s+(\S[\s\S]*)$/,
    );
    if (spaced) {
      var spLabel = spaced[1].replace(/\.+$/, "").trim();
      var spValue = spaced[2].trim();
      if (
        spLabel.length >= 2 &&
        /\d/.test(spValue) &&
        !/^(N[aã]o|Normal|Reagente|Positiv[oa]s?|Negativ[oa]s?|Ausentes?|Presentes?)$/i.test(
          spLabel,
        )
      ) {
        return { label: spLabel, value: spValue };
      }
    }

    return null;
  }

  var LEGEND_LABEL_RES = [
    /^-?\s*n[aã]o\s+reativ/i,
    /^-?\s*indeterminad/i,
    /^-?\s*reativ/i,
    /^aten[cç][aã]o$/i,
    /^coletada$/i,
    /^realiza[cç][aã]o$/i,
    /^nota\s+\d+$/i,
    /^foram\s+pesquisados$/i,
    /^\d+\)\s*pesquisa/i,
    /^-?\s*normoalbumin/i,
    /^-?\s*microalbumin/i,
    /^-?\s*macroalbumin/i,
  ];

  /**
   * @param {string} label
   * @param {string} [examName]
   * @returns {boolean}
   */
  function isLegendOrMetadataSubitem(label, examName) {
    var t = String(label || "").trim();
    if (!t) return true;
    if (/^valores de refer/i.test(t)) return true;
    if (/^obs\.?$/i.test(t)) return true;
    if (/^material$/i.test(t)) return true;
    for (var i = 0; i < LEGEND_LABEL_RES.length; i++) {
      if (LEGEND_LABEL_RES[i].test(t)) return true;
    }
    var n = normalizeLabelForMatch(t);
    var parentNorm = normalizeLabelForMatch(examName || "");
    if (
      parentNorm &&
      /ANTI|HIV|HCV|HBC|HBsAg|HEPATITE|SOROL/i.test(parentNorm) &&
      /^(NAO REATIVO|INDETERMINADO|REATIVO|NAO REAGENTE|REAGENTE)$/.test(n)
    ) {
      return true;
    }
    return false;
  }

  /**
   * @param {{ label: string, value: string }[]} items
   * @param {string} [examName]
   * @returns {{ label: string, value: string }[]}
   */
  function filterLegendSubitems(items, examName) {
    return items.filter(function (it) {
      return !isLegendOrMetadataSubitem(it.label, examName);
    });
  }

  function normalizeExamNameForMatch(examName) {
    return String(examName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function isHemogramRowExamName(examName) {
    var n = normalizeExamNameForMatch(examName);
    if (!n) return false;
    if (/\bHEMOGRAMA\b/.test(n)) return true;
    return (
      /\bHEMATOCRITO\b/.test(n) &&
      /\bHEMOGLOBINA\b/.test(n) &&
      /\bLEUCOCITOS\b/.test(n) &&
      /\bPLAQUETAS\b/.test(n)
    );
  }

  function repairMatrixCellText(text, examName) {
    if (!isHemogramRowExamName(examName)) return String(text || "").trim();
    var lab = getLabParse();
    if (lab && typeof lab.repairHemogramLaudoText === "function") {
      return lab.repairHemogramLaudoText(String(text || ""));
    }
    return String(text || "").trim();
  }

  function isPlaquetasSubitemLabel(label) {
    return /\bPLAQUETAS\b/i.test(String(label || ""));
  }

  function isBogusPlaquetasSubitemValue(value) {
    var v = String(value || "").trim();
    if (!v) return true;
    if (/^ERITROGRAMA\b/i.test(v)) return true;
    if (
      /\b(HEMAT[ÓO]CRITO|HEMOGLOBINA|LEUC[ÓO]CITOS|ERITR[ÓO]CITOS)\b/i.test(v) &&
      !/^[\d<≥≤]/.test(v)
    ) {
      return true;
    }
    return false;
  }

  function isValidPlaquetasSubitemValue(value) {
    var v = String(value || "").trim();
    if (!v || isBogusPlaquetasSubitemValue(v)) return false;
    return /[\d]/.test(v);
  }

  /**
   * Duplicata de label: última linha prevalece; PLAQUETAS prefere valor numérico.
   * @param {{ label: string, value: string }[]} items
   * @returns {{ label: string, value: string }[]}
   */
  function dedupeSubitemsByLabel(items) {
    if (!items || !items.length) return [];
    /** @type {Record<string, { label: string, value: string }>} */
    var bestByLabel = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var key = it.label;
      var prev = bestByLabel[key];
      if (!prev) {
        bestByLabel[key] = it;
        continue;
      }
      if (isPlaquetasSubitemLabel(key)) {
        var prevOk = isValidPlaquetasSubitemValue(prev.value);
        var curOk = isValidPlaquetasSubitemValue(it.value);
        if (curOk && !prevOk) bestByLabel[key] = it;
        else if (curOk || !prevOk) bestByLabel[key] = it;
      } else {
        bestByLabel[key] = it;
      }
    }
    var seen = {};
    var out = [];
    for (var j = 0; j < items.length; j++) {
      var lbl = items[j].label;
      if (seen[lbl]) continue;
      seen[lbl] = true;
      if (bestByLabel[lbl]) out.push(bestByLabel[lbl]);
    }
    return out;
  }

  function isBilirubinPanelExamName(examName) {
    var lab = getLabParse();
    if (lab && lab.isBilirubinPanelExamName) {
      return lab.isBilirubinPanelExamName(examName);
    }
    var n = String(examName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (n.indexOf("BILIRRUBINA") < 0) return false;
    return (
      n.indexOf("FRAC") >= 0 ||
      n.indexOf("TOTAL") >= 0 ||
      n.indexOf("TOTAIS") >= 0
    );
  }

  function parseExamSubitemsFromText(text, opts) {
    opts = opts || {};
    var normalized = normalizeMultilineLabResult(text);
    if (!normalized || normalized === "—") return [];

    if (opts.examName && isHemogramRowExamName(opts.examName)) {
      normalized = repairMatrixCellText(normalized, opts.examName);
      if (!normalized) return [];
    }

    if (opts.examName && isBilirubinPanelExamName(opts.examName)) {
      var labParse = getLabParse();
      if (labParse && labParse.ensureBilirubinIndirectLines) {
        normalized = labParse
          .ensureBilirubinIndirectLines(
            normalized
              .split(/\r?\n/)
              .map(function (l) {
                return l.trim();
              })
              .filter(Boolean)
          )
          .join("\n");
      }
    }

    var lines = normalized
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    if (!lines.length) return [];

    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var parsed = parseLabResultSubitem(lines[i]);
      if (!parsed) continue;
      items.push(parsed);
    }
    if (!items.length) return [];
    if (!opts.skipLegendFilter && opts.examName) {
      items = filterLegendSubitems(items, opts.examName);
    } else if (!opts.skipLegendFilter) {
      items = filterLegendSubitems(items, "");
    }
    return dedupeSubitemsByLabel(items);
  }

  function getLabParse() {
    return typeof globalThis !== "undefined" && globalThis.AghuPdfLabParse
      ? globalThis.AghuPdfLabParse
      : null;
  }

  function getQualitativePanels() {
    return typeof globalThis !== "undefined" && globalThis.AghuQualitativePanels
      ? globalThis.AghuQualitativePanels
      : null;
  }

  function getDisplayFormat() {
    return typeof globalThis !== "undefined" && globalThis.AghuExamDisplayFormat
      ? globalThis.AghuExamDisplayFormat
      : null;
  }

  function resolveQualitativePanel(examName) {
    var qp = getQualitativePanels();
    if (qp && qp.resolveQualitativePanel) {
      return qp.resolveQualitativePanel(examName);
    }
    return null;
  }

  function isGenericResultLabel(label) {
    var qp = getQualitativePanels();
    if (qp && qp.isGenericResultLabel) return qp.isGenericResultLabel(label);
    return /^RESULTADO$/i.test(String(label || "").trim());
  }

  function formatCellValue(value, examName) {
    var fmt = getDisplayFormat();
    if (fmt && fmt.formatExamCellDisplay) {
      return fmt.formatExamCellDisplay(String(value || ""), examName);
    }
    return String(value || "").trim();
  }

  function isQualitativePanelExamName(examName) {
    return !!resolveQualitativePanel(examName);
  }

  function isGasometryExamName(examName) {
    var lab = getLabParse();
    if (lab && lab.isGasometryExamName) return lab.isGasometryExamName(examName);
    return String(examName || "").toUpperCase().indexOf("GASOMETRIA") >= 0;
  }

  function isEasExamName(examName) {
    var lab = getLabParse();
    if (lab && lab.isEasExamName) return lab.isEasExamName(examName);
    return /\bEAS\b/i.test(String(examName || ""));
  }

  function isAnatomopathologyExamName(examName) {
    var lab = getLabParse();
    return !!(lab && lab.isAnatomopathologyExamName && lab.isAnatomopathologyExamName(examName));
  }

  function easDisplayLabels(lab) {
    return lab.EAS_DISPLAY_ORDER ? lab.EAS_DISPLAY_ORDER.slice() : [];
  }

  function gasometryDisplayLabels(lab) {
    return lab.GASOMETRY_DISPLAY_ORDER.map(function (sig) {
      return lab.GASOMETRY_DISPLAY_LABELS[sig] || sig;
    });
  }

  /**
   * Extrai os 7 analitos de gasometria por célula (ordem fixa, mapeamento por coluna).
   * @param {string} text
   * @param {object} lab
   * @returns {{ label: string, value: string }[]}
   */
  function parseGasometryCellSubitems(text, lab) {
    var fixedLabels = gasometryDisplayLabels(lab);
    /** @type {Record<string, string|null>} */
    var byLabel = {};
    for (var fi = 0; fi < fixedLabels.length; fi++) {
      byLabel[fixedLabels[fi]] = null;
    }

    text = String(text || "").trim();
    if (!text || text === "—") {
      return fixedLabels.map(function (l) {
        return { label: l, value: "—" };
      });
    }

    var filtered = lab.filterGasometryParsedText(text);
    if (!filtered) {
      filtered =
        lab.parsePdfText(text, {
          gasometryOnly: true,
          deps: lab.resolveGasometryParseDeps
            ? lab.resolveGasometryParseDeps()
            : undefined,
        }) || "";
    }

    var lines = filtered
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    for (var li = 0; li < lines.length; li++) {
      var m = lines[li].match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      var lbl = m[1].trim();
      var val = m[2].trim();
      if (Object.prototype.hasOwnProperty.call(byLabel, lbl)) {
        byLabel[lbl] = val;
      }
    }

    if (!lines.length) {
      var loose = parseExamSubitemsFromText(text, { skipLegendFilter: true });
      for (var lj = 0; lj < loose.length; lj++) {
        var looseLbl = loose[lj].label;
        if (Object.prototype.hasOwnProperty.call(byLabel, looseLbl)) {
          byLabel[looseLbl] = loose[lj].value;
        }
      }
    }

    var hasAny = false;
    for (var bk = 0; bk < fixedLabels.length; bk++) {
      if (byLabel[fixedLabels[bk]] != null) {
        hasAny = true;
        break;
      }
    }

    if (
      !lines.length &&
      !hasAny &&
      /^[\d,\.\-<≥≤+]+\s*%?$/.test(text) &&
      text.indexOf(":") < 0
    ) {
      byLabel.SATO2 = text;
    }

    return fixedLabels.map(function (l) {
      return { label: l, value: byLabel[l] != null ? byLabel[l] : "—" };
    });
  }

  /**
   * @param {object} row
   * @param {object[]} columns
   * @param {{ resultFullText: function, examRowDisplayLabel: function }} deps
   * @returns {object[]}
   */
  function expandGasometryMatrixRow(row, columns, deps) {
    var lab = getLabParse();
    if (!lab) {
      throw new Error("expandGasometryMatrixRow requer AghuPdfLabParse");
    }

    var cells = row.cells || {};
    var parentLabel = deps.examRowDisplayLabel(row.examName, cells);
    /** @type {Record<string, { label: string, value: string }[]>} */
    var byCol = {};

    for (var ci = 0; ci < columns.length; ci++) {
      var col = columns[ci];
      var cellExam = cells[col.key];
      var full = cellExam ? deps.resultFullText(cellExam) : "";
      byCol[col.key] = parseGasometryCellSubitems(full === "—" ? "" : full, lab);
    }

    var fixedLabels = gasometryDisplayLabels(lab);
    var out = [
      {
        kind: "parent",
        rowKey: row.examNameKey,
        label: parentLabel,
      },
    ];

    for (var li = 0; li < fixedLabels.length; li++) {
      var label = fixedLabels[li];
      /** @type {Record<string, { value: string }>} */
      var values = {};
      for (var cj = 0; cj < columns.length; cj++) {
        var col2 = columns[cj];
        var items = byCol[col2.key] || [];
        var hit = null;
        for (var hi = 0; hi < items.length; hi++) {
          if (items[hi].label === label) {
            hit = items[hi];
            break;
          }
        }
        values[col2.key] = { value: hit && hit.value !== "—" ? hit.value : "—" };
      }
      out.push({
        kind: "subitem",
        rowKey: row.examNameKey,
        subitemKey: row.examNameKey + "::gaso::" + label,
        label: label,
        values: values,
      });
    }

    return out;
  }

  /**
   * @param {string} text
   * @param {string} examName
   * @returns {{ label: string, value: string }[]}
   */
  function parseQualitativePanelCellSubitems(text, examName) {
    var qp = getQualitativePanels();
    var panel = resolveQualitativePanel(examName);
    if (!qp || !panel || !qp.parseQualitativePanelSubitems) {
      return [];
    }
    var items = qp.parseQualitativePanelSubitems(text, examName);
    if (!items || !items.length) return [];
    return items.map(function (it) {
      var val =
        it.value != null && it.value !== "—"
          ? formatCellValue(it.value, examName)
          : "—";
      return { label: it.label, value: val || "—" };
    });
  }

  /**
   * @param {object} row
   * @param {object[]} columns
   * @param {{ resultFullText: function, examRowDisplayLabel: function }} deps
   * @returns {object[]}
   */
  function expandQualitativePanelMatrixRow(row, columns, deps) {
    var panel = resolveQualitativePanel(row.examName);
    if (!panel) {
      throw new Error("expandQualitativePanelMatrixRow requer painel registrado");
    }

    var cells = row.cells || {};
    var parentLabel = deps.examRowDisplayLabel(row.examName, cells);
    var fixedLabels = panel.subitems;
    /** @type {Record<string, { label: string, value: string }[]>} */
    var byCol = {};

    for (var ci = 0; ci < columns.length; ci++) {
      var col = columns[ci];
      var cellExam = cells[col.key];
      var full = cellExam ? deps.resultFullText(cellExam) : "";
      byCol[col.key] = parseQualitativePanelCellSubitems(
        full === "—" ? "" : full,
        row.examName,
      );
    }

    var out = [
      {
        kind: "parent",
        rowKey: row.examNameKey,
        label: parentLabel,
      },
    ];

    for (var li = 0; li < fixedLabels.length; li++) {
      var label = fixedLabels[li];
      /** @type {Record<string, { value: string }>} */
      var values = {};
      for (var cj = 0; cj < columns.length; cj++) {
        var col2 = columns[cj];
        var items = byCol[col2.key] || [];
        var hit = null;
        for (var hi = 0; hi < items.length; hi++) {
          if (items[hi].label === label) {
            hit = items[hi];
            break;
          }
        }
        values[col2.key] = { value: hit && hit.value !== "—" ? hit.value : "—" };
      }
      out.push({
        kind: "subitem",
        rowKey: row.examNameKey,
        subitemKey: row.examNameKey + "::panel::" + label,
        label: label,
        values: values,
      });
    }

    return out;
  }

  /**
   * @param {string} text
   * @param {object} lab
   * @returns {{ label: string, value: string }[]}
   */
  function parseEasCellSubitems(text, lab) {
    var fixedLabels = easDisplayLabels(lab);
    /** @type {Record<string, string|null>} */
    var byLabel = {};
    for (var fi = 0; fi < fixedLabels.length; fi++) {
      byLabel[fixedLabels[fi]] = null;
    }

    text = String(text || "").trim();
    if (!text || text === "—") {
      return fixedLabels.map(function (l) {
        return { label: l, value: "—" };
      });
    }

    var fromFormatted = lab.filterEasParsedText(text);
    var formattedCount = String(fromFormatted || "")
      .split(/\r?\n/)
      .filter(Boolean).length;
    var filtered = fromFormatted;
    if (formattedCount < 3 && lab.parseEasPdfText) {
      var fromRaw = lab.filterEasParsedText(lab.parseEasPdfText(text));
      var rawCount = String(fromRaw || "")
        .split(/\r?\n/)
        .filter(Boolean).length;
      if (rawCount > formattedCount) filtered = fromRaw;
    }

    var lines = String(filtered || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    for (var li = 0; li < lines.length; li++) {
      var m = lines[li].match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      var lbl = m[1].trim();
      var val = m[2].trim();
      if (Object.prototype.hasOwnProperty.call(byLabel, lbl)) {
        byLabel[lbl] = val;
      }
    }

    return fixedLabels.map(function (l) {
      return { label: l, value: byLabel[l] != null ? byLabel[l] : "—" };
    });
  }

  /**
   * @param {object} row
   * @param {object[]} columns
   * @param {{ resultFullText: function, examRowDisplayLabel: function }} deps
   * @returns {object[]}
   */
  function expandEasMatrixRow(row, columns, deps) {
    var lab = getLabParse();
    if (!lab) {
      throw new Error("expandEasMatrixRow requer AghuPdfLabParse");
    }

    var cells = row.cells || {};
    var parentLabel = deps.examRowDisplayLabel(row.examName, cells);
    var fixedLabels = easDisplayLabels(lab);
    /** @type {Record<string, { label: string, value: string }[]>} */
    var byCol = {};

    for (var ci = 0; ci < columns.length; ci++) {
      var col = columns[ci];
      var cellExam = cells[col.key];
      var full = cellExam ? deps.resultFullText(cellExam) : "";
      byCol[col.key] = parseEasCellSubitems(full === "—" ? "" : full, lab);
    }

    var out = [
      {
        kind: "parent",
        rowKey: row.examNameKey,
        label: parentLabel,
      },
    ];

    for (var li = 0; li < fixedLabels.length; li++) {
      var label = fixedLabels[li];
      /** @type {Record<string, { value: string }>} */
      var values = {};
      for (var cj = 0; cj < columns.length; cj++) {
        var col2 = columns[cj];
        var items = byCol[col2.key] || [];
        var hit = null;
        for (var hi = 0; hi < items.length; hi++) {
          if (items[hi].label === label) {
            hit = items[hi];
            break;
          }
        }
        values[col2.key] = { value: hit && hit.value !== "—" ? hit.value : "—" };
      }
      out.push({
        kind: "subitem",
        rowKey: row.examNameKey,
        subitemKey: row.examNameKey + "::eas::" + label,
        label: label,
        values: values,
      });
    }

    return out;
  }

  function normalizeLabelForMatch(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  /**
   * @param {string} examName
   * @param {string[]} labels
   * @returns {string|null}
   */
  function findPrimarySubitemLabel(examName, labels) {
    if (!labels.length) return null;
    if (labels.length === 1) return labels[0];

    var parentNorm = normalizeLabelForMatch(examName);

    for (var bi = 0; bi < labels.length; bi++) {
      var n = normalizeLabelForMatch(labels[bi]);
      if (
        n === "BILIRRUBINA TOTAL" ||
        (n.indexOf("BILIRRUBINA") >= 0 &&
          n.indexOf("TOTAL") >= 0 &&
          n.indexOf("DIRETA") < 0 &&
          n.indexOf("INDIRETA") < 0)
      ) {
        if (parentNorm.indexOf("BILIRRUBINA") >= 0) return labels[bi];
      }
    }

    for (var ti = 0; ti < labels.length; ti++) {
      var tn = normalizeLabelForMatch(labels[ti]);
      if (
        tn.indexOf("TEMPO") >= 0 &&
        tn.indexOf("PROTROMBINA") >= 0 &&
        tn.indexOf("TROMBOPLASTINA") < 0
      ) {
        if (
          parentNorm.indexOf("PROTROMBINA") >= 0 &&
          parentNorm.indexOf("TROMBOPLASTINA") < 0
        ) {
          return labels[ti];
        }
      }
    }

    for (var si = 0; si < labels.length; si++) {
      var sn = normalizeLabelForMatch(labels[si]);
      if (parentNorm.indexOf("HIV") >= 0 && sn.indexOf("ANTI") >= 0 && sn.indexOf("HIV") >= 0) {
        return labels[si];
      }
      if (parentNorm.indexOf("HBSAG") >= 0 && sn.indexOf("HBSAG") >= 0) {
        return labels[si];
      }
      if (parentNorm.indexOf("HBC") >= 0 && sn.indexOf("HBC") >= 0) {
        return labels[si];
      }
    }

    return null;
  }

  /**
   * @param {string} label
   * @param {object[]} columns
   * @param {Record<string, unknown>} cells
   * @param {Record<string, { label: string, value: string }[]>} byCol
   * @returns {Record<string, { value: string }>}
   */
  function buildSubitemValues(label, columns, cells, byCol) {
    /** @type {Record<string, { value: string }>} */
    var values = {};
    var pqtFmt = typeof globalThis !== "undefined" ? globalThis.AghuExamPlaquetasFormat : null;
    var formatPqt =
      pqtFmt &&
      pqtFmt.isPlaquetasAnalyte &&
      pqtFmt.isPlaquetasAnalyte(label) &&
      typeof pqtFmt.formatPlaquetasDisplay === "function";
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var colItems = byCol[col.key] || [];
      var hit = null;
      for (var j = colItems.length - 1; j >= 0; j--) {
        if (colItems[j].label !== label) continue;
        if (
          formatPqt &&
          isBogusPlaquetasSubitemValue(colItems[j].value)
        ) {
          continue;
        }
        hit = colItems[j];
        break;
      }
      if (!hit && formatPqt) {
        for (var k = colItems.length - 1; k >= 0; k--) {
          if (colItems[k].label === label) {
            hit = colItems[k];
            break;
          }
        }
      }
      var val = hit ? hit.value : "—";
      if (formatPqt && val !== "—") {
        val = pqtFmt.formatPlaquetasDisplay(val);
      }
      values[col.key] = { value: val };
    }
    return values;
  }

  /**
   * @param {Record<string, { label: string, value: string }[]>} byCol
   * @param {string[]} columnKeys
   * @returns {string[]}
   */
  function subitemLabelOrder(byCol, columnKeys) {
    var seen = {};
    var order = [];
    for (var ki = 0; ki < columnKeys.length; ki++) {
      var items = byCol[columnKeys[ki]] || [];
      for (var ii = 0; ii < items.length; ii++) {
        var lbl = items[ii].label;
        if (!seen[lbl]) {
          seen[lbl] = true;
          order.push(lbl);
        }
      }
    }
    return order;
  }

  /**
   * @param {Record<string, unknown>} cells
   * @param {string[]} columnKeys
   * @param {{ resultFullText: function }} deps
   * @returns {boolean}
   */
  function shouldExpandMatrixRowSubitems(cells, columnKeys, deps, examName) {
    if (examName && isGasometryExamName(examName)) return true;
    if (examName && isEasExamName(examName)) return true;
    if (examName && isQualitativePanelExamName(examName)) return true;

    var maxSubitems = 0;
    var hasText = false;
    var legendCount = 0;
    var totalItems = 0;

    for (var i = 0; i < columnKeys.length; i++) {
      var exam = cells[columnKeys[i]];
      if (!exam) continue;
      var full = deps.resultFullText(exam);
      if (!full || full === "—") continue;
      hasText = true;
      var rawItems = parseExamSubitemsFromText(full, { skipLegendFilter: true });
      if (!rawItems.length) return false;
      var items = filterLegendSubitems(rawItems, examName || "");
      items = items.filter(function (it) {
        return !isGenericResultLabel(it.label);
      });
      if (!items.length) return false;
      totalItems += items.length;
      for (var ri = 0; ri < rawItems.length; ri++) {
        if (isLegendOrMetadataSubitem(rawItems[ri].label, examName || "")) {
          legendCount++;
        }
      }
      if (items.length > maxSubitems) maxSubitems = items.length;
    }

    if (!hasText || maxSubitems < 1) return false;
    if (totalItems > 0 && legendCount / totalItems > 0.5) return false;
    return maxSubitems >= 2;
  }

  /**
   * @param {object[]} columns
   * @param {Record<string, string>} principalByCol
   * @returns {Record<string, { value: string }>}
   */
  function buildAnatomopathologyPrincipalValues(columns, principalByCol) {
    /** @type {Record<string, { value: string }>} */
    var values = {};
    for (var pi = 0; pi < columns.length; pi++) {
      var pCol = columns[pi];
      values[pCol.key] = { value: principalByCol[pCol.key] || "—" };
    }
    return values;
  }

  /**
   * Anatomopatológico: 1ª linha = topografia:resultado (principal); demais = subitens.
   * @param {object} row
   * @param {object[]} columns
   * @param {{ resultFullText: function, examRowDisplayLabel: function }} deps
   * @returns {object[]}
   */
  function expandAnatomopathologyMatrixRow(row, columns, deps) {
    var cells = row.cells || {};
    var columnKeys = columns.map(function (c) {
      return c.key;
    });
    var parentLabel = deps.examRowDisplayLabel(row.examName, cells);
    /** @type {Record<string, string>} */
    var principalByCol = {};
    /** @type {Record<string, { label: string, value: string }[]>} */
    var byCol = {};

    for (var ci = 0; ci < columns.length; ci++) {
      var col = columns[ci];
      var cellExam = cells[col.key];
      var full = cellExam ? deps.resultFullText(cellExam) : "";
      var resolved = full && full !== "—" ? full : "";
      var lines = resolved
        .split(/\r?\n/)
        .map(function (l) {
          return l.trim();
        })
        .filter(Boolean);
      principalByCol[col.key] = lines[0] || "—";
      var rest = lines.slice(1).join("\n");
      byCol[col.key] = rest
        ? parseExamSubitemsFromText(rest, { examName: row.examName })
        : [];
    }

    var labels = subitemLabelOrder(byCol, columnKeys);
    var out = [
      {
        kind: "principal",
        rowKey: row.examNameKey,
        label: parentLabel,
        values: buildAnatomopathologyPrincipalValues(columns, principalByCol),
      },
    ];

    for (var si = 0; si < labels.length; si++) {
      var secLabel = labels[si];
      out.push({
        kind: "subitem",
        rowKey: row.examNameKey,
        subitemKey: row.examNameKey + "::ap::" + secLabel,
        label: secLabel,
        values: buildSubitemValues(secLabel, columns, cells, byCol),
      });
    }

    return out;
  }

  /**
   * @param {object} row
   * @param {object[]} columns
   * @param {{ resultFullText: function, examRowDisplayLabel: function }} deps
   * @returns {object[]}
   */
  function expandExamMatrixRowForDisplay(row, columns, deps) {
    if (!deps || typeof deps.resultFullText !== "function") {
      throw new Error("expandExamMatrixRowForDisplay requer deps.resultFullText");
    }
    if (typeof deps.examRowDisplayLabel !== "function") {
      throw new Error("expandExamMatrixRowForDisplay requer deps.examRowDisplayLabel");
    }

    var cells = row.cells || {};
    var columnKeys = columns.map(function (c) {
      return c.key;
    });
    var parentLabel = deps.examRowDisplayLabel(row.examName, cells);

    if (isGasometryExamName(row.examName)) {
      return expandGasometryMatrixRow(row, columns, deps);
    }

    if (isEasExamName(row.examName)) {
      return expandEasMatrixRow(row, columns, deps);
    }

    if (isQualitativePanelExamName(row.examName)) {
      return expandQualitativePanelMatrixRow(row, columns, deps);
    }

    if (isAnatomopathologyExamName(row.examName)) {
      return expandAnatomopathologyMatrixRow(row, columns, deps);
    }

    if (!shouldExpandMatrixRowSubitems(cells, columnKeys, deps, row.examName)) {
      return [
        {
          kind: "flat",
          rowKey: row.examNameKey,
          label: parentLabel,
          cells: cells,
        },
      ];
    }

    /** @type {Record<string, { label: string, value: string }[]>} */
    var byCol = {};
    for (var ci = 0; ci < columns.length; ci++) {
      var col = columns[ci];
      var cellExam = cells[col.key];
      var full = cellExam ? deps.resultFullText(cellExam) : "";
      if (full && full !== "—" && isHemogramRowExamName(row.examName)) {
        full = repairMatrixCellText(full, row.examName) || full;
      }
      byCol[col.key] = full
        ? parseExamSubitemsFromText(full, {
            examName: row.examName,
          })
        : [];
    }

    var labels = subitemLabelOrder(byCol, columnKeys);
    var urineCr = getUrineCreatinineMatrix();
    var panelSample = "";
    for (var psi = 0; psi < columnKeys.length; psi++) {
      var panelExam = cells[columnKeys[psi]];
      if (panelExam && String(panelExam.sample || "").trim()) {
        panelSample = String(panelExam.sample).trim();
        break;
      }
    }
    if (urineCr && urineCr.isUrineCreatininePanelSource(row.examName, panelSample)) {
      labels = labels.filter(function (lbl) {
        return !urineCr.isUrineCreatinineSubitemLabel(lbl);
      });
    }
    var primaryLabel = findPrimarySubitemLabel(row.examName, labels);
    var out = [];

    if (primaryLabel) {
      out.push({
        kind: "principal",
        rowKey: row.examNameKey,
        label: parentLabel,
        values: buildSubitemValues(primaryLabel, columns, cells, byCol),
      });
    } else if (labels.length >= 2) {
      out.push({
        kind: "parent",
        rowKey: row.examNameKey,
        label: parentLabel,
      });
    }

    var secondaryLabels = primaryLabel
      ? labels.filter(function (l) {
          return l !== primaryLabel;
        })
      : labels;

    for (var si = 0; si < secondaryLabels.length; si++) {
      var secLabel = secondaryLabels[si];
      out.push({
        kind: "subitem",
        rowKey: row.examNameKey,
        subitemKey: row.examNameKey + "::" + secLabel,
        label: secLabel,
        values: buildSubitemValues(secLabel, columns, cells, byCol),
      });
    }

    return out;
  }

  /**
   * @param {object} row
   * @returns {string|null}
   */
  function getExportRowKey(row) {
    if (!row || row.kind === "parent") return null;
    if (row.kind === "flat") return row.rowKey + "::flat";
    if (row.kind === "principal") return row.rowKey + "::principal";
    return row.subitemKey;
  }

  return {
    normalizeMultilineLabResult: normalizeMultilineLabResult,
    parseLabResultSubitem: parseLabResultSubitem,
    parseExamSubitemsFromText: parseExamSubitemsFromText,
    isLegendOrMetadataSubitem: isLegendOrMetadataSubitem,
    filterLegendSubitems: filterLegendSubitems,
    isGasometryExamName: isGasometryExamName,
    isEasExamName: isEasExamName,
    parseGasometryCellSubitems: parseGasometryCellSubitems,
    parseEasCellSubitems: parseEasCellSubitems,
    expandGasometryMatrixRow: expandGasometryMatrixRow,
    expandEasMatrixRow: expandEasMatrixRow,
    isQualitativePanelExamName: isQualitativePanelExamName,
    parseQualitativePanelCellSubitems: parseQualitativePanelCellSubitems,
    expandQualitativePanelMatrixRow: expandQualitativePanelMatrixRow,
    findPrimarySubitemLabel: findPrimarySubitemLabel,
    expandExamMatrixRowForDisplay: expandExamMatrixRowForDisplay,
    getExportRowKey: getExportRowKey,
  };
});
