/**
 * Sync preview Documento do passômetro → patch de campos no snap.
 * Extrai [data-pm-field] (+ data-pm-section, data-pm-entry-idx).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroPreviewSync = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getFieldLimits() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-field-limits.js");
      } catch (_e) {}
    }
    return typeof globalThis !== "undefined"
      ? globalThis.AghuPassometroFieldLimits
      : null;
  }

  function getTemplate() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-template.js");
      } catch (_e) {}
    }
    return typeof globalThis !== "undefined"
      ? globalThis.AghuPassometroTemplate
      : null;
  }

  function readEditableText(el) {
    if (!el) return "";
    var text = el.innerText != null ? el.innerText : el.textContent || "";
    return String(text).replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  }

  function extractPreviewFieldChanges(root) {
    var out = [];
    if (!root || typeof root.querySelectorAll !== "function") return out;
    var nodes = root.querySelectorAll("[data-pm-field]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var fieldKey = el.getAttribute("data-pm-field");
      if (!fieldKey) continue;
      var section = el.getAttribute("data-pm-section") || "entry";
      var entryIdxRaw = el.getAttribute("data-pm-entry-idx");
      var entryIdx =
        entryIdxRaw != null && entryIdxRaw !== ""
          ? Number(entryIdxRaw)
          : null;
      if (entryIdx != null && !Number.isFinite(entryIdx)) entryIdx = null;
      out.push({
        section: section === "header" ? "header" : "entry",
        fieldKey: String(fieldKey),
        entryIdx: entryIdx,
        value: readEditableText(el),
      });
    }
    return out;
  }

  function applyPreviewChangesToSnap(snap, changes, template) {
    if (!snap || typeof snap !== "object") return snap;
    var limits = getFieldLimits();
    var tplMod = getTemplate();
    var next = JSON.parse(JSON.stringify(snap));
    if (!next.header || typeof next.header !== "object") next.header = {};
    if (!Array.isArray(next.entries)) next.entries = [];

    var list = Array.isArray(changes) ? changes : [];
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      if (!ch || !ch.fieldKey) continue;
      var value = ch.value == null ? "" : String(ch.value);
      if (limits && typeof limits.clampFieldValue === "function") {
        value = limits.clampFieldValue(ch.fieldKey, value);
      }

      if (ch.section === "header") {
        if (tplMod && typeof tplMod.setFieldValue === "function") {
          var headerDef = {
            key: ch.fieldKey,
            section: "header",
            kind:
              String(ch.fieldKey).indexOf("custom") === 0
                ? "custom"
                : "builtin",
          };
          var patched = tplMod.setFieldValue(
            { header: next.header, entry: null },
            headerDef,
            value,
          );
          next.header = patched.header || next.header;
        } else {
          next.header[ch.fieldKey] = value;
        }
        continue;
      }

      var idx = ch.entryIdx;
      if (idx == null || idx < 0 || idx >= next.entries.length) continue;
      var entry = next.entries[idx] || {};
      if (tplMod && typeof tplMod.setFieldValue === "function") {
        var entryDef = {
          key: ch.fieldKey,
          section: "entry",
          kind:
            String(ch.fieldKey).indexOf("custom") === 0 ? "custom" : "builtin",
        };
        var patchedEntry = tplMod.setFieldValue(
          { header: next.header, entry: entry },
          entryDef,
          value,
        );
        next.entries[idx] = patchedEntry.entry || entry;
      } else {
        entry[ch.fieldKey] = value;
        next.entries[idx] = entry;
      }
    }

    void template;
    return next;
  }

  function bindEditablePreviewFields(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    var nodes = root.querySelectorAll("[data-pm-field]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "true");
    }
  }

  return {
    extractPreviewFieldChanges: extractPreviewFieldChanges,
    applyPreviewChangesToSnap: applyPreviewChangesToSnap,
    bindEditablePreviewFields: bindEditablePreviewFields,
    readEditableText: readEditableText,
  };
});
