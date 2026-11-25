/**
 * Paths canónicos para critérios de protocolo de estudo HPB.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbProtocolFieldPaths = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MODULE_PATH_PREFIX = {
    episode: "episode",
    surgery_core: "surgery.core",
    preop: "surgery.preop",
    pathology: "surgery.pathology",
    postop: "surgery.postop",
    hepatectomy: "surgery.hepatectomy",
    pancreatectomy: "surgery.pancreatectomy",
    biliary: "surgery.biliary",
    vascular: "surgery.vascular",
    robotic: "surgery.robotic",
  };

  var CRITERIA_MODULE_IDS = Object.keys(MODULE_PATH_PREFIX);

  var INDEX_EVENT_OPTIONS = [
    { path: "surgery.core.date", label: "Data da cirurgia" },
    { path: "episode.startedAt", label: "Início do episódio" },
  ];

  var OPERATORS = [
    { id: "eq", label: "igual a", needsValue: true },
    { id: "ne", label: "diferente de", needsValue: true },
    { id: "contains", label: "contém", needsValue: true, textValue: true },
    { id: "in", label: "em (lista)", needsValues: true },
    { id: "notIn", label: "fora de (lista)", needsValues: true },
    { id: "gte", label: ">= (data/número)", needsValue: true },
    { id: "lte", label: "<= (data/número)", needsValue: true },
    { id: "isYes", label: "é Sim", needsValue: false },
    { id: "isNo", label: "é Não", needsValue: false },
    { id: "isEmpty", label: "vazio", needsValue: false },
    { id: "isNotEmpty", label: "preenchido", needsValue: false },
  ];

  function loadDictionaryFields() {
    try {
      if (typeof require === "function") {
        var raw = require("./hpb-data-dictionary.json");
        return Array.isArray(raw.fields) ? raw.fields : [];
      }
    } catch (_e) {}
    return [];
  }

  function buildProtocolFieldPaths() {
    var dictFields = loadDictionaryFields();
    var out = [];
    var seen = {};

    for (var i = 0; i < dictFields.length; i++) {
      var f = dictFields[i];
      if (!f || !f.moduleId || !f.key) continue;
      if (CRITERIA_MODULE_IDS.indexOf(f.moduleId) === -1) continue;
      if (f.readOnly) continue;
      var prefix = MODULE_PATH_PREFIX[f.moduleId];
      if (!prefix) continue;
      var fieldPath = prefix + "." + f.key;
      if (seen[fieldPath]) continue;
      seen[fieldPath] = true;
      out.push({
        path: fieldPath,
        label: f.label || f.key,
        moduleId: f.moduleId,
        grain: f.grain || "",
        type: f.uiType || "text",
        listKey: f.listKey || null,
      });
    }

    if (!out.length) {
      out = [
        {
          path: "episode.diagnosisGroup",
          label: "Grupo diagnóstico",
          moduleId: "episode",
          grain: "episode",
          type: "select",
          listKey: "episode_grupo_diagn_stico",
        },
        {
          path: "surgery.core.mainProcedure",
          label: "Procedimento principal",
          moduleId: "surgery_core",
          grain: "surgery",
          type: "select",
          listKey: "surgerycore_procedimento_principal",
        },
        {
          path: "surgery.core.date",
          label: "Data cirurgia",
          moduleId: "surgery_core",
          grain: "surgery",
          type: "date",
          listKey: null,
        },
        {
          path: "surgery.core.malignant",
          label: "Doença maligna (cirurgia)",
          moduleId: "surgery_core",
          grain: "surgery",
          type: "select",
          listKey: "surgerycore_doen_a_maligna",
        },
        {
          path: "surgery.postop.death90d",
          label: "Óbito 90d",
          moduleId: "postop",
          grain: "surgerySubmodule",
          type: "select",
          listKey: "postop__bito_90d",
        },
        {
          path: "surgery.pathology.marginR",
          label: "Margem R",
          moduleId: "pathology",
          grain: "surgerySubmodule",
          type: "select",
          listKey: "pathology_margem_r",
        },
      ];
    }

    out.sort(function (a, b) {
      return a.path.localeCompare(b.path, "pt-BR");
    });
    return out;
  }

  var PROTOCOL_FIELD_PATHS = buildProtocolFieldPaths();

  function getProtocolFieldPaths() {
    return PROTOCOL_FIELD_PATHS.slice();
  }

  function findFieldPath(pathStr) {
    for (var i = 0; i < PROTOCOL_FIELD_PATHS.length; i++) {
      if (PROTOCOL_FIELD_PATHS[i].path === pathStr) return PROTOCOL_FIELD_PATHS[i];
    }
    return null;
  }

  function grainForPath(pathStr) {
    if (!pathStr) return null;
    if (pathStr.indexOf("episode.") === 0) return "episode";
    if (pathStr.indexOf("surgery.") === 0) return "surgery";
    return null;
  }

  return {
    MODULE_PATH_PREFIX: MODULE_PATH_PREFIX,
    CRITERIA_MODULE_IDS: CRITERIA_MODULE_IDS,
    INDEX_EVENT_OPTIONS: INDEX_EVENT_OPTIONS,
    OPERATORS: OPERATORS,
    PROTOCOL_FIELD_PATHS: PROTOCOL_FIELD_PATHS,
    getProtocolFieldPaths: getProtocolFieldPaths,
    findFieldPath: findFieldPath,
    grainForPath: grainForPath,
  };
});
