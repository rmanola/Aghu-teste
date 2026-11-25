/**
 * Adaptadores de registro de estudo — custom vs hpb_builtin (FEAT-060/061 fase 2).
 * Reduz acoplamento directo a Hpb* na coorte Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuStudyRegistryAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var researchCohortRows = null;
  var researchPatientFields = null;
  var hpbCohortRows = null;
  var studyProtocolApi = null;

  try {
    if (typeof require === "function") {
      researchCohortRows = require("./research-cohort-rows.js");
      researchPatientFields = require("./research-patient-fields-for-protocol.js");
      hpbCohortRows = require("./hpb-cohort-rows.js");
      studyProtocolApi = require("./hpb-study-protocol.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function resolveDomainType(protocol) {
    if (!protocol) return "hpb_builtin";
    return str(protocol.domainType) === "custom" ? "custom" : "hpb_builtin";
  }

  var customAdapter = {
    id: "custom",
    buildMatrixRows: function (patients, matrixView, protocolSchema, protocol, opts) {
      if (!researchCohortRows || !researchCohortRows.buildCohortRows) return [];
      return researchCohortRows.buildCohortRows(
        patients,
        matrixView,
        protocolSchema,
        protocol,
        opts,
      );
    },
    getRequiredPatientFields: function (protocol) {
      if (!researchPatientFields || !researchPatientFields.getRequiredPatientFields) {
        return ["research_registry", "pii"];
      }
      return researchPatientFields.getRequiredPatientFields(protocol);
    },
    getDefaultCohortGrain: function (protocol) {
      if (studyProtocolApi && studyProtocolApi.getProtocolCohortGrain) {
        return studyProtocolApi.getProtocolCohortGrain(protocol);
      }
      return "patient";
    },
  };

  var hpbBuiltinAdapter = {
    id: "hpb_builtin",
    buildMatrixRows: function (patients, sheet) {
      if (!hpbCohortRows || !hpbCohortRows.buildCohortRows) return [];
      return hpbCohortRows.buildCohortRows(patients, sheet);
    },
    getRequiredPatientFields: function (_protocol) {
      return ["hpb_registry", "pii", "patient_episodes"];
    },
    getDefaultCohortGrain: function () {
      return "patient";
    },
  };

  function getStudyRegistryAdapter(protocol) {
    return resolveDomainType(protocol) === "custom"
      ? customAdapter
      : hpbBuiltinAdapter;
  }

  return {
    customAdapter: customAdapter,
    hpbBuiltinAdapter: hpbBuiltinAdapter,
    getStudyRegistryAdapter: getStudyRegistryAdapter,
    resolveDomainType: resolveDomainType,
  };
});
