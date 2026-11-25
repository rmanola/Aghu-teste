/**
 * Comandos rich-text para preview editável (execCommand + atalhos estilo Docs).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPreviewRichText = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RICH_TEXT_COMMANDS = {
    bold: true,
    italic: true,
    underline: true,
    insertUnorderedList: true,
    insertOrderedList: true,
    undo: true,
    redo: true,
    removeFormat: true,
  };

  function isModifierKey(event) {
    return !!(event && (event.ctrlKey || event.metaKey));
  }

  function isEditableTarget(target) {
    if (!target || typeof target.tagName !== "string") return true;
    var tag = target.tagName.toLowerCase();
    return tag !== "input" && tag !== "textarea" && tag !== "select";
  }

  /**
   * @param {KeyboardEvent|{ key?: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, target?: EventTarget|null }} event
   * @returns {string|null}
   */
  function matchRichTextShortcut(event) {
    if (!event || !isModifierKey(event)) return null;
    if (!isEditableTarget(event.target)) return null;

    var key = String(event.key || "").toLowerCase();
    var shift = !!event.shiftKey;

    if (!shift && key === "b") return "bold";
    if (!shift && key === "i") return "italic";
    if (!shift && key === "u") return "underline";
    if (shift && (key === "8" || key === "*")) return "insertUnorderedList";
    if (shift && key === "7") return "insertOrderedList";
    if (!shift && key === "z") return "undo";
    if ((!shift && key === "y") || (shift && key === "z")) return "redo";

    return null;
  }

  /**
   * @param {Document|null|undefined} doc
   * @param {string} command
   * @returns {{ ok: boolean, command: string }}
   */
  function applyRichTextCommand(doc, command) {
    if (!doc || typeof doc.execCommand !== "function") {
      return { ok: false, command: command };
    }
    if (!RICH_TEXT_COMMANDS[command]) {
      return { ok: false, command: command };
    }
    var ok = false;
    try {
      ok = doc.execCommand(command, false, null);
    } catch (_e) {
      ok = false;
    }
    return { ok: ok, command: command };
  }

  /**
   * @param {Document|null|undefined} doc
   * @param {string} command
   * @returns {boolean}
   */
  function queryRichTextState(doc, command) {
    if (!doc || typeof doc.queryCommandState !== "function") return false;
    if (!RICH_TEXT_COMMANDS[command]) return false;
    try {
      return !!doc.queryCommandState(command);
    } catch (_e) {
      return false;
    }
  }

  function getPreviousLeaf(node) {
    if (!node) return null;
    if (node.previousSibling) {
      node = node.previousSibling;
      while (node && node.lastChild) node = node.lastChild;
      return node;
    }
    if (node.parentNode) return getPreviousLeaf(node.parentNode);
    return null;
  }

  function resolveCursorPoint(range) {
    if (!range) return null;
    var node = range.startContainer;
    var offset = range.startOffset;
    if (node.nodeType === 3) return { node: node, offset: offset };
    if (node.nodeType === 1 && offset > 0) {
      var child = node.childNodes[offset - 1];
      while (child && child.nodeType === 1 && child.lastChild) {
        child = child.lastChild;
      }
      if (child && child.nodeType === 3) {
        return { node: child, offset: child.textContent.length };
      }
    }
    return { node: node, offset: offset };
  }

  function normalizeLinePrefix(prefix) {
    return String(prefix || "")
      .replace(/[\u00a0\u200b\ufeff]/g, "")
      .trim();
  }

  function isBlockContainer(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = node.tagName.toLowerCase();
    return (
      tag === "div" ||
      tag === "p" ||
      tag === "li" ||
      tag === "section" ||
      tag === "article" ||
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3" ||
      tag === "h4" ||
      tag === "h5" ||
      tag === "h6"
    );
  }

  function isLineBreakElement(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.tagName.toLowerCase() === "br";
  }

  function getLinePrefixWithModify(doc, sel) {
    if (!sel || typeof sel.modify !== "function") return null;
    var saved = sel.getRangeAt(0).cloneRange();
    try {
      sel.modify("extend", "backward", "line");
      var line = sel.toString();
      sel.removeAllRanges();
      sel.addRange(saved);
      var nl = line.lastIndexOf("\n");
      if (nl >= 0) line = line.slice(nl + 1);
      return normalizeLinePrefix(line);
    } catch (_e) {
      sel.removeAllRanges();
      sel.addRange(saved);
      return null;
    }
  }

  function getPreviousLogicalNode(node) {
    if (!node) return null;
    if (node.previousSibling) {
      var sibling = node.previousSibling;
      if (isLineBreakElement(sibling)) return { kind: "br" };
      while (sibling.lastChild) sibling = sibling.lastChild;
      if (isLineBreakElement(sibling)) return { kind: "br" };
      if (sibling.nodeType === 3) {
        return {
          kind: "text",
          node: sibling,
          offset: sibling.textContent.length,
        };
      }
      if (sibling.nodeType === 1) {
        return { kind: "element", node: sibling };
      }
      return null;
    }
    var parent = node.parentNode;
    if (!parent) return null;
    if (isBlockContainer(parent) && !node.previousSibling) {
      return { kind: "block" };
    }
    return getPreviousLogicalNode(parent);
  }

  function getLinePrefixManual(doc, range) {
    var point = resolveCursorPoint(range);
    if (!point) return "";
    var chars = [];
    var node = point.node;
    var offset = point.offset;

    function readBackInText(textNode, endOffset) {
      for (var i = endOffset - 1; i >= 0; i--) {
        var ch = textNode.textContent.charAt(i);
        if (ch === "\n") return true;
        chars.unshift(ch);
      }
      return false;
    }

    if (node.nodeType === 3) {
      if (readBackInText(node, offset)) return normalizeLinePrefix(chars.join(""));
    } else if (node.nodeType === 1 && offset > 0) {
      var child = node.childNodes[offset - 1];
      while (child && child.nodeType === 1 && child.lastChild) {
        child = child.lastChild;
      }
      if (child && child.nodeType === 3) {
        if (readBackInText(child, child.textContent.length)) {
          return normalizeLinePrefix(chars.join(""));
        }
        node = child;
        offset = child.textContent.length;
      } else if (child && isLineBreakElement(child)) {
        return normalizeLinePrefix(chars.join(""));
      } else {
        return normalizeLinePrefix(chars.join(""));
      }
    } else {
      return normalizeLinePrefix(chars.join(""));
    }

    while (true) {
      var prev = getPreviousLogicalNode(node);
      if (!prev) break;
      if (prev.kind === "br" || prev.kind === "block") {
        return normalizeLinePrefix(chars.join(""));
      }
      if (prev.kind === "text") {
        if (readBackInText(prev.node, prev.offset)) {
          return normalizeLinePrefix(chars.join(""));
        }
        node = prev.node;
        continue;
      }
      if (prev.kind === "element") {
        node = prev.node;
        continue;
      }
      break;
    }
    return normalizeLinePrefix(chars.join(""));
  }

  /**
   * @param {Document|null|undefined} doc
   * @returns {string|null}
   */
  function getLinePrefixBeforeCursor(doc) {
    if (!doc || typeof doc.getSelection !== "function") return null;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;

    var withModify = getLinePrefixWithModify(doc, sel);
    if (withModify != null) return withModify;

    return getLinePrefixManual(doc, sel.getRangeAt(0));
  }

  function isNodeContentEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
      return true;
    }
    return false;
  }

  /**
   * @param {Document|null|undefined} doc
   * @returns {boolean}
   */
  function canApplyListMarkdown(doc) {
    if (!doc || typeof doc.getSelection !== "function") return false;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    var node = sel.anchorNode;
    if (!node) return false;
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (isNodeContentEditable(el)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function deletePrefixBeforeCursor(doc, length) {
    if (!length) return true;
    if (!doc || typeof doc.getSelection !== "function") return false;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;

    var range = sel.getRangeAt(0);
    var endPoint = resolveCursorPoint(range);
    if (!endPoint) return false;
    var endNode = endPoint.node;
    var endOffset = endPoint.offset;
    var startNode = endNode;
    var startOffset = endOffset;
    var remaining = length;

    while (remaining > 0) {
      if (startNode.nodeType === 3) {
        var take = Math.min(startOffset, remaining);
        startOffset -= take;
        remaining -= take;
        if (remaining === 0) break;
      }
      var prev = getPreviousLeaf(startNode);
      if (!prev) return false;
      startNode = prev;
      startOffset =
        startNode.nodeType === 3
          ? startNode.textContent.length
          : startNode.childNodes.length;
    }

    var delRange = doc.createRange();
    delRange.setStart(startNode, startOffset);
    delRange.setEnd(endNode, endOffset);
    delRange.deleteContents();
    sel.removeAllRanges();
    sel.addRange(delRange);
    delRange.collapse(false);
    return true;
  }

  function ensureListHost(doc) {
    if (!doc || typeof doc.getSelection !== "function") return;
    var sel = doc.getSelection();
    if (!sel || !sel.anchorNode) return;
    var el =
      sel.anchorNode.nodeType === 1
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
    while (el) {
      if (
        el.getAttribute &&
        (el.getAttribute("data-alta-field") || el.getAttribute("data-rx-field"))
      ) {
        el.classList.add("alta-editable-list-host");
        return;
      }
      el = el.parentElement;
    }
  }

  function isSpaceTrigger(event) {
    if (!event || event.defaultPrevented) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.type === "beforeinput") {
      return event.inputType === "insertText" && event.data === " ";
    }
    var key = String(event.key || "");
    return key === " " || key === "Spacebar" || event.code === "Space";
  }

  function matchListMarkdownPrefix(prefix) {
    var normalized = normalizeLinePrefix(prefix);
    if (normalized === "*") {
      return { command: "insertUnorderedList", deleteLen: 1 };
    }
    var numbered = normalized.match(/^(\d+)\.$/);
    if (numbered) {
      return {
        command: "insertOrderedList",
        deleteLen: numbered[0].length,
      };
    }
    return null;
  }

  function isInList(doc) {
    if (!doc || typeof doc.getSelection !== "function") return false;
    var sel = doc.getSelection();
    if (!sel || !sel.anchorNode) return false;
    var el =
      sel.anchorNode.nodeType === 1
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
    while (el) {
      var tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (tag === "ul" || tag === "ol" || tag === "li") return true;
      el = el.parentElement;
    }
    return false;
  }

  function findCaretBlock(doc) {
    if (!doc || typeof doc.getSelection !== "function") return null;
    var sel = doc.getSelection();
    if (!sel || !sel.anchorNode) return null;
    var el =
      sel.anchorNode.nodeType === 1
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
    while (el) {
      var tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (
        tag === "div" ||
        tag === "p" ||
        tag === "li" ||
        tag === "section" ||
        tag === "article"
      ) {
        return el;
      }
      if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function ensureWritableCaret(doc) {
    if (!doc || typeof doc.getSelection !== "function") return;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    var block = findCaretBlock(doc);
    if (!block) return;
    var stripped = (block.textContent || "")
      .replace(/[\u00a0\u200b\ufeff]/g, "")
      .trim();
    if (!stripped && !block.querySelector("br")) {
      block.innerHTML = "<br>";
      var br = block.querySelector("br");
      if (!br) return;
      var range = doc.createRange();
      range.setStartBefore(br);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function applyListCommand(doc, command) {
    if (!doc || typeof doc.execCommand !== "function") return false;
    ensureListHost(doc);
    ensureWritableCaret(doc);
    var ordered = command === "insertOrderedList";
    var tag = ordered ? "ol" : "ul";
    var ok = false;
    try {
      ok = !!doc.execCommand(command, false, null);
    } catch (_e) {
      ok = false;
    }
    if (ok && isInList(doc)) return true;
    ensureWritableCaret(doc);
    try {
      return !!doc.execCommand(
        "insertHTML",
        false,
        "<" + tag + "><li><br></li></" + tag + ">",
      );
    } catch (_e2) {
      return false;
    }
  }

  /**
   * @param {Document|null|undefined} doc
   * @param {KeyboardEvent|InputEvent|{ key?: string, type?: string, inputType?: string, data?: string, defaultPrevented?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, code?: string, preventDefault?: () => void }} event
   * @returns {boolean}
   */
  function tryApplyListMarkdownOnSpace(doc, event) {
    if (!doc || !event) return false;
    if (!isSpaceTrigger(event)) return false;
    if (!canApplyListMarkdown(doc)) return false;

    var prefix = getLinePrefixBeforeCursor(doc);
    if (prefix == null) return false;

    var match = matchListMarkdownPrefix(prefix);
    if (!match) return false;

    if (typeof event.preventDefault === "function") event.preventDefault();
    if (!deletePrefixBeforeCursor(doc, match.deleteLen)) return false;
    return applyListCommand(doc, match.command);
  }

  return {
    RICH_TEXT_COMMANDS: RICH_TEXT_COMMANDS,
    matchRichTextShortcut: matchRichTextShortcut,
    applyRichTextCommand: applyRichTextCommand,
    queryRichTextState: queryRichTextState,
    getLinePrefixBeforeCursor: getLinePrefixBeforeCursor,
    canApplyListMarkdown: canApplyListMarkdown,
    tryApplyListMarkdownOnSpace: tryApplyListMarkdownOnSpace,
  };
});
