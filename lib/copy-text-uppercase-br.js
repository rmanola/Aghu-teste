/**
 * Copiar texto em CAIXA ALTA (pt-BR) — web + extensão (DRY com prescrições).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCopyTextUpperCaseBr = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @param {string} text
   * @returns {string}
   */
  function toUpperCaseBr(text) {
    return String(text || "").toLocaleUpperCase("pt-BR");
  }

  /**
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyTextUpperCaseBr(text) {
    var upper = toUpperCaseBr(text);
    if (!upper.trim()) return false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(upper);
      return true;
    }
    return false;
  }

  return {
    toUpperCaseBr: toUpperCaseBr,
    copyTextUpperCaseBr: copyTextUpperCaseBr,
  };
});
