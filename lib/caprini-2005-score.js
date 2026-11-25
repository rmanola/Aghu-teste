/**
 * Ported from web/lib/patient-records/caprini-2005-score.mjs
 * @sync web/lib/patient-records/caprini-2005-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCaprini2005Score = api;
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

  var _mod_CapriniShared = loadMod(root, "caprini-shared.js", "AghuCapriniShared");
  var computeCapriniAgePoints = _mod_CapriniShared && _mod_CapriniShared.computeCapriniAgePoints;
  var parseCapriniAge = _mod_CapriniShared && _mod_CapriniShared.parseCapriniAge;
  var sumCapriniFlags = _mod_CapriniShared && _mod_CapriniShared.sumCapriniFlags;


const ONE_POINT = [
  ["minorSurgery", 1],
  ["bmiOver25", 1],
  ["swollenLegs", 1],
  ["varicoseVeins", 1],
  ["pregnancyPostpartum", 1],
  ["oralContraceptivesHrt", 1],
  ["sepsis", 1],
  ["seriousLungDisease", 1],
  ["abnormalPulmonaryFunction", 1],
  ["acuteMi", 1],
  ["chf", 1],
  ["ibd", 1],
  ["bedRestMedical", 1],
  ["otherRiskFactors", 1],
];

const TWO_POINT = [
  ["arthroscopicSurgery", 2],
  ["malignancy", 2],
  ["laparoscopicSurgery", 2],
  ["majorSurgery", 2],
  ["plasterCast", 2],
  ["centralVenousAccess", 2],
];

const THREE_POINT = [
  ["historyVte", 3],
  ["familyHistoryVte", 3],
  ["factorVLeiden", 3],
  ["prothrombin20210a", 3],
  ["lupusAnticoagulant", 3],
  ["anticardiolipin", 3],
  ["hit", 3],
  ["otherThrombophilia", 3],
];

const FIVE_POINT = [
  ["stroke", 5],
  ["electiveJointArthroplasty", 5],
  ["hipPelvisLegFracture", 5],
  ["spinalCordInjury", 5],
];

/**
 * @param {number} total
 */
function interpretCaprini2005Risk(total) {
  if (total >= 5) {
    return {
      riskLevel: "alto",
      highRisk: true,
      prophylaxisHint: "Alto risco — profilaxia farmacológica recomendada",
    };
  }
  if (total >= 3) {
    return {
      riskLevel: "moderado",
      highRisk: false,
      prophylaxisHint: "Risco moderado — considerar profilaxia farmacológica",
    };
  }
  if (total >= 1) {
    return {
      riskLevel: "baixo",
      highRisk: false,
      prophylaxisHint: "Risco baixo — mecânica ou deambulação precoce",
    };
  }
  return {
    riskLevel: "muito_baixo",
    highRisk: false,
    prophylaxisHint: "Risco muito baixo — deambulação precoce",
  };
}

function computeCaprini2005(opts) {
  const age = opts.ageYears;
  if (!Number.isFinite(age) || age < 0) {
    throw new Error("invalid_caprini_2005_inputs");
  }

  const points = {};
  let total = computeCapriniAgePoints(age);
  if (total > 0) {
    points.age = total;
  }

  total += sumCapriniFlags(opts, ONE_POINT, points);
  total += sumCapriniFlags(opts, TWO_POINT, points);
  total += sumCapriniFlags(opts, THREE_POINT, points);
  total += sumCapriniFlags(opts, FIVE_POINT, points);

  const risk = interpretCaprini2005Risk(total);
  return { total, points, ...risk };
}



  return {
    interpretCaprini2005Risk: interpretCaprini2005Risk,
    computeCaprini2005: computeCaprini2005,
    parseCapriniAge: parseCapriniAge,
  };
});
