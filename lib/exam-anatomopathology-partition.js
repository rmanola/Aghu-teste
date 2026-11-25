/**
 * Partição de exames laboratoriais vs anatomopatológicos (nome ANATOMO-PATOL).
 * Fonte canónica da detecção: lib/pdf-lab-parse.js → isAnatomopathologyExamName.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuExamAnatomopathologyPartition = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function getPdfLabParse() {
    if (root.AghuPdfLabParse && root.AghuPdfLabParse.isAnatomopathologyExamName) {
      return root.AghuPdfLabParse;
    }
    if (typeof module !== "undefined" && typeof require === "function") {
      try {
        return require("./pdf-lab-parse.js");
      } catch (_e) {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * @param {string | null | undefined} examName
   * @returns {boolean}
   */
  function isAnatomopathologyExamName(examName) {
    var lab = getPdfLabParse();
    if (lab && lab.isAnatomopathologyExamName) {
      return lab.isAnatomopathologyExamName(examName);
    }
    var n = String(examName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /ANATOMO[\s-]*PATOL/.test(n);
  }

  /**
   * @param {{ examName?: string } | null | undefined} exam
   * @returns {boolean}
   */
  function isAnatomopathologyExam(exam) {
    return isAnatomopathologyExamName(exam && exam.examName);
  }

  /**
   * @param {Array<{ examName?: string }>} exams
   * @returns {{ laboratory: typeof exams, anatomopathology: typeof exams }}
   */
  function partitionExamsByAnatomopathology(exams) {
    var laboratory = [];
    var anatomopathology = [];
    var list = Array.isArray(exams) ? exams : [];
    for (var i = 0; i < list.length; i++) {
      var exam = list[i];
      if (!exam || typeof exam !== "object") continue;
      if (isAnatomopathologyExam(exam)) {
        anatomopathology.push(exam);
      } else {
        laboratory.push(exam);
      }
    }
    return { laboratory: laboratory, anatomopathology: anatomopathology };
  }

  return {
    isAnatomopathologyExamName: isAnatomopathologyExamName,
    isAnatomopathologyExam: isAnatomopathologyExam,
    partitionExamsByAnatomopathology: partitionExamsByAnatomopathology,
  };
});
