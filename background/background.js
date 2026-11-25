"use strict";
let panelWindowId = null;
/** @type {Record<string, number>} kind|patientKey → windowId */
let altaDocumentoWindowIds = Object.create(null);

const ALTA_DOCUMENTO_KINDS = {
  receituario: true,
  orientacoes: true,
  laudo: true,
  laudoPersonalizado: true,
  atestado: true,
  acompanhante: true,
  retorno: true,
  referencia: true,
  contrarreferencia: true,
};

function altaDocumentoWindowKey(kind, patientKey) {
  return String(kind) + "|" + String(patientKey);
}

function isValidAltaDocumentoKind(kind) {
  return typeof kind === "string" && !!ALTA_DOCUMENTO_KINDS[kind];
}

/**
 * Abre ou foca a janela do preview Documento (FEAT-159 / gate Alta).
 * Query só com kind + patientKey opaco — sem nome/prontuário.
 */
async function openAltaDocumentoWindow(kind, patientKey) {
  if (!isValidAltaDocumentoKind(kind)) {
    return { ok: false, error: "invalid_kind" };
  }
  var keyOpaque =
    typeof patientKey === "string" ? patientKey.trim() : "";
  if (!keyOpaque) {
    return { ok: false, error: "missing_patient_key" };
  }
  var cacheKey = altaDocumentoWindowKey(kind, keyOpaque);
  var existingId = altaDocumentoWindowIds[cacheKey];
  if (existingId != null) {
    try {
      await browser.windows.update(existingId, { focused: true });
      return { ok: true, windowId: existingId, focused: true };
    } catch (_e) {
      delete altaDocumentoWindowIds[cacheKey];
    }
  }
  var url =
    browser.runtime.getURL("popup/alta-documento.html") +
    "?kind=" +
    encodeURIComponent(kind) +
    "&patientKey=" +
    encodeURIComponent(keyOpaque);
  var win = await browser.windows.create({
    url: url,
    type: "popup",
    width: 794,
    height: 900,
  });
  if (win && win.id != null) {
    altaDocumentoWindowIds[cacheKey] = win.id;
  }
  return { ok: true, windowId: win && win.id, focused: false };
}
/** Serializa intercept → extract → save (evita corrida entre PDFs concorrentes). */
let pdfProcessQueue = Promise.resolve();

async function readPendingCaptureId() {
  try {
    const st = await browser.storage.local.get("aghu_pdf_capture_id");
    return st.aghu_pdf_capture_id || null;
  } catch (_e) {
    return null;
  }
}

async function captureIdStillPending(expectedCaptureId) {
  if (!expectedCaptureId) return false;
  const current = await readPendingCaptureId();
  return current === expectedCaptureId;
}

function enqueuePdfProcessing(task) {
  pdfProcessQueue = pdfProcessQueue
    .then(() => task())
    .catch((e) => {
      console.error("[AGHU bg] erro na fila PDF:", e);
    });
  return pdfProcessQueue;
}

/**
 * Janela normal do Firefox — nunca a popup da extensão (MV2).
 * @returns {Promise<number>}
 */
async function resolvePanelWindowId() {
  try {
    var stored = await browser.storage.local.get("aghu_source_tab_id");
    if (stored.aghu_source_tab_id) {
      var src = await browser.tabs.get(stored.aghu_source_tab_id);
      if (src && src.windowId != null) {
        var srcWin = await browser.windows.get(src.windowId);
        if (srcWin && srcWin.type === "normal") {
          return src.windowId;
        }
      }
    }
  } catch (_e) {}

  var wins = await browser.windows.getAll({ windowTypes: ["normal"] });
  if (wins.length) {
    wins.sort(function (a, b) {
      return (b.lastFocusTime || 0) - (a.lastFocusTime || 0);
    });
    return wins[0].id;
  }

  var created = await browser.windows.create({ type: "normal" });
  return created.id;
}

/**
 * @param {string} targetUrl
 * @returns {Promise<browser.tabs.Tab>}
 */
