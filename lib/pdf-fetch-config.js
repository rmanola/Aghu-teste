/**
 * Timeouts centralizados para fetch de PDF (content, background, popup).
 * Carregado antes de content/content.js, background/background.js e popup/popup.js.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    EXTRACT_PDF_MS: 45000,
    EXTRACT_PDF_PER_PAGE_MS: 2000,
    WAIT_PDF_DEFAULT_MS: 60000,
    WAIT_ATTACH_MS: 50000,
    WAIT_ATTACH_DOWNLOAD_MS: 15000,
    WAIT_ATTACH_MARGIN_MS: 5000,
    WAIT_BATCH_BASE_MS: 60000,
    WAIT_BATCH_PER_EXAM_MS: 8000,
    GO_BACK_MS: 20000,
    POLL_PDF_MS: 400,
    SEND_MESSAGE_MS: 5000,
    /** Pausa após cada PDF antes do próximo clique (estabilidade AGHU). */
    DELAY_BETWEEN_PDF_MS: 1500,
  };

  function batchWaitMs(examCount) {
    var n = Math.max(0, (examCount || 1) - 1);
    return DEFAULTS.WAIT_BATCH_BASE_MS + n * DEFAULTS.WAIT_BATCH_PER_EXAM_MS;
  }

  function attachWaitMs() {
    return (
      DEFAULTS.WAIT_ATTACH_DOWNLOAD_MS +
      DEFAULTS.EXTRACT_PDF_MS +
      DEFAULTS.WAIT_ATTACH_MARGIN_MS
    );
  }

  function attachFetchRaceMs() {
    return attachWaitMs() + DEFAULTS.GO_BACK_MS + DEFAULTS.WAIT_ATTACH_MARGIN_MS;
  }

  function extractPdfMs(pageCount) {
    var n = Math.max(1, pageCount || 1);
    return DEFAULTS.EXTRACT_PDF_MS + (n - 1) * DEFAULTS.EXTRACT_PDF_PER_PAGE_MS;
  }

  function extractPdfMsFromBuffer(arrayBuffer) {
    var bytes =
      arrayBuffer && arrayBuffer.byteLength ? arrayBuffer.byteLength : 0;
    var estPages = Math.max(1, Math.ceil(bytes / 12000));
    return extractPdfMs(estPages);
  }

  var api = {
    EXTRACT_PDF_MS: DEFAULTS.EXTRACT_PDF_MS,
    EXTRACT_PDF_PER_PAGE_MS: DEFAULTS.EXTRACT_PDF_PER_PAGE_MS,
    WAIT_PDF_DEFAULT_MS: DEFAULTS.WAIT_PDF_DEFAULT_MS,
    WAIT_ATTACH_MS: DEFAULTS.WAIT_ATTACH_MS,
    WAIT_ATTACH_DOWNLOAD_MS: DEFAULTS.WAIT_ATTACH_DOWNLOAD_MS,
    WAIT_ATTACH_MARGIN_MS: DEFAULTS.WAIT_ATTACH_MARGIN_MS,
    WAIT_BATCH_BASE_MS: DEFAULTS.WAIT_BATCH_BASE_MS,
    WAIT_BATCH_PER_EXAM_MS: DEFAULTS.WAIT_BATCH_PER_EXAM_MS,
    GO_BACK_MS: DEFAULTS.GO_BACK_MS,
    POLL_PDF_MS: DEFAULTS.POLL_PDF_MS,
    SEND_MESSAGE_MS: DEFAULTS.SEND_MESSAGE_MS,
    DELAY_BETWEEN_PDF_MS: DEFAULTS.DELAY_BETWEEN_PDF_MS,
    batchWaitMs: batchWaitMs,
    attachWaitMs: attachWaitMs,
    attachFetchRaceMs: attachFetchRaceMs,
    extractPdfMs: extractPdfMs,
    extractPdfMsFromBuffer: extractPdfMsFromBuffer,
  };

  if (typeof globalThis !== "undefined") {
    globalThis.AghuPdfFetchConfig = api;
  }
  if (typeof window !== "undefined") {
    window.AghuPdfFetchConfig = api;
  }
})();
