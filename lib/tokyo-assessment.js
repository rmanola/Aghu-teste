/**
 * Interpretação Tokyo Guidelines + assessment (status ok|missing).
 * @sync web/lib/vendor/tokyo-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuTokyoAssessment = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod = loadMod(root, "tokyo-grade.js", "AghuTokyoGrade");
  var gradeTokyo = _mod && _mod.gradeTokyo;

  var GRADE_LABELS = {
    mild: "Grau I — ligeiro",
    moderate: "Grau II — moderado",
    severe: "Grau III — severo",
  };

  function interpretTokyo(grade, condition) {
    var cond = condition === "cholangitis" ? "colangite" : "colecistite";
    var hint =
      grade === "severe"
        ? "Disfunção orgânica — suporte + intervenção urgente"
        : grade === "moderate"
          ? condition === "cholangitis"
            ? "Drenagem biliar precoce + antimicrobianos"
            : "Colecistectomia precoce / drenagem se indicado"
          : "Antimicrobianos e observação com reavaliação";
    return {
      label: (GRADE_LABELS[grade] || grade || "Grau indeterminado") + " (" + cond + ", TG18)",
      hint: hint,
    };
  }

  function buildTokyoAssessment(opts) {
    opts = opts || {};
    if (!opts.condition) {
      return {
        status: "missing",
        missing: ["condition"],
        suggested: {},
        result: null,
      };
    }
    var result = gradeTokyo(opts);
    if (result.status === "missing") {
      return {
        status: "missing",
        missing: result.missing,
        suggested: {},
        result: { grade: null, edition: result.edition, condition: result.condition },
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretTokyo(result.grade, result.condition)),
    };
  }

  return {
    interpretTokyo: interpretTokyo,
    buildTokyoAssessment: buildTokyoAssessment,
  };
});
