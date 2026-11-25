/**
 * Alertas E09 agregados cross-paciente para coorte /hpb.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbCohortAlerts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var alertsApi = null;
  try {
    if (typeof require === "function") alertsApi = require("./hpb-quality-alerts.js");
  } catch (_e) {}

  function getAlertsApi() {
    if (alertsApi) return alertsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQualityAlerts || null;
  }

  function parseInstanceKey(key) {
    var missingApi = null;
    try {
      if (typeof require === "function") {
        missingApi = require("./hpb-missing-field-alerts.js");
      }
    } catch (_e) {}
    if (
      missingApi &&
      missingApi.isCompletenessInstanceKey &&
      missingApi.isCompletenessInstanceKey(key)
    ) {
      var missingParts = String(key).split("::");
      return {
        id: missingParts[0],
        episodeId: missingParts[1] || undefined,
        scopeId: missingParts[2] || undefined,
        module: missingParts[3] || undefined,
        fieldKey: missingParts.slice(4).join("::") || undefined,
      };
    }
    var parts = String(key).split("::");
    if (parts.length >= 3) {
      return { id: parts[0], episodeId: parts[1] || undefined, surgeryId: parts[2] || undefined };
    }
    return { id: parts[0], episodeId: undefined, surgeryId: undefined };
  }

  function defForAlertId(alertId, alertsApiRef) {
    var defs = alertsApiRef.ALERT_DEFS || [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].id === alertId) return defs[i];
    }
    return null;
  }

  /**
   * @param {Array<{ recordClientId: string, prontuario: string, registry: object }>} patients
   * @param {{ status?: string, priority?: string, alertId?: string, module?: string }} [filter]
   */
  var cohortMetricsApi = null;
  try {
    if (typeof require === "function") {
      cohortMetricsApi = require("./hpb-query-resolution.js");
    }
  } catch (_e) {}

  function getMetricsApi() {
    if (cohortMetricsApi) return cohortMetricsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQueryResolution || null;
  }

  function pushRow(rows, patient, alert, status, api) {
    var instanceKey = api.alertInstanceKey(alert);
    var row = {
      recordClientId: patient.recordClientId,
      prontuario: patient.prontuario || "—",
      episodeId: alert.episodeId,
      surgeryId: alert.surgeryId,
      mdtId: alert.mdtId,
      lrtId: alert.lrtId,
      followupId: alert.followupId,
      scopeId: alert.scopeId,
      id: alert.id,
      type: alert.type,
      rule: alert.rule,
      verifyHint: alert.verifyHint || "",
      priority: alert.priority,
      responsible: alert.responsible,
      module: alert.module,
      moduleLabel: alert.moduleLabel,
      moduleRoute: alert.moduleRoute,
      fieldKey: alert.fieldKey,
      fieldLabel: alert.fieldLabel,
      instanceKey: instanceKey,
      status: status,
    };
    var metrics = getMetricsApi();
    if (metrics && metrics.enrichRowResolution) {
      row = metrics.enrichRowResolution(row, patient.registry || {});
    }
    rows.push(row);
    return instanceKey;
  }

  function buildCohortAlertRows(patients, filter) {
    var rows = [];
    if (!Array.isArray(patients)) return rows;
    var api = getAlertsApi();
    if (!api) return rows;

    filter = filter || {};

    patients.forEach(function (patient) {
      var registry = patient.registry || { episodes: [] };
      var active = api.evalAlertsForRegistry(registry);
      var seenKeys = {};

      active.forEach(function (alert) {
        var instanceKey = pushRow(rows, patient, alert, "Pendente", api);
        seenKeys[instanceKey] = true;
      });

      var resolutions = registry.alertResolutions || {};
      Object.keys(resolutions).forEach(function (key) {
        var entry = resolutions[key];
        if (!entry || !entry.resolved) return;
        if (seenKeys[key]) return;
        var parsed = parseInstanceKey(key);
        var restored = api.alertFromInstanceKey ? api.alertFromInstanceKey(key) : null;
        var def = restored || defForAlertId(parsed.id, api);
        if (!def) return;
        var instanceKey = key.indexOf("::") >= 0 ? key : api.alertInstanceKey(parsed);
        pushRow(
          rows,
          patient,
          Object.assign({}, def, {
            episodeId: def.episodeId || parsed.episodeId,
            surgeryId: def.surgeryId || parsed.surgeryId,
            scopeId: def.scopeId || parsed.scopeId,
            module: def.module || parsed.module,
            fieldKey: def.fieldKey || parsed.fieldKey,
            instanceKey: instanceKey,
          }),
          "Resolvido",
          api,
        );
      });
    });

    if (filter.status) {
      rows = rows.filter(function (r) {
        return r.status === filter.status;
      });
    }
    if (filter.priority) {
      rows = rows.filter(function (r) {
        return r.priority === filter.priority;
      });
    }
    if (filter.alertId) {
      rows = rows.filter(function (r) {
        return r.id === filter.alertId;
      });
    }
    if (filter.module) {
      rows = rows.filter(function (r) {
        return r.module === filter.module;
      });
    }

    return rows;
  }

  function summarizeCohortAlerts(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var pending = rows.filter(function (r) {
      return r.status === "Pendente";
    });
    var byPriority = {};
    var byType = {};
    pending.forEach(function (r) {
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
    });
    return {
      total: rows.length,
      pendingCount: pending.length,
      resolvedCount: rows.length - pending.length,
      byPriority: byPriority,
      byType: byType,
    };
  }

  return {
    buildCohortAlertRows: buildCohortAlertRows,
    summarizeCohortAlerts: summarizeCohortAlerts,
  };
});
