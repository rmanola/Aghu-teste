/**
 * Número em formato BR (1.234,56) ou laudo com ponto decimal (ex. INR 1.08).
 * Testável em Node; extensão: global AghuParseLocaleNumber.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuParseLocaleNumber = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @param {string} s
   * @returns {number}
   */
  function parsePtNumber(s) {
    var t = String(s || "").trim();
    if (!t) return NaN;

    var lastComma = t.lastIndexOf(",");
    var lastDot = t.lastIndexOf(".");

    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) {
        t = t.replace(/\./g, "").replace(",", ".");
      } else {
        t = t.replace(/,/g, "");
      }
    } else if (lastComma >= 0) {
      t = t.replace(",", ".");
    } else if (lastDot >= 0) {
      if (/^\d{1,3}(\.\d{3})+(\.\d{3})*$/.test(t)) {
        t = t.replace(/\./g, "");
      }
    }

    var n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  }

  return {
    parsePtNumber: parsePtNumber,
  };
});
