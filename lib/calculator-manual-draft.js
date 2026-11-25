/**
 * Rascunho manual de calculadoras (localStorage).
 * @sync web/lib/patient-records/calculator-draft-merge.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuCalculatorManualDraft = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_PREFIX = "aghu-calc-draft:";

  function parseManualDecimal(raw) {
    var t = String(raw != null ? raw : "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    if (!t) return null;
    var n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function parseManualAge(raw) {
    var t = String(raw != null ? raw : "").trim();
    if (!t) return null;
    var n = parseInt(t, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveDecimalFromDraft(draft, key, suggested) {
    if (
      draft &&
      draft["touched_" + key] &&
      draft[key] != null &&
      String(draft[key]).trim() !== ""
    ) {
      return parseManualDecimal(draft[key]);
    }
    if (suggested != null && Number.isFinite(suggested)) return suggested;
    return null;
  }

  function resolveSelectFromDraft(draft, key, suggested) {
    if (draft && draft["touched_" + key]) {
      return String(draft[key] != null ? draft[key] : "");
    }
    if (suggested != null && suggested !== "") return String(suggested);
    return "";
  }

  function resolveBoolFromDraft(draft, key, defaultValue) {
    defaultValue = defaultValue === true;
    if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
      return !!draft[key];
    }
    return defaultValue;
  }

  function draftKey(calcId, patientKey) {
    return STORAGE_PREFIX + String(calcId || "") + ":" + String(patientKey || "");
  }

  function loadDraft(calcId, patientKey) {
    if (typeof localStorage === "undefined") return {};
    try {
      var raw = localStorage.getItem(draftKey(calcId, patientKey));
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function saveDraft(calcId, patientKey, draft) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        draftKey(calcId, patientKey),
        JSON.stringify(draft || {}),
      );
    } catch (_e) {
      /* quota / private mode */
    }
  }

  function patchDraft(calcId, patientKey, patch) {
    var next = loadDraft(calcId, patientKey);
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        next[k] = patch[k];
      }
    }
    saveDraft(calcId, patientKey, next);
    return next;
  }

  return {
    parseManualDecimal: parseManualDecimal,
    parseManualAge: parseManualAge,
    resolveDecimalFromDraft: resolveDecimalFromDraft,
    resolveSelectFromDraft: resolveSelectFromDraft,
    resolveBoolFromDraft: resolveBoolFromDraft,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    patchDraft: patchDraft,
  };
});
