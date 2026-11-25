/**
 * Retenção temporal de exames — janela de visualização na aba Exames e matriz (por plano).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuExamRetention = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cutoffIsoFromDays(days, nowMs) {
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    var d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function isExamWithinRetention(exam, retentionDays, nowMs) {
    if (retentionDays == null) return true;
    if (!exam || typeof exam !== "object") return false;
    var iso = exam.dataColetaISO;
    if (!iso || typeof iso !== "string") return true;
    return iso >= cutoffIsoFromDays(retentionDays, nowMs);
  }

  function filterExamsArchive(archive, retentionDays, nowMs) {
    if (retentionDays == null) return archive;
    if (!archive || typeof archive !== "object") return archive;
    var byKey = archive.examsByKey;
    if (!byKey || typeof byKey !== "object") return archive;
    var filtered = {};
    for (var k in byKey) {
      if (
        Object.prototype.hasOwnProperty.call(byKey, k) &&
        isExamWithinRetention(byKey[k], retentionDays, nowMs)
      ) {
        filtered[k] = byKey[k];
      }
    }
    return {
      examsByKey: filtered,
      atualizadoEm: archive.atualizadoEm != null ? archive.atualizadoEm : null,
    };
  }

  /** Janela de visualização na aba Exames/matriz — upsert grava arquivo completo. */
  function shouldPruneExamsOnUpsert(_planSlug, _examRetentionDays) {
    return false;
  }

  return {
    cutoffIsoFromDays: cutoffIsoFromDays,
    isExamWithinRetention: isExamWithinRetention,
    filterExamsArchive: filterExamsArchive,
    shouldPruneExamsOnUpsert: shouldPruneExamsOnUpsert,
  };
});