async function openWebPanelTabInNormalWindow(targetUrl) {
  var windowId = await resolvePanelWindowId();
  var win = await browser.windows.get(windowId);
  console.log(
    "[AGHU bg] openWebPanelTab windowId=",
    windowId,
    "type=",
    win && win.type,
    "host=",
    String(targetUrl).replace(/^https?:\/\//, "").split("/")[0],
  );
  var tab = await browser.tabs.create({
    windowId: windowId,
    url: targetUrl,
    active: true,
  });
  return tab;
}

function pdfFetchCfg() {
  const c = typeof AghuPdfFetchConfig !== "undefined" ? AghuPdfFetchConfig : null;
  return c || {
    EXTRACT_PDF_MS: 45000,
    WAIT_PDF_DEFAULT_MS: 60000,
    WAIT_ATTACH_MS: 50000,
    WAIT_BATCH_BASE_MS: 60000,
    WAIT_BATCH_PER_EXAM_MS: 8000,
    GO_BACK_MS: 20000,
    POLL_PDF_MS: 400,
    DELAY_BETWEEN_PDF_MS: 1500,
    batchWaitMs(n) {
      return this.WAIT_BATCH_BASE_MS + Math.max(0, (n || 1) - 1) * this.WAIT_BATCH_PER_EXAM_MS;
    },
  };
}

// ── Toolbar button ────────────────────────────────────────────────────────
browser.browserAction.onClicked.addListener(async (tab) => {
  await browser.storage.local.set({ aghu_source_tab_id: tab.id });

  if (panelWindowId !== null) {
    try { await browser.windows.update(panelWindowId, { focused: true }); return; }
    catch(e) { panelWindowId = null; }
  }

  const win = await browser.windows.create({
    url:    browser.runtime.getURL("popup/popup.html"),
    type:   "popup",
    width:  600,
    height: 680,
  });
  panelWindowId = win.id;
});

browser.windows.onRemoved.addListener(id => {
  if (id === panelWindowId) panelWindowId = null;
  var keys = Object.keys(altaDocumentoWindowIds);
  for (var i = 0; i < keys.length; i++) {
    if (altaDocumentoWindowIds[keys[i]] === id) {
      delete altaDocumentoWindowIds[keys[i]];
    }
  }
});

/** Persista resultado de PDF para o content-script consumir (sempre com ok/reason). */
async function savePdfResult(payload) {
  let captureId = payload.captureId || null;
  if (!captureId) {
    try {
      const st = await browser.storage.local.get("aghu_pdf_capture_id");
      captureId = st.aghu_pdf_capture_id || null;
    } catch (_e) {}
  }
  await browser.storage.local.set({
    aghu_pdf_result: {
      ok:    payload.ok,
      text:  payload.text || "",
      pages: payload.pages || [],
      ts:    Date.now(),
      reason: payload.reason,
      captureId,
    },
  });
  if (captureId) {
    await browser.storage.local.remove("aghu_pdf_capture_id");
  }
  console.log(
    "[AGHU bg] aghu_pdf_result salvo ok=",
    payload.ok,
    "reason=",
    payload.reason || "",
    "captureId=",
    captureId || "",
    "bytes=",
    payload.bytes != null ? payload.bytes : "-",
    "pages=",
    (payload.pages || []).length,
    "chars=",
    (payload.text || "").length
  );
}

/** Grava resultado se não houver outro melhor para o mesmo captureId. */
async function savePdfResultIfBetter(payload) {
  const captureId =
    payload.captureId ||
    (await readPendingCaptureId());
  if (!captureId) {
    console.warn("[AGHU bg] savePdfResultIfBetter sem captureId — ignorado");
    return;
  }
  payload.captureId = captureId;

  try {
    const st = await browser.storage.local.get("aghu_pdf_result");
    const existing = st.aghu_pdf_result;
    if (
      existing &&
      existing.captureId === captureId &&
      existing.ok &&
      payload.ok
    ) {
      const prevLen = String(existing.text || "").length;
      const nextLen = String(payload.text || "").length;
      if (prevLen > nextLen) {
        console.log(
          "[AGHU bg] PDF descartado: resultado existente maior (",
          prevLen,
          ">",
          nextLen,
          "chars ) captureId=",
          captureId
        );
        return;
      }
    }
  } catch (_e) {}

  await savePdfResult(payload);
}

// ── Voltar na aba (lista de exames após abrir PDF) ────────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "openWebPanelTab") {
    var targetUrl = typeof msg.url === "string" ? msg.url.trim() : "";
    if (!targetUrl) {
      sendResponse({ ok: false, error: "missing_url" });
      return false;
    }
    openWebPanelTabInNormalWindow(targetUrl)
      .then(function (tab) {
        sendResponse({ ok: true, tabId: tab.id, windowId: tab.windowId });
      })
      .catch(function (err) {
        console.error("[AGHU bg] openWebPanelTab falhou:", err);
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : "tabs_create_failed",
        });
      });
    return true;
  }

  if (msg.action === "openAltaDocumentoWindow") {
    openAltaDocumentoWindow(msg.kind, msg.patientKey)
      .then(function (result) {
        sendResponse(result);
      })
      .catch(function (err) {
        console.error("[AGHU bg] openAltaDocumentoWindow falhou:", err);
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : "window_create_failed",
        });
      });
    return true;
  }

  if (msg.action !== "aghuGoBack") return;

  const tabId = msg.tabId || sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: "no_tab" });
    return false;
  }

  browser.tabs.goBack(tabId)
    .then(() => sendResponse({ ok: true }))
    .catch(() => {
      browser.tabs.executeScript(tabId, { code: "window.history.back();" })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    });
  return true;
});

