/**
 * FEAT-115/117/118/119/124/125/146 — Biblioteca declarativa de indicadores CPI (5 dimensões).
 * expectedRate resolve-se por referenceId (cpi-reference-registry).
 * Seed FEAT-117 (CG-*) + FEAT-118 (CAD-*) + FEAT-119 (NEF-*) + FEAT-124 (expansão)
 * + FEAT-146 (CAD-pan-*); helpers KDIGO/recuperação/hiperK.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiIndicatorLibrary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DIMENSIONS = ["outcome", "process", "safety", "efficiency", "value"];
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var READMISSION_WINDOW_DAYS = 30;
  var KNOWN_RISK_MODELS = {
    charlson: true,
    meld: true,
    kdigo: true,
    tnm: true,
    ecog: true,
    bisap: true,
    tokyo: true,
    sofa: true,
    apache2: true,
    nihss: true,
  };


  function loadRegistry() {
    if (typeof require === "function") {
      try {
        var mod = require("./cpi-reference-registry.js");
        if (mod && typeof mod === "object") return mod;
      } catch (_e) { /* fall through */ }
    }
    return (
      (root && root.AghuCpiReferenceRegistry) ||
      (typeof globalThis !== "undefined" && globalThis.AghuCpiReferenceRegistry) ||
      null
    );
  }

  var referenceRegistryApi = loadRegistry();

  /** Templates FEAT-117 — 9 tipos × 3 linhas = 27 IDs CG-{ape|col|her}-*. */
  var CG_LINE_SPECS = [
    {
      slug: "ape",
      careLineId: "cg_apendicite_aguda",
      referenceId: "nsqip-2023-appendectomy-mortality",
      safReferenceId: "nsqip-clavien-gte3-appendectomy",
    },
    {
      slug: "col",
      careLineId: "cg_colecistite_aguda",
      referenceId: "nsqip-2023-cholecystectomy-mortality",
      safReferenceId: "nsqip-clavien-gte3-cholecystectomy",
    },
    {
      slug: "her",
      careLineId: "cg_hernias_abdominais",
      referenceId: "nsqip-2023-hernia-repair-mortality",
      safReferenceId: "nsqip-clavien-gte3-hernia",
    },
  ];

  function buildCgIndicatorsForLine(spec) {
    var prefix = "CG-" + spec.slug + "-";
    var lineId = spec.careLineId;
    return [
      {
        id: prefix + "OUT-01",
        careLineId: lineId,
        dimension: "outcome",
        label: "Mortalidade intra-hospitalar",
        numerator: { source: "facts.deathEvents", predicate: "inPeriod" },
        denominator: { source: "careLine.units" },
        exclusions: ["episode.endedAt == null"],
        direction: "lower_is_better",
        riskModel: "charlson",
        stratifyBy: ["charlsonBand"],
        expectedRate: {
          source: "literature",
          referenceId: spec.referenceId,
          populationFit: "approximate",
          populationFitReason:
            "Registo ACS NSQIP (EUA) vs coorte hospitalar local; janela NSQIP tipicamente 30d vs mortalidade intra-hospitalar CPI; mix de urgência/electiva pode diferir da linha de cuidado.",
        },
        requiredFacts: ["deathEvents", "hospEpisodes"],
        status: "feasible",
      },
      {
        id: prefix + "OUT-02",
        careLineId: lineId,
        dimension: "outcome",
        label: "Readmissão não planeada em 30 dias",
        numerator: {
          source: "facts.hospEpisodes",
          predicate: "isReadmissionWithin30Days",
        },
        denominator: {
          source: "facts.hospEpisodes",
          predicate: "indexWithEndedAt",
        },
        exclusions: ["episode.endedAt == null"],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["hospEpisodes"],
        status: "feasible",
      },
      {
        id: prefix + "PRO-01",
        careLineId: lineId,
        dimension: "process",
        label: "Via de acesso minimamente invasiva",
        numerator: {
          source: "facts.cirInPeriod",
          predicate: "minimallyInvasiveAccess",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "higher_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["cirInPeriod"],
        status: "partial",
      },
      {
        id: prefix + "PRO-02",
        careLineId: lineId,
        dimension: "process",
        label: "Tempo entre diagnóstico e cirurgia",
        numerator: {
          source: "facts.dxInPeriod",
          predicate: "diagnosisToSurgeryHours",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["dxInPeriod", "cirInPeriod"],
        status: "partial",
      },
      {
        id: prefix + "SAF-01",
        careLineId: lineId,
        dimension: "safety",
        label: "Complicações Clavien ≥ III",
        numerator: {
          source: "facts.compEvents",
          predicate: "computeClavienGte3",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: spec.safReferenceId
          ? {
              source: "literature",
              referenceId: spec.safReferenceId,
              populationFit: "approximate",
              populationFitReason:
                "Taxa esperada de Clavien ≥ III por linha CG — valor numérico por curar (especialista-medico); referência declarada sem inventar benchmark.",
            }
          : null,
        requiredFacts: ["compEvents"],
        status: "partial",
      },
      {
        id: prefix + "SAF-02",
        careLineId: lineId,
        dimension: "safety",
        label: "Reoperação no mesmo internamento",
        numerator: {
          source: "facts.cirInPeriod",
          predicate: "reoperationSameAdmission",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["cirInPeriod"],
        status: "partial",
      },
      {
        id: prefix + "SAF-03",
        careLineId: lineId,
        dimension: "safety",
        label: "Admissão não planeada em UTI",
        numerator: {
          source: "facts.icuAdmissions",
          predicate: "unplanned",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["icuAdmissions"],
        status: "feasible",
      },
      {
        id: prefix + "EFF-01",
        careLineId: lineId,
        dimension: "efficiency",
        label: "Tempo de internamento pós-operatório",
        numerator: {
          source: "facts.hospEpisodes",
          predicate: "calendarLosDays",
        },
        denominator: { source: "careLine.units" },
        exclusions: ["episode.endedAt == null"],
        direction: "lower_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["hospEpisodes"],
        status: "feasible",
      },
      {
        id: prefix + "VAL-01",
        careLineId: lineId,
        dimension: "value",
        label: "Complicações evitadas por dia de internamento",
        numerator: {
          source: "derived",
          predicate: "avoidedComplicationsPerLosDay",
        },
        denominator: { source: "careLine.units" },
        exclusions: [],
        direction: "higher_is_better",
        riskModel: null,
        stratifyBy: [],
        expectedRate: null,
        requiredFacts: ["avoidedComplicationsPerLosDay"],
        status: "blocked",
        blockedReason:
          "depende de CG-SAF-01 (Clavien ≥ III) subir a feasible e de campo derivado avoidedComplicationsPerLosDay",
        missingFields: [
          "avoidedComplicationsPerLosDay",
          "CG-SAF-01.feasible",
        ],
      },
    ];
  }

  function buildCgIndicators() {
    var out = [];
    for (var i = 0; i < CG_LINE_SPECS.length; i++) {
      out = out.concat(buildCgIndicatorsForLine(CG_LINE_SPECS[i]));
    }
    return out;
  }

  /** Seed FEAT-118 — 12 indicadores CAD-* (Aparelho Digestivo). */
  var CAD_INDICATORS = [
    {
      id: "CAD-OUT-01",
      careLineId: "cad_duodenopancreatectomia",
      dimension: "outcome",
      label: "Mortalidade em 90 dias",
      numerator: { source: "facts.deathEvents", predicate: "within90dOfIndex" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "charlson",
      stratifyBy: ["charlsonBand"],
      expectedRate: {
        source: "literature",
        referenceId: "era-whipple-90d-mortality",
        populationFit: "approximate",
        populationFitReason:
          "Síntese ERA/ACS (centros mistos), não coorte única; valor 5% alinha ao alvo intra-hospitalar CPI § 2.5 enquanto o indicador mede 90 dias (alvo doc <7%).",
      },
      requiredFacts: ["deathEvents", "hospEpisodes"],
      status: "feasible",
      hpbIndicatorKey: "mortalidade90d",
    },
    {
      id: "CAD-OUT-02",
      careLineId: "cad_cancer_colorretal",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar",
      numerator: { source: "facts.deathEvents", predicate: "inHospital" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "charlson",
      stratifyBy: ["charlsonBand"],
      expectedRate: {
        source: "literature",
        referenceId: "nsqip-2023-colorectal-mortality",
        populationFit: "approximate",
        populationFitReason:
          "ACS NSQIP EUA vs coorte local; CPI § 2.4 referencia mortalidade 30d (<3%) e o indicador usa mortalidade intra-hospitalar (proxy).",
      },
      requiredFacts: ["deathEvents", "hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-OUT-03",
      careLineId: "cad_cirrose_hepatica",
      dimension: "outcome",
      label: "Sobrevida livre de descompensação",
      numerator: {
        source: "facts.longitudinalFollowup",
        predicate: "decompensationFree",
      },
      denominator: { source: "facts.longitudinalFollowup", predicate: "closedMilestones" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: "meld",
      stratifyBy: ["meldBand"],
      labWindowDays: 7,
      expectedRate: null,
      requiredFacts: ["bilirubinMgDl", "inr", "creatinineMgDl"],
      status: "partial",
    },
    {
      id: "CAD-PRO-01",
      careLineId: "cad_cirrose_hepatica",
      dimension: "process",
      label: "Rastreio endoscópico de varizes",
      numerator: { source: "facts.processFlags", predicate: "egdVarices" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["processFlags"],
      status: "partial",
    },
    {
      id: "CAD-PRO-02",
      careLineId: "cad_cancer_colorretal",
      dimension: "process",
      label: "Discussão em equipa multidisciplinar",
      numerator: { source: "facts.capture", predicate: "mdtDiscussed" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "CAD-PRO-03",
      careLineId: "cad_cancer_colorretal",
      careLineIds: ["cad_cancer_colorretal", "cad_esofagogastrica"],
      dimension: "process",
      label: "Performance status (ECOG) registado",
      numerator: { source: "facts.capture", predicate: "ecogRegistered" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "CAD-PRO-04",
      careLineId: "cad_cancer_colorretal",
      dimension: "process",
      label: "Estadiamento oncológico (TNM) documentado",
      numerator: { source: "facts.capture", predicate: "documented" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "CAD-PRO-05",
      careLineId: "cad_cancer_colorretal",
      dimension: "process",
      label: "Adesão à decisão do MDT",
      numerator: {
        source: "facts.capture",
        predicate: "mdtDecisionFollowed",
      },
      denominator: {
        source: "facts.capture",
        predicate: "mdtDiscussedTrue",
      },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "CAD-SAF-01",
      careLineId: "cad_duodenopancreatectomia",
      careLineIds: ["cad_duodenopancreatectomia", "cad_cancer_colorretal"],
      dimension: "safety",
      label: "Complicações Clavien ≥ III",
      numerator: { source: "facts.clavienEvents", predicate: "gte3" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["clavienEvents"],
      status: "partial",
      hpbIndicatorKey: "clavienGte3",
    },
    {
      id: "CAD-SAF-02",
      careLineId: "cad_duodenopancreatectomia",
      careLineIds: ["cad_duodenopancreatectomia", "cad_cancer_colorretal"],
      dimension: "safety",
      label: "Reoperação não planeada",
      numerator: { source: "facts.reoperationEvents", predicate: "unplanned" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["reoperationEvents"],
      status: "partial",
      hpbIndicatorKey: "reoperacao",
    },
    {
      id: "CAD-SAF-03",
      careLineId: "cad_cancer_colorretal",
      careLineIds: [
        "cad_cancer_colorretal",
        "cad_duodenopancreatectomia",
        "cad_cirrose_hepatica",
      ],
      dimension: "safety",
      label: "Admissão não planeada em UTI",
      numerator: {
        source: "facts.icuAdmissions",
        predicate: "unplanned",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "CAD-EFF-01",
      careLineId: "cad_cancer_colorretal",
      careLineIds: [
        "cad_cancer_colorretal",
        "cad_duodenopancreatectomia",
        "cad_cirrose_hepatica",
      ],
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: { source: "facts.hospEpisodes", predicate: "losDays" },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-EFF-02",
      careLineId: "cad_cancer_colorretal",
      careLineIds: [
        "cad_cancer_colorretal",
        "cad_duodenopancreatectomia",
        "cad_cirrose_hepatica",
      ],
      dimension: "efficiency",
      label: "Readmissão em 30 dias",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "isReadmissionWithin30Days",
      },
      denominator: { source: "facts.hospEpisodes", predicate: "indexWithEndedAt" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
      hpbIndicatorKey: "readmissao30d",
    },
    {
      id: "CAD-VAL-01",
      careLineId: "cad_cancer_colorretal",
      careLineIds: ["cad_cancer_colorretal", "cad_duodenopancreatectomia"],
      dimension: "value",
      label: "Margem R0 por caso oncológico",
      numerator: { source: "facts.capture", predicate: "margemR0" },
      denominator: { source: "careLine.units" },
      exclusions: ["margemR0 == 'nao_avaliavel'"],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "feasible",
      hpbIndicatorKey: "margemR0",
    },
    {
      id: "CAD-VAL-02",
      careLineId: "cad_duodenopancreatectomia",
      careLineIds: ["cad_duodenopancreatectomia", "cad_cancer_colorretal"],
      dimension: "value",
      label: "Textbook outcome",
      numerator: { source: "hpb.crf", predicate: "textbookOutcome" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      requiredFacts: [],
      status: "blocked",
      blockedReason:
        "textbook outcome só disponível via CRF HPB (composto Clavien/reop/readmissão/óbito)",
      hpbIndicatorKey: "textbookOutcome",
    },
  ];

  /** Seed FEAT-119 — 10 indicadores NEF-*. */
  var NEF_INDICATORS = [
    {
      id: "NEF-OUT-01",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar por estádio KDIGO",
      numerator: { source: "facts.deathEvents", predicate: "inHospital" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "kdigo",
      stratifyBy: ["kdigoStage"],
      expectedRate: {
        source: "literature",
        referenceId: "kdigo-aki-inhospital-mortality",
        populationFit: "approximate",
        populationFitReason:
          "Taxa agregada 20% para todos os estádios; CPI § 2.8 distingue <15% (KDIGO 1) vs <25% (2–3). KDIGO define estádio, não a taxa esperada — síntese de curadoria.",
      },
      requiredFacts: ["deathEvents"],
      requiredSeries: ["creatinina"],
      status: "feasible",
    },
    {
      id: "NEF-OUT-02",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "outcome",
      label: "Recuperação de função renal na alta",
      numerator: {
        source: "labSeries.creatinina",
        predicate: "renalRecoveryFromSeries",
      },
      denominator: {
        source: "labSeries.creatinina",
        predicate: "recoveryAssessable",
      },
      exclusions: ["recovery == null"],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      requiredSeries: ["creatinina"],
      status: "partial",
    },
    {
      id: "NEF-OUT-03",
      careLineId: "nef_doenca_renal_cronica",
      dimension: "outcome",
      label: "Progressão de estádio de TFG",
      numerator: {
        source: "facts.longitudinalFollowup",
        predicate: "egfrStageProgressed",
      },
      denominator: { source: "facts.longitudinalFollowup", predicate: "closedMilestones" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: ["egfrStage"],
      expectedRate: null,
      requiredFacts: [],
      requiredSeries: ["creatinina"],
      status: "partial",
    },
    {
      id: "NEF-PRO-01",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "process",
      label: "Estadiamento KDIGO documentado",
      numerator: {
        source: "labSeries.creatinina",
        predicate: "kdigoStageDocumented",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      requiredSeries: ["creatinina"],
      status: "feasible",
    },
    {
      id: "NEF-PRO-02",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "process",
      label: "Suspensão de nefrotóxicos",
      numerator: {
        source: "facts.capture",
        predicate: "nephrotoxinHeld",
      },
      denominator: { source: "careLine.units" },
      exclusions: ["nephrotoxinSuspended == 'not_applicable'"],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "NEF-SAF-01",
      careLineId: "nef_lesao_renal_aguda",
      careLineIds: ["nef_lesao_renal_aguda", "nef_doenca_renal_cronica"],
      dimension: "safety",
      label: "Hipercalemia grave (K ≥ 6,5)",
      numerator: {
        source: "labSeries.potassio",
        predicate: "hasSevereHyperkalemia",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      requiredSeries: ["potassio"],
      status: "feasible",
    },
    {
      id: "NEF-SAF-02",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "safety",
      label: "LRA associada a contraste",
      numerator: {
        source: "facts.capture",
        predicate: "contrastAssociatedAki",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      referenceId: "contrast-aki-window-72h",
      status: "feasible",
    },
    {
      id: "NEF-EFF-01",
      careLineId: "nef_lesao_renal_aguda",
      careLineIds: ["nef_lesao_renal_aguda", "nef_doenca_renal_cronica"],
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: { source: "facts.hospEpisodes", predicate: "calendarLosDays" },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "NEF-EFF-02",
      careLineId: "nef_lesao_renal_aguda",
      careLineIds: ["nef_lesao_renal_aguda", "nef_doenca_renal_cronica"],
      dimension: "efficiency",
      label: "Tempo de internamento em UTI",
      numerator: { source: "facts.icuAdmissions", predicate: "losDays" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "NEF-VAL-01",
      careLineId: "nef_lesao_renal_aguda",
      dimension: "value",
      label: "Função renal preservada por dia de internamento",
      numerator: {
        source: "indicators.NEF-OUT-02",
        predicate: "recoveryPerLosDay",
      },
      denominator: { source: "indicators.NEF-EFF-01" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      status: "blocked",
      blockedReason: "depende de NEF-OUT-02 (recuperação) estabilizado na coorte",
    },
  ];

  /** FEAT-124 — indicadores das 4 linhas candidatas (blocked onde falta facto). */
  var EXPANSION_INDICATORS = [
    // cg_abdome_agudo_obstrucao
    {
      id: "CG-obs-OUT-01",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar",
      numerator: { source: "facts.deathEvents", predicate: "inPeriod" },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: "charlson",
      stratifyBy: ["charlsonBand"],
      expectedRate: null,
      requiredFacts: ["deathEvents", "hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CG-obs-OUT-02",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "outcome",
      label: "Readmissão não planeada em 30 dias",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "isReadmissionWithin30Days",
      },
      denominator: {
        source: "facts.hospEpisodes",
        predicate: "indexWithEndedAt",
      },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CG-obs-PRO-01",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "process",
      label: "Tempo porta-cirurgia",
      numerator: {
        source: "facts.dxInPeriod",
        predicate: "doorToSurgeryHours",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["doorToSurgeryHours"],
      status: "blocked",
      blockedReason: "sem registo de tempo porta-cirurgia no caminho automático AGHU",
      missingFields: ["doorToSurgeryHours"],
    },
    {
      id: "CG-obs-SAF-01",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "safety",
      label: "Reoperação no mesmo internamento",
      numerator: {
        source: "facts.cirInPeriod",
        predicate: "reoperationSameAdmission",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["cirInPeriod"],
      status: "partial",
    },
    {
      id: "CG-obs-SAF-02",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "safety",
      label: "Complicações Clavien ≥ III",
      numerator: {
        source: "facts.compEvents",
        predicate: "computeClavienGte3",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["compEvents"],
      status: "partial",
    },
    {
      id: "CG-obs-EFF-01",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "calendarLosDays",
      },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CG-obs-VAL-01",
      careLineId: "cg_abdome_agudo_obstrucao",
      dimension: "value",
      label: "Custo por episódio",
      numerator: { source: "facts.cost", predicate: "episodeCost" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["episodeCost"],
      status: "blocked",
      blockedReason: "sem dado de custo hospitalar no repo",
      missingFields: ["episodeCost"],
    },
    // cad_esofagogastrica
    {
      id: "CAD-eso-OUT-01",
      careLineId: "cad_esofagogastrica",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar",
      numerator: { source: "facts.deathEvents", predicate: "inHospital" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "charlson",
      stratifyBy: ["charlsonBand"],
      expectedRate: null,
      requiredFacts: ["deathEvents", "hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-eso-OUT-02",
      careLineId: "cad_esofagogastrica",
      dimension: "outcome",
      label: "Readmissão não planeada em 30 dias",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "isReadmissionWithin30Days",
      },
      denominator: {
        source: "facts.hospEpisodes",
        predicate: "indexWithEndedAt",
      },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-eso-PRO-01",
      careLineId: "cad_esofagogastrica",
      dimension: "process",
      label: "Estadiamento oncológico documentado",
      numerator: { source: "facts.capture", predicate: "documented" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      status: "feasible",
    },
    {
      id: "CAD-eso-SAF-01",
      careLineId: "cad_esofagogastrica",
      dimension: "safety",
      label: "Complicações Clavien ≥ III",
      numerator: { source: "facts.clavienEvents", predicate: "gte3" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["clavienEvents"],
      status: "partial",
    },
    {
      id: "CAD-eso-SAF-02",
      careLineId: "cad_esofagogastrica",
      dimension: "safety",
      label: "Admissão não planeada em UTI",
      numerator: {
        source: "facts.icuAdmissions",
        predicate: "unplanned",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "CAD-eso-EFF-01",
      careLineId: "cad_esofagogastrica",
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: { source: "facts.hospEpisodes", predicate: "losDays" },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-eso-EFF-02",
      careLineId: "cad_esofagogastrica",
      dimension: "efficiency",
      label: "Tempo de internamento em UTI",
      numerator: { source: "facts.icuAdmissions", predicate: "losDays" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "CAD-eso-VAL-01",
      careLineId: "cad_esofagogastrica",
      dimension: "value",
      label: "Custo por episódio",
      numerator: { source: "facts.cost", predicate: "episodeCost" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["episodeCost"],
      status: "blocked",
      blockedReason: "sem dado de custo hospitalar no repo",
      missingFields: ["episodeCost"],
    },
    // sep_sepse_choque
    {
      id: "SEP-OUT-01",
      careLineId: "sep_sepse_choque",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar",
      numerator: { source: "facts.deathEvents", predicate: "inHospital" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "charlson",
      stratifyBy: ["charlsonBand"],
      expectedRate: null,
      requiredFacts: ["deathEvents", "hospEpisodes"],
      status: "feasible",
    },
    {
      id: "SEP-PRO-01",
      careLineId: "sep_sepse_choque",
      dimension: "process",
      label: "Antibiótico na primeira hora",
      numerator: {
        source: "facts.prescriptions",
        predicate: "antibioticWithin1h",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["antibioticAdministeredAt"],
      status: "blocked",
      blockedReason: "sem hora de antibiótico no caminho automático AGHU",
      missingFields: ["antibioticAdministeredAt"],
    },
    {
      id: "SEP-SAF-01",
      careLineId: "sep_sepse_choque",
      dimension: "safety",
      label: "Admissão não planeada em UTI",
      numerator: {
        source: "facts.icuAdmissions",
        predicate: "unplanned",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "SEP-EFF-01",
      careLineId: "sep_sepse_choque",
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "calendarLosDays",
      },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "SEP-VAL-01",
      careLineId: "sep_sepse_choque",
      dimension: "value",
      label: "Custo por episódio",
      numerator: { source: "facts.cost", predicate: "episodeCost" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["episodeCost"],
      status: "blocked",
      blockedReason: "sem dado de custo hospitalar no repo",
      missingFields: ["episodeCost"],
    },
    // uti_admissao_nao_planeada
    {
      id: "UTI-OUT-01",
      careLineId: "uti_admissao_nao_planeada",
      dimension: "outcome",
      label: "Mortalidade em UTI",
      numerator: { source: "facts.deathEvents", predicate: "inIcu" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["deathEvents", "icuAdmissions"],
      status: "feasible",
    },
    {
      id: "UTI-PRO-01",
      careLineId: "uti_admissao_nao_planeada",
      dimension: "process",
      label: "Escore de gravidade à admissão",
      numerator: {
        source: "facts.icuAdmissions",
        predicate: "severityScoreDocumented",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "higher_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuSeverityScore"],
      status: "blocked",
      blockedReason:
        "sem escore de gravidade à admissão no caminho automático AGHU",
      missingFields: ["icuSeverityScore"],
    },
    {
      id: "UTI-SAF-01",
      careLineId: "uti_admissao_nao_planeada",
      dimension: "safety",
      label: "Readmissão em UTI no mesmo internamento",
      numerator: {
        source: "facts.icuAdmissions",
        predicate: "readmissionSameStay",
      },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "UTI-EFF-01",
      careLineId: "uti_admissao_nao_planeada",
      dimension: "efficiency",
      label: "Tempo de internamento em UTI",
      numerator: { source: "facts.icuAdmissions", predicate: "losDays" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "UTI-VAL-01",
      careLineId: "uti_admissao_nao_planeada",
      dimension: "value",
      label: "Custo por episódio de UTI",
      numerator: { source: "facts.cost", predicate: "icuEpisodeCost" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuEpisodeCost"],
      status: "blocked",
      blockedReason: "sem dado de custo hospitalar no repo",
      missingFields: ["icuEpisodeCost"],
    },
  ];

  /**
   * Seed FEAT-146 — 7 indicadores CAD-pan-*. Sem referenceId (Decisão 2).
   * Consome BISAP (FEAT-144) só via riskModel/stratifyBy — não altera
   * lib/bisap-score.js. CAD-pan-OUT-01 permanece blocked até
   * bisapRiskBand existir no pipeline e parecer clínico (CPIPAN-AC-15).
   */
  var CAD_PAN_INDICATORS = [
    {
      id: "CAD-pan-OUT-01",
      careLineId: "cad_pancreatite_aguda",
      dimension: "outcome",
      label: "Mortalidade intra-hospitalar ajustada por BISAP",
      numerator: { source: "facts.deathEvents", predicate: "inHospital" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: "bisap",
      stratifyBy: ["bisapRiskBand"],
      expectedRate: null,
      requiredFacts: ["deathEvents"],
      status: "blocked",
      blockedReason:
        "depende de lib/bisap-score.js e lib/bisap-assessment.js (FEAT-144); sem o modelo, bisapRiskBand não existe",
      missingFields: ["lib/bisap-score.js", "bisapRiskBand"],
    },
    {
      id: "CAD-pan-OUT-02",
      careLineId: "cad_pancreatite_aguda",
      dimension: "outcome",
      label: "Necrose pancreática infetada ou necessidade de intervenção",
      numerator: { source: "facts.compEvents", predicate: "infectedNecrosisOrIntervention" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      status: "blocked",
      blockedReason:
        "sem campo estruturado de necrose infetada/drenagem/necrosectomia no caminho automático AGHU; requer captura built-in (FEAT-143)",
      missingFields: ["infectedNecrosis (captura FEAT-143)"],
    },
    {
      id: "CAD-pan-OUT-03",
      careLineId: "cad_pancreatite_aguda",
      dimension: "outcome",
      label: "Readmissão não planeada em 30 dias",
      numerator: {
        source: "facts.hospEpisodes",
        predicate: "isReadmissionWithin30Days",
      },
      denominator: {
        source: "facts.hospEpisodes",
        predicate: "indexWithEndedAt",
      },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
    {
      id: "CAD-pan-PRO-01",
      careLineId: "cad_pancreatite_aguda",
      dimension: "process",
      label: "Tempo entre admissão e início de nutrição entérica",
      numerator: { source: "facts.processFlags", predicate: "timeToEnteralNutritionHours" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: [],
      status: "blocked",
      blockedReason: "sem campo de início de dieta/nutrição entérica no caminho automático AGHU",
      missingFields: ["enteralNutritionStartedAt"],
    },
    {
      id: "CAD-pan-PRO-02",
      careLineId: "cad_pancreatite_aguda",
      dimension: "process",
      label: "Tempo entre admissão e colecistectomia na pancreatite biliar",
      numerator: { source: "facts.cirInPeriod", predicate: "cholecystectomyDuringAdmission" },
      denominator: { source: "careLine.units", predicate: "biliaryEtiology" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["cirInPeriod"],
      status: "blocked",
      blockedReason:
        "facet biliaryEtiology inexistente como derivação validada; exige segundo matcher léxico com amostragem de precisão própria antes de restringir o denominador (Decisão 4)",
      missingFields: ["biliaryEtiology"],
    },
    {
      id: "CAD-pan-SAF-01",
      careLineId: "cad_pancreatite_aguda",
      dimension: "safety",
      label: "Admissão não planeada em UTI",
      numerator: { source: "facts.icuAdmissions", predicate: "unplanned" },
      denominator: { source: "careLine.units" },
      exclusions: [],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["icuAdmissions"],
      status: "feasible",
    },
    {
      id: "CAD-pan-EFF-01",
      careLineId: "cad_pancreatite_aguda",
      dimension: "efficiency",
      label: "Tempo de internamento",
      numerator: { source: "facts.hospEpisodes", predicate: "calendarLosDays" },
      denominator: { source: "careLine.units" },
      exclusions: ["episode.endedAt == null"],
      direction: "lower_is_better",
      riskModel: null,
      stratifyBy: [],
      expectedRate: null,
      requiredFacts: ["hospEpisodes"],
      status: "feasible",
    },
  ];

  /** Seed FEAT-117/118/119 + FEAT-124 expansion + FEAT-146 CAD-pan-*. */
  var INDICATORS = buildCgIndicators()
    .concat(CAD_INDICATORS)
    .concat(NEF_INDICATORS)
    .concat(EXPANSION_INDICATORS)
    .concat(CAD_PAN_INDICATORS);

  function loadHpbIndicatorLabels() {
    if (typeof require !== "function") return null;
    try {
      var mod = require("./hpb-indicators.js");
      if (mod && mod.INDICATOR_LABELS && typeof mod.INDICATOR_LABELS === "object") {
        return mod.INDICATOR_LABELS;
      }
    } catch (_e) {
      /* tolerante — se módulo falhar, regra hpbIndicatorKey é ignorada */
    }
    var g =
      (root && root.AghuHpbIndicators) ||
      (typeof globalThis !== "undefined" && globalThis.AghuHpbIndicators) ||
      null;
    if (g && g.INDICATOR_LABELS && typeof g.INDICATOR_LABELS === "object") {
      return g.INDICATOR_LABELS;
    }
    return null;
  }

  function loadComputeMeld() {
    if (typeof require === "function") {
      try {
        var mod = require("./meld-score.js");
        if (mod && typeof mod.computeMeld === "function") return mod.computeMeld;
      } catch (_e) {
        /* fall through */
      }
    }
    var g =
      (root && root.AghuMeldScore) ||
      (typeof globalThis !== "undefined" && globalThis.AghuMeldScore) ||
      null;
    return g && typeof g.computeMeld === "function" ? g.computeMeld : null;
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function parseTime(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    var t = Date.parse(String(v));
    return Number.isFinite(t) ? t : NaN;
  }

  /**
   * Definição canónica de readmissão 30d (CAD-AC-11 / CG-AC-08).
   * Índice precisa de endedAt; candidato com startedAt ∈ (endedAt, endedAt+30d].
   * Índice sem endedAt → false (fora do denominador).
   * @param {{ endedAt?: string|null }} indexEpisode
   * @param {{ startedAt?: string|null }} candidateEpisode
   * @returns {boolean}
   */
  function isReadmissionWithin30Days(indexEpisode, candidateEpisode) {
    var endedAt = parseTime(indexEpisode && indexEpisode.endedAt);
    if (!Number.isFinite(endedAt)) return false;
    var startedAt = parseTime(candidateEpisode && candidateEpisode.startedAt);
    if (!Number.isFinite(startedAt)) return false;
    if (startedAt <= endedAt) return false;
    var windowEnd = endedAt + READMISSION_WINDOW_DAYS * MS_PER_DAY;
    return startedAt <= windowEnd;
  }

  /**
   * Mapeia score MELD para banda CPI.
   * @param {number} meld
   * @returns {"<10"|"10-19"|"20-29"|">=30"}
   */
  function meldScoreToBand(meld) {
    if (meld < 10) return "<10";
    if (meld < 20) return "10-19";
    if (meld < 30) return "20-29";
    return ">=30";
  }

  /**
   * Estratificação MELD (CAD-AC-07/08). Delega a lib/meld-score.js.
   * Labs incompletos → band "unknown" (nunca MELD parcial).
   * @param {{
   *   bilirubinMgDl?: number,
   *   inr?: number,
   *   creatinineMgDl?: number,
   *   onDialysis?: boolean,
   *   collectedAt?: string
   * }|null|undefined} labs
   * @param {{ labWindowDays?: number, episodeStartedAt?: string }|null|undefined} options
   * @returns {{ band: string, meld: number|null, unknown: boolean }}
   */
  function meldBandFromLabs(labs, options) {
    var opts = options && typeof options === "object" ? options : {};
    var body = labs && typeof labs === "object" ? labs : {};
    var bili = Number(body.bilirubinMgDl);
    var inr = Number(body.inr);
    var cr = Number(body.creatinineMgDl);
    if (
      !Number.isFinite(bili) ||
      !Number.isFinite(inr) ||
      !Number.isFinite(cr)
    ) {
      return { band: "unknown", meld: null, unknown: true };
    }

    var windowDays =
      opts.labWindowDays == null ? null : Number(opts.labWindowDays);
    if (
      Number.isFinite(windowDays) &&
      windowDays >= 0 &&
      opts.episodeStartedAt != null &&
      body.collectedAt != null
    ) {
      var epStart = parseTime(opts.episodeStartedAt);
      var collected = parseTime(body.collectedAt);
      if (Number.isFinite(epStart) && Number.isFinite(collected)) {
        var delta = Math.abs(collected - epStart);
        if (delta > windowDays * MS_PER_DAY) {
          return { band: "unknown", meld: null, unknown: true };
        }
      }
    }

    var computeMeld = loadComputeMeld();
    if (!computeMeld) {
      return { band: "unknown", meld: null, unknown: true };
    }
    var meld = computeMeld({
      bilirubinMgDl: bili,
      inr: inr,
      creatinineMgDl: cr,
      onDialysis: !!body.onDialysis,
    });
    if (!Number.isFinite(meld)) {
      return { band: "unknown", meld: null, unknown: true };
    }
    return { band: meldScoreToBand(meld), meld: meld, unknown: false };
  }

  /**
   * @param {string[]} bands
   * @returns {number|null} fracção unknown (null se lista vazia)
   */
  function meldUnknownShare(bands) {
    var list = asArray(bands);
    if (!list.length) return null;
    var unknown = 0;
    for (var i = 0; i < list.length; i++) {
      if (str(list[i]) === "unknown") unknown += 1;
    }
    return unknown / list.length;
  }

  function loadStageKdigoAki() {
    if (typeof require === "function") {
      try {
        var mod = require("./kdigo-aki-stage.js");
        if (mod && typeof mod.stageKdigoAki === "function") return mod.stageKdigoAki;
      } catch (_e) {
        /* fall through */
      }
    }
    var g =
      (root && root.AghuKdigoAkiStage) ||
      (typeof globalThis !== "undefined" && globalThis.AghuKdigoAkiStage) ||
      null;
    return g && typeof g.stageKdigoAki === "function" ? g.stageKdigoAki : null;
  }

  function loadCkdEpi() {
    if (typeof require === "function") {
      try {
        return require("./ckd-epi-egfr.js");
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root.AghuCkdEpiEgfr) ||
      (typeof globalThis !== "undefined" && globalThis.AghuCkdEpiEgfr) ||
      null
    );
  }

  var SEVERE_HYPERK_MEQ_L = 6.5;
  var RECOVERY_FACTOR = 1.25;

  /**
   * Delega a lib/kdigo-aki-stage.js (NEF-AC-06). Não reimplementa limiares.
   * @param {Array<{ value: number, unit?: string, at?: string }>} measurements
   * @param {{ onRrt?: boolean, urineOutput?: object }|null|undefined} options
   * @returns {{
   *   kdigoStage: number|null,
   *   stage: number|null,
   *   reason?: string,
   *   baseline?: number|null,
   *   peak?: number|null,
   *   baselineSource?: string|null,
   *   insufficientSeries: boolean
   * }}
   */
  function kdigoStageFromSeries(measurements, options) {
    var opts = options && typeof options === "object" ? options : {};
    var list = asArray(measurements);
    var stageFn = loadStageKdigoAki();
    if (!stageFn) {
      return {
        kdigoStage: null,
        stage: null,
        reason: "kdigo_module_unavailable",
        insufficientSeries: list.length < 2,
      };
    }
    var result = stageFn({
      measurements: list,
      onRrt: !!opts.onRrt,
      urineOutput: opts.urineOutput,
    });
    var stage =
      result && result.stage != null && Number.isFinite(Number(result.stage))
        ? Number(result.stage)
        : null;
    var insufficient =
      list.length < 2 ||
      (result && str(result.reason) === "insufficient_measurements");
    return {
      kdigoStage: stage,
      stage: stage,
      reason: result && result.reason ? str(result.reason) : undefined,
      baseline: result && result.baseline != null ? result.baseline : null,
      peak: result && result.peak != null ? result.peak : null,
      baselineSource:
        result && result.baselineSource != null ? result.baselineSource : null,
      ratio: result && result.ratio != null ? result.ratio : null,
      insufficientSeries: !!insufficient,
      raw: result,
    };
  }

  /**
   * Recuperação renal (NEF-AC-09/10): discharge ≤ 1.25 × baseline (nadir).
   * Sem medição após o pico → recovery: null (fora num e den).
   * @param {Array<{ value: number, at?: string }>} measurements
   * @returns {{
   *   recovered: boolean|null,
   *   recovery: boolean|null,
   *   baseline: number|null,
   *   peak: number|null,
   *   discharge: number|null,
   *   baselineSource: "nadir"|null
   * }}
   */
  function renalRecoveryFromSeries(measurements) {
    var list = asArray(measurements).filter(function (m) {
      return m && Number.isFinite(Number(m.value));
    });
    if (list.length < 2) {
      return {
        recovered: null,
        recovery: null,
        baseline: null,
        peak: null,
        discharge: null,
        baselineSource: null,
      };
    }
    var values = list.map(function (m) {
      return Number(m.value);
    });
    var baseline = Math.min.apply(null, values);
    var peak = Math.max.apply(null, values);
    var peakIndex = -1;
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i].value) === peak) {
        peakIndex = i;
        break;
      }
    }
    if (peakIndex < 0 || peakIndex >= list.length - 1) {
      return {
        recovered: null,
        recovery: null,
        baseline: baseline,
        peak: peak,
        discharge: null,
        baselineSource: "nadir",
      };
    }
    var discharge = Number(list[list.length - 1].value);
    var recovered = discharge <= RECOVERY_FACTOR * baseline;
    return {
      recovered: recovered,
      recovery: recovered,
      baseline: baseline,
      peak: peak,
      discharge: discharge,
      baselineSource: "nadir",
    };
  }

  /**
   * Hipercalemia grave: qualquer K ≥ 6,5 mEq/L (NEF-AC-11).
   * @param {Array<{ value: number }>} measurements
   * @returns {boolean}
   */
  function hasSevereHyperkalemia(measurements) {
    var list = asArray(measurements);
    for (var i = 0; i < list.length; i++) {
      var v = Number(list[i] && list[i].value);
      if (Number.isFinite(v) && v >= SEVERE_HYPERK_MEQ_L) return true;
    }
    return false;
  }

  /**
   * Estratos KDIGO para O/E (NEF-AC-05/07). stage null → "unstaged" (no denominador).
   * @param {{
   *   cases?: Array<{ observed?: boolean|number, kdigoStage?: number|null }>,
   *   expectedRates?: Record<string, number>
   * }} input
   */
  function buildKdigoStrata(input) {
    var opts = input && typeof input === "object" ? input : {};
    var cases = asArray(opts.cases);
    var expectedRates =
      opts.expectedRates && typeof opts.expectedRates === "object"
        ? opts.expectedRates
        : {};
    var buckets = Object.create(null);
    var unstagedCount = 0;
    var insufficientSeries = 0;

    function ensureBucket(key) {
      if (!buckets[key]) {
        buckets[key] = { key: key, observed: 0, denominator: 0 };
      }
      return buckets[key];
    }

    for (var i = 0; i < cases.length; i++) {
      var c = cases[i] || {};
      var stageRaw = c.kdigoStage;
      var key;
      if (stageRaw == null || stageRaw === "" || !Number.isFinite(Number(stageRaw))) {
        key = "unstaged";
        unstagedCount += 1;
        if (c.insufficientSeries) insufficientSeries += 1;
      } else {
        key = String(Number(stageRaw));
      }
      var obs = c.observed;
      var observedN =
        typeof obs === "boolean" ? (obs ? 1 : 0) : Number(obs);
      if (!Number.isFinite(observedN)) observedN = 0;
      var b = ensureBucket(key);
      b.denominator += 1;
      b.observed += observedN;
    }

    var knownKeys = Object.keys(buckets).filter(function (k) {
      return k !== "unstaged";
    });
    var knownDen = 0;
    var knownExpectedMass = 0;
    for (var k = 0; k < knownKeys.length; k++) {
      var kk = knownKeys[k];
      var den = buckets[kk].denominator;
      var rate = Number(expectedRates[kk]);
      if (!Number.isFinite(rate)) rate = 0;
      knownDen += den;
      knownExpectedMass += den * rate;
    }
    var weightedUnstaged =
      knownDen > 0 ? knownExpectedMass / knownDen : 0;
    var unstagedRate =
      expectedRates.unstaged != null &&
      Number.isFinite(Number(expectedRates.unstaged))
        ? Number(expectedRates.unstaged)
        : weightedUnstaged;

    var strata = Object.keys(buckets)
      .sort(function (a, b) {
        if (a === "unstaged") return 1;
        if (b === "unstaged") return -1;
        return Number(a) - Number(b);
      })
      .map(function (key) {
        var row = buckets[key];
        var expectedRate =
          key === "unstaged"
            ? unstagedRate
            : Number.isFinite(Number(expectedRates[key]))
              ? Number(expectedRates[key])
              : 0;
        return {
          key: key,
          observed: row.observed,
          denominator: row.denominator,
          expectedRate: expectedRate,
        };
      });

    var total = cases.length;
    return {
      strata: strata,
      unstagedShare: total === 0 ? null : unstagedCount / total,
      insufficientSeries: insufficientSeries,
    };
  }

  /**
   * Delega TFG a lib/ckd-epi-egfr.js (NEF-AC-08) — não reimplementa a equação.
   */
  function computeEgfrFromCreatinine(opts) {
    var ckd = loadCkdEpi();
    if (!ckd || typeof ckd.computeCkdEpiEgfr !== "function") {
      throw new Error("ckd_epi_unavailable");
    }
    return ckd.computeCkdEpiEgfr(opts);
  }

  function classifyEgfrStageDelegated(egfr) {
    var ckd = loadCkdEpi();
    if (!ckd || typeof ckd.classifyEgfrStage !== "function") {
      throw new Error("ckd_epi_unavailable");
    }
    return ckd.classifyEgfrStage(egfr);
  }

  /**
   * @param {string} [careLineId]
   * @param {{ indicators?: object[] }|object[]|null|undefined} optionsOrList
   * @returns {object[]}
   */
  function listIndicators(careLineId, optionsOrList) {
    var list = INDICATORS;
    if (Array.isArray(optionsOrList)) {
      list = optionsOrList;
    } else if (optionsOrList && Array.isArray(optionsOrList.indicators)) {
      list = optionsOrList.indicators;
    }
    var filterId = careLineId == null || careLineId === "" ? null : str(careLineId);
    if (!filterId) return list.slice();
    return list.filter(function (ind) {
      if (!ind) return false;
      if (str(ind.careLineId) === filterId) return true;
      var multi = asArray(ind.careLineIds);
      for (var i = 0; i < multi.length; i++) {
        if (str(multi[i]) === filterId) return true;
      }
      return false;
    });
  }

  /**
   * Valida biblioteca. Falha com { ok: false, errors: string[] }.
   * @param {object[]} [indicators]
   * @param {object[]} [careLines]
   * @returns {{ ok: boolean, errors: string[] }}
   */

  /**
   * Resolve expectedRate via registo (FEAT-125). Sem referenceId → null.
   * @param {object} indicator
   * @param {{ asOfDate?: string }} [options]
   */
  function resolveExpectedRate(indicator, options) {
    if (!indicator || indicator.expectedRate == null) return null;
    var er = indicator.expectedRate;
    if (typeof er !== "object") return null;
    var refId = str(er.referenceId);
    if (!refId) return null;
    if (
      !referenceRegistryApi ||
      typeof referenceRegistryApi.resolveReference !== "function"
    ) {
      return null;
    }
    var entry = referenceRegistryApi.resolveReference(refId, options || {});
    if (!entry) return null;
    var value =
      entry.value != null && Number.isFinite(Number(entry.value))
        ? Number(entry.value)
        : null;
    return {
      value: value,
      range: Array.isArray(entry.range) ? entry.range.slice() : null,
      source: str(er.source) || "literature",
      referenceId: refId,
      populationFit: str(er.populationFit) || "match",
      populationFitReason: er.populationFitReason != null ? str(er.populationFitReason) : null,
      entry: entry,
      stale:
        typeof referenceRegistryApi.isStale === "function"
          ? referenceRegistryApi.isStale(
              entry,
              options && options.asOfDate != null ? options.asOfDate : undefined,
            )
          : false,
    };
  }

  function validateLibrary(indicators, careLines) {
    var inds = asArray(indicators != null ? indicators : INDICATORS);
    var lines = asArray(careLines);
    var lineIds = {};
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] && lines[i].id) lineIds[str(lines[i].id)] = true;
    }
    var errors = [];
    var seenId = {};
    var dimSet = {};
    for (var d = 0; d < DIMENSIONS.length; d++) dimSet[DIMENSIONS[d]] = true;

    var hpbLabels = loadHpbIndicatorLabels();

    for (var j = 0; j < inds.length; j++) {
      var ind = inds[j];
      if (!ind || typeof ind !== "object") {
        errors.push("indicator[" + j + "]: not an object");
        continue;
      }
      var id = str(ind.id);
      if (!id) {
        errors.push("indicator[" + j + "]: missing id");
      } else if (seenId[id]) {
        errors.push("duplicate id: " + id);
      } else {
        seenId[id] = true;
      }

      var dim = str(ind.dimension);
      if (!dimSet[dim]) {
        errors.push((id || "indicator[" + j + "]") + ": invalid dimension");
      }

      var cl = str(ind.careLineId);
      if (!cl) {
        errors.push((id || "indicator[" + j + "]") + ": missing careLineId");
      } else if (lines.length > 0 && !lineIds[cl]) {
        errors.push(
          (id || "indicator[" + j + "]") + ": careLineId not in catalog: " + cl,
        );
      }

      if (ind.riskModel != null && str(ind.riskModel) !== "") {
        var rm = str(ind.riskModel);
        if (!KNOWN_RISK_MODELS[rm]) {
          errors.push(
            (id || "indicator[" + j + "]") + ": unknown riskModel: " + rm,
          );
        }
        var strat = asArray(ind.stratifyBy);
        if (strat.length === 0) {
          errors.push(
            (id || "indicator[" + j + "]") +
              ": riskModel requires non-empty stratifyBy",
          );
        }
      }

      // CAD-AC-05: hpbIndicatorKey deve existir em INDICATOR_LABELS (se módulo carregar)
      if (
        ind.hpbIndicatorKey != null &&
        str(ind.hpbIndicatorKey) !== "" &&
        hpbLabels
      ) {
        var hpbKey = str(ind.hpbIndicatorKey);
        if (!Object.prototype.hasOwnProperty.call(hpbLabels, hpbKey)) {
          errors.push(
            (id || "indicator[" + j + "]") +
              ": hpbIndicatorKey not in INDICATOR_LABELS: " +
              hpbKey,
          );
        }
      }

      // CPIREF-AC-01: literature exige referenceId resolvível
      if (ind.expectedRate != null && typeof ind.expectedRate === "object") {
        var erSrc = str(ind.expectedRate.source);
        if (erSrc === "literature") {
          var rid = str(ind.expectedRate.referenceId);
          if (!rid) {
            errors.push(
              (id || "indicator[" + j + "]") +
                ": expectedRate.source literature requires referenceId",
            );
          } else if (
            !referenceRegistryApi ||
            typeof referenceRegistryApi.resolveReference !== "function" ||
            !referenceRegistryApi.resolveReference(rid)
          ) {
            errors.push(
              (id || "indicator[" + j + "]") +
                ": expectedRate.referenceId not resolvable: " +
                rid,
            );
          }
        }
      }
    }

    // CPIEXP-AC-05: linha active → cada dimensão tem indicador ou dimensionGaps.reason
    for (var li = 0; li < lines.length; li++) {
      var careLine = lines[li];
      if (!careLine || !careLine.id) continue;
      if (str(careLine.lifecycle) !== "active") continue;
      var careId = str(careLine.id);
      var gaps = asArray(careLine.dimensionGaps);
      for (var di = 0; di < DIMENSIONS.length; di++) {
        var dimName = DIMENSIONS[di];
        var hasIndicator = false;
        for (var ii = 0; ii < inds.length; ii++) {
          var cand = inds[ii];
          if (!cand || str(cand.dimension) !== dimName) continue;
          if (str(cand.careLineId) === careId) {
            hasIndicator = true;
            break;
          }
          var multi = asArray(cand.careLineIds);
          for (var mi = 0; mi < multi.length; mi++) {
            if (str(multi[mi]) === careId) {
              hasIndicator = true;
              break;
            }
          }
          if (hasIndicator) break;
        }
        var hasGap = false;
        for (var gi = 0; gi < gaps.length; gi++) {
          var gap = gaps[gi];
          if (
            gap &&
            str(gap.dimension) === dimName &&
            gap.reason != null &&
            str(gap.reason) !== ""
          ) {
            hasGap = true;
            break;
          }
        }
        if (!hasIndicator && !hasGap) {
          errors.push(
            careId +
              ": dimensão " +
              dimName +
              " sem indicador nem lacuna declarada",
          );
        }
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  return {
    DIMENSIONS: DIMENSIONS,
    KNOWN_RISK_MODELS: KNOWN_RISK_MODELS,
    INDICATORS: INDICATORS,
    listIndicators: listIndicators,
    validateLibrary: validateLibrary,
    resolveExpectedRate: resolveExpectedRate,
    isReadmissionWithin30Days: isReadmissionWithin30Days,
    meldBandFromLabs: meldBandFromLabs,
    meldScoreToBand: meldScoreToBand,
    meldUnknownShare: meldUnknownShare,
    READMISSION_WINDOW_DAYS: READMISSION_WINDOW_DAYS,
    kdigoStageFromSeries: kdigoStageFromSeries,
    renalRecoveryFromSeries: renalRecoveryFromSeries,
    hasSevereHyperkalemia: hasSevereHyperkalemia,
    buildKdigoStrata: buildKdigoStrata,
    computeEgfrFromCreatinine: computeEgfrFromCreatinine,
    classifyEgfrStage: classifyEgfrStageDelegated,
    SEVERE_HYPERK_MEQ_L: SEVERE_HYPERK_MEQ_L,
    RECOVERY_FACTOR: RECOVERY_FACTOR,
  };
});
