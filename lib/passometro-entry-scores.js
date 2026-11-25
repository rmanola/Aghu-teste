/**
 * Scores clínicos por entrada do passômetro (NEWS2, qSOFA) — CommonJS.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroEntryScores = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getVitalsParse() {
    if (typeof module !== "undefined" && module.exports) {
      return require("./passometro-vitals-parse.js");
    }
    return globalThis.AghuPassometroVitalsParse;
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
    return 3;
  }

  function scoreTemperature(tempC) {
    if (tempC <= 35) return 3;
    if (tempC <= 36) return 1;
    if (tempC <= 38) return 0;
    if (tempC <= 39) return 1;
    return 2;
  }

  function scoreConsciousness(level) {
    return level === "alert" ? 0 : 3;
  }

  function classifyNews2Risk(total) {
    if (total <= 4) return { band: "low", label: "Baixo (0–4)" };
    if (total <= 6) return { band: "medium", label: "Médio (5–6)" };
    return { band: "high", label: "Alto (≥7)" };
  }

  function computeNews2(opts) {
    var rr = opts.respiratoryRate;
    var spo2 = opts.spo2Pct;
    var pas = opts.systolicBp;
    var fc = opts.heartRate;
    var temp = opts.temperatureC;
    var consciousness = opts.consciousness || "alert";
    var supplementalO2 = !!opts.supplementalO2;
    if (![rr, spo2, pas, fc, temp].every(function (v) {
      return Number.isFinite(v);
    })) {
      throw new Error("invalid_news2_inputs");
    }
    var points = {
      respiratoryRate: scoreRespiratoryRate(rr),
      spo2: scoreSpo2Scale1(spo2),
      supplementalO2: supplementalO2 ? 2 : 0,
      systolicBp: scoreSystolicBp(pas),
      heartRate: scoreHeartRate(fc),
      consciousness: scoreConsciousness(consciousness),
      temperature: scoreTemperature(temp),
    };
    var total = 0;
    var pk = Object.keys(points);
    for (var i = 0; i < pk.length; i++) total += points[pk[i]];
    return { total: total, points: points, risk: classifyNews2Risk(total) };
  }

  function computeQsofa(opts) {
    var rr = opts.respiratoryRate;
    var pas = opts.systolicBp;
    var alteredMentation = !!opts.alteredMentation;
    if (!Number.isFinite(rr) || !Number.isFinite(pas)) {
      throw new Error("invalid_qsofa_inputs");
    }
    var points = {
      respiratoryRate: rr >= 22 ? 1 : 0,
      systolicBp: pas <= 100 ? 1 : 0,
      alteredMentation: alteredMentation ? 1 : 0,
    };
    var total =
      points.respiratoryRate + points.systolicBp + points.alteredMentation;
    return { total: total, points: points, highRisk: total >= 2 };
  }

  function normalizeConsciousness(raw) {
    var v = String(raw || "alert").trim().toLowerCase();
    if (v === "voice" || v === "pain" || v === "unresponsive") return v;
    return "alert";
  }

  function buildNews2AssessmentForEntry(entry, scoreParams) {
    scoreParams = scoreParams || {};
    var parse = getVitalsParse();
    var vitals = parse.parsePassometroEntryForNews2(entry);
    var missing = [];
    if (vitals.frIrpm == null) missing.push("fr");
    if (vitals.spo2Pct == null) missing.push("sato2");
    if (vitals.pas == null) missing.push("pa");
    if (vitals.fcBpm == null) missing.push("fc");
    if (vitals.tempC == null) missing.push("tax");
    var consciousness = normalizeConsciousness(scoreParams.consciousness);
    if (missing.length) {
      return { status: "missing", missing: missing };
    }
    var result = computeNews2({
      respiratoryRate: vitals.frIrpm,
      spo2Pct: vitals.spo2Pct,
      systolicBp: vitals.pas,
      heartRate: vitals.fcBpm,
      temperatureC: vitals.tempC,
      consciousness: consciousness,
      supplementalO2: !!scoreParams.supplementalO2,
    });
    return { status: "ok", result: result };
  }

  function buildQsofaAssessmentForEntry(entry, scoreParams) {
    scoreParams = scoreParams || {};
    var parse = getVitalsParse();
    var vitals = parse.parsePassometroEntryForQsofa(entry);
    var missing = [];
    if (vitals.frIrpm == null) missing.push("fr");
    if (vitals.pas == null) missing.push("pa");
    if (missing.length) {
      return { status: "missing", missing: missing };
    }
    var result = computeQsofa({
      respiratoryRate: vitals.frIrpm,
      systolicBp: vitals.pas,
      alteredMentation: !!scoreParams.alteredMentation,
    });
    return { status: "ok", result: result };
  }

  function formatNews2Display(assessment) {
    if (!assessment || assessment.status !== "ok" || !assessment.result) {
      return { status: "missing", display: "—", detail: "Incompleto" };
    }
    var r = assessment.result;
    var highlight =
      r.risk.band === "high"
        ? "critical"
        : r.risk.band === "medium"
          ? "warning"
          : "normal";
    return {
      status: "ok",
      display: String(r.total) + " (" + r.risk.label + ")",
      detail: "NEWS2",
      highlight: highlight,
    };
  }

  function formatQsofaDisplay(assessment) {
    if (!assessment || assessment.status !== "ok" || !assessment.result) {
      return { status: "missing", display: "—", detail: "Incompleto" };
    }
    var r = assessment.result;
    return {
      status: "ok",
      display: String(r.total),
      detail: r.highRisk ? "Alto risco (≥2)" : "qSOFA",
      highlight: r.highRisk ? "critical" : "normal",
    };
  }

  return {
    computeNews2: computeNews2,
    computeQsofa: computeQsofa,
    buildNews2AssessmentForEntry: buildNews2AssessmentForEntry,
    buildQsofaAssessmentForEntry: buildQsofaAssessmentForEntry,
    formatNews2Display: formatNews2Display,
    formatQsofaDisplay: formatQsofaDisplay,
  };
});
