/**
 * Elegibilidade de pacientes Research custom por protocolo de estudo.
 * FEAT-068: triagem hub (screening*) vs I/E formal CRF (inclusion/exclusion).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchProtocolEligibility = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var pathsApi = null;
  var aghuPathsApi = null;
  var aghuResolveApi = null;
  var cohortRowsApi = null;
  try {
    if (typeof require === "function") {
      pathsApi = require("./research-protocol-field-paths.js");
      aghuPathsApi = require("./aghu-protocol-field-paths.js");
      aghuResolveApi = require("./aghu-protocol-field-resolve.js");
      cohortRowsApi = require("./research-cohort-rows.js");
    }
  } catch (_e) {}

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    try {
      if (typeof require === "function") {
        schemaApi = require("./research-registry-schema.js");
      }
    } catch (_e) {}
    return schemaApi;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function fold(s) {
    return str(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isYes(v) {
    var s = fold(v);
    return s === "sim" || s === "true" || v === true;
  }

  function isNo(v) {
    var s = fold(v);
    return s === "nao" || s === "não" || s === "false" || v === false;
  }

  function isEmptyValue(v) {
    if (v == null) return true;
    if (typeof v === "boolean") return false;
    return str(v) === "";
  }

  function compareScalar(a, b) {
    var na = Number(a);
    var nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  }

  function evaluateCriterion(value, criterion) {
    var op = str(criterion.op);
    if (op === "isEmpty") return isEmptyValue(value);
    if (op === "isNotEmpty") return !isEmptyValue(value);
    if (op === "isYes") return isYes(value);
    if (op === "isNo") return isNo(value);
    // Comparações / membership: valor ausente falha inclusão (fail-fast).
    if (isEmptyValue(value)) {
      if (
        op === "eq" ||
        op === "ne" ||
        op === "contains" ||
        op === "in" ||
        op === "notIn" ||
        op === "gte" ||
        op === "lte"
      ) {
        return false;
      }
    }
    if (op === "eq") return fold(value) === fold(criterion.value);
    if (op === "ne") return fold(value) !== fold(criterion.value);
    if (op === "contains") {
      var needle = fold(criterion.value);
      if (!needle) return false;
      return fold(value).indexOf(needle) !== -1;
    }
    if (op === "in") {
      var values = Array.isArray(criterion.values) ? criterion.values : [];
      var fv = fold(value);
      return values.some(function (v) {
        return fold(v) === fv;
      });
    }
    if (op === "notIn") {
      var values2 = Array.isArray(criterion.values) ? criterion.values : [];
      var fv2 = fold(value);
      return !values2.some(function (v) {
        return fold(v) === fv2;
      });
    }
    if (op === "gte") return compareScalar(value, criterion.value) >= 0;
    if (op === "lte") return compareScalar(value, criterion.value) <= 0;
    return false;
  }

  function resolveFieldValue(entity, fieldPath, patientDomains, anchorCtx) {
    if (aghuPathsApi && aghuPathsApi.isAghuFieldPath(fieldPath)) {
      if (!aghuResolveApi) return undefined;
      return aghuResolveApi.resolveAghuFieldValue(
        patientDomains || {},
        { field: fieldPath, context: (anchorCtx && anchorCtx.context) || undefined },
        anchorCtx || {},
      );
    }
    if (!entity || !fieldPath || !pathsApi) return undefined;
    var parsed = pathsApi.parseFieldPath(fieldPath);
    if (!parsed) return undefined;
    var values = entity.values || {};
    return values[parsed.fieldKey];
  }

  function splitAghuRules(rules) {
    var aghu = [];
    var registry = [];
    if (!Array.isArray(rules)) return { aghu: aghu, registry: registry };
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (aghuPathsApi && aghuPathsApi.isAghuFieldPath(rule && rule.field)) {
        aghu.push(rule);
      } else {
        registry.push(rule);
      }
    }
    return { aghu: aghu, registry: registry };
  }

  function getScreeningCriteria(protocol) {
    if (!protocol) {
      return { inclusion: [], exclusion: [] };
    }
    if (protocol.domainType === "custom") {
      var hasScreeningKey =
        Object.prototype.hasOwnProperty.call(protocol, "screeningInclusion") ||
        Object.prototype.hasOwnProperty.call(protocol, "screeningExclusion");
      if (hasScreeningKey) {
        return {
          inclusion: Array.isArray(protocol.screeningInclusion)
            ? protocol.screeningInclusion
            : [],
          exclusion: Array.isArray(protocol.screeningExclusion)
            ? protocol.screeningExclusion
            : [],
        };
      }
      // Legado pré-FEAT-068: aghu.* ainda em inclusion/exclusion
      return {
        inclusion: splitAghuRules(protocol.inclusion).aghu,
        exclusion: splitAghuRules(protocol.exclusion).aghu,
      };
    }
    return {
      inclusion: Array.isArray(protocol.inclusion) ? protocol.inclusion : [],
      exclusion: Array.isArray(protocol.exclusion) ? protocol.exclusion : [],
    };
  }

  function getFormalCriteria(protocol) {
    if (!protocol || protocol.domainType !== "custom") {
      return { inclusion: [], exclusion: [] };
    }
    var hasScreeningKey =
      Object.prototype.hasOwnProperty.call(protocol, "screeningInclusion") ||
      Object.prototype.hasOwnProperty.call(protocol, "screeningExclusion");
    if (hasScreeningKey) {
      return {
        inclusion: Array.isArray(protocol.inclusion) ? protocol.inclusion : [],
        exclusion: Array.isArray(protocol.exclusion) ? protocol.exclusion : [],
      };
    }
    return {
      inclusion: splitAghuRules(protocol.inclusion).registry,
      exclusion: splitAghuRules(protocol.exclusion).registry,
    };
  }

  function evaluateAghuRules(patientDomains, rules, anchorCtx, isExclusion) {
    if (!Array.isArray(rules) || !rules.length) return { ok: true, failed: [] };
    var failed = [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var val = resolveFieldValue(null, rule.field, patientDomains, {
        context: rule.context,
        entity: anchorCtx && anchorCtx.entity,
        episode: anchorCtx && anchorCtx.episode,
        surgery: anchorCtx && anchorCtx.surgery,
      });
      var passes = evaluateCriterion(val, rule);
      if (isExclusion) {
        if (passes) failed.push({ rule: rule, value: val });
      } else if (!passes) {
        failed.push({ rule: rule, value: val });
      }
    }
    return { ok: failed.length === 0, failed: failed };
  }

  function evaluateEntityExclusionRules(entity, rules, patientDomains) {
    if (!Array.isArray(rules) || !rules.length) return { hit: false, failed: [] };
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var val = resolveFieldValue(entity, rule.field, patientDomains, {
        entity: entity,
        context: rule.context,
      });
      if (evaluateCriterion(val, rule)) {
        return { hit: true, failed: [{ rule: rule, value: val }] };
      }
    }
    return { hit: false, failed: [] };
  }

  function evaluateEntityAgainstRules(entity, rules, patientDomains) {
    if (!Array.isArray(rules)) return { ok: true, failed: [] };
    var failed = [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var val = resolveFieldValue(entity, rule.field, patientDomains, {
        entity: entity,
        context: rule.context,
      });
      if (!evaluateCriterion(val, rule)) {
        failed.push({ rule: rule, value: val });
      }
    }
    return { ok: failed.length === 0, failed: failed };
  }

  /**
   * Pre-screen / triagem: só screening* (custom) ou inclusion/exclusion HPB (builtin).
   */
  function evaluateScreeningEligibility(patientDomains, protocol) {
    if (!protocol) {
      return { eligible: false, matchedUnits: [], failedRules: [] };
    }
    var criteria = getScreeningCriteria(protocol);
    var inclusion = criteria.inclusion;
    var exclusion = criteria.exclusion;

    if (protocol.domainType === "custom") {
      var incSplit = splitAghuRules(inclusion);
      var excSplit = splitAghuRules(exclusion);
      inclusion = incSplit.aghu.length ? incSplit.aghu : inclusion;
      exclusion = excSplit.aghu.length ? excSplit.aghu : exclusion;
    }

    var aghuInc = evaluateAghuRules(patientDomains, inclusion, {
      anchor: protocol.indexEvent,
    });
    if (!aghuInc.ok) {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: aghuInc.failed,
      };
    }
    var aghuExc = evaluateAghuRules(
      patientDomains,
      exclusion,
      { anchor: protocol.indexEvent },
      true,
    );
    if (!aghuExc.ok) {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: aghuExc.failed,
      };
    }

    if (!inclusion.length && !exclusion.length) {
      return {
        eligible: true,
        matchedUnits: [{ entityId: null, grain: "patient" }],
        failedRules: [],
      };
    }

    return {
      eligible: true,
      matchedUnits: [{ entityId: null, grain: "patient" }],
      failedRules: [],
    };
  }

  /**
   * I/E formal CRF: só inclusion/exclusion custom (formId.fieldKey).
   */
  function evaluateFormalEligibility(registry, protocolId, protocol, patientDomains) {
    var schema = getSchemaApi();
    if (!protocol || !schema || protocol.domainType !== "custom") {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: [],
        crfIncomplete: false,
      };
    }
    var formal = getFormalCriteria(protocol);
    var inclusion = formal.inclusion;
    var exclusion = formal.exclusion;

    if (!inclusion.length && !exclusion.length) {
      return {
        eligible: true,
        matchedUnits: [],
        failedRules: [],
        crfIncomplete: false,
        noRules: true,
      };
    }

    var bucket = schema.getProtocolBucket(registry, protocolId);
    var entities = schema.filterActiveEntities(bucket.entities);
    if (!entities.length) {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: inclusion.slice(0, 3).map(function (rule) {
          return {
            rule: rule,
            reason: "entidade de estudo ausente — preencha o formulário CRF",
          };
        }),
        crfIncomplete: true,
      };
    }

    var matchedUnits = [];
    var failedRules = [];
    for (var e = 0; e < entities.length; e++) {
      var entity = entities[e];
      var inc = evaluateEntityAgainstRules(entity, inclusion, patientDomains);
      if (!inc.ok) {
        failedRules = failedRules.concat(inc.failed);
        continue;
      }
      var exc = evaluateEntityExclusionRules(entity, exclusion, patientDomains);
      if (exc.hit) {
        failedRules = failedRules.concat(exc.failed);
        continue;
      }
      matchedUnits.push({ entityId: entity.id, entityTypeId: entity.entityTypeId });
    }

    return {
      eligible: matchedUnits.length > 0,
      matchedUnits: matchedUnits,
      failedRules: failedRules,
      crfIncomplete: false,
    };
  }

  /** Compat: screening AND formal (se há regras CRF e entidades). */
  function evaluatePatientEligibility(registry, protocolId, protocol, patientDomains) {
    var screening = evaluateScreeningEligibility(patientDomains, protocol);
    if (!screening.eligible) {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: screening.failedRules,
      };
    }

    var formal = evaluateFormalEligibility(
      registry,
      protocolId,
      protocol,
      patientDomains,
    );
    if (formal.noRules) {
      return screening;
    }
    if (!formal.eligible) {
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: formal.failedRules,
      };
    }
    return {
      eligible: true,
      matchedUnits: formal.matchedUnits.length
        ? formal.matchedUnits
        : screening.matchedUnits,
      failedRules: [],
    };
  }

  function enrollmentStatus(bucket) {
    return bucket && bucket.enrollment && bucket.enrollment.status
      ? bucket.enrollment.status
      : "";
  }

  function filterPatientsByProtocol(patients, protocol, opts) {
    opts = opts || {};
    if (!protocol || !Array.isArray(patients)) return [];
    if (protocol.domainType !== "custom") return patients;
    var protocolId = protocol.id;
    return patients.filter(function (p) {
      var registry = p.registry || {};
      var schema = getSchemaApi();
      var bucket = schema
        ? schema.getProtocolBucket(registry, protocolId)
        : { enrollment: null };
      if (opts.enrollmentOnly && schema) {
        if (!schema.isPatientEnrolled(bucket)) return false;
      }
      var st = enrollmentStatus(bucket);
      if (!opts.enrollmentOnly && (st === "screened" || st === "eligible")) {
        return true;
      }
      if (opts.enrollmentOnly && st === "enrolled") {
        return true;
      }
      var result = evaluateScreeningEligibility(
        {
          exams: p.exams,
          controles: p.controles,
          patient_episodes: p.patient_episodes,
          passometro: p.passometro,
        },
        protocol,
      );
      return result.eligible;
    });
  }

  function isPrimaryOutcomeFilled(registry, protocolId, protocol, unit) {
    if (!protocol || !protocol.primaryOutcome || !protocol.primaryOutcome.field) {
      return null;
    }
    var schema = getSchemaApi();
    if (!schema) return false;
    var bucket = schema.getProtocolBucket(registry, protocolId);
    var entity = (bucket.entities || []).find(function (ent) {
      return ent && ent.id === unit.entityId && !ent.deletedAt;
    });
    if (!entity) return false;
    var val = resolveFieldValue(entity, protocol.primaryOutcome.field, {}, { entity: entity });
    return !isEmptyValue(val);
  }

  function summarizeCohortEligibility(patients, protocol, opts) {
    opts = opts || {};
    var list = patients || [];
    var total = list.length;
    var grain =
      opts.grain && cohortRowsApi
        ? cohortRowsApi.normalizeCohortGrain(opts.grain)
        : "patient";
    var denominatorLabel =
      cohortRowsApi && cohortRowsApi.denominatorLabelForGrain
        ? cohortRowsApi.denominatorLabelForGrain(grain)
        : "por paciente";
    if (!protocol || protocol.domainType !== "custom") {
      return {
        totalPatients: total,
        eligiblePatients: total,
        primaryOutcomeFilled: 0,
        primaryOutcomeRate: total ? 1 : 0,
        grain: grain,
        denominatorLabel: denominatorLabel,
      };
    }

    var protocolId = protocol.id;
    var eligible = 0;
    var outcomeFilled = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var registry = p.registry || {};
      var schema = getSchemaApi();
      var bucket = schema
        ? schema.getProtocolBucket(registry, protocolId)
        : { enrollment: null };
      if (opts.enrollmentOnly && schema && !schema.isPatientEnrolled(bucket)) {
        continue;
      }
      var ev = evaluateScreeningEligibility(
        {
          exams: p.exams,
          controles: p.controles,
          patient_episodes: p.patient_episodes,
          passometro: p.passometro,
        },
        protocol,
      );
      if (!ev.eligible) continue;

      var grainCtx =
        cohortRowsApi && cohortRowsApi.analyticsUnitsForPatient
          ? cohortRowsApi.analyticsUnitsForPatient(p, grain)
          : { units: [{ grain: "patient" }] };
      var units = grainCtx.units || [];
      if (!units.length) continue;

      var formal = evaluateFormalEligibility(registry, protocolId, protocol, {
        exams: p.exams,
        controles: p.controles,
        patient_episodes: p.patient_episodes,
        passometro: p.passometro,
      });
      var matched = formal.matchedUnits && formal.matchedUnits.length
        ? formal.matchedUnits
        : ev.matchedUnits;
      var patientOutcomeFilled =
        matched &&
        matched.some(function (unit) {
          return isPrimaryOutcomeFilled(registry, protocolId, protocol, unit);
        });

      for (var u = 0; u < units.length; u++) {
        eligible += 1;
        if (patientOutcomeFilled) outcomeFilled += 1;
      }
    }
    return {
      totalPatients: total,
      eligiblePatients: eligible,
      primaryOutcomeFilled: outcomeFilled,
      primaryOutcomeRate: eligible ? outcomeFilled / eligible : 0,
      grain: grain,
      denominatorLabel: denominatorLabel,
    };
  }

  return {
    evaluateCriterion: evaluateCriterion,
    evaluateScreeningEligibility: evaluateScreeningEligibility,
    evaluateFormalEligibility: evaluateFormalEligibility,
    evaluatePatientEligibility: evaluatePatientEligibility,
    filterPatientsByProtocol: filterPatientsByProtocol,
    summarizeCohortEligibility: summarizeCohortEligibility,
    isPrimaryOutcomeFilled: isPrimaryOutcomeFilled,
    resolveFieldValue: resolveFieldValue,
    splitAghuRules: splitAghuRules,
    getScreeningCriteria: getScreeningCriteria,
    getFormalCriteria: getFormalCriteria,
  };
});
