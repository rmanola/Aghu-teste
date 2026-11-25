/**
 * Pipeline compartilhado: tabela → fetch PDF/anexo (popup Exames + passômetro extractExames).
 */
(function (root) {
  "use strict";

  function noop() {}

  /**
   * @param {object} [deps]
   * @returns {{ runExamsPdfFetch: Function, initExamFetchFields: Function, collectPending: Function }}
   */
  function createExamsFetchPipeline(deps) {
    deps = deps || {};

    var pdfFetch = root.AghuPopupExamsPdfFetch
      ? root.AghuPopupExamsPdfFetch.createPdfFetchHelpers({
          saveResultToCache: deps.saveResultToCache,
          getCurrentPatientMeta: deps.getCurrentPatientMeta,
        })
      : null;

    var uiStubs = {
      btnFetchDetails: deps.btnFetchDetails || { disabled: false },
      progressBar:
        deps.progressBar ||
        { classList: { add: noop, remove: noop } },
    };

    function initExamFetchFields(exam) {
      if (!exam) return exam;
      if (exam.fetchHint === undefined) exam.fetchHint = "";
      if (exam.fetchReason === undefined) exam.fetchReason = "";
      if (exam.aiOrganized === undefined) exam.aiOrganized = "";
      if (exam.fetchedResult === undefined) exam.fetchedResult = "";
      if (exam.detailText === undefined) exam.detailText = "";
      if (exam.hadPdf === undefined) exam.hadPdf = false;
      return exam;
    }

    function collectPending(exams) {
      var pendingFn =
        root.AghuPdfFetchPartition &&
        root.AghuPdfFetchPartition.isExamPendingFetch;
      return (exams || []).filter(function (e) {
        if (pendingFn) return pendingFn(e);
        return (
          !e.fetchedResult &&
          !e.detailText &&
          e.result === "" &&
          (e.hasCheckbox || e.hasAttachment)
        );
      });
    }

    function buildBatchApi(runOpts) {
      runOpts = runOpts || {};
      var patientKey = runOpts.patientKey;
      var examsByRow = runOpts.examsByRow || {};
      var archive = root.AghuPatientArchive;

      async function saveFetchPatch(cacheKey, rowIndex, patch) {
        var exam = examsByRow[rowIndex];
        if (exam) {
          if (patch.fetchedResult !== undefined) {
            exam.fetchedResult = patch.fetchedResult;
          }
          if (patch.detailText !== undefined) exam.detailText = patch.detailText;
          if (patch.hadPdf !== undefined) exam.hadPdf = patch.hadPdf;
          if (patch.fetchHint !== undefined) exam.fetchHint = patch.fetchHint;
          if (patch.fetchReason !== undefined) exam.fetchReason = patch.fetchReason;
          if (patch.aiOrganized !== undefined) exam.aiOrganized = patch.aiOrganized;
        }
        if (typeof deps.saveResultToCache === "function") {
          await deps.saveResultToCache(cacheKey, rowIndex, patch);
        }
        if (patientKey && archive && archive.upsertSingleExam && exam) {
          try {
            await archive.upsertSingleExam(patientKey, exam);
          } catch (_e) {}
        }
      }

      return root.AghuPopupPdfBatch.create({
        getCacheKey: function () {
          if (runOpts.cacheKey) return runOpts.cacheKey;
          if (typeof deps.getCacheKey === "function") return deps.getCacheKey();
          return null;
        },
        saveResultToCache: saveFetchPatch,
        updateRow: deps.updateRow || noop,
        applyFilters: deps.applyFilters || noop,
        applyFetchResult: pdfFetch ? pdfFetch.applyFetchResult : noop,
        finalizeGasometryAfterFetch: pdfFetch
          ? pdfFetch.finalizeGasometryAfterFetch
          : noop,
        reasonToHint: pdfFetch ? pdfFetch.reasonToHint : function (r) {
          return r || "";
        },
        pdfFetchCfg: pdfFetch ? pdfFetch.pdfFetchCfg : function () {
          return {};
        },
        sendTabMessageWithTimeout: pdfFetch
          ? pdfFetch.sendTabMessageWithTimeout
          : async function () {
              return null;
            },
        sleepMs: pdfFetch
          ? pdfFetch.sleepMs
          : function (ms) {
              return new Promise(function (r) {
                setTimeout(r, ms);
              });
            },
        pdfBlockMatchDeps: pdfFetch ? pdfFetch.pdfBlockMatchDeps : function () {
          return null;
        },
        setProgress: function (pct, msg) {
          if (typeof deps.setProgress === "function") deps.setProgress(pct, msg);
          if (typeof runOpts.onProgress === "function") {
            runOpts.onProgress(pct, msg);
          }
        },
        setFetchRunning: deps.setFetchRunning || noop,
        btnFetchDetails: uiStubs.btnFetchDetails,
        progressBar: uiStubs.progressBar,
      });
    }

    /**
     * @param {number} tabId
     * @param {object[]} exams — mutável in-place
     * @param {{ patientKey?: string, cacheKey?: string, onProgress?: Function }} [opts]
     */
    async function runExamsPdfFetch(tabId, exams, opts) {
      opts = opts || {};
      if (!Array.isArray(exams) || exams.length === 0) {
        return { pdfsAttempted: 0, pdfsOk: 0 };
      }

      for (var i = 0; i < exams.length; i++) {
        initExamFetchFields(exams[i]);
      }

      var examsByRow = {};
      for (var j = 0; j < exams.length; j++) {
        if (exams[j].rowIndex != null) {
          examsByRow[exams[j].rowIndex] = exams[j];
        }
      }

      var toFetch = collectPending(exams);
      if (toFetch.length === 0) {
        return { pdfsAttempted: 0, pdfsOk: 0 };
      }

      if (!root.AghuPopupPdfBatch || !pdfFetch) {
        console.warn("[AGHU] exams-fetch-pipeline: módulos PDF indisponíveis");
        return {
          pdfsAttempted: toFetch.length,
          pdfsOk: 0,
          warning: "Pipeline PDF indisponível.",
        };
      }

      var batchApi = buildBatchApi(
        Object.assign({}, opts, { examsByRow: examsByRow })
      );

      try {
        await batchApi.runFetchLoop(tabId, toFetch);
      } catch (err) {
        console.warn(
          "[AGHU] passometro fetch",
          err && err.message ? err.message : "loop_error"
        );
      }

      var pdfsOk = toFetch.filter(function (e) {
        return !!(e.fetchedResult || e.detailText);
      }).length;
      var pdfsAttempted = toFetch.length;
      var withWarn = toFetch.filter(function (e) {
        return e.fetchHint && !e.fetchedResult && !e.detailText;
      }).length;

      console.log("[AGHU] passometro fetch", {
        attempted: pdfsAttempted,
        ok: pdfsOk,
        warn: withWarn,
      });

      var out = { pdfsAttempted: pdfsAttempted, pdfsOk: pdfsOk };
      if (withWarn > 0 && pdfsOk < pdfsAttempted) {
        out.warning =
          pdfsOk +
          "/" +
          pdfsAttempted +
          " PDF(s) extraídos; " +
          withWarn +
          " aviso(s).";
      }
      return out;
    }

    return {
      runExamsPdfFetch: runExamsPdfFetch,
      initExamFetchFields: initExamFetchFields,
      collectPending: collectPending,
    };
  }

  var defaultPipeline = null;

  function getDefaultPipeline() {
    if (!defaultPipeline) {
      defaultPipeline = createExamsFetchPipeline({});
    }
    return defaultPipeline;
  }

  root.AghuExamsFetchPipeline = {
    createExamsFetchPipeline: createExamsFetchPipeline,
    runExamsPdfFetch: function (tabId, exams, opts) {
      return getDefaultPipeline().runExamsPdfFetch(tabId, exams, opts);
    },
    initExamFetchFields: function (exam) {
      return getDefaultPipeline().initExamFetchFields(exam);
    },
    collectPending: function (exams) {
      return getDefaultPipeline().collectPending(exams);
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
