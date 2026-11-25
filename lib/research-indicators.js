/**
 * Indicadores agregados para coorte Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchIndicators = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var fieldSchemaApi = null;
  var conditionalApi = null;
  var cohortRowsApi = null;

  try {
    if (typeof require === "function") {
      schemaApi = require("./research-registry-schema.js");
      fieldSchemaApi = require("./research-field-schema.js");
      conditionalApi = require("./research-field-conditional.js");
      cohortRowsApi = require("./research-cohort-rows.js");
    }
  } catch (_e) {}

  function foldYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function listIndicatorFields(protocol) {
    if (!protocol || !fieldSchemaApi) return [];
    var out = [];
    var forms = protocol.forms || [];
    for (var f = 0; f < forms.length; f++) {
      var form = forms[f];
      for (var i = 0; i < (form.fields || []).length; i++) {
        var field = form.fields[i];
        if (field.analyticsRole === "indicator") {
          out.push({
            formId: form.id,
            fieldKey: field.key,
            label: field.label || field.key,
            type: field.type,
            path: form.id + "." + field.key,
          });
        }
      }
    }
    return out;
  }

  function computeIndicatorsForPatient(registry, protocolId, protocol) {
    var indicators = {};
    var fields = listIndicatorFields(protocol);
    if (!schemaApi || !fields.length) return indicators;

    var bucket = schemaApi.getProtocolBucket(registry, protocolId);
    var entities = schemaApi.filterActiveEntities(bucket.entities);

    for (var fi = 0; fi < fields.length; fi++) {
      var def = fields[fi];
      var key = def.path;
      indicators[key] = { count: 0, sum: 0, n: 0, label: def.label, type: def.type };
    }

    for (var e = 0; e < entities.length; e++) {
      var entity = entities[e];
      var form = (protocol.forms || []).find(function (frm) {
        return frm.entityTypeId === entity.entityTypeId;
      });
      if (!form) continue;
      var values = entity.values || {};
      for (var fi2 = 0; fi2 < fields.length; fi2++) {
        var def2 = fields[fi2];
        if (def2.formId !== form.id) continue;
        var fieldDef = (form.fields || []).find(function (f) {
          return f.key === def2.fieldKey;
        });
        if (
          conditionalApi &&
          fieldDef &&
          !conditionalApi.isFieldVisible(fieldDef, values)
        ) {
          continue;
        }
        var val = values[def2.fieldKey];
        var row = indicators[def2.path];
        if (!row) continue;
        row.n += 1;
        if (def2.type === "boolean") {
          if (foldYes(val)) row.count += 1;
        } else if (def2.type === "number") {
          var n = Number(val);
          if (Number.isFinite(n)) {
            row.sum += n;
            row.count += 1;
          }
        } else if (def2.type === "select" || def2.type === "text") {
          if (val != null && String(val).trim() !== "") row.count += 1;
        }
      }
    }
    return indicators;
  }

  function aggregateIndicators(patients, protocol, opts) {
    opts = opts || {};
    var totals = {};
    if (!protocol || !Array.isArray(patients)) return totals;
    var grain =
      opts.grain && cohortRowsApi
        ? cohortRowsApi.normalizeCohortGrain(opts.grain)
        : "patient";
    var fields = listIndicatorFields(protocol);
    for (var i = 0; i < fields.length; i++) {
      totals[fields[i].path] = {
        label: fields[i].label,
        type: fields[i].type,
        count: 0,
        sum: 0,
        n: 0,
        grain: grain,
        denominatorLabel:
          cohortRowsApi && cohortRowsApi.denominatorLabelForGrain
            ? cohortRowsApi.denominatorLabelForGrain(grain)
            : "por paciente",
      };
    }
    for (var p = 0; p < patients.length; p++) {
      var patient = patients[p];
      var unitCount = 1;
      if (cohortRowsApi && cohortRowsApi.analyticsUnitsForPatient) {
        var ctx = cohortRowsApi.analyticsUnitsForPatient(patient, grain);
        unitCount = ctx.units && ctx.units.length ? ctx.units.length : 0;
      }
      if (!unitCount) continue;
      var per = computeIndicatorsForPatient(
        patient.registry,
        protocol.id,
        protocol,
      );
      for (var k in per) {
        if (!totals[k]) {
          totals[k] = {
            label: per[k].label,
            type: per[k].type,
            count: 0,
            sum: 0,
            n: 0,
            grain: grain,
          };
        }
        // Multiplica pelo nº de grain units (1 paciente × 2 cirurgias → n×2)
        totals[k].count += (per[k].count || 0) * unitCount;
        totals[k].sum += (per[k].sum || 0) * unitCount;
        totals[k].n += (per[k].n || 0) * unitCount;
      }
    }
    return totals;
  }

  return {
    listIndicatorFields: listIndicatorFields,
    computeIndicatorsForPatient: computeIndicatorsForPatient,
    aggregateIndicators: aggregateIndicators,
  };
});
