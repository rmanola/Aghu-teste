/**
 * Métricas de query management HPB (coorte).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbQueryMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var cohortAlertsApi = null;
  var resolutionApi = null;
  try {
    if (typeof require === "function") {
      cohortAlertsApi = require("./hpb-cohort-alerts.js");
      resolutionApi = require("./hpb-query-resolution.js");
    }
  } catch (_e) {}

  function getCohortAlertsApi() {
    if (cohortAlertsApi) return cohortAlertsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbCohortAlerts || null;
  }

  function getResolutionApi() {
    if (resolutionApi) return resolutionApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQueryResolution || null;
  }

  function diffDays(startIso, endIso) {
    var api = getResolutionApi();
    if (api && api.diffDays) return api.diffDays(startIso, endIso);
    if (!startIso || !endIso) return null;
    var a = new Date(String(startIso)).getTime();
    var b = new Date(String(endIso)).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round(((b - a) / 86400000) * 10) / 10;
  }

  function enrichRowResolution(row, registry) {
    var api = getResolutionApi();
    if (api && api.enrichRowResolution) {
      return api.enrichRowResolution(row, registry);
    }
    return row;
  }

  function resolutionEntry(registry, instanceKey) {
    var api = getResolutionApi();
    if (api && api.resolutionEntry) {
      return api.resolutionEntry(registry, instanceKey);
    }
    return registry?.alertResolutions?.[instanceKey] || null;
  }

  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }
    return sorted[mid];
  }

  function average(values) {
    if (!values.length) return null;
    var sum = values.reduce(function (acc, v) {
      return acc + v;
    }, 0);
    return Math.round((sum / values.length) * 10) / 10;
  }

  /**
   * @param {Array<{ recordClientId: string, prontuario: string, registry: object }>} patients
   */
  function summarizeQueryMetrics(patients) {
    patients = Array.isArray(patients) ? patients : [];
    var cohort = getCohortAlertsApi();
    if (!cohort) {
      return {
        avgResolutionDays: null,
        medianPendingAgingDays: null,
        reopenRatePct: 0,
        missingRateByField: [],
        pendingByResponsible: {},
      };
    }

    var rows = cohort.buildCohortAlertRows(patients);
    var registryById = {};
    patients.forEach(function (p) {
      registryById[p.recordClientId] = p.registry;
    });

    var resolutionDays = [];
    var pendingAging = [];
    var reopenCandidates = 0;
    var reopenCount = 0;
    var missingByField = {};
    var pendingByResponsible = {};

    rows.forEach(function (row) {
      var registry = registryById[row.recordClientId] || {};
      var enriched = enrichRowResolution(row, registry);
      if (enriched.status === "Resolvido" && enriched.resolutionDays != null) {
        resolutionDays.push(enriched.resolutionDays);
      }
      if (enriched.status === "Pendente") {
        if (enriched.agingDays != null) pendingAging.push(enriched.agingDays);
        var resp = row.responsible || "—";
        pendingByResponsible[resp] = (pendingByResponsible[resp] || 0) + 1;
      }
      var entry = resolutionEntry(registry, row.instanceKey);
      if (entry && entry.resolvedAt) {
        reopenCandidates += 1;
        if (entry.resolved === false) reopenCount += 1;
      }
      if (
        row.status === "Pendente" &&
        (row.id === "field_incomplete" ||
          row.id === "field_pending" ||
          row.id === "field_unknown")
      ) {
        var fk = (row.module || "—") + "::" + (row.fieldKey || row.fieldLabel || "—");
        if (!missingByField[fk]) {
          missingByField[fk] = {
            module: row.module || "—",
            fieldKey: row.fieldKey || "",
            fieldLabel: row.fieldLabel || row.fieldKey || "—",
            count: 0,
          };
        }
        missingByField[fk].count += 1;
      }
    });

    var missingRateByField = Object.keys(missingByField)
      .map(function (k) {
        var item = missingByField[k];
        return {
          module: item.module,
          fieldKey: item.fieldKey,
          fieldLabel: item.fieldLabel,
          pendingCount: item.count,
        };
      })
      .sort(function (a, b) {
        return b.pendingCount - a.pendingCount;
      });

    return {
      avgResolutionDays: average(resolutionDays),
      medianPendingAgingDays: median(pendingAging),
      reopenRatePct:
        reopenCandidates > 0
          ? Math.round((reopenCount / reopenCandidates) * 1000) / 10
          : 0,
      missingRateByField: missingRateByField,
      pendingByResponsible: pendingByResponsible,
    };
  }

  return {
    diffDays: diffDays,
    enrichRowResolution: enrichRowResolution,
    summarizeQueryMetrics: summarizeQueryMetrics,
  };
});
