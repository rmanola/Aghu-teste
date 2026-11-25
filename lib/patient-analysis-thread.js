/**
 * Thread conversacional para análise clínica (draft + revise).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisThread = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function promptApi() {
    if (typeof require === "function") {
      try {
        return require("./patient-analysis-prompt.js");
      } catch (_e) {}
    }
    return root.AghuPatientAnalysisPrompt || null;
  }

  /**
   * @returns {{ role: string, content: string }[]}
   */
  function createAnalysisThread(systemPrompt, initialUserMessage) {
    return [
      { role: "system", content: String(systemPrompt || "") },
      { role: "user", content: String(initialUserMessage || "") },
    ];
  }

  /**
   * @param {{ role: string, content: string }[]} thread
   * @param {string} assistantText
   * @returns {{ role: string, content: string }[]}
   */
  function appendAssistant(thread, assistantText) {
    var out = (thread || []).slice();
    out.push({ role: "assistant", content: String(assistantText || "") });
    return out;
  }

  /**
   * @param {{ role: string, content: string }[]} thread
   * @param {string} userFeedback
   * @returns {{ role: string, content: string }[]}
   */
  function appendUserFeedback(thread, userFeedback) {
    var p = promptApi();
    var wrapped = p
      ? p.wrapUserFeedbackTurn(userFeedback)
      : String(userFeedback || "");
    var out = (thread || []).slice();
    out.push({ role: "user", content: wrapped });
    return out;
  }

  /**
   * @param {{ systemPrompt: string, contextJson: object, draftText: string, userFeedback: string }} opts
   * @returns {{ role: string, content: string }[]}
   */
  function rebuildThreadForRevision(opts) {
    opts = opts || {};
    var p = promptApi();
    if (!p) {
      throw new Error("patient-analysis-prompt unavailable");
    }
    var initialUser = p.buildInitialUserMessage(opts.contextJson);
    var thread = createAnalysisThread(opts.systemPrompt, initialUser);
    thread = appendAssistant(thread, opts.draftText);
    thread = appendUserFeedback(thread, opts.userFeedback);
    return thread;
  }

  /**
   * OpenAI/Anthropic messages (sem system duplicado no array user).
   * @param {{ role: string, content: string }[]} thread
   * @returns {{ role: string, content: string }[]}
   */
  function toProviderMessages(thread) {
    return (thread || []).slice();
  }

  /**
   * @param {string} mode
   * @param {object} body
   * @returns {{ ok: true } | { ok: false, code: string }}
   */
  function validateReviseRequest(mode, body) {
    if (mode !== "revise") return { ok: true };
    var fb = body && body.userFeedback != null ? String(body.userFeedback).trim() : "";
    if (fb.length < 20) {
      return { ok: false, code: "user_feedback_required" };
    }
    if (!body.draftText || !String(body.draftText).trim()) {
      return { ok: false, code: "draft_text_required" };
    }
    return { ok: true };
  }

  return {
    createAnalysisThread: createAnalysisThread,
    appendAssistant: appendAssistant,
    appendUserFeedback: appendUserFeedback,
    rebuildThreadForRevision: rebuildThreadForRevision,
    toProviderMessages: toProviderMessages,
    validateReviseRequest: validateReviseRequest,
  };
});
