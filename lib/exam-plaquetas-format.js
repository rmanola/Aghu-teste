/**
 * Formatação e escala de plaquetas (Pqt): ×1000 só com sufixo x10³/μL explícito.
 * Testável em Node via module.exports; extensão/web: global AghuExamPlaquetasFormat.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuExamPlaquetasFormat = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  function getScaleRe() {
    var lab = root.AghuPdfLabParse;
    if (lab && lab.RE_SCALE_PER_MICROLITER) return lab.RE_SCALE_PER_MICROLITER;
    return /(?:10\^3|10³|10\s*\^\s*3|x\s*10\s*\^\s*3|x\s*10³|x10³|x10\^3|x103)(?:\s*\/\s*[µμu]\s*l|\/\s*[µμ]l|\s*\/\s*mm[³3])/i;
  }

  var localeNumber = root.AghuParseLocaleNumber;
  if (!localeNumber && typeof require === "function") {
    try {
      localeNumber = require("./parse-locale-number.js");
    } catch (_e) {}
  }

  /**
   * @param {string} s
   * @returns {number}
   */
  function parsePtNumber(s) {
    if (localeNumber && localeNumber.parsePtNumber) {
      return localeNumber.parsePtNumber(s);
    }
    return NaN;
  }

  /**
   * @param {string} rest
   * @returns {boolean}
   */
  function hasScaledPerMicroliterSuffix(rest) {
    var r = String(rest || "").trim();
    return r ? getScaleRe().test(r) : false;
  }

  /**
   * @param {string} raw
   * @returns {{ valueStr: string, rest: string }|null}
   */
  function splitPlaquetasParts(raw) {
    var t = String(raw || "").trim();
    if (!t || t === "—") return null;

    var colon = t.match(/^PLAQUETAS\s*:\s*(.+)$/i);
    if (colon) t = colon[1].trim();

    var absMatch = t.match(/^([\d][\d.]*)\s*\/\s*[µμu]?l\s*$/i);
    if (absMatch) {
      return { valueStr: absMatch[1].replace(/\./g, ""), rest: "" };
    }

    var numMatch = t.match(/^([<>≤≥]?\s*[-+]?\d[\d,\.]*)\s*(.*)$/);
    if (!numMatch) return null;
    return {
      valueStr: numMatch[1].trim(),
      rest: (numMatch[2] || "").trim(),
    };
  }

  /**
   * Valor absoluto /µL para gráficos e comparação.
   * @param {string} valueStr
   * @param {string} [rest]
   * @returns {number}
   */
  function plaquetasAbsoluteNumeric(valueStr, rest) {
    var n = parsePtNumber(valueStr);
    if (!Number.isFinite(n)) return NaN;
    if (hasScaledPerMicroliterSuffix(rest)) {
      // HCPA: «465000 x 10^3/µL» já é contagem absoluta; «216 x 10³» precisa escalar.
      if (n >= 10000) return Math.round(n);
      return Math.round(n * 1000);
    }
    return Math.round(n);
  }

  /**
   * Exibição unificada: "216.000 /µL" ou "500 /µL".
   * @param {string} raw
   * @returns {string}
   */
  function formatPlaquetasDisplay(raw) {
    var parts = splitPlaquetasParts(raw);
    if (!parts) return String(raw || "").trim();
    var abs = plaquetasAbsoluteNumeric(parts.valueStr, parts.rest);
    if (!Number.isFinite(abs)) return String(raw || "").trim();
    return (
      abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " /µL"
    );
  }

  /**
   * @param {string} label
   * @param {string} [resolvedSigla]
   * @returns {boolean}
   */
  function isPlaquetasAnalyte(label, resolvedSigla) {
    if (resolvedSigla === "Pqt") return true;
    return /\bPLAQUETAS\b/i.test(String(label || ""));
  }

  return {
    parsePtNumber: parsePtNumber,
    hasScaledPerMicroliterSuffix: hasScaledPerMicroliterSuffix,
    splitPlaquetasParts: splitPlaquetasParts,
    plaquetasAbsoluteNumeric: plaquetasAbsoluteNumeric,
    formatPlaquetasDisplay: formatPlaquetasDisplay,
    isPlaquetasAnalyte: isPlaquetasAnalyte,
  };
});
