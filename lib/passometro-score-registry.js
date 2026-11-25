/**
 * Registry de scores do passômetro (entry + patient).
 * Patient scores podem ser registados via registerPatientEvaluator (web).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroScoreRegistry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var patientEvaluators = Object.create(null);

  function getEntryScores() {
    if (typeof module !== "undefined" && module.exports) {
      return require("./passometro-entry-scores.js");
    }
    return globalThis.AghuPassometroEntryScores;
  }

  var SCORE_CATALOG = [
    {
      scoreId: "news2",
      label: "NEWS2",
      scope: "entry",
      defaultParams: { consciousness: "alert", supplementalO2: false },
    },
    {
      scoreId: "qsofa",
      label: "qSOFA",
      scope: "entry",
      defaultParams: { alteredMentation: false },
    },
    {
      scoreId: "tfg",
      label: "TFG (CKD-EPI)",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "meld",
      label: "MELD",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry", onDialysis: false },
    },
    {
      scoreId: "cockcroft",
      label: "Cockcroft-Gault",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "acid-base",
      label: "Equilíbrio ácido-base",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "na-corr",
      label: "Na corr.",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "ca-corr",
      label: "Ca corr.",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "ldl",
      label: "LDL (Friedewald)",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "chads",
      label: "CHA₂DS₂-VASc",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        chf: false,
        hypertension: false,
        diabetes: false,
        strokeTia: false,
        vascularDisease: false,
      },
    },
    {
      scoreId: "has-bled",
      label: "HAS-BLED",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        hypertension: false,
        renalDisease: false,
        liverDisease: false,
        stroke: false,
        bleeding: false,
        labileInr: false,
        drugs: false,
        alcohol: false,
      },
    },
    {
      scoreId: "child-pugh",
      label: "Child-Pugh",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        ascites: "none",
        encephalopathy: "none",
      },
    },
    {
      scoreId: "curb65",
      label: "CURB-65",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry", confusion: false },
    },
    {
      scoreId: "fena",
      label: "FENa",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "free-water",
      label: "Déficit água livre",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "urea-cr",
      label: "Ureia/Creatinina",
      scope: "patient",
      placement: "entry",
      defaultParams: { display: "entry" },
    },
    {
      scoreId: "padua",
      label: "Padua (TEV)",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        activeCancer: false,
        previousVte: false,
        reducedMobility: false,
        knownThrombophilia: false,
        recentTraumaSurgery: false,
        heartRespFailure: false,
        acuteMiStroke: false,
        acuteInfectionRheum: false,
        obesity: false,
        hormonalTherapy: false,
      },
    },
    {
      scoreId: "caprini-2005",
      label: "Caprini 2005",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        minorSurgery: false,
        bmiOver25: false,
        swollenLegs: false,
        varicoseVeins: false,
        pregnancyPostpartum: false,
        oralContraceptivesHrt: false,
        sepsis: false,
        seriousLungDisease: false,
        abnormalPulmonaryFunction: false,
        acuteMi: false,
        chf: false,
        ibd: false,
        bedRestMedical: false,
        otherRiskFactors: false,
        arthroscopicSurgery: false,
        malignancy: false,
        laparoscopicSurgery: false,
        majorSurgery: false,
        plasterCast: false,
        centralVenousAccess: false,
        historyVte: false,
        familyHistoryVte: false,
        factorVLeiden: false,
        prothrombin20210a: false,
        lupusAnticoagulant: false,
        anticardiolipin: false,
        hit: false,
        otherThrombophilia: false,
        stroke: false,
        electiveJointArthroplasty: false,
        hipPelvisLegFracture: false,
        spinalCordInjury: false,
      },
    },
    {
      scoreId: "caprini-2013",
      label: "Caprini 2013",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        minorSurgery: false,
        majorSurgeryPastMonth: false,
        varicoseVeins: false,
        ibd: false,
        swollenLegs: false,
        bmi25: false,
        chf: false,
        seriousInfection: false,
        lungDisease: false,
        bedRestUnder72h: false,
        bmiOver40: false,
        insulinDiabetes: false,
        chemotherapy: false,
        bloodTransfusion: false,
        surgeryOver2h: false,
        hormoneUse: false,
        pregnancyPostpartum: false,
        pregnancyLoss: false,
        malignancy: false,
        plannedMajorSurgery: false,
        plasterCast: false,
        centralVenousAccess: false,
        bedRest72hOrMore: false,
        historyVte: false,
        familyHistoryVte: false,
        knownThrombophilia: false,
        electiveJointArthroplasty: false,
        hipPelvisLegFracture: false,
        seriousTrauma: false,
        spinalCordInjury: false,
      },
    },
    {
      scoreId: "kdigo",
      label: "KDIGO LRA",
      scope: "patient",
      placement: "entry",
      defaultParams: {
        display: "entry",
        onRrt: false,
      },
    },
  ];

  /**
   * Secção do template para um score (cabeçalho vs grelha de controles).
   * @param {object|null} meta entrada do SCORE_CATALOG
   * @param {{ section?: string }} opts
   */
  function resolveScoreSection(meta, opts) {
    opts = opts || {};
    if (opts.section === "header" || opts.section === "entry") {
      return opts.section;
    }
    if (!meta) return "entry";
    if (meta.placement === "header") return "header";
    if (meta.placement === "entry") return "entry";
    if (meta.defaultParams && meta.defaultParams.display === "entry") {
      return "entry";
    }
    if (meta.scope === "entry") return "entry";
    return "entry";
  }

  function catalogById(scoreId) {
    for (var i = 0; i < SCORE_CATALOG.length; i++) {
      if (SCORE_CATALOG[i].scoreId === scoreId) return SCORE_CATALOG[i];
    }
    return null;
  }

  function registerPatientEvaluator(scoreId, fn) {
    if (typeof fn === "function") {
      patientEvaluators[scoreId] = fn;
    }
  }

  function missingDisplay(detail) {
    return { status: "missing", display: "—", detail: detail || "Incompleto" };
  }

  function evaluateEntryScore(scoreId, context) {
    context = context || {};
    var entry = context.entry;
    var scoreParams = context.scoreParams || {};
    var entryScores = getEntryScores();
    if (!entryScores) return missingDisplay("Score indisponível");

    if (scoreId === "news2") {
      var news = entryScores.buildNews2AssessmentForEntry(entry, scoreParams);
      return entryScores.formatNews2Display(news);
    }
    if (scoreId === "qsofa") {
      var q = entryScores.buildQsofaAssessmentForEntry(entry, scoreParams);
      return entryScores.formatQsofaDisplay(q);
    }
    return missingDisplay("Score desconhecido");
  }

  function evaluatePatientScore(scoreId, context) {
    context = context || {};
    var scoreParams = context.scoreParams || {};
    var preferDataISO = context.preferDataISO || null;
    var entry = context.entry || null;
    var usePrecomputed =
      !preferDataISO &&
      !entry &&
      context.precomputed &&
      context.precomputed[scoreId];
    if (patientEvaluators[scoreId]) {
      try {
        var out = patientEvaluators[scoreId](context);
        if (out && out.display != null) return out;
      } catch (_e) {
        return missingDisplay("Erro ao calcular");
      }
    }
    if (usePrecomputed && context.precomputed[scoreId].display) {
      return context.precomputed[scoreId];
    }
    return missingDisplay("Dados incompletos");
  }

  function evaluateScoreField(fieldDef, snap, context) {
    context = context || {};
    if (!fieldDef || fieldDef.kind !== "score") {
      return missingDisplay();
    }
    var scoreId = fieldDef.scoreId;
    if (!scoreId) return missingDisplay();
    var meta = catalogById(scoreId);
    var scoreParams = fieldDef.scoreParams || {};
    var entry = context.entry || snap.entry;
    var preferDataISO = context.preferDataISO || null;
    if (meta && meta.scope === "patient") {
      var inEntryGrid =
        fieldDef.section === "entry" || context.section === "entry";
      return evaluatePatientScore(scoreId, {
        header: snap && snap.header,
        exams: context.exams,
        pii: context.pii,
        controles: context.controles,
        passometro: context.passometro,
        scoreParams: scoreParams,
        precomputed: inEntryGrid ? null : context.precomputed,
        preferDataISO: inEntryGrid ? preferDataISO : null,
        entry: inEntryGrid ? entry : null,
      });
    }
    return evaluateEntryScore(scoreId, {
      entry: entry,
      header: snap && snap.header,
      scoreParams: scoreParams,
    });
  }

  return {
    SCORE_CATALOG: SCORE_CATALOG,
    catalogById: catalogById,
    resolveScoreSection: resolveScoreSection,
    registerPatientEvaluator: registerPatientEvaluator,
    evaluateEntryScore: evaluateEntryScore,
    evaluatePatientScore: evaluatePatientScore,
    evaluateScoreField: evaluateScoreField,
  };
});
