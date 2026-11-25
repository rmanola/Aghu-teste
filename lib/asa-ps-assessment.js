/**
 * Interpretação ASA-PS + assessment para popup (select).
 * @sync web/lib/patient-records/asa-ps-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAsaPsAssessment = api;
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

  var _mod = loadMod(root, "asa-ps-score.js", "AghuAsaPsScore");
  var computeAsaPs = _mod && _mod.computeAsaPs;

  function interpretAsaPs(grade, emergency) {
    var r = computeAsaPs({ grade: grade, emergency: emergency });
    if (r.grade == null) {
      return { grade: null, reason: "not_recorded", label: "Não registado" };
    }
    return {
      grade: r.grade,
      roman: r.roman,
      emergency: r.emergency,
      label: r.label,
      highRisk: r.grade >= 4,
    };
  }

  function buildAsaPsAssessment(opts) {
    opts = opts || {};
    var result = computeAsaPs({ grade: opts.grade, emergency: opts.emergency });
    if (result.grade == null) {
      return {
        status: "missing",
        missing: ["grade"],
        suggested: {},
        result: result,
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: { grade: result.grade },
      result: Object.assign({}, result, { highRisk: result.grade >= 4 }),
    };
  }

  return {
    interpretAsaPs: interpretAsaPs,
    buildAsaPsAssessment: buildAsaPsAssessment,
  };
});
