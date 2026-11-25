/**
 * Validação de schema de campos Research configurável (protocolo custom).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchFieldSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var fieldConditionalApi = null;
  var computedApi = null;
  var catalogApi = null;
  try {
    if (typeof require === "function") {
      fieldConditionalApi = require("./research-field-conditional.js");
      computedApi = require("./research-computed.js");
      catalogApi = require("./aghu-research-variable-catalog.js");
    }
  } catch (_e) {}

  var VALID_FIELD_TYPES = [
    "text",
    "textarea",
    "date",
    "number",
    "select",
    "boolean",
    "computed",
  ];

  var VALID_DOMAIN_TYPES = ["hpb_builtin", "custom"];

  var VALID_CARDINALITIES = ["one", "many"];

  var MAX_ENTITY_TYPES = 10;
  var MAX_FORMS = 20;
  var MAX_FIELDS_PER_FORM = 50;
  var MAX_OPTIONS_PER_SELECT = 100;
  var MAX_LABEL_LEN = 120;
  var FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

  var PHI_PATTERNS = [
    /\bprontu[aá]rio\b/i,
    /\bnome\s*(completo|do paciente)?\b/i,
    /\bdata\s*de\s*nascimento\b/i,
    /\bcpf\b/i,
    /\bcns\b/i,
    /\brecord_client_id\b/i,
    /\bpatientkey\b/i,
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function newId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return prefix + "-" + crypto.randomUUID().slice(0, 8);
    }
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function containsPhiText(text) {
    var s = String(text || "");
    for (var i = 0; i < PHI_PATTERNS.length; i++) {
      if (PHI_PATTERNS[i].test(s)) return true;
    }
    return false;
  }

  var VALID_AGHU_ANCHORS = ["protocol_index", "entity_date"];

  function normalizeClinicalSource(raw) {
    if (!raw || typeof raw !== "object") return null;
    var path = str(raw.path);
    if (!path) return null;
    var bridge = null;
    try {
      if (typeof require === "function") {
        bridge = require("./patient-episodes-hpb-bridge.js");
      }
    } catch (_e) {}
    var allowed =
      bridge && bridge.VALID_CLINICAL_PATHS
        ? bridge.VALID_CLINICAL_PATHS
        : [
            "startedAt",
            "notes",
            "status",
            "label",
            "diagnoses[0].texto",
            "diagnoses[0].data",
          ];
    if (allowed.indexOf(path) === -1) return null;
    return { path: path };
  }

  function normalizeAghuSource(raw, formFields) {
    if (!raw || typeof raw !== "object") return null;
    var catalogKey = str(raw.catalogKey);
    var mode = str(raw.mode);
    if (!catalogKey) return null;
    if (mode !== "readonly" && mode !== "autofill") return null;
    if (catalogApi && !catalogApi.catalogKeyExists(catalogKey)) return null;
    var out = { catalogKey: catalogKey, mode: mode };
    var anchor = str(raw.anchor);
    if (anchor) {
      if (VALID_AGHU_ANCHORS.indexOf(anchor) === -1) return null;
      out.anchor = anchor;
    }
    if (out.anchor === "entity_date" || anchor === "entity_date") {
      var anchorFieldKey = str(raw.anchorFieldKey);
      if (!anchorFieldKey) return null;
      var dateField = (formFields || []).find(function (f) {
        return f.key === anchorFieldKey && f.type === "date";
      });
      if (!dateField) return null;
      out.anchor = "entity_date";
      out.anchorFieldKey = anchorFieldKey;
    }
    return out;
  }

  function normalizeField(raw, formFields) {
    if (!raw || typeof raw !== "object") return null;
    var key = str(raw.key);
    var label = str(raw.label);
    var type = str(raw.type);
    if (!key || !FIELD_KEY_RE.test(key)) return null;
    if (!label) return null;
    if (VALID_FIELD_TYPES.indexOf(type) === -1) return null;
    var out = {
      key: key,
      label: label.slice(0, MAX_LABEL_LEN),
      type: type,
      required: !!raw.required,
    };
    if (type === "select") {
      var options = Array.isArray(raw.options)
        ? raw.options
            .map(function (o) {
              return str(o);
            })
            .filter(Boolean)
            .slice(0, MAX_OPTIONS_PER_SELECT)
        : [];
      if (!options.length) return null;
      out.options = options;
    }
    if (type === "computed") {
      if (!computedApi) return null;
      var computed = computedApi.normalizeComputedDef(raw.computed);
      if (!computed) return null;
      out.computed = computed;
      out.readOnly = true;
    }
    if (fieldConditionalApi && raw.visibleWhen) {
      var visibleWhen = fieldConditionalApi.normalizeVisibleWhen(raw.visibleWhen);
      if (visibleWhen) out.visibleWhen = visibleWhen;
    }
    if (raw.clearWhenHidden === false) out.clearWhenHidden = false;
    if (raw.researchExport === false) out.researchExport = false;
    if (
      raw.analyticsRole === "indicator" ||
      raw.analyticsRole === "outcome" ||
      raw.analyticsRole === "covariate"
    ) {
      out.analyticsRole = raw.analyticsRole;
    }
    if (raw.aghuSource) {
      var aghuSource = normalizeAghuSource(raw.aghuSource, formFields);
      if (!aghuSource) return null;
      out.aghuSource = aghuSource;
      if (aghuSource.mode === "readonly") out.readOnly = true;
    }
    if (raw.clinicalSource) {
      var clinicalSource = normalizeClinicalSource(raw.clinicalSource);
      if (!clinicalSource) return null;
      out.clinicalSource = clinicalSource;
      out.readOnly = true;
    }
    return out;
  }

  function normalizeFieldLegacy(raw) {
    return normalizeField(raw, null);
  }

  function normalizeEntityType(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = str(raw.id);
    var label = str(raw.label);
    var cardinality = str(raw.cardinality) || "many";
    if (!id || !label) return null;
    if (VALID_CARDINALITIES.indexOf(cardinality) === -1) return null;
    var parentEntityTypeId = raw.parentEntityTypeId;
    if (parentEntityTypeId != null && parentEntityTypeId !== "") {
      parentEntityTypeId = str(parentEntityTypeId);
    } else {
      parentEntityTypeId = null;
    }
    var out = {
      id: id,
      label: label.slice(0, MAX_LABEL_LEN),
      parentEntityTypeId: parentEntityTypeId,
      cardinality: cardinality,
    };
    // FEAT-098: toggle unidade da coorte (one ou many)
    if (raw.cohortGrainEnabled === true) out.cohortGrainEnabled = true;
    // FEAT-088: grain opcional; inválido → omitido (MG normalize fail-safe)
    var grain = str(raw.grain);
    if (
      grain === "patient" ||
      grain === "clinical_episode" ||
      grain === "surgery" ||
      (grain.indexOf("entity:") === 0 && grain.length > "entity:".length)
    ) {
      out.grain = grain;
    }
    // FEAT-099: hubKind estável (IDs hub_*)
    var hubKind = str(raw.hubKind);
    if (
      hubKind === "patient" ||
      hubKind === "clinical_episode" ||
      hubKind === "surgery"
    ) {
      out.hubKind = hubKind;
    }
    return out;
  }

  function normalizeForm(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = str(raw.id);
    var label = str(raw.label);
    var entityTypeId = str(raw.entityTypeId);
    if (!id || !label || !entityTypeId) return null;
    var fields = Array.isArray(raw.fields)
      ? raw.fields
          .map(function (f) {
            return normalizeField(f, raw.fields);
          })
          .filter(Boolean)
          .slice(0, MAX_FIELDS_PER_FORM)
      : [];
    if (!fields.length) return null;
    var out = {
      id: id,
      label: label.slice(0, MAX_LABEL_LEN),
      entityTypeId: entityTypeId,
      fields: fields,
    };
    var grain = str(raw.grain);
    if (
      grain === "patient" ||
      grain === "clinical_episode" ||
      grain === "surgery"
    ) {
      out.grain = grain;
    }
    return out;
  }

  function normalizeMatrixView(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = str(raw.id);
    var label = str(raw.label);
    var formId = str(raw.formId);
    var entityTypeId = str(raw.entityTypeId);
    if (!id || !label || !formId || !entityTypeId) return null;
    var out = {
      id: id,
      label: label.slice(0, MAX_LABEL_LEN),
      formId: formId,
      entityTypeId: entityTypeId,
    };
    var grain = str(raw.grain);
    if (
      grain === "patient" ||
      grain === "clinical_episode" ||
      grain === "surgery"
    ) {
      out.grain = grain;
    }
    return out;
  }

  function normalizeDomainType(raw) {
    var dt = str(raw) || "hpb_builtin";
    if (VALID_DOMAIN_TYPES.indexOf(dt) === -1) return "hpb_builtin";
    return dt;
  }

  function normalizeCustomSchema(raw) {
    if (!raw || typeof raw !== "object") {
      return {
        entityTypes: [],
        forms: [],
        matrixViews: [],
      };
    }
    var entityTypes = Array.isArray(raw.entityTypes)
      ? raw.entityTypes.map(normalizeEntityType).filter(Boolean).slice(0, MAX_ENTITY_TYPES)
      : [];
    var forms = Array.isArray(raw.forms)
      ? raw.forms.map(normalizeForm).filter(Boolean).slice(0, MAX_FORMS)
      : [];
    var matrixViews = Array.isArray(raw.matrixViews)
      ? raw.matrixViews.map(normalizeMatrixView).filter(Boolean)
      : [];
    return {
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: matrixViews,
    };
  }

  function validateCustomSchema(schema) {
    var errors = [];
    if (!schema) {
      errors.push("schema custom ausente");
      return { ok: false, errors: errors };
    }
    var entityTypes = schema.entityTypes || [];
    var forms = schema.forms || [];
    var matrixViews = schema.matrixViews || [];

    if (!entityTypes.length) errors.push("pelo menos um tipo de entidade é obrigatório");
    if (!forms.length) errors.push("pelo menos um formulário é obrigatório");
    if (!matrixViews.length) errors.push("pelo menos uma vista de matriz é obrigatória");

    var entityIds = {};
    for (var i = 0; i < entityTypes.length; i++) {
      var et = entityTypes[i];
      if (entityIds[et.id]) errors.push("tipo de entidade duplicado: " + et.id);
      entityIds[et.id] = true;
      if (containsPhiText(et.label)) errors.push("PHI em rótulo de entidade");
      if (
        et.parentEntityTypeId &&
        !entityIds[et.parentEntityTypeId] &&
        !entityTypes.some(function (e) {
          return e.id === et.parentEntityTypeId;
        })
      ) {
        errors.push("pai de entidade inválido: " + et.parentEntityTypeId);
      }
    }

    var formIds = {};
    var fieldKeysByForm = {};
    for (var f = 0; f < forms.length; f++) {
      var form = forms[f];
      if (formIds[form.id]) errors.push("formulário duplicado: " + form.id);
      formIds[form.id] = true;
      if (!entityIds[form.entityTypeId]) {
        errors.push("formulário referencia entidade inexistente: " + form.entityTypeId);
      }
      if (containsPhiText(form.label)) errors.push("PHI em rótulo de formulário");
      var keys = {};
      for (var j = 0; j < form.fields.length; j++) {
        var field = form.fields[j];
        if (keys[field.key]) errors.push("campo duplicado em " + form.id + ": " + field.key);
        keys[field.key] = true;
        if (containsPhiText(field.label)) errors.push("PHI em rótulo de campo");
        if (field.type === "select" && (!field.options || !field.options.length)) {
          errors.push("select sem opções: " + form.id + "." + field.key);
        }
        if (field.type === "computed" && computedApi) {
          var compVal = computedApi.validateComputedField(field, form.fields);
          if (!compVal.ok) errors = errors.concat(compVal.errors);
        }
        if (field.aghuSource) {
          if (catalogApi && !catalogApi.catalogKeyExists(field.aghuSource.catalogKey)) {
            errors.push(
              "aghuSource.catalogKey inválido: " +
                form.id +
                "." +
                field.key,
            );
          }
          if (
            field.aghuSource.anchor === "entity_date" &&
            !field.aghuSource.anchorFieldKey
          ) {
            errors.push(
              "aghuSource.anchorFieldKey obrigatório: " +
                form.id +
                "." +
                field.key,
            );
          }
        }
      }
      fieldKeysByForm[form.id] = keys;
      if (fieldConditionalApi) {
        var condVal = fieldConditionalApi.validateConditionalGraph(form);
        if (!condVal.ok) errors = errors.concat(condVal.errors);
      }
    }

    for (var m = 0; m < matrixViews.length; m++) {
      var mv = matrixViews[m];
      if (!formIds[mv.formId]) {
        errors.push("vista de matriz referencia formulário inexistente: " + mv.formId);
      }
      if (!entityIds[mv.entityTypeId]) {
        errors.push("vista de matriz referencia entidade inexistente: " + mv.entityTypeId);
      }
      var refForm = forms.find(function (x) {
        return x.id === mv.formId;
      });
      if (refForm && refForm.entityTypeId !== mv.entityTypeId) {
        errors.push("vista de matriz com entityTypeId inconsistente: " + mv.id);
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function getFormById(schema, formId) {
    if (!schema || !formId) return null;
    var forms = schema.forms || [];
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].id === formId) return forms[i];
    }
    return null;
  }

  function getMatrixViewFields(schema, matrixViewId) {
    if (!schema) return [];
    var views = schema.matrixViews || [];
    var view = views.find(function (v) {
      return v.id === matrixViewId;
    });
    if (!view) return [];
    var form = getFormById(schema, view.formId);
    return form ? form.fields : [];
  }

  function fieldSelectOptions(field) {
    if (!field || field.type !== "select") return [];
    return Array.isArray(field.options) ? field.options : [];
  }

  return {
    VALID_FIELD_TYPES: VALID_FIELD_TYPES,
    VALID_DOMAIN_TYPES: VALID_DOMAIN_TYPES,
    MAX_ENTITY_TYPES: MAX_ENTITY_TYPES,
    MAX_FORMS: MAX_FORMS,
    MAX_FIELDS_PER_FORM: MAX_FIELDS_PER_FORM,
    MAX_OPTIONS_PER_SELECT: MAX_OPTIONS_PER_SELECT,
    FIELD_KEY_RE: FIELD_KEY_RE,
    newId: newId,
    containsPhiText: containsPhiText,
    normalizeField: normalizeFieldLegacy,
    normalizeFieldWithForm: normalizeField,
    normalizeAghuSource: normalizeAghuSource,
    VALID_AGHU_ANCHORS: VALID_AGHU_ANCHORS,
    normalizeEntityType: normalizeEntityType,
    normalizeForm: normalizeForm,
    normalizeMatrixView: normalizeMatrixView,
    normalizeDomainType: normalizeDomainType,
    normalizeCustomSchema: normalizeCustomSchema,
    validateCustomSchema: validateCustomSchema,
    getFormById: getFormById,
    getMatrixViewFields: getMatrixViewFields,
    fieldSelectOptions: fieldSelectOptions,
  };
});
