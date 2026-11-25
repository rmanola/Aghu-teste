/**
 * Geração de chaves de campo Research a partir de rótulos (protocolo custom).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchFieldKeySlug = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
  var DEFAULT_KEY_RE = /^campo\d+$/;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function isDefaultFieldKey(key) {
    return DEFAULT_KEY_RE.test(str(key));
  }

  function isValidFieldKey(key) {
    return FIELD_KEY_RE.test(str(key));
  }

  function slugFromLabel(label) {
    var s = str(label)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_")
      .slice(0, 40);
    if (!s) return "";
    if (!/^[a-z]/.test(s)) s = "f_" + s;
    return s.slice(0, 40);
  }

  function suggestFieldKey(label, existingKeys, fallbackIndex) {
    var base = slugFromLabel(label);
    if (!base || !isValidFieldKey(base)) {
      base = "campo" + (fallbackIndex || 1);
    }
    var key = base;
    var n = 2;
    var used = existingKeys || {};
    while (used[key]) {
      var suffix = "_" + n;
      key = (base.slice(0, 40 - suffix.length) + suffix).replace(/_+$/, "");
      if (!isValidFieldKey(key)) key = "campo" + n;
      n += 1;
    }
    return key;
  }

  function validateFieldKeyInline(key) {
    var k = str(key);
    if (!k) return "Identificador interno obrigatório";
    if (!isValidFieldKey(k)) {
      return "Use só letras minúsculas, números e _ (máx. 40 caracteres, começar com letra)";
    }
    return null;
  }

  return {
    FIELD_KEY_RE: FIELD_KEY_RE,
    isDefaultFieldKey: isDefaultFieldKey,
    isValidFieldKey: isValidFieldKey,
    slugFromLabel: slugFromLabel,
    suggestFieldKey: suggestFieldKey,
    validateFieldKeyInline: validateFieldKeyInline,
  };
});
