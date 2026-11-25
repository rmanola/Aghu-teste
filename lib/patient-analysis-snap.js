/**
 * Normalização do snapshot de análise clínica (legado → messages[]).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisSnap = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @returns {string}
   */
  function newMessageId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return (
      "msg_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  /**
   * @param {string} role
   * @param {string} content
   * @param {string} [source]
   * @param {string} [createdAt]
   * @returns {{ id: string, role: string, content: string, createdAt: string, source?: string }}
   */
  function createMessage(role, content, source, createdAt) {
    return {
      id: newMessageId(),
      role: role === "assistant" ? "assistant" : "user",
      content: String(content || ""),
      createdAt: createdAt || new Date().toISOString(),
      ...(source ? { source: source } : {}),
    };
  }

  /**
   * @param {unknown} snap
   * @returns {object}
   */
  function emptyAnaliseSnap() {
    return {
      messages: [],
      prontuarioText: "",
      text: "",
      sourceFingerprint: "",
    };
  }

  /**
   * Migra snap legado (prontuarioText + text) para messages[].
   * @param {unknown} raw
   * @returns {object}
   */
  function normalizeAnaliseSnap(raw) {
    if (!raw || typeof raw !== "object") {
      return emptyAnaliseSnap();
    }
    var snap = /** @type {Record<string, unknown>} */ (raw);
    if (Array.isArray(snap.messages) && snap.messages.length > 0) {
      var messages = snap.messages
        .filter(function (m) {
          return m && typeof m === "object";
        })
        .map(function (m) {
          var msg = /** @type {Record<string, unknown>} */ (m);
          return {
            id: typeof msg.id === "string" ? msg.id : newMessageId(),
            role: msg.role === "assistant" ? "assistant" : "user",
            content: String(msg.content || ""),
            createdAt:
              typeof msg.createdAt === "string"
                ? msg.createdAt
                : new Date().toISOString(),
            ...(msg.source ? { source: String(msg.source) } : {}),
          };
        });
      return Object.assign({}, snap, {
        messages: messages,
        prontuarioText: deriveProntuarioText(messages, snap),
        text: deriveAssistantText(messages, snap),
      });
    }

    var messages = [];
    var pront = snap.prontuarioText != null ? String(snap.prontuarioText) : "";
    var text = snap.text != null ? String(snap.text) : "";
    var evalObj =
      snap.evaluation && typeof snap.evaluation === "object"
        ? /** @type {Record<string, unknown>} */ (snap.evaluation)
        : null;
    var feedback =
      evalObj && evalObj.userFeedback != null
        ? String(evalObj.userFeedback).trim()
        : "";

    if (pront.trim()) {
      messages.push(
        createMessage(
          "user",
          pront,
          snap.prontuarioEditedByUser ? "manual" : "prefill",
          typeof snap.prontuarioUpdatedAt === "string"
            ? snap.prontuarioUpdatedAt
            : undefined,
        ),
      );
    }
    if (text.trim()) {
      messages.push(
        createMessage(
          "assistant",
          text,
          snap.editedByUser ? "manual" : "generated",
          typeof snap.generatedAt === "string" ? snap.generatedAt : undefined,
        ),
      );
    }
    if (feedback) {
      messages.push(
        createMessage(
          "user",
          feedback,
          "manual",
          typeof evalObj.userFeedbackAt === "string"
            ? evalObj.userFeedbackAt
            : undefined,
        ),
      );
    }

    return Object.assign({}, snap, {
      messages: messages,
      prontuarioText: pront,
      text: text,
      sourceFingerprint: String(snap.sourceFingerprint || ""),
    });
  }

  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @param {Record<string, unknown>} snap
   * @returns {string}
   */
  function deriveProntuarioText(messages, snap) {
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === "user") {
        return messages[i].content;
      }
    }
    return snap.prontuarioText != null ? String(snap.prontuarioText) : "";
  }

  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @param {Record<string, unknown>} snap
   * @returns {string}
   */
  function deriveAssistantText(messages, snap) {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return messages[i].content;
      }
    }
    return snap.text != null ? String(snap.text) : "";
  }

  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @returns {string}
   */
  function firstUserMessageContent(messages) {
    for (var i = 0; i < (messages || []).length; i++) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }

  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @returns {string}
   */
  function lastAssistantMessageContent(messages) {
    for (var i = (messages || []).length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }

  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @returns {string}
   */
  function lastUserMessageContent(messages) {
    for (var i = (messages || []).length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }

  /**
   * @param {object} snap
   * @returns {object}
   */
  function buildSaveSnap(snap) {
    var normalized = normalizeAnaliseSnap(snap);
    var messages = normalized.messages || [];
    var pront = firstUserMessageContent(messages);
    var text = lastAssistantMessageContent(messages);
    return Object.assign({}, normalized, {
      messages: messages,
      prontuarioText: pront,
      text: text,
      prontuarioUpdatedAt:
        normalized.prontuarioUpdatedAt || new Date().toISOString(),
    });
  }

  /**
   * @param {object} snap
   * @param {object} assistantMeta
   * @returns {object}
   */
  function appendAssistantMessage(snap, assistantMeta) {
    var normalized = normalizeAnaliseSnap(snap);
    var messages = (normalized.messages || []).slice();
    messages.push(
      createMessage(
        "assistant",
        assistantMeta.content,
        assistantMeta.source || "generated",
        assistantMeta.createdAt,
      ),
    );
    return buildSaveSnap(
      Object.assign({}, normalized, {
        messages: messages,
        generatedAt: assistantMeta.createdAt || new Date().toISOString(),
        model: assistantMeta.model,
        provider: assistantMeta.provider,
        sourceFingerprint:
          assistantMeta.sourceFingerprint || normalized.sourceFingerprint,
        revision: assistantMeta.revision,
        evaluation: assistantMeta.evaluation,
      }),
    );
  }

  /**
   * @param {object} snap
   * @param {string} content
   * @param {string} [source]
   * @returns {object}
   */
  function appendUserMessage(snap, content, source) {
    var normalized = normalizeAnaliseSnap(snap);
    var messages = (normalized.messages || []).slice();
    messages.push(createMessage("user", content, source || "manual"));
    return buildSaveSnap(
      Object.assign({}, normalized, {
        messages: messages,
        prontuarioUpdatedAt: new Date().toISOString(),
      }),
    );
  }

  /**
   * Infer mode from messages for API call.
   * @param {Array<{ role: string }>} messages
   * @returns {"draft" | "revise" | "continue"}
   */
  function inferGenerateMode(messages) {
    var list = messages || [];
    if (list.length === 0) return "draft";
    var last = list[list.length - 1];
    if (last.role === "user") {
      var hasAssistant = list.some(function (m) {
        return m.role === "assistant";
      });
      if (!hasAssistant) return "draft";
      var assistantCount = list.filter(function (m) {
        return m.role === "assistant";
      }).length;
      var userCount = list.filter(function (m) {
        return m.role === "user";
      }).length;
      if (userCount === assistantCount) return "continue";
      return "revise";
    }
    return "continue";
  }

  return {
    newMessageId: newMessageId,
    createMessage: createMessage,
    emptyAnaliseSnap: emptyAnaliseSnap,
    normalizeAnaliseSnap: normalizeAnaliseSnap,
    buildSaveSnap: buildSaveSnap,
    appendAssistantMessage: appendAssistantMessage,
    appendUserMessage: appendUserMessage,
    firstUserMessageContent: firstUserMessageContent,
    lastAssistantMessageContent: lastAssistantMessageContent,
    lastUserMessageContent: lastUserMessageContent,
    inferGenerateMode: inferGenerateMode,
  };
});
