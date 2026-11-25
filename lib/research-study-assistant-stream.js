/**
 * FEAT-078 R2 — helpers NDJSON (eventos de nó) do Research Study Assistant.
 * FEAT-079 B2 — tokens[] + assertTokenEventSafe (só fase plan).
 * Só metadados nos steps; tokens = prosa NL (sem prontuário).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistantStream = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SENSITIVE_KEYS = [
    "proposal",
    "messages",
    "critiques",
    "assistantMessage",
    "currentProtocol",
    "studyPlan",
  ];

  /** Serializa um evento NDJSON (com newline final). */
  function formatNdjsonLine(obj) {
    return JSON.stringify(obj == null ? null : obj) + "\n";
  }

  /**
   * Parse texto NDJSON completo → array de objectos.
   * Linhas inválidas são ignoradas (fail-soft no parser cliente).
   */
  function parseNdjsonText(text) {
    var raw = String(text || "");
    var lines = raw.split("\n");
    var events = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      try {
        var obj = JSON.parse(t);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          events.push(obj);
        }
      } catch (_e) {
        /* skip malformed line */
      }
    }
    return events;
  }

  /**
   * Separa eventos `step`, `token` e o último `result`.
   * @returns {{ steps: object[], tokens: object[], result: object|null }}
   */
  function splitNdjsonEvents(events) {
    var list = Array.isArray(events) ? events : [];
    var steps = [];
    var tokens = [];
    var result = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || typeof e !== "object") continue;
      if (e.type === "step") steps.push(e);
      else if (e.type === "token") tokens.push(e);
      else if (e.type === "result") result = e;
    }
    return { steps: steps, tokens: tokens, result: result };
  }

  /**
   * RSA-STREAM-02 — evento step só metadados (sem proposal/messages/…).
   * @returns {{ ok: boolean, error?: string }}
   */
  function assertStepEventSafe(event) {
    if (!event || typeof event !== "object") {
      return { ok: false, error: "not_object" };
    }
    if (event.type !== "step") {
      return { ok: false, error: "not_step" };
    }
    if (!String(event.step || "").trim()) {
      return { ok: false, error: "missing_step" };
    }
    for (var i = 0; i < SENSITIVE_KEYS.length; i++) {
      var k = SENSITIVE_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(event, k)) {
        return { ok: false, error: "sensitive_key:" + k };
      }
    }
    return { ok: true };
  }

  /**
   * RSA-TOKEN — evento token: type + text string; sem chaves sensíveis.
   * @returns {{ ok: boolean, error?: string }}
   */
  function assertTokenEventSafe(event) {
    if (!event || typeof event !== "object") {
      return { ok: false, error: "not_object" };
    }
    if (event.type !== "token") {
      return { ok: false, error: "not_token" };
    }
    if (typeof event.text !== "string") {
      return { ok: false, error: "missing_text" };
    }
    for (var i = 0; i < SENSITIVE_KEYS.length; i++) {
      var k = SENSITIVE_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(event, k)) {
        return { ok: false, error: "sensitive_key:" + k };
      }
    }
    return { ok: true };
  }

  /**
   * Monta evento `step` redigido a partir de entry de stepTrace.
   */
  function toStepEvent(entry) {
    var e = entry && typeof entry === "object" ? entry : {};
    var out = {
      type: "step",
      step: String(e.step || ""),
      ok: e.ok !== false,
      durationMs: Number(e.durationMs) || 0,
    };
    if (Array.isArray(e.codes)) out.codes = e.codes.map(String).slice(0, 16);
    if (e.scores && typeof e.scores === "object") out.scores = e.scores;
    if (e.model) out.model = String(e.model).slice(0, 64);
    if (typeof e.promptTokens === "number") out.promptTokens = e.promptTokens;
    if (typeof e.completionTokens === "number") {
      out.completionTokens = e.completionTokens;
    }
    return out;
  }

  /**
   * Monta evento `token` (prosa).
   * @param {string} text
   */
  function toTokenEvent(text) {
    return { type: "token", text: String(text == null ? "" : text) };
  }

  /**
   * Detecta início de fence ```json no texto acumulado.
   * @returns {{ prose: string, jsonBody: string, sawFence: boolean }}
   */
  function splitProseAndJsonFence(fullText) {
    var full = String(fullText || "");
    var m = full.match(/```(?:json)?\s*/i);
    if (!m || m.index == null) {
      return { prose: full, jsonBody: "", sawFence: false };
    }
    var prose = full.slice(0, m.index);
    var after = full.slice(m.index + m[0].length);
    var end = after.search(/```/);
    var jsonBody = end >= 0 ? after.slice(0, end) : after;
    return { prose: prose, jsonBody: jsonBody, sawFence: true };
  }

  return {
    formatNdjsonLine: formatNdjsonLine,
    parseNdjsonText: parseNdjsonText,
    splitNdjsonEvents: splitNdjsonEvents,
    assertStepEventSafe: assertStepEventSafe,
    assertTokenEventSafe: assertTokenEventSafe,
    toStepEvent: toStepEvent,
    toTokenEvent: toTokenEvent,
    splitProseAndJsonFence: splitProseAndJsonFence,
    SENSITIVE_KEYS: SENSITIVE_KEYS.slice(),
  };
});
