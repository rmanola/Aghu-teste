/**
 * Metadados dos templates Research (FEAT-064) — testável sem Next/TS.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchSchemaTemplatesMeta = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NON_SURGICAL_TEMPLATE_IDS = [
    "inpatient_cohort",
    "ambulatory_longitudinal",
    "labs_outcomes",
  ];

  var SPECIALTY_PACK_TEMPLATE_IDS = [
    "pack_clinica_medica",
    "pack_pronto_socorro",
    "pack_uti",
  ];

  var HPB_PACK_TEMPLATE_IDS = [
    "from_hpb_mirror",
    "hpb_episode_live",
    "hpb_surgery_live",
  ];

  var SPECIALTY_PACK_DEFAULT_GRAIN = {
    hpb: "surgery",
    clinica_medica: "clinical_episode",
    pronto_socorro: "patient",
    uti: "clinical_episode",
  };

  return {
    NON_SURGICAL_TEMPLATE_IDS: NON_SURGICAL_TEMPLATE_IDS,
    SPECIALTY_PACK_TEMPLATE_IDS: SPECIALTY_PACK_TEMPLATE_IDS,
    HPB_PACK_TEMPLATE_IDS: HPB_PACK_TEMPLATE_IDS,
    SPECIALTY_PACK_DEFAULT_GRAIN: SPECIALTY_PACK_DEFAULT_GRAIN,
  };
});
