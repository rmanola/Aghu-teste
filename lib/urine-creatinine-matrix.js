/**
 * Creatinina urinária — chave única na matriz (CrU avulso, CREATININA urina, componente RAC).
 * Testável em Node; extensão/passômetro: require("./urine-creatinine-matrix.js").
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuUrineCreatinineMatrix = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var URINE_CREATININE_MATRIX_ROW_KEY = "creatinina|urina";
  var URINE_CREATININE_DISPLAY_LABEL = "CREATININA (URINA)";

  /** @param {string} s */
  function normalizeForMatch(s) {
    var t = String(s || "").trim();
    try {
      t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      t = t.replace(/[\u0300-\u036f]/g, "");
    }
    return t.toUpperCase();
  }

  /**
   * @param {string} examName
   * @param {string} [sample]
   */
  function isUrineCreatinineMatrixExam(examName, sample) {
    var examUp = normalizeForMatch(examName);
    var sampleUp = normalizeForMatch(sample);
    if (!examUp) return false;
    if (/\bCREATININA\s+URIN/.test(examUp)) return true;
    if (/\bRELAC/.test(examUp)) return false;
    if (/\bCREATININA\b/.test(examUp) && /\bURIN/.test(examUp)) return true;
    if (/\bCREATININA\b/.test(examUp) && /\bURIN/.test(sampleUp)) return true;
    return false;
  }

  /**
   * @param {string} examName
   * @param {string} [sample]
   * @returns {{ examName: string, sample: string }}
   */
  function normalizeUrineCreatinineMatrixIdentity(examName, sample) {
    var name = String(examName || "").trim() || "—";
    var sampleStr = String(sample || "").trim();
    if (!isUrineCreatinineMatrixExam(name, sampleStr)) {
      return { examName: name, sample: sampleStr };
    }
    return { examName: "CREATININA", sample: sampleStr || "URINA" };
  }

  /** @param {string} label */
  function isUrineCreatinineSubitemLabel(label) {
    var n = normalizeForMatch(label);
    if (!n || n.indexOf("CREATININA") < 0) return false;
    if (n.indexOf("RELAC") >= 0) return false;
    if (n.indexOf("ALBUMINA") >= 0 && n.indexOf("CREATININA") >= 0) return false;
    if (n.indexOf("PROTEINA") >= 0 && n.indexOf("CREATININA") >= 0) return false;
    return n === "CREATININA" || /\bCREATININA\b/.test(n);
  }

  /**
   * @param {string} examName
   * @param {string} [sample]
   */
  function isUrineCreatininePanelSource(examName, sample) {
    var examUp = normalizeForMatch(examName);
    var sampleUp = normalizeForMatch(sample);
    if (!/\bURIN/.test(sampleUp) && !/\bURIN/.test(examUp)) return false;
    return /\bRELAC/.test(examUp) || /\bRPTCR/.test(examUp);
  }

  return {
    URINE_CREATININE_MATRIX_ROW_KEY: URINE_CREATININE_MATRIX_ROW_KEY,
    URINE_CREATININE_DISPLAY_LABEL: URINE_CREATININE_DISPLAY_LABEL,
    normalizeForMatch: normalizeForMatch,
    isUrineCreatinineMatrixExam: isUrineCreatinineMatrixExam,
    normalizeUrineCreatinineMatrixIdentity: normalizeUrineCreatinineMatrixIdentity,
    isUrineCreatinineSubitemLabel: isUrineCreatinineSubitemLabel,
    isUrineCreatininePanelSource: isUrineCreatininePanelSource,
  };
});
