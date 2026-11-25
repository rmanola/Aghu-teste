/**
 * Utilitários compartilhados das calculadoras (popup).
 * @sync web/components/calculators/calculator-shared.ts
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuCalculatorShared = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseManualDecimal(raw) {
    var t = String(raw != null ? raw : "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    if (!t) return null;
    var n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function formatDecimalPt(value, maximumFractionDigits) {
    maximumFractionDigits = maximumFractionDigits != null ? maximumFractionDigits : 2;
    return value.toLocaleString("pt-BR", {
      maximumFractionDigits: maximumFractionDigits,
    });
  }

  function formatMissingMessage(missing, labels, fallback) {
    if (!missing || !missing.length) return fallback;
    var parts = missing.map(function (key) {
      return labels[key] || key;
    });
    if (parts.length === 1) {
      return "Informe " + parts[0] + " para ver o resultado.";
    }
    var last = parts.pop();
    return "Informe " + parts.join(", ") + " e " + last + " para ver o resultado.";
  }

  return {
    parseManualDecimal: parseManualDecimal,
    formatDecimalPt: formatDecimalPt,
    formatMissingMessage: formatMissingMessage,
  };
});
