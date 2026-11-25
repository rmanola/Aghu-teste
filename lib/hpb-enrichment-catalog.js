/**
 * Catálogo declarativo de variáveis AGHU para enriquecimento HPB (FEAT-045).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbEnrichmentCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ENRICHMENT_VARIABLES = [
    {
      key: "preop_albumin",
      label: "Albumina pré-op",
      exportColumn: "enrich_preop_albumin",
      registryField: "preop.albumin",
      source: "exam",
      sigla: "Alb",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "Albumina sérica entre 30 e 1 dia antes da cirurgia.",
    },
    {
      key: "preop_bilirubin",
      label: "Bilirrubina total pré-op",
      exportColumn: "enrich_preop_bilirubin",
      registryField: "preop.bilirubin",
      source: "exam",
      sigla: "BT",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "Bilirrubina total sérica na janela pré-operatória.",
    },
    {
      key: "biliary_bilirrubina",
      label: "Bilirrubina (biliar)",
      exportColumn: "enrich_biliary_bilirrubina",
      registryField: "biliary.bilirrubina",
      source: "exam",
      sigla: "BT",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "Bilirrubina sérica pré-op para módulo biliar.",
    },
    {
      key: "preop_inr",
      label: "INR pré-op",
      exportColumn: "enrich_preop_inr",
      registryField: "preop.inr",
      source: "exam",
      sigla: "INR",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "INR na janela pré-operatória.",
    },
    {
      key: "preop_platelets",
      label: "Plaquetas pré-op",
      exportColumn: "enrich_preop_platelets",
      registryField: "preop.platelets",
      source: "exam",
      sigla: "Pqt",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "Plaquetas na janela pré-operatória.",
    },
    {
      key: "preop_ca199",
      label: "CA 19-9 pré-op",
      exportColumn: "enrich_ca19_9",
      source: "exam",
      sigla: "CA19-9",
      fromDays: -30,
      toDays: -1,
      serumOnly: true,
      helpSummary: "CA 19-9 na janela pré-operatória.",
    },
    {
      key: "postop_amylase_d1",
      label: "Amilase D1",
      exportColumn: "enrich_postop_amylase_d1",
      registryField: "pancreatectomy.amylaseD1",
      source: "exam",
      sigla: "Amil",
      fromDays: 0,
      toDays: 1,
      serumOnly: true,
      preferTargetDay: 1,
      helpSummary: "Amilase sérica no 1º dia pós-operatório (0–1d).",
    },
    {
      key: "postop_amylase_d3",
      label: "Amilase D3",
      exportColumn: "enrich_postop_amylase_d3",
      registryField: "pancreatectomy.amylaseD3",
      source: "exam",
      sigla: "Amil",
      fromDays: 2,
      toDays: 4,
      serumOnly: true,
      preferTargetDay: 3,
      helpSummary: "Amilase sérica por volta do 3º dia pós-operatório (2–4d).",
    },
    {
      key: "sex",
      label: "Sexo",
      exportColumn: "enrich_sex",
      source: "pii",
      piiField: "sexo",
      helpSummary: "Sexo do PII na data da cirurgia.",
    },
    {
      key: "age_at_surgery",
      label: "Idade na cirurgia",
      exportColumn: "enrich_age_at_surgery",
      source: "pii",
      helpSummary: "Idade em anos na data da cirurgia (data de nascimento PII).",
    },
    {
      key: "po1_fc",
      label: "FC PO1",
      exportColumn: "enrich_po1_fc",
      source: "controles",
      vitalField: "fcBpm",
      fromDays: 0,
      toDays: 1,
      preferTargetDay: 1,
      helpSummary: "Frequência cardíaca no 1º dia pós-operatório (controles).",
    },
    {
      key: "po1_fr",
      label: "FR PO1",
      exportColumn: "enrich_po1_fr",
      source: "controles",
      vitalField: "frIrpm",
      fromDays: 0,
      toDays: 1,
      preferTargetDay: 1,
      helpSummary: "Frequência respiratória no 1º dia pós-operatório.",
    },
    {
      key: "po1_spo2",
      label: "SpO2 PO1",
      exportColumn: "enrich_po1_spo2",
      source: "controles",
      vitalField: "spo2Pct",
      fromDays: 0,
      toDays: 1,
      preferTargetDay: 1,
      helpSummary: "SpO2 no 1º dia pós-operatório.",
    },
    {
      key: "po1_pas",
      label: "PAS PO1",
      exportColumn: "enrich_po1_pas",
      source: "controles",
      vitalField: "pas",
      fromDays: 0,
      toDays: 1,
      preferTargetDay: 1,
      helpSummary: "Pressão arterial sistólica no 1º dia pós-operatório.",
    },
    {
      key: "po1_temp",
      label: "Temperatura PO1",
      exportColumn: "enrich_po1_temp",
      source: "controles",
      vitalField: "tempC",
      fromDays: 0,
      toDays: 1,
      preferTargetDay: 1,
      helpSummary: "Temperatura no 1º dia pós-operatório.",
    },
    {
      key: "po3_fc",
      label: "FC PO3",
      exportColumn: "enrich_fc_max_po3d",
      source: "controles",
      vitalField: "fcBpm",
      fromDays: 2,
      toDays: 4,
      preferTargetDay: 3,
      helpSummary: "Frequência cardíaca por volta do 3º dia pós-operatório.",
    },
    {
      key: "po3_fr",
      label: "FR PO3",
      exportColumn: "enrich_po3_fr",
      source: "controles",
      vitalField: "frIrpm",
      fromDays: 2,
      toDays: 4,
      preferTargetDay: 3,
      helpSummary: "Frequência respiratória por volta do 3º dia pós-operatório.",
    },
    {
      key: "po3_spo2",
      label: "SpO2 PO3",
      exportColumn: "enrich_po3_spo2",
      source: "controles",
      vitalField: "spo2Pct",
      fromDays: 2,
      toDays: 4,
      preferTargetDay: 3,
      helpSummary: "SpO2 por volta do 3º dia pós-operatório.",
    },
    {
      key: "po3_pas",
      label: "PAS PO3",
      exportColumn: "enrich_po3_pas",
      source: "controles",
      vitalField: "pas",
      fromDays: 2,
      toDays: 4,
      preferTargetDay: 3,
      helpSummary: "PAS por volta do 3º dia pós-operatório.",
    },
    {
      key: "po3_temp",
      label: "Temperatura PO3",
      exportColumn: "enrich_po3_temp",
      source: "controles",
      vitalField: "tempC",
      fromDays: 2,
      toDays: 4,
      preferTargetDay: 3,
      helpSummary: "Temperatura por volta do 3º dia pós-operatório.",
    },
    {
      key: "periop_antibiotic_yes",
      label: "ATB perioperatório",
      exportColumn: "enrich_atb_periop",
      source: "prescricao",
      prescricaoKind: "antibiotic_flag",
      fromDays: -1,
      toDays: 7,
      helpSummary: "Sim se prescrição com antibiótico sobrepõe janela -1 a +7d.",
    },
    {
      key: "periop_antibiotic_list",
      label: "ATB perioperatório (lista)",
      exportColumn: "enrich_periop_antibiotic_list",
      source: "prescricao",
      prescricaoKind: "antibiotic_list",
      fromDays: -1,
      toDays: 7,
      helpSummary: "Antibióticos na janela perioperatória (nomes truncados).",
    },
    {
      key: "postop_dieta",
      label: "Dieta pós-op (0–7d)",
      exportColumn: "enrich_postop_dieta",
      source: "prescricao",
      prescricaoKind: "dieta",
      fromDays: 0,
      toDays: 7,
      helpSummary: "Última dieta prescrita na primeira semana pós-operatória.",
    },
  ];

  function getEnrichmentVariables() {
    return ENRICHMENT_VARIABLES.slice();
  }

  function getExportColumns() {
    return ENRICHMENT_VARIABLES.map(function (v) {
      return v.exportColumn;
    });
  }

  function getRegistryFieldRules() {
    return ENRICHMENT_VARIABLES.filter(function (v) {
      return !!v.registryField;
    });
  }

  function findVariable(key) {
    for (var i = 0; i < ENRICHMENT_VARIABLES.length; i++) {
      if (ENRICHMENT_VARIABLES[i].key === key) return ENRICHMENT_VARIABLES[i];
    }
    return null;
  }

  return {
    ENRICHMENT_VARIABLES: ENRICHMENT_VARIABLES,
    getEnrichmentVariables: getEnrichmentVariables,
    getExportColumns: getExportColumns,
    getRegistryFieldRules: getRegistryFieldRules,
    findVariable: findVariable,
  };
});
