/**
 * Catálogo e utilitários para paths de elegibilidade AGHU (hub root).
 * Screening: episódio, cirurgia (hub), exams, controles, pii, prescricoes — nunca CRF.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuProtocolFieldPaths = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var AGHU_PREFIX = "aghu.";

  var EXAM_SIGLAS = [
    { path: "aghu.exam.Cr", label: "Creatinina", sigla: "Cr", group: "Exames" },
    { path: "aghu.exam.Alb", label: "Albumina", sigla: "Alb", group: "Exames" },
    { path: "aghu.exam.BT", label: "Bilirrubina total", sigla: "BT", group: "Exames" },
    { path: "aghu.exam.INR", label: "INR", sigla: "INR", group: "Exames" },
    { path: "aghu.exam.Pqt", label: "Plaquetas", sigla: "Pqt", group: "Exames" },
    { path: "aghu.exam.CA19-9", label: "CA 19-9", sigla: "CA19-9", group: "Exames" },
    { path: "aghu.exam.Hb", label: "Hemoglobina", sigla: "Hb", group: "Exames" },
    { path: "aghu.exam.Leu", label: "Leucócitos", sigla: "Leu", group: "Exames" },
  ];

  var CONTROLE_VITALS = [
    { path: "aghu.controles.fcBpm", label: "FC (bpm)", vital: "fcBpm", group: "Controles" },
    { path: "aghu.controles.frIrpm", label: "FR (irpm)", vital: "frIrpm", group: "Controles" },
    { path: "aghu.controles.spo2Pct", label: "SpO2 (%)", vital: "spo2Pct", group: "Controles" },
    { path: "aghu.controles.pas", label: "PAS (mmHg)", vital: "pas", group: "Controles" },
    { path: "aghu.controles.tempC", label: "Temperatura (°C)", vital: "tempC", group: "Controles" },
  ];

  var CLINICAL_EPISODE_FIELDS = [
    {
      path: "aghu.clinical_episode.primary_diagnosis",
      label: "Diagnóstico principal (episódio)",
      catalogKey: "clinical_episode.primary_diagnosis",
      group: "Episódio clínico",
    },
    {
      path: "aghu.clinical_episode.started_at",
      label: "Data início (episódio)",
      catalogKey: "clinical_episode.started_at",
      group: "Episódio clínico",
    },
    {
      path: "aghu.clinical_episode.status",
      label: "Status (episódio)",
      catalogKey: "clinical_episode.status",
      group: "Episódio clínico",
    },
    {
      path: "aghu.clinical_episode.label",
      label: "Rótulo (episódio)",
      catalogKey: "clinical_episode.label",
      group: "Episódio clínico",
    },
    {
      path: "aghu.clinical_episode.notes",
      label: "Observações (episódio)",
      catalogKey: "clinical_episode.notes",
      group: "Episódio clínico",
    },
  ];

  /** Paths canónicos — aba hub Cirurgia (blob passometro.header.cirurgias[]). */
  var CIRURGIA_FIELDS = [
    {
      path: "aghu.cirurgia.procedure",
      label: "Procedimento",
      catalogKey: "passometro.surgery.procedure",
      group: "Cirurgia (hub)",
      fieldKey: "nome",
    },
    {
      path: "aghu.cirurgia.date",
      label: "Data cirúrgica",
      catalogKey: "passometro.surgery.date",
      group: "Cirurgia (hub)",
      fieldKey: "data",
    },
    {
      path: "aghu.cirurgia.description",
      label: "Descrição cirúrgica",
      catalogKey: "passometro.surgery.description",
      group: "Cirurgia (hub)",
      fieldKey: "descricao",
    },
    {
      path: "aghu.cirurgia.equipe",
      label: "Equipe",
      catalogKey: "passometro.surgery.equipe",
      group: "Cirurgia (hub)",
      fieldKey: "equipe",
    },
    {
      path: "aghu.cirurgia.achadosOperatorios",
      label: "Achados operatórios",
      catalogKey: "passometro.surgery.achadosOperatorios",
      group: "Cirurgia (hub)",
      fieldKey: "achadosOperatorios",
    },
    {
      path: "aghu.cirurgia.poComplicacoes",
      label: "Complicações PO",
      catalogKey: "passometro.surgery.poComplicacoes",
      group: "Cirurgia (hub)",
      fieldKey: "poComplicacoes",
    },
  ];

  /**
   * Aliases legados — válidos em read/validate; não aparecem no dropdown de triagem.
   */
  var LEGACY_SURGERY_ALIASES = [
    {
      path: "aghu.passometro.surgery.procedure",
      aliasOf: "aghu.cirurgia.procedure",
      catalogKey: "passometro.surgery.procedure",
      fieldKey: "nome",
    },
    {
      path: "aghu.passometro.surgery.date",
      aliasOf: "aghu.cirurgia.date",
      catalogKey: "passometro.surgery.date",
      fieldKey: "data",
    },
    {
      path: "aghu.passometro.surgery.description",
      aliasOf: "aghu.cirurgia.description",
      catalogKey: "passometro.surgery.description",
      fieldKey: "descricao",
    },
  ];

  var PII_FIELDS = [
    {
      path: "aghu.pii.sexo",
      label: "Sexo",
      catalogKey: "pii.sexo",
      group: "Demografia",
      piiKey: "sexo",
    },
    {
      path: "aghu.pii.idade",
      label: "Idade (anos)",
      catalogKey: "pii.idade",
      group: "Demografia",
      piiKey: "idade",
    },
  ];

  var PRESCRICOES_FIELDS = [
    {
      path: "aghu.prescricoes.antibiotico",
      label: "Antibiótico",
      catalogKey: "prescricoes.antibiotico",
      group: "Prescrições",
      rxKey: "antibiotico",
    },
    {
      path: "aghu.prescricoes.dieta",
      label: "Dieta",
      catalogKey: "prescricoes.dieta",
      group: "Prescrições",
      rxKey: "dieta",
    },
    {
      path: "aghu.prescricoes.hidratacao",
      label: "Hidratação",
      catalogKey: "prescricoes.hidratacao",
      group: "Prescrições",
      rxKey: "hidratacao",
    },
    {
      path: "aghu.prescricoes.analgesia",
      label: "Analgesia",
      catalogKey: "prescricoes.analgesia",
      group: "Prescrições",
      rxKey: "analgesia",
    },
    {
      path: "aghu.prescricoes.texto",
      label: "Texto (prescrição)",
      catalogKey: "prescricoes.texto",
      group: "Prescrições",
      rxKey: "texto",
    },
  ];

  /** Catálogo UI / listScreeningFieldPaths — sem aliases legados. */
  var SCREENING_FIELD_PATHS = EXAM_SIGLAS.concat(
    CONTROLE_VITALS,
    CLINICAL_EPISODE_FIELDS,
    CIRURGIA_FIELDS,
    PII_FIELDS,
    PRESCRICOES_FIELDS,
  );

  /** Todos os paths válidos (UI + aliases legados). */
  var AGHU_FIELD_PATHS = SCREENING_FIELD_PATHS.concat(LEGACY_SURGERY_ALIASES);

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function isAghuFieldPath(fieldPath) {
    return str(fieldPath).indexOf(AGHU_PREFIX) === 0;
  }

  function isValidAghuFieldPath(fieldPath) {
    if (!isAghuFieldPath(fieldPath)) return false;
    return AGHU_FIELD_PATHS.some(function (row) {
      return row.path === fieldPath;
    });
  }

  function findCirurgiaCanonical(fieldPath) {
    return CIRURGIA_FIELDS.find(function (c) {
      return c.path === fieldPath;
    });
  }

  function findLegacySurgery(fieldPath) {
    return LEGACY_SURGERY_ALIASES.find(function (a) {
      return a.path === fieldPath;
    });
  }

  function parseAghuFieldPath(fieldPath) {
    if (!isAghuFieldPath(fieldPath)) return null;

    var ep = CLINICAL_EPISODE_FIELDS.find(function (e) {
      return e.path === fieldPath;
    });
    if (ep) {
      return {
        domain: "clinical_episode",
        catalogKey: ep.catalogKey,
        path: fieldPath,
      };
    }

    var cir = findCirurgiaCanonical(fieldPath);
    if (cir) {
      return {
        domain: "passometro_surgery",
        catalogKey: cir.catalogKey,
        fieldKey: cir.fieldKey,
        path: fieldPath,
      };
    }

    var legacy = findLegacySurgery(fieldPath);
    if (legacy) {
      return {
        domain: "passometro_surgery",
        catalogKey: legacy.catalogKey,
        fieldKey: legacy.fieldKey,
        path: fieldPath,
        aliasOf: legacy.aliasOf,
      };
    }

    var pii = PII_FIELDS.find(function (p) {
      return p.path === fieldPath;
    });
    if (pii) {
      return {
        domain: "pii",
        catalogKey: pii.catalogKey,
        piiKey: pii.piiKey,
        path: fieldPath,
      };
    }

    var rx = PRESCRICOES_FIELDS.find(function (p) {
      return p.path === fieldPath;
    });
    if (rx) {
      return {
        domain: "prescricoes",
        catalogKey: rx.catalogKey,
        rxKey: rx.rxKey,
        path: fieldPath,
      };
    }

    var parts = str(fieldPath).split(".");
    if (parts.length !== 3) return null;
    var domain = parts[1];
    if (domain === "exam") {
      var exam = EXAM_SIGLAS.find(function (e) {
        return e.path === fieldPath;
      });
      return exam ? { domain: "exam", sigla: exam.sigla, path: fieldPath } : null;
    }
    if (domain === "controles") {
      var vital = CONTROLE_VITALS.find(function (v) {
        return v.path === fieldPath;
      });
      return vital ? { domain: "controles", vital: vital.vital, path: fieldPath } : null;
    }
    return null;
  }

  function normalizeCriterionContext(raw) {
    if (!raw || typeof raw !== "object") return null;
    var anchor = str(raw.anchor) || "surgery.core.date";
    var window = raw.window && typeof raw.window === "object" ? raw.window : null;
    var fromDays = window && Number.isFinite(Number(window.fromDays))
      ? Number(window.fromDays)
      : raw.fromDays != null && Number.isFinite(Number(raw.fromDays))
        ? Number(raw.fromDays)
        : null;
    var toDays = window && Number.isFinite(Number(window.toDays))
      ? Number(window.toDays)
      : raw.toDays != null && Number.isFinite(Number(raw.toDays))
        ? Number(raw.toDays)
        : null;
    return {
      anchor: anchor,
      fromDays: fromDays,
      toDays: toDays,
      serumOnly: raw.serumOnly === true,
      preferTargetDay:
        raw.preferTargetDay != null && Number.isFinite(Number(raw.preferTargetDay))
          ? Number(raw.preferTargetDay)
          : null,
    };
  }

  function isValidAghuCriterionContext(context) {
    if (!context) return true;
    if (typeof context !== "object") return false;
    if (context.anchor != null && typeof context.anchor !== "string") return false;
    if (context.window != null && typeof context.window !== "object") return false;
    return true;
  }

  function protocolCriteriaLists(protocol) {
    if (!protocol) return [];
    return [
      protocol.screeningInclusion,
      protocol.screeningExclusion,
      protocol.inclusion,
      protocol.exclusion,
    ];
  }

  function protocolHasAghuCriteria(protocol) {
    if (!protocol) return false;
    var lists = protocolCriteriaLists(protocol);
    for (var i = 0; i < lists.length; i++) {
      var arr = lists[i];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        if (isAghuFieldPath(arr[j] && arr[j].field)) return true;
      }
    }
    return false;
  }

  /**
   * Domínios hub necessários para avaliar screening* do protocolo.
   * @returns {string[]} domain keys (exam, controles, pii, …)
   */
  function domainsForProtocolAghuCriteria(protocol) {
    var seen = Object.create(null);
    var lists = protocolCriteriaLists(protocol);
    for (var i = 0; i < lists.length; i++) {
      var arr = lists[i];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var parsed = parseAghuFieldPath(arr[j] && arr[j].field);
        if (parsed && parsed.domain) seen[parsed.domain] = true;
      }
    }
    return Object.keys(seen);
  }

  function listAghuFieldPaths() {
    return AGHU_FIELD_PATHS.slice();
  }

  /** Paths de screening (auto-inscrição) — raiz do hub, sem CRF nem aliases legados. */
  function listScreeningFieldPaths() {
    return SCREENING_FIELD_PATHS.slice();
  }

  return {
    AGHU_PREFIX: AGHU_PREFIX,
    AGHU_FIELD_PATHS: AGHU_FIELD_PATHS,
    SCREENING_FIELD_PATHS: SCREENING_FIELD_PATHS,
    isAghuFieldPath: isAghuFieldPath,
    isValidAghuFieldPath: isValidAghuFieldPath,
    parseAghuFieldPath: parseAghuFieldPath,
    normalizeCriterionContext: normalizeCriterionContext,
    isValidAghuCriterionContext: isValidAghuCriterionContext,
    protocolHasAghuCriteria: protocolHasAghuCriteria,
    domainsForProtocolAghuCriteria: domainsForProtocolAghuCriteria,
    listAghuFieldPaths: listAghuFieldPaths,
    listScreeningFieldPaths: listScreeningFieldPaths,
  };
});
