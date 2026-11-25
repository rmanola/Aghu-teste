/**
 * Poll de browser.storage.local.aghu_pdf_result (content + popup).
 * Expõe globalThis.AghuPdfFetchWait.
 */
(function (root) {
  "use strict";

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function pdfFetchCfg() {
    var c = root.AghuPdfFetchConfig;
    if (c) return c;
    return {
      WAIT_PDF_DEFAULT_MS: 60000,
      POLL_PDF_MS: 400,
    };
  }

  /**
   * Interpreta entrada de aghu_pdf_result e devolve payload de fetch ou null se ignorar.
   * @param {object|null} r
   * @param {string|null} expectedCaptureId
   * @returns {object|null}
   */
  function parseStoredPdfResult(r, expectedCaptureId) {
    if (!r) return null;

    if (expectedCaptureId) {
      if (r.captureId && r.captureId !== expectedCaptureId) return null;
      if (!r.captureId && typeof r.ok === "boolean") return null;
    }

    if (typeof r.ok === "boolean") {
      var text = r.text || "";
      var pages = r.pages || [];
      if (r.ok) {
        var reason = r.reason || (text.length === 0 ? "no_text_extracted" : undefined);
        return {
          success: true,
          text: text,
          pages: pages,
          isPdf: true,
          reason: reason || null,
        };
      }
      return {
        success: false,
        text: "",
        pages: [],
        isPdf: true,
        reason: r.reason || "pdf_result_error",
      };
    }

    if (r.text && r.text.length > 0) {
      return {
        success: true,
        text: r.text,
        pages: r.pages || [],
        isPdf: true,
        reason: null,
      };
    }

    return null;
  }

  /**
   * @param {object} storage — browser.storage.local
   * @param {number|null} timeoutMs
   * @param {string|null} expectedCaptureId
   * @returns {Promise<object>}
   */
  async function waitForPdfResult(storage, timeoutMs, expectedCaptureId) {
    var cfg = pdfFetchCfg();
    var waitMs = timeoutMs != null ? timeoutMs : cfg.WAIT_PDF_DEFAULT_MS;
    var pollMs = cfg.POLL_PDF_MS || 400;
    var deadline = Date.now() + waitMs;

    while (Date.now() < deadline) {
      await sleep(pollMs);
      try {
        var stored = await storage.get("aghu_pdf_result");
        var r = stored.aghu_pdf_result;
        var parsed = parseStoredPdfResult(r, expectedCaptureId);
        if (!parsed) continue;

        await storage.remove("aghu_pdf_result");
        if (parsed.success) {
          console.log(
            "[AGHU] PDF result ok, chars:",
            parsed.text.length,
            "| páginas:",
            parsed.pages.length,
            parsed.reason || ""
          );
        } else {
          console.warn("[AGHU] PDF result ok=false reason=", parsed.reason);
        }
        return parsed;
      } catch (_e) {}
    }

    console.warn("[AGHU] waitForPdfResult timed out");
    return { success: false, text: "", pages: [], isPdf: false, reason: "wait_timeout" };
  }

  root.AghuPdfFetchWait = {
    parseStoredPdfResult: parseStoredPdfResult,
    waitForPdfResult: waitForPdfResult,
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
        ? self
        : this
);
