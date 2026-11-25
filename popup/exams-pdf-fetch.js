/**
 * Bridge PDF fetch: gasometria, applyFetchResult, reparse cache, timeouts.
 * Loop em lote permanece em popup/pdf-batch.js (createPdfBatchApi).
 */
(function (root) {
  "use strict";

  function parseDetailText(text) {
    if (!text) return "";
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const good = lines.filter((l) =>
      /\d/.test(l) || /positiv|negativ|reagente|normal|alterado|presente|ausente/i.test(l)
    );
    if (good.length > 1 && good.length <= 30) return good.join("\n");
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= 200) return cleaned;
    if (good.length > 0 && good.length <= 30) return good.join("\n");
    return cleaned.substring(0, 500) + (cleaned.length > 500 ? "..." : "");
  }

  /**
   * @param {object} d — getters opcionais: getCurrentPatientMeta, getAllExams, saveResultToCache
   */
  function createPdfFetchHelpers(d) {
    const fetchErrors = root.AghuPdfFetchErrors || {
      reasonToHint: (r) => r || "",
      applyFetchResult: () => {},
    };

    function reasonToHint(reason) {
      return fetchErrors.reasonToHint(reason);
    }

    function sleepMs(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function pdfFetchCfg() {
      const c = root.AghuPdfFetchConfig;
      if (c) return c;
      return {
        SEND_MESSAGE_MS: 5000,
        WAIT_ATTACH_MS: 50000,
        GO_BACK_MS: 20000,
        DELAY_BETWEEN_PDF_MS: 1500,
        WAIT_ATTACH_MARGIN_MS: 5000,
        WAIT_BATCH_BASE_MS: 60000,
        WAIT_BATCH_PER_EXAM_MS: 8000,
        attachWaitMs() {
          return 65000;
        },
        attachFetchRaceMs() {
          return 90000;
        },
        batchWaitMs(n) {
          return this.WAIT_BATCH_BASE_MS + Math.max(0, (n || 1) - 1) * this.WAIT_BATCH_PER_EXAM_MS;
        },
      };
    }

    async function sendTabMessageWithTimeout(tabId, message, timeoutMs) {
      const cfg = pdfFetchCfg();
      const waitMs = timeoutMs != null ? timeoutMs : cfg.SEND_MESSAGE_MS || 5000;
      return Promise.race([
        browser.tabs.sendMessage(tabId, message),
        sleepMs(waitMs).then(() => {
          throw new Error("send_message_timeout");
        }),
      ]);
    }

    function parsePdfText(text, opts) {
      const lp = root.AghuPdfLabParse;
      return lp ? lp.parsePdfText(text, opts) : "";
    }

    function applyFetchResult(exam, result) {
      fetchErrors.applyFetchResult(exam, result, {
        parsePdfText,
        parseDetailText,
      });
    }

    function isGasometryExamRow(exam) {
      const lp = root.AghuPdfLabParse;
      if (lp && lp.isGasometryExamName) return lp.isGasometryExamName(exam?.examName);
      return String(exam?.examName || "").toUpperCase().includes("GASOMETRIA");
    }

    function isGasometryFetchedIncomplete(exam) {
      const fe = root.AghuPdfFetchErrors;
      if (fe && fe.isGasometryFetchedResultIncomplete) {
        return fe.isGasometryFetchedResultIncomplete(exam?.fetchedResult);
      }
      return !String(exam?.fetchedResult || "").trim();
    }

    function detailTextHasGasoMarkers(exam) {
      const t = String(exam?.detailText || "").toUpperCase();
      return /\b(?:PO2|PH|PCO2|HCO3|LACTATO|STO2|SATO2)\s*:/.test(t);
    }

    function upgradeGasometryCachedExam(exam) {
      const fe = root.AghuPdfFetchErrors;
      if (fe && typeof fe.reparseGasometryExam === "function") {
        return fe.reparseGasometryExam(exam, {
          parsePdfText: (t, opts) => root.AghuPdfLabParse.parsePdfText(t, opts),
        });
      }
      const lp = root.AghuPdfLabParse;
      if (lp && typeof lp.reparseGasometryFromDetail === "function") {
        return lp.reparseGasometryFromDetail(exam, lp.parsePdfText);
      }
      return false;
    }

    function upgradeAllGasometryExams(exams) {
      const upgraded = [];
      for (const e of exams) {
        if (upgradeGasometryCachedExam(e)) upgraded.push(e);
      }
      return upgraded;
    }

    function upgradePdfCachedExam(exam) {
      if (!exam || !exam.hadPdf) return false;
      if (isGasometryExamRow(exam)) return false;
      const detail = String(exam.detailText || "").trim();
      if (!detail) return false;

      const lp = root.AghuPdfLabParse;
      if (!lp || typeof lp.parsePdfTextForExam !== "function") return false;

      const blockMatch = root.AghuPdfBlockMatch;
      const deps = blockMatch && blockMatch.defaultDeps ? blockMatch.defaultDeps() : {};
      let textForParse = detail;
      if (blockMatch && blockMatch.sliceBlockTextForExam) {
        textForParse = blockMatch.sliceBlockTextForExam(detail, exam, deps);
      }

      const sig = root.AghuExamSiglas;
      const reparsed = lp.parsePdfTextForExam(textForParse, exam.examName || "", {
        deps: sig ? { siglas: sig } : undefined,
        externalAttachment: !!exam.hasAttachment,
      });
      if (!reparsed || reparsed === String(exam.fetchedResult || "").trim()) return false;
      exam.fetchedResult = reparsed;
      return true;
    }

    function upgradeAllPdfCachedExams(exams) {
      const upgraded = [];
      for (const e of exams) {
        if (upgradePdfCachedExam(e)) upgraded.push(e);
      }
      return upgraded;
    }

    function finalizeGasometryAfterFetch(exam, partialHint) {
      if (!isGasometryExamRow(exam)) return;
      upgradeGasometryCachedExam(exam);
      if (root.AghuExamResultResolve?.clearPartialGridResultForGasometry) {
        root.AghuExamResultResolve.clearPartialGridResultForGasometry(exam);
      }
      if (isGasometryFetchedIncomplete(exam) && detailTextHasGasoMarkers(exam)) {
        exam.fetchReason = "gasometry_incomplete";
        exam.fetchHint = reasonToHint("gasometry_incomplete");
      } else if (partialHint) {
        exam.fetchHint = partialHint;
        exam.fetchReason = "partial_batch_selection";
      } else if (!isGasometryFetchedIncomplete(exam)) {
        exam.fetchHint = "";
        exam.fetchReason = "";
      }
    }

    async function persistUpgradedFetchExams(exams, cacheKey) {
      if (!cacheKey || !exams.length || !d.saveResultToCache) return;
      const seen = new Set();
      for (const e of exams) {
        if (seen.has(e.rowIndex)) continue;
        seen.add(e.rowIndex);
        await d.saveResultToCache(cacheKey, e.rowIndex, {
          fetchedResult: e.fetchedResult || "",
          detailText: e.detailText || "",
          hadPdf: !!e.hadPdf,
          fetchHint: e.fetchHint || "",
          fetchReason: e.fetchReason || "",
          aiOrganized: e.aiOrganized || "",
        });
      }
    }

    async function persistUpgradedGasometryExams(exams, cacheKey) {
      if (!cacheKey || !exams.length || !d.saveResultToCache) return;
      for (const e of exams) {
        await d.saveResultToCache(cacheKey, e.rowIndex, {
          fetchedResult: e.fetchedResult || "",
          detailText: e.detailText || "",
          hadPdf: !!e.hadPdf,
          fetchHint: e.fetchHint || "",
          fetchReason: e.fetchReason || "",
          aiOrganized: e.aiOrganized || "",
        });
      }
    }

    async function persistUpgradedGasometryToArchive(exams) {
      const meta = d.getCurrentPatientMeta ? d.getCurrentPatientMeta() : null;
      if (!root.AghuPatientArchive || !meta?.ok || !exams.length) return;
      for (const e of exams) {
        await root.AghuPatientArchive.upsertSingleExam(meta.patientKey, e);
      }
    }

    function splitPageIntoSolBlocks(pageText) {
      return root.AghuPdfLabParse.splitPageIntoSolBlocks(pageText);
    }

    function pdfBlockMatchDeps() {
      const bm = root.AghuPdfBlockMatch;
      return bm && typeof bm.defaultDeps === "function" ? bm.defaultDeps() : null;
    }

    return {
      reasonToHint,
      sleepMs,
      pdfFetchCfg,
      sendTabMessageWithTimeout,
      applyFetchResult,
      upgradeGasometryCachedExam,
      upgradeAllGasometryExams,
      upgradePdfCachedExam,
      upgradeAllPdfCachedExams,
      finalizeGasometryAfterFetch,
      persistUpgradedFetchExams,
      persistUpgradedGasometryExams,
      persistUpgradedGasometryToArchive,
      splitPageIntoSolBlocks,
      pdfBlockMatchDeps,
      parseDetailText,
    };
  }

  root.AghuPopupExamsPdfFetch = { createPdfFetchHelpers };
})(typeof globalThis !== "undefined" ? globalThis : window);
