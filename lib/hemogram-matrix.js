/**
 * Hemograma — linha única na matriz (HEMOGRAMA + painel parcial Ht/Hb/Leuco/Pqt).
 * Testável em Node; extensão/passômetro: require("./hemogram-matrix.js").
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuHemogramMatrix = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HEMOGRAM_MATRIX_ROW_KEY = "hemograma|sangue";
  var HEMOGRAM_CANONICAL_NAME = "HEMOGRAMA";

  /** @param {string} s */
  function normalizeForMatch(s) {
    var t = String(s || "").trim();
    try {
      t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      t = t.replace(/[\u0300-\u036f]/g, "");
    }
    return t.toUpperCase();
  }

  function resolveSigla(label) {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuExamSiglas &&
      typeof globalThis.AghuExamSiglas.resolveSigla === "function"
    ) {
      return globalThis.AghuExamSiglas.resolveSigla(label);
    }
    return String(label || "").trim();
  }

  function getParseExamSubitems() {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuExamMatrixDisplay &&
      typeof globalThis.AghuExamMatrixDisplay.parseExamSubitemsFromText ===
        "function"
    ) {
      return globalThis.AghuExamMatrixDisplay.parseExamSubitemsFromText;
    }
    return parseExamSubitemsFallback;
  }

  function getPdfLabParse() {
    if (typeof globalThis !== "undefined" && globalThis.AghuPdfLabParse) {
      return globalThis.AghuPdfLabParse;
    }
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./pdf-lab-parse.js");
      } catch (_e) {
        /* ignore */
      }
    }
    return null;
  }

  function normalizePartialPanelLaudoText(text) {
    var lab = getPdfLabParse();
    if (lab && typeof lab.repairHemogramLaudoText === "function") {
      return lab.repairHemogramLaudoText(text);
    }
    return String(text || "").trim();
  }

  /** @param {string} line */
  function parseLabResultSubitem(line) {
    var t = String(line || "").trim();
    if (!t || t === "—") return null;

    var colon = t.match(/^([^:]+):\s*(.+)$/);
    if (colon) {
      var label = colon[1].trim();
      var value = colon[2].trim();
      if (label.length >= 2 && value.length >= 1) {
        return { label: label, value: value };
      }
    }

    var spaced = t.match(
      /^([A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇÜ][A-Za-záàâãéêíóôõúçüÁÀÂÃÉÊÍÓÔÕÚÇÜ.\s]{0,56}?)\s+(\S[\s\S]*)$/,
    );
    if (spaced) {
      var spLabel = spaced[1].replace(/\.+$/, "").trim();
      var spValue = spaced[2].trim();
      if (spLabel.length >= 2 && /\d/.test(spValue)) {
        return { label: spLabel, value: spValue };
      }
    }
    return null;
  }

  /**
   * @param {string} text
   * @param {{ examName?: string }} [opts]
   */
  function parseExamSubitemsFallback(text, opts) {
    opts = opts || {};
    var normalized = String(text || "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!normalized || normalized === "—") return [];

    var lines = normalized
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var parsed = parseLabResultSubitem(lines[i]);
      if (parsed) items.push(parsed);
    }
    return items;
  }

  /** @param {string} text */
  function countSubitemLines(text) {
    return getParseExamSubitems()(text).length;
  }

  /** @param {string} text */
  function countPanelSubitemLines(text) {
    return countSubitemLines(text);
  }

  /**
   * @param {Record<string, unknown>|null|undefined} cell
   * @returns {string}
   */
  function getPartialHemogramSourceName(cell) {
    if (!cell) return "";
    var tagged = String(cell._hemogramSourceExamName || "").trim();
    if (tagged && isPartialHemogramPanel(tagged)) return tagged;
    var examName = String(cell.examName || "").trim();
    if (isPartialHemogramPanel(examName)) return examName;
    return "";
  }

  /**
   * Painel parcial: grid AGHU costuma trazer só Hb em result; laudo completo em detail/fetched.
   * @param {Record<string, unknown>|null|undefined} cell
   * @returns {string}
   */
  function pickRichestPartialHemogramPanelText(cell) {
    if (!getPartialHemogramSourceName(cell)) return "";
    var candidates = [
      String(cell.fetchedResult || "").trim(),
      String(cell.detailText || "").trim(),
      String(cell.result || "").trim(),
    ].filter(Boolean);
    if (!candidates.length) return "";

    var best = "";
    var bestCount = -1;
    for (var ci = 0; ci < candidates.length; ci++) {
      var normalized = normalizePartialPanelLaudoText(candidates[ci]);
      if (!normalized) continue;
      var count = countPanelSubitemLines(normalized);
      if (count > bestCount) {
        bestCount = count;
        best = normalized;
      }
    }
    return best;
  }

  /** @param {string} examName */
  function isFullHemogramExam(examName) {
    var n = normalizeForMatch(examName);
    if (!n) return false;
    if (isPartialHemogramPanel(examName)) return false;
    return /\bHEMOGRAMA\b/.test(n);
  }

  /** @param {string} examName */
  function isPartialHemogramPanel(examName) {
    var n = normalizeForMatch(examName);
    if (!n || /\bHEMOGRAMA\b/.test(n)) return false;
    return (
      /\bHEMATOCRITO\b/.test(n) &&
      /\bHEMOGLOBINA\b/.test(n) &&
      /\bLEUCOCITOS\b/.test(n) &&
      /\bPLAQUETAS\b/.test(n)
    );
  }

  /** @param {string} examName */
  function isHemogramMatrixExam(examName) {
    return isFullHemogramExam(examName) || isPartialHemogramPanel(examName);
  }

  /** @param {string} label */
  function hemogramAnalyteKey(label) {
    var sigla = resolveSigla(label);
    if (sigla) return normalizeForMatch(sigla);
    return normalizeForMatch(label);
  }

  /**
   * @param {string} examName
   * @param {string} [sample]
   * @returns {{ examName: string, sample: string }}
   */
  function normalizeHemogramMatrixIdentity(examName, sample) {
    var name = String(examName || "").trim() || "—";
    var sampleStr = String(sample || "").trim();
    if (!isHemogramMatrixExam(name)) {
      return { examName: name, sample: sampleStr };
    }
    return { examName: HEMOGRAM_CANONICAL_NAME, sample: sampleStr };
  }

  /**
   * @param {Record<string, unknown>} exam
   * @param {string} originalExamName
   */
  function tagHemogramMatrixCell(exam, originalExamName) {
    if (!exam || !isHemogramMatrixExam(originalExamName)) return exam;
    var identity = normalizeHemogramMatrixIdentity(
      originalExamName,
      String(exam.sample || ""),
    );
    return Object.assign({}, exam, {
      examName: identity.examName,
      sample: identity.sample || exam.sample,
      _hemogramSourceExamName: originalExamName,
    });
  }

  /** @param {Record<string, unknown>|null|undefined} cell */
  function hemogramCellSourceKind(cell) {
    if (!cell) return "unknown";
    var src = String(cell._hemogramSourceExamName || cell.examName || "");
    if (isFullHemogramExam(src)) return "full";
    if (isPartialHemogramPanel(src)) return "partial";
    if (normalizeForMatch(src) === normalizeForMatch(HEMOGRAM_CANONICAL_NAME)) {
      return "full";
    }
    return "unknown";
  }

  /** @param {Record<string, unknown>} cell @param {"full"|"partial"|"unknown"} kind */
  function cellContentTextForSource(cell, kind) {
    var fetched = String(cell.fetchedResult || "").trim();
    var result = String(cell.result || "").trim();
    var detail = String(cell.detailText || "").trim();

    if (kind === "full") {
      if (fetched && countSubitemLines(fetched) >= 2) return fetched;
      if (result) return result;
      return fetched || detail;
    }
    if (kind === "partial") {
      var richestPartial = pickRichestPartialHemogramPanelText(cell);
      if (richestPartial) return richestPartial;
      var normFetched = fetched ? normalizePartialPanelLaudoText(fetched) : "";
      if (normFetched) return normFetched;
      var normDetail = detail ? normalizePartialPanelLaudoText(detail) : "";
      if (normDetail) return normDetail;
      var normResult = result ? normalizePartialPanelLaudoText(result) : "";
      if (normResult) return normResult;
      return "";
    }
    return fetched || result || detail;
  }

  /**
   * @param {string} fullText
   * @param {string} partialText
   * @param {{ examName?: string }} [opts]
   */
  function mergeHemogramResultText(fullText, partialText, opts) {
    opts = opts || {};
    var full = String(fullText || "").trim();
    var partial = String(partialText || "").trim();
    if (!full) return partial;
    if (!partial) return full;

    var parse = getParseExamSubitems();
    var fullItems = parse(full, opts);
    var partialItems = parse(partial, opts);

    if (!fullItems.length) return partial;
    if (!partialItems.length) return full;

    var seen = {};
    var merged = [];

    for (var fi = 0; fi < fullItems.length; fi++) {
      var fItem = fullItems[fi];
      var fKey = hemogramAnalyteKey(fItem.label);
      if (!seen[fKey]) {
        seen[fKey] = true;
        merged.push(fItem);
      }
    }

    for (var pi = 0; pi < partialItems.length; pi++) {
      var pItem = partialItems[pi];
      var pKey = hemogramAnalyteKey(pItem.label);
      if (!seen[pKey]) {
        seen[pKey] = true;
        merged.push(pItem);
      }
    }

    return merged
      .map(function (it) {
        return it.label + ": " + it.value;
      })
      .join("\n");
  }

  /**
   * @param {Record<string, unknown>} mergedTextHolder
   * @param {string} mergedText
   */
  function applyMergedTextToCell(mergedTextHolder, mergedText) {
    var text = String(mergedText || "").trim();
    if (!text) return mergedTextHolder;

    var multi =
      text.indexOf("\n") >= 0 || countSubitemLines(text) >= 2;
    if (multi) {
      mergedTextHolder.fetchedResult = text;
      mergedTextHolder.result = "";
    } else {
      mergedTextHolder.result = text;
      mergedTextHolder.fetchedResult = "";
    }
    mergedTextHolder.detailText = "";
    return mergedTextHolder;
  }

  /**
   * @param {Record<string, unknown>} a
   * @param {Record<string, unknown>} b
   */
  function mergeHemogramMatrixCells(a, b) {
    var aKind = hemogramCellSourceKind(a);
    var bKind = hemogramCellSourceKind(b);

    if (aKind === "unknown" && bKind === "unknown") {
      return a;
    }
    if (aKind === "unknown") return b;
    if (bKind === "unknown") return a;

    var fullCell = aKind === "full" ? a : bKind === "full" ? b : null;
    var partialCell = aKind === "partial" ? a : bKind === "partial" ? b : null;

    if (fullCell && partialCell) {
      var fullText = cellContentTextForSource(fullCell, "full");
      var partialText = cellContentTextForSource(partialCell, "partial");
      var mergedText = mergeHemogramResultText(fullText, partialText, {
        examName: HEMOGRAM_CANONICAL_NAME,
      });
      var base = Object.assign({}, fullCell);
      base.examName = HEMOGRAM_CANONICAL_NAME;
      base._hemogramSourceExamName = String(
        fullCell._hemogramSourceExamName || fullCell.examName || "",
      );
      applyMergedTextToCell(base, mergedText);
      return base;
    }

    if (aKind === bKind) {
      var pa =
        resultPriority(a) >= resultPriority(b) ? a : b;
      return Object.assign({}, pa, {
        examName: HEMOGRAM_CANONICAL_NAME,
      });
    }

    var only = fullCell || partialCell || a;
    return Object.assign({}, only, {
      examName: HEMOGRAM_CANONICAL_NAME,
    });
  }

  /** @param {Record<string, unknown>} exam */
  function resultPriority(exam) {
    if (String(exam.result || "").trim()) return 3;
    if (String(exam.fetchedResult || "").trim()) return 2;
    if (String(exam.detailText || "").trim()) return 1;
    return 0;
  }

  /** @param {string} examName */
  function hemogramMatrixRowSortIndex(examName) {
    if (isFullHemogramExam(examName)) return 0;
    if (isPartialHemogramPanel(examName)) return 1;
    if (normalizeForMatch(examName) === normalizeForMatch(HEMOGRAM_CANONICAL_NAME)) {
      return 0;
    }
    return 9000;
  }

  return {
    HEMOGRAM_MATRIX_ROW_KEY: HEMOGRAM_MATRIX_ROW_KEY,
    HEMOGRAM_CANONICAL_NAME: HEMOGRAM_CANONICAL_NAME,
    normalizeForMatch: normalizeForMatch,
    isFullHemogramExam: isFullHemogramExam,
    isPartialHemogramPanel: isPartialHemogramPanel,
    isHemogramMatrixExam: isHemogramMatrixExam,
    normalizeHemogramMatrixIdentity: normalizeHemogramMatrixIdentity,
    tagHemogramMatrixCell: tagHemogramMatrixCell,
    hemogramAnalyteKey: hemogramAnalyteKey,
    mergeHemogramResultText: mergeHemogramResultText,
    mergeHemogramMatrixCells: mergeHemogramMatrixCells,
    hemogramMatrixRowSortIndex: hemogramMatrixRowSortIndex,
    getPartialHemogramSourceName: getPartialHemogramSourceName,
    pickRichestPartialHemogramPanelText: pickRichestPartialHemogramPanelText,
    normalizePartialPanelLaudoText: normalizePartialPanelLaudoText,
  };
});
