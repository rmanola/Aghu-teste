/**
 * Loop de fetch PDF/detalhe (popup) — factory com deps injetadas.
 */
(function (root) {
  "use strict";

  /**
   * @param {object} d
   * @returns {{ runFetchLoop: Function, fetchAttachExam: Function, fetchSingle: Function }}
   */
  function createPdfBatchApi(d) {
    async function persistExamFetchFromResult(exam, result) {
      d.applyFetchResult(exam, result);
      if (result && result.success) {
        d.finalizeGasometryAfterFetch(exam, "");
      }
      var shouldSave =
        (result && result.success) ||
        (result && !result.success && result.reason) ||
        (exam.fetchHint && exam.fetchHint.length > 0);
      if (shouldSave) {
        await d.saveResultToCache(d.getCacheKey(), exam.rowIndex, {
          fetchedResult: exam.fetchedResult || "",
          detailText: exam.detailText || "",
          hadPdf: !!exam.hadPdf,
          fetchHint: exam.fetchHint || "",
          fetchReason: exam.fetchReason || "",
          aiOrganized: exam.aiOrganized || "",
        });
        d.updateRow(exam);
      }
    }

    function buildExamActionMessage(action, exam) {
      return {
        action: action,
        rowIndex: exam.rowIndex,
        solicitation: exam.solicitation,
        examName: exam.examName,
        dataColetaISO: exam.dataColetaISO,
        sample: exam.sample,
      };
    }

    async function fetchSingle(tabId, exam, action) {
      var cfg = d.pdfFetchCfg();
      var msgTimeout =
        action === "clickAttach" && typeof cfg.attachFetchRaceMs === "function"
          ? cfg.attachFetchRaceMs()
          : cfg.WAIT_PDF_DEFAULT_MS || 60000;
      try {
        var result = await d.sendTabMessageWithTimeout(
          tabId,
          buildExamActionMessage(action, exam),
          msgTimeout,
        );
        await persistExamFetchFromResult(exam, result);
      } catch (e) {
        console.warn("fetchSingle failed, rowIndex:", exam.rowIndex, e);
        exam.fetchHint = d.reasonToHint("send_message_error");
        exam.fetchReason = "send_message_error";
        await d.saveResultToCache(d.getCacheKey(), exam.rowIndex, {
          fetchedResult: "",
          detailText: "",
          hadPdf: false,
          fetchHint: exam.fetchHint,
          fetchReason: exam.fetchReason,
          aiOrganized: exam.aiOrganized || "",
        });
        d.updateRow(exam);
      }
    }

    async function fetchAttachExam(tabId, exam) {
      var cfg = d.pdfFetchCfg();
      var waitApi = root.AghuPdfFetchWait;
      if (!waitApi || !waitApi.waitForPdfResult) {
        await fetchSingle(tabId, exam, "clickAttach");
        return;
      }
      var started;
      try {
        started = await d.sendTabMessageWithTimeout(
          tabId,
          buildExamActionMessage("clickAttachStart", exam),
          cfg.SEND_MESSAGE_MS,
        );
      } catch (e) {
        console.warn(
          "[AGHU popup] clickAttachStart exceção, rowIndex:",
          exam.rowIndex,
          e,
        );
        await persistExamFetchFromResult(exam, {
          success: false,
          reason: "send_message_error",
          isPdf: true,
        });
        return;
      }
      if (!started || !started.ok) {
        await persistExamFetchFromResult(exam, {
          success: false,
          reason: (started && started.reason) || "no_attach_link",
          isPdf: true,
        });
        return;
      }
      var waitMs =
        typeof cfg.attachWaitMs === "function"
          ? cfg.attachWaitMs()
          : cfg.WAIT_ATTACH_MS;
      var result = await waitApi.waitForPdfResult(
        browser.storage.local,
        waitMs,
        started.captureId,
      );
      result.rowIndex = exam.rowIndex;
      if (result.success && result.text) {
        console.log(
          "[AGHU popup] attach consumed",
          result.text.length,
          "chars",
        );
      }
      try {
        await browser.runtime.sendMessage({ action: "aghuGoBack", tabId: tabId });
      } catch (e) {
        console.warn("[AGHU popup] aghuGoBack após anexo:", e);
      }
      await d.sleepMs(cfg.DELAY_BETWEEN_PDF_MS || 1500);
      await persistExamFetchFromResult(exam, result);
    }

    async function runFetchLoop(tabId, toFetch) {
      d.setFetchRunning(true);
      d.btnFetchDetails.disabled = true;
      d.progressBar.classList.add("visible");

      var part = root.AghuPdfFetchPartition || {};
      var partitioned = part.partitionToFetch
        ? part.partitionToFetch(toFetch)
        : {
            clipItems: toFetch.filter(function (e) {
              return e.hasAttachment;
            }),
            batchItems: toFetch.filter(function (e) {
              return !e.hasAttachment && e.hasCheckbox;
            }),
            skippedNoCheckbox: toFetch.filter(function (e) {
              return !e.hasAttachment && !e.hasCheckbox;
            }),
          };
      var clipItems = partitioned.clipItems;
      var batchItems = partitioned.batchItems;
      var skippedNoCheckbox = partitioned.skippedNoCheckbox;
      var total = toFetch.length;
      var done = 0;

      async function persistExamFetchState(exam) {
        await d.saveResultToCache(d.getCacheKey(), exam.rowIndex, {
          fetchedResult: exam.fetchedResult || "",
          detailText: exam.detailText || "",
          hadPdf: !!exam.hadPdf,
          fetchHint: exam.fetchHint || "",
          fetchReason: exam.fetchReason || "",
          aiOrganized: exam.aiOrganized || "",
        });
        d.updateRow(exam);
      }

      for (var i = 0; i < skippedNoCheckbox.length; i++) {
        var skipExam = skippedNoCheckbox[i];
        done++;
        skipExam.fetchHint = d.reasonToHint("no_checkbox");
        skipExam.fetchReason = "no_checkbox";
        await persistExamFetchState(skipExam);
      }

      if (batchItems.length > 0) {
        var indices = batchItems.map(function (e) {
          return e.rowIndex;
        });
        d.setProgress(
          (done / total) * 100,
          "Gerando PDF único (" + batchItems.length + " exame(s))…",
        );
        var groupResult = null;
        var cfg = d.pdfFetchCfg();
        var batchMsgTimeout =
          cfg.batchWaitMs(indices.length) +
          (cfg.GO_BACK_MS || 20000) +
          (cfg.WAIT_ATTACH_MARGIN_MS || 5000);
        try {
          groupResult = await d.sendTabMessageWithTimeout(
            tabId,
            { action: "selectGroupAndGetResult", indices: indices },
            batchMsgTimeout,
          );
        } catch (e) {
          console.warn("[AGHU popup] selectGroupAndGetResult exceção:", e);
        }
        var pages = (groupResult && groupResult.pages) || [];
        var fullText = (groupResult && groupResult.text) || pages.join("\n");
        var partialHint =
          groupResult && groupResult.partial_selection
            ? d.reasonToHint("partial_batch_selection")
            : "";
        if (
          groupResult &&
          groupResult.success &&
          (fullText.trim().length > 0 || pages.length > 0)
        ) {
          var pageTexts =
            pages.length > 0 ? pages : fullText.trim() ? [fullText] : [];
          var allBlocks = root.AghuPdfLabParse.mergePagesIntoSolBlocks(pageTexts);
          d.setProgress(
            (done / total) * 100,
            "Distribuindo " + allBlocks.length + " bloco(s)…",
          );
          var blockDeps = d.pdfBlockMatchDeps();
          if (blockDeps && root.AghuPdfBlockMatch) {
            root.AghuPdfBlockMatch.assignBlocksToExams(
              batchItems,
              allBlocks,
              blockDeps,
            );
          }
          for (var b = 0; b < batchItems.length; b++) {
            var be = batchItems[b];
            var hasData =
              String(be.detailText || "").trim() ||
              String(be.fetchedResult || "").trim();
            if (hasData) {
              be.hadPdf = true;
              d.finalizeGasometryAfterFetch(be, partialHint);
              await persistExamFetchState(be);
            } else {
              d.applyFetchResult(be, {
                success: false,
                reason: "batch_no_block",
                isPdf: true,
              });
              await persistExamFetchState(be);
            }
          }
        } else {
          var failPayload =
            groupResult || {
              success: false,
              reason: "pdf_result_error",
              isPdf: true,
            };
          for (var f = 0; f < batchItems.length; f++) {
            d.applyFetchResult(batchItems[f], failPayload);
            await persistExamFetchState(batchItems[f]);
          }
        }
        done += batchItems.length;
        d.setProgress((done / total) * 100, "[" + done + "/" + total + "] Lote interno concluído.");
      }

      for (var c = 0; c < clipItems.length; c++) {
        var clipExam = clipItems[c];
        done++;
        d.setProgress(
          (done / total) * 100,
          "[" + done + "/" + total + "] " + clipExam.examName + " (lab externo)...",
        );
        try {
          await fetchAttachExam(tabId, clipExam);
        } catch (e) {
          console.warn("[AGHU popup] clipe exceção, índice:", done, e);
          clipExam.fetchHint = d.reasonToHint("send_message_error");
          clipExam.fetchReason = "send_message_error";
          await persistExamFetchState(clipExam);
        }
      }

      var withData = toFetch.filter(function (e) {
        return e.fetchedResult || e.detailText;
      }).length;
      var withWarn = toFetch.filter(function (e) {
        return e.fetchHint && !e.fetchedResult && !e.detailText;
      }).length;
      d.setProgress(
        100,
        withWarn
          ? "✓ " + withData + "/" + total + " extraídos · " + withWarn + " aviso(s)"
          : "✓ " + withData + "/" + total + " extraídos.",
      );
      setTimeout(function () {
        d.progressBar.classList.remove("visible");
      }, 3000);
      d.setFetchRunning(false);
      d.btnFetchDetails.disabled = false;
      d.applyFilters();
    }

    return {
      runFetchLoop: runFetchLoop,
      fetchAttachExam: fetchAttachExam,
      fetchSingle: fetchSingle,
      persistExamFetchFromResult: persistExamFetchFromResult,
    };
  }

  root.AghuPopupPdfBatch = { create: createPdfBatchApi };
})(typeof globalThis !== "undefined" ? globalThis : window);
