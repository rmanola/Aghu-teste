import * as pdfjsLib from "./pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL("pdfextract/pdf.worker.mjs");

// Signal background we're ready
browser.runtime.sendMessage({ action: "pdfExtractReady" });

function buildPageText(content) {
  const api = globalThis.AghuPdfExtractLines;
  if (api && api.buildPageTextFromPdfItems) {
    return api.buildPageTextFromPdfItems(content.items);
  }
  return legacyBuildPageText(content.items);
}

/** Fallback se pdf-extract-lines.js não carregou. */
function legacyBuildPageText(items) {
  const lineMap = new Map();
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], str: item.str });
  }
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  return sortedYs
    .map((y) =>
      lineMap
        .get(y)
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join("  ")
        .trim()
    )
    .filter((l) => l.length > 0)
    .join("\n");
}

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.action !== "extractPdf") return;
  try {
    const uint8 = new Uint8Array(msg.buffer);
    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      pages.push(buildPageText(content));
    }

    browser.runtime.sendMessage({ action: "pdfExtractResult", text: pages.join("\n"), pages });
  } catch (e) {
    console.error("[AGHU extract] error:", e);
    browser.runtime.sendMessage({ action: "pdfExtractResult", text: "", pages: [], error: true });
  }
});
