/**
 * Flatten research_registry cross-paciente para matriz coorte custom.
 * FEAT-061: expansão por cohortGrain (patient | clinical_episode | surgery).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchCohortRows = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var dateBr =
    typeof require !== "undefined"
      ? require("./date-br.js")
      : typeof globalThis !== "undefined" && globalThis.AghuDateBr
        ? globalThis.AghuDateBr
        : { toDisplayBr: function (v) { return v == null ? "" : String(v); } };

  var schemaApi = null;
  var fieldSchemaApi = null;
  var resolveApi = null;
  var studyProtocolApi = null;
  var patientEpisodesApi = null;
  var passometroCollectionApi = null;
  var passometroSchemaApi = null;
  var clinicalBridgeApi = null;
  var computedApi = null;

  try {
    if (typeof require === "function") {
      schemaApi = require("./research-registry-schema.js");
      fieldSchemaApi = require("./research-field-schema.js");
      resolveApi = require("./research-aghu-field-resolve.js");
      studyProtocolApi = require("./hpb-study-protocol.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      passometroCollectionApi = require("./passometro-collection.js");
      passometroSchemaApi = require("./passometro-schema.js");
      clinicalBridgeApi = require("./patient-episodes-hpb-bridge.js");
      computedApi = require("./research-computed.js");
    }
  } catch (_e) {}

  var DEFAULT_COHORT_GRAIN = "patient";

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function isEntityGrain(g) {
    if (studyProtocolApi && studyProtocolApi.isEntityGrain) {
      return studyProtocolApi.isEntityGrain(g);
    }
    var s = str(g);
    return s.indexOf("entity:") === 0 && s.length > "entity:".length;
  }

  function entityTypeIdFromGrain(g) {
    if (studyProtocolApi && studyProtocolApi.entityTypeIdFromGrain) {
      return studyProtocolApi.entityTypeIdFromGrain(g);
    }
    if (!isEntityGrain(g)) return "";
    return str(g).slice("entity:".length);
  }

  function normalizeCohortGrain(raw, protocolOrEntityTypes) {
    if (studyProtocolApi && studyProtocolApi.normalizeCohortGrain) {
      return studyProtocolApi.normalizeCohortGrain(raw, protocolOrEntityTypes);
    }
    var g = str(raw);
    if (g === "clinical_episode" || g === "surgery") return g;
    if (isEntityGrain(g)) return g;
    return DEFAULT_COHORT_GRAIN;
  }

  /**
   * FEAT-088: entityType.grain → opts.grain ∈ cohortGrains → cohortGrain → patient.
   * @param {{ grain?: string }} [opts]
   * @param {{ studyDesign?: object, entityTypes?: Array }} [protocol]
   * @param {{ entityTypeId?: string }} [matrixView]
   * @param {{ entityTypes?: Array }} [protocolSchema]
   */
  function resolveGrain(opts, protocol, matrixView, protocolSchema) {
    // 1. entityType.grain do matrixView.entityTypeId (enum válido)
    var entityTypeId =
      matrixView && matrixView.entityTypeId
        ? str(matrixView.entityTypeId)
        : "";
    if (entityTypeId) {
      var types =
        (protocolSchema && protocolSchema.entityTypes) ||
        (protocol && protocol.entityTypes) ||
        [];
      for (var i = 0; i < types.length; i++) {
        if (!types[i] || str(types[i].id) !== entityTypeId) continue;
        var rawEg = str(types[i].grain);
        if (
          rawEg === "patient" ||
          rawEg === "clinical_episode" ||
          rawEg === "surgery" ||
          isEntityGrain(rawEg)
        ) {
          return normalizeCohortGrain(rawEg, protocol || protocolSchema);
        }
        break;
      }
    }

    // 2. opts.grain — se protocol declara cohortGrains/grains, só ∈ lista (MG-03/04);
    //    sem lista explícita (FEAT-061), qualquer grain válido do enum.
    if (opts && opts.grain) {
      var sd = protocol && protocol.studyDesign;
      var hasExplicitList =
        sd &&
        ((Array.isArray(sd.cohortGrains) && sd.cohortGrains.length > 0) ||
          (Array.isArray(sd.grains) && sd.grains.length > 0));
      if (
        hasExplicitList &&
        studyProtocolApi &&
        studyProtocolApi.resolveSessionGrain
      ) {
        return studyProtocolApi.resolveSessionGrain(protocol, opts.grain);
      }
      return normalizeCohortGrain(opts.grain);
    }

    // 3–4. cohortGrain / patient
    if (protocol && protocol.studyDesign && protocol.studyDesign.cohortGrain) {
      return normalizeCohortGrain(protocol.studyDesign.cohortGrain);
    }
    if (studyProtocolApi && studyProtocolApi.getProtocolCohortGrain) {
      return studyProtocolApi.getProtocolCohortGrain(protocol);
    }
    return DEFAULT_COHORT_GRAIN;
  }

  function toFieldString(value, fieldType) {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    var s = String(value);
    if (fieldType === "date" || /^\d{4}-\d{2}-\d{2}$/.test(s.trim())) {
      return dateBr.toDisplayBr(s);
    }
    return s;
  }

  function dedupePatientsByRecordClientId(patients) {
    var seen = Object.create(null);
    var out = [];
    if (!Array.isArray(patients)) return out;
    for (var i = 0; i < patients.length; i++) {
      var p = patients[i];
      var id = p && p.recordClientId ? String(p.recordClientId) : "";
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(p);
    }
    return out;
  }

  function entityLabel(entity, fields) {
    if (!entity) return "";
    var values = entity.values || {};
    for (var i = 0; i < (fields || []).length; i++) {
      var f = fields[i];
      if (f.type === "date" && values[f.key]) {
        return dateBr.toDisplayBr(String(values[f.key])).slice(0, 32);
      }
      if (f.type === "text" && values[f.key]) {
        return String(values[f.key]).slice(0, 32);
      }
    }
    return String(entity.id || "").slice(0, 32);
  }

  function episodeRowLabel(entry) {
    if (!entry) return "";
    var label = str(entry.label);
    if (label) return label.slice(0, 64);
    if (entry.startedAt) {
      return ("Internação " + dateBr.toDisplayBr(String(entry.startedAt))).slice(0, 64);
    }
    return str(entry.id).slice(0, 64);
  }

  function surgeryRowLabel(cirurgia, passometroSchema) {
    if (!cirurgia) return "";
    if (passometroSchema && passometroSchema.formatCirurgiaLabel) {
      return passometroSchema.formatCirurgiaLabel(cirurgia).slice(0, 64);
    }
    var nome = str(cirurgia.nome);
    if (cirurgia.data && nome) {
      return (nome + " " + dateBr.toDisplayBr(String(cirurgia.data))).slice(0, 64);
    }
    return (nome || str(cirurgia.descricao)).slice(0, 64);
  }

  function patientGrainUnits() {
    return [{ grain: DEFAULT_COHORT_GRAIN }];
  }

  function clinicalEpisodeGrainUnits(patient) {
    if (!patientEpisodesApi) return [];
    var snap = patientEpisodesApi.normalizeSnapshot(
      patient.patient_episodes || patientEpisodesApi.emptySnapshot(),
    );
    var entries = patientEpisodesApi.filterActiveEntries(snap);
    var units = [];
    for (var i = 0; i < entries.length; i++) {
      var ep = entries[i];
      units.push({
        grain: "clinical_episode",
        patientEpisodeId: ep.id,
        row_date: str(ep.startedAt),
        row_label: episodeRowLabel(ep),
      });
    }
    return units;
  }

  function surgeryGrainUnits(patient) {
    if (!passometroCollectionApi || !passometroSchemaApi) return [];
    var norm = passometroCollectionApi.normalizePassometroDomain(
      patient.passometro,
      patient.patient_episodes,
    );
    var coll = norm.collection;
    var registros = Array.isArray(coll.registros) ? coll.registros : [];
    var units = [];
    for (var ri = 0; ri < registros.length; ri++) {
      var reg = registros[ri];
      var episodeId = str(reg.patientEpisodeId);
      var header = reg.snap && reg.snap.header ? reg.snap.header : null;
      var cirurgias = passometroSchemaApi.normalizeCirurgiasFromHeader(header || {});
      for (var si = 0; si < cirurgias.length; si++) {
        var cir = cirurgias[si];
        units.push({
          grain: "surgery",
          patientEpisodeId: episodeId,
          surgeryIndex: si,
          row_date: str(cir.data),
          row_label: surgeryRowLabel(cir, passometroSchemaApi),
        });
      }
    }
    return units;
  }

  /**
   * @param {object} patient
   * @param {string} grain
   * @param {{ protocolId?: string, registry?: object, protocol?: object }} [opts]
   * @returns {Array<{ grain: string, patientEpisodeId?: string, surgeryIndex?: number, entityId?: string, row_date?: string, row_label?: string }>}
   */
  function expandGrainUnits(patient, grain, opts) {
    opts = opts || {};
    var protocol = opts.protocol || null;
    grain = normalizeCohortGrain(grain, protocol);
    if (grain === "clinical_episode") return clinicalEpisodeGrainUnits(patient);
    if (grain === "surgery") return surgeryGrainUnits(patient);
    if (isEntityGrain(grain)) {
      return entityGrainUnits(patient, grain, opts);
    }
    return patientGrainUnits();
  }

  /**
   * FEAT-098: 1 unit por instância activa do tipo; 0 instâncias → [].
   * Sem fallback silencioso a patient.
   */
  function entityGrainUnits(patient, grain, opts) {
    opts = opts || {};
    var entityTypeId = entityTypeIdFromGrain(grain);
    if (!entityTypeId) return [];
    var protocolId = str(opts.protocolId || (patient && patient.protocolId));
    var registry =
      (opts.registry != null ? opts.registry : null) ||
      (patient && patient.registry) ||
      {};
    if (!protocolId || !schemaApi) return [];
    var bucket = schemaApi.getProtocolBucket(registry, protocolId);
    var entities = schemaApi.filterActiveEntities(bucket.entities || []);
    var ofType = [];
    for (var i = 0; i < entities.length; i++) {
      if (str(entities[i].entityTypeId) === entityTypeId) {
        ofType.push(entities[i]);
      }
    }
    var labelBase = entityTypeId;
    var protocol = opts.protocol;
    if (studyProtocolApi && studyProtocolApi.grainLabel && protocol) {
      labelBase = studyProtocolApi.grainLabel(protocol, grain);
    } else if (protocol && Array.isArray(protocol.entityTypes)) {
      for (var t = 0; t < protocol.entityTypes.length; t++) {
        if (protocol.entityTypes[t] && str(protocol.entityTypes[t].id) === entityTypeId) {
          labelBase = str(protocol.entityTypes[t].label) || entityTypeId;
          break;
        }
      }
    }
    var units = [];
    for (var u = 0; u < ofType.length; u++) {
      var ent = ofType[u];
      var dateVal = "";
      if (ent.values && typeof ent.values === "object") {
        var keys = Object.keys(ent.values);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (/date|data/i.test(key) && ent.values[key]) {
            dateVal = str(ent.values[key]);
            break;
          }
        }
      }
      units.push({
        grain: grain,
        entityId: ent.id,
        row_date: dateVal || undefined,
        row_label: labelBase + " " + (u + 1),
      });
    }
    return units;
  }

  function rowContextFromUnit(unit) {
    if (!unit || unit.grain === DEFAULT_COHORT_GRAIN) return null;
    var out = { grain: unit.grain };
    if (unit.patientEpisodeId) out.patientEpisodeId = unit.patientEpisodeId;
    if (unit.surgeryIndex != null) out.surgeryIndex = unit.surgeryIndex;
    if (unit.entityId) out.entityId = unit.entityId;
    return out;
  }

  function grainMetaFromUnit(unit) {
    if (!unit || unit.grain === DEFAULT_COHORT_GRAIN) {
      return {
        row_date: undefined,
        row_label: undefined,
        patient_episode_id: undefined,
        surgery_index: undefined,
        entityId: undefined,
        cohortGrain: DEFAULT_COHORT_GRAIN,
      };
    }
    return {
      row_date: unit.row_date || undefined,
      row_label: unit.row_label || undefined,
      patient_episode_id: unit.patientEpisodeId || undefined,
      surgery_index:
        unit.surgeryIndex != null ? unit.surgeryIndex : undefined,
      entityId: unit.entityId || undefined,
      cohortGrain: unit.grain,
    };
  }

  function valuesFromFields(entity, fields, resolveCtx) {
    var values = {};
    if (!entity || !fields) return values;
    var data = entity.values || {};
    var seriesValues = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var raw = data[f.key];
      if (f.aghuSource && resolveApi && resolveCtx) {
        var resolved = resolveApi.resolveResearchFieldValue({
          field: f,
          entity: entity,
          protocol: resolveCtx.protocol,
          patientDomains: resolveCtx.patientDomains,
          registry: resolveCtx.registry,
          protocolId: resolveCtx.protocolId,
          rowContext: resolveCtx.rowContext || null,
        });
        if (Array.isArray(resolved.seriesValues)) {
          seriesValues[f.key] = resolved.seriesValues;
        }
        if (resolved.value !== "" || f.aghuSource.mode === "readonly") {
          values[f.key] = toFieldString(resolved.value, f.type);
          continue;
        }
      }
      if (raw != null && raw !== "") {
        values[f.key] = toFieldString(raw, f.type);
      }
    }
    if (computedApi && computedApi.enrichEntityValues && resolveCtx && resolveCtx.form) {
      values = computedApi.enrichEntityValues(resolveCtx.form, values, {
        seriesValues: seriesValues,
      });
    }
    return values;
  }

  /**
   * @param {Array<{ recordClientId: string, prontuario: string, registry: object, protocolId: string, exams?: unknown, controles?: unknown, prescricoes?: unknown, pii?: unknown, hpb_registry?: unknown, patient_episodes?: unknown, passometro?: unknown }>} patients
   * @param {{ id: string, formId: string, entityTypeId: string }} matrixView
   * @param {{ forms: Array<{ id: string, fields: Array }> }} protocolSchema
   * @param {{ id: string, indexEvent?: string, studyDesign?: { cohortGrain?: string } }} [protocol]
   * @param {{ grain?: string }} [opts]
   */
  function expandCohortRows(patients, matrixView, protocolSchema, protocol, opts) {
    var rows = [];
    if (!Array.isArray(patients) || !matrixView || !protocolSchema) return rows;

    var grain = resolveGrain(opts, protocol, matrixView, protocolSchema);
    var form = fieldSchemaApi
      ? fieldSchemaApi.getFormById(protocolSchema, matrixView.formId)
      : (protocolSchema.forms || []).find(function (f) {
          return f.id === matrixView.formId;
        });
    if (!form) return rows;

    var fields = form.fields || [];
    var unique = dedupePatientsByRecordClientId(patients);

    for (var p = 0; p < unique.length; p++) {
      var patient = unique[p];
      var protocolId = patient.protocolId;
      var registry = patient.registry || {};
      var bucket =
        schemaApi && protocolId
          ? schemaApi.getProtocolBucket(registry, protocolId)
          : { entities: [] };
      var entities = schemaApi
        ? schemaApi.filterActiveEntities(bucket.entities)
        : (bucket.entities || []).filter(function (e) {
            return !e.deletedAt;
          });

      var grainUnits = expandGrainUnits(patient, grain, {
        protocolId: protocolId,
        registry: registry,
        protocol: protocol || protocolSchema,
      });

      // FEAT-098: grain entity:X + view tipo X → 1 linha/instância (sem cartesian).
      if (isEntityGrain(grain)) {
        var grainEntityTypeId = entityTypeIdFromGrain(grain);
        if (str(matrixView.entityTypeId) !== grainEntityTypeId) continue;
        if (!grainUnits.length) continue;
        var byId = Object.create(null);
        for (var e0 = 0; e0 < entities.length; e0++) {
          byId[entities[e0].id] = entities[e0];
        }
        for (var gu0 = 0; gu0 < grainUnits.length; gu0++) {
          var unit0 = grainUnits[gu0];
          var entity0 = unit0.entityId ? byId[unit0.entityId] : null;
          if (!entity0) continue;
          var rowContext0 = rowContextFromUnit(unit0);
          var grainMeta0 = grainMetaFromUnit(unit0);
          rows.push({
            meta: Object.assign(
              {
                recordClientId: patient.recordClientId,
                prontuario: patient.prontuario || "—",
                entityId: entity0.id,
                entityLabel: entityLabel(entity0, fields),
                parentId: entity0.parentId || undefined,
                rowContext: rowContext0 || undefined,
              },
              grainMeta0,
            ),
            values: valuesFromFields(entity0, fields, {
              form: form,
              protocol: protocol || protocolSchema,
              protocolId: protocolId,
              registry: registry,
              rowContext: rowContext0,
              patientDomains: {
                exams: patient.exams,
                controles: patient.controles,
                prescricoes: patient.prescricoes,
                pii: patient.pii,
                hpb_registry: patient.hpb_registry,
                patient_episodes: patient.patient_episodes,
                passometro: patient.passometro,
              },
            }),
          });
        }
        continue;
      }

      if (!grainUnits.length) continue;

      for (var e = 0; e < entities.length; e++) {
        var entity = entities[e];
        if (entity.entityTypeId !== matrixView.entityTypeId) continue;

        for (var gu = 0; gu < grainUnits.length; gu++) {
          var unit = grainUnits[gu];
          var rowContext = rowContextFromUnit(unit);
          var grainMeta = grainMetaFromUnit(unit);
          rows.push({
            meta: Object.assign(
              {
                recordClientId: patient.recordClientId,
                prontuario: patient.prontuario || "—",
                entityId: entity.id,
                entityLabel: entityLabel(entity, fields),
                parentId: entity.parentId || undefined,
                rowContext: rowContext || undefined,
              },
              grainMeta,
            ),
            values: valuesFromFields(entity, fields, {
              form: form,
              protocol: protocol || protocolSchema,
              protocolId: protocolId,
              registry: registry,
              rowContext: rowContext,
              patientDomains: {
                exams: patient.exams,
                controles: patient.controles,
                prescricoes: patient.prescricoes,
                pii: patient.pii,
                hpb_registry: patient.hpb_registry,
                patient_episodes: patient.patient_episodes,
                passometro: patient.passometro,
              },
            }),
          });
        }
      }
    }
    return rows;
  }

  function denominatorLabelForGrain(grain, protocol) {
    grain = normalizeCohortGrain(grain, protocol);
    if (grain === "surgery") return "por cirurgia";
    if (grain === "clinical_episode") return "por episódio clínico";
    if (isEntityGrain(grain)) {
      var label =
        studyProtocolApi && studyProtocolApi.grainLabel
          ? studyProtocolApi.grainLabel(protocol, grain)
          : entityTypeIdFromGrain(grain);
      return label ? "por " + String(label).toLowerCase() : "por registo";
    }
    return "por paciente";
  }

  /**
   * FEAT-088/098: units + rótulo de denominador para analytics (indicadores/desfechos/qualidade).
   * @returns {{ grain: string, units: Array, denominatorLabel: string }}
   */
  function analyticsUnitsForPatient(patient, grain, opts) {
    opts = opts || {};
    var protocol = opts.protocol || null;
    grain = normalizeCohortGrain(grain, protocol);
    var units = expandGrainUnits(patient || {}, grain, {
      protocolId: opts.protocolId || (patient && patient.protocolId),
      registry: opts.registry || (patient && patient.registry),
      protocol: protocol,
    });
    return {
      grain: grain,
      units: units,
      denominatorLabel: denominatorLabelForGrain(grain, protocol),
    };
  }

  function buildCohortRows(patients, matrixView, protocolSchema, protocol, opts) {
    return expandCohortRows(patients, matrixView, protocolSchema, protocol, opts);
  }

  return {
    DEFAULT_COHORT_GRAIN: DEFAULT_COHORT_GRAIN,
    normalizeCohortGrain: normalizeCohortGrain,
    resolveGrain: resolveGrain,
    expandGrainUnits: expandGrainUnits,
    analyticsUnitsForPatient: analyticsUnitsForPatient,
    denominatorLabelForGrain: denominatorLabelForGrain,
    expandCohortRows: expandCohortRows,
    rowContextFromUnit: rowContextFromUnit,
    grainMetaFromUnit: grainMetaFromUnit,
    toFieldString: toFieldString,
    buildCohortRows: buildCohortRows,
    dedupePatientsByRecordClientId: dedupePatientsByRecordClientId,
    isEntityGrain: isEntityGrain,
    entityTypeIdFromGrain: entityTypeIdFromGrain,
  };
});
