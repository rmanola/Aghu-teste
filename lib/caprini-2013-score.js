/**
 * Ported from web/lib/patient-records/caprini-2013-score.mjs
 * @sync web/lib/patient-records/caprini-2013-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCaprini2013Score = api;
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
  var normalizeSex = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeSex;
  var _mod_CapriniShared = loadMod(root, "caprini-shared.js", "AghuCapriniShared");
  var computeCapriniAgePoints = _mod_CapriniShared && _mod_CapriniShared.computeCapriniAgePoints;
  var parseCapriniAge = _mod_CapriniShared && _mod_CapriniShared.parseCapriniAge;
  var sumCapriniFlags = _mod_CapriniShared && _mod_CapriniShared.sumCapriniFlags;



const ONE_POINT = [
  ["minorSurgery", 1],
  ["majorSurgeryPastMonth", 1],
  ["varicoseVeins", 1],
  ["ibd", 1],
  ["swollenLegs", 1],
  ["bmi25", 1],
  ["chf", 1],
  ["seriousInfection", 1],
  ["lungDisease", 1],
  ["bedRestUnder72h", 1],
  ["bmiOver40", 1],
  ["insulinDiabetes", 1],
  ["chemotherapy", 1],
  ["bloodTransfusion", 1],
  ["surgeryOver2h", 1],
];

const ONE_POINT_FEMALE = [
  ["hormoneUse", 1],
  ["pregnancyPostpartum", 1],
  ["pregnancyLoss", 1],
];

const TWO_POINT = [
  ["malignancy", 2],
  ["plannedMajorSurgery", 2],
  ["plasterCast", 2],
  ["centralVenousAccess", 2],
  ["bedRest72hOrMore", 2],
];

const THREE_POINT = [
  ["historyVte", 3],
  ["familyHistoryVte", 3],
  ["knownThrombophilia", 3],
];

const FIVE_POINT = [
  ["electiveJointArthroplasty", 5],
  ["hipPelvisLegFracture", 5],
  ["seriousTrauma", 5],
  ["spinalCordInjury", 5],
];

/**
 * @param {number} total
 */
function interpretCaprini2013Risk(total) {
  if (total >= 5) {
    return {
      riskLevel: "muito_alto",
      highRisk: true,
      prophylaxisHint:
        "Risco muito alto — profilaxia farmacológica + mecânica; considerar extensão pós-alta",
    };
  }
  if (total >= 3) {
    return {
      riskLevel: "alto",
      highRisk: true,
      prophylaxisHint: "Risco alto — profilaxia farmacológica recomendada",
    };
  }
  if (total === 2) {
    return {
      riskLevel: "moderado",
      highRisk: false,
      prophylaxisHint: "Risco moderado — mecânica ou farmacológica",
    };
  }
  return {
    riskLevel: "baixo",
    highRisk: false,
    prophylaxisHint: "Risco baixo/muito baixo — deambulação precoce",
  };
}

function computeCaprini2013(opts) {
  const age = opts.ageYears;
  if (!Number.isFinite(age) || age < 0) {
    throw new Error("invalid_caprini_2013_inputs");
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

  const sex = opts.sex === "F" || opts.sex === "M" ? opts.sex : null;
  if (sex === "F") {
    total += sumCapriniFlags(opts, ONE_POINT_FEMALE, points);
  }

  const risk = interpretCaprini2013Risk(total);
  return { total, points, ...risk };
}

function buildCaprini2013SuggestedAgeSex(
  passometroHeader,
  pii,
  referenceDateISO,
) {
  const suggested = {};
  const age = parseCapriniAge(passometroHeader, pii, referenceDateISO);
  if (age != null) suggested.ageYears = age;
  const sex = normalizeSex(pii && pii.sexo);
  if (sex) suggested.sex = sex;
  return suggested;
}



  return {
    interpretCaprini2013Risk: interpretCaprini2013Risk,
    computeCaprini2013: computeCaprini2013,
    buildCaprini2013SuggestedAgeSex: buildCaprini2013SuggestedAgeSex,
    parseCapriniAge: parseCapriniAge,
  };
});
