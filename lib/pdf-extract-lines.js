/**
 * Agrupamento determinístico de items PDF.js em linhas de texto.
 * Testável em Node; usado por pdfextract/extract.js via globalThis.
 */
(function (root) {
  "use strict";

  var Y_TOLERANCE = 3;

  /**
   * @param {Array<{ str?: string, transform?: number[] }>} items
   * @param {{ yTolerance?: number }} [opts]
   * @returns {string}
   */
  function buildPageTextFromPdfItems(items, opts) {
    opts = opts || {};
    var yTol = opts.yTolerance != null ? opts.yTolerance : Y_TOLERANCE;
    var list = Array.isArray(items) ? items : [];

    var tokens = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !item.str || !String(item.str).trim()) continue;
      var tr = item.transform || [];
      tokens.push({
        x: typeof tr[4] === "number" ? tr[4] : 0,
        y: typeof tr[5] === "number" ? tr[5] : 0,
        str: String(item.str).trim(),
        index: i,
      });
    }

    if (tokens.length === 0) return "";

    tokens.sort(function (a, b) {
      if (b.y !== a.y) return b.y - a.y;
      if (a.x !== b.x) return a.x - b.x;
      return a.index - b.index;
    });

    var lines = [];
    var current = [tokens[0]];
    var currentY = tokens[0].y;

    for (var j = 1; j < tokens.length; j++) {
      var tok = tokens[j];
      if (Math.abs(tok.y - currentY) <= yTol) {
        current.push(tok);
      } else {
        lines.push(joinLineTokens(current));
        current = [tok];
        currentY = tok.y;
      }
    }
    lines.push(joinLineTokens(current));

    return lines.filter(Boolean).join("\n");
  }

  function joinLineTokens(lineTokens) {
    lineTokens.sort(function (a, b) {
      if (a.x !== b.x) return a.x - b.x;
      return a.index - b.index;
    });
    return lineTokens
      .map(function (t) {
        return t.str;
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  root.AghuPdfExtractLines = {
    Y_TOLERANCE: Y_TOLERANCE,
    buildPageTextFromPdfItems: buildPageTextFromPdfItems,
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
