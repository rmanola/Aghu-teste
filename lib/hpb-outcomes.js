/**
 * Desfechos HPB — taxas de coorte e variáveis derivadas por cirurgia/seguimento.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbOutcomes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var computedApi = null;
  var indicatorsApi = null;
  var schemaApi = null;

  try {
    if (typeof require === "function") {
      computedApi = require("./hpb-computed.js");
      indicatorsApi = require("./hpb-indicators.js");
      schemaApi = require("./hpb-registry-schema.js");
    }
  } catch (_e) {}

  var UNKNOWN_SENTINELS = {
    pendente: 1,
    ni: 1,
    "não informado": 1,
    "nao informado": 1,
    unknown: 1,
  };

  function isYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function isNo(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "não" || s === "nao" || s === "false" || v === false;
  }

  function normalizeSentinel(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase();
  }

  function isOutcomeKnown(v) {
    return isYes(v) || isNo(v);
  }

  function isMarginEvaluable(v) {
    var s = normalizeSentinel(v);
    if (!s || UNKNOWN_SENTINELS[s]) return false;
    return true;
  }

  function isClavienEvaluable(postop) {
    if (!postop || typeof postop !== "object") return false;
    if (isOutcomeKnown(postop.clavienGte3)) return true;
    var max = String(postop.clavienMax ?? "").trim();
    if (!max) return false;
    return !UNKNOWN_SENTINELS[normalizeSentinel(max)];
  }

  function resolveClavienGte3(postop) {
    if (!postop || typeof postop !== "object") return false;
    if (isOutcomeKnown(postop.clavienGte3)) return isYes(postop.clavienGte3);
    if (computedApi && postop.clavienMax) {
      return computedApi.computeClavienGte3(postop.clavienMax);
    }
    return false;
  }

  function isMajorComplicationKnown(postop) {
    if (!postop || typeof postop !== "object") return false;
    return (
      isClavienEvaluable(postop) ||
      isOutcomeKnown(postop.reoperation) ||
      isOutcomeKnown(postop.readmission30d)
    );
  }

  function resolveMajorComplication(postop) {
    return (
      resolveClavienGte3(postop) ||
      isYes(postop && postop.reoperation) ||
      isYes(postop && postop.readmission30d)
    );
  }

  function registryForOutcomes(registry) {
    if (!schemaApi) return registry || { episodes: [] };
    return schemaApi.filterRegistryActive(registry || { episodes: [] });
  }

  function flattenSurgeries(registry) {
    if (indicatorsApi && indicatorsApi.flattenSurgeries) {
      return indicatorsApi.flattenSurgeries(registry);
    }
    var out = [];
    (registry.episodes || []).forEach(function (ep) {
      (ep.surgeries || []).forEach(function (s) {
        out.push({ episode: ep, surgery: s });
      });
    });
    return out;
  }

  function parseNumeric(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function computeSurgeryOutcomes(surgery, episode) {
    surgery = surgery || {};
    episode = episode || {};
    var core = surgery.core || {};
    var postop = surgery.postop || {};
    var pathology = surgery.pathology || {};
    var surgeryDate = core.date || "";

    var los = null;
    if (computedApi) {
      los = computedApi.computeLengthOfStayDays(
        postop.dischargeDate,
        surgeryDate,
      );
    }
    if (los == null) los = parseNumeric(postop.lengthOfStayDays);

    var daysToPathologyReport = null;
    if (computedApi && pathology.reportDate && surgeryDate) {
      daysToPathologyReport = computedApi.computeDaysToPathologyReport(
        surgeryDate,
        pathology.reportDate,
      );
    }

    return {
      episodeId: episode.id || "",
      surgeryId: surgery.id || "",
      oncologicResection: isYes(core.malignant),
      marginR0: String(pathology.marginR || "").trim() === "R0",
      marginEvaluable: isMarginEvaluable(pathology.marginR),
      anyComplication: isYes(postop.anyComplication),
      anyComplicationKnown: isOutcomeKnown(postop.anyComplication),
      clavienGte3: resolveClavienGte3(postop),
      clavienEvaluable: isClavienEvaluable(postop),
      reoperation: isYes(postop.reoperation),
      reoperationKnown: isOutcomeKnown(postop.reoperation),
      readmission30d: isYes(postop.readmission30d),
      readmission30dKnown: isOutcomeKnown(postop.readmission30d),
      death90d: isYes(postop.death90d),
      death90dKnown: isOutcomeKnown(postop.death90d),
      majorComplication: resolveMajorComplication(postop),
      majorComplicationKnown: isMajorComplicationKnown(postop),
      lengthOfStayDays: los,
      daysToPathologyReport: daysToPathologyReport,
    };
  }

  function computeFollowupOutcomes(followup, surgeryDate) {
    followup = followup || {};
    var enriched = followup;
    if (computedApi && surgeryDate) {
      enriched = computedApi.enrichFollowup(followup, surgeryDate);
    }

    var survivalMonths = parseNumeric(enriched.survivalMonths);
    if (survivalMonths == null && computedApi && surgeryDate) {
      survivalMonths = computedApi.computeSurvivalMonths(
        surgeryDate,
        enriched.deathDate,
        enriched.lastContact,
      );
    }

    var sldMonths = parseNumeric(enriched.sldMonths);
    if (sldMonths == null && computedApi && surgeryDate && enriched.recurrenceDate) {
      sldMonths = computedApi.computeSldMonths(
        surgeryDate,
        enriched.recurrenceDate,
      );
    }

    return {
      recurrenceKnown: isOutcomeKnown(followup.recurrence),
      recurrenceYes: isYes(followup.recurrence),
      survivalMonths: survivalMonths,
      sldMonths: sldMonths,
      updatedAt: followup.updatedAt || "",
    };
  }

  function median(values) {
    var nums = (values || []).filter(function (n) {
      return n != null && Number.isFinite(n);
    });
    nums.sort(function (a, b) {
      return a - b;
    });
    if (!nums.length) return null;
    var mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 0) {
      return Math.round(((nums[mid - 1] + nums[mid]) / 2) * 10) / 10;
    }
    return nums[mid];
  }

  function buildRate(id, numerator, denominator, label, format, unit) {
    return {
      id: id,
      numerator: numerator,
      denominator: denominator,
      rate:
        denominator > 0
          ? Math.round((numerator / denominator) * 1000) / 1000
          : null,
      label: label,
      format: format || "percent",
      unit: unit || null,
    };
  }

  function buildMedian(id, value, count, label, unit) {
    return {
      id: id,
      numerator: value,
      denominator: count,
      rate: value,
      label: label,
      format: "median",
      unit: unit || null,
    };
  }

  function followupTimestamp(fu) {
    var raw = fu && fu.updatedAt ? String(fu.updatedAt) : "";
    var t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }

  function latestFollowupForSurgery(episode, surgeryId) {
    var list = (episode.followups || []).filter(function (fu) {
      return fu && !fu.deletedAt && fu.surgeryId === surgeryId;
    });
    if (!list.length) return null;
    list.sort(function (a, b) {
      return followupTimestamp(b) - followupTimestamp(a);
    });
    return list[0];
  }

  function aggregateOutcomeRates(registries) {
    var surgeries = [];
    var followups = [];

    (registries || []).forEach(function (reg) {
      var active = registryForOutcomes(reg);
      flattenSurgeries(active).forEach(function (row) {
        var outcomes = computeSurgeryOutcomes(row.surgery, row.episode);
        surgeries.push(outcomes);

        var surgeryDate = (row.surgery.core && row.surgery.core.date) || "";
        var linked = latestFollowupForSurgery(row.episode, row.surgery.id);
        if (linked) {
          followups.push(
            computeFollowupOutcomes(linked, surgeryDate),
          );
        }
      });

      (active.episodes || []).forEach(function (ep) {
        (ep.followups || []).forEach(function (fu) {
          if (!fu || fu.deletedAt) return;
          if (fu.surgeryId) return;
          var surgeryDate = "";
          followups.push(computeFollowupOutcomes(fu, surgeryDate));
        });
      });
    });

    var complicacaoNum = 0;
    var complicacaoDen = 0;
    var clavienNum = 0;
    var clavienDen = 0;
    var reopNum = 0;
    var reopDen = 0;
    var readmNum = 0;
    var readmDen = 0;
    var mortNum = 0;
    var mortDen = 0;
    var majorNum = 0;
    var majorDen = 0;
    var r0Num = 0;
    var r0Den = 0;
    var recNum = 0;
    var recDen = 0;

    var losValues = [];
    var pathDaysValues = [];
    var survivalValues = [];

    surgeries.forEach(function (o) {
      if (o.anyComplicationKnown) {
        complicacaoDen += 1;
        if (o.anyComplication) complicacaoNum += 1;
      }
      if (o.clavienEvaluable) {
        clavienDen += 1;
        if (o.clavienGte3) clavienNum += 1;
      }
      if (o.reoperationKnown) {
        reopDen += 1;
        if (o.reoperation) reopNum += 1;
      }
      if (o.readmission30dKnown) {
        readmDen += 1;
        if (o.readmission30d) readmNum += 1;
      }
      if (o.death90dKnown) {
        mortDen += 1;
        if (o.death90d) mortNum += 1;
      }
      if (o.majorComplicationKnown) {
        majorDen += 1;
        if (o.majorComplication) majorNum += 1;
      }
      if (o.oncologicResection && o.marginEvaluable) {
        r0Den += 1;
        if (o.marginR0) r0Num += 1;
      }
      if (o.lengthOfStayDays != null) losValues.push(o.lengthOfStayDays);
      if (o.oncologicResection && o.daysToPathologyReport != null) {
        pathDaysValues.push(o.daysToPathologyReport);
      }
    });

    followups.forEach(function (fu) {
      if (fu.recurrenceKnown) {
        recDen += 1;
        if (fu.recurrenceYes) recNum += 1;
      }
      if (fu.survivalMonths != null) survivalValues.push(fu.survivalMonths);
    });

    var rates = {
      taxaComplicacao: buildRate(
        "taxaComplicacao",
        complicacaoNum,
        complicacaoDen,
        OUTCOME_LABELS.taxaComplicacao,
      ),
      taxaClavienGte3: buildRate(
        "taxaClavienGte3",
        clavienNum,
        clavienDen,
        OUTCOME_LABELS.taxaClavienGte3,
      ),
      taxaReoperacao: buildRate(
        "taxaReoperacao",
        reopNum,
        reopDen,
        OUTCOME_LABELS.taxaReoperacao,
      ),
      taxaReadmissao30d: buildRate(
        "taxaReadmissao30d",
        readmNum,
        readmDen,
        OUTCOME_LABELS.taxaReadmissao30d,
      ),
      taxaMortalidade90d: buildRate(
        "taxaMortalidade90d",
        mortNum,
        mortDen,
        OUTCOME_LABELS.taxaMortalidade90d,
      ),
      taxaComplicacaoMaior: buildRate(
        "taxaComplicacaoMaior",
        majorNum,
        majorDen,
        OUTCOME_LABELS.taxaComplicacaoMaior,
      ),
      taxaMargemR0: buildRate(
        "taxaMargemR0",
        r0Num,
        r0Den,
        OUTCOME_LABELS.taxaMargemR0,
      ),
      taxaRecorrencia: buildRate(
        "taxaRecorrencia",
        recNum,
        recDen,
        OUTCOME_LABELS.taxaRecorrencia,
      ),
      medianaTempoInternacao: buildMedian(
        "medianaTempoInternacao",
        median(losValues),
        losValues.length,
        OUTCOME_LABELS.medianaTempoInternacao,
        "dias",
      ),
      medianaDiasAtePatologia: buildMedian(
        "medianaDiasAtePatologia",
        median(pathDaysValues),
        pathDaysValues.length,
        OUTCOME_LABELS.medianaDiasAtePatologia,
        "dias",
      ),
      medianaSobrevidaMeses: buildMedian(
        "medianaSobrevidaMeses",
        median(survivalValues),
        survivalValues.length,
        OUTCOME_LABELS.medianaSobrevidaMeses,
        "meses",
      ),
    };

    return rates;
  }

  var OUTCOME_LABELS = {
    taxaComplicacao: "Taxa de complicação",
    taxaClavienGte3: "Taxa Clavien ≥ III",
    taxaReoperacao: "Taxa de reoperação",
    taxaReadmissao30d: "Taxa readmissão 30d",
    taxaMortalidade90d: "Taxa mortalidade 90d",
    taxaComplicacaoMaior: "Taxa complicação maior",
    taxaMargemR0: "Taxa margem R0",
    taxaRecorrencia: "Taxa de recorrência",
    medianaTempoInternacao: "Mediana tempo internação",
    medianaDiasAtePatologia: "Mediana dias até patologia",
    medianaSobrevidaMeses: "Mediana sobrevida",
  };

  var OUTCOME_SECTIONS = [
    {
      id: "morbimortalidade",
      label: "Morbimortalidade",
      outcomeIds: [
        "taxaComplicacao",
        "taxaClavienGte3",
        "taxaReoperacao",
        "taxaReadmissao30d",
        "taxaMortalidade90d",
        "taxaComplicacaoMaior",
      ],
    },
    {
      id: "oncologico",
      label: "Oncológico",
      outcomeIds: ["taxaMargemR0", "taxaRecorrencia"],
    },
    {
      id: "tempos",
      label: "Tempos",
      outcomeIds: [
        "medianaTempoInternacao",
        "medianaDiasAtePatologia",
        "medianaSobrevidaMeses",
      ],
    },
  ];

  var OUTCOME_HELP = {
    taxaComplicacao: {
      summary: "Proporção de cirurgias com qualquer complicação",
      detail:
        "Numerador: cirurgias com postop.anyComplication = Sim.\nDenominador: cirurgias com desfecho conhecido (Sim/Não; exclui Pendente/NI/vazio).",
    },
    taxaClavienGte3: {
      summary: "Complicação Clavien grau III ou superior",
      detail:
        "Numerador: Clavien ≥ III (derivado de clavienMax ou clavienGte3).\nDenominador: cirurgias com clavienMax ou clavienGte3 avaliável.",
    },
    taxaReoperacao: {
      summary: "Reoperação pós-operatória",
      detail:
        "Numerador: postop.reoperation = Sim.\nDenominador: desfecho conhecido (Sim/Não).",
    },
    taxaReadmissao30d: {
      summary: "Readmissão em 30 dias",
      detail:
        "Numerador: postop.readmission30d = Sim.\nDenominador: desfecho conhecido (Sim/Não).",
    },
    taxaMortalidade90d: {
      summary: "Óbito em 90 dias",
      detail:
        "Numerador: postop.death90d = Sim.\nDenominador: desfecho conhecido (Sim/Não).",
    },
    taxaComplicacaoMaior: {
      summary: "Composto: Clavien ≥ III, reoperação ou readmissão 30d",
      detail:
        "Numerador: qualquer componente positivo.\nDenominador: cirurgias com pelo menos um componente avaliável (Clavien, reoperação ou readmissão).",
    },
    taxaMargemR0: {
      summary: "Margem R0 em ressecções oncológicas",
      detail:
        "Numerador: pathology.marginR = R0.\nDenominador: cirurgias oncológicas (malignant = Sim) com margem avaliável (exclui Pendente/NI/vazio).",
    },
    taxaRecorrencia: {
      summary: "Recorrência no seguimento",
      detail:
        "Numerador: followup.recurrence = Sim.\nDenominador: seguimentos com recorrência conhecida (Sim/Não).",
    },
    medianaTempoInternacao: {
      summary: "Mediana de dias de internação pós-cirurgia",
      detail:
        "Calculado a partir de data alta − data cirurgia (ou lengthOfStayDays persistido).\nExibe n = cirurgias com valor disponível.",
    },
    medianaDiasAtePatologia: {
      summary: "Mediana de dias da cirurgia ao laudo patológico",
      detail:
        "Apenas cirurgias oncológicas com pathology.reportDate preenchida.\nExibe n = cirurgias elegíveis.",
    },
    medianaSobrevidaMeses: {
      summary: "Mediana de sobrevida em meses",
      detail:
        "Seguimento mais recente por cirurgia (surgeryId) ou seguimento de episódio.\nDerivado de data cirurgia até óbito ou último contato.",
    },
  };

  function getOutcomeHelp(key) {
    return OUTCOME_HELP[key] || null;
  }

  return {
    computeSurgeryOutcomes: computeSurgeryOutcomes,
    computeFollowupOutcomes: computeFollowupOutcomes,
    aggregateOutcomeRates: aggregateOutcomeRates,
    OUTCOME_LABELS: OUTCOME_LABELS,
    OUTCOME_HELP: OUTCOME_HELP,
    OUTCOME_SECTIONS: OUTCOME_SECTIONS,
    getOutcomeHelp: getOutcomeHelp,
    isOutcomeKnown: isOutcomeKnown,
    isMarginEvaluable: isMarginEvaluable,
  };
});
