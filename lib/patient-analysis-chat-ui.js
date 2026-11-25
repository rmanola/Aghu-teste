/**
 * Helpers DOM para thread de chat na extensão (aba Análise).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisChatUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function copyApi() {
    return root.AghuCopyTextUpperCaseBr;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createCopyIconSvg() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    var rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", "9");
    rect.setAttribute("y", "9");
    rect.setAttribute("width", "13");
    rect.setAttribute("height", "13");
    rect.setAttribute("rx", "2");
    var path = document.createElementNS(NS, "path");
    path.setAttribute(
      "d",
      "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    );
    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  /**
   * @param {HTMLElement} container
   * @param {Array<{ id?: string, role: string, content: string }>} messages
   * @param {{ loading?: boolean, onEdit?: function(string, string): void }} opts
   */
  function renderThread(container, messages, opts) {
    opts = opts || {};
    if (!container) return;
    container.replaceChildren();
    var list = messages || [];
    if (!list.length && !opts.loading) {
      var empty = document.createElement("p");
      empty.className = "analise-chat-empty";
      empty.textContent =
        "Cole evolução ou notas e envie para gerar a análise.";
      container.appendChild(empty);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      container.appendChild(renderBubble(list[i], opts.onEdit));
    }
    if (opts.loading) {
      var loading = document.createElement("div");
      loading.className = "analise-message analise-message-assistant analise-message-loading";
      loading.textContent = "A gerar…";
      container.appendChild(loading);
    }
    container.scrollTop = container.scrollHeight;
  }

  /**
   * @param {{ id?: string, role: string, content: string }} message
   * @param {function(string, string): void} [onEdit]
   * @returns {HTMLElement}
   */
  function renderBubble(message, onEdit) {
    var isUser = message.role === "user";
    var wrap = document.createElement("div");
    wrap.className =
      "analise-message " +
      (isUser ? "analise-message-user" : "analise-message-assistant");
    wrap.dataset.messageId = message.id || "";

    var bubble = document.createElement("div");
    bubble.className = "analise-message-bubble";

    var actions = document.createElement("div");
    actions.className = "analise-message-actions";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "analise-message-copy";
    copyBtn.setAttribute("aria-label", "Copiar");
    copyBtn.title = "Copiar";
    copyBtn.appendChild(createCopyIconSvg());
    copyBtn.addEventListener("click", function () {
      void handleCopy(message.content, copyBtn);
    });
    actions.appendChild(copyBtn);

    if (!isUser && onEdit) {
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "analise-message-edit";
      editBtn.setAttribute("aria-label", "Editar");
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", function () {
        startInlineEdit(bubble, message, onEdit);
      });
      actions.appendChild(editBtn);
    }

    var body = document.createElement("p");
    body.className = "analise-message-text";
    body.textContent = message.content || "";

    bubble.appendChild(actions);
    bubble.appendChild(body);
    wrap.appendChild(bubble);
    return wrap;
  }

  function startInlineEdit(bubble, message, onEdit) {
    var existing = bubble.querySelector("textarea");
    if (existing) return;
    var textEl = bubble.querySelector(".analise-message-text");
    if (!textEl) return;
    var ta = document.createElement("textarea");
    ta.className = "analise-message-edit-area";
    ta.value = message.content || "";
    textEl.replaceWith(ta);
    ta.focus();
    ta.addEventListener("blur", function () {
      var next = ta.value;
      var p = document.createElement("p");
      p.className = "analise-message-text";
      p.textContent = next;
      ta.replaceWith(p);
      if (onEdit && message.id && next !== message.content) {
        onEdit(message.id, next);
      }
    });
  }

  async function handleCopy(content, btn) {
    var api = copyApi();
    var ok = false;
    if (api && api.copyTextUpperCaseBr) {
      ok = await api.copyTextUpperCaseBr(content);
    } else {
      try {
        await navigator.clipboard.writeText(
          String(content || "").toLocaleUpperCase("pt-BR"),
        );
        ok = true;
      } catch (_e) {}
    }
    if (ok && btn) {
      btn.title = "Copiado";
      window.setTimeout(function () {
        btn.title = "Copiar";
      }, 2000);
    }
  }

  return {
    renderThread: renderThread,
    renderBubble: renderBubble,
  };
});