// ── Intercept PDF via webRequest filter ───────────────────────────────────
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url.toLowerCase();
    if (!url.includes("dynamiccontent")) return {};

    var pdfLogUrl;
    try {
      var parsed = new URL(details.url);
      pdfLogUrl = parsed.origin + parsed.pathname;
    } catch (_e) {
      pdfLogUrl = "(url-invalida)";
    }
    console.log("[AGHU bg] PDF interceptado:", pdfLogUrl);

    let filter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
    } catch(e) {
      console.error("[AGHU bg] erro ao criar filter:", e);
      savePdfResult({ ok: false, text: "", pages: [], reason: "filter_create_error" }).catch(() => {});
      return {};
    }

    const chunks = [];
    let totalBytes = 0;

    filter.ondata = (event) => {
      chunks.push(new Uint8Array(event.data));
      totalBytes += event.data.byteLength;
      filter.write(event.data);
    };

    filter.onstop = () => {
      filter.disconnect();
      const byteCount = totalBytes;
      const pdfBytes = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) {
        pdfBytes.set(chunk, offset);
        offset += chunk.length;
      }

      enqueuePdfProcessing(async () => {
        console.log("[AGHU bg] PDF completo, bytes:", byteCount);

        const captureIdAtStart = await readPendingCaptureId();
        if (!captureIdAtStart) {
          console.warn("[AGHU bg] PDF órfão descartado (sem captureId pendente), bytes:", byteCount);
          return;
        }

        if (byteCount < 100) {
          if (await captureIdStillPending(captureIdAtStart)) {
            await savePdfResultIfBetter({
              ok: false,
              text: "",
              pages: [],
              reason: "response_too_small",
              bytes: byteCount,
              captureId: captureIdAtStart,
            });
          }
          return;
        }

        if (
          pdfBytes[0] !== 0x25 ||
          pdfBytes[1] !== 0x50 ||
          pdfBytes[2] !== 0x44 ||
          pdfBytes[3] !== 0x46
        ) {
          console.warn("[AGHU bg] resposta não é PDF, captureId=", captureIdAtStart);
          if (await captureIdStillPending(captureIdAtStart)) {
            await savePdfResultIfBetter({
              ok: false,
              text: "",
              pages: [],
              reason: "not_pdf_signature",
              bytes: byteCount,
              captureId: captureIdAtStart,
            });
          }
          return;
        }

        const extracted = await extractTextFromPdfBytes(pdfBytes.buffer);
        console.log(
          "[AGHU bg] texto extraído:",
          extracted.text.length,
          "chars,",
          extracted.pages.length,
          "páginas, captureId=",
          captureIdAtStart
        );

        if (!(await captureIdStillPending(captureIdAtStart))) {
          console.warn(
            "[AGHU bg] PDF descartado: captureId mudou após extração (",
            captureIdAtStart,
            ")"
          );
          return;
        }

        if (extracted.timedOut) {
          await savePdfResultIfBetter({
            ok: false,
            text: "",
            pages: [],
            reason: "extract_timeout",
            bytes: byteCount,
            captureId: captureIdAtStart,
          });
          return;
        }
        if (extracted.extractError) {
          await savePdfResultIfBetter({
            ok: false,
            text: "",
            pages: [],
            reason: "extract_exception",
            bytes: byteCount,
            captureId: captureIdAtStart,
          });
          return;
        }
        const t = extracted.text || "";
        if (t.length === 0) {
          await savePdfResultIfBetter({
            ok: true,
            text: "",
            pages: extracted.pages || [],
            reason: "no_text_extracted",
            bytes: byteCount,
            captureId: captureIdAtStart,
          });
          return;
        }
        await savePdfResultIfBetter({
          ok: true,
          text: t,
          pages: extracted.pages || [],
          bytes: byteCount,
          captureId: captureIdAtStart,
        });
      });
    };

    filter.onerror = () => {
      console.error("[AGHU bg] filter error:", filter.error);
      try { filter.disconnect(); } catch (_) {}
      enqueuePdfProcessing(async () => {
        const captureId = await readPendingCaptureId();
        if (!captureId) return;
        await savePdfResultIfBetter({
          ok: false,
          text: "",
          pages: [],
          reason: "network_filter_error",
          captureId,
        });
      });
    };

    return {};
  },
  {
    urls: (typeof AghuHostPatterns !== "undefined"
      ? AghuHostPatterns.AGHU_PDF_WEBREQUEST_PATTERNS
      : ["*://*.hcpa.edu.br/*", "*://*.ebserh.gov.br/*", "*://aghu.hucam-ufes.ebserh/*"]),
    types: ["object", "sub_frame", "xmlhttprequest", "other", "main_frame"],
  },
  ["blocking"]
);

