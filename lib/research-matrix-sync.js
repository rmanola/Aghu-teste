/**
 * Sincroniza matrixViews com formulários (1 aba na coorte por formulário).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchMatrixSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function newId(prefix) {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuResearchFieldSchema &&
      globalThis.AghuResearchFieldSchema.newId
    ) {
      return globalThis.AghuResearchFieldSchema.newId(prefix);
    }
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return prefix + "-" + crypto.randomUUID().slice(0, 8);
    }
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  /**
   * @param {Array<{id:string,label:string,entityTypeId:string}>} forms
   * @param {Array<{id:string,label:string,formId:string,entityTypeId:string}>} matrixViews
   * @param {{ previousFormLabels?: Record<string,string> }} [opts]
   */
  function syncMatrixViewsWithForms(forms, matrixViews, opts) {
    opts = opts || {};
    var previousFormLabels = opts.previousFormLabels || {};
    var formsList = Array.isArray(forms) ? forms : [];
    var viewsList = Array.isArray(matrixViews) ? matrixViews : [];

    var existingByFormId = {};
    for (var i = 0; i < viewsList.length; i++) {
      var mv = viewsList[i];
      if (mv && mv.formId) existingByFormId[mv.formId] = mv;
    }

    var result = [];
    for (var f = 0; f < formsList.length; f++) {
      var form = formsList[f];
      if (!form || !form.id) continue;
      var existing = existingByFormId[form.id];
      var prevFormLabel = str(previousFormLabels[form.id]);
      var label = form.label || "Formulário";

      if (existing) {
        var tabLabel = existing.label || label;
        if (prevFormLabel && tabLabel === prevFormLabel) {
          tabLabel = label;
        }
        var row = {
          id: existing.id,
          label: tabLabel,
          formId: form.id,
          entityTypeId: form.entityTypeId,
        };
        var g =
          str(existing.grain) ||
          str(form.grain);
        if (
          g === "patient" ||
          g === "clinical_episode" ||
          g === "surgery"
        ) {
          row.grain = g;
        }
        result.push(row);
      } else {
        var fresh = {
          id: newId("mv"),
          label: label,
          formId: form.id,
          entityTypeId: form.entityTypeId,
        };
        var fg = str(form.grain);
        if (
          fg === "patient" ||
          fg === "clinical_episode" ||
          fg === "surgery"
        ) {
          fresh.grain = fg;
        }
        result.push(fresh);
      }
    }
    return result;
  }

  return {
    syncMatrixViewsWithForms: syncMatrixViewsWithForms,
  };
});
