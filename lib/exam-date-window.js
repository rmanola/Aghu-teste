/**
 * Janela temporal de extração de exames (dateFrom/dateTo inclusive, ISO yyyy-mm-dd).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamDateWindow = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this,
  function () {
    "use strict";

    /**
     * @param {object|null|undefined} exam
     * @param {string|null|undefined} dateFrom ISO yyyy-mm-dd
     * @param {string|null|undefined} dateTo ISO yyyy-mm-dd
     * @returns {boolean}
     */
    function isExamInExtractWindow(exam, dateFrom, dateTo) {
      if (!dateFrom && !dateTo) return true;
      if (!exam || typeof exam !== "object") return true;
      var iso = exam.dataColetaISO;
      if (!iso || typeof iso !== "string") return true;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    }

    return {
      isExamInExtractWindow: isExamInExtractWindow,
    };
  },
);
