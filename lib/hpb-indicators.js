/**
 * Indicadores E09 — 17 KPIs da planilha HUCAM-HPB.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbIndicators = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var computedApi = null;
  try {
    if (typeof require === "function") computedApi = require("./hpb-computed.js");
  } catch (_e) {}

  function isYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function flattenSurgeries(registry) {
    var out = [];
    (registry.episodes || []).forEach(function (ep) {
      (ep.surgeries || []).forEach(function (s) {
        out.push({ episode: ep, surgery: s });
      });
    });
    return out;
  }

  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function registryForIndicators(registry) {
    if (!schemaApi) return registry || { episodes: [] };
    return schemaApi.filterRegistryActive(registry || { episodes: [] });
  }

  function computeIndicators(registry, opts) {
    opts = opts || {};
    registry = registryForIndicators(registry);
    var episodes = registry.episodes || [];
    var surgeries = flattenSurgeries(registry);
    var patientRegistered = opts.patientRegistered !== false;

    function countProcIncludes(needle) {
      var n = String(needle).toLowerCase();
      return surgeries.filter(function (x) {
        return String(x.surgery.core?.mainProcedure || "")
          .toLowerCase()
          .includes(n);
      }).length;
    }

    var robotic = surgeries.filter(function (x) {
      var access = String(x.surgery.core?.accessRoute || "").trim();
      return access === "Robótica" || access === "Robótica convertida";
    }).length;

    var vascular = surgeries.filter(function (x) {
      return isYes(x.surgery.vascular?.reconstructionPerformed);
    }).length;

    var oncologic = surgeries.filter(function (x) {
      return (
        isYes(x.surgery.core?.malignant) ||
        isYes(x.episode?.malignant) ||
        isYes(x.surgery.pathology?.malignant)
      );
    }).length;

    var complications = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.anyComplication);
    }).length;

    var clavienGte3 = surgeries.filter(function (x) {
      var p = x.surgery.postop;
      if (!p) return false;
      if (computedApi) return computedApi.computeClavienGte3(p.clavienMax);
      return isYes(p.clavienGte3);
    }).length;

    var reoperation = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.reoperation);
    }).length;

    var readmission30 = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.readmission30d);
    }).length;

    var mortality60 = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.death60d);
    }).length;

    var mortality90 = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.death90d);
    }).length;

    var textbook = surgeries.filter(function (x) {
      return isYes(x.surgery.postop?.textbookOutcome);
    }).length;

    var marginR0 = surgeries.filter(function (x) {
      return String(x.surgery.pathology?.marginR || "").trim() === "R0";
    }).length;

    var recurrences = 0;
    episodes.forEach(function (ep) {
      (ep.followups || []).forEach(function (fu) {
        if (isYes(fu.recurrence)) recurrences += 1;
      });
    });

    return {
      pacientesCadastrados: patientRegistered ? 1 : 0,
      episodiosClinicos: episodes.length,
      cirurgiasHpb: surgeries.length,
      hepatectomias: countProcIncludes("hepatectomia"),
      duodenopancreatectomias: countProcIncludes("duodenopancreatectomia"),
      pancreatectomiasDistais: countProcIncludes("pancreatectomia distal"),
      viaBiliarComplexa: countProcIncludes("via biliar"),
      cirurgiasRoboticas: robotic,
      reconstrucoesVasculares: vascular,
      casosOncologicos: oncologic,
      complicacoes: complications,
      clavienGte3: clavienGte3,
      reoperacao: reoperation,
      readmissao30d: readmission30,
      mortalidade60d: mortality60,
      mortalidade90d: mortality90,
      textbookOutcome: textbook,
      margemR0: marginR0,
      recorrencias: recurrences,
    };
  }

  function aggregateIndicators(registries) {
    var totals = {
      pacientesCadastrados: 0,
      episodiosClinicos: 0,
      cirurgiasHpb: 0,
      hepatectomias: 0,
      duodenopancreatectomias: 0,
      pancreatectomiasDistais: 0,
      viaBiliarComplexa: 0,
      cirurgiasRoboticas: 0,
      reconstrucoesVasculares: 0,
      casosOncologicos: 0,
      complicacoes: 0,
      clavienGte3: 0,
      reoperacao: 0,
      readmissao30d: 0,
      mortalidade60d: 0,
      mortalidade90d: 0,
      textbookOutcome: 0,
      margemR0: 0,
      recorrencias: 0,
    };
    (registries || []).forEach(function (reg) {
      var ind = computeIndicators(reg, { patientRegistered: true });
      Object.keys(totals).forEach(function (k) {
        totals[k] += ind[k] || 0;
      });
    });
    return totals;
  }

  var INDICATOR_LABELS = {
    pacientesCadastrados: "Pacientes cadastrados",
    episodiosClinicos: "Episódios clínicos",
    cirurgiasHpb: "Cirurgias Research",
    hepatectomias: "Hepatectomias",
    duodenopancreatectomias: "Duodenopancreatectomias",
    pancreatectomiasDistais: "Pancreatectomias distais",
    viaBiliarComplexa: "Via biliar complexa",
    cirurgiasRoboticas: "Cirurgias robóticas",
    reconstrucoesVasculares: "Reconstruções vasculares",
    casosOncologicos: "Casos oncológicos",
    complicacoes: "Complicações",
    clavienGte3: "Clavien ≥ III",
    reoperacao: "Reoperação",
    readmissao30d: "Readmissão 30d",
    mortalidade60d: "Mortalidade 60d",
    mortalidade90d: "Mortalidade 90d",
    textbookOutcome: "Textbook outcome",
    margemR0: "Margem R0",
    recorrencias: "Recorrências",
  };

  var INDICATOR_HELP = {
    pacientesCadastrados: {
      summary: "Pacientes com registro Research na coorte",
      detail:
        "Conta 1 por paciente com registry Research ativo (sem deletedAt no episódio).\nNa aba Indicadores da coorte, soma todos os pacientes carregados.",
    },
    episodiosClinicos: {
      summary: "Episódios clínicos Research ativos",
      detail:
        "Conta episódios sem deletedAt em todos os pacientes da coorte.\nCada episódio agrupa cirurgias, MDT, LRT e seguimento.",
    },
    cirurgiasHpb: {
      summary: "Total de cirurgias Research registradas",
      detail:
        "Conta cirurgias ativas (sem deletedAt) em todos os episódios.\nInclui qualquer procedimento principal registrado em surgery.core.",
    },
    hepatectomias: {
      summary: "Cirurgias com procedimento principal Hepatectomia",
      detail:
        "Conta cirurgias ativas em que surgery.core.mainProcedure === \"Hepatectomia\".\nAgregado na coorte soma todos os pacientes.",
    },
    duodenopancreatectomias: {
      summary: "Cirurgias com procedimento Duodenopancreatectomia",
      detail:
        "Conta cirurgias ativas em que surgery.core.mainProcedure === \"Duodenopancreatectomia\".",
    },
    pancreatectomiasDistais: {
      summary: "Cirurgias com procedimento Pancreatectomia distal",
      detail:
        "Conta cirurgias ativas em que surgery.core.mainProcedure === \"Pancreatectomia distal\".",
    },
    viaBiliarComplexa: {
      summary: "Cirurgias com procedimento Cirurgia via biliar",
      detail:
        "Conta cirurgias ativas em que surgery.core.mainProcedure === \"Cirurgia via biliar\".",
    },
    cirurgiasRoboticas: {
      summary: "Cirurgias com via de acesso robótica",
      detail:
        "Conta cirurgias em que surgery.core.accessRoute é \"Robótica\" ou \"Robótica convertida\".",
    },
    reconstrucoesVasculares: {
      summary: "Cirurgias com reconstrução vascular realizada",
      detail:
        "Conta cirurgias em que surgery.vascular.reconstructionPerformed === \"Sim\".",
    },
    casosOncologicos: {
      summary: "Cirurgias com doença maligna confirmada",
      detail:
        "Conta cirurgias em que surgery.core.malignant === \"Sim\".",
    },
    complicacoes: {
      summary: "Cirurgias com qualquer complicação pós-operatória",
      detail:
        "Conta cirurgias em que surgery.postop.anyComplication === \"Sim\".",
    },
    clavienGte3: {
      summary: "Cirurgias com complicação Clavien grau III ou superior",
      detail:
        "Derivado de surgery.postop.clavienMax (0, I, II, IIIa, IIIb, IVa, IVb, V).\nInclui intervenção, disfunção orgânica ou óbito.",
    },
    reoperacao: {
      summary: "Cirurgias com reoperação registrada",
      detail:
        "Conta cirurgias em que surgery.postop.reoperation === \"Sim\".",
    },
    readmissao30d: {
      summary: "Cirurgias com readmissão em 30 dias",
      detail:
        "Conta cirurgias em que surgery.postop.readmission30d === \"Sim\".",
    },
    mortalidade60d: {
      summary: "Cirurgias com óbito em 60 dias",
      detail:
        "Conta cirurgias em que surgery.postop.death60d === \"Sim\" (Excel MVP v2.5).",
    },
    mortalidade90d: {
      summary: "Cirurgias com óbito em 90 dias",
      detail:
        "Conta cirurgias em que surgery.postop.death90d === \"Sim\".",
    },
    textbookOutcome: {
      summary: "Cirurgias com textbook outcome",
      detail:
        "Conta cirurgias em que surgery.postop.textbookOutcome === \"Sim\" (sem Clavien≥III, sem reoperação/reintervenção, sem readmissão 30d, sem óbito 30/60d).",
    },
    margemR0: {
      summary: "Cirurgias com margem cirúrgica R0",
      detail:
        "Conta cirurgias em que surgery.pathology.marginR === \"R0\" (margem microscópica livre).",
    },
    recorrencias: {
      summary: "Registros de seguimento com recorrência",
      detail:
        "Conta entradas de followup (E08) com recurrence === \"Sim\", em todos os episódios ativos.",
    },
  };

  function getIndicatorHelp(key) {
    return INDICATOR_HELP[key] || null;
  }

  return {
    computeIndicators: computeIndicators,
    aggregateIndicators: aggregateIndicators,
    INDICATOR_LABELS: INDICATOR_LABELS,
    INDICATOR_HELP: INDICATOR_HELP,
    getIndicatorHelp: getIndicatorHelp,
    flattenSurgeries: flattenSurgeries,
  };
});
