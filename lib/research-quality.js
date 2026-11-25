/**
 * Qualidade genérica Research custom (FEAT-066 / GEN-10).
 * FEAT-068: checklist I/E formal CRF pós-enrolled.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var completenessApi = null;
  var schemaApi = null;
  var eligibilityApi = null;
  var cohortRowsApi = null;

  try {
    if (typeof require === "function") {
      completenessApi = require("./research-field-completeness.js");
      schemaApi = require("./research-registry-schema.js");
      eligibilityApi = require("./research-protocol-eligibility.js");
      cohortRowsApi = require("./research-cohort-rows.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function listAnalyticsFields(protocol) {
    var out = [];
    if (!protocol || !Array.isArray(protocol.forms)) return out;
    for (var i = 0; i < protocol.forms.length; i++) {
      var form = protocol.forms[i];
      var fields = form.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        var role = str(field.analyticsRole);
        if (
          role === "indicator" ||
          role === "outcome" ||
          role === "covariate" ||
          role === "indicador" ||
          role === "desfecho" ||
          role === "covariavel"
        ) {
          out.push({
            formId: form.id,
            entityTypeId: form.entityTypeId,
            key: field.key,
            label: field.label || field.key,
            analyticsRole: role,
          });
        }
      }
    }
    return out;
  }

  function isFilled(v) {
    if (v == null) return false;
    if (typeof v === "boolean") return true;
    return String(v).trim() !== "";
  }

  function findEntityValues(bucket, entityTypeId) {
    if (!schemaApi || !bucket) return {};
    var entities = schemaApi.filterActiveEntities(bucket.entities || []);
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].entityTypeId === entityTypeId) {
        return entities[i].values || {};
      }
    }
    return {};
  }

  function summarizeFormalEligibility(registry, protocolId, protocol, patientDomains) {
    if (!eligibilityApi || !protocol || protocol.domainType !== "custom") {
      return {
        status: "n/a",
        eligible: null,
        crfIncomplete: false,
        failedCount: 0,
      };
    }
    var formal = eligibilityApi.evaluateFormalEligibility(
      registry,
      protocolId,
      protocol,
      patientDomains || {},
    );
    if (formal.noRules) {
      return {
        status: "sem_regras",
        eligible: null,
        crfIncomplete: false,
        failedCount: 0,
      };
    }
    if (formal.crfIncomplete) {
      return {
        status: "crf_incompleto",
        eligible: false,
        crfIncomplete: true,
        failedCount: formal.failedRules ? formal.failedRules.length : 0,
      };
    }
    if (formal.eligible) {
      return {
        status: "ok",
        eligible: true,
        crfIncomplete: false,
        failedCount: 0,
      };
    }
    return {
      status: "falhou",
      eligible: false,
      crfIncomplete: false,
      failedCount: formal.failedRules ? formal.failedRules.length : 0,
    };
  }

  /**
   * @param {object} [opts]
   * @param {string} [opts.grain]
   * @returns {{ completeness: object, analyticsQueries: Array, gaps: Array, formalEligibility: object, grain?: string }}
   */
  function evaluatePatientQuality(
    registry,
    protocolId,
    protocol,
    patientDomains,
    opts,
  ) {
    opts = opts || {};
    var grain =
      opts.grain && cohortRowsApi
        ? cohortRowsApi.normalizeCohortGrain(opts.grain)
        : "patient";

    var completeness = completenessApi
      ? completenessApi.summarizePatientCompleteness(
          registry,
          protocolId,
          protocol,
        )
      : { required: 0, filled: 0, percent: 100 };

    var analyticsFields = listAnalyticsFields(protocol);
    var gaps = [];
    var bucket =
      schemaApi && protocolId
        ? schemaApi.getProtocolBucket(registry, protocolId)
        : null;

    var patientProxy = Object.assign({ registry: registry }, patientDomains || {});
    var grainUnits =
      cohortRowsApi && cohortRowsApi.analyticsUnitsForPatient
        ? cohortRowsApi.analyticsUnitsForPatient(patientProxy, grain).units
        : [{ grain: "patient" }];
    if (!grainUnits.length) grainUnits = [{ grain: "patient" }];

    for (var u = 0; u < grainUnits.length; u++) {
      var unit = grainUnits[u];
      var rowContext =
        cohortRowsApi && cohortRowsApi.rowContextFromUnit
          ? cohortRowsApi.rowContextFromUnit(unit)
          : null;
      var grainMeta =
        cohortRowsApi && cohortRowsApi.grainMetaFromUnit
          ? cohortRowsApi.grainMetaFromUnit(unit)
          : {};

      for (var i = 0; i < analyticsFields.length; i++) {
        var af = analyticsFields[i];
        var values = findEntityValues(bucket, af.entityTypeId);
        if (!isFilled(values[af.key])) {
          var gap = {
            formId: af.formId,
            key: af.key,
            label: af.label,
            analyticsRole: af.analyticsRole,
          };
          if (rowContext) gap.rowContext = rowContext;
          if (grainMeta.row_label) gap.row_label = grainMeta.row_label;
          if (grainMeta.patient_episode_id) {
            gap.patient_episode_id = grainMeta.patient_episode_id;
          }
          if (grainMeta.surgery_index != null) {
            gap.surgery_index = grainMeta.surgery_index;
          }
          gaps.push(gap);
        }
      }
    }

    var formalEligibility = summarizeFormalEligibility(
      registry,
      protocolId,
      protocol,
      patientDomains,
    );

    return {
      completeness: completeness,
      analyticsQueries: analyticsFields,
      gaps: gaps,
      formalEligibility: formalEligibility,
      grain: grain,
    };
  }

  function evaluateCohortQuality(patients, protocol, opts) {
    opts = opts || {};
    if (!Array.isArray(patients) || !protocol) return [];
    return patients.map(function (p) {
      var domains = {
        exams: p.exams,
        controles: p.controles,
        patient_episodes: p.patient_episodes,
        passometro: p.passometro,
      };
      var result = evaluatePatientQuality(
        p.registry,
        protocol.id,
        protocol,
        domains,
        opts,
      );
      return {
        recordClientId: p.recordClientId,
        completeness: result.completeness,
        gapCount: result.gaps.length,
        gaps: result.gaps,
        formalEligibility: result.formalEligibility,
        grain: result.grain,
      };
    });
  }

  return {
    listAnalyticsFields: listAnalyticsFields,
    evaluatePatientQuality: evaluatePatientQuality,
    evaluateCohortQuality: evaluateCohortQuality,
    summarizeFormalEligibility: summarizeFormalEligibility,
  };
});
