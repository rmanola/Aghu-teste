/**
 * Modelos reutilizáveis de prontuário para análise clínica (sem PHI por omissão).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAnaliseTemplateSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-" + String(Date.now()).slice(-12);
  }

  function emptyTemplatesSnap() {
    return { version: 1, templates: [], atualizadoEm: null };
  }

  function normalizeTemplate(raw) {
    if (!raw || typeof raw !== "object") return null;
    var text = String(raw.prontuarioText || "").trim();
    if (!text) return null;
    return {
      id: raw.id && String(raw.id) ? String(raw.id) : newId(),
      name: String(raw.name || "").trim() || "Sem nome",
      description: raw.description ? String(raw.description) : "",
      prontuarioText: text,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function normalizeTemplatesSnap(raw) {
    if (!raw || typeof raw !== "object") return emptyTemplatesSnap();
    var templates = [];
    if (Array.isArray(raw.templates)) {
      for (var i = 0; i < raw.templates.length; i++) {
        var t = normalizeTemplate(raw.templates[i]);
        if (t) templates.push(t);
      }
    }
    return {
      version: 1,
      templates: templates,
      atualizadoEm:
        typeof raw.atualizadoEm === "number" ? raw.atualizadoEm : null,
    };
  }

  return {
    emptyTemplatesSnap: emptyTemplatesSnap,
    normalizeTemplate: normalizeTemplate,
    normalizeTemplatesSnap: normalizeTemplatesSnap,
  };
});
