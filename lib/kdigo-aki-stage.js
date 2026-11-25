/**
 * Estadiamento KDIGO de LRA (AKI) por creatinina ± diurese.
 * @sync web/lib/patient-records/kdigo-aki-stage.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuKdigoAkiStage = api;
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

  var _ckd = loadMod(root, "ckd-epi-egfr.js", "AghuCkdEpiEgfr");
  var normalizeCreatinineMgDl =
    _ckd && _ckd.normalizeCreatinineMgDl;

  function stageFromRatio(ratio, peakMgDl) {
    if (peakMgDl >= 4.0 || ratio >= 3.0) return 3;
    if (ratio >= 2.0) return 2;
    if (ratio >= 1.5) return 1;
    return 0;
  }

  function parseAtMs(at) {
    if (at == null) return null;
    var t = Date.parse(at);
    return Number.isFinite(t) ? t : null;
  }

  /**
   * KDIGO estágio 1 por critério absoluto (independente de KDIGO 2012 e do
   * rascunho KDIGO 2026 AKI/AKD, que mantém o mesmo limiar sob a notação
   * C1/U1): aumento ≥0,3 mg/dL entre duas medições com ≤48h de diferença,
   * considerando todos os pares — não só o nadir/pico globais da série.
   * @param {Array<{ valueMgDl: number, atMs: number|null }>} dated
   * @returns {{ stage: 0|1, maxRise: number|null }}
   */
  function stageFromAbsoluteRise48h(dated) {
    var withTime = [];
    for (var i = 0; i < dated.length; i++) {
      if (dated[i].atMs != null) withTime.push(dated[i]);
    }
    if (withTime.length < 2) return { stage: 0, maxRise: null };
    withTime.sort(function (a, b) {
      return a.atMs - b.atMs;
    });
    var maxRise = 0;
    for (var a = 0; a < withTime.length; a++) {
      for (var b = a + 1; b < withTime.length; b++) {
        var elapsedHours = (withTime[b].atMs - withTime[a].atMs) / 3600000;
        if (elapsedHours < 0 || elapsedHours > 48) continue;
        var rise = withTime[b].valueMgDl - withTime[a].valueMgDl;
        if (rise > maxRise) maxRise = rise;
      }
    }
    // arredonda antes de comparar ao limiar — evita falso-negativo por
    // imprecisão de ponto flutuante (ex.: 2.3 - 2.0 === 0.2999999999999998)
    var maxRiseRounded = Math.round(maxRise * 1000) / 1000;
    return { stage: maxRiseRounded >= 0.3 ? 1 : 0, maxRise: maxRiseRounded };
  }

  /**
   * Critérios KDIGO de débito urinário (ml/kg/h × duração).
   * @param {{ mlPerKgPerHour?: number, hours?: number, anuriaHours?: number }} uo
   */
  function stageFromUrineOutput(uo) {
    if (!uo || typeof uo !== "object") return 0;
    var anuria = uo.anuriaHours;
    if (Number.isFinite(anuria) && anuria >= 12) return 3;
    var rate = uo.mlPerKgPerHour;
    var hours = uo.hours;
    if (!Number.isFinite(rate) || !Number.isFinite(hours) || hours <= 0) {
      return 0;
    }
    if (rate < 0.3 && hours >= 24) return 3;
    if (rate < 0.5 && hours >= 12) return 2;
    if (rate < 0.5 && hours >= 6) return 1;
    return 0;
  }

  /**
   * @param {{
   *   measurements?: Array<{ value: number, unit?: string, at?: string }>,
   *   onRrt?: boolean,
   *   urineOutput?: object,
   * }} opts
   */
  function stageKdigoAki(opts) {
    opts = opts || {};
    if (opts.onRrt) {
      return {
        stage: 3,
        ratio: null,
        baseline: null,
        peak: null,
        baselineSource: null,
        unit: "mg/dL",
        criterion: "rrt",
      };
    }

    var measurements = opts.measurements;
    if (!Array.isArray(measurements) || measurements.length < 2) {
      return {
        stage: null,
        reason: "insufficient_measurements",
      };
    }

    if (typeof normalizeCreatinineMgDl !== "function") {
      throw new Error("invalid_kdigo_inputs");
    }

    var values = [];
    var dated = [];
    for (var i = 0; i < measurements.length; i++) {
      var m = measurements[i];
      if (!m || !Number.isFinite(m.value)) {
        throw new Error("invalid_kdigo_inputs");
      }
      var mgDl = normalizeCreatinineMgDl(m.value, m.unit);
      values.push(mgDl);
      dated.push({ valueMgDl: mgDl, atMs: parseAtMs(m.at) });
    }

    var baseline = Math.min.apply(null, values);
    var peak = Math.max.apply(null, values);
    if (!(baseline > 0)) {
      throw new Error("invalid_kdigo_inputs");
    }
    var ratio = peak / baseline;
    var crStage = stageFromRatio(ratio, peak);
    var absResult = stageFromAbsoluteRise48h(dated);
    var uoStage = stageFromUrineOutput(opts.urineOutput);
    var stage = Math.max(crStage, absResult.stage, uoStage);

    var criterion;
    if (uoStage === stage && uoStage > crStage && uoStage > absResult.stage) {
      criterion = "urine_output";
    } else if (crStage === stage && crStage > 0) {
      criterion = "creatinine";
    } else if (absResult.stage === stage && absResult.stage > 0) {
      criterion = "creatinine_absolute_48h";
    } else if (uoStage === stage && uoStage > 0) {
      criterion = "urine_output";
    } else {
      criterion = "creatinine";
    }

    return {
      stage: stage === 0 ? 0 : stage,
      ratio: Math.round(ratio * 100) / 100,
      baseline: Math.round(baseline * 1000) / 1000,
      peak: Math.round(peak * 1000) / 1000,
      baselineSource: "nadir",
      unit: "mg/dL",
      criterion: criterion,
      absoluteRise48h:
        absResult.maxRise == null
          ? null
          : Math.round(absResult.maxRise * 1000) / 1000,
    };
  }

  return {
    stageKdigoAki: stageKdigoAki,
    stageFromUrineOutput: stageFromUrineOutput,
  };
});
