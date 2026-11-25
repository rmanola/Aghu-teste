/**
 * Normaliza data de nascimento do PII (ISO ou BR) para yyyy-mm-dd.
 * Testável em Node; extensão: global AghuPiiDobResolve.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuPiiDobResolve = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function dateBrApi() {
    if (root.AghuDateBr) return root.AghuDateBr;
    if (typeof require === "function") {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return null;
  }

  function isValidIsoDate(iso) {
    if (!iso || !ISO_DATE_RE.test(iso)) return false;
    var p = iso.split("-").map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    return (
      dt.getFullYear() === p[0] &&
      dt.getMonth() === p[1] - 1 &&
      dt.getDate() === p[2]
    );
  }

  /**
   * @param {string} raw
   * @returns {string}
   */
  function normalizeDobToIso(raw) {
    var cleaned = str(raw);
    if (!cleaned) return "";
    cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$/, "");
    if (isValidIsoDate(cleaned)) return cleaned;
    var br = dateBrApi();
    if (br && br.brToIso) {
      var fromBr = str(br.brToIso(cleaned));
      if (isValidIsoDate(fromBr)) return fromBr;
    }
    return "";
  }

  /**
   * @param {object | null | undefined} source
   * @returns {string}
   */
  function pickIsoDobFromPii(source) {
    if (!source || typeof source !== "object") return "";
    var candidates = [source.dataNascimentoISO, source.dataNascimento];
    for (var i = 0; i < candidates.length; i++) {
      var iso = normalizeDobToIso(candidates[i]);
      if (iso) return iso;
    }
    return "";
  }

  return {
    normalizeDobToIso: normalizeDobToIso,
    pickIsoDobFromPii: pickIsoDobFromPii,
    isValidIsoDate: isValidIsoDate,
  };
});
