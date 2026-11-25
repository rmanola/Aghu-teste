/**
 * Catálogo unificado de variáveis AGHU para protocolos Research custom (FEAT-051).
 * Agrega enrichment catalog + dicionário HPB — sem PHI.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchVariableCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var enrichmentCatalog = null;
  var dictionary = null;

  try {
    if (typeof require === "function") {
      enrichmentCatalog = require("./hpb-enrichment-catalog.js");
      dictionary = require("./hpb-data-dictionary.json");
    }
  } catch (_e) {}

  var DOMAIN_GROUP = {
    exam: "Exames",
    controles: "Controles",
    prescricao: "Prescrições",
    pii: "Demografia",
    hpb_registry: "HPB clínico",
    clinical_episode: "Episódio clínico (hub)",
    passometro_surgery: "Cirurgia (hub)",
  };

  var SOURCE_TO_DOMAIN = {
    exam: "exam",
    controles: "controles",
    prescricao: "prescricao",
    pii: "pii",
  };

  var MAX_HPB_CATALOG_FIELDS = 500;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function enrichmentToCatalogEntry(def) {
    var domain = SOURCE_TO_DOMAIN[def.source] || def.source;
    var needsAnchor =
      domain === "exam" ||
      domain === "controles" ||
      domain === "prescricao" ||
      (domain === "pii" && def.key === "age_at_surgery");
    return {
      catalogKey: def.key,
      label: def.label,
      group: DOMAIN_GROUP[domain] || domain,
      domain: domain,
      defaultMode: domain === "pii" ? "autofill" : "readonly",
      needsAnchor: needsAnchor,
      resolution: {
        kind: "enrichment",
        enrichmentKey: def.key,
        source: def.source,
        sigla: def.sigla,
        vitalField: def.vitalField,
        piiField: def.piiField,
        prescricaoKind: def.prescricaoKind,
        fromDays: def.fromDays,
        toDays: def.toDays,
        serumOnly: !!def.serumOnly,
        preferTargetDay: def.preferTargetDay,
      },
      helpSummary: def.helpSummary || "",
    };
  }

  function hpbFieldToCatalogEntry(row) {
    var moduleId = str(row.moduleId);
    var key = str(row.key);
    if (!moduleId || !key) return null;
    return {
      catalogKey: "hpb." + moduleId + "." + key,
      label: str(row.label) || key,
      group: str(row.moduleLabel) || DOMAIN_GROUP.hpb_registry,
      domain: "hpb_registry",
      defaultMode: row.readOnly ? "readonly" : "autofill",
      needsAnchor: false,
      resolution: {
        kind: "hpb_registry",
        moduleId: moduleId,
        fieldKey: key,
        grain: str(row.grain) || moduleId,
      },
      helpSummary: "",
    };
  }

  function clinicalEpisodeCatalogEntry(catalogKey, label, path) {
    return {
      catalogKey: catalogKey,
      label: label,
      group: DOMAIN_GROUP.clinical_episode,
      domain: "clinical_episode",
      defaultMode: "readonly",
      needsAnchor: false,
      resolution: {
        kind: "clinical_episode",
        path: path,
      },
      helpSummary: "Sincronizado da aba Episódios (hub) — clínico vence.",
      clinicalSourcePath: path,
    };
  }

  var CLINICAL_EPISODE_CATALOG = [
    clinicalEpisodeCatalogEntry(
      "clinical_episode.started_at",
      "Data início (episódio clínico)",
      "startedAt",
    ),
    clinicalEpisodeCatalogEntry(
      "clinical_episode.notes",
      "Observações (episódio clínico)",
      "notes",
    ),
    clinicalEpisodeCatalogEntry(
      "clinical_episode.primary_diagnosis",
      "Diagnóstico principal (1.º da lista clínica)",
      "diagnoses[0].texto",
    ),
    clinicalEpisodeCatalogEntry(
      "clinical_episode.status",
      "Status (episódio clínico)",
      "status",
    ),
    clinicalEpisodeCatalogEntry(
      "clinical_episode.label",
      "Rótulo (episódio clínico)",
      "label",
    ),
  ];

  function passometroSurgeryCatalogEntry(catalogKey, label, path) {
    return {
      catalogKey: catalogKey,
      label: label,
      group: DOMAIN_GROUP.passometro_surgery,
      domain: "passometro_surgery",
      defaultMode: "readonly",
      needsAnchor: false,
      resolution: {
        kind: "passometro_surgery",
        path: path,
      },
      helpSummary:
        "Hub Cirurgia — passometro.header.cirurgias[] do episódio da linha (grain surgery).",
    };
  }

  var PASSOMETRO_SURGERY_CATALOG = [
    passometroSurgeryCatalogEntry(
      "passometro.surgery.date",
      "Data cirúrgica (hub)",
      "data",
    ),
    passometroSurgeryCatalogEntry(
      "passometro.surgery.procedure",
      "Procedimento (hub)",
      "nome",
    ),
    passometroSurgeryCatalogEntry(
      "passometro.surgery.description",
      "Descrição cirúrgica (hub)",
      "descricao",
    ),
    passometroSurgeryCatalogEntry(
      "passometro.surgery.equipe",
      "Equipe (hub)",
      "equipe",
    ),
    passometroSurgeryCatalogEntry(
      "passometro.surgery.achadosOperatorios",
      "Achados operatórios (hub)",
      "achadosOperatorios",
    ),
    passometroSurgeryCatalogEntry(
      "passometro.surgery.poComplicacoes",
      "Complicações PO (hub)",
      "poComplicacoes",
    ),
  ];

  var GENERAL_FROM_DAYS = -365;
  var GENERAL_TO_DAYS = 0;
  var ADHOC_ENTRIES = Object.create(null);
  var CATALOG_CACHE = null;

  function sanitizeSiglaForKey(sigla) {
    return str(sigla).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function loadExamSiglasList() {
    var root = typeof globalThis !== "undefined" ? globalThis : {};
    if (root.AghuExamSiglas && Array.isArray(root.AghuExamSiglas.EXAM_SIGLAS)) {
      return root.AghuExamSiglas.EXAM_SIGLAS;
    }
    try {
      if (typeof require === "function") {
        try {
          require("./exam-siglas.js");
        } catch (_req) {}
        if (root.AghuExamSiglas && Array.isArray(root.AghuExamSiglas.EXAM_SIGLAS)) {
          return root.AghuExamSiglas.EXAM_SIGLAS;
        }
        // Fallback Node (popup/exam-siglas.js). require via Function() —
        // evita resolução estática de "fs"/"path" no bundle web (Turbopack).
        var fs = null;
        var path = null;
        try {
          var nodeBuiltins = Function(
            "r",
            'return { fs: r("fs"), path: r("path") }'
          )(require);
          fs = nodeBuiltins.fs;
          path = nodeBuiltins.path;
        } catch (_nodeMod) {
          return [];
        }
        if (!fs || !path) return [];
        if (typeof root.window === "undefined") root.window = root;
        if (!root.AghuExamSiglas) {
          var candidates = [
            path.join(__dirname, "..", "popup", "exam-siglas.js"),
            path.join(__dirname, "exam-siglas.js"),
          ];
          for (var i = 0; i < candidates.length; i++) {
            if (fs.existsSync(candidates[i])) {
              // eslint-disable-next-line no-eval
              eval(fs.readFileSync(candidates[i], "utf8"));
              break;
            }
          }
        }
        if (root.AghuExamSiglas && Array.isArray(root.AghuExamSiglas.EXAM_SIGLAS)) {
          return root.AghuExamSiglas.EXAM_SIGLAS;
        }
      }
    } catch (_e) {}
    return [];
  }

  function generalExamCatalogEntry(sigla) {
    var s = str(sigla);
    if (!s) return null;
    var safe = sanitizeSiglaForKey(s);
    if (!safe) return null;
    return {
      catalogKey: "exam_general_" + safe,
      label: s + " (geral)",
      group: DOMAIN_GROUP.exam,
      domain: "exam",
      defaultMode: "readonly",
      needsAnchor: true,
      resolution: {
        kind: "exam_general",
        sigla: s,
        fromDays: GENERAL_FROM_DAYS,
        toDays: GENERAL_TO_DAYS,
        serumOnly: false,
      },
      helpSummary:
        "Exame geral (" + s + ") na janela de 365 dias até a âncora.",
    };
  }

  function buildAdhocCatalogEntry(matchText, opts) {
    opts = opts || {};
    var text = str(matchText);
    if (!text) return null;
    var slugApi = null;
    try {
      if (typeof require === "function") {
        slugApi = require("./research-field-key-slug.js");
      }
    } catch (_e) {}
    var slug = slugApi && slugApi.slugFromLabel
      ? slugApi.slugFromLabel(text)
      : text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 32);
    if (!slug) slug = "exame";
    var catalogKey = str(opts.catalogKey) || "exam_adhoc_" + slug;
    return {
      catalogKey: catalogKey,
      label: str(opts.label) || "Exame: " + text,
      group: DOMAIN_GROUP.exam,
      domain: "exam",
      defaultMode: opts.defaultMode === "autofill" ? "autofill" : "readonly",
      needsAnchor: true,
      resolution: {
        kind: "exam_adhoc",
        matchText: text,
        fromDays: GENERAL_FROM_DAYS,
        toDays: GENERAL_TO_DAYS,
        serumOnly: false,
      },
      helpSummary: "Exame ad-hoc por nome («" + text + "»).",
    };
  }

  function registerAdhocCatalogEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    var catalogKey = str(entry.catalogKey);
    if (!catalogKey || catalogKey.indexOf("exam_adhoc_") !== 0) return null;
    var matchText =
      str(entry.resolution && entry.resolution.matchText) ||
      str(entry.matchText) ||
      str(entry.label);
    if (!matchText) return null;
    var normalized = buildAdhocCatalogEntry(matchText, {
      catalogKey: catalogKey,
      label: entry.label,
      defaultMode: entry.defaultMode,
    });
    if (!normalized) return null;
    if (entry.resolution && typeof entry.resolution === "object") {
      normalized.resolution = Object.assign(
        {},
        normalized.resolution,
        entry.resolution,
        {
          kind: "exam_adhoc",
          matchText: str(entry.resolution.matchText) || matchText,
          fromDays:
            entry.resolution.fromDays != null
              ? entry.resolution.fromDays
              : GENERAL_FROM_DAYS,
          toDays:
            entry.resolution.toDays != null
              ? entry.resolution.toDays
              : GENERAL_TO_DAYS,
          serumOnly: !!entry.resolution.serumOnly,
        },
      );
    }
    ADHOC_ENTRIES[catalogKey] = normalized;
    return normalized;
  }

  function buildCatalog() {
    var out = [];
    var seen = Object.create(null);

    if (enrichmentCatalog && enrichmentCatalog.getEnrichmentVariables) {
      var enrichment = enrichmentCatalog.getEnrichmentVariables();
      for (var i = 0; i < enrichment.length; i++) {
        var ent = enrichmentToCatalogEntry(enrichment[i]);
        if (seen[ent.catalogKey]) continue;
        seen[ent.catalogKey] = true;
        out.push(ent);
      }
    }

    var siglas = loadExamSiglasList();
    for (var g = 0; g < siglas.length; g++) {
      var genEnt = generalExamCatalogEntry(siglas[g] && siglas[g].sigla);
      if (!genEnt || seen[genEnt.catalogKey]) continue;
      seen[genEnt.catalogKey] = true;
      out.push(genEnt);
    }

    if (dictionary && Array.isArray(dictionary.fields)) {
      var fields = dictionary.fields;
      var added = 0;
      for (var f = 0; f < fields.length; f++) {
        if (added >= MAX_HPB_CATALOG_FIELDS) break;
        var row = fields[f];
        if (row.researchExport === false) continue;
        var hpbEnt = hpbFieldToCatalogEntry(row);
        if (!hpbEnt || seen[hpbEnt.catalogKey]) continue;
        seen[hpbEnt.catalogKey] = true;
        out.push(hpbEnt);
        added += 1;
      }
    }

    for (var c = 0; c < CLINICAL_EPISODE_CATALOG.length; c++) {
      var clEnt = CLINICAL_EPISODE_CATALOG[c];
      if (seen[clEnt.catalogKey]) continue;
      seen[clEnt.catalogKey] = true;
      out.push(clEnt);
    }

    for (var s = 0; s < PASSOMETRO_SURGERY_CATALOG.length; s++) {
      var surgEnt = PASSOMETRO_SURGERY_CATALOG[s];
      if (seen[surgEnt.catalogKey]) continue;
      seen[surgEnt.catalogKey] = true;
      out.push(surgEnt);
    }

    return out;
  }

  function getBaseCatalog() {
    if (!CATALOG_CACHE) {
      CATALOG_CACHE = buildCatalog();
    } else {
      var hasGeneral = false;
      for (var i = 0; i < CATALOG_CACHE.length; i++) {
        if (String(CATALOG_CACHE[i].catalogKey).indexOf("exam_general_") === 0) {
          hasGeneral = true;
          break;
        }
      }
      if (!hasGeneral && loadExamSiglasList().length > 0) {
        CATALOG_CACHE = buildCatalog();
      }
    }
    return CATALOG_CACHE;
  }

  function getMergedCatalog() {
    var base = getBaseCatalog();
    var adhocKeys = Object.keys(ADHOC_ENTRIES);
    if (!adhocKeys.length) return base;
    var out = base.slice();
    for (var i = 0; i < adhocKeys.length; i++) {
      out.push(ADHOC_ENTRIES[adhocKeys[i]]);
    }
    return out;
  }

  function getCatalogVariables() {
    return getMergedCatalog().slice();
  }

  function getCatalogGroups() {
    var catalog = getMergedCatalog();
    var groups = [];
    var seen = Object.create(null);
    for (var i = 0; i < catalog.length; i++) {
      var g = catalog[i].group;
      if (!seen[g]) {
        seen[g] = true;
        groups.push(g);
      }
    }
    return groups;
  }

  function findCatalogEntry(catalogKey) {
    var key = str(catalogKey);
    if (!key) return null;
    if (ADHOC_ENTRIES[key]) return ADHOC_ENTRIES[key];
    var catalog = getBaseCatalog();
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].catalogKey === key) return catalog[i];
    }
    return null;
  }

  function filterCatalog(opts) {
    opts = opts || {};
    var q = str(opts.query).toLowerCase();
    var group = str(opts.group);
    var domain = str(opts.domain);
    return getMergedCatalog().filter(function (entry) {
      if (group && entry.group !== group) return false;
      if (domain && entry.domain !== domain) return false;
      if (q) {
        var hay =
          (entry.catalogKey + " " + entry.label + " " + entry.group).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function catalogKeyExists(catalogKey) {
    return !!findCatalogEntry(catalogKey);
  }

  function domainsForCatalogKeys(keys) {
    var domains = Object.create(null);
    if (!Array.isArray(keys)) return [];
    for (var i = 0; i < keys.length; i++) {
      var key = str(keys[i]);
      var ent = findCatalogEntry(key);
      if (ent && ent.domain) {
        domains[ent.domain] = true;
        continue;
      }
      if (
        key.indexOf("exam_general_") === 0 ||
        key.indexOf("exam_adhoc_") === 0
      ) {
        domains.exam = true;
      }
    }
    return Object.keys(domains);
  }

  function clearAdhocCatalogEntries() {
    ADHOC_ENTRIES = Object.create(null);
  }

  return {
    get CATALOG() {
      return getMergedCatalog();
    },
    DOMAIN_GROUP: DOMAIN_GROUP,
    GENERAL_FROM_DAYS: GENERAL_FROM_DAYS,
    GENERAL_TO_DAYS: GENERAL_TO_DAYS,
    getCatalogVariables: getCatalogVariables,
    getCatalogGroups: getCatalogGroups,
    findCatalogEntry: findCatalogEntry,
    filterCatalog: filterCatalog,
    catalogKeyExists: catalogKeyExists,
    domainsForCatalogKeys: domainsForCatalogKeys,
    buildCatalog: buildCatalog,
    sanitizeSiglaForKey: sanitizeSiglaForKey,
    generalExamCatalogEntry: generalExamCatalogEntry,
    buildAdhocCatalogEntry: buildAdhocCatalogEntry,
    registerAdhocCatalogEntry: registerAdhocCatalogEntry,
    clearAdhocCatalogEntries: clearAdhocCatalogEntries,
  };
});
