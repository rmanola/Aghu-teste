/**
 * Flatten hpb_registry cross-paciente para matriz coorte (testável em Node).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbCohortRows = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var dateBr =
    typeof require !== "undefined"
      ? require("./date-br.js")
      : typeof globalThis !== "undefined" && globalThis.AghuDateBr
        ? globalThis.AghuDateBr
        : { toDisplayBr: function (v) { return v == null ? "" : String(v); } };

  function toFieldString(value, fieldType) {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    var s = String(value);
    if (fieldType === "date" || /^\d{4}-\d{2}-\d{2}$/.test(s.trim())) {
      return dateBr.toDisplayBr(s);
    }
    return s;
  }

  function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function hasContent(obj) {
    if (!obj || typeof obj !== "object") return false;
    return Object.keys(obj).some(function (k) {
      var v = obj[k];
      return v != null && String(v).trim() !== "";
    });
  }

  function episodeLabel(ep) {
    if (!ep) return "";
    if (ep.startedAt) {
      return dateBr.toDisplayBr(String(ep.startedAt)).slice(0, 32);
    }
    return String(ep.primaryDiagnosis || ep.id || "").slice(0, 32);
  }

  function surgeryLabel(surg) {
    if (!surg) return "";
    var core = surg.core || {};
    if (core.date) {
      return dateBr.toDisplayBr(String(core.date)).slice(0, 32);
    }
    return String(core.mainProcedure || surg.id || "").slice(0, 32);
  }

  function valuesFromFields(data, fields) {
    var values = {};
    if (!data || !fields) return values;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var raw = getNestedValue(data, f.key);
      if (raw != null && raw !== "") {
        values[f.key] = toFieldString(raw, f.type);
      }
    }
    return values;
  }

  function baseMeta(patient, episode, surgery) {
    return {
      recordClientId: patient.recordClientId,
      prontuario: patient.prontuario || "—",
      episodeId: episode ? episode.id : undefined,
      episodeLabel: episode ? episodeLabel(episode) : undefined,
      surgeryId: surgery ? surgery.id : undefined,
      surgeryLabel: surgery ? surgeryLabel(surgery) : undefined,
    };
  }

  /**
   * @param {Array<{ recordClientId: string, prontuario: string, registry: object }>} patients
   * @param {{ id: string, grain: string, fields: Array<{ key: string }>, submoduleKey?: string }} sheet
   * @returns {Array<{ meta: object, values: Record<string, string> }>}
   */
  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function activeRegistry(registry) {
    if (!schemaApi) return registry || { episodes: [] };
    return schemaApi.filterRegistryActive(registry || { episodes: [] });
  }

  function dedupePatientsByRecordClientId(patients) {
    var seen = Object.create(null);
    var out = [];
    if (!Array.isArray(patients)) return out;
    for (var i = 0; i < patients.length; i++) {
      var p = patients[i];
      var id = p && p.recordClientId ? String(p.recordClientId) : "";
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(p);
    }
    return out;
  }

  function buildCohortRows(patients, sheet) {
    var rows = [];
    if (!Array.isArray(patients) || !sheet) return rows;
    patients = dedupePatientsByRecordClientId(patients);

    for (var pi = 0; pi < patients.length; pi++) {
      var patient = patients[pi];
      var registry = activeRegistry(patient.registry || {});
      var episodes = Array.isArray(registry.episodes) ? registry.episodes : [];

      for (var ei = 0; ei < episodes.length; ei++) {
        var ep = episodes[ei];
        if (schemaApi && schemaApi.isDeleted(ep)) continue;

        if (sheet.grain === "episode") {
          rows.push({
            meta: baseMeta(patient, ep, null),
            values: valuesFromFields(ep, sheet.fields),
          });
          continue;
        }

        if (sheet.grain === "preop") {
          var preopSurgeries = Array.isArray(ep.surgeries) ? ep.surgeries : [];
          for (var pi = 0; pi < preopSurgeries.length; pi++) {
            var preopSurg = preopSurgeries[pi];
            rows.push({
              meta: baseMeta(patient, ep, preopSurg),
              values: valuesFromFields(preopSurg.preop || {}, sheet.fields),
            });
          }
          continue;
        }

        if (sheet.grain === "mdt") {
          var meetings = Array.isArray(ep.mdtMeetings) ? ep.mdtMeetings : [];
          for (var mi = 0; mi < meetings.length; mi++) {
            rows.push({
              meta: baseMeta(patient, ep, null),
              values: valuesFromFields(meetings[mi], sheet.fields),
            });
          }
          continue;
        }

        if (sheet.grain === "lrt") {
          var lrts = Array.isArray(ep.locoregional) ? ep.locoregional : [];
          for (var li = 0; li < lrts.length; li++) {
            rows.push({
              meta: baseMeta(patient, ep, null),
              values: valuesFromFields(lrts[li], sheet.fields),
            });
          }
          continue;
        }

        if (sheet.grain === "followup") {
          var fus = Array.isArray(ep.followups) ? ep.followups : [];
          for (var fi = 0; fi < fus.length; fi++) {
            rows.push({
              meta: baseMeta(patient, ep, null),
              values: valuesFromFields(fus[fi], sheet.fields),
            });
          }
          continue;
        }

        var surgeries = Array.isArray(ep.surgeries) ? ep.surgeries : [];
        for (var si = 0; si < surgeries.length; si++) {
          var surg = surgeries[si];

          if (sheet.grain === "surgery") {
            rows.push({
              meta: baseMeta(patient, ep, surg),
              values: valuesFromFields(surg.core || {}, sheet.fields),
            });
            continue;
          }

          if (sheet.grain === "surgerySubmodule" && sheet.submoduleKey) {
            var sub = surg[sheet.submoduleKey];
            if (!hasContent(sub)) continue;
            rows.push({
              meta: baseMeta(patient, ep, surg),
              values: valuesFromFields(sub, sheet.fields),
            });
          }
        }
      }
    }

    return rows;
  }

  return {
    buildCohortRows: buildCohortRows,
    dedupePatientsByRecordClientId: dedupePatientsByRecordClientId,
    toFieldString: toFieldString,
  };
});
