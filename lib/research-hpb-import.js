/**
 * Importa estrutura HPB (dicionário HUCAM) para schema Research custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchHpbImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var dictionary = null;
  var listsApi = null;
  var fieldSchemaApi = null;
  var matrixSyncApi = null;

  try {
    if (typeof require === "function") {
      dictionary = require("./hpb-data-dictionary.json");
      listsApi = require("./hpb-lists.js");
      fieldSchemaApi = require("./research-field-schema.js");
      matrixSyncApi = require("./research-matrix-sync.js");
    }
  } catch (_e) {}

  var IMPORT_MODULES = [
    "episode",
    "preop",
    "surgery_core",
    "postop",
    "followup",
  ];

  var MAX_FIELDS_PER_MODULE = 40;

  var PHI_PATTERNS = [
    /\bprontu[aá]rio\b/i,
    /\bnome\s*(completo|do paciente)?\b/i,
    /\bcpf\b/i,
    /\bcns\b/i,
  ];

  function isPhiMeta(text) {
    var s = String(text || "");
    return PHI_PATTERNS.some(function (p) {
      return p.test(s);
    });
  }

  function mapUiType(row) {
    var ui = String(row.uiType || row.researchType || "text");
    if (ui === "date") return "date";
    if (ui === "number" || row.researchType === "continuous") return "number";
    if (ui === "boolean") return "boolean";
    if (ui === "select" || row.listKey) return "select";
    if (ui === "textarea") return "textarea";
    return "text";
  }

  function optionsForListKey(listKey) {
    if (!listKey || !listsApi || !listsApi.getList) return null;
    var list = listsApi.getList(listKey);
    if (!Array.isArray(list)) return null;
    return list
      .map(function (item) {
        return typeof item === "string" ? item : item && item.label;
      })
      .filter(Boolean)
      .slice(0, 100);
  }

  function mapHpbModuleGrain(moduleId, hpbGrain) {
    var g = String(hpbGrain || "").trim();
    if (moduleId === "episode") return "clinical_episode";
    if (moduleId === "followup") return "patient";
    if (
      moduleId === "preop" ||
      moduleId === "surgery_core" ||
      moduleId === "postop"
    ) {
      return "surgery";
    }
    if (g === "episode") return "clinical_episode";
    if (g === "surgery" || g === "preop" || g === "surgerySubmodule") {
      return "surgery";
    }
    return "patient";
  }

  function buildHpbMirrorSchema() {
    if (!dictionary || !fieldSchemaApi) {
      return { entityTypes: [], forms: [], matrixViews: [] };
    }
    var moduleMeta = dictionary.moduleMeta || {};
    var fields = Array.isArray(dictionary.fields) ? dictionary.fields : [];
    var entityTypes = [];
    var forms = [];
    var episodeEntityId = null;

    for (var m = 0; m < IMPORT_MODULES.length; m++) {
      var moduleId = IMPORT_MODULES[m];
      var meta = moduleMeta[moduleId];
      if (!meta) continue;
      var entId = fieldSchemaApi.newId("ent");
      var cardinality = moduleId === "followup" ? "many" : "one";
      var grain = mapHpbModuleGrain(moduleId, meta.grain);
      var parentEntityTypeId = null;
      if (
        moduleId === "preop" ||
        moduleId === "surgery_core" ||
        moduleId === "postop"
      ) {
        parentEntityTypeId = episodeEntityId;
      }
      if (moduleId === "episode") episodeEntityId = entId;
      entityTypes.push({
        id: entId,
        label: meta.label || moduleId,
        cardinality: cardinality,
        parentEntityTypeId: parentEntityTypeId,
        grain: grain,
      });
      var formId = fieldSchemaApi.newId("form");
      var formFields = [];
      var count = 0;
      for (var i = 0; i < fields.length; i++) {
        var row = fields[i];
        if (row.moduleId !== moduleId) continue;
        if (isPhiMeta(row.label) || isPhiMeta(row.key)) continue;
        if (count >= MAX_FIELDS_PER_MODULE) break;
        var type = mapUiType(row);
        var field = {
          key: row.key,
          label: row.label || row.key,
          type: type,
          required: !!row.required,
        };
        if (type === "select" && row.listKey) {
          var opts = optionsForListKey(row.listKey);
          if (opts && opts.length) {
            field.options = opts.filter(function (o) {
              return !isPhiMeta(o);
            });
          }
          if (!field.options || !field.options.length) field.type = "text";
        }
        if (row.researchExport === false) field.researchExport = false;
        formFields.push(field);
        count += 1;
      }
      forms.push({
        id: formId,
        label: meta.label || moduleId,
        entityTypeId: entId,
        fields: formFields,
        grain: grain,
      });
    }

    var matrixViews = matrixSyncApi
      ? matrixSyncApi.syncMatrixViewsWithForms(forms, [])
      : forms.map(function (form) {
          return {
            id: form.id + "-view",
            label: form.label,
            formId: form.id,
            entityTypeId: form.entityTypeId,
          };
        });

    return {
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: matrixViews,
    };
  }

  function previewHpbMirrorImport() {
    var schema = buildHpbMirrorSchema();
    var fieldCount = 0;
    for (var i = 0; i < schema.forms.length; i++) {
      fieldCount += (schema.forms[i].fields || []).length;
    }
    return {
      entityTypeCount: schema.entityTypes.length,
      formCount: schema.forms.length,
      fieldCount: fieldCount,
    };
  }

  function importHpbModuleAsForm(moduleId, opts) {
    opts = opts || {};
    var mode = opts.mode === "manual" ? "manual" : "live";
    if (!dictionary || !fieldSchemaApi) return null;
    var meta = (dictionary.moduleMeta || {})[moduleId];
    if (!meta) return null;
    var fields = Array.isArray(dictionary.fields) ? dictionary.fields : [];
    var formFields = [];
    var count = 0;
    for (var i = 0; i < fields.length; i++) {
      var row = fields[i];
      if (row.moduleId !== moduleId) continue;
      if (row.researchExport === false) continue;
      if (isPhiMeta(row.label) || isPhiMeta(row.key)) continue;
      if (count >= MAX_FIELDS_PER_MODULE) break;
      var type = mapUiType(row);
      var catalogKey = "hpb." + moduleId + "." + row.key;
      var field = {
        key: row.key,
        label: row.label || row.key,
        type: type,
        required: !!row.required,
      };
      if (type === "select" && row.listKey) {
        var optsList = optionsForListKey(row.listKey);
        if (optsList && optsList.length) {
          field.options = optsList.filter(function (o) {
            return !isPhiMeta(o);
          });
        }
        if (!field.options || !field.options.length) field.type = "text";
      }
      if (mode === "live") {
        field.aghuSource = {
          catalogKey: catalogKey,
          mode: row.readOnly ? "readonly" : "autofill",
        };
        if (row.readOnly) field.readOnly = true;
      }
      formFields.push(field);
      count += 1;
    }
    if (!formFields.length) return null;
    var entId = opts.entityTypeId || fieldSchemaApi.newId("ent");
    return {
      entityType: opts.entityTypeId
        ? null
        : {
            id: entId,
            label: meta.label || moduleId,
            cardinality: moduleId === "followup" ? "many" : "one",
            parentEntityTypeId: opts.parentEntityTypeId || null,
          },
      form: {
        id: fieldSchemaApi.newId("form"),
        label: meta.label || moduleId,
        entityTypeId: entId,
        fields: formFields,
      },
    };
  }

  function importEnrichmentAsForm() {
    var catalog = null;
    try {
      catalog = require("./aghu-research-variable-catalog.js");
    } catch (_e) {}
    if (!catalog || !fieldSchemaApi) return null;
    var vars = catalog.getCatalogVariables().filter(function (v) {
      return v.domain !== "hpb_registry";
    });
    var entId = fieldSchemaApi.newId("ent");
    var formFields = [];
    for (var i = 0; i < vars.length; i++) {
      var entry = vars[i];
      var field = {
        key: entry.catalogKey.replace(/[^a-z0-9_]/g, "_").slice(0, 40),
        label: entry.label,
        type: "text",
        readOnly: true,
        aghuSource: {
          catalogKey: entry.catalogKey,
          mode: "readonly",
          anchor: entry.needsAnchor ? "protocol_index" : undefined,
        },
      };
      formFields.push(field);
    }
    return {
      entityType: {
        id: entId,
        label: "Variáveis AGHU",
        cardinality: "one",
        parentEntityTypeId: null,
      },
      form: {
        id: fieldSchemaApi.newId("form"),
        label: "Enriquecimento AGHU",
        entityTypeId: entId,
        fields: formFields,
      },
    };
  }

  return {
    IMPORT_MODULES: IMPORT_MODULES,
    buildHpbMirrorSchema: buildHpbMirrorSchema,
    previewHpbMirrorImport: previewHpbMirrorImport,
    importHpbModuleAsForm: importHpbModuleAsForm,
    importEnrichmentAsForm: importEnrichmentAsForm,
  };
});
