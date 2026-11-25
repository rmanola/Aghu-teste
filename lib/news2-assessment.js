/**
 * Ported from web/lib/patient-records/news2-assessment.mjs
 * @sync web/lib/patient-records/news2-assessment.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuNews2Assessment = api;
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

  var _mod_PassometroEntryVitals = loadMod(root, "passometro-entry-vitals.js", "AghuPassometroEntryVitals");
  var getLatestVitalsForNews2 = _mod_PassometroEntryVitals && _mod_PassometroEntryVitals.getLatestVitalsForNews2;
  var _mod_News2Score = loadMod(root, "news2-score.js", "AghuNews2Score");
  var computeNews2 = _mod_News2Score && _mod_News2Score.computeNews2;
  var _mod_PassometroCollection = loadMod(root, "passometro-collection.js", "AghuPassometroCollection");
  var resolveAnySnapFromDomain =
    _mod_PassometroCollection && _mod_PassometroCollection.resolveAnySnapFromDomain;



function buildNews2Assessment(opts) {
  opts = opts || {};
  const missing = [];
  const suggested = {};
  const preferDataISO = ((opts.preferDataISO) != null && (opts.preferDataISO) !== undefined ? (opts.preferDataISO) : (null));

  var passometroInput = opts.passometro;
  if (
    resolveAnySnapFromDomain &&
    passometroInput &&
    typeof passometroInput === "object" &&
    passometroInput.version === 2 &&
    Array.isArray(passometroInput.registros)
  ) {
    passometroInput = resolveAnySnapFromDomain(
      passometroInput,
      opts.patientEpisodes || opts.patient_episodes || null,
    );
  }

  const vitals = getLatestVitalsForNews2(passometroInput, opts.controles, {
    preferDataISO,
    entry: ((opts.entry) != null && (opts.entry) !== undefined ? (opts.entry) : (null)),
  });
  if (vitals) {
    if (vitals.frIrpm != null) suggested.respiratoryRate = vitals.frIrpm;
    if (vitals.spo2Pct != null) suggested.spo2Pct = vitals.spo2Pct;
    if (vitals.pas != null) suggested.systolicBp = vitals.pas;
    if (vitals.fcBpm != null) suggested.heartRate = vitals.fcBpm;
    if (vitals.tempC != null) suggested.temperatureC = vitals.tempC;
    suggested.vitalsDataLabel = vitals.dataLabel;
    suggested.vitalsSource = vitals.source;
  }

  if (suggested.respiratoryRate == null) missing.push("respiratoryRate");
  if (suggested.spo2Pct == null) missing.push("spo2");
  if (suggested.systolicBp == null) missing.push("systolicBp");
  if (suggested.heartRate == null) missing.push("heartRate");
  if (suggested.temperatureC == null) missing.push("temperature");

  const consciousness = opts.consciousness || null;
  if (consciousness) {
    suggested.consciousness = consciousness;
  } else {
    missing.push("consciousness");
  }

  suggested.supplementalO2 = !!opts.supplementalO2;

  if (missing.length) {
    return { status: "missing", missing, suggested };
  }

  const result = computeNews2({
    respiratoryRate: suggested.respiratoryRate,
    spo2Pct: suggested.spo2Pct,
    systolicBp: suggested.systolicBp,
    heartRate: suggested.heartRate,
    temperatureC: suggested.temperatureC,
    consciousness: suggested.consciousness,
    supplementalO2: suggested.supplementalO2,
  });

  return { status: "ok", missing: [], suggested, result };
}


  return {
    buildNews2Assessment: buildNews2Assessment,
  };
});
