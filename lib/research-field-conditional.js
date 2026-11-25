/**
 * Condicionais de visibilidade de campos Research custom (intra-form).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchFieldConditional = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VALID_OPS = ["eq", "neq", "yes", "no", "empty", "notEmpty"];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function fold(s) {
    return str(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isYes(v) {
    var s = fold(v);
    return s === "sim" || s === "true" || v === true;
  }

  function isNo(v) {
    var s = fold(v);
    return s === "nao" || s === "não" || s === "false" || v === false;
  }

  function isEmptyValue(v) {
    if (v == null) return true;
    if (typeof v === "boolean") return false;
    return str(v) === "";
  }

  function normalizeVisibleWhen(raw) {
    if (!raw || typeof raw !== "object") return null;
    var fieldKey = str(raw.fieldKey);
    var op = str(raw.op);
    if (!fieldKey || VALID_OPS.indexOf(op) === -1) return null;
    var out = { fieldKey: fieldKey, op: op };
    if (raw.value != null && str(raw.value) !== "") out.value = str(raw.value);
    return out;
  }

  function evaluateVisibleWhen(values, rule) {
    if (!rule) return true;
    var triggerVal = values ? values[rule.fieldKey] : undefined;
    var op = rule.op;
    if (op === "eq") return fold(triggerVal) === fold(rule.value);
    if (op === "neq") return fold(triggerVal) !== fold(rule.value);
    if (op === "yes") return isYes(triggerVal);
    if (op === "no") return isNo(triggerVal);
    if (op === "empty") return isEmptyValue(triggerVal);
    if (op === "notEmpty") return !isEmptyValue(triggerVal);
    return true;
  }

  function isFieldVisible(field, values) {
    if (!field || !field.visibleWhen) return true;
    return evaluateVisibleWhen(values || {}, field.visibleWhen);
  }

  function fieldsToClearOnChange(form, changedFieldKey, values) {
    if (!form || !Array.isArray(form.fields)) return null;
    values = values || {};
    var clears = {};
    var changed = false;
    for (var i = 0; i < form.fields.length; i++) {
      var field = form.fields[i];
      if (!field.visibleWhen) continue;
      if (field.visibleWhen.fieldKey !== changedFieldKey) continue;
      if (field.clearWhenHidden === false) continue;
      if (isFieldVisible(field, values)) continue;
      if (values[field.key] != null && str(values[field.key]) !== "") {
        clears[field.key] = "";
        changed = true;
      }
    }
    return changed ? clears : null;
  }

  function validateConditionalGraph(form) {
    var errors = [];
    if (!form || !Array.isArray(form.fields)) {
      return { ok: true, errors: errors };
    }
    var keys = {};
    for (var i = 0; i < form.fields.length; i++) {
      keys[form.fields[i].key] = form.fields[i];
    }
    var ruleCount = 0;
    for (var j = 0; j < form.fields.length; j++) {
      var field = form.fields[j];
      if (!field.visibleWhen) continue;
      ruleCount++;
      if (ruleCount > 20) {
        errors.push("máximo de 20 regras condicionais por formulário");
        break;
      }
      if (!keys[field.visibleWhen.fieldKey]) {
        errors.push(
          "campo condicional referencia gatilho inexistente: " +
            field.key +
            " -> " +
            field.visibleWhen.fieldKey,
        );
      }
      var trigger = keys[field.visibleWhen.fieldKey];
      if (trigger && trigger.type === "computed") {
        errors.push("gatilho condicional não pode ser computed: " + field.visibleWhen.fieldKey);
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  return {
    VALID_OPS: VALID_OPS,
    normalizeVisibleWhen: normalizeVisibleWhen,
    evaluateVisibleWhen: evaluateVisibleWhen,
    isFieldVisible: isFieldVisible,
    fieldsToClearOnChange: fieldsToClearOnChange,
    validateConditionalGraph: validateConditionalGraph,
  };
});
