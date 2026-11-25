/**
 * Dicionário de variáveis HPB para pesquisa — builder canônico.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbDataDictionary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var typesApi = null;
  var overridesApi = null;
  try {
    if (typeof require === "function") {
      typesApi = require("./hpb-research-types.js");
      overridesApi = require("./hpb-research-overrides.js");
    }
  } catch (_e) {}

  /** moduleId → grain + sheetCode (espelha web/lib/hpb/sheet-tabs.ts — Excel MVP v2.5). */
  var MODULE_META = {
    episode: { grain: "episode", sheetCode: "02_EPISODIOS", label: "Episódio clínico" },
    mdt: { grain: "mdt", sheetCode: "03_MDT", label: "MDT" },
    preop: { grain: "preop", sheetCode: "04_PREOP", label: "Pré-operatório" },
    surgery_core: { grain: "surgery", sheetCode: "05_CIRURGIA_CORE", label: "Cirurgia" },
    hepatectomy: { grain: "surgerySubmodule", sheetCode: "05A_HEPATECTOMIA", label: "Hepatectomia" },
    pancreatectomy: { grain: "surgerySubmodule", sheetCode: "05B_PANCREATECTOMIA", label: "Pancreatectomia" },
    biliary: { grain: "surgerySubmodule", sheetCode: "05C_VIA_BILIAR", label: "Via biliar" },
    pathology: { grain: "surgerySubmodule", sheetCode: "06_PATOLOGIA", label: "Patologia" },
    postop: { grain: "surgerySubmodule", sheetCode: "07_POSOPERATORIO", label: "Pós-operatório" },
    vascular: { grain: "surgerySubmodule", sheetCode: "05E_VASCULAR", label: "Vascular" },
    robotic: { grain: "surgerySubmodule", sheetCode: "05F_ROBOTICA", label: "Robótica" },
    lrt: { grain: "lrt", sheetCode: "05D_LOCORREGIONAL", label: "Locorregional" },
    followup: { grain: "followup", sheetCode: "08_SEGUIMENTO", label: "Seguimento" },
  };

  var LINKAGE_EXPORT_COLUMNS = [
    "record_anon_id",
    "episode_id",
    "surgery_id",
    "mdt_id",
    "lrt_id",
    "followup_id",
    "module",
    "submodule",
  ];

  function getTypesApi() {
    if (typesApi) return typesApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbResearchTypes || null;
  }

  function getOverridesApi() {
    if (overridesApi) return overridesApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbResearchOverrides || null;
  }

  function buildFieldEntry(moduleId, field, emptySentinels) {
    var types = getTypesApi();
    var overrides = getOverridesApi();
    var meta = MODULE_META[moduleId];
    if (!meta) throw new Error("moduleId desconhecido: " + moduleId);

    var readOnly = !!field.readOnly;
    var uiType = field.type || "text";
    var researchType = types
      ? types.uiTypeToResearchType(uiType, readOnly)
      : readOnly
        ? "calculated"
        : "text";
    var missing = types
      ? types.missingPolicyForField(field, emptySentinels)
      : { policy: {}, sentinels: {} };

    var defaultExport = field.key === "notes" ? false : true;
    var researchExport = overrides
      ? overrides.getResearchExportOverride(moduleId, field.key, defaultExport)
      : defaultExport;

    var exportColumn = types ? types.camelToSnake(field.key) : field.key;

    return {
      key: field.key,
      label: field.label,
      moduleId: moduleId,
      moduleLabel: meta.label,
      sheetCode: meta.sheetCode,
      grain: meta.grain,
      uiType: uiType,
      researchType: researchType,
      listKey: field.listKey || null,
      required: !!field.required,
      readOnly: readOnly,
      researchExport: researchExport,
      exportColumn: exportColumn,
      missingPolicy: missing.policy,
      glossaryKey: field.key,
    };
  }

  function buildMergeOnlyEntry(extra) {
    var meta = MODULE_META[extra.moduleId];
    var types = getTypesApi();
    return {
      key: extra.key,
      label: extra.label,
      moduleId: extra.moduleId,
      moduleLabel: meta ? meta.label : extra.moduleId,
      sheetCode: meta ? meta.sheetCode : "",
      grain: meta ? meta.grain : "",
      uiType: "number",
      researchType: extra.researchType || "calculated",
      listKey: null,
      required: false,
      readOnly: true,
      researchExport: extra.researchExport !== false,
      exportColumn: types ? types.camelToSnake(extra.key) : extra.key,
      missingPolicy: {
        empty: "incomplete",
        pending: "n/a",
        unknown: "n/a",
        notApplicable: "n/a",
        nonStringFilled: "valid",
      },
      glossaryKey: extra.key,
      mergeOnly: true,
    };
  }

  /**
   * @param {Array<{ id: string, label: string, fields: Array<object> }>} modules
   * @param {{ emptySentinels?: object }} [opts]
   */
  function buildDataDictionary(modules, opts) {
    opts = opts || {};
    var emptySentinels =
      opts.emptySentinels || getTypesApi()?.DEFAULT_EMPTY_SENTINELS || {
        pending: ["pendente"],
        unknown: ["não informado", "nao informado", "ni", "unknown"],
      };

    var fields = [];
    for (var i = 0; i < (modules || []).length; i++) {
      var mod = modules[i];
      var modFields = mod.fields || [];
      for (var j = 0; j < modFields.length; j++) {
        fields.push(buildFieldEntry(mod.id, modFields[j], emptySentinels));
      }
    }

    var mergeOnly = getOverridesApi()?.getMergeOnlyFields() || [];
    for (var k = 0; k < mergeOnly.length; k++) {
      var exists = fields.some(function (f) {
        return f.moduleId === mergeOnly[k].moduleId && f.key === mergeOnly[k].key;
      });
      if (!exists) fields.push(buildMergeOnlyEntry(mergeOnly[k]));
    }

    return {
      version: 1,
      generatedFrom: "web/lib/hpb/field-definitions.ts",
      emptySentinels: emptySentinels,
      linkageExportColumns: LINKAGE_EXPORT_COLUMNS,
      moduleMeta: MODULE_META,
      fields: fields,
    };
  }

  function getExportableColumns(dictionary) {
    var cols = (dictionary.linkageExportColumns || LINKAGE_EXPORT_COLUMNS).slice();
    var seen = {};
    for (var i = 0; i < cols.length; i++) seen[cols[i]] = true;

    for (var j = 0; j < (dictionary.fields || []).length; j++) {
      var f = dictionary.fields[j];
      if (!f.researchExport) continue;
      if (!seen[f.exportColumn]) {
        seen[f.exportColumn] = true;
        cols.push(f.exportColumn);
      }
    }
    return cols;
  }

  function isResearchExportKey(key, dictionary) {
    if (!key) return false;
    var linkage = dictionary.linkageExportColumns || LINKAGE_EXPORT_COLUMNS;
    if (linkage.indexOf(key) >= 0) return true;
    for (var i = 0; i < (dictionary.fields || []).length; i++) {
      var f = dictionary.fields[i];
      if (f.exportColumn === key && f.researchExport) return true;
    }
    return false;
  }

  function filterRowForResearchExport(row, dictionary) {
    var out = {};
    for (var k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (isResearchExportKey(k, dictionary)) out[k] = row[k];
    }
    return out;
  }

  return {
    LINKAGE_EXPORT_COLUMNS: LINKAGE_EXPORT_COLUMNS,
    MODULE_META: MODULE_META,
    buildDataDictionary: buildDataDictionary,
    buildFieldEntry: buildFieldEntry,
    filterRowForResearchExport: filterRowForResearchExport,
    getExportableColumns: getExportableColumns,
    isResearchExportKey: isResearchExportKey,
  };
});
