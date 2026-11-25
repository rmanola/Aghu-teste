/**
 * Estatística descritiva da coorte Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchCohortStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var fieldSchemaApi = null;
  var cohortRowsApi = null;
  var conditionalApi = null;

  try {
    if (typeof require === "function") {
      schemaApi = require("./research-registry-schema.js");
      fieldSchemaApi = require("./research-field-schema.js");
      cohortRowsApi = require("./research-cohort-rows.js");
      conditionalApi = require("./research-field-conditional.js");
    }
  } catch (_e) {}

  function median(nums) {
    if (!nums.length) return null;
    var sorted = nums.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function mean(nums) {
    if (!nums.length) return null;
    var sum = 0;
    for (var i = 0; i < nums.length; i++) sum += nums[i];
    return sum / nums.length;
  }

  function stdDev(nums) {
    if (nums.length < 2) return null;
    var m = mean(nums);
    var acc = 0;
    for (var i = 0; i < nums.length; i++) {
      var d = nums[i] - m;
      acc += d * d;
    }
    return Math.sqrt(acc / (nums.length - 1));
  }

  function collectFieldValues(patients, protocol, matrixView) {
    if (!fieldSchemaApi || !matrixView || !schemaApi) return { fields: [], valuesByKey: {} };
    var fields = fieldSchemaApi.getMatrixViewFields(
      { forms: protocol.forms, matrixViews: protocol.matrixViews },
      matrixView.id,
    );
    var out = {};
    for (var f = 0; f < fields.length; f++) {
      out[fields[f].key] = [];
    }

    var form = (protocol.forms || []).find(function (frm) {
      return frm.id === matrixView.formId;
    });
    if (!form) return { fields: fields, valuesByKey: out };

    for (var p = 0; p < (patients || []).length; p++) {
      var patient = patients[p];
      var registry = schemaApi.normalizeRegistry(patient.registry);
      var bucket = schemaApi.getProtocolBucket(registry, protocol.id);
      var entities = schemaApi.filterActiveEntities(bucket.entities);
      for (var e = 0; e < entities.length; e++) {
        var entity = entities[e];
        if (entity.entityTypeId !== matrixView.entityTypeId) continue;
        var values = entity.values || {};
        for (var fi = 0; fi < fields.length; fi++) {
          var fieldMeta = fields[fi];
          var fieldDef = (form.fields || []).find(function (fld) {
            return fld.key === fieldMeta.key;
          });
          if (
            conditionalApi &&
            fieldDef &&
            !conditionalApi.isFieldVisible(fieldDef, values)
          ) {
            continue;
          }
          var v = values[fieldMeta.key];
          if (v == null || v === "") continue;
          out[fieldMeta.key].push(v);
        }
      }
    }

    return { fields: fields, valuesByKey: out };
  }

  function summarizeNumeric(values) {
    var nums = values
      .map(function (v) {
        return Number(String(v).replace(",", "."));
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    return {
      n: nums.length,
      mean: mean(nums),
      median: median(nums),
      std: stdDev(nums),
      min: nums.length ? Math.min.apply(null, nums) : null,
      max: nums.length ? Math.max.apply(null, nums) : null,
    };
  }

  function summarizeCategorical(values) {
    var freq = {};
    for (var i = 0; i < values.length; i++) {
      var k = String(values[i]);
      freq[k] = (freq[k] || 0) + 1;
    }
    return { n: values.length, frequencies: freq };
  }

  function computeDescriptiveStats(patients, protocol, matrixView) {
    var collected = collectFieldValues(patients, protocol, matrixView);
    var stats = [];
    for (var i = 0; i < collected.fields.length; i++) {
      var field = collected.fields[i];
      var vals = collected.valuesByKey[field.key] || [];
      if (field.type === "number" || field.type === "computed") {
        stats.push({
          key: field.key,
          label: field.label,
          type: "numeric",
          summary: summarizeNumeric(vals),
        });
      } else if (field.type === "boolean" || field.type === "select") {
        stats.push({
          key: field.key,
          label: field.label,
          type: "categorical",
          summary: summarizeCategorical(vals),
        });
      }
    }
    return stats;
  }

  return {
    median: median,
    mean: mean,
    stdDev: stdDev,
    computeDescriptiveStats: computeDescriptiveStats,
  };
});
