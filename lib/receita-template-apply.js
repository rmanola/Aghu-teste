/**
 * Aplica template de medicamentos a um documento de receita.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaTemplateApply = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  /**
   * @param {object} doc ReceitaDoc
   * @param {object} template { id, lines[] }
   * @param {{ replace?: boolean }} [opts]
   */
  function applyTemplateToDoc(doc, template, opts) {
    opts = opts || {};
    var schema = getSchema();
    if (!schema || !doc || !template) return doc;
    var lines = opts.replace ? [] : Array.isArray(doc.lines) ? doc.lines.slice() : [];
    var tplLines = Array.isArray(template.lines) ? template.lines : [];
    for (var i = 0; i < tplLines.length; i++) {
      var raw = Object.assign({}, tplLines[i], {
        classSource: "TEMPLATE",
        id: schema.newId(),
      });
      var ln = schema.normalizeLine(raw);
      if (ln && ln.drugName) lines.push(ln);
    }
    return Object.assign({}, doc, {
      lines: lines,
      appliedTemplateId: template.id || null,
      updatedAt: Date.now(),
    });
  }

  return {
    applyTemplateToDoc: applyTemplateToDoc,
  };
});
