/**
 * FEAT-147 — Derivações puras perioperatórias.
 * Clavien "0" ≠ unanswered; janela 30 dias; captura > HPB; textbook incompleto = null.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiPerioperativeOutcome = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var hpbComputed = load("hpb-computed.js", "AghuHpbComputed");

  var DEFINITION_REF = "textbook-outcome-perioperative-v1";
  var WINDOW_DAYS = 30;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function parseIsoMs(iso) {
    var s = str(iso);
    if (!s) return null;
    var ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  function dateOnlyMs(iso) {
    var s = str(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Date.parse(s + "T00:00:00Z");
  }

  function computeClavienGte3(clavienMax) {
    if (!hpbComputed || typeof hpbComputed.computeClavienGte3 !== "function") {
      return false;
    }
    return !!hpbComputed.computeClavienGte3(clavienMax);
  }

  function computeDoorToSurgeryHours(capture, surgeryStartIso) {
    var door = capture && capture.doorTimeIso != null ? capture.doorTimeIso : null;
    var missing = [];
    if (!str(door)) missing.push("doorTimeIso");
    if (!str(surgeryStartIso)) missing.push("surgeryStartIso");
    if (missing.length) return { hours: null, missing: missing };
    var a = parseIsoMs(door);
    var b = parseIsoMs(surgeryStartIso);
    if (a == null) return { hours: null, missing: ["doorTimeIso"] };
    if (b == null) return { hours: null, missing: ["surgeryStartIso"] };
    if (b < a) return { hours: null, missing: ["surgeryStartIso"] };
    var hours = (b - a) / (60 * 60 * 1000);
    return { hours: hours, missing: [] };
  }

  function resolvePerioperativeClavien(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    if (o.captureValue != null && !o.captureUnanswered) {
      return { value: o.captureValue, source: "capture" };
    }
    if (o.hpbCohortValue != null) {
      return { value: o.hpbCohortValue, source: "hpb" };
    }
    return { value: null, source: null };
  }

  function computeClavienWindowState(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var start = dateOnlyMs(o.surgeryDateIso);
    var asOf = dateOnlyMs(o.asOfDateIso);
    if (start == null || asOf == null) return "observing";
    var closesAt = start + WINDOW_DAYS * MS_PER_DAY;
    return asOf >= closesAt ? "closed" : "observing";
  }

  function computeTextbookOutcomeCapture(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    if (o.clavienUnanswered || o.reinterventionUnanswered) return null;
    if (o.clavienMax == null || o.unplannedReintervention == null) return null;
    if (computeClavienGte3(o.clavienMax)) {
      return { textbookOutcome: false, definitionRef: DEFINITION_REF };
    }
    if (o.unplannedReintervention === true) {
      return { textbookOutcome: false, definitionRef: DEFINITION_REF };
    }
    if (o.readmission30d) {
      return { textbookOutcome: false, definitionRef: DEFINITION_REF };
    }
    if (o.death90d) {
      return { textbookOutcome: false, definitionRef: DEFINITION_REF };
    }
    return { textbookOutcome: true, definitionRef: DEFINITION_REF };
  }

  function computeAvoidedComplicationsPerLosDay(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    if (!o.saf01Feasible) {
      return { value: null, blockedReason: "saf01_not_feasible" };
    }
    if (o.expectedRate == null || o.expectedRate === "") {
      return { value: null, blockedReason: "expected_rate_unresolved" };
    }
    var expected = Number(o.expectedRate);
    if (!Number.isFinite(expected)) {
      return { value: null, blockedReason: "expected_rate_unresolved" };
    }
    if (o.observedRate == null || o.observedRate === "") {
      return { value: null, blockedReason: "observed_rate_missing" };
    }
    var observed = Number(o.observedRate);
    if (!Number.isFinite(observed)) {
      return { value: null, blockedReason: "observed_rate_missing" };
    }
    var n = Number(o.closedEpisodeCount);
    var los = Number(o.sumLosDays);
    if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(los) || los <= 0) {
      return { value: null, blockedReason: "los_or_n_missing" };
    }
    return {
      value: ((expected - observed) * n) / los,
      blockedReason: null,
    };
  }

  return {
    DEFINITION_REF: DEFINITION_REF,
    WINDOW_DAYS: WINDOW_DAYS,
    computeClavienGte3: computeClavienGte3,
    computeDoorToSurgeryHours: computeDoorToSurgeryHours,
    resolvePerioperativeClavien: resolvePerioperativeClavien,
    computeClavienWindowState: computeClavienWindowState,
    computeTextbookOutcomeCapture: computeTextbookOutcomeCapture,
    computeAvoidedComplicationsPerLosDay: computeAvoidedComplicationsPerLosDay,
  };
});
