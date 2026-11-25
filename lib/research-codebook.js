/**
 * Codebook / dicionário de dados Research (FEAT-066 / GEN-11).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchCodebook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function grainOf(protocol) {
    if (!protocol || !protocol.studyDesign) return "patient";
    return str(protocol.studyDesign.cohortGrain) || "patient";
  }

  function aghuSourceLabel(field) {
    if (!field || !field.aghuSource) return "";
    if (typeof field.aghuSource === "string") return field.aghuSource;
    return str(field.aghuSource.catalogKey || field.aghuSource.path || "");
  }

  function grainForForm(protocol, form) {
    var entityTypeId = form && form.entityTypeId ? str(form.entityTypeId) : "";
    if (entityTypeId && Array.isArray(protocol.entityTypes)) {
      for (var i = 0; i < protocol.entityTypes.length; i++) {
        var et = protocol.entityTypes[i];
        if (et && str(et.id) === entityTypeId && et.grain) {
          var g = str(et.grain);
          if (
            g === "patient" ||
            g === "clinical_episode" ||
            g === "surgery"
          ) {
            return g;
          }
        }
      }
    }
    if (form && form.grain) {
      var fg = str(form.grain);
      if (
        fg === "patient" ||
        fg === "clinical_episode" ||
        fg === "surgery"
      ) {
        return fg;
      }
    }
    return grainOf(protocol);
  }

  /**
   * @returns {Array<{ key, label, type, aghuSource, analyticsRole, grain, formId }>}
   */
  function buildCodebookRows(protocol) {
    var rows = [];
    if (!protocol || !Array.isArray(protocol.forms)) return rows;
    for (var i = 0; i < protocol.forms.length; i++) {
      var form = protocol.forms[i];
      var grain = grainForForm(protocol, form);
      var fields = form.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        if (!field || !field.key) continue;
        rows.push({
          key: str(form.id) + "." + str(field.key),
          label: str(field.label) || str(field.key),
          type: str(field.type) || "text",
          aghuSource: aghuSourceLabel(field),
          analyticsRole: str(field.analyticsRole),
          grain: grain,
          formId: str(form.id),
        });
      }
    }
    return rows;
  }

  function escapeCsv(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function codebookToCsv(rows) {
    var header = [
      "key",
      "label",
      "type",
      "aghuSource",
      "analyticsRole",
      "grain",
      "formId",
    ];
    var lines = [header.join(",")];
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      lines.push(
        [
          escapeCsv(r.key),
          escapeCsv(r.label),
          escapeCsv(r.type),
          escapeCsv(r.aghuSource),
          escapeCsv(r.analyticsRole),
          escapeCsv(r.grain),
          escapeCsv(r.formId),
        ].join(","),
      );
    }
    return lines.join("\n");
  }

  return {
    buildCodebookRows: buildCodebookRows,
    codebookToCsv: codebookToCsv,
  };
});
