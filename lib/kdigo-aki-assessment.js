/**
 * Interpretação KDIGO AKI + assessment para popup (Cr + RRT).
 * @sync web/lib/patient-records/kdigo-aki-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuKdigoAkiAssessment = api;
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

  var _mod = loadMod(root, "kdigo-aki-stage.js", "AghuKdigoAkiStage");
  var stageKdigoAki = _mod && _mod.stageKdigoAki;

  var STAGE_LABELS = {
    0: "Sem LRA (KDIGO)",
    1: "LRA estágio 1",
    2: "LRA estágio 2",
    3: "LRA estágio 3",
  };

  var STAGE_HINTS = {
    0: "Sem critério de LRA pelos dados fornecidos",
    1: "Monitorizar função renal e volume",
    2: "Avaliar causa e evitar nefrotoxinas",
    3: "Considerar nefrologia / TRS se indicado",
  };

  function interpretKdigoAki(stage) {
    if (stage == null) {
      return {
        stage: null,
        label: "Dados insuficientes",
        hint: "Necessárias ≥2 creatininas ou registo de TRS",
      };
    }
    var s = Number(stage);
    return {
      stage: s,
      label: STAGE_LABELS[s] || "KDIGO " + s,
      hint: STAGE_HINTS[s] || "",
      highRisk: s >= 2,
    };
  }

  /**
   * @param {{
   *   measurements?: Array,
   *   creatinineBaseline?: number,
   *   creatininePeak?: number,
   *   onRrt?: boolean,
   *   urineOutput?: object,
   *   unit?: string,
   * }} opts
   */
  function buildKdigoAkiAssessment(opts) {
    opts = opts || {};
    var measurements = opts.measurements;
    if (
      (!Array.isArray(measurements) || measurements.length < 2) &&
      Number.isFinite(opts.creatinineBaseline) &&
      Number.isFinite(opts.creatininePeak)
    ) {
      var unit = opts.unit || "mg/dL";
      measurements = [
        { value: opts.creatinineBaseline, unit: unit, at: "baseline" },
        { value: opts.creatininePeak, unit: unit, at: "peak" },
      ];
    }

    if (opts.onRrt) {
      var rrt = stageKdigoAki({ onRrt: true });
      return {
        status: "ok",
        missing: [],
        suggested: { onRrt: true },
        result: Object.assign({}, rrt, interpretKdigoAki(3)),
      };
    }

    if (!Array.isArray(measurements) || measurements.length < 2) {
      return {
        status: "missing",
        missing: ["measurements"],
        suggested: {},
        result: { stage: null, reason: "insufficient_measurements" },
      };
    }

    var result = stageKdigoAki({
      measurements: measurements,
      onRrt: !!opts.onRrt,
      urineOutput: opts.urineOutput,
    });
    if (result.stage == null) {
      return {
        status: "missing",
        missing: ["measurements"],
        suggested: {},
        result: result,
      };
    }
    return {
      status: "ok",
      missing: [],
      suggested: {},
      result: Object.assign({}, result, interpretKdigoAki(result.stage)),
    };
  }

  return {
    interpretKdigoAki: interpretKdigoAki,
    buildKdigoAkiAssessment: buildKdigoAkiAssessment,
  };
});
