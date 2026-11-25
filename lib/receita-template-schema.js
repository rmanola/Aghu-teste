/**
 * Templates reutilizáveis de conjuntos de medicamentos (sem PHI).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaTemplateSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  function newId() {
    var s = getSchema();
    return s ? s.newId() : String(Date.now());
  }

  function emptyTemplatesSnap() {
    return { version: 1, templates: [], atualizadoEm: null };
  }

  function normalizeTemplateLine(raw) {
    var schema = getSchema();
    if (!schema) return null;
    var ln = schema.normalizeLine(raw);
    if (!ln) return null;
    delete ln.id;
    return ln;
  }

  function normalizeTemplatesSnap(raw) {
    if (!raw || typeof raw !== "object") return emptyTemplatesSnap();
    var templates = [];
    if (Array.isArray(raw.templates)) {
      for (var i = 0; i < raw.templates.length; i++) {
        var t = raw.templates[i];
        if (!t || typeof t !== "object") continue;
        var lines = [];
        if (Array.isArray(t.lines)) {
          for (var j = 0; j < t.lines.length; j++) {
            var ln = normalizeTemplateLine(t.lines[j]);
            if (ln && ln.drugName) lines.push(ln);
          }
        }
        templates.push({
          id: t.id && String(t.id) ? String(t.id) : newId(),
          name: String(t.name || "").trim(),
          description: t.description ? String(t.description) : "",
          tags: Array.isArray(t.tags)
            ? t.tags.filter(function (x) {
                return typeof x === "string" && x.trim();
              })
            : [],
          lines: lines,
          createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
          updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
        });
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
    normalizeTemplateLine: normalizeTemplateLine,
    normalizeTemplatesSnap: normalizeTemplatesSnap,
  };
});
