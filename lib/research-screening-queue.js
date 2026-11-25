/**
 * Fila de triagem Research — contagens e filtro screened/eligible (FEAT-064).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchScreeningQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var registryApi = null;
  var eligibilityApi = null;
  try {
    if (typeof require === "function") {
      registryApi = require("./research-registry-schema.js");
      eligibilityApi = require("./research-protocol-eligibility.js");
    }
  } catch (_e) {}

  function getRegistryApi() {
    if (registryApi) return registryApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchRegistrySchema || null;
  }

  function getEligibilityApi() {
    if (eligibilityApi) return eligibilityApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchProtocolEligibility || null;
  }

  function patientDomainsFromCohort(patient) {
    return {
      exams: patient && patient.exams,
      controles: patient && patient.controles,
      patient_episodes: patient && patient.patient_episodes,
      passometro: patient && patient.passometro,
    };
  }

  function isEligibleByProtocol(patient, protocolId, protocol) {
    var elig = getEligibilityApi();
    if (!elig || !protocol || !protocolId) return false;
    var domains = patientDomainsFromCohort(patient);
    var result =
      typeof elig.evaluateScreeningEligibility === "function"
        ? elig.evaluateScreeningEligibility(domains, protocol)
        : elig.evaluatePatientEligibility(
            (patient && patient.registry) || {},
            protocolId,
            protocol,
            domains,
          );
    return !!(result && result.eligible);
  }

  function getPatientEnrollmentStatus(patient, protocolId) {
    var api = getRegistryApi();
    if (!api || !patient || !protocolId) return "none";
    var bucket = api.getProtocolBucket(patient.registry, protocolId);
    var status = bucket && bucket.enrollment && bucket.enrollment.status;
    if (
      status === "screened" ||
      status === "eligible" ||
      status === "enrolled" ||
      status === "withdrawn"
    ) {
      return status;
    }
    return "none";
  }

  function countEnrollmentStatuses(patients, protocolId) {
    var counts = {
      screened: 0,
      eligible: 0,
      enrolled: 0,
      withdrawn: 0,
      none: 0,
    };
    if (!Array.isArray(patients)) return counts;
    for (var i = 0; i < patients.length; i++) {
      var status = getPatientEnrollmentStatus(patients[i], protocolId);
      counts[status] += 1;
    }
    return counts;
  }

  function listTriagePatients(patients, protocolId, protocol) {
    if (!Array.isArray(patients)) return [];
    return patients.filter(function (p) {
      var status = getPatientEnrollmentStatus(p, protocolId);
      if (status === "screened" || status === "eligible") return true;
      if (status === "enrolled" || status === "withdrawn") return false;
      return isEligibleByProtocol(p, protocolId, protocol);
    });
  }

  function listEnrolledPatients(patients, protocolId) {
    if (!Array.isArray(patients)) return [];
    return patients.filter(function (p) {
      return getPatientEnrollmentStatus(p, protocolId) === "enrolled";
    });
  }

  return {
    getPatientEnrollmentStatus: getPatientEnrollmentStatus,
    countEnrollmentStatuses: countEnrollmentStatuses,
    listTriagePatients: listTriagePatients,
    listEnrolledPatients: listEnrolledPatients,
    isEligibleByProtocol: isEligibleByProtocol,
  };
});
