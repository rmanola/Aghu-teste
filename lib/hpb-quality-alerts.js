/**
 * Alertas de qualidade E09 — 6 regras da planilha HUCAM-HPB + MDT pendente.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbQualityAlerts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var computedApi = null;
  var missingApi = null;
  try {
    if (typeof require === "function") {
      computedApi = require("./hpb-computed.js");
      missingApi = require("./hpb-missing-field-alerts.js");
    }
  } catch (_e) {}

  function isYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function daysSince(dateStr) {
    if (!computedApi) {
      var d = new Date(String(dateStr));
      if (Number.isNaN(d.getTime())) return null;
      return Math.floor((Date.now() - d.getTime()) / 86400000);
    }
    var days = computedApi.daysBetween(dateStr, new Date().toISOString().slice(0, 10));
    return days;
  }

  var ALERT_FILTER_GROUPS = [
    {
      id: "prazo",
      label: "Prazos pós-operatórios",
      helpSummary: "Alertas por atraso após a cirurgia (patologia, seguimento, óbito)",
    },
    {
      id: "clinico",
      label: "Qualidade clínica",
      helpSummary: "Dados clínicos obrigatórios ausentes (amilase, Clavien, R-status, MDT)",
    },
    {
      id: "completude",
      label: "Completude de campos",
      helpSummary: "Campos Research vazios, pendentes ou não informados",
    },
  ];

  var ALERT_DEFS = [
    {
      id: "pathology_pending_30d",
      type: "Patologia ausente ≥30d",
      filterGroup: "prazo",
      filterLabel: "Patologia ausente (30 dias)",
      rule: "Cirurgia oncológica sem E06 após 30 dias",
      verifyHint: "Comparar 05_CIRURGIA_CORE com 06_PATOLOGIA",
      priority: "Alta",
      responsible: "Pesquisador/fellow",
      helpSummary: "Cirurgia oncológica sem laudo patológico após 30 dias",
      helpDetail:
        "Regra: cirurgia oncológica sem módulo E06 (patologia) após 30 dias da data da cirurgia.\nComo verificar: Comparar 05_CIRURGIA_CORE com 06_PATOLOGIA.\nPrioridade: Alta. Responsável: Pesquisador/fellow.",
    },
    {
      id: "followup_pending_90d",
      type: "Seguimento ausente ≥90d",
      filterGroup: "prazo",
      filterLabel: "Seguimento ausente (90 dias)",
      rule: "Paciente operado sem E08 após 90 dias",
      verifyHint: "Comparar 05_CIRURGIA_CORE com 08_SEGUIMENTO",
      priority: "Alta",
      responsible: "Pesquisador",
      helpSummary: "Cirurgia sem registro de seguimento após 90 dias",
      helpDetail:
        "Regra: paciente operado sem entrada E08 (seguimento) vinculada à cirurgia após 90 dias.\nComo verificar: Comparar 05_CIRURGIA_CORE com 08_SEGUIMENTO.\nPrioridade: Alta. Responsável: Pesquisador.",
    },
    {
      id: "death_without_cause",
      type: "Óbito em 90d sem causa",
      filterGroup: "prazo",
      filterLabel: "Óbito em 90 dias sem causa",
      rule: "Óbito 90d sem causa definida",
      verifyHint: "Revisar E07/E08",
      priority: "Alta",
      responsible: "Coordenação",
      helpSummary: "Óbito em 90 dias sem causa registrada",
      helpDetail:
        "Regra: óbito em 90 dias (E07) sem causa em deathCause90d nem em seguimento E08.\nComo verificar: Revisar E07/E08.\nPrioridade: Alta. Responsável: Coordenação.",
    },
    {
      id: "missing_amylase",
      type: "Amilase D1/D3 ausente",
      filterGroup: "clinico",
      filterLabel: "Amilase D1/D3 ausente (pancreatectomia)",
      rule: "Pancreatectomia com dreno sem amilase D1/D3",
      verifyHint: "Revisar 05B_PANCREATECTOMIA",
      priority: "Alta",
      responsible: "Residente",
      helpSummary: "Pancreatectomia com dreno sem amilase D1 ou D3",
      helpDetail:
        "Regra: pancreatectomia com dreno presente e sem amilase D1 nem D3 preenchida.\nComo verificar: Revisar 05B_PANCREATECTOMIA.\nPrioridade: Alta. Responsável: Residente.",
    },
    {
      id: "missing_clavien",
      type: "Clavien máximo ausente",
      filterGroup: "clinico",
      filterLabel: "Clavien máximo ausente (complicação)",
      rule: "Complicação sem Clavien máximo",
      verifyHint: "Revisar 07_POSOPERATORIO",
      priority: "Alta",
      responsible: "Residente",
      helpSummary: "Complicação registrada sem grau Clavien máximo",
      helpDetail:
        "Regra: anyComplication = Sim sem clavienMax preenchido no pós-operatório.\nComo verificar: Revisar 07_POSOPERATORIO.\nPrioridade: Alta. Responsável: Residente.",
    },
    {
      id: "missing_r_status",
      type: "R-status ausente",
      filterGroup: "clinico",
      filterLabel: "R-status ausente (maligno)",
      rule: "Caso maligno sem R0/R1/R2",
      verifyHint: "Revisar 06_PATOLOGIA",
      priority: "Alta",
      responsible: "Pesquisador",
      helpSummary: "Caso maligno sem status de margem (R0/R1/R2)",
      helpDetail:
        "Regra: patologia maligna sem marginR (R-status) preenchido.\nComo verificar: Revisar 06_PATOLOGIA.\nPrioridade: Alta. Responsável: Pesquisador.",
    },
    {
      id: "mdt_pending",
      type: "MDT ausente",
      filterGroup: "clinico",
      filterLabel: "MDT ausente",
      rule: "MDT necessário sem registro E03",
      verifyHint: "Revisar 03_MDT",
      priority: "Média",
      responsible: "Residente",
      helpSummary: "Episódio com MDT necessário sem reunião registrada",
      helpDetail:
        "Regra: mdtRequired = Sim no episódio sem nenhuma entrada em mdtMeetings (E03).\nComo verificar: Revisar 03_MDT.\nPrioridade: Média. Responsável: Residente.",
    },
    {
      id: "field_incomplete",
      type: "Campo vazio",
      filterGroup: "completude",
      filterLabel: "Campo incompleto (vazio)",
      rule: "Campo Research não preenchido",
      verifyHint: "Revisar módulo Research",
      priority: "Baixa",
      responsible: "Residente",
      helpSummary: "Campo obrigatório vazio ou em branco",
      helpDetail:
        "Dispara quando o valor é null, string vazia ou só espaços.\nNão inclui Observações nem campos calculados.\nPrioridade: Baixa. Responsável: Residente.",
    },
    {
      id: "field_pending",
      type: "Campo com Pendente",
      filterGroup: "completude",
      filterLabel: "Campo pendente (valor Pendente)",
      rule: "Campo Research marcado como Pendente",
      verifyHint: "Revisar módulo Research",
      priority: "Média",
      responsible: "Residente",
      helpSummary: "Campo com valor «Pendente» aguardando confirmação",
      helpDetail:
        "Dispara quando o valor é «Pendente» (case-insensitive).\nIndica dado ainda não confirmado na extração ou revisão.\nPrioridade: Média. Responsável: Residente.",
    },
    {
      id: "field_unknown",
      type: "Campo NI / desconhecido",
      filterGroup: "completude",
      filterLabel: "Campo não informado / desconhecido",
      rule: "Campo Research Não informado ou desconhecido",
      verifyHint: "Revisar módulo Research",
      priority: "Baixa",
      responsible: "Residente",
      helpSummary: "Campo marcado como Não informado ou desconhecido",
      helpDetail:
        "Dispara para «Não informado», «NI» ou «unknown».\n«Não se aplica» conta como preenchido e não gera alerta.\nPrioridade: Baixa. Responsável: Residente.",
    },
  ];

  var DEF_BY_ID = {};
  for (var di = 0; di < ALERT_DEFS.length; di++) {
    DEF_BY_ID[ALERT_DEFS[di].id] = ALERT_DEFS[di];
  }

  function alertInstanceKey(alert) {
    if (!alert || !alert.id) return "";
    if (alert.instanceKey) return String(alert.instanceKey);
    return (
      String(alert.id) +
      "::" +
      String(alert.episodeId ?? "") +
      "::" +
      String(alert.surgeryId ?? "")
    );
  }

  function resolutionEntry(resolutions, key) {
    if (!resolutions || !key) return null;
    if (resolutions[key]) return resolutions[key];
    var missing = getMissingApi();
    if (missing && missing.legacyMissingFieldKey) {
      var legacy = missing.legacyMissingFieldKey(key);
      if (legacy && resolutions[legacy]) return resolutions[legacy];
    }
    var parts = String(key).split("::");
    if (
      missing &&
      missing.LEGACY_MISSING_FIELD_ID &&
      parts[0] === missing.LEGACY_MISSING_FIELD_ID &&
      parts.length >= 5 &&
      missing.COMPLETENESS_ALERT_IDS
    ) {
      for (var li = 0; li < missing.COMPLETENESS_ALERT_IDS.length; li++) {
        var alt = [
          missing.COMPLETENESS_ALERT_IDS[li],
          parts[1],
          parts[2],
          parts[3],
          parts.slice(4).join("::"),
        ].join("::");
        if (resolutions[alt]) return resolutions[alt];
      }
    }
    if (parts.length >= 1 && resolutions[parts[0]]) return resolutions[parts[0]];
    return null;
  }

  function isResolved(registry, keyOrAlert) {
    var key =
      typeof keyOrAlert === "string"
        ? keyOrAlert
        : alertInstanceKey(keyOrAlert);
    var res = registry && registry.alertResolutions;
    var entry = resolutionEntry(res, key);
    return !!(entry && entry.resolved);
  }

  function getMissingApi() {
    if (missingApi) return missingApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbMissingFieldAlerts || null;
  }

  function alertFromInstanceKey(key) {
    var parts = String(key || "").split("::");
    var missing = getMissingApi();
    if (
      missing &&
      missing.isCompletenessInstanceKey &&
      missing.isCompletenessInstanceKey(key)
    ) {
      return missing.alertFromInstanceKey
        ? missing.alertFromInstanceKey(key)
        : null;
    }
    var def = DEF_BY_ID[parts[0]];
    if (!def) return null;
    return Object.assign({}, def, {
      episodeId: parts[1] || undefined,
      surgeryId: parts[2] || undefined,
      instanceKey: key,
    });
  }

  function groupAlertsByModule(alerts) {
    var missing = getMissingApi();
    if (missing && missing.groupAlertsByModule) {
      return missing.groupAlertsByModule(alerts);
    }
    return [];
  }

  function pushAlert(alerts, registry, def, ctx) {
    var alert = Object.assign({}, def, ctx);
    if (!isResolved(registry, alert)) {
      alerts.push(alert);
    }
  }

  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function registryForEval(registry) {
    if (!schemaApi) return registry || { episodes: [] };
    return schemaApi.filterRegistryActive(registry || { episodes: [] });
  }

  function evalAlertsForRegistry(registry) {
    registry = registryForEval(registry);
    var alerts = [];
    var episodes = Array.isArray(registry.episodes) ? registry.episodes : [];

    episodes.forEach(function (ep) {
      (ep.surgeries || []).forEach(function (surg) {
        var core = surg.core || {};
        var days = core.date ? daysSince(core.date) : null;
        var ctx = { episodeId: ep.id, surgeryId: surg.id };

        if (isYes(core.malignant) && !surg.pathology && days != null && days > 30) {
          pushAlert(alerts, registry, DEF_BY_ID.pathology_pending_30d, ctx);
        }

        if (days != null && days > 90) {
          var hasFu = (ep.followups || []).some(function (fu) {
            return fu.surgeryId === surg.id;
          });
          if (!hasFu) {
            pushAlert(alerts, registry, DEF_BY_ID.followup_pending_90d, ctx);
          }
        }

        var pan = surg.pancreatectomy;
        if (pan && isYes(pan.drain) && !pan.amylaseD1 && !pan.amylaseD3) {
          pushAlert(alerts, registry, DEF_BY_ID.missing_amylase, ctx);
        }

        var post = surg.postop;
        if (post && isYes(post.anyComplication) && !post.clavienMax) {
          pushAlert(alerts, registry, DEF_BY_ID.missing_clavien, ctx);
        }

        var path = surg.pathology;
        if (path && isYes(path.malignant) && !path.marginR) {
          pushAlert(alerts, registry, DEF_BY_ID.missing_r_status, ctx);
        }

        if (post && isYes(post.death90d)) {
          var cause = post.deathCause90d;
          var fuDeath = (ep.followups || []).find(function (fu) {
            return fu.surgeryId === surg.id && isYes(fu.vitalStatus === "Óbito" || fu.deathDate);
          });
          if (!cause && !(fuDeath && fuDeath.deathCause)) {
            pushAlert(alerts, registry, DEF_BY_ID.death_without_cause, ctx);
          }
        }
      });

      if (isYes(ep.mdtRequired) && (!ep.mdtMeetings || !ep.mdtMeetings.length)) {
        pushAlert(alerts, registry, DEF_BY_ID.mdt_pending, { episodeId: ep.id });
      }
    });

    var missing = getMissingApi();
    if (missing && missing.evalMissingFieldAlerts) {
      var missingAlerts = missing.evalMissingFieldAlerts(registry);
      missingAlerts.forEach(function (alert) {
        if (!isResolved(registry, alert)) alerts.push(alert);
      });
    }

    return alerts;
  }

  function evalEpisodeAlerts(episode, registry) {
    return evalAlertsForRegistry({
      episodes: [episode],
      alertResolutions: registry?.alertResolutions,
    });
  }

  function isCompletenessAlert(id) {
    var missing = getMissingApi();
    if (missing && missing.isCompletenessAlert) {
      return missing.isCompletenessAlert(id);
    }
    return false;
  }

  function getAlertHelp(id) {
    var def = DEF_BY_ID[id];
    if (!def) return null;
    return {
      title: def.type,
      summary: def.helpSummary || def.rule || def.type,
      detail: def.helpDetail || def.rule || "",
    };
  }

  return {
    ALERT_DEFS: ALERT_DEFS,
    ALERT_FILTER_GROUPS: ALERT_FILTER_GROUPS,
    alertFromInstanceKey: alertFromInstanceKey,
    alertInstanceKey: alertInstanceKey,
    evalAlertsForRegistry: evalAlertsForRegistry,
    evalEpisodeAlerts: evalEpisodeAlerts,
    getAlertHelp: getAlertHelp,
    groupAlertsByModule: groupAlertsByModule,
    isCompletenessAlert: isCompletenessAlert,
    resolutionEntry: resolutionEntry,
    isResolved: isResolved,
  };
});
