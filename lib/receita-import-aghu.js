/**
 * Importa linhas de receita a partir do snap de prescrição AGHU.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaImportAghu = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getCatalog() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-medication-catalog.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaMedicationCatalog;
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  function extractDrugName(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    var m = t.match(/^([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s\-+]+?)(?:\s+\d|\s*[,;]|\s+—|\s+-)/);
    if (m) return m[1].trim();
    return t.split(/\s+/).slice(0, 3).join(" ");
  }

  function lineFromText(text) {
    var catalog = getCatalog();
    var schema = getSchema();
    var posology = String(text || "").trim();
    if (!posology) return null;
    var drugName = extractDrugName(posology);
    var resolved = catalog
      ? catalog.resolveClassForDrugName(drugName)
      : { prescriptionDocumentClass: "SIMPLE", catalogKey: null };
    var raw = {
      drugName: resolved.drugName || drugName || posology,
      catalogKey: resolved.catalogKey,
      posology: posology,
      prescriptionDocumentClass: resolved.prescriptionDocumentClass || "SIMPLE",
      classSource: "AGHU_IMPORT",
      controlListCode: resolved.controlListCode || null,
      validityDays: resolved.validityDays != null ? resolved.validityDays : null,
    };
    return schema ? schema.normalizeLine(raw) : raw;
  }

  /**
   * @param {object|null} prescricaoSnap
   * @param {{ includeHidratacao?: boolean }} [opts]
   * @returns {object[]}
   */
  function importLinesFromPrescricao(prescricaoSnap, opts) {
    opts = opts || {};
    if (!prescricaoSnap || typeof prescricaoSnap !== "object") return [];
    var lines = [];
    var groups = [
      prescricaoSnap.antibiotico,
      prescricaoSnap.analgesia,
    ];
    if (opts.includeHidratacao) groups.push(prescricaoSnap.hidratacao);
    for (var g = 0; g < groups.length; g++) {
      var arr = groups[g];
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) {
        var ln = lineFromText(arr[i]);
        if (ln) lines.push(ln);
      }
    }
    return lines;
  }

  return {
    extractDrugName: extractDrugName,
    lineFromText: lineFromText,
    importLinesFromPrescricao: importLinesFromPrescricao,
  };
});
