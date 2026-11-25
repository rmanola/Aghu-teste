/**
 * Status de registro E01 derivado da completude HPB.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbRecordStatus = api;
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

  function isYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  /**
   * @returns {"completo"|"pendente_patologia"|"pendente_seguimento"|"em_revisao"|"vazio"}
   */
  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function deriveRecordStatus(registry) {
    var schema = getSchemaApi();
    var active = schema ? schema.filterRegistryActive(registry || {}) : registry;
    if (!active || !Array.isArray(active.episodes) || !active.episodes.length) {
      return "vazio";
    }
    var alerts = getAlertsApi();
    if (alerts) {
      var activeAlerts = alerts.evalAlertsForRegistry(registry).filter(function (a) {
        return !alerts.isCompletenessAlert(a.id);
      });
      if (activeAlerts.some(function (a) {
        return a.id === "pathology_pending_30d" || a.id === "missing_r_status";
      })) {
        return "pendente_patologia";
      }
      if (activeAlerts.some(function (a) { return a.id === "followup_pending_90d"; })) {
        return "pendente_seguimento";
      }
      if (activeAlerts.length) return "em_revisao";
    }

    var allComplete = true;
    active.episodes.forEach(function (ep) {
      (ep.surgeries || []).forEach(function (s) {
        if (isYes(s.core?.malignant) && !s.pathology) allComplete = false;
        if (s.core?.date && !(ep.followups || []).some(function (fu) {
          return fu.surgeryId === s.id;
        })) {
          allComplete = false;
        }
      });
    });
    return allComplete ? "completo" : "em_revisao";
  }

  var STATUS_LABELS = {
    completo: "Completo",
    pendente_patologia: "Pendente patologia",
    pendente_seguimento: "Pendente seguimento",
    em_revisao: "Em revisão",
    vazio: "Sem registro Research",
  };

  return {
    deriveRecordStatus: deriveRecordStatus,
    STATUS_LABELS: STATUS_LABELS,
  };
});
