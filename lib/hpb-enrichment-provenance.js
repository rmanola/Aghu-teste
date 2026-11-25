/**
 * Proveniência de campos HPB enriquecidos a partir de domínios AGHU.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbEnrichmentProvenance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var EMPTY_MARKERS = {
    pendente: true,
    ni: true,
    "n/a": true,
    na: true,
    "n/i": true,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function isFieldEmpty(value) {
    if (value == null) return true;
    var s = String(value).trim();
    if (!s) return true;
    return !!EMPTY_MARKERS[s.toLowerCase()];
  }

  function buildProvenanceKey(episodeId, surgeryId, fieldPath) {
    return (
      String(episodeId || "") +
      "::" +
      String(surgeryId || "") +
      "::" +
      String(fieldPath || "")
    );
  }

  function parseProvenanceKey(key) {
    var parts = String(key || "").split("::");
    if (parts.length < 3) return null;
    return {
      episodeId: parts[0],
      surgeryId: parts[1],
      fieldPath: parts.slice(2).join("::"),
    };
  }

  function markAuto(provenance, key, opts) {
    opts = opts || {};
    var next = Object.assign({}, provenance || {});
    next[key] = {
      source: opts.source || "aghu_exams",
      filledAt: opts.filledAt || nowIso(),
      sourceDate: opts.sourceDate ? String(opts.sourceDate) : "",
      filledBy: opts.filledBy ? String(opts.filledBy) : "",
    };
    return next;
  }

  function markManual(provenance, key, opts) {
    opts = opts || {};
    var next = Object.assign({}, provenance || {});
    next[key] = {
      source: "manual",
      filledAt: opts.filledAt || nowIso(),
      sourceDate: "",
      filledBy: opts.filledBy ? String(opts.filledBy) : "",
    };
    return next;
  }

  function shouldAutoFill(provenance, key) {
    var entry = provenance && provenance[key];
    if (!entry) return true;
    return entry.source !== "manual";
  }

  function getProvenanceEntry(provenance, key) {
    if (!provenance || !provenance[key]) return null;
    return provenance[key];
  }

  function provenanceSourceLabel(source) {
    var s = String(source || "");
    if (s === "manual") return "Manual";
    if (s === "aghu_exams") return "AGHU exames";
    if (s === "aghu_prescricoes") return "AGHU prescrições";
    if (s === "aghu_controles") return "AGHU controles";
    if (s === "aghu_pii") return "AGHU PII";
    return "AGHU";
  }

  function provenanceAuditSource(source) {
    return String(source || "aghu_exams").replace(/^aghu_/, "");
  }

  return {
    isFieldEmpty: isFieldEmpty,
    buildProvenanceKey: buildProvenanceKey,
    parseProvenanceKey: parseProvenanceKey,
    markAuto: markAuto,
    markManual: markManual,
    shouldAutoFill: shouldAutoFill,
    getProvenanceEntry: getProvenanceEntry,
    provenanceSourceLabel: provenanceSourceLabel,
    provenanceAuditSource: provenanceAuditSource,
  };
});
