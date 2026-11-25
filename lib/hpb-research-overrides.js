/**
 * Overrides do dicionário HPB — campos sem UI ou flags de export explícitos.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbResearchOverrides = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** researchExport: false por key (todos os módulos). */
  var GLOBAL_KEY_EXPORT = {
    notes: false,
    tnm: false,
  };

  /** Campos calculados só em merge (hpb-computed enrichFollowup) — sem campo UI. */
  var MERGE_ONLY_FIELDS = [
    {
      moduleId: "followup",
      key: "survivalMonths",
      label: "Sobrevida (meses)",
      researchType: "calculated",
      researchExport: true,
    },
    {
      moduleId: "followup",
      key: "sldMonths",
      label: "SLD (meses)",
      researchType: "calculated",
      researchExport: true,
    },
    {
      moduleId: "followup",
      key: "adjuvancyTimeMonths",
      label: "Tempo adjuvância (meses)",
      researchType: "calculated",
      researchExport: true,
    },
    {
      moduleId: "pathology",
      key: "tnm",
      label: "TNM (legado)",
      researchType: "text",
      researchExport: false,
    },
  ];

  function fieldKey(moduleId, key) {
    return moduleId + "::" + key;
  }

  function getResearchExportOverride(moduleId, key, defaults) {
    if (Object.prototype.hasOwnProperty.call(GLOBAL_KEY_EXPORT, key)) {
      return GLOBAL_KEY_EXPORT[key];
    }
    return defaults;
  }

  function getMergeOnlyFields() {
    return MERGE_ONLY_FIELDS.map(function (f) {
      return Object.assign({}, f);
    });
  }

  return {
    GLOBAL_KEY_EXPORT: GLOBAL_KEY_EXPORT,
    MERGE_ONLY_FIELDS: MERGE_ONLY_FIELDS,
    fieldKey: fieldKey,
    getMergeOnlyFields: getMergeOnlyFields,
    getResearchExportOverride: getResearchExportOverride,
  };
});
