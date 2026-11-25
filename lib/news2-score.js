/**
 * Ported from web/lib/patient-records/news2-score.mjs
 * @sync web/lib/patient-records/news2-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuNews2Score = api;
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


function scoreRespiratoryRate(rr) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function scoreSpo2Scale1(spo2) {
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function scoreSystolicBp(pas) {
  if (pas <= 90) return 3;
  if (pas <= 100) return 2;
  if (pas <= 110) return 1;
  if (pas <= 219) return 0;
  return 3;
}

function scoreHeartRate(fc) {
  if (fc <= 40) return 3;
  if (fc <= 50) return 1;
  if (fc <= 90) return 0;
  if (fc <= 110) return 1;
  if (fc <= 130) return 2;
  return 3; // ≥131
}

function scoreTemperature(tempC) {
  if (tempC <= 35) return 3;
  if (tempC <= 36) return 1;
  if (tempC <= 38) return 0;
  if (tempC <= 39) return 1;
  return 2;
}

/** @typedef {"alert"|"voice"|"pain"|"unresponsive"} ConsciousnessLevel */

function scoreConsciousness(level) {
  return level === "alert" ? 0 : 3;
}

function classifyNews2Risk(total) {
  if (total <= 4) return { band: "low", label: "Baixo (0–4)" };
  if (total <= 6) return { band: "medium", label: "Médio (5–6)" };
  return { band: "high", label: "Alto (≥7)" };
}

/**
 * NEWS2 (escala 1 de SpO2; sem hipercapnia).
 */
function computeNews2(opts) {
  const rr = opts.respiratoryRate;
  const spo2 = opts.spo2Pct;
  const pas = opts.systolicBp;
  const fc = opts.heartRate;
  const temp = opts.temperatureC;
  const consciousness = opts.consciousness || "alert";
  const supplementalO2 = !!opts.supplementalO2;

  if (
    ![rr, spo2, pas, fc, temp].every((v) => Number.isFinite(v))
  ) {
    throw new Error("invalid_news2_inputs");
  }

  const points = {
    respiratoryRate: scoreRespiratoryRate(rr),
    spo2: scoreSpo2Scale1(spo2),
    supplementalO2: supplementalO2 ? 2 : 0,
    systolicBp: scoreSystolicBp(pas),
    heartRate: scoreHeartRate(fc),
    consciousness: scoreConsciousness(consciousness),
    temperature: scoreTemperature(temp),
  };

  const total = Object.values(points).reduce((a, b) => a + b, 0);

  return {
    total,
    points,
    risk: classifyNews2Risk(total),
  };
}


  return {
    scoreRespiratoryRate: scoreRespiratoryRate,
    scoreSpo2Scale1: scoreSpo2Scale1,
    scoreSystolicBp: scoreSystolicBp,
    scoreHeartRate: scoreHeartRate,
    scoreTemperature: scoreTemperature,
    scoreConsciousness: scoreConsciousness,
    classifyNews2Risk: classifyNews2Risk,
    computeNews2: computeNews2,
  };
});
