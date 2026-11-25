/**
 * Validação expandida — espelha supabase/functions/generate-patient-analysis/lib.ts
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisRequest = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var MIN_PRONTUARIO_CHARS = 200;
  var MIN_FEEDBACK_CHARS = 20;
  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function snapApi() {
    if (typeof require === "function") {
      try {
        return require("./patient-analysis-snap.js");
      } catch (_e) {}
    }
    return root.AghuPatientAnalysisSnap || null;
  }

  function threadApi() {
    if (typeof require === "function") {
      try {
        return require("./patient-analysis-thread.js");
      } catch (_e) {}
    }
    return root.AghuPatientAnalysisThread || null;
  }

  function normalizeChatMessages(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var role = item.role === "assistant" ? "assistant" : "user";
      var content = String(item.content || "").trim();
      if (!content) continue;
      out.push({ role: role, content: content });
    }
    return out;
  }

  function bodyToMessages(body) {
    body = body || {};
    var fromArray = normalizeChatMessages(body.messages);
    if (fromArray.length) return fromArray;
    var pront = String(body.prontuarioText || "").trim();
    var messages = [];
    if (pront) messages.push({ role: "user", content: pront });
    if (body.mode === "revise") {
      var draft = String(body.draftText || "").trim();
      var fb = String(body.userFeedback || "").trim();
      if (draft) messages.push({ role: "assistant", content: draft });
      if (fb) messages.push({ role: "user", content: fb });
    }
    return messages;
  }

  function firstUserContent(messages) {
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }

  function lastUserContent(messages) {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }

  function lastAssistantContent(messages) {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }

  function inferModeFromMessages(messages) {
    var snap = snapApi();
    if (snap && snap.inferGenerateMode) return snap.inferGenerateMode(messages);
    if (!messages.length) return "draft";
    var last = messages[messages.length - 1];
    if (last.role !== "user") return "continue";
    var hasAssistant = messages.some(function (m) {
      return m.role === "assistant";
    });
    if (!hasAssistant) return "draft";
    return "revise";
  }

  function extractProntuarioFromPaste(text) {
    if (!text) return null;
    var m = String(text).match(
      /\b(?:prontu[aá]rio|pront\.?)\s*[:\s#-]*\s*(\d[\d.\-/]{2,}\d|\d{4,})/i,
    );
    return m && m[1] ? m[1] : null;
  }

  function parseOptionalRecordClientId(raw) {
    if (raw == null || String(raw).trim() === "") {
      return { ok: true, id: null };
    }
    var s = String(raw).trim();
    if (!UUID_RE.test(s)) {
      return { ok: false, code: "validation_failed", status: 422 };
    }
    return { ok: true, id: s };
  }

  function isPatientAnalysisEnabled(flag) {
    return flag === "true";
  }

  function featureDisabledResponse(enabled) {
    if (enabled) return null;
    return { status: 410, error: "feature_disabled" };
  }

  function aiConsentRequiredResponse(hasConsent) {
    if (hasConsent) return null;
    return { status: 403, error: "ai_consent_required" };
  }

  function resolveAnalysisModels(env) {
    env = env || {};
    var provider =
      env.AGHU_ANALYSIS_PROVIDER === "anthropic" ? "anthropic" : "openai";
    if (provider === "anthropic") {
      return {
        provider: provider,
        model: env.AGHU_ANTHROPIC_ANALYSIS_MODEL || "claude-haiku-4-5",
      };
    }
    return {
      provider: provider,
      model: env.AGHU_OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    };
  }

  function validateGenerateBody(body) {
    body = body || {};
    var messages = bodyToMessages(body);
    var explicitMode = body.mode;
    var mode =
      explicitMode === "revise"
        ? "revise"
        : explicitMode === "continue"
          ? "continue"
          : explicitMode === "draft"
            ? "draft"
            : inferModeFromMessages(messages);

    var pront =
      firstUserContent(messages) || String(body.prontuarioText || "").trim();
    if (pront.length < MIN_PRONTUARIO_CHARS) {
      return { ok: false, code: "prontuario_required", status: 422 };
    }

    if (mode === "revise") {
      var fb = lastUserContent(messages) || String(body.userFeedback || "").trim();
      var draft =
        lastAssistantContent(messages) || String(body.draftText || "").trim();
      if (fb.length < MIN_FEEDBACK_CHARS) {
        return { ok: false, code: "user_feedback_required", status: 422 };
      }
      if (!draft) {
        return { ok: false, code: "draft_text_required", status: 422 };
      }
    }

    if (mode === "continue") {
      var last = messages[messages.length - 1];
      if (!last || last.role !== "user") {
        return { ok: false, code: "user_message_required", status: 422 };
      }
      if (last.content.trim().length < MIN_FEEDBACK_CHARS) {
        return { ok: false, code: "user_message_too_short", status: 422 };
      }
    }

    return { ok: true, mode: mode, messages: messages };
  }

  return {
    isPatientAnalysisEnabled: isPatientAnalysisEnabled,
    featureDisabledResponse: featureDisabledResponse,
    aiConsentRequiredResponse: aiConsentRequiredResponse,
    resolveAnalysisModels: resolveAnalysisModels,
    validateGenerateBody: validateGenerateBody,
    bodyToMessages: bodyToMessages,
    extractProntuarioFromPaste: extractProntuarioFromPaste,
    parseOptionalRecordClientId: parseOptionalRecordClientId,
    MIN_PRONTUARIO_CHARS: MIN_PRONTUARIO_CHARS,
    MIN_FEEDBACK_CHARS: MIN_FEEDBACK_CHARS,
  };
});
