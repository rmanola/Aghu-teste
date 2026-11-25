/**
 * Chave estável de exame em examsByKey: dataColetaISO|solicitation|examName|sample
 * Compartilhado entre extensão, sync e web.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamMergeKey = api;
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

    function normalizeSampleForKey(exam) {
      var api =
        typeof globalThis !== "undefined" && globalThis.AghuExamSampleKey
          ? globalThis.AghuExamSampleKey
          : typeof window !== "undefined" && window.AghuExamSampleKey
            ? window.AghuExamSampleKey
            : null;
      if (api && api.normalizeSampleKey) {
        return api.normalizeSampleKey(exam && exam.sample);
      }
      return String((exam && exam.sample) || "")
        .trim()
        .toLowerCase();
    }

    function examMergeKey(exam) {
      if (!exam || typeof exam !== "object") return "nodate|||";
      var iso = exam.dataColetaISO || "nodate";
      var sol = String(exam.solicitation || "").trim();
      var name = String(exam.examName || "").trim();
      var sample = normalizeSampleForKey(exam);
      return iso + "|" + sol + "|" + name + "|" + sample;
    }

    return {
      examMergeKey: examMergeKey,
    };
  },
);
