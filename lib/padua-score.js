/**
 * Ported from web/lib/patient-records/padua-score.mjs
 * @sync web/lib/patient-records/padua-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuPaduaScore = api;
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

  var _mod_CkdEpiEgfr = loadMod(root, "ckd-epi-egfr.js", "AghuCkdEpiEgfr");
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;


/** @typedef {"baixo" | "alto"} PaduaRiskLevel */

const THREE_POINT = [
  ["activeCancer", 3],
  ["previousVte", 3],
  ["reducedMobility", 3],
  ["knownThrombophilia", 3],
];

const TWO_POINT = [["recentTraumaSurgery", 2]];

const ONE_POINT = [
  ["heartRespFailure", 1],
  ["acuteMiStroke", 1],
  ["acuteInfectionRheum", 1],
  ["obesity", 1],
  ["hormonalTherapy", 1],
];

/**
 * @param {number} total
 * @returns {{ riskLevel: PaduaRiskLevel, prophylaxisHint: string, highRisk: boolean }}
 */
function interpretPaduaRisk(total) {
  if (total >= 4) {
    return {
      riskLevel: "alto",
      highRisk: true,
      prophylaxisHint: "Alto risco — considerar profilaxia farmacológica",
    };
  }
  return {
    riskLevel: "baixo",
    highRisk: false,
    prophylaxisHint: "Baixo risco — deambulação precoce habitualmente suficiente",
  };
}

function computePadua(opts) {
  const age = opts.ageYears;
  if (!Number.isFinite(age) || age < 0) {
    throw new Error("invalid_padua_inputs");
  }

  let total = 0;
  const points = {};

  for (const [key, pts] of THREE_POINT) {
    if (opts[key]) {
      points[key] = pts;
      total += pts;
    }
  }
  for (const [key, pts] of TWO_POINT) {
    if (opts[key]) {
      points[key] = pts;
      total += pts;
    }
  }
  if (age >= 70) {
    points.age70 = 1;
    total += 1;
  }
  for (const [key, pts] of ONE_POINT) {
    if (opts[key]) {
      points[key] = pts;
      total += pts;
    }
  }

  const risk = interpretPaduaRisk(total);
  return { total, points, ...risk };
}

function parsePaduaAge(passometroHeader, pii, referenceDateISO) {
  return resolveAgeYears({
    passometroHeader,
    pii,
    referenceDateISO: ((referenceDateISO) != null && (referenceDateISO) !== undefined ? (referenceDateISO) : (null)),
  });
}

/** Idade ≥70 sugere checkbox de idade no Padua. */
function buildPaduaSuggestedAge(passometroHeader, pii, referenceDateISO) {
  const age = parsePaduaAge(passometroHeader, pii, referenceDateISO);
  const suggested = {};
  if (age != null) {
    suggested.ageYears = age;
    if (age >= 70) suggested.age70 = true;
  }
  return suggested;
}


  return {
    interpretPaduaRisk: interpretPaduaRisk,
    computePadua: computePadua,
    parsePaduaAge: parsePaduaAge,
    buildPaduaSuggestedAge: buildPaduaSuggestedAge,
  };
});
