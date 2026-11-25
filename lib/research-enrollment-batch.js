/**
 * Derivar enrollment em lote na coorte Research custom (FEAT-054).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchEnrollmentBatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  try {
    if (typeof require === "function") {
      schemaApi = require("./research-registry-schema.js");
    }
  } catch (_e) {}

  function patientDomainsFromRow(patient) {
    return {
      exams: patient && patient.exams,
      controles: patient && patient.controles,
      prescricoes: patient && patient.prescricoes,
      pii: patient && patient.pii,
      hpb_registry: patient && patient.hpb_registry,
    };
  }

  function registryChanged(before, after) {
    // Comparação profunda simples em vez de JSON.stringify (melhor perf)
    // Funciona para objetos nestados
    if (before === after) return false;
    if (before == null || after == null) return before !== after;
    if (typeof before !== typeof after) return true;
    if (typeof before !== "object") return before !== after;

    var beforeKeys = Object.keys(before);
    var afterKeys = Object.keys(after);
    if (beforeKeys.length !== afterKeys.length) return true;

    for (var i = 0; i < beforeKeys.length; i++) {
      var key = beforeKeys[i];
      var beforeVal = before[key];
      var afterVal = after[key];

      if (beforeVal === afterVal) continue;
      if (typeof beforeVal === "object" && typeof afterVal === "object" && beforeVal != null && afterVal != null) {
        // Recursion para objetos nestados
        if (registryChanged(beforeVal, afterVal)) return true;
      } else if (beforeVal !== afterVal) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {Array<{ recordClientId: string, registry: object, exams?: unknown, controles?: unknown }>} patients
   * @returns {{ patches: Array<{ recordClientId: string, registry: object }>, summary: object }}
   */
  function deriveEnrollmentBatch(patients, protocolId, protocol) {
    var patches = [];
    var summary = {
      updated: 0,
      unchanged: 0,
      skippedEnrolled: 0,
      skippedWithdrawn: 0,
      skippedNoRegistry: 0,
      createdRegistry: 0,
    };

    if (!schemaApi || !protocolId || !protocol || !Array.isArray(patients)) {
      return { patches: patches, summary: summary };
    }

    for (var i = 0; i < patients.length; i++) {
      var patient = patients[i];
      if (!patient || !patient.recordClientId) continue;
      var registry = schemaApi.normalizeRegistry(patient.registry);
      var bucket = schemaApi.getProtocolBucket(registry, protocolId);
      var status = bucket.enrollment && bucket.enrollment.status;
      if (status === "enrolled") {
        summary.skippedEnrolled += 1;
        continue;
      }
      if (status === "withdrawn") {
        summary.skippedWithdrawn += 1;
        continue;
      }
      // GEN-07: sem blob prévio — normalizeRegistry cria bucket; 1ª screened/eligible persiste via patch.
      if (!patient.registry) {
        summary.createdRegistry = (summary.createdRegistry || 0) + 1;
      }

      var domains = patientDomainsFromRow(patient);
      var next = schemaApi.deriveEnrollmentFromEligibility(
        registry,
        protocolId,
        protocol,
        domains,
      );

      if (registryChanged(registry, next)) {
        patches.push({
          recordClientId: patient.recordClientId,
          registry: next,
        });
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }
    }

    return { patches: patches, summary: summary };
  }

  return {
    deriveEnrollmentBatch: deriveEnrollmentBatch,
    patientDomainsFromRow: patientDomainsFromRow,
  };
});
