/**
 * Normalização de amostra para chave de merge e pivot (SANGUE vs URINA).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamSampleKey = api;
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

    /** @param {string} [sample] */
    function normalizeSampleKey(sample) {
      return String(sample || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    /** @param {{ sample?: string } | null} a @param {{ sample?: string } | null} b */
    function samplesMergeCompatible(a, b) {
      if (!a || !b) return true;
      var sa = normalizeSampleKey(a.sample);
      var sb = normalizeSampleKey(b.sample);
      if (!sa || !sb) return true;
      return sa === sb;
    }

    /** @param {Record<string, unknown>} exam */
    function resultPriority(exam) {
      if (String(exam.result || "").trim()) return 3;
      if (String(exam.fetchedResult || "").trim()) return 2;
      if (String(exam.detailText || "").trim()) return 1;
      return 0;
    }

    /**
     * Quando amostras diferem, não fundir campos — escolhe linha com mais conteúdo.
     * @param {Record<string, unknown>} a
     * @param {Record<string, unknown>} b
     */
    function pickExamRowOnSampleConflict(a, b) {
      var pa = resultPriority(a);
      var pb = resultPriority(b);
      return pa >= pb ? a : b;
    }

    return {
      normalizeSampleKey: normalizeSampleKey,
      samplesMergeCompatible: samplesMergeCompatible,
      pickExamRowOnSampleConflict: pickExamRowOnSampleConflict,
    };
  },
);
