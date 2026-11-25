/**
 * Alertas de completude HPB — campos não preenchidos por entidade criada.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbMissingFieldAlerts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COMPLETENESS_ALERT_IDS = [
    "field_incomplete",
    "field_pending",
    "field_unknown",
  ];
  var LEGACY_MISSING_FIELD_ID = "missing_field";
  var COMPLETENESS_INSTANCE_PREFIXES = COMPLETENESS_ALERT_IDS.concat([
    LEGACY_MISSING_FIELD_ID,
  ]);

  var TYPE_LABELS = {
    field_incomplete: "Campo vazio",
    field_pending: "Campo com Pendente",
    field_unknown: "Campo NI / desconhecido",
    missing_field: "Campo pendente",
  };

  var PRIORITIES = {
    field_incomplete: "Baixa",
    field_pending: "Média",
    field_unknown: "Baixa",
    missing_field: "Baixa",
  };

  var registryData = null;
  var schemaApi = null;
  var conditionalApi = null;
  var fieldConditionalApi = null;
  try {
    if (typeof require === "function") {
      registryData = require("./hpb-field-registry.json");
      schemaApi = require("./hpb-registry-schema.js");
      conditionalApi = require("./hpb-conditional.js");
      fieldConditionalApi = require("./hpb-field-conditional.js");
    }
  } catch (_e) {}

  function getRegistryData() {
    if (registryData) return registryData;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbFieldRegistry || { modules: [], emptySentinels: {} };
  }

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function getConditionalApi() {
    if (conditionalApi) return conditionalApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbConditional || null;
  }

  function getFieldConditionalApi() {
    if (fieldConditionalApi) return fieldConditionalApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbFieldConditional || null;
  }

  function isTruthyYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function isFieldApplicableForModule(moduleId, fieldKey, data) {
    var api = getFieldConditionalApi();
    if (api && api.isFieldApplicable) {
      return api.isFieldApplicable(moduleId, fieldKey, data);
    }
    data = data && typeof data === "object" ? data : {};
    if (moduleId === "surgery_core" && fieldKey === "conversionReason") {
      return isTruthyYes(data.converted);
    }
    if (moduleId === "robotic" && fieldKey === "conversionReason") {
      return isTruthyYes(data.conversao);
    }
    if (
      moduleId === "followup" &&
      (fieldKey === "deathDate" || fieldKey === "deathCause")
    ) {
      return normalizeText(data.vitalStatus) === "obito";
    }
    return true;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function sentinelLists() {
    var data = getRegistryData();
    var sentinels = data.emptySentinels;
    if (Array.isArray(sentinels)) {
      return {
        pending: sentinels
          .map(normalizeText)
          .filter(function (s) {
            return s === "pendente";
          }),
        unknown: sentinels
          .map(normalizeText)
          .filter(function (s) {
            return s !== "pendente";
          }),
      };
    }
    return {
      pending: (sentinels.pending || []).map(normalizeText),
      unknown: (sentinels.unknown || []).map(normalizeText),
    };
  }

  function classifyFieldValue(value) {
    if (value == null) return "field_incomplete";
    if (typeof value !== "string") return null;
    var s = normalizeText(value);
    if (!s) return "field_incomplete";
    var lists = sentinelLists();
    if (lists.pending.indexOf(s) >= 0) return "field_pending";
    if (lists.unknown.indexOf(s) >= 0) return "field_unknown";
    return null;
  }

  function isEmptyValue(value) {
    return classifyFieldValue(value) !== null;
  }

  function isCompletenessAlert(id) {
    return (
      COMPLETENESS_ALERT_IDS.indexOf(id) >= 0 || id === LEGACY_MISSING_FIELD_ID
    );
  }

  function isCompletenessInstanceKey(key) {
    var prefix = String(key || "").split("::")[0];
    return COMPLETENESS_INSTANCE_PREFIXES.indexOf(prefix) >= 0;
  }

  function moduleById(id) {
    var modules = getRegistryData().modules || [];
    for (var i = 0; i < modules.length; i++) {
      if (modules[i].id === id) return modules[i];
    }
    return null;
  }

  function hasContent(obj) {
    if (!obj || typeof obj !== "object") return false;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === "id" || key === "deletedAt" || key === "deletedBy") continue;
      if (!isEmptyValue(obj[key])) return true;
    }
    return false;
  }

  function missingFieldInstanceKey(ctx) {
    return [
      ctx.alertId || "field_incomplete",
      ctx.episodeId || "",
      ctx.scopeId || "_episode",
      ctx.module,
      ctx.fieldKey,
    ].join("::");
  }

  function legacyMissingFieldKey(key) {
    var parts = String(key || "").split("::");
    if (COMPLETENESS_ALERT_IDS.indexOf(parts[0]) < 0 || parts.length < 5) {
      return null;
    }
    return [
      LEGACY_MISSING_FIELD_ID,
      parts[1],
      parts[2],
      parts[3],
      parts.slice(4).join("::"),
    ].join("::");
  }

  function ruleForAlert(alertId, moduleLabel, fieldLabel) {
    if (alertId === "field_pending") {
      return moduleLabel + " — " + fieldLabel + " marcado como Pendente";
    }
    if (alertId === "field_unknown") {
      return (
        moduleLabel + " — " + fieldLabel + " Não informado ou desconhecido"
      );
    }
    return moduleLabel + " — " + fieldLabel + " não preenchido";
  }

  function alertFromParts(ctx) {
    var moduleDef = moduleById(ctx.module);
    if (!moduleDef) return null;
    var field = null;
    for (var i = 0; i < moduleDef.fields.length; i++) {
      if (moduleDef.fields[i].key === ctx.fieldKey) {
        field = moduleDef.fields[i];
        break;
      }
    }
    if (!field) return null;

    var alertId = ctx.alertId || "field_incomplete";
    var instanceKey = missingFieldInstanceKey(
      Object.assign({}, ctx, { alertId: alertId }),
    );
    return {
      id: alertId,
      type: TYPE_LABELS[alertId] || field.label,
      rule: ruleForAlert(alertId, moduleDef.label, field.label),
      verifyHint: "Revisar " + moduleDef.label,
      priority: PRIORITIES[alertId] || "Baixa",
      responsible: "Residente",
      episodeId: ctx.episodeId,
      surgeryId: ctx.surgeryId,
      mdtId: ctx.mdtId,
      lrtId: ctx.lrtId,
      followupId: ctx.followupId,
      scopeId: ctx.scopeId,
      module: moduleDef.id,
      moduleLabel: moduleDef.label,
      moduleRoute: moduleDef.route,
      fieldKey: field.key,
      fieldLabel: field.label,
      instanceKey: instanceKey,
    };
  }

  function ctxFromCompletenessKey(key) {
    var parts = String(key || "").split("::");
    if (
      COMPLETENESS_INSTANCE_PREFIXES.indexOf(parts[0]) < 0 ||
      parts.length < 5
    ) {
      return null;
    }
    var scopeId = parts[2] || "_episode";
    var moduleId = parts[3];
    var alertId =
      parts[0] === LEGACY_MISSING_FIELD_ID
        ? "field_incomplete"
        : parts[0];
    var ctx = {
      episodeId: parts[1] || undefined,
      scopeId: scopeId,
      module: moduleId,
      fieldKey: parts.slice(4).join("::"),
      alertId: alertId,
    };
    if (
      moduleId === "surgery_core" ||
      moduleId === "preop" ||
      moduleId === "pathology" ||
      moduleId === "postop" ||
      moduleId === "hepatectomy" ||
      moduleId === "pancreatectomy" ||
      moduleId === "biliary" ||
      moduleId === "vascular" ||
      moduleId === "robotic"
    ) {
      ctx.surgeryId = scopeId;
    } else if (moduleId === "mdt") {
      ctx.mdtId = scopeId;
    } else if (moduleId === "lrt") {
      ctx.lrtId = scopeId;
    } else if (moduleId === "followup") {
      ctx.followupId = scopeId;
    }
    return ctx;
  }

  function alertFromInstanceKey(key) {
    var ctx = ctxFromCompletenessKey(key);
    if (!ctx) return null;
    var alert = alertFromParts(ctx);
    if (alert && String(key).indexOf(LEGACY_MISSING_FIELD_ID + "::") === 0) {
      alert.instanceKey = key;
    }
    return alert;
  }

  function pushMissingForModule(alerts, moduleId, data, ctx) {
    var moduleDef = moduleById(moduleId);
    if (!moduleDef) return;
    data = data && typeof data === "object" ? data : {};
    for (var i = 0; i < moduleDef.fields.length; i++) {
      var field = moduleDef.fields[i];
      if (!isFieldApplicableForModule(moduleId, field.key, data)) continue;
      var alertId = classifyFieldValue(data[field.key]);
      if (!alertId) continue;
      var alert = alertFromParts(
        Object.assign({}, ctx, {
          module: moduleId,
          fieldKey: field.key,
          alertId: alertId,
        }),
      );
      if (alert) alerts.push(alert);
    }
  }

  function surgerySubmoduleActive(surgery, moduleId) {
    var obj = surgery ? surgery[moduleId] : null;
    if (hasContent(obj)) return true;
    var conditional = getConditionalApi();
    if (!conditional || !conditional.getSurgerySubmodules) return false;
    var submodules = conditional.getSurgerySubmodules((surgery && surgery.core) || {});
    return !!submodules[moduleId];
  }

  function registryForEval(registry) {
    var schema = getSchemaApi();
    if (!schema || !schema.filterRegistryActive) return registry || { episodes: [] };
    return schema.filterRegistryActive(registry || { episodes: [] });
  }

  function evalMissingFieldAlerts(registry) {
    registry = registryForEval(registry);
    var alerts = [];
    var episodes = Array.isArray(registry.episodes) ? registry.episodes : [];
    for (var ei = 0; ei < episodes.length; ei++) {
      var ep = episodes[ei];
      pushMissingForModule(alerts, "episode", ep, {
        episodeId: ep.id,
        scopeId: "_episode",
      });

      var meetings = Array.isArray(ep.mdtMeetings) ? ep.mdtMeetings : [];
      for (var mi = 0; mi < meetings.length; mi++) {
        var mdt = meetings[mi];
        pushMissingForModule(alerts, "mdt", mdt, {
          episodeId: ep.id,
          scopeId: mdt.id,
          mdtId: mdt.id,
        });
      }

      var surgeries = Array.isArray(ep.surgeries) ? ep.surgeries : [];
      for (var si = 0; si < surgeries.length; si++) {
        var surgery = surgeries[si];
        var surgCtx = {
          episodeId: ep.id,
          scopeId: surgery.id,
          surgeryId: surgery.id,
        };
        pushMissingForModule(alerts, "surgery_core", surgery.core || {}, surgCtx);
        pushMissingForModule(alerts, "preop", surgery.preop || {}, surgCtx);
        pushMissingForModule(alerts, "pathology", surgery.pathology || {}, surgCtx);
        pushMissingForModule(alerts, "postop", surgery.postop || {}, surgCtx);

        var conditionalModules = [
          "hepatectomy",
          "pancreatectomy",
          "biliary",
          "vascular",
          "robotic",
        ];
        for (var ci = 0; ci < conditionalModules.length; ci++) {
          var submoduleId = conditionalModules[ci];
          if (surgerySubmoduleActive(surgery, submoduleId)) {
            pushMissingForModule(
              alerts,
              submoduleId,
              surgery[submoduleId] || {},
              surgCtx,
            );
          }
        }
      }

      var conditional = getConditionalApi();
      var lrtApplicable =
        conditional &&
        conditional.isLrtApplicableForEpisode &&
        conditional.isLrtApplicableForEpisode(ep);
      if (lrtApplicable) {
        var lrts = Array.isArray(ep.locoregional) ? ep.locoregional : [];
        for (var li = 0; li < lrts.length; li++) {
          var lrt = lrts[li];
          pushMissingForModule(alerts, "lrt", lrt, {
            episodeId: ep.id,
            scopeId: lrt.id,
            lrtId: lrt.id,
          });
        }
      }

      var followups = Array.isArray(ep.followups) ? ep.followups : [];
      for (var fi = 0; fi < followups.length; fi++) {
        var fu = followups[fi];
        pushMissingForModule(alerts, "followup", fu, {
          episodeId: ep.id,
          scopeId: fu.id,
          followupId: fu.id,
        });
      }
    }
    return alerts;
  }

  function groupAlertsByModule(alerts) {
    var groups = {};
    (alerts || []).forEach(function (alert) {
      var key = alert.module || alert.id;
      if (!groups[key]) {
        groups[key] = {
          module: alert.module || alert.id,
          moduleLabel: alert.moduleLabel || alert.type,
          moduleRoute: alert.moduleRoute,
          alerts: [],
        };
      }
      groups[key].alerts.push(alert);
    });
    return Object.keys(groups).map(function (key) {
      return groups[key];
    });
  }

  return {
    COMPLETENESS_ALERT_IDS: COMPLETENESS_ALERT_IDS,
    LEGACY_MISSING_FIELD_ID: LEGACY_MISSING_FIELD_ID,
    alertFromInstanceKey: alertFromInstanceKey,
    classifyFieldValue: classifyFieldValue,
    evalMissingFieldAlerts: evalMissingFieldAlerts,
    groupAlertsByModule: groupAlertsByModule,
    isCompletenessAlert: isCompletenessAlert,
    isCompletenessInstanceKey: isCompletenessInstanceKey,
    isEmptyValue: isEmptyValue,
    legacyMissingFieldKey: legacyMissingFieldKey,
    missingFieldInstanceKey: missingFieldInstanceKey,
    moduleById: moduleById,
  };
});
