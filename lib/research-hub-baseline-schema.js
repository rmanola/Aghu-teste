/**
 * FEAT-099 — Baseline de entidades hub (Paciente / Episódio / Cirurgia) para estudos custom.
 * IDs estáveis + hubKind; grains builtins (não entity:{id}).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchHubBaselineSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HUB_ENTITY_IDS = {
    patient: "hub_patient",
    clinical_episode: "hub_clinical_episode",
    surgery: "hub_surgery",
  };

  var HUB_FORM_IDS = {
    patient: "hub_form_patient",
    clinical_episode: "hub_form_clinical_episode",
    surgery: "hub_form_surgery",
  };

  var HUB_KINDS = ["patient", "clinical_episode", "surgery"];
  var RESTORABLE_KINDS = ["clinical_episode", "surgery"];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function cloneSchema(schema) {
    var s = schema && typeof schema === "object" ? schema : {};
    return {
      entityTypes: Array.isArray(s.entityTypes)
        ? s.entityTypes.map(function (et) {
            return Object.assign({}, et);
          })
        : [],
      forms: Array.isArray(s.forms)
        ? s.forms.map(function (f) {
            return Object.assign({}, f, {
              fields: Array.isArray(f.fields)
                ? f.fields.map(function (field) {
                    return Object.assign({}, field, {
                      aghuSource: field.aghuSource
                        ? Object.assign({}, field.aghuSource)
                        : undefined,
                    });
                  })
                : [],
            });
          })
        : [],
      matrixViews: Array.isArray(s.matrixViews)
        ? s.matrixViews.map(function (mv) {
            return Object.assign({}, mv);
          })
        : [],
      studyDesign:
        s.studyDesign && typeof s.studyDesign === "object"
          ? Object.assign({}, s.studyDesign, {
              grains: Array.isArray(s.studyDesign.grains)
                ? s.studyDesign.grains.slice()
                : undefined,
              cohortGrains: Array.isArray(s.studyDesign.cohortGrains)
                ? s.studyDesign.cohortGrains.slice()
                : undefined,
            })
          : {},
    };
  }

  function findByHubKind(entityTypes, hubKind) {
    var list = Array.isArray(entityTypes) ? entityTypes : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].hubKind === hubKind) return list[i];
    }
    return null;
  }

  function isGenericSubject(et) {
    if (!et || et.hubKind) return false;
    if (str(et.cardinality) !== "one") return false;
    if (et.parentEntityTypeId != null && str(et.parentEntityTypeId) !== "") {
      return false;
    }
    return /^sujeito$/i.test(str(et.label));
  }

  function aghuField(key, label, catalogKey, opts) {
    opts = opts || {};
    return {
      key: key,
      label: label,
      type: opts.type || "text",
      readOnly: true,
      aghuSource: {
        catalogKey: catalogKey,
        mode: opts.mode || "readonly",
      },
    };
  }

  function buildPatientEntity() {
    return {
      id: HUB_ENTITY_IDS.patient,
      label: "Paciente (hub)",
      cardinality: "one",
      parentEntityTypeId: null,
      hubKind: "patient",
      grain: "patient",
    };
  }

  function buildEpisodeEntity(parentId) {
    return {
      id: HUB_ENTITY_IDS.clinical_episode,
      label: "Episódio clínico (hub)",
      cardinality: "many",
      parentEntityTypeId: parentId || HUB_ENTITY_IDS.patient,
      hubKind: "clinical_episode",
      grain: "clinical_episode",
    };
  }

  function buildSurgeryEntity(parentId) {
    return {
      id: HUB_ENTITY_IDS.surgery,
      label: "Cirurgia (hub)",
      cardinality: "many",
      parentEntityTypeId: parentId || HUB_ENTITY_IDS.clinical_episode,
      hubKind: "surgery",
      grain: "surgery",
    };
  }

  function buildPatientForm() {
    return {
      id: HUB_FORM_IDS.patient,
      label: "Paciente (hub)",
      entityTypeId: HUB_ENTITY_IDS.patient,
      fields: [
        aghuField("sexo", "Sexo", "pii.sexo", { mode: "autofill" }),
        aghuField("idade", "Idade (anos)", "pii.idade", {
          type: "number",
          mode: "autofill",
        }),
      ],
    };
  }

  function buildEpisodeForm() {
    return {
      id: HUB_FORM_IDS.clinical_episode,
      label: "Episódio clínico (hub)",
      entityTypeId: HUB_ENTITY_IDS.clinical_episode,
      fields: [
        aghuField("started_at", "Data início (episódio)", "clinical_episode.started_at", {
          type: "date",
        }),
        aghuField(
          "primary_diagnosis",
          "Diagnóstico principal",
          "clinical_episode.primary_diagnosis",
        ),
        aghuField("status", "Status do episódio", "clinical_episode.status"),
        aghuField("label", "Rótulo do episódio", "clinical_episode.label"),
      ],
    };
  }

  function buildSurgeryForm() {
    return {
      id: HUB_FORM_IDS.surgery,
      label: "Cirurgia (hub)",
      entityTypeId: HUB_ENTITY_IDS.surgery,
      fields: [
        aghuField("procedure", "Procedimento", "passometro.surgery.procedure"),
        aghuField("date", "Data cirúrgica", "passometro.surgery.date", {
          type: "date",
        }),
        aghuField(
          "description",
          "Descrição cirúrgica",
          "passometro.surgery.description",
        ),
      ],
    };
  }

  function cloneField(field) {
    if (!field || typeof field !== "object") return field;
    return Object.assign({}, field, {
      aghuSource: field.aghuSource
        ? Object.assign({}, field.aghuSource)
        : undefined,
    });
  }

  /**
   * FEAT-101 — seed canónico de fields por hubKind (cópia).
   * @param {"patient"|"clinical_episode"|"surgery"} hubKind
   * @returns {Array}
   */
  function getHubBaselineFields(hubKind) {
    var form = null;
    if (hubKind === "patient") form = buildPatientForm();
    else if (hubKind === "clinical_episode") form = buildEpisodeForm();
    else if (hubKind === "surgery") form = buildSurgeryForm();
    if (!form || !Array.isArray(form.fields)) return [];
    return form.fields.map(cloneField);
  }

  /**
   * @param {"patient"|"clinical_episode"|"surgery"} hubKind
   * @param {string} key
   */
  function isHubBaselineFieldKey(hubKind, key) {
    var k = str(key);
    if (!k || HUB_KINDS.indexOf(hubKind) === -1) return false;
    var baseline = getHubBaselineFields(hubKind);
    for (var i = 0; i < baseline.length; i++) {
      if (baseline[i].key === k) return true;
    }
    return false;
  }

  /**
   * Baseline primeiro; extras (key ∉ baseline) depois.
   * Protocolo pode sobrescrever label/mode de um key baseline — presença obrigatória.
   * @param {Array} fields
   * @param {"patient"|"clinical_episode"|"surgery"} hubKind
   */
  function mergeHubFormFields(fields, hubKind) {
    var baseline = getHubBaselineFields(hubKind);
    var list = Array.isArray(fields) ? fields : [];
    if (!baseline.length) {
      return list.map(cloneField);
    }
    var baselineKeys = {};
    for (var b = 0; b < baseline.length; b++) {
      baselineKeys[baseline[b].key] = true;
    }
    var byKey = {};
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !str(f.key)) continue;
      byKey[str(f.key)] = f;
    }
    var out = [];
    for (var j = 0; j < baseline.length; j++) {
      var seed = baseline[j];
      var override = byKey[seed.key];
      out.push(cloneField(override || seed));
    }
    for (var x = 0; x < list.length; x++) {
      var extra = list[x];
      if (!extra || !str(extra.key)) continue;
      if (baselineKeys[str(extra.key)]) continue;
      out.push(cloneField(extra));
    }
    return out;
  }

  /**
   * Para cada form ligado a entity com hubKind, repor fields via merge (idempotente).
   * @param {object} schema
   */
  function ensureHubFormFields(schema) {
    var out = cloneSchema(schema);
    for (var i = 0; i < out.forms.length; i++) {
      var form = out.forms[i];
      if (!form) continue;
      var et = null;
      for (var e = 0; e < out.entityTypes.length; e++) {
        if (
          out.entityTypes[e] &&
          out.entityTypes[e].id === form.entityTypeId
        ) {
          et = out.entityTypes[e];
          break;
        }
      }
      if (!et || !et.hubKind || HUB_KINDS.indexOf(et.hubKind) === -1) continue;
      form.fields = mergeHubFormFields(form.fields, et.hubKind);
    }
    return out;
  }

  function syncMatrixViews(forms) {
    var views = [];
    var list = Array.isArray(forms) ? forms : [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !f.id) continue;
      views.push({
        id: "mv_" + f.id,
        label: str(f.label) || f.id,
        formId: f.id,
        entityTypeId: f.entityTypeId,
      });
    }
    return views;
  }

  function normalizeStudyDesignGrains(studyDesign, grains, primary) {
    var sd = studyDesign && typeof studyDesign === "object" ? studyDesign : {};
    var list = Array.isArray(grains) && grains.length ? grains.slice() : ["patient"];
    var prim = primary && list.indexOf(primary) !== -1 ? primary : "patient";
    if (list.indexOf("patient") === -1) list.unshift("patient");
    sd.grains = list;
    sd.cohortGrains = list.slice();
    sd.primaryGrain = prim;
    sd.cohortGrain = prim;
    return sd;
  }

  /**
   * Schema completo: 3 entityTypes + 3 forms + matrixViews + grains builtins.
   */
  function buildHubBaselineSchema() {
    var entityTypes = [
      buildPatientEntity(),
      buildEpisodeEntity(HUB_ENTITY_IDS.patient),
      buildSurgeryEntity(HUB_ENTITY_IDS.clinical_episode),
    ];
    var forms = [buildPatientForm(), buildEpisodeForm(), buildSurgeryForm()];
    return {
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: syncMatrixViews(forms),
      studyDesign: normalizeStudyDesignGrains(
        {},
        ["patient", "clinical_episode", "surgery"],
        "patient",
      ),
    };
  }

  function rewriteEntityId(schema, oldId, newId) {
    if (!oldId || oldId === newId) return;
    var ets = schema.entityTypes;
    for (var i = 0; i < ets.length; i++) {
      if (ets[i].id === oldId) ets[i].id = newId;
      if (ets[i].parentEntityTypeId === oldId) {
        ets[i].parentEntityTypeId = newId;
      }
    }
    for (var f = 0; f < schema.forms.length; f++) {
      if (schema.forms[f].entityTypeId === oldId) {
        schema.forms[f].entityTypeId = newId;
      }
    }
    for (var m = 0; m < schema.matrixViews.length; m++) {
      if (schema.matrixViews[m].entityTypeId === oldId) {
        schema.matrixViews[m].entityTypeId = newId;
      }
    }
  }

  function promoteSubjectToHubPatient(schema) {
    var existing = findByHubKind(schema.entityTypes, "patient");
    if (existing) {
      if (existing.id !== HUB_ENTITY_IDS.patient) {
        rewriteEntityId(schema, existing.id, HUB_ENTITY_IDS.patient);
        existing = findByHubKind(schema.entityTypes, "patient");
      }
      if (existing) {
        existing.hubKind = "patient";
        existing.grain = "patient";
        existing.cardinality = "one";
        existing.parentEntityTypeId = null;
        if (!str(existing.label)) existing.label = "Paciente (hub)";
      }
      return existing;
    }

    var subject = null;
    for (var i = 0; i < schema.entityTypes.length; i++) {
      if (isGenericSubject(schema.entityTypes[i])) {
        subject = schema.entityTypes[i];
        break;
      }
    }
    if (subject) {
      var oldId = subject.id;
      subject.hubKind = "patient";
      subject.grain = "patient";
      subject.cardinality = "one";
      subject.parentEntityTypeId = null;
      subject.label = "Paciente (hub)";
      rewriteEntityId(schema, oldId, HUB_ENTITY_IDS.patient);
      return findByHubKind(schema.entityTypes, "patient");
    }

    // Só acrescenta paciente se já existir schema (não inventar hub em proposal vazio)
    if (schema.entityTypes.length > 0) {
      schema.entityTypes.unshift(buildPatientEntity());
      return findByHubKind(schema.entityTypes, "patient");
    }
    return null;
  }

  function ensureHubForm(schema, hubKind) {
    var entityId = HUB_ENTITY_IDS[hubKind];
    var formId = HUB_FORM_IDS[hubKind];
    var hasForm = schema.forms.some(function (f) {
      return f.id === formId || f.entityTypeId === entityId;
    });
    if (hasForm) return;
    if (hubKind === "patient") schema.forms.push(buildPatientForm());
    else if (hubKind === "clinical_episode") schema.forms.push(buildEpisodeForm());
    else if (hubKind === "surgery") schema.forms.push(buildSurgeryForm());
  }

  function addHubKind(schema, hubKind) {
    if (findByHubKind(schema.entityTypes, hubKind)) {
      ensureHubForm(schema, hubKind);
      return;
    }
    var patient = findByHubKind(schema.entityTypes, "patient");
    var patientId = patient ? patient.id : HUB_ENTITY_IDS.patient;
    var episode = findByHubKind(schema.entityTypes, "clinical_episode");

    if (hubKind === "patient") {
      promoteSubjectToHubPatient(schema);
      ensureHubForm(schema, "patient");
      return;
    }
    if (hubKind === "clinical_episode") {
      schema.entityTypes.push(buildEpisodeEntity(patientId));
      ensureHubForm(schema, "clinical_episode");
      return;
    }
    if (hubKind === "surgery") {
      var parentId = episode ? episode.id : patientId;
      schema.entityTypes.push(buildSurgeryEntity(parentId));
      ensureHubForm(schema, "surgery");
    }
  }

  function grainsFromEntityTypes(entityTypes) {
    var grains = [];
    var seen = {};
    var list = Array.isArray(entityTypes) ? entityTypes : [];
    for (var i = 0; i < list.length; i++) {
      var et = list[i];
      if (!et || !et.hubKind) continue;
      var g = et.grain || et.hubKind;
      if (HUB_KINDS.indexOf(g) === -1) continue;
      if (seen[g]) continue;
      seen[g] = true;
      grains.push(g);
    }
    if (!seen.patient) grains.unshift("patient");
    return grains;
  }

  function refreshMatrixAndGrains(schema, opts) {
    opts = opts || {};
    if (opts.resyncMatrix !== false) {
      schema.matrixViews = syncMatrixViews(schema.forms);
    }
    var hubGrains = grainsFromEntityTypes(schema.entityTypes);
    var sd = schema.studyDesign || {};
    var existing = Array.isArray(sd.grains)
      ? sd.grains.slice()
      : Array.isArray(sd.cohortGrains)
        ? sd.cohortGrains.slice()
        : [];
    var merged = [];
    var seen = {};
    function pushGrain(g) {
      if (!g || seen[g]) return;
      seen[g] = true;
      merged.push(g);
    }
    for (var i = 0; i < existing.length; i++) pushGrain(existing[i]);
    for (var h = 0; h < hubGrains.length; h++) pushGrain(hubGrains[h]);
    if (!seen.patient) merged.unshift("patient");
    var primary =
      sd.primaryGrain || sd.cohortGrain || "patient";
    schema.studyDesign = normalizeStudyDesignGrains(sd, merged, primary);
  }

  /**
   * Garante paciente (+ promote Sujeito). Opcionalmente seed kinds em falta.
   * @param {object} schema
   * @param {{ seedMissing?: boolean | 'all' | string[], ensurePatientForm?: boolean }} [opts]
   *   seedMissing false (default) — só paciente/promote (load / IA); não força forms hub.
   *   true | 'all' — acrescenta episódio e cirurgia se ausentes.
   *   array — kinds restorable a acrescentar.
   */
  function ensureHubBaseline(schema, opts) {
    opts = opts || {};
    var out = cloneSchema(schema);
    promoteSubjectToHubPatient(out);

    var seed = opts.seedMissing;
    var seeding =
      seed === true || seed === "all" || Array.isArray(seed);
    if (seeding && !findByHubKind(out.entityTypes, "patient")) {
      out.entityTypes.unshift(buildPatientEntity());
    }

    var ensureForm =
      opts.ensurePatientForm === true || seeding;
    if (ensureForm) ensureHubForm(out, "patient");

    var kindsToAdd = [];
    if (seed === true || seed === "all") {
      kindsToAdd = RESTORABLE_KINDS.slice();
    } else if (Array.isArray(seed)) {
      kindsToAdd = seed.filter(function (k) {
        return RESTORABLE_KINDS.indexOf(k) !== -1;
      });
    }

    for (var i = 0; i < kindsToAdd.length; i++) {
      addHubKind(out, kindsToAdd[i]);
    }

    refreshMatrixAndGrains(out, {
      resyncMatrix: seeding,
    });
    return ensureHubFormFields(out);
  }

  function removeEntityBundle(schema, entityId) {
    schema.entityTypes = schema.entityTypes.filter(function (et) {
      return et.id !== entityId;
    });
    var removedFormIds = {};
    schema.forms = schema.forms.filter(function (f) {
      if (f.entityTypeId === entityId) {
        removedFormIds[f.id] = true;
        return false;
      }
      return true;
    });
    schema.matrixViews = schema.matrixViews.filter(function (mv) {
      return !removedFormIds[mv.formId] && mv.entityTypeId !== entityId;
    });
  }

  function dropGrain(schema, grain) {
    var sd = schema.studyDesign || {};
    var list = Array.isArray(sd.grains)
      ? sd.grains
      : Array.isArray(sd.cohortGrains)
        ? sd.cohortGrains
        : [];
    var next = list.filter(function (g) {
      return g !== grain;
    });
    if (next.indexOf("patient") === -1) next.unshift("patient");
    var primary =
      sd.primaryGrain === grain || sd.cohortGrain === grain
        ? "patient"
        : sd.primaryGrain || sd.cohortGrain || "patient";
    schema.studyDesign = normalizeStudyDesignGrains(sd, next, primary);
  }

  /**
   * @param {object} schema
   * @param {"patient"|"clinical_episode"|"surgery"} hubKind
   * @param {{ orphanSurgery?: boolean }} [opts]
   * @returns {{ ok: true, schema: object } | { ok: false, error: string }}
   */
  function removeHubEntity(schema, hubKind, opts) {
    opts = opts || {};
    if (HUB_KINDS.indexOf(hubKind) === -1) {
      return { ok: false, error: "invalid_hub_kind" };
    }
    if (hubKind === "patient") {
      return { ok: false, error: "patient_required" };
    }

    var out = cloneSchema(schema);
    var target = findByHubKind(out.entityTypes, hubKind);
    if (!target) {
      return { ok: false, error: "hub_entity_not_found" };
    }

    var surgery = findByHubKind(out.entityTypes, "surgery");

    if (hubKind === "clinical_episode" && surgery) {
      if (opts.orphanSurgery !== true && opts.orphanSurgery !== false) {
        return { ok: false, error: "orphan_surgery_required" };
      }
      if (opts.orphanSurgery === false) {
        removeEntityBundle(out, surgery.id);
        dropGrain(out, "surgery");
      } else {
        var patient = findByHubKind(out.entityTypes, "patient");
        surgery.parentEntityTypeId = patient ? patient.id : null;
      }
    }

    removeEntityBundle(out, target.id);
    dropGrain(out, hubKind === "clinical_episode" ? "clinical_episode" : "surgery");
    refreshMatrixAndGrains(out);
    return { ok: true, schema: out };
  }

  /**
   * Repõe só kinds pedidos que estão em falta (nunca patient).
   * Cirurgia sem episódio → parent hub_patient.
   */
  function restoreHubEntities(schema, kinds) {
    var out = cloneSchema(schema);
    promoteSubjectToHubPatient(out);
    ensureHubForm(out, "patient");

    var list = Array.isArray(kinds) ? kinds : [];
    var ordered = [];
    if (list.indexOf("clinical_episode") !== -1) ordered.push("clinical_episode");
    if (list.indexOf("surgery") !== -1) ordered.push("surgery");

    for (var i = 0; i < ordered.length; i++) {
      addHubKind(out, ordered[i]);
    }

    refreshMatrixAndGrains(out);
    return out;
  }

  function listMissingRestorableKinds(schema) {
    var s = schema && typeof schema === "object" ? schema : {};
    var missing = [];
    for (var i = 0; i < RESTORABLE_KINDS.length; i++) {
      var k = RESTORABLE_KINDS[i];
      if (!findByHubKind(s.entityTypes, k)) missing.push(k);
    }
    return missing;
  }

  return {
    HUB_ENTITY_IDS: HUB_ENTITY_IDS,
    HUB_FORM_IDS: HUB_FORM_IDS,
    HUB_KINDS: HUB_KINDS,
    RESTORABLE_KINDS: RESTORABLE_KINDS,
    buildHubBaselineSchema: buildHubBaselineSchema,
    ensureHubBaseline: ensureHubBaseline,
    removeHubEntity: removeHubEntity,
    restoreHubEntities: restoreHubEntities,
    listMissingRestorableKinds: listMissingRestorableKinds,
    findByHubKind: findByHubKind,
    isGenericSubject: isGenericSubject,
    getHubBaselineFields: getHubBaselineFields,
    isHubBaselineFieldKey: isHubBaselineFieldKey,
    mergeHubFormFields: mergeHubFormFields,
    ensureHubFormFields: ensureHubFormFields,
  };
});
