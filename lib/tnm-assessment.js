/**
 * Interpretação TNM + assessment (status ok|missing).
 * @sync web/lib/vendor/tnm-assessment.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuTnmAssessment = api;
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

  var _mod = loadMod(root, "tnm-stage.js", "AghuTnmStage");
  var stageTnm = _mod && _mod.stageTnm;

  function interpretTnm(result) {
    if (!result || !result.stageGroup) {
      return { label: "Estadiamento incompleto", hint: "Informe T, N, M, topografia e basis" };
    }
    var prefix = result.basis === "clinical" ? "c" : "p";
    return {
      label:
        prefix +
        result.t +
        result.n +
        result.m +
        " · estádio " +
        result.stageGroup +
        " (" +
        result.edition +
        ")",
      hint: "Estádio agrupado derivado da tabela AJCC-8; não fornecido pelo chamador",
    };
  }

  function buildTnmAssessment(opts) {
    opts = opts || {};
    var missing = [];
    if (opts.t == null || opts.t === "") missing.push("t");
    if (opts.n == null || opts.n === "") missing.push("n");
    if (opts.m == null || opts.m === "") missing.push("m");
    if (opts.topography == null || opts.topography === "") missing.push("topography");
    if (opts.basis == null || opts.basis === "") missing.push("basis");
    if (missing.length) {
      return { status: "missing", missing: missing, suggested: {}, result: null };
    }
    var result = stageTnm({
      t: opts.t,
      n: opts.n,
      m: opts.m,
      topography: opts.topography,
      basis: opts.basis,
    });
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretTnm(result)),
    };
  }

  return {
    interpretTnm: interpretTnm,
    buildTnmAssessment: buildTnmAssessment,
  };
});
