/**
 * Paths canónicos formId.fieldKey para critérios em protocolos custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchProtocolFieldPaths = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VALID_OPS = [
    "eq",
    "ne",
    "contains",
    "in",
    "notIn",
    "gte",
    "lte",
    "isYes",
    "isNo",
    "isEmpty",
    "isNotEmpty",
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function parseFieldPath(path) {
    var s = str(path);
    if (!s) return null;
    var dot = s.indexOf(".");
    if (dot <= 0 || dot >= s.length - 1) return null;
    return {
      formId: s.slice(0, dot),
      fieldKey: s.slice(dot + 1),
    };
  }

  function buildFieldPaths(protocolSchema) {
    var out = [];
    if (!protocolSchema || !Array.isArray(protocolSchema.forms)) return out;
    for (var i = 0; i < protocolSchema.forms.length; i++) {
      var form = protocolSchema.forms[i];
      var fields = form.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        out.push({
          path: form.id + "." + field.key,
          label: form.label + " — " + field.label,
          formId: form.id,
          fieldKey: field.key,
          type: field.type,
        });
        // Paths aghu.{catalogKey} espúrios não entram aqui — screening usa
        // lib/aghu-protocol-field-paths.js (hub root); CRF fica pós-inscrição.
      }
    }
    return out;
  }

  function findFieldPath(protocolSchema, path) {
    var parsed = parseFieldPath(path);
    if (!parsed || !protocolSchema) return null;
    var form = (protocolSchema.forms || []).find(function (f) {
      return f.id === parsed.formId;
    });
    if (!form) return null;
    var field = (form.fields || []).find(function (f) {
      return f.key === parsed.fieldKey;
    });
    if (!field) return null;
    return {
      path: path,
      label: form.label + " — " + field.label,
      formId: form.id,
      fieldKey: field.key,
      type: field.type,
    };
  }

  function isValidFieldPath(protocolSchema, path) {
    return !!findFieldPath(protocolSchema, path);
  }

  function getProtocolFieldPaths(protocolSchema) {
    return buildFieldPaths(protocolSchema);
  }

  return {
    VALID_OPS: VALID_OPS,
    parseFieldPath: parseFieldPath,
    buildFieldPaths: buildFieldPaths,
    findFieldPath: findFieldPath,
    isValidFieldPath: isValidFieldPath,
    getProtocolFieldPaths: getProtocolFieldPaths,
  };
});
