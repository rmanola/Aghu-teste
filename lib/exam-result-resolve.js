/**
 * Resolve texto de exibição de exame: gasometria PDF prevalece sobre resumo parcial da grid AGHU.
 * Testável em Node via module.exports; extensão: global AghuExamResultResolve.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuExamResultResolve = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  function getLab() {
    return root.AghuPdfLabParse || null;
  }

  function getHemogramMatrix() {
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./hemogram-matrix.js");
      } catch (_e) {
        /* ignore */
      }
    }
    return root.AghuHemogramMatrix || null;
  }

  function pickPartialHemogramPanelText(row) {
    var hemogram = getHemogramMatrix();
    if (
      hemogram &&
      typeof hemogram.pickRichestPartialHemogramPanelText === "function"
    ) {
      return hemogram.pickRichestPartialHemogramPanelText(row);
    }
    return "";
  }

  function getPartialHemogramSourceName(row) {
    var hemogram = getHemogramMatrix();
    if (
      hemogram &&
      typeof hemogram.getPartialHemogramSourceName === "function"
    ) {
      return hemogram.getPartialHemogramSourceName(row);
    }
    return "";
  }

  function normalizeHemogramLaudoForDisplay(text) {
    var hemogram = getHemogramMatrix();
    if (
      hemogram &&
      typeof hemogram.normalizePartialPanelLaudoText === "function"
    ) {
      return hemogram.normalizePartialPanelLaudoText(text);
    }
    return String(text || "").trim();
  }

  function getFetchErrors() {
    return root.AghuPdfFetchErrors || null;
  }

  function isGasometryExam(exam) {
    var lab = getLab();
    if (lab && lab.isGasometryExamName) {
      return lab.isGasometryExamName(exam && exam.examName);
    }
    return String((exam && exam.examName) || "")
      .toUpperCase()
      .includes("GASOMETRIA");
  }

  function isHemogramExam(exam) {
    var sig = root.AghuExamSiglas;
    if (sig && sig.resolveSigla) {
      if (sig.resolveSigla(exam && exam.examName) === "Hemograma") return true;
    }
    return /\bHEMOGRAMA\b/i.test(String((exam && exam.examName) || ""));
  }

  function isEasExam(exam) {
    var lab = getLab();
    return !!(lab && lab.isEasExamName && lab.isEasExamName(exam && exam.examName));
  }

  function countPdfSubitems(text) {
    var lab = getLab();
    if (lab && lab.countPdfSubitems) {
      return lab.countPdfSubitems(text);
    }
    return countLabSubitemLines(text);
  }

  function isPartialGridResult(text) {
    var t = String(text || "").trim();
    if (!t) return true;
    if (countLabSubitemLines(t) >= 2) return false;
    if (/^[\d,\.\s]+$/.test(t)) return true;
    return countLabSubitemLines(t) < 2;
  }

  function shouldPreferHemogramFetched(exam) {
    if (!isHemogramExam(exam)) return false;
    var fetched = String(exam.fetchedResult || "").trim();
    if (!fetched) return false;
    var fetchedCount = countPdfSubitems(fetched);
    if (fetchedCount < 2) return false;
    var result = String(exam.result || "").trim();
    if (!result) return true;
    return (
      countPdfSubitems(result) < fetchedCount || isPartialGridResult(result)
    );
  }

  function shouldPreferEasFetched(exam) {
    if (!isEasExam(exam)) return false;
    var fetched = String(exam.fetchedResult || "").trim();
    if (!fetched) return false;
    var fetchedCount = countPdfSubitems(fetched);
    if (fetchedCount < 15) return false;
    var result = String(exam.result || "").trim();
    if (!result) return true;
    return (
      countPdfSubitems(result) < fetchedCount || isPartialGridResult(result)
    );
  }

  function isUrocultExam(exam) {
    var lab = getLab();
    return !!(lab && lab.isUrocultExamName && lab.isUrocultExamName(exam && exam.examName));
  }

  function shouldPreferUrocultFetched(exam) {
    if (!isUrocultExam(exam)) return false;
    var fetched = String(exam.fetchedResult || "").trim();
    if (!fetched) return false;
    if (!/\bcultura\b/i.test(fetched) && !/\bresultado\b/i.test(fetched)) return false;
    var result = String(exam.result || "").trim();
    if (!result) return true;
    if (/\bdensidade\b/i.test(result) || /\breacao\b/i.test(result)) return true;
    return isPartialGridResult(result);
  }

  function isExternalAttachmentExam(exam) {
    if (exam && exam.hasAttachment) return true;
    var lab = getLab();
    return !!(lab && lab.isExternalLabExamName && lab.isExternalLabExamName(exam && exam.examName));
  }

  function isAnatomopathologyExam(exam) {
    var lab = getLab();
    return !!(
      lab &&
      lab.isAnatomopathologyExamName &&
      lab.isAnatomopathologyExamName(exam && exam.examName)
    );
  }

  function resolveAnatomopathologyDisplayText(row, opts) {
    var lab = getLab();
    if (!lab || !lab.resolveAnatomopathologyResultText) return "";
    var examName = String((row && row.examName) || "");
    var fetched = String((row && row.fetchedResult) || "").trim();
    var detail = String((row && row.detailText) || "").trim();
    var result = String((row && row.result) || "").trim();
    var sources = [fetched, detail, result];
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      if (!source) continue;
      var parsed = lab.resolveAnatomopathologyResultText(source, examName);
      if (!parsed) continue;
      if (opts && opts.mutate !== false && !fetched && source !== result) {
        row.fetchedResult = parsed;
      }
      return parsed;
    }
    return "";
  }

  function countLabSubitemLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return (
          l.length > 0 &&
          /^[^:]+:\s*.+/.test(l) &&
          !/^valor(es)?\s+de\s+refer/i.test(l)
        );
      }).length;
  }

  function isSerologyExam(exam) {
    var fmt = root.AghuExamDisplayFormat;
    return !!(fmt && fmt.isSerologyExamName && fmt.isSerologyExamName(exam && exam.examName));
  }

  function shouldSummarizeQualitativeDisplay(merged, exam) {
    if (isAnatomopathologyExam(exam)) return false;
    if (isExternalAttachmentExam(exam)) return false;
    if (isSerologyExam(exam)) return true;
    if (countLabSubitemLines(merged) >= 2) return false;
    return true;
  }

  function isGasometryIncomplete(text) {
    var lab = getLab();
    if (lab && lab.isGasometryFetchedResultIncomplete) {
      return lab.isGasometryFetchedResultIncomplete(text);
    }
    return !String(text || "").trim();
  }

  function tryUpgradeGasometry(exam, upgradeFn) {
    if (!exam || !isGasometryExam(exam)) return;
    if (typeof upgradeFn === "function") {
      upgradeFn(exam);
      return;
    }
    var fe = getFetchErrors();
    if (fe && fe.reparseGasometryExam) {
      fe.reparseGasometryExam(exam);
    }
  }

  function parseGasometryDetail(detail) {
    var lab = getLab();
    if (!lab || !lab.parsePdfText) return "";
    var sig = root.AghuExamSiglas;
    var parseOpts = {
      gasometryOnly: true,
      deps: sig ? { siglas: sig } : undefined,
    };
    return lab.parsePdfText(String(detail || "").trim(), parseOpts) || "";
  }

  function parseSerologyDetail(detail, examName) {
    var lab = getLab();
    if (!lab || !lab.parsePdfTextForExam) return "";
    var sig = root.AghuExamSiglas;
    return (
      lab.parsePdfTextForExam(String(detail || "").trim(), examName || "", {
        deps: sig ? { siglas: sig } : undefined,
      }) || ""
    );
  }

  function shouldPreferSerologyFetched(exam) {
    if (!isSerologyExam(exam)) return false;
    return !!String(exam.fetchedResult || "").trim();
  }

  function stripGridImagingMetadata(text) {
    var t = String(text || "").trim();
    if (/^\d{2}\/\d{2}\/\d{4}.*liberado\s+em/i.test(t)) return "";
    return t;
  }

  function summarizeQualitativeDisplay(text, examName) {
    var lab = getLab();
    if (!lab || !lab.parseQualitativeResult) return text;
    var summary = lab.parseQualitativeResult(text, examName);
    return summary || text;
  }

  function formatExamCellDisplay(text, examName) {
    var fmt = root.AghuExamDisplayFormat;
    if (fmt && fmt.formatExamCellDisplay) {
      return fmt.formatExamCellDisplay(String(text || ""), examName);
    }
    return String(text || "").trim();
  }

  /**
   * @param {object} exam
   * @returns {boolean}
   */
  function shouldPreferFetchedOverResult(exam) {
    if (!exam) return false;
    if (isGasometryExam(exam)) {
      var fetchedGaso = String(exam.fetchedResult || "").trim();
      var resultGaso = String(exam.result || "").trim();
      if (fetchedGaso && !isGasometryIncomplete(fetchedGaso)) return true;
      if (fetchedGaso && resultGaso && isGasometryIncomplete(resultGaso)) return true;
      return false;
    }
    if (shouldPreferHemogramFetched(exam)) return true;
    if (shouldPreferEasFetched(exam)) return true;
    return shouldPreferSerologyFetched(exam);
  }

  /**
   * Limpa result parcial da grid quando o laudo PDF está completo.
   * @param {object} exam — mutável
   */
  function clearPartialGridResultForGasometry(exam) {
    if (!exam || !isGasometryExam(exam)) return;
    var fetched = String(exam.fetchedResult || "").trim();
    if (!fetched || isGasometryIncomplete(fetched)) return;
    var result = String(exam.result || "").trim();
    if (!result || isGasometryIncomplete(result)) {
      exam.result = "";
    }
  }

  /**
   * Limpa result parcial da grid quando o laudo PDF do hemograma é mais completo.
   * @param {object} exam — mutável
   */
  function clearPartialGridResultForHemogram(exam) {
    if (!exam || !shouldPreferHemogramFetched(exam)) return;
    exam.result = "";
  }

  /**
   * Limpa result parcial da grid quando o laudo PDF do EAS é mais completo.
   * @param {object} exam — mutável
   */
  function clearPartialGridResultForEas(exam) {
    if (!exam || !shouldPreferEasFetched(exam)) return;
    exam.result = "";
  }

  /**
   * @param {object} exam
   * @param {{ upgradeGasometry?: function, mutate?: boolean }} [opts]
   * @returns {string}
   */
  function resolveExamDisplayText(exam, opts) {
    opts = opts || {};
    if (!exam || typeof exam !== "object") return "";

    var row = opts.mutate === false ? Object.assign({}, exam) : exam;
    tryUpgradeGasometry(row, opts.upgradeGasometry);

    var result = String(row.result || "").trim();
    var fetched = String(row.fetchedResult || "").trim();
    var detail = String(row.detailText || "").trim();

    if (isGasometryExam(row)) {
      if (fetched && !isGasometryIncomplete(fetched)) return fetched;

      if (detail) {
        var parsedFromDetail = parseGasometryDetail(detail);
        if (parsedFromDetail && !isGasometryIncomplete(parsedFromDetail)) {
          if (opts.mutate !== false && isGasometryIncomplete(fetched)) {
            row.fetchedResult = parsedFromDetail;
            clearPartialGridResultForGasometry(row);
          }
          return parsedFromDetail;
        }
        if (parsedFromDetail && !fetched) return parsedFromDetail;
      }

      if (fetched) return fetched;
      var gridResult = stripGridImagingMetadata(result || "");
      return gridResult || "";
    }

    if (isAnatomopathologyExam(row)) {
      var anatomoText = resolveAnatomopathologyDisplayText(row, opts);
      if (anatomoText) {
        return formatExamCellDisplay(anatomoText, row.examName);
      }
    }

    var merged = "";
    if (isExternalAttachmentExam(row)) {
      if (fetched) {
        merged = fetched;
      } else if (detail) {
        var labExt = getLab();
        var parsedAttach =
          labExt && labExt.parseExternalLabPdfText
            ? labExt.parseExternalLabPdfText(detail, row.examName)
            : "";
        merged = parsedAttach || result || "";
      } else {
        merged = result || "";
      }
    } else {
      if (isSerologyExam(row) && fetched) {
        merged = fetched;
      } else if (isSerologyExam(row) && detail) {
        var parsedSerology = parseSerologyDetail(detail, row.examName);
        if (parsedSerology) {
          merged = parsedSerology;
          if (opts.mutate !== false && !fetched) {
            row.fetchedResult = parsedSerology;
          }
        } else {
          merged = result || fetched || detail || "";
        }
      } else if (getPartialHemogramSourceName(row)) {
        merged = pickPartialHemogramPanelText(row) || "";
      } else if (shouldPreferHemogramFetched(row)) {
        merged = fetched;
        if (opts.mutate !== false) {
          clearPartialGridResultForHemogram(row);
        }
      } else if (shouldPreferEasFetched(row)) {
        merged = fetched;
        if (opts.mutate !== false) {
          clearPartialGridResultForEas(row);
        }
      } else if (shouldPreferUrocultFetched(row)) {
        merged = fetched;
        if (opts.mutate !== false) {
          row.result = "";
        }
      } else {
        merged = result || fetched || detail || "";
      }
    }
    if (isHemogramExam(row) && merged) {
      var repairedHemo = normalizeHemogramLaudoForDisplay(merged);
      if (repairedHemo || !String(merged).trim()) merged = repairedHemo;
    }
    merged = stripGridImagingMetadata(merged);
    if (
      merged &&
      (merged.indexOf("\n") >= 0 || merged.length > 80) &&
      shouldSummarizeQualitativeDisplay(merged, row)
    ) {
      merged = summarizeQualitativeDisplay(merged, row.examName);
    }
    return formatExamCellDisplay(merged || "", row.examName);
  }

  /**
   * @param {object} exam
   * @param {{ upgradeGasometry?: function, mutate?: boolean }} [opts]
   * @returns {{ text: string, kind: "grid"|"fetched"|"detail"|"hint"|"empty" }}
   */
  function resolveExamDisplayMeta(exam, opts) {
    if (exam && exam.fetchHint && !resolveExamDisplayText(exam, opts)) {
      return { text: String(exam.fetchHint).trim(), kind: "hint" };
    }

    var text = resolveExamDisplayText(exam, opts);
    if (!text) return { text: "", kind: "empty" };

    if (isGasometryExam(exam) && shouldPreferFetchedOverResult(exam)) {
      return { text: text, kind: "fetched" };
    }
    if (shouldPreferSerologyFetched(exam)) {
      return { text: text, kind: "fetched" };
    }
    if (shouldPreferHemogramFetched(exam)) {
      return { text: text, kind: "fetched" };
    }
    if (shouldPreferEasFetched(exam)) {
      return { text: text, kind: "fetched" };
    }
    if (String(exam.result || "").trim() === text) {
      return { text: text, kind: "grid" };
    }
    if (String(exam.fetchedResult || "").trim() === text) {
      return { text: text, kind: "fetched" };
    }
    return { text: text, kind: "detail" };
  }

  return {
    isGasometryExam: isGasometryExam,
    isHemogramExam: isHemogramExam,
    isEasExam: isEasExam,
    isGasometryIncomplete: isGasometryIncomplete,
    shouldPreferFetchedOverResult: shouldPreferFetchedOverResult,
    shouldPreferHemogramFetched: shouldPreferHemogramFetched,
    shouldPreferEasFetched: shouldPreferEasFetched,
    clearPartialGridResultForGasometry: clearPartialGridResultForGasometry,
    clearPartialGridResultForHemogram: clearPartialGridResultForHemogram,
    clearPartialGridResultForEas: clearPartialGridResultForEas,
    stripGridImagingMetadata: stripGridImagingMetadata,
    summarizeQualitativeDisplay: summarizeQualitativeDisplay,
    formatExamCellDisplay: formatExamCellDisplay,
    resolveExamDisplayText: resolveExamDisplayText,
    resolveExamDisplayMeta: resolveExamDisplayMeta,
  };
});
