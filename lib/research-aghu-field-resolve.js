/**
 * Resolução de valores AGHU para campos Research custom com aghuSource (FEAT-051).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchAghuFieldResolve = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var catalogApi = null;
  var enrichmentApi = null;
  var hpbSchema = null;
  var pathsApi = null;
  var registrySchema = null;
  var patientEpisodesApi = null;
  var clinicalBridgeApi = null;
  var passometroCollectionApi = null;
  var passometroSchemaApi = null;
  var examLv = null;

  try {
    if (typeof require === "function") {
      catalogApi = require("./aghu-research-variable-catalog.js");
      enrichmentApi = require("./hpb-research-enrichment.js");
      hpbSchema = require("./hpb-registry-schema.js");
      pathsApi = require("./research-protocol-field-paths.js");
      registrySchema = require("./research-registry-schema.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      clinicalBridgeApi = require("./patient-episodes-hpb-bridge.js");
      passometroCollectionApi = require("./passometro-collection.js");
      passometroSchemaApi = require("./passometro-schema.js");
      examLv = require("./exam-latest-value.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function getNested(obj, pathParts) {
    var cur = obj;
    for (var i = 0; i < pathParts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[pathParts[i]];
    }
    return cur;
  }

  function formatRegistryValue(raw) {
    if (raw == null) return "";
    if (typeof raw === "boolean") return raw ? "Sim" : "Não";
    return String(raw);
  }

  function latestEpisode(registry) {
    var episodes = Array.isArray(registry.episodes) ? registry.episodes : [];
    var active = hpbSchema && hpbSchema.filterRegistryActive
      ? hpbSchema.filterRegistryActive({ episodes: episodes }).episodes
      : episodes.filter(function (ep) {
          return !ep.deletedAt;
        });
    if (!active.length) return null;
    return active[active.length - 1];
  }

  function latestSurgery(episode) {
    if (!episode) return null;
    var surgeries = Array.isArray(episode.surgeries) ? episode.surgeries : [];
    var active = surgeries.filter(function (s) {
      return !s.deletedAt;
    });
    if (!active.length) return null;
    return active[active.length - 1];
  }

  function hpbContainerForModule(moduleId, episode, surgery) {
    if (!moduleId) return null;
    if (moduleId === "episode") return episode;
    if (!surgery) return null;
    if (moduleId === "preop") return surgery.preop || null;
    if (moduleId === "surgery_core") return surgery.core || null;
    if (moduleId === "postop") return surgery.postop || null;
    if (moduleId === "followup") return surgery.followups || null;
    if (moduleId === "mdt") return episode.mdt || null;
    if (moduleId === "hepatectomy") return surgery.hepatectomy || null;
    if (moduleId === "pancreatectomy") return surgery.pancreatectomy || null;
    if (moduleId === "biliary") return surgery.biliary || null;
    return surgery[moduleId] || null;
  }

  function resolveClinicalEpisodeValue(patientDomains, resolution, rowContext) {
    if (!patientEpisodesApi || !clinicalBridgeApi) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var snap = patientEpisodesApi.normalizeSnapshot(
      patientDomains.patient_episodes || patientEpisodesApi.emptySnapshot(),
    );
    var entry = null;
    var ctx = rowContext || {};
    if (ctx.patientEpisodeId) {
      entry = patientEpisodesApi.getEntry(snap, ctx.patientEpisodeId);
      if (entry && entry.deletedAt) entry = null;
    }
    if (!entry && ctx.grain !== "clinical_episode") {
      var active = patientEpisodesApi.filterActiveEntries(snap);
      if (active.length) entry = active[active.length - 1];
    }
    if (!entry) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var path = str(resolution.path);
    var raw = clinicalBridgeApi.resolveClinicalPath(entry, path);
    return {
      value: formatRegistryValue(raw),
      provenance:
        raw != null && str(raw) !== ""
          ? { source: "patient_episodes", label: path }
          : null,
      missingDomain: false,
    };
  }

  function resolvePassometroSurgeryValue(patientDomains, resolution, rowContext) {
    if (!passometroCollectionApi || !passometroSchemaApi) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var ctx = rowContext || {};
    var episodeId = str(ctx.patientEpisodeId);
    var surgeryIndex = ctx.surgeryIndex;
    if (!episodeId || surgeryIndex == null || surgeryIndex < 0) {
      return { value: "", provenance: null, missingDomain: false };
    }
    var norm = passometroCollectionApi.normalizePassometroDomain(
      patientDomains.passometro,
      patientDomains.patient_episodes,
    );
    var snap = passometroCollectionApi.resolveSnapForEpisode(
      norm.collection,
      episodeId,
    );
    if (!snap || !snap.header) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var cirurgias = passometroSchemaApi.normalizeCirurgiasFromHeader(snap.header);
    var cir = cirurgias[surgeryIndex];
    if (!cir) {
      return { value: "", provenance: null, missingDomain: false };
    }
    var path = str(resolution.path);
    var raw;
    if (path === "poComplicacoes") {
      var notes = Array.isArray(cir.poNotas) ? cir.poNotas : [];
      var parts = [];
      for (var ni = 0; ni < notes.length; ni++) {
        var note = notes[ni];
        var comp = note && str(note.complicacoes);
        if (comp) parts.push(comp);
      }
      raw = parts.length ? parts.join("; ") : "";
    } else {
      raw = cir[path];
    }
    return {
      value: formatRegistryValue(raw),
      provenance:
        raw != null && str(raw) !== ""
          ? { source: "passometro", label: "cirurgias[" + surgeryIndex + "]." + path }
          : null,
      missingDomain: false,
    };
  }

  function resolveHpbRegistryValue(hpbRegistry, resolution, rowContext) {
    if (!hpbRegistry || !resolution) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var episode = latestEpisode(hpbRegistry);
    if (!episode) {
      return { value: "", provenance: null, missingDomain: true };
    }
    var surgery = latestSurgery(episode);
    var moduleId = resolution.moduleId;
    var fieldKey = resolution.fieldKey;
    var container = hpbContainerForModule(moduleId, episode, surgery);
    if (!container) {
      return { value: "", provenance: null, missingDomain: false };
    }
    if (moduleId === "followup" && Array.isArray(container)) {
      var last = container[container.length - 1];
      var v = last ? last[fieldKey] : undefined;
      return {
        value: formatRegistryValue(v),
        provenance: v != null && v !== ""
          ? { source: "hpb_registry", label: moduleId + "." + fieldKey }
          : null,
        missingDomain: false,
      };
    }
    var raw = container[fieldKey];
    return {
      value: formatRegistryValue(raw),
      provenance:
        raw != null && raw !== ""
          ? { source: "hpb_registry", label: moduleId + "." + fieldKey }
          : null,
      missingDomain: false,
    };
  }

  function resolveProtocolIndexDate(protocol, registry, protocolId) {
    if (!protocol || !pathsApi) return "";
    var indexPath = str(protocol.indexEvent);
    if (!indexPath) return "";
    var parsed = pathsApi.parseFieldPath(indexPath);
    if (!parsed) return "";
    var bucket =
      registrySchema && protocolId
        ? registrySchema.getProtocolBucket(registry || {}, protocolId)
        : { entities: [] };
    var entities = registrySchema
      ? registrySchema.filterActiveEntities(bucket.entities)
      : (bucket.entities || []).filter(function (e) {
          return !e.deletedAt;
        });
    for (var i = 0; i < entities.length; i++) {
      var ent = entities[i];
      var form = (protocol.forms || []).find(function (f) {
        return f.id === parsed.formId;
      });
      if (!form || ent.entityTypeId !== form.entityTypeId) continue;
      var val = ent.values && ent.values[parsed.fieldKey];
      if (val) return str(val);
    }
    return "";
  }

  function resolveAnchorISO(input) {
    input = input || {};
    var field = input.field;
    var entity = input.entity;
    var protocol = input.protocol;
    var registry = input.registry;
    var protocolId = input.protocolId;
    var aghuSource = field && field.aghuSource;
    if (!aghuSource) return "";

    var anchor = str(aghuSource.anchor) || "protocol_index";
    if (anchor === "entity_date") {
      var key = str(aghuSource.anchorFieldKey);
      return entity && entity.values ? str(entity.values[key]) : "";
    }
    return resolveProtocolIndexDate(protocol, registry, protocolId);
  }

  /**
   * FEAT-104/105: série temporal exam (cap 20, desc_by_collected_at).
   * @returns {{ value: string, seriesValues: string[], provenance: object|null }}
   */
  function resolveExamSeries(patientDomains, resolution, anchorISO) {
    var empty = { value: "", seriesValues: [], provenance: null };
    if (!examLv) return empty;
    if (!anchorISO) return empty;
    var hits = [];
    var labelPrefix = "";

    if (resolution.kind === "exam_adhoc") {
      if (!examLv.collectExamSeriesByMatchText) return empty;
      var matchText = str(resolution.matchText);
      if (!matchText) return empty;
      hits = examLv.collectExamSeriesByMatchText(
        patientDomains && patientDomains.exams,
        matchText,
        anchorISO,
        {
          fromDays: resolution.fromDays != null ? resolution.fromDays : -365,
          toDays: resolution.toDays != null ? resolution.toDays : 0,
          serumOnly: !!resolution.serumOnly,
          maxLength: 20,
        },
      );
      labelPrefix = matchText;
    } else {
      if (!examLv.collectExamSeries) return empty;
      var sigla = str(resolution.sigla);
      if (!sigla) return empty;
      hits = examLv.collectExamSeries(
        patientDomains && patientDomains.exams,
        sigla,
        anchorISO,
        {
          fromDays: resolution.fromDays,
          toDays: resolution.toDays,
          serumOnly: !!resolution.serumOnly,
          maxLength: 20,
        },
      );
      labelPrefix = sigla;
    }

    if (!hits.length) return empty;
    var seriesValues = [];
    for (var i = 0; i < hits.length; i++) {
      seriesValues.push(String(hits[i].value));
    }
    var first = hits[0];
    var label =
      labelPrefix +
      " em " +
      (first.dataLabel || first.dataISO || "") +
      " (" +
      first.value +
      (first.unit ? " " + first.unit : "") +
      ")";
    return {
      value: String(first.value),
      seriesValues: seriesValues,
      provenance: {
        source: "exams",
        dataISO: first.dataISO || "",
        label: label,
      },
    };
  }

  /**
   * @returns {{ value: string, provenance: object|null, fromManual: boolean, missingDomain?: boolean, seriesValues?: string[] }}
   */
  function resolveResearchFieldValue(input) {
    input = input || {};
    var field = input.field;
    var entity = input.entity;
    var protocol = input.protocol;
    var patientDomains = input.patientDomains || {};
    var registry = input.registry;
    var protocolId = input.protocolId;
    var rowContext = input.rowContext || null;

    if (!field || !field.aghuSource) {
      var manual = entity && entity.values ? entity.values[field.key] : undefined;
      return {
        value: formatRegistryValue(manual),
        provenance: null,
        fromManual: manual != null && manual !== "",
      };
    }

    var manualVal =
      entity && entity.values ? entity.values[field.key] : undefined;
    var hasManual = manualVal != null && str(manualVal) !== "";
    if (field.aghuSource.mode === "autofill" && hasManual) {
      return {
        value: formatRegistryValue(manualVal),
        provenance: null,
        fromManual: true,
      };
    }
    if (field.readOnly && hasManual) {
      return {
        value: formatRegistryValue(manualVal),
        provenance: null,
        fromManual: true,
      };
    }

    var entry =
      catalogApi && field.aghuSource.catalogKey
        ? catalogApi.findCatalogEntry(field.aghuSource.catalogKey)
        : null;
    if (!entry) {
      return { value: "", provenance: null, fromManual: false };
    }

    var resolution = entry.resolution || {};
    if (resolution.kind === "clinical_episode") {
      var clRes = resolveClinicalEpisodeValue(
        patientDomains,
        resolution,
        rowContext,
      );
      return {
        value: clRes.value,
        provenance: clRes.provenance,
        fromManual: false,
        missingDomain: clRes.missingDomain,
      };
    }
    if (resolution.kind === "passometro_surgery") {
      var pmRes = resolvePassometroSurgeryValue(
        patientDomains,
        resolution,
        rowContext,
      );
      return {
        value: pmRes.value,
        provenance: pmRes.provenance,
        fromManual: false,
        missingDomain: pmRes.missingDomain,
      };
    }
    if (resolution.kind === "hpb_registry") {
      var hpbRes = resolveHpbRegistryValue(
        patientDomains.hpb_registry,
        resolution,
        rowContext,
      );
      return {
        value: hpbRes.value,
        provenance: hpbRes.provenance,
        fromManual: false,
        missingDomain: hpbRes.missingDomain,
      };
    }

    var anchorISO = resolveAnchorISO({
      field: field,
      entity: entity,
      protocol: protocol,
      registry: registry,
      protocolId: protocolId,
    });

    if (resolution.kind === "enrichment" && resolution.source === "exam") {
      var examSeries = resolveExamSeries(patientDomains, resolution, anchorISO);
      return {
        value: examSeries.value,
        seriesValues: examSeries.seriesValues,
        provenance: examSeries.provenance,
        fromManual: false,
        missingDomain: entry.needsAnchor && !anchorISO,
      };
    }

    if (
      resolution.kind === "exam_general" ||
      resolution.kind === "exam_adhoc"
    ) {
      var genSeries = resolveExamSeries(patientDomains, resolution, anchorISO);
      return {
        value: genSeries.value,
        seriesValues: genSeries.seriesValues,
        provenance: genSeries.provenance,
        fromManual: false,
        missingDomain: entry.needsAnchor && !anchorISO,
      };
    }

    if (
      enrichmentApi &&
      enrichmentApi.resolveEnrichmentByKey &&
      resolution.enrichmentKey
    ) {
      var enriched = enrichmentApi.resolveEnrichmentByKey(
        resolution.enrichmentKey,
        patientDomains,
        anchorISO,
      );
      return {
        value: str(enriched.value),
        provenance: enriched.provenance,
        fromManual: false,
        missingDomain:
          entry.needsAnchor && !anchorISO && resolution.source !== "pii",
      };
    }

    return { value: "", provenance: null, fromManual: false };
  }

  function applyAutofillToEntityValues(input) {
    input = input || {};
    var form = input.form;
    var entity = input.entity;
    if (!form || !entity) return entity.values || {};

    var values = Object.assign({}, entity.values || {});
    var fields = form.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field.aghuSource || field.aghuSource.mode !== "autofill") continue;
      var cur = values[field.key];
      if (cur != null && str(cur) !== "") continue;
      var resolved = resolveResearchFieldValue({
        field: field,
        entity: entity,
        protocol: input.protocol,
        patientDomains: input.patientDomains,
        registry: input.registry,
        protocolId: input.protocolId,
        rowContext: input.rowContext,
      });
      if (resolved.value) values[field.key] = resolved.value;
    }
    return values;
  }

  /**
   * FEAT-104: monta maps values (escalar) + seriesValues para campos AGHU exam.
   */
  function buildFormSeriesBundle(input) {
    input = input || {};
    var form = input.form;
    var entity = input.entity;
    var values = Object.assign({}, (entity && entity.values) || {});
    var seriesValues = {};
    if (!form || !Array.isArray(form.fields)) {
      return { values: values, seriesValues: seriesValues };
    }
    for (var i = 0; i < form.fields.length; i++) {
      var field = form.fields[i];
      if (!field || !field.aghuSource) continue;
      var resolved = resolveResearchFieldValue({
        field: field,
        entity: entity,
        protocol: input.protocol,
        patientDomains: input.patientDomains,
        registry: input.registry,
        protocolId: input.protocolId,
        rowContext: input.rowContext,
      });
      if (resolved.fromManual) continue;
      if (resolved.value !== "" || (field.aghuSource.mode === "readonly" && resolved.seriesValues)) {
        if (resolved.value !== "") values[field.key] = resolved.value;
      }
      if (Array.isArray(resolved.seriesValues)) {
        seriesValues[field.key] = resolved.seriesValues;
      }
    }
    return { values: values, seriesValues: seriesValues };
  }

  return {
    resolveResearchFieldValue: resolveResearchFieldValue,
    resolveAnchorISO: resolveAnchorISO,
    resolveProtocolIndexDate: resolveProtocolIndexDate,
    resolveHpbRegistryValue: resolveHpbRegistryValue,
    resolveClinicalEpisodeValue: resolveClinicalEpisodeValue,
    resolvePassometroSurgeryValue: resolvePassometroSurgeryValue,
    applyAutofillToEntityValues: applyAutofillToEntityValues,
    resolveExamSeries: resolveExamSeries,
    buildFormSeriesBundle: buildFormSeriesBundle,
  };
});
