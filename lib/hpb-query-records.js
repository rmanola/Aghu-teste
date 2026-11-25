/**
 * Query management — timestamps de abertura em alertResolutions.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbQueryRecords = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var alertsApi = null;
  var schemaApi = null;
  try {
    if (typeof require === "function") {
      alertsApi = require("./hpb-quality-alerts.js");
      schemaApi = require("./hpb-registry-schema.js");
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

  function nowIso() {
    var schema = getSchemaApi();
    if (schema && schema.nowIso) return schema.nowIso();
    return new Date().toISOString();
  }

  /**
   * Garante openedAt para alertas pendentes não resolvidos.
   * @param {object} registry
   * @returns {object}
   */
  function syncQueryOpenTimestamps(registry) {
    var api = getAlertsApi();
    if (!api || !registry || typeof registry !== "object") return registry;

    var resolutions = Object.assign({}, registry.alertResolutions || {});
    var active = api.evalAlertsForRegistry(registry);
    var changed = false;

    active.forEach(function (alert) {
      if (api.isResolved(registry, alert)) return;
      var key = api.alertInstanceKey(alert);
      var existing = resolutions[key];
      if (!existing) {
        resolutions[key] = { resolved: false, openedAt: nowIso() };
        changed = true;
        return;
      }
      if (!existing.openedAt) {
        resolutions[key] = Object.assign({}, existing, {
          openedAt: existing.resolvedAt || nowIso(),
        });
        changed = true;
      }
    });

    if (!changed) return registry;
    return Object.assign({}, registry, {
      alertResolutions: resolutions,
      atualizadoEm: nowIso(),
    });
  }

  return {
    syncQueryOpenTimestamps: syncQueryOpenTimestamps,
  };
});
