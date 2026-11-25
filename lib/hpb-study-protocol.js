/**
 * Schema e CRUD em memória para protocolos de estudo HPB (sem PHI).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbStudyProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var pathsApi = null;
  var researchFieldSchemaApi = null;
  var researchPathsApi = null;
  var researchMatrixSyncApi = null;
  try {
    if (typeof require === "function") {
      pathsApi = require("./hpb-protocol-field-paths.js");
      researchFieldSchemaApi = require("./research-field-schema.js");
      researchPathsApi = require("./research-protocol-field-paths.js");
      researchMatrixSyncApi = require("./research-matrix-sync.js");
    }
  } catch (_e) {}

  var DOCUMENT_VERSION = 2;
  var HPB_BUILTIN_PROTOCOL_ID = "hpb-builtin-hucam";
  var MAX_PROTOCOLS = 20;
  var MAX_CRITERIA_PER_PROTOCOL = 40;
  var MAX_NAME_LEN = 120;
  var MAX_CODE_LEN = 32;

  var VALID_OPS = [
    "eq",
    "ne",
    "contains",
    "in",
    "notIn",
    "gte",
    "lte",
    "isYes",
    "isNo",
    "isEmpty",
    "isNotEmpty",
  ];

  var VALID_COHORT_GRAINS = ["patient", "clinical_episode", "surgery"];
  var DEFAULT_COHORT_GRAIN = "patient";
  var ENTITY_GRAIN_PREFIX = "entity:";
  var COHORT_GRAIN_LABELS = {
    patient: "Por paciente",
    clinical_episode: "Por episódio clínico",
    surgery: "Por cirurgia",
  };

  var PHI_PATTERNS = [
    /\bprontu[aá]rio\b/i,
    /\bnome\s*(completo|do paciente)?\b/i,
    /\bdata\s*de\s*nascimento\b/i,
    /\bcpf\b/i,
    /\bcns\b/i,
    /\brecord_client_id\b/i,
    /\bpatientkey\b/i,
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function newProtocolId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "prot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function entityTypesFromCtx(protocolOrEntityTypes) {
    if (Array.isArray(protocolOrEntityTypes)) return protocolOrEntityTypes;
    if (
      protocolOrEntityTypes &&
      Array.isArray(protocolOrEntityTypes.entityTypes)
    ) {
      return protocolOrEntityTypes.entityTypes;
    }
    return [];
  }

  function isEntityGrain(g) {
    var s = str(g);
    return (
      s.indexOf(ENTITY_GRAIN_PREFIX) === 0 &&
      s.length > ENTITY_GRAIN_PREFIX.length
    );
  }

  function entityTypeIdFromGrain(g) {
    if (!isEntityGrain(g)) return "";
    return str(g).slice(ENTITY_GRAIN_PREFIX.length);
  }

  function isValidEntityGrain(g, entityTypes) {
    var id = entityTypeIdFromGrain(g);
    if (!id) return false;
    var types = Array.isArray(entityTypes) ? entityTypes : [];
    for (var i = 0; i < types.length; i++) {
      var et = types[i];
      if (et && str(et.id) === id && et.cohortGrainEnabled === true) return true;
    }
    return false;
  }

  function isValidCohortGrain(g, entityTypes) {
    var s = str(g);
    if (VALID_COHORT_GRAINS.indexOf(s) !== -1) return true;
    return isValidEntityGrain(s, entityTypes);
  }

  /** Builtin OK; entity:{id} OK se tipo existe + cohortGrainEnabled; senão patient. */
  function normalizeCohortGrain(raw, protocolOrEntityTypes) {
    var g = str(raw);
    var entityTypes = entityTypesFromCtx(protocolOrEntityTypes);
    if (isValidCohortGrain(g, entityTypes)) return g;
    return DEFAULT_COHORT_GRAIN;
  }

  function grainLabel(protocol, g) {
    var grain = str(g);
    if (COHORT_GRAIN_LABELS[grain]) return COHORT_GRAIN_LABELS[grain];
    if (isEntityGrain(grain)) {
      var id = entityTypeIdFromGrain(grain);
      var types = entityTypesFromCtx(protocol);
      for (var i = 0; i < types.length; i++) {
        if (types[i] && str(types[i].id) === id) {
          return str(types[i].label) || id;
        }
      }
      return id || grain;
    }
    return grain || COHORT_GRAIN_LABELS[DEFAULT_COHORT_GRAIN];
  }

  /**
   * FEAT-098 Clarificação 13: sync entity:{id} ↔ cohortGrainEnabled.
   * Não altera primary excepto se inválido → patient (Clarificação 8).
   */
  function syncCohortGrainsFromEntityTypes(studyDesign, entityTypes) {
    var sd =
      studyDesign && typeof studyDesign === "object"
        ? studyDesign
        : {
            cohortGrain: DEFAULT_COHORT_GRAIN,
            primaryGrain: DEFAULT_COHORT_GRAIN,
            grains: [DEFAULT_COHORT_GRAIN],
            cohortGrains: [DEFAULT_COHORT_GRAIN],
            autoEnrollOnActiveEpisode: false,
          };
    var types = Array.isArray(entityTypes) ? entityTypes : [];
    var enabledRefs = [];
    for (var i = 0; i < types.length; i++) {
      var et = types[i];
      if (et && et.cohortGrainEnabled === true && str(et.id)) {
        enabledRefs.push(ENTITY_GRAIN_PREFIX + str(et.id));
      }
    }
    var seen = Object.create(null);
    var grains = [];
    function pushGrain(g) {
      var ng = str(g);
      if (!ng || seen[ng]) return;
      if (VALID_COHORT_GRAINS.indexOf(ng) !== -1) {
        seen[ng] = true;
        grains.push(ng);
        return;
      }
      if (isEntityGrain(ng) && enabledRefs.indexOf(ng) !== -1) {
        seen[ng] = true;
        grains.push(ng);
      }
    }
    var source = Array.isArray(sd.cohortGrains)
      ? sd.cohortGrains
      : Array.isArray(sd.grains)
        ? sd.grains
        : [];
    for (var s = 0; s < source.length; s++) pushGrain(source[s]);
    for (var e = 0; e < enabledRefs.length; e++) pushGrain(enabledRefs[e]);
    // FEAT-106 C1: hubKind / entity.grain builtin ∈ cohortGrains (após ensureHubBaseline)
    for (var bi = 0; bi < types.length; bi++) {
      var bet = types[bi];
      if (!bet) continue;
      var bg = str(bet.grain || bet.hubKind);
      if (VALID_COHORT_GRAINS.indexOf(bg) !== -1) pushGrain(bg);
    }
    if (!grains.length) grains = [DEFAULT_COHORT_GRAIN];

    var prevPrimary = str(sd.primaryGrain || sd.cohortGrain);
    var primary = prevPrimary;
    if (grains.indexOf(primary) === -1) {
      primary =
        grains.indexOf(DEFAULT_COHORT_GRAIN) !== -1
          ? DEFAULT_COHORT_GRAIN
          : grains[0];
    }
    if (seen[primary]) {
      grains = [primary].concat(
        grains.filter(function (g) {
          return g !== primary;
        }),
      );
    }
    return {
      cohortGrain: primary,
      primaryGrain: primary,
      grains: grains,
      cohortGrains: grains,
      autoEnrollOnActiveEpisode: sd.autoEnrollOnActiveEpisode === true,
    };
  }

  /** Dedup + só grains válidos. Se primary ∈ lista, garante-o como 1º; senão lista pura. */
  function normalizeGrainsList(rawGrains, primaryGrain, entityTypes) {
    var primary = normalizeCohortGrain(primaryGrain, entityTypes);
    var seen = Object.create(null);
    var out = [];
    function push(g) {
      var ng = str(g);
      if (!isValidCohortGrain(ng, entityTypes)) return;
      if (seen[ng]) return;
      seen[ng] = true;
      out.push(ng);
    }
    if (Array.isArray(rawGrains) && rawGrains.length) {
      for (var i = 0; i < rawGrains.length; i++) push(rawGrains[i]);
      if (!out.length) push(primary);
      // primary ∈ lista → move para 1º (âncora)
      if (seen[primary]) {
        out = [primary].concat(
          out.filter(function (g) {
            return g !== primary;
          }),
        );
      }
      return out;
    }
    push(primary);
    return out.length ? out : [primary];
  }

  function normalizeStudyDesign(raw, opts) {
    opts = opts || {};
    var legacyHucamAutoEnroll = opts.legacyHucamAutoEnroll === true;
    var entityTypes = Array.isArray(opts.entityTypes) ? opts.entityTypes : [];
    if (!raw || typeof raw !== "object") {
      return {
        cohortGrain: DEFAULT_COHORT_GRAIN,
        primaryGrain: DEFAULT_COHORT_GRAIN,
        grains: [DEFAULT_COHORT_GRAIN],
        cohortGrains: [DEFAULT_COHORT_GRAIN],
        autoEnrollOnActiveEpisode: legacyHucamAutoEnroll,
      };
    }
    var hasAutoFlag = Object.prototype.hasOwnProperty.call(
      raw,
      "autoEnrollOnActiveEpisode",
    );
    var autoEnroll = hasAutoFlag
      ? raw.autoEnrollOnActiveEpisode === true
      : legacyHucamAutoEnroll;
    // primaryGrain âncora; cohortGrain = alias de leitura/escrita do primary
    var primaryHint =
      raw.primaryGrain != null && str(raw.primaryGrain)
        ? raw.primaryGrain
        : raw.cohortGrain;
    var grainsSource =
      Array.isArray(raw.cohortGrains) && raw.cohortGrains.length
        ? raw.cohortGrains
        : Array.isArray(raw.grains) && raw.grains.length
          ? raw.grains
          : undefined;
    if (
      (primaryHint == null || !str(primaryHint)) &&
      grainsSource &&
      grainsSource.length
    ) {
      primaryHint = grainsSource[0];
    }
    var primaryGrain = normalizeCohortGrain(primaryHint, entityTypes);
    var grains = normalizeGrainsList(grainsSource, primaryGrain, entityTypes);
    // MG-01: se primary ficou fora (só lista sem primary), clamp ao 1º
    if (grains.indexOf(primaryGrain) === -1) {
      primaryGrain = grains[0] || DEFAULT_COHORT_GRAIN;
    }
    return {
      cohortGrain: primaryGrain,
      primaryGrain: primaryGrain,
      grains: grains,
      cohortGrains: grains,
      autoEnrollOnActiveEpisode: autoEnroll,
    };
  }

  function getProtocolCohortGrain(protocol) {
    if (!protocol || !protocol.studyDesign) return DEFAULT_COHORT_GRAIN;
    var sd = protocol.studyDesign;
    var entityTypes = entityTypesFromCtx(protocol);
    if (sd.primaryGrain != null && str(sd.primaryGrain)) {
      return normalizeCohortGrain(sd.primaryGrain, entityTypes);
    }
    return normalizeCohortGrain(sd.cohortGrain, entityTypes);
  }

  /** FEAT-088: lista habilitada (≥1). */
  function getProtocolCohortGrains(protocol) {
    if (!protocol || !protocol.studyDesign) return [DEFAULT_COHORT_GRAIN];
    var sd = protocol.studyDesign;
    var entityTypes = entityTypesFromCtx(protocol);
    var list = Array.isArray(sd.cohortGrains)
      ? sd.cohortGrains
      : Array.isArray(sd.grains)
        ? sd.grains
        : null;
    if (!list || !list.length) {
      return [getProtocolCohortGrain(protocol)];
    }
    return normalizeGrainsList(list, getProtocolCohortGrain(protocol), entityTypes);
  }

  /** Override de sessão só se ∈ cohortGrains; senão default (MG-04). */
  function resolveSessionGrain(protocol, sessionGrain) {
    var allowed = getProtocolCohortGrains(protocol);
    var g = str(sessionGrain);
    if (g && allowed.indexOf(g) !== -1) {
      return normalizeCohortGrain(g, protocol);
    }
    return getProtocolCohortGrain(protocol);
  }

  function optionalFormGrain(rawGrain, entityTypes) {
    var g = str(rawGrain);
    if (!g) return undefined;
    if (isValidCohortGrain(g, entityTypes)) return g;
    return undefined;
  }

  /** GEN-08: efectivo — HUCAM sem campo → true; restantes default false. */
  function isAutoEnrollOnActiveEpisode(protocol) {
    if (!protocol || !protocol.studyDesign) {
      return protocol && protocol.id === HPB_BUILTIN_PROTOCOL_ID;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        protocol.studyDesign,
        "autoEnrollOnActiveEpisode",
      )
    ) {
      return protocol.studyDesign.autoEnrollOnActiveEpisode === true;
    }
    return protocol.id === HPB_BUILTIN_PROTOCOL_ID;
  }

  function getPathsApi() {
    if (pathsApi) return pathsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbProtocolFieldPaths || null;
  }

  function getResearchFieldSchemaApi() {
    if (researchFieldSchemaApi) return researchFieldSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchFieldSchema || null;
  }

  function getResearchPathsApi() {
    if (researchPathsApi) return researchPathsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchProtocolFieldPaths || null;
  }

  function isValidFieldPath(fieldPath, protocol) {
    if (fieldPath && String(fieldPath).indexOf("aghu.") === 0) {
      var aghuPaths = null;
      try {
        if (typeof require === "function") {
          aghuPaths = require("./aghu-protocol-field-paths.js");
        }
      } catch (_e) {}
      if (aghuPaths && aghuPaths.isValidAghuFieldPath) {
        return aghuPaths.isValidAghuFieldPath(fieldPath);
      }
      return typeof fieldPath === "string" && fieldPath.length > 0;
    }
    if (protocol && protocol.domainType === "custom") {
      var rpaths = getResearchPathsApi();
      if (!rpaths || !rpaths.isValidFieldPath) return false;
      return rpaths.isValidFieldPath(protocol, fieldPath);
    }
    var api = getPathsApi();
    if (!api || !api.findFieldPath) return typeof fieldPath === "string" && fieldPath.length > 0;
    return !!api.findFieldPath(fieldPath);
  }

  function isValidOperator(op) {
    return VALID_OPS.indexOf(op) !== -1;
  }

  function opNeedsValue(op) {
    return op === "eq" || op === "ne" || op === "contains" || op === "gte" || op === "lte";
  }

  function opNeedsValues(op) {
    return op === "in" || op === "notIn";
  }

  function validateCriterion(criterion, prefix, protocol) {
    var errors = [];
    if (!criterion || typeof criterion !== "object") {
      errors.push(prefix + ": critério inválido");
      return errors;
    }
    var field = str(criterion.field);
    var op = str(criterion.op);
    if (!isValidOperator(op)) errors.push(prefix + ": operador inválido");
    if (field && field.indexOf("aghu.") === 0) {
      var aghuPaths = null;
      try {
        if (typeof require === "function") {
          aghuPaths = require("./aghu-protocol-field-paths.js");
        }
      } catch (_e) {}
      if (aghuPaths) {
        if (!aghuPaths.isValidAghuFieldPath(field)) {
          errors.push(prefix + ": campo AGHU desconhecido");
        }
        if (!aghuPaths.isValidAghuCriterionContext(criterion.context)) {
          errors.push(prefix + ": contexto AGHU inválido");
        }
      }
    } else if (!field) errors.push(prefix + ": campo obrigatório");
    else if (!isValidFieldPath(field, protocol)) errors.push(prefix + ": campo desconhecido");
    if (opNeedsValue(op) && str(criterion.value) === "") {
      errors.push(prefix + ": valor obrigatório");
    }
    if (opNeedsValues(op)) {
      var values = criterion.values;
      if (!Array.isArray(values) || !values.length) {
        errors.push(prefix + ": lista de valores obrigatória");
      }
    }
    return errors;
  }

  function containsPhiText(text) {
    var s = String(text || "");
    for (var i = 0; i < PHI_PATTERNS.length; i++) {
      if (PHI_PATTERNS[i].test(s)) return true;
    }
    return false;
  }

  function containsPhiInValue(value) {
    if (value == null) return false;
    if (typeof value === "string") return containsPhiText(value);
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        if (containsPhiInValue(value[i])) return true;
      }
    }
    return false;
  }

  function isAghuCriterionField(field) {
    return str(field).indexOf("aghu.") === 0;
  }

  /** FEAT-068: partilha critérios aghu.* vs CRF (formId.fieldKey / HPB). */
  function splitAghuRules(rules) {
    var aghu = [];
    var registry = [];
    if (!Array.isArray(rules)) return { aghu: aghu, registry: registry };
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (isAghuCriterionField(rule && rule.field)) aghu.push(rule);
      else registry.push(rule);
    }
    return { aghu: aghu, registry: registry };
  }

  /**
   * Soft migrate: se screening* ausentes, move aghu.* de inclusion/exclusion
   * para screening*; deixa CRF/HPB nos arrays clássicos.
   */
  function migrateScreeningCriteria(raw) {
    var hasScreeningInc = Array.isArray(raw && raw.screeningInclusion);
    var hasScreeningExc = Array.isArray(raw && raw.screeningExclusion);
    var inclusion = Array.isArray(raw && raw.inclusion) ? raw.inclusion.slice() : [];
    var exclusion = Array.isArray(raw && raw.exclusion) ? raw.exclusion.slice() : [];
    var screeningInclusion = hasScreeningInc ? raw.screeningInclusion.slice() : [];
    var screeningExclusion = hasScreeningExc ? raw.screeningExclusion.slice() : [];

    if (!hasScreeningInc && !hasScreeningExc) {
      var incSplit = splitAghuRules(inclusion);
      var excSplit = splitAghuRules(exclusion);
      screeningInclusion = incSplit.aghu;
      screeningExclusion = excSplit.aghu;
      inclusion = incSplit.registry;
      exclusion = excSplit.registry;
    } else if (!hasScreeningInc) {
      var onlyInc = splitAghuRules(inclusion);
      screeningInclusion = onlyInc.aghu;
      inclusion = onlyInc.registry;
    } else if (!hasScreeningExc) {
      var onlyExc = splitAghuRules(exclusion);
      screeningExclusion = onlyExc.aghu;
      exclusion = onlyExc.registry;
    }

    return {
      screeningInclusion: screeningInclusion,
      screeningExclusion: screeningExclusion,
      inclusion: inclusion,
      exclusion: exclusion,
    };
  }

  function containsPhiInProtocol(protocol) {
    if (!protocol || typeof protocol !== "object") return false;
    if (containsPhiText(protocol.name) || containsPhiText(protocol.code)) return true;
    if (protocol.primaryOutcome && containsPhiInValue(protocol.primaryOutcome.label)) {
      return true;
    }
    var lists = [
      protocol.screeningInclusion,
      protocol.screeningExclusion,
      protocol.inclusion,
      protocol.exclusion,
    ];
    for (var i = 0; i < lists.length; i++) {
      var arr = lists[i];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var c = arr[j];
        if (containsPhiInValue(c.value) || containsPhiInValue(c.values)) return true;
      }
    }
    if (protocol.domainType === "custom" && protocol.entityTypes) {
      for (var e = 0; e < protocol.entityTypes.length; e++) {
        if (containsPhiText(protocol.entityTypes[e].label)) return true;
      }
      if (protocol.forms) {
        for (var f = 0; f < protocol.forms.length; f++) {
          var form = protocol.forms[f];
          if (containsPhiText(form.label)) return true;
          for (var k = 0; k < (form.fields || []).length; k++) {
            if (containsPhiText(form.fields[k].label)) return true;
            if (containsPhiInValue(form.fields[k].options)) return true;
          }
        }
      }
    }
    return false;
  }

  function defaultHpbBuiltinProtocol() {
    return {
      id: HPB_BUILTIN_PROTOCOL_ID,
      name: "HUCAM HPB",
      code: "HPB",
      domainType: "hpb_builtin",
      indexEvent: "surgery.core.date",
      followupMonths: 60,
      primaryOutcome: {
        field: "surgery.postop.death90d",
        label: "Mortalidade 90d",
      },
      screeningInclusion: [],
      screeningExclusion: [],
      inclusion: [],
      exclusion: [],
      entityTypes: [],
      forms: [],
      matrixViews: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  function findBuiltinProtocol(doc) {
    doc = normalizeDocument(doc);
    for (var i = 0; i < doc.protocols.length; i++) {
      if (doc.protocols[i].domainType === "hpb_builtin") return doc.protocols[i];
    }
    return null;
  }

  function getBuiltinProtocolId(doc) {
    var builtin = findBuiltinProtocol(doc);
    return builtin ? builtin.id : HPB_BUILTIN_PROTOCOL_ID;
  }

  function normalizeEnabledSpecialtyPacks(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var pack = str(raw[i]).toLowerCase();
      if (!pack || seen[pack]) continue;
      seen[pack] = true;
      out.push(pack);
    }
    return out;
  }

  function documentHasSpecialtyPack(doc, packId) {
    doc = normalizeDocument(doc);
    var packs = doc.enabledSpecialtyPacks || [];
    return packs.indexOf(str(packId).toLowerCase()) !== -1;
  }

  function ensureDefaultHpbBuiltinProtocol(doc) {
    doc = normalizeDocument(doc);
    if (findBuiltinProtocol(doc)) return doc;
    var protocol = normalizeProtocol(defaultHpbBuiltinProtocol(), {});
    if (!protocol) return doc;
    doc.protocols = doc.protocols.concat([protocol]);
    if (!doc.activeProtocolId) doc.activeProtocolId = protocol.id;
    var packs = normalizeEnabledSpecialtyPacks(doc.enabledSpecialtyPacks);
    if (packs.indexOf("hpb") === -1) packs = packs.concat(["hpb"]);
    doc.enabledSpecialtyPacks = packs;
    return doc;
  }

  /**
   * FEAT-100: identity — não injecta `hpb-builtin-hucam` no load.
   * Pack HPB só habilita templates `pack_hpb`; create de builtin via UI removido.
   * `ensureDefaultHpbBuiltinProtocol` permanece exportado para soft-compat / scripts.
   */
  function ensureHpbBuiltinIfPackEnabled(doc) {
    return normalizeDocument(doc);
  }

  function emptyDocument() {
    return {
      version: DOCUMENT_VERSION,
      activeProtocolId: null,
      protocols: [],
      enabledSpecialtyPacks: [],
    };
  }

  function resolveDomainType(raw) {
    var fieldSchema = getResearchFieldSchemaApi();
    var explicit = str(raw && raw.domainType);
    if (explicit) {
      return fieldSchema
        ? fieldSchema.normalizeDomainType(explicit)
        : explicit === "custom"
          ? "custom"
          : "hpb_builtin";
    }
    // Legado sem domainType: só o id HUCAM permanece hpb_builtin; resto → custom.
    if (str(raw && raw.id) === HPB_BUILTIN_PROTOCOL_ID) return "hpb_builtin";
    return "custom";
  }

  function normalizeSpecialtyPackId(raw) {
    var id = str(raw).toLowerCase().slice(0, 32);
    return id || null;
  }

  function normalizeCriterion(raw) {
    if (!raw || typeof raw !== "object") return null;
    var field = str(raw.field);
    var op = str(raw.op);
    if (!field || !isValidOperator(op)) return null;
    var out = { field: field, op: op };
    if (opNeedsValue(op)) out.value = raw.value;
    if (opNeedsValues(op)) {
      out.values = Array.isArray(raw.values)
        ? raw.values.map(function (v) {
            return String(v);
          })
        : [];
    }
    if (field.indexOf("aghu.") === 0 && raw.context != null) {
      var aghuPaths = null;
      try {
        if (typeof require === "function") {
          aghuPaths = require("./aghu-protocol-field-paths.js");
        }
      } catch (_e) {}
      if (aghuPaths && aghuPaths.isValidAghuCriterionContext(raw.context)) {
        var ctx = aghuPaths.normalizeCriterionContext(raw.context);
        if (ctx) out.context = ctx;
      } else {
        out.context = raw.context;
      }
    }
    return out;
  }

  /** Dropa linhas sem field string; normaliza quando op válida. */
  function sanitizeCriteriaArray(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      if (!row || typeof row !== "object") continue;
      if (typeof row.field !== "string" || !String(row.field).trim()) continue;
      var normalized = normalizeCriterion(row);
      if (normalized) {
        out.push(normalized);
        continue;
      }
      // Mantém field string mesmo se op inválida (UI pode corrigir); evita crash startsWith.
      out.push({
        field: String(row.field).trim(),
        op: typeof row.op === "string" && row.op ? String(row.op) : "isNotEmpty",
        value: row.value,
        values: Array.isArray(row.values) ? row.values.slice() : undefined,
        context: row.context,
      });
    }
    return out;
  }

  /** Coerção profunda de forms[].fields (objeto LLM → []; options select só array). */
  function sanitizeFormFields(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var field = raw[i];
      if (!field || typeof field !== "object") continue;
      var next = Object.assign({}, field);
      if (next.type === "select" && !Array.isArray(next.options)) {
        next.options = [];
      }
      out.push(next);
    }
    return out;
  }

  var FIELD_KEY_RE_ENSURE = /^[a-z][a-z0-9_]{0,39}$/;
  var VALID_FIELD_TYPES_ENSURE = [
    "text",
    "textarea",
    "date",
    "number",
    "select",
    "boolean",
    "computed",
  ];

  function newSchemaId(prefix) {
    if (researchFieldSchemaApi && typeof researchFieldSchemaApi.newId === "function") {
      return researchFieldSchemaApi.newId(prefix);
    }
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return prefix + "-" + crypto.randomUUID().slice(0, 8);
    }
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function ensureFormFields(raw) {
    var fields = sanitizeFormFields(raw);
    var used = {};
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      var next = Object.assign({}, fields[i]);
      var key = str(next.key);
      if (!key || !FIELD_KEY_RE_ENSURE.test(key)) {
        key = "campo_" + (i + 1);
      }
      var base = key;
      var n = 2;
      while (used[key]) {
        key = base + "_" + n;
        n++;
      }
      used[key] = true;
      next.key = key;
      if (!str(next.label)) next.label = key;
      var type = str(next.type);
      if (VALID_FIELD_TYPES_ENSURE.indexOf(type) === -1) next.type = "text";
      out.push(next);
    }
    return out;
  }

  function ensureEntityTypes(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var et = raw[i];
      // Só objetos — strings/primitivos (ex. "clinical_episode") descartados.
      if (!et || typeof et !== "object" || Array.isArray(et)) continue;
      var id = str(et.id) || newSchemaId("ent");
      var label = str(et.label);
      if (!label) {
        label = out.length === 0 ? "Sujeito" : "Entidade " + (out.length + 1);
      }
      var cardinality = str(et.cardinality);
      if (cardinality !== "one" && cardinality !== "many") cardinality = "many";
      var parentEntityTypeId = et.parentEntityTypeId;
      if (parentEntityTypeId != null && parentEntityTypeId !== "") {
        parentEntityTypeId = str(parentEntityTypeId);
      } else {
        parentEntityTypeId = null;
      }
      var row = {
        id: id,
        label: label.slice(0, MAX_NAME_LEN),
        parentEntityTypeId: parentEntityTypeId,
        cardinality: cardinality,
      };
      if (et.cohortGrainEnabled === true) row.cohortGrainEnabled = true;
      var etGrain = optionalFormGrain(et.grain);
      if (etGrain) row.grain = etGrain;
      // FEAT-099: hubKind estável (patient | clinical_episode | surgery)
      var hubKind = str(et.hubKind);
      if (
        hubKind === "patient" ||
        hubKind === "clinical_episode" ||
        hubKind === "surgery"
      ) {
        row.hubKind = hubKind;
      }
      out.push(row);
    }
    return out;
  }

  function ensureForms(raw, entityIds, firstEntityId) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var form = raw[i];
      if (!form || typeof form !== "object" || Array.isArray(form)) continue;
      var label = str(form.label);
      var fields = ensureFormFields(form.fields);
      if (!label || !fields.length) continue;
      var entityTypeId = str(form.entityTypeId);
      if (!entityTypeId || (entityIds && !entityIds[entityTypeId])) {
        entityTypeId = firstEntityId || entityTypeId;
      }
      var row = {
        id: str(form.id) || newSchemaId("form"),
        label: label.slice(0, MAX_NAME_LEN),
        entityTypeId: entityTypeId,
        fields: fields,
      };
      var formGrain = optionalFormGrain(form.grain);
      if (formGrain) row.grain = formGrain;
      out.push(row);
    }
    return out;
  }

  function pickPrimaryOutcomeField(forms) {
    var list = Array.isArray(forms) ? forms : [];
    for (var f = 0; f < list.length; f++) {
      var fields = list[f] && list[f].fields;
      if (!Array.isArray(fields)) continue;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (
          field &&
          field.analyticsRole === "outcome" &&
          (field.type === "date" || field.type === "number" || field.type === "boolean")
        ) {
          return list[f].id + "." + field.key;
        }
      }
    }
    for (var f2 = 0; f2 < list.length; f2++) {
      var fields2 = list[f2] && list[f2].fields;
      if (!Array.isArray(fields2)) continue;
      for (var j = 0; j < fields2.length; j++) {
        var field2 = fields2[j];
        if (
          field2 &&
          (field2.type === "date" ||
            field2.type === "number" ||
            field2.type === "boolean")
        ) {
          return list[f2].id + "." + field2.key;
        }
      }
    }
    return "outcome.primary";
  }

  function isValidPrimaryOutcomeField(forms, fieldPath) {
    var path = str(fieldPath);
    if (!path || path.indexOf(".") === -1) return false;
    var dot = path.indexOf(".");
    var formId = path.slice(0, dot);
    var fieldKey = path.slice(dot + 1);
    if (!formId || !fieldKey) return false;
    var list = Array.isArray(forms) ? forms : [];
    for (var f = 0; f < list.length; f++) {
      if (str(list[f] && list[f].id) !== formId) continue;
      var fields = list[f].fields;
      if (!Array.isArray(fields)) continue;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i] && str(fields[i].key) === fieldKey) return true;
      }
    }
    return false;
  }

  function backfillAnalyticsRoles(forms) {
    var list = Array.isArray(forms) ? forms : [];
    var out = [];
    for (var f = 0; f < list.length; f++) {
      var form = list[f];
      if (!form || typeof form !== "object") {
        out.push(form);
        continue;
      }
      var label = str(form.label).toLowerCase();
      var isOutcomeForm =
        /desfecho|outcome|mortal|[\u00f3o]bito|dialise|di[aá]lise/.test(label);
      var isBaselineFollowup =
        /baseline|basal|admiss|follow|seguimento|dados basais/.test(label);
      var fields = Array.isArray(form.fields) ? form.fields : [];
      var nextFields = [];
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (!field || typeof field !== "object") {
          nextFields.push(field);
          continue;
        }
        var next = Object.assign({}, field);
        var role = str(next.analyticsRole);
        if (
          role === "indicator" ||
          role === "outcome" ||
          role === "covariate"
        ) {
          nextFields.push(next);
          continue;
        }
        var type = str(next.type);
        if (
          isOutcomeForm &&
          (type === "boolean" || type === "date" || type === "number")
        ) {
          next.analyticsRole = "outcome";
        } else if (
          isBaselineFollowup &&
          (type === "number" || type === "integer")
        ) {
          next.analyticsRole = "indicator";
        }
        nextFields.push(next);
      }
      out.push(Object.assign({}, form, { fields: nextFields }));
    }
    return out;
  }

  /**
   * Normaliza proposal LLM antes de validate/apply:
   * ids em entityTypes/forms, só objetos, matrixViews sync, grain/outcome.
   * @param {object} proposal
   * @param {{ studyPlan?: { grain?: string, primaryGrain?: string, grains?: string[], primaryOutcomeOperational?: string }|null }} [opts]
   */
  function ensureProposalSchema(proposal, opts) {
    opts = opts || {};
    if (!proposal || typeof proposal !== "object") return proposal;
    var out = Object.assign({}, proposal);
    var studyPlan = opts.studyPlan || null;

    var hasSchema =
      Object.prototype.hasOwnProperty.call(proposal, "entityTypes") ||
      Object.prototype.hasOwnProperty.call(proposal, "forms") ||
      Object.prototype.hasOwnProperty.call(proposal, "matrixViews") ||
      Array.isArray(proposal.entityTypes) ||
      Array.isArray(proposal.forms);

    if (hasSchema) {
      var entityTypes = ensureEntityTypes(proposal.entityTypes);
      var entityIds = {};
      for (var e = 0; e < entityTypes.length; e++) {
        entityIds[entityTypes[e].id] = true;
      }
      var firstEntityId = entityTypes.length ? entityTypes[0].id : "";
      var forms = backfillAnalyticsRoles(
        ensureForms(proposal.forms, entityIds, firstEntityId),
      );
      out.entityTypes = entityTypes;
      out.forms = forms;
      if (researchMatrixSyncApi && forms.length) {
        out.matrixViews = researchMatrixSyncApi.syncMatrixViewsWithForms(
          forms,
          Array.isArray(proposal.matrixViews) ? proposal.matrixViews : [],
        );
      } else {
        out.matrixViews = Array.isArray(proposal.matrixViews)
          ? proposal.matrixViews
          : [];
      }
      // FEAT-099: IA — só promote/paciente; não repor episódio/cirurgia omitidos
      try {
        var hubBaselineApi =
          typeof require === "function"
            ? require("./research-hub-baseline-schema.js")
            : null;
        if (hubBaselineApi && hubBaselineApi.ensureHubBaseline) {
          var hubbed = hubBaselineApi.ensureHubBaseline(
            {
              entityTypes: out.entityTypes,
              forms: out.forms,
              matrixViews: out.matrixViews,
              studyDesign: out.studyDesign,
            },
            { seedMissing: false },
          );
          out.entityTypes = hubbed.entityTypes;
          out.forms = hubbed.forms;
          out.matrixViews = hubbed.matrixViews;
          // studyDesign fica para o merge studyPlan abaixo (não forçar primary patient)
        }
      } catch (_hubErr) {}
    }

    var studyDesign =
      out.studyDesign && typeof out.studyDesign === "object"
        ? Object.assign({}, out.studyDesign)
        : {};
    var planPrimary = studyPlan
      ? str(studyPlan.primaryGrain || studyPlan.grain)
      : "";
    var planGrains =
      studyPlan && Array.isArray(studyPlan.cohortGrains)
        ? studyPlan.cohortGrains
        : studyPlan && Array.isArray(studyPlan.grains)
          ? studyPlan.grains
          : undefined;
    if (
      VALID_COHORT_GRAINS.indexOf(str(studyDesign.primaryGrain)) === -1 &&
      VALID_COHORT_GRAINS.indexOf(str(studyDesign.cohortGrain)) === -1
    ) {
      if (VALID_COHORT_GRAINS.indexOf(planPrimary) !== -1) {
        studyDesign.primaryGrain = planPrimary;
        studyDesign.cohortGrain = planPrimary;
      }
      if (planGrains) {
        studyDesign.grains = planGrains;
        studyDesign.cohortGrains = planGrains;
      }
    } else if (planGrains && !studyDesign.grains && !studyDesign.cohortGrains) {
      studyDesign.grains = planGrains;
      studyDesign.cohortGrains = planGrains;
    }
    out.studyDesign = normalizeStudyDesign(studyDesign, {
      entityTypes: Array.isArray(out.entityTypes) ? out.entityTypes : [],
    });
    out.studyDesign = syncCohortGrainsFromEntityTypes(
      out.studyDesign,
      out.entityTypes,
    );

    var formsForOutcome = Array.isArray(out.forms) ? out.forms : [];
    var po = out.primaryOutcome;
    var poField =
      po && typeof po === "object" ? str(po.field) : "";
    var planOutcome = studyPlan
      ? str(studyPlan.primaryOutcomeOperational)
      : "";
    var poInvalid =
      !poField || !isValidPrimaryOutcomeField(formsForOutcome, poField);
    if (poInvalid && planOutcome) {
      var prevLabel =
        po && typeof po === "object" ? str(po.label) : "";
      out.primaryOutcome = {
        field: pickPrimaryOutcomeField(formsForOutcome),
        label: (planOutcome || prevLabel).slice(0, MAX_NAME_LEN),
      };
    } else if (poInvalid && !planOutcome && formsForOutcome.length) {
      var picked = pickPrimaryOutcomeField(formsForOutcome);
      if (picked !== "outcome.primary") {
        var prevLabel2 =
          po && typeof po === "object" ? str(po.label) : "";
        out.primaryOutcome = {
          field: picked,
          label: prevLabel2 || "Desfecho primário",
        };
      }
    }

    return out;
  }

  function sanitizeProposalCriteria(proposal) {
    if (!proposal || typeof proposal !== "object") return proposal;
    var keys = [
      "screeningInclusion",
      "screeningExclusion",
      "inclusion",
      "exclusion",
    ];
    var out = Object.assign({}, proposal);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      // Sempre coerção a array (objeto LLM → [] evita .concat crash na UI).
      if (Object.prototype.hasOwnProperty.call(proposal, k) || proposal[k] != null) {
        out[k] = sanitizeCriteriaArray(proposal[k]);
      }
    }
    // Listas de schema: forçar array quando presentes e não-array.
    var listKeys = ["entityTypes", "forms", "matrixViews"];
    for (var j = 0; j < listKeys.length; j++) {
      var lk = listKeys[j];
      if (
        Object.prototype.hasOwnProperty.call(proposal, lk) &&
        !Array.isArray(proposal[lk])
      ) {
        out[lk] = [];
      }
    }
    // forms[].fields: não-array → []; filtrar inválidos; options select só array.
    if (Array.isArray(out.forms)) {
      out.forms = out.forms.map(function (form) {
        if (!form || typeof form !== "object") return form;
        return Object.assign({}, form, {
          fields: sanitizeFormFields(form.fields),
        });
      });
    }
    return ensureProposalSchema(out);
  }

  function normalizeProtocol(raw, opts) {
    opts = opts || {};
    if (!raw || typeof raw !== "object") return null;
    var name = str(raw.name);
    if (!name) return null;
    var fieldSchema = getResearchFieldSchemaApi();
    var domainType = resolveDomainType(raw);
    var migrated =
      domainType === "custom"
        ? migrateScreeningCriteria(raw)
        : {
            screeningInclusion: [],
            screeningExclusion: [],
            inclusion: Array.isArray(raw.inclusion) ? raw.inclusion : [],
            exclusion: Array.isArray(raw.exclusion) ? raw.exclusion : [],
          };
    var screeningInclusion = migrated.screeningInclusion
      .map(normalizeCriterion)
      .filter(Boolean);
    var screeningExclusion = migrated.screeningExclusion
      .map(normalizeCriterion)
      .filter(Boolean);
    var inclusion = migrated.inclusion.map(normalizeCriterion).filter(Boolean);
    var exclusion = migrated.exclusion.map(normalizeCriterion).filter(Boolean);

    var entityTypes = [];
    var forms = [];
    var matrixViews = [];
    if (domainType === "custom" && fieldSchema) {
      var custom = fieldSchema.normalizeCustomSchema({
        entityTypes: raw.entityTypes,
        forms: raw.forms,
        matrixViews: raw.matrixViews,
      });
      entityTypes = custom.entityTypes;
      forms = custom.forms;
      matrixViews = custom.matrixViews;
      if (researchMatrixSyncApi && forms.length) {
        matrixViews = researchMatrixSyncApi.syncMatrixViewsWithForms(
          forms,
          matrixViews,
        );
      }
      // FEAT-101: repor keys baseline em forms hub (JSON legado stripado)
      try {
        var hubFieldsApi =
          typeof require === "function"
            ? require("./research-hub-baseline-schema.js")
            : null;
        if (hubFieldsApi && hubFieldsApi.ensureHubFormFields) {
          var withFields = hubFieldsApi.ensureHubFormFields({
            entityTypes: entityTypes,
            forms: forms,
            matrixViews: matrixViews,
          });
          entityTypes = withFields.entityTypes;
          forms = withFields.forms;
          matrixViews = withFields.matrixViews;
        }
      } catch (_hubFieldsErr) {}
    }

    var draftProtocol = {
      domainType: domainType,
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: matrixViews,
    };

    var primaryOutcome = null;
    if (raw.primaryOutcome && typeof raw.primaryOutcome === "object") {
      var poField = str(raw.primaryOutcome.field);
      if (poField && isValidFieldPath(poField, draftProtocol)) {
        primaryOutcome = {
          field: poField,
          label: str(raw.primaryOutcome.label) || poField,
        };
      }
    }
    var indexEvent = str(raw.indexEvent) || "surgery.core.date";
    if (domainType === "custom") {
      var firstForm = forms[0];
      var firstField = firstForm && firstForm.fields && firstForm.fields[0];
      indexEvent = firstForm && firstField
        ? firstForm.id + "." + firstField.key
        : "";
    } else if (!isValidFieldPath(indexEvent, draftProtocol)) {
      indexEvent = "surgery.core.date";
    }
    var followupMonths = Number(raw.followupMonths);
    if (!Number.isFinite(followupMonths) || followupMonths < 0) followupMonths = 0;

    var studyDesign = normalizeStudyDesign(raw.studyDesign, {
      legacyHucamAutoEnroll:
        str(raw.id) === HPB_BUILTIN_PROTOCOL_ID ||
        (domainType === "hpb_builtin" && !Object.prototype.hasOwnProperty.call(raw, "studyDesign")),
      entityTypes: entityTypes,
    });
    studyDesign = syncCohortGrainsFromEntityTypes(studyDesign, entityTypes);

    var protocol = {
      id: str(raw.id) || (opts.newId ? newProtocolId() : ""),
      name: name.slice(0, MAX_NAME_LEN),
      code: str(raw.code).slice(0, MAX_CODE_LEN),
      domainType: domainType,
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: matrixViews,
      studyDesign: studyDesign,
      indexEvent: indexEvent,
      followupMonths: Math.round(followupMonths),
      primaryOutcome: primaryOutcome,
      screeningInclusion: screeningInclusion,
      screeningExclusion: screeningExclusion,
      inclusion: inclusion,
      exclusion: exclusion,
      createdAt: str(raw.createdAt) || nowIso(),
      updatedAt: str(raw.updatedAt) || nowIso(),
    };
    var specialtyPackId = normalizeSpecialtyPackId(raw.specialtyPackId);
    if (specialtyPackId) protocol.specialtyPackId = specialtyPackId;
    if (!protocol.id) return null;
    return protocol;
  }

  function validateCriterionPathRole(criterion, prefix, role, domainType) {
    var errors = [];
    var field = str(criterion && criterion.field);
    if (!field) return errors;
    var isAghu = isAghuCriterionField(field);
    if (role === "screening") {
      if (!isAghu) {
        errors.push(prefix + ": triagem exige path aghu.*");
      }
    } else if (role === "formal" && domainType === "custom") {
      if (isAghu) {
        errors.push(prefix + ": I/E formal custom rejeita path aghu.* (use screening*)");
      }
    }
    return errors;
  }

  function validateProtocol(protocol) {
    var errors = [];
    if (!protocol) {
      errors.push("protocolo ausente");
      return { ok: false, errors: errors };
    }
    if (containsPhiInProtocol(protocol)) {
      errors.push("protocolo contém metadados que parecem PHI");
    }
    if (!str(protocol.name)) errors.push("nome obrigatório");
    var screeningInc = Array.isArray(protocol.screeningInclusion)
      ? protocol.screeningInclusion
      : [];
    var screeningExc = Array.isArray(protocol.screeningExclusion)
      ? protocol.screeningExclusion
      : [];
    var inclusion = Array.isArray(protocol.inclusion) ? protocol.inclusion : [];
    var exclusion = Array.isArray(protocol.exclusion) ? protocol.exclusion : [];
    if (screeningInc.length > MAX_CRITERIA_PER_PROTOCOL) {
      errors.push("demasiados critérios de triagem (inclusão)");
    }
    if (screeningExc.length > MAX_CRITERIA_PER_PROTOCOL) {
      errors.push("demasiados critérios de triagem (exclusão)");
    }
    if (inclusion.length > MAX_CRITERIA_PER_PROTOCOL) {
      errors.push("demasiados critérios de inclusão");
    }
    if (exclusion.length > MAX_CRITERIA_PER_PROTOCOL) {
      errors.push("demasiados critérios de exclusão");
    }
    for (var si = 0; si < screeningInc.length; si++) {
      errors = errors.concat(
        validateCriterion(
          screeningInc[si],
          "triagem inclusão[" + si + "]",
          protocol,
        ),
      );
      errors = errors.concat(
        validateCriterionPathRole(
          screeningInc[si],
          "triagem inclusão[" + si + "]",
          "screening",
          protocol.domainType,
        ),
      );
    }
    for (var se = 0; se < screeningExc.length; se++) {
      errors = errors.concat(
        validateCriterion(
          screeningExc[se],
          "triagem exclusão[" + se + "]",
          protocol,
        ),
      );
      errors = errors.concat(
        validateCriterionPathRole(
          screeningExc[se],
          "triagem exclusão[" + se + "]",
          "screening",
          protocol.domainType,
        ),
      );
    }
    for (var i = 0; i < inclusion.length; i++) {
      errors = errors.concat(
        validateCriterion(inclusion[i], "inclusão[" + i + "]", protocol),
      );
      errors = errors.concat(
        validateCriterionPathRole(
          inclusion[i],
          "inclusão[" + i + "]",
          "formal",
          protocol.domainType,
        ),
      );
    }
    for (var j = 0; j < exclusion.length; j++) {
      errors = errors.concat(
        validateCriterion(exclusion[j], "exclusão[" + j + "]", protocol),
      );
      errors = errors.concat(
        validateCriterionPathRole(
          exclusion[j],
          "exclusão[" + j + "]",
          "formal",
          protocol.domainType,
        ),
      );
    }
    if (protocol.primaryOutcome && !isValidFieldPath(protocol.primaryOutcome.field, protocol)) {
      errors.push("desfecho primário: campo inválido");
    }
    if (protocol.indexEvent && !isValidFieldPath(protocol.indexEvent, protocol)) {
      errors.push("evento índice inválido");
    }
    if (protocol.studyDesign) {
      var sd = protocol.studyDesign;
      var etList = Array.isArray(protocol.entityTypes)
        ? protocol.entityTypes
        : [];
      var primary = str(sd.primaryGrain || sd.cohortGrain);
      var grainsArr = Array.isArray(sd.cohortGrains)
        ? sd.cohortGrains
        : Array.isArray(sd.grains)
          ? sd.grains
          : [];
      if (!isValidCohortGrain(primary, etList)) {
        errors.push("studyDesign.primaryGrain inválido");
      }
      if (!isValidCohortGrain(str(sd.cohortGrain), etList)) {
        errors.push("studyDesign.cohortGrain inválido");
      }
      if (!grainsArr.length) {
        errors.push("studyDesign.cohortGrains deve ter ≥1 grain");
      } else {
        for (var gi = 0; gi < grainsArr.length; gi++) {
          if (!isValidCohortGrain(str(grainsArr[gi]), etList)) {
            errors.push("studyDesign.cohortGrains[" + gi + "] inválido");
          }
        }
        if (
          primary &&
          grainsArr.map(str).indexOf(primary) === -1
        ) {
          errors.push("studyDesign.primaryGrain deve pertencer a grains");
        }
      }
      var formsList = Array.isArray(protocol.forms) ? protocol.forms : [];
      for (var fi = 0; fi < formsList.length; fi++) {
        var fg = optionalFormGrain(
          formsList[fi] && formsList[fi].grain,
          etList,
        );
        if (fg && grainsArr.map(str).indexOf(fg) === -1) {
          errors.push(
            "forms[" + fi + "].grain fora de studyDesign.cohortGrains",
          );
        }
      }
      var mvList = Array.isArray(protocol.matrixViews)
        ? protocol.matrixViews
        : [];
      for (var mi = 0; mi < mvList.length; mi++) {
        var mg = optionalFormGrain(
          mvList[mi] && mvList[mi].grain,
          etList,
        );
        if (mg && grainsArr.map(str).indexOf(mg) === -1) {
          errors.push(
            "matrixViews[" + mi + "].grain fora de studyDesign.cohortGrains",
          );
        }
      }
      for (var ei = 0; ei < etList.length; ei++) {
        var eg = optionalFormGrain(etList[ei] && etList[ei].grain, etList);
        if (eg && grainsArr.map(str).indexOf(eg) === -1) {
          errors.push(
            "entityTypes[" + ei + "].grain fora de studyDesign.cohortGrains",
          );
        }
      }
    }
    if (protocol.domainType === "custom") {
      var fsApi = getResearchFieldSchemaApi();
      if (!fsApi) {
        errors.push("schema custom indisponível");
      } else {
        var cv = fsApi.validateCustomSchema({
          entityTypes: protocol.entityTypes,
          forms: protocol.forms,
          matrixViews: protocol.matrixViews,
        });
        if (!cv.ok) errors = errors.concat(cv.errors);
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeDocument(raw) {
    if (!raw || typeof raw !== "object") return emptyDocument();
    var protocols = Array.isArray(raw.protocols)
      ? raw.protocols.map(function (p) {
          return normalizeProtocol(p, {});
        }).filter(Boolean)
      : [];
    var activeProtocolId = str(raw.activeProtocolId) || null;
    if (activeProtocolId && !protocols.some(function (p) { return p.id === activeProtocolId; })) {
      activeProtocolId = null;
    }
    return {
      version: DOCUMENT_VERSION,
      activeProtocolId: activeProtocolId,
      protocols: protocols.slice(0, MAX_PROTOCOLS),
      enabledSpecialtyPacks: normalizeEnabledSpecialtyPacks(
        raw.enabledSpecialtyPacks,
      ),
    };
  }

  function validateDocument(doc) {
    var errors = [];
    if (!doc || (doc.version !== DOCUMENT_VERSION && doc.version !== 1)) {
      errors.push("versão de documento inválida");
    }
    if (!Array.isArray(doc.protocols)) {
      errors.push("protocols deve ser array");
      return { ok: false, errors: errors };
    }
    if (doc.protocols.length > MAX_PROTOCOLS) {
      errors.push("limite de protocolos excedido");
    }
    for (var i = 0; i < doc.protocols.length; i++) {
      var v = validateProtocol(doc.protocols[i]);
      if (!v.ok) errors = errors.concat(v.errors);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function cloneDocument(doc) {
    return JSON.parse(JSON.stringify(doc));
  }

  function addProtocol(doc, input) {
    doc = normalizeDocument(doc);
    if (doc.protocols.length >= MAX_PROTOCOLS) {
      return { ok: false, error: "protocol_limit_reached", document: doc };
    }
    var protocol = normalizeProtocol(input, { newId: true });
    if (!protocol) return { ok: false, error: "invalid_protocol", document: doc };
    var v = validateProtocol(protocol);
    if (!v.ok) return { ok: false, error: "validation_failed", errors: v.errors, document: doc };
    doc.protocols = doc.protocols.concat([protocol]);
    return { ok: true, document: doc, protocol: protocol };
  }

  function updateProtocol(doc, id, input) {
    doc = normalizeDocument(doc);
    var idx = doc.protocols.findIndex(function (p) {
      return p.id === id;
    });
    if (idx === -1) return { ok: false, error: "not_found", document: doc };
    var merged = Object.assign({}, doc.protocols[idx], input || {}, {
      id: id,
      createdAt: doc.protocols[idx].createdAt,
      updatedAt: nowIso(),
    });
    var protocol = normalizeProtocol(merged, {});
    if (!protocol) return { ok: false, error: "invalid_protocol", document: doc };
    var v = validateProtocol(protocol);
    if (!v.ok) return { ok: false, error: "validation_failed", errors: v.errors, document: doc };
    doc.protocols = doc.protocols.slice();
    doc.protocols[idx] = protocol;
    return { ok: true, document: doc, protocol: protocol };
  }

  function deleteProtocol(doc, id) {
    doc = normalizeDocument(doc);
    var next = doc.protocols.filter(function (p) {
      return p.id !== id;
    });
    if (next.length === doc.protocols.length) {
      return { ok: false, error: "not_found", document: doc };
    }
    doc.protocols = next;
    if (doc.activeProtocolId === id) doc.activeProtocolId = null;
    return { ok: true, document: doc };
  }

  function setActiveProtocol(doc, id) {
    doc = normalizeDocument(doc);
    if (id == null || id === "") {
      doc.activeProtocolId = null;
      return { ok: true, document: doc };
    }
    if (!doc.protocols.some(function (p) {
      return p.id === id;
    })) {
      return { ok: false, error: "not_found", document: doc };
    }
    doc.activeProtocolId = id;
    return { ok: true, document: doc };
  }

  function getProtocol(doc, id) {
    doc = normalizeDocument(doc);
    return doc.protocols.find(function (p) {
      return p.id === id;
    }) || null;
  }

  function isValidWritePayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    var doc = normalizeDocument(payload.document || payload);
    return validateDocument(doc).ok;
  }

  return {
    DOCUMENT_VERSION: DOCUMENT_VERSION,
    HPB_BUILTIN_PROTOCOL_ID: HPB_BUILTIN_PROTOCOL_ID,
    MAX_PROTOCOLS: MAX_PROTOCOLS,
    VALID_OPS: VALID_OPS,
    VALID_COHORT_GRAINS: VALID_COHORT_GRAINS,
    DEFAULT_COHORT_GRAIN: DEFAULT_COHORT_GRAIN,
    COHORT_GRAIN_LABELS: COHORT_GRAIN_LABELS,
    ENTITY_GRAIN_PREFIX: ENTITY_GRAIN_PREFIX,
    isEntityGrain: isEntityGrain,
    entityTypeIdFromGrain: entityTypeIdFromGrain,
    isValidCohortGrain: isValidCohortGrain,
    grainLabel: grainLabel,
    syncCohortGrainsFromEntityTypes: syncCohortGrainsFromEntityTypes,
    normalizeCohortGrain: normalizeCohortGrain,
    normalizeGrainsList: normalizeGrainsList,
    normalizeStudyDesign: normalizeStudyDesign,
    getProtocolCohortGrain: getProtocolCohortGrain,
    getProtocolCohortGrains: getProtocolCohortGrains,
    resolveSessionGrain: resolveSessionGrain,
    isAutoEnrollOnActiveEpisode: isAutoEnrollOnActiveEpisode,
    defaultHpbBuiltinProtocol: defaultHpbBuiltinProtocol,
    findBuiltinProtocol: findBuiltinProtocol,
    getBuiltinProtocolId: getBuiltinProtocolId,
    ensureDefaultHpbBuiltinProtocol: ensureDefaultHpbBuiltinProtocol,
    ensureHpbBuiltinIfPackEnabled: ensureHpbBuiltinIfPackEnabled,
    documentHasSpecialtyPack: documentHasSpecialtyPack,
    normalizeEnabledSpecialtyPacks: normalizeEnabledSpecialtyPacks,
    emptyDocument: emptyDocument,
    normalizeDocument: normalizeDocument,
    validateDocument: validateDocument,
    validateProtocol: validateProtocol,
    normalizeProtocol: normalizeProtocol,
    containsPhiInProtocol: containsPhiInProtocol,
    splitAghuRules: splitAghuRules,
    migrateScreeningCriteria: migrateScreeningCriteria,
    normalizeCriterion: normalizeCriterion,
    sanitizeCriteriaArray: sanitizeCriteriaArray,
    ensureProposalSchema: ensureProposalSchema,
    sanitizeProposalCriteria: sanitizeProposalCriteria,
    addProtocol: addProtocol,
    updateProtocol: updateProtocol,
    deleteProtocol: deleteProtocol,
    setActiveProtocol: setActiveProtocol,
    getProtocol: getProtocol,
    isValidWritePayload: isValidWritePayload,
    cloneDocument: cloneDocument,
  };
});
