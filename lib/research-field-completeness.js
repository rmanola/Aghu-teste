/**
 * Completude de campos Research custom (required + visibleWhen).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchFieldCompleteness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var conditionalApi = null;

  try {
    if (typeof require === "function") {
      schemaApi = require("./research-registry-schema.js");
      conditionalApi = require("./research-field-conditional.js");
    }
  } catch (_e) {}

  function isFilled(v) {
    if (v == null) return false;
    if (typeof v === "boolean") return true;
    return String(v).trim() !== "";
  }

  function summarizePatientCompleteness(registry, protocolId, protocol) {
    if (!schemaApi || !protocol) {
      return { required: 0, filled: 0, percent: 100 };
    }
    var bucket = schemaApi.getProtocolBucket(registry, protocolId);
    var entities = schemaApi.filterActiveEntities(bucket.entities);
    var required = 0;
    var filled = 0;
    var forms = protocol.forms || [];

    for (var e = 0; e < entities.length; e++) {
      var entity = entities[e];
      var form = forms.find(function (f) {
        return f.entityTypeId === entity.entityTypeId;
      });
      if (!form) continue;
      var values = entity.values || {};
      for (var i = 0; i < (form.fields || []).length; i++) {
        var field = form.fields[i];
        if (!field.required) continue;
        if (
          conditionalApi &&
          !conditionalApi.isFieldVisible(field, values)
        ) {
          continue;
        }
        required += 1;
        if (isFilled(values[field.key])) filled += 1;
      }
    }

    return {
      required: required,
      filled: filled,
      percent: required ? Math.round((filled / required) * 100) : 100,
    };
  }

  function summarizeCohortCompleteness(patients, protocol) {
    if (!Array.isArray(patients) || !protocol) return [];
    return patients.map(function (p) {
      var summary = summarizePatientCompleteness(
        p.registry,
        protocol.id,
        protocol,
      );
      return {
        recordClientId: p.recordClientId,
        prontuario: p.prontuario,
        required: summary.required,
        filled: summary.filled,
        percent: summary.percent,
      };
    });
  }

  return {
    summarizePatientCompleteness: summarizePatientCompleteness,
    summarizeCohortCompleteness: summarizeCohortCompleteness,
  };
});
