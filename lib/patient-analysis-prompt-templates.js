/**
 * Templates de system prompt para análise clínica (sem PHI).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisPromptTemplates = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var BUILTIN_DEFAULT_ID = "builtin-aghu-default";
  var MAX_TEMPLATES = 20;
  var MAX_NAME_LEN = 80;
  var MAX_PROMPT_LEN = 6000;

  function promptApi() {
    if (typeof require === "function") {
      try {
        return require("./patient-analysis-prompt.js");
      } catch (_e) {}
    }
    return root.AghuPatientAnalysisPrompt || null;
  }

  /**
   * Instruções padrão (sem bloco de data — data é sempre no servidor).
   * @returns {string}
   */
  function defaultUserInstructions() {
    var p = promptApi();
    if (!p || typeof p.buildAnalysisSystemPrompt !== "function") {
      return [
        "Você é um assistente de síntese clínica ultra-resumida para médicos em plantão hospitalar.",
        "Responda em português brasileiro, num único parágrafo denso (sem títulos, listas ou Markdown estruturado).",
        "",
        "ENTRADA: JSON com prontuarioColado + dadosSincronizados + referenceNow.",
        "- Em divergência narrativa, priorize prontuarioColado.text.",
        "- Valores numéricos e datas: preferir dadosSincronizados.",
      ].join("\n");
    }
    var full = p.buildAnalysisSystemPrompt({
      referenceNow: p.buildReferenceNow(new Date()),
    });
    var lines = full.split("\n");
    var out = [];
    var skipDate = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("DATA ACTUAL") === 0) {
        skipDate = true;
        continue;
      }
      if (skipDate) {
        if (line.trim() === "") skipDate = false;
        continue;
      }
      out.push(line);
    }
    return out.join("\n").trim();
  }

  /**
   * @returns {object}
   */
  function createBuiltinDefaultTemplate() {
    var now = new Date().toISOString();
    return {
      id: BUILTIN_DEFAULT_ID,
      name: "Padrão AGHU",
      systemPrompt: defaultUserInstructions(),
      isBuiltin: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * @returns {object}
   */
  function createDefaultPreferences() {
    var builtin = createBuiltinDefaultTemplate();
    return {
      active_template_id: builtin.id,
      templates: [builtin],
    };
  }

  /**
   * @param {string} [name]
   * @returns {object}
   */
  function createBlankTemplate(name) {
    var now = new Date().toISOString();
    var id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "tpl_" + Date.now().toString(36);
    return {
      id: id,
      name: name || "Novo template",
      systemPrompt: defaultUserInstructions(),
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * @param {unknown} raw
   * @returns {object}
   */
  function sanitizePreferences(raw) {
    var base = createDefaultPreferences();
    if (!raw || typeof raw !== "object") return base;
    var obj = /** @type {Record<string, unknown>} */ (raw);
    var templates = Array.isArray(obj.templates) ? obj.templates : [];
    var builtin = createBuiltinDefaultTemplate();
    var seen = new Set();
    var out = [];

    out.push(builtin);
    seen.add(builtin.id);

    for (var i = 0; i < templates.length && out.length < MAX_TEMPLATES; i++) {
      var t = templates[i];
      if (!t || typeof t !== "object") continue;
      var row = /** @type {Record<string, unknown>} */ (t);
      if (row.isBuiltin === true) continue;
      var id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id || seen.has(id)) continue;
      var name = String(row.name || "Template").trim().slice(0, MAX_NAME_LEN);
      var systemPrompt = String(row.systemPrompt || "")
        .trim()
        .slice(0, MAX_PROMPT_LEN);
      if (!systemPrompt) continue;
      seen.add(id);
      out.push({
        id: id,
        name: name || "Template",
        systemPrompt: systemPrompt,
        isBuiltin: false,
        createdAt:
          typeof row.createdAt === "string"
            ? row.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof row.updatedAt === "string"
            ? row.updatedAt
            : new Date().toISOString(),
      });
    }

    var activeId =
      typeof obj.active_template_id === "string"
        ? obj.active_template_id
        : builtin.id;
    if (!seen.has(activeId)) activeId = builtin.id;

    return {
      active_template_id: activeId,
      templates: out,
    };
  }

  /**
   * @param {object} prefs
   * @returns {object|null}
   */
  function getActiveTemplate(prefs) {
    var sanitized = sanitizePreferences(prefs);
    var activeId = sanitized.active_template_id;
    for (var i = 0; i < sanitized.templates.length; i++) {
      if (sanitized.templates[i].id === activeId) {
        return sanitized.templates[i];
      }
    }
    return sanitized.templates[0] || null;
  }

  /**
   * Payload para Postgres — só templates custom (builtin é reconstruído na leitura).
   * @param {unknown} raw
   * @returns {{ active_template_id: string, templates: object[] }}
   */
  function preferencesForStorage(raw) {
    var sanitized = sanitizePreferences(raw);
    return {
      active_template_id: sanitized.active_template_id,
      templates: sanitized.templates
        .filter(function (t) {
          return !t.isBuiltin;
        })
        .map(function (t) {
          return {
            id: t.id,
            name: t.name,
            systemPrompt: t.systemPrompt,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          };
        }),
    };
  }

  /**
   * @param {unknown} payload
   * @returns {boolean}
   */
  function isValidWritePayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    var p = /** @type {Record<string, unknown>} */ (payload);
    if (typeof p.active_template_id !== "string" || !p.active_template_id.trim()) {
      return false;
    }
    if (!Array.isArray(p.templates)) return false;
    if (p.templates.length > MAX_TEMPLATES) return false;
    var stored = preferencesForStorage(payload);
    if (!stored.active_template_id) return false;
    return stored.templates.every(function (t) {
      return (
        t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.systemPrompt === "string" &&
        t.systemPrompt.trim().length > 0
      );
    });
  }

  /**
   * @param {unknown} row — linha de `analysis_prompt_templates` da Edge Function
   * @returns {object}
   */
  function parsePreferencesFromApiRow(row) {
    if (!row || typeof row !== "object") {
      return createDefaultPreferences();
    }
    var r = /** @type {Record<string, unknown>} */ (row);
    return sanitizePreferences({
      active_template_id: r.active_template_id,
      templates: r.templates,
    });
  }

  return {
    BUILTIN_DEFAULT_ID: BUILTIN_DEFAULT_ID,
    MAX_TEMPLATES: MAX_TEMPLATES,
    MAX_NAME_LEN: MAX_NAME_LEN,
    MAX_PROMPT_LEN: MAX_PROMPT_LEN,
    defaultUserInstructions: defaultUserInstructions,
    createBuiltinDefaultTemplate: createBuiltinDefaultTemplate,
    createDefaultPreferences: createDefaultPreferences,
    createBlankTemplate: createBlankTemplate,
    sanitizePreferences: sanitizePreferences,
    preferencesForStorage: preferencesForStorage,
    getActiveTemplate: getActiveTemplate,
    isValidWritePayload: isValidWritePayload,
    parsePreferencesFromApiRow: parsePreferencesFromApiRow,
  };
});
