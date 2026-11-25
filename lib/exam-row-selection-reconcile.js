/**
 * Reconcilia seleção de linhas de exames quando a matriz exportável muda (sync, filtro).
 * Fonte canônica para testes Node; web usa web/lib/patient-records/exam-row-selection-reconcile.mjs.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof root !== "undefined") {
    root.AghuExamRowSelectionReconcile = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @param {string[]} prevExportable
   * @param {Set<string>|string[]} prevSelected
   * @param {string[]} nextExportable
   * @returns {Set<string>}
   */
  function reconcileExamRowSelection(prevExportable, prevSelected, nextExportable) {
    var nextSet = new Set(nextExportable);
    var prevSel =
      prevSelected instanceof Set ? prevSelected : new Set(prevSelected);

    if (nextExportable.length === 0) {
      return new Set();
    }

    if (prevExportable.length === 0) {
      if (prevSel.size === 0) {
        return new Set(nextExportable);
      }
      var fromPersist = new Set();
      prevSel.forEach(function (k) {
        if (nextSet.has(k)) fromPersist.add(k);
      });
      return fromPersist;
    }

    var hadAllSelected = prevExportable.every(function (k) {
      return prevSel.has(k);
    });

    if (hadAllSelected) {
      return new Set(nextExportable);
    }

    var merged = new Set();
    prevSel.forEach(function (k) {
      if (nextSet.has(k)) merged.add(k);
    });
    return merged;
  }

  return {
    reconcileExamRowSelection: reconcileExamRowSelection,
  };
});
