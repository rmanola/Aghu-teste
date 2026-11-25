/**
 * Enriquecimento de linhas de alerta com metadados de resolução (sem dependência de coorte).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbQueryResolution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var alertsApi = null;
  try {
    if (typeof require === "function") {
      alertsApi = require("./hpb-quality-alerts.js");
    }
  } catch (_e) {}

  function getAlertsApi() {
    if (alertsApi) return alertsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQualityAlerts || null;
  }

  function diffDays(startIso, endIso) {
    if (!startIso || !endIso) return null;
    var a = new Date(String(startIso)).getTime();
    var b = new Date(String(endIso)).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round(((b - a) / 86400000) * 10) / 10;
  }

  function resolutionEntry(registry, instanceKey) {
    var api = getAlertsApi();
    if (api && api.resolutionEntry) {
      return api.resolutionEntry(registry?.alertResolutions, instanceKey);
    }
    return registry?.alertResolutions?.[instanceKey] || null;
  }

  function enrichRowResolution(row, registry) {
    var entry = resolutionEntry(registry, row.instanceKey);
    var openedAt = entry?.openedAt || null;
    var resolvedAt = entry?.resolvedAt || null;
    var resolutionDays =
      openedAt && resolvedAt ? diffDays(openedAt, resolvedAt) : null;
    var agingDays =
      row.status === "Pendente" && openedAt
        ? diffDays(openedAt, new Date().toISOString())
        : null;
    return Object.assign({}, row, {
      openedAt: openedAt,
      resolvedAt: resolvedAt,
      resolvedBy: entry?.resolvedBy || null,
      note: entry?.note || null,
      resolutionDays: resolutionDays,
      agingDays: agingDays,
    });
  }

  return {
    diffDays: diffDays,
    resolutionEntry: resolutionEntry,
    enrichRowResolution: enrichRowResolution,
  };
});