// ── PDF text extraction via pdfextract/extract.html + PDF.js ─────────────
async function extractTextFromPdfBytes(arrayBuffer) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    browser.tabs.create({
      url:    browser.runtime.getURL("pdfextract/extract.html"),
      active: false,
    }).then(tab => {
      const extractTabId = tab.id;
      let timeoutId;

      const listener = (msg, sender) => {
        if (!sender.tab || sender.tab.id !== extractTabId) return;

        if (msg.action === "pdfExtractReady") {
          browser.tabs.sendMessage(extractTabId, {
            action: "extractPdf",
            buffer: Array.from(new Uint8Array(arrayBuffer)),
          });
        }
        if (msg.action === "pdfExtractResult") {
          clearTimeout(timeoutId);
          browser.runtime.onMessage.removeListener(listener);
          browser.tabs.remove(extractTabId).catch(() => {});
          finish({
            text: msg.text || "",
            pages: msg.pages || [],
            extractError: !!msg.error,
            timedOut: false,
          });
        }
      };
      browser.runtime.onMessage.addListener(listener);

      timeoutId = setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        browser.tabs.remove(extractTabId).catch(() => {});
        console.warn("[AGHU bg] timeout aguardando pdfExtractResult");
        finish({ text: "", pages: [], timedOut: true, extractError: false });
      }, pdfFetchCfg().extractPdfMsFromBuffer(arrayBuffer));
    }).catch(e => {
      console.error("[AGHU bg] erro ao criar extract tab:", e);
      finish({ text: "", pages: [], timedOut: false, extractError: true });
    });
  });
}
