/**
 * Critério analysis-ready — zero alertas pendentes + episódio cadastrado.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbAnalysisReady = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var alertsApi = null;
  var schemaApi = null;
  var freezeApi = null;
  try {
    if (typeof require === "function") {
      alertsApi = require("./hpb-quality-alerts.js");
      schemaApi = require("./hpb-registry-schema.js");
      freezeApi = require("./hpb-data-freeze.js");
    }
  } catch (_e) {}

  function getAlertsApi() {
    if (alertsApi) return alertsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQualityAlerts || null;
  }

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function getFreezeApi() {
    if (freezeApi) return freezeApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbDataFreeze || null;
  }

  function activeRegistry(registry) {
    var schema = getSchemaApi();
    if (schema && schema.filterRegistryActive) {
      return schema.filterRegistryActive(registry || { episodes: [] });
    }
    return registry || { episodes: [] };
  }

  function countPendingAlerts(registry) {
    var api = getAlertsApi();
    if (!api) return 0;
    var active = api.evalAlertsForRegistry(registry);
    var pending = 0;
    active.forEach(function (alert) {
      if (!api.isResolved(registry, alert)) pending += 1;
    });
    return pending;
  }

  function isPatientAnalysisReady(registry) {
    var active = activeRegistry(registry);
    if (!active.episodes || !active.episodes.length) return false;
    return countPendingAlerts(registry) === 0;
  }

  /**
   * @param {Array<{ recordClientId: string, prontuario: string, registry: object }>} patients
   */
  function summarizeAnalysisReady(patients) {
    patients = Array.isArray(patients) ? patients : [];
    var freeze = getFreezeApi();
    var rows = patients.map(function (patient) {
      var registry = patient.registry || { episodes: [] };
      var pendingCount = countPendingAlerts(registry);
      var ready = isPatientAnalysisReady(registry);
      var frozen = freeze ? freeze.isRegistryFrozen(registry) : false;
      return {
        recordClientId: patient.recordClientId,
        prontuario: patient.prontuario || "—",
        pendingCount: pendingCount,
        analysisReady: ready,
        frozen: frozen,
        frozenAt: registry.dataFreeze?.frozenAt || null,
      };
    });
    var ready = rows.filter(function (r) {
      return r.analysisReady;
    }).length;
    return {
      total: rows.length,
      ready: ready,
      notReady: rows.length - ready,
      readyPct: rows.length ? Math.round((ready / rows.length) * 100) : 0,
      frozenCount: rows.filter(function (r) {
        return r.frozen;
      }).length,
      rows: rows,
    };
  }

  return {
    countPendingAlerts: countPendingAlerts,
    isPatientAnalysisReady: isPatientAnalysisReady,
    summarizeAnalysisReady: summarizeAnalysisReady,
  };
});
