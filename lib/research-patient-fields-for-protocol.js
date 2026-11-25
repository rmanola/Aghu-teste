/**
 * fields[] mínimo para get-patient-record-fields conforme protocolo Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchPatientFieldsForProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var catalogApi = null;
  var aghuPathsApi = null;

  try {
    if (typeof require === "function") {
      catalogApi = require("./aghu-research-variable-catalog.js");
      aghuPathsApi = require("./aghu-protocol-field-paths.js");
    }
  } catch (_e) {}

  var DOMAIN_TO_FIELD = {
    exam: "exams",
    controles: "controles",
    prescricao: "prescricoes",
    prescricoes: "prescricoes",
    pii: "pii",
    hpb_registry: "hpb_registry",
    clinical_episode: "patient_episodes",
    passometro_surgery: "passometro",
  };

  var BASE_FIELDS = ["research_registry", "pii"];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function collectCatalogKeys(protocol) {
    var keys = [];
    if (!protocol || !Array.isArray(protocol.forms)) return keys;
    for (var f = 0; f < protocol.forms.length; f++) {
      var form = protocol.forms[f];
      var fields = form.fields || [];
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field.aghuSource && field.aghuSource.catalogKey) {
          keys.push(field.aghuSource.catalogKey);
        }
      }
    }
    return keys;
  }

  function getRequiredPatientFields(protocol) {
    var out = Object.create(null);
    for (var i = 0; i < BASE_FIELDS.length; i++) {
      out[BASE_FIELDS[i]] = true;
    }

    var catalogKeys = collectCatalogKeys(protocol);
    if (catalogApi && catalogApi.domainsForCatalogKeys) {
      var domains = catalogApi.domainsForCatalogKeys(catalogKeys);
      for (var d = 0; d < domains.length; d++) {
        var fieldName = DOMAIN_TO_FIELD[domains[d]];
        if (fieldName) out[fieldName] = true;
      }
    }

    if (
      aghuPathsApi &&
      aghuPathsApi.protocolHasAghuCriteria &&
      aghuPathsApi.protocolHasAghuCriteria(protocol)
    ) {
      var aghuDomains =
        aghuPathsApi.domainsForProtocolAghuCriteria
          ? aghuPathsApi.domainsForProtocolAghuCriteria(protocol)
          : ["exam", "controles"];
      if (!aghuDomains.length) {
        out.exams = true;
        out.controles = true;
      } else {
        for (var ad = 0; ad < aghuDomains.length; ad++) {
          var af = DOMAIN_TO_FIELD[aghuDomains[ad]];
          if (af) out[af] = true;
        }
      }
    }

    if (protocol && protocol.domainType === "hpb_builtin") {
      out.hpb_registry = true;
      out.patient_episodes = true;
    }

    if (protocol && protocol.studyDesign) {
      var grain = str(protocol.studyDesign.cohortGrain) || "patient";
      if (grain === "clinical_episode") {
        out.patient_episodes = true;
      }
      if (grain === "surgery") {
        out.passometro = true;
        out.patient_episodes = true;
      }
    }

    return Object.keys(out);
  }

  function protocolHasAghuFields(protocol) {
    return collectCatalogKeys(protocol).length > 0;
  }

  return {
    BASE_FIELDS: BASE_FIELDS,
    DOMAIN_TO_FIELD: DOMAIN_TO_FIELD,
    getRequiredPatientFields: getRequiredPatientFields,
    protocolHasAghuFields: protocolHasAghuFields,
    collectCatalogKeys: collectCatalogKeys,
  };
});
