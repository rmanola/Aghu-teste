/**
 * Manutenção de placeholders em campos editáveis do preview (data-alta-field / data-rx-field).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPreviewEditable = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var EMPTY_PLACEHOLDER = "\u00a0";
  var PLACEHOLDER_CHAR_RE = /[\u00a0\u200b\ufeff]/g;
  var FIELD_SELECTOR = "[data-alta-field],[data-rx-field]";

  function stripEditablePlaceholder(raw) {
    if (raw == null) return "";
    var text = String(raw).replace(PLACEHOLDER_CHAR_RE, " ");
    if (!text.trim()) return "";
    return text;
  }

  function isFieldVisuallyEmpty(node) {
    if (!node) return true;
    return !stripEditablePlaceholder(node.textContent || "");
  }

  function placeCaretAtEnd(doc, node) {
    if (!doc || !node) return;
    var sel = doc.getSelection && doc.getSelection();
    if (!sel) return;
    var range = doc.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function ensureFieldPlaceholder(node, doc) {
    if (!node) return;
    if (isFieldVisuallyEmpty(node)) {
      node.textContent = EMPTY_PLACEHOLDER;
      node.classList.add("alta-editable-empty");
      if (doc) placeCaretAtEnd(doc, node);
    }
  }

  function normalizeFieldAfterEdit(node) {
    if (!node) return;
    if (isFieldVisuallyEmpty(node)) {
      node.textContent = EMPTY_PLACEHOLDER;
      node.classList.add("alta-editable-empty");
      return;
    }
    node.classList.remove("alta-editable-empty");
  }

  function eventTargetToElement(target) {
    if (!target) return null;
    if (target.nodeType === 3) return target.parentElement;
    return target;
  }

  function resolveField(target) {
    var el = eventTargetToElement(target);
    if (!el || typeof el.closest !== "function") return null;
    return el.closest(FIELD_SELECTOR);
  }

  function resolveRxVia(target) {
    var el = eventTargetToElement(target);
    if (!el || typeof el.closest !== "function") return null;
    return el.closest(".rx-block, .rx-half");
  }

  function resolveFieldFromEvent(doc, event) {
    var field = resolveField(event.target);
    if (field) return field;
    var sel = doc.getSelection && doc.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var el = eventTargetToElement(sel.anchorNode);
    if (!el || typeof el.closest !== "function") return null;
    return el.closest(FIELD_SELECTOR);
  }

  function resolveRxViaFromEvent(doc, event) {
    var via = resolveRxVia(event.target);
    if (via) return via;
    var sel = doc.getSelection && doc.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var el = eventTargetToElement(sel.anchorNode);
    if (!el || typeof el.closest !== "function") return null;
    return el.closest(".rx-block, .rx-half");
  }

  function loadReceitaPreviewSync() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-preview-sync.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPreviewSync;
  }

  function getReceitaPreviewSync(injected) {
    if (
      injected &&
      typeof injected.mirrorRxFieldSiblings === "function"
    ) {
      return injected;
    }
    return loadReceitaPreviewSync();
  }

  function mirrorRxFieldIfNeeded(doc, field, sync) {
    if (!field || !field.hasAttribute || !field.hasAttribute("data-rx-field")) return;
    var mod = getReceitaPreviewSync(sync);
    if (mod && typeof mod.mirrorRxFieldSiblings === "function") {
      mod.mirrorRxFieldSiblings(doc, field);
    }
  }

  function mirrorRxViaElement(doc, via, sync) {
    if (!via) return;
    var mod = getReceitaPreviewSync(sync);
    if (mod && typeof mod.mirrorRxViaSiblings === "function") {
      mod.mirrorRxViaSiblings(doc, via);
    }
  }

  function mirrorRxViaIfNeeded(doc, target, sync) {
    mirrorRxViaElement(doc, resolveRxVia(target), sync);
  }

  function handleEditableMirror(doc, event, sync) {
    var field = resolveFieldFromEvent(doc, event);
    if (field) {
      normalizeFieldAfterEdit(field);
      mirrorRxFieldIfNeeded(doc, field, sync);
      mirrorRxViaIfNeeded(doc, field, sync);
      return;
    }
    var via = resolveRxViaFromEvent(doc, event);
    if (via) mirrorRxViaElement(doc, via, sync);
  }

  /**
   * @param {Document} doc
   * @param {ParentNode} root
   * @param {{ receitaPreviewSync?: object }} [options]
   * @returns {() => void}
   */
  function bindEditableFieldMaintenance(doc, root, options) {
    if (!doc || !root || typeof root.addEventListener !== "function") {
      return function noop() {};
    }

    var sync = options && options.receitaPreviewSync;

    function onFocusIn(event) {
      var field = resolveFieldFromEvent(doc, event);
      if (field) ensureFieldPlaceholder(field, doc);
    }

    function onInput(event) {
      handleEditableMirror(doc, event, sync);
    }

    function onBlur(event) {
      handleEditableMirror(doc, event, sync);
    }

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("input", onInput);
    root.addEventListener("blur", onBlur, true);

    return function unbind() {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("input", onInput);
      root.removeEventListener("blur", onBlur, true);
    };
  }

  return {
    EMPTY_PLACEHOLDER: EMPTY_PLACEHOLDER,
    stripEditablePlaceholder: stripEditablePlaceholder,
    isFieldVisuallyEmpty: isFieldVisuallyEmpty,
    ensureFieldPlaceholder: ensureFieldPlaceholder,
    normalizeFieldAfterEdit: normalizeFieldAfterEdit,
    bindEditableFieldMaintenance: bindEditableFieldMaintenance,
  };
});
