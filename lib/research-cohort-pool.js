/**
 * Pool da coorte Research AGHU-first (FEAT-065 / GEN-07).
 * Cap e merge de IDs sem exigir has_hpb_registry / has_research_registry.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchCohortPool = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Máximo de pacientes na listagem /research (mais recentes por updated_at). */
  var RESEARCH_COHORT_POOL_MAX = 200;

  /**
   * @param {Array<{ record_client_id?: string, recordClientId?: string, updated_at?: string, updatedAt?: string }>} rows
   * @param {number} [max]
   * @returns {string[]}
   */
  function selectCohortPoolIds(rows, max) {
    var limit =
      typeof max === "number" && max > 0 ? max : RESEARCH_COHORT_POOL_MAX;
    if (!Array.isArray(rows) || rows.length === 0) return [];

    var byId = new Map();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var id = String(row.record_client_id || row.recordClientId || "").trim();
      if (!id) continue;
      var updated = String(row.updated_at || row.updatedAt || "");
      var prev = byId.get(id);
      if (!prev || updated > String(prev.updated_at || prev.updatedAt || "")) {
        byId.set(id, row);
      }
    }

    return Array.from(byId.values())
      .sort(function (a, b) {
        var ua = String(a.updated_at || a.updatedAt || "");
        var ub = String(b.updated_at || b.updatedAt || "");
        return ub.localeCompare(ua);
      })
      .slice(0, limit)
      .map(function (row) {
        return String(row.record_client_id || row.recordClientId).trim();
      });
  }

  return {
    RESEARCH_COHORT_POOL_MAX: RESEARCH_COHORT_POOL_MAX,
    selectCohortPoolIds: selectCohortPoolIds,
  };
});
