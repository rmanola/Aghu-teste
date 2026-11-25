/**
 * Visibilidade de campos HPB por módulo (regras além dos submódulos cirúrgicos).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbFieldConditional = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isTruthyYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function normToken(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function matchesWhenValues(data, whenField, whenValues) {
    var actual = normToken(data[whenField]);
    for (var i = 0; i < whenValues.length; i++) {
      if (actual === normToken(whenValues[i])) return true;
    }
    return false;
  }

  /** @type {Array<{ moduleId: string, fieldKey: string, whenField: string, requireYes?: boolean, whenValues?: string[], clearWhenHidden?: boolean }>} */
  var FIELD_APPLICABILITY = [
    {
      moduleId: "robotic",
      fieldKey: "conversionReason",
      whenField: "conversao",
      requireYes: true,
      clearWhenHidden: true,
    },
    {
      moduleId: "followup",
      fieldKey: "deathDate",
      whenField: "vitalStatus",
      whenValues: ["Óbito"],
      clearWhenHidden: true,
    },
    {
      moduleId: "followup",
      fieldKey: "deathCause",
      whenField: "vitalStatus",
      whenValues: ["Óbito"],
      clearWhenHidden: true,
    },
  ];

  function findRule(moduleId, fieldKey) {
    for (var i = 0; i < FIELD_APPLICABILITY.length; i++) {
      var r = FIELD_APPLICABILITY[i];
      if (r.moduleId === moduleId && r.fieldKey === fieldKey) return r;
    }
    return null;
  }

  function isFieldApplicable(moduleId, fieldKey, data) {
    if (!moduleId || !fieldKey) return true;
    var rule = findRule(moduleId, fieldKey);
    if (!rule) return true;
    data = data && typeof data === "object" ? data : {};
    if (rule.whenValues && rule.whenValues.length) {
      return matchesWhenValues(data, rule.whenField, rule.whenValues);
    }
    if (rule.requireYes) return isTruthyYes(data[rule.whenField]);
    return true;
  }

  /** Limpa dependentes quando o campo-gatilho deixa de satisfazer a regra. */
  function fieldsToClearOnChange(moduleId, changedFieldKey, data) {
    if (!moduleId || !changedFieldKey) return null;
    var out = null;
    for (var i = 0; i < FIELD_APPLICABILITY.length; i++) {
      var r = FIELD_APPLICABILITY[i];
      if (r.moduleId !== moduleId || r.whenField !== changedFieldKey || !r.clearWhenHidden) {
        continue;
      }
      if (!isFieldApplicable(moduleId, r.fieldKey, data)) {
        if (!out) out = {};
        out[r.fieldKey] = "";
      }
    }
    return out;
  }

  return {
    FIELD_APPLICABILITY: FIELD_APPLICABILITY,
    fieldsToClearOnChange: fieldsToClearOnChange,
    isFieldApplicable: isFieldApplicable,
    isTruthyYes: isTruthyYes,
  };
});
