/**
 * Schema ResearchRegistryV1 — dados clínicos por protocolo custom.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchRegistrySchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var fieldSchemaApi = null;
  try {
    if (typeof require === "function") {
      fieldSchemaApi = require("./research-field-schema.js");
    }
  } catch (_e) {}

  var REGISTRY_VERSION = 1;
  var VALID_ENROLLMENT_STATUSES = [
    "screened",
    "eligible",
    "enrolled",
    "withdrawn",
  ];

  var eligibilityApi = null;

  function getEligibilityApi() {
    if (eligibilityApi) return eligibilityApi;
    try {
      if (typeof require === "function") {
        eligibilityApi = require("./research-protocol-eligibility.js");
      }
    } catch (_e) {}
    return eligibilityApi;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function newEntityId() {
    if (fieldSchemaApi && fieldSchemaApi.newId) {
      return fieldSchemaApi.newId("rent");
    }
    return "rent-" + Date.now().toString(36);
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function normalizeValues(raw) {
    if (!raw || typeof raw !== "object") return {};
    var out = {};
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      var v = raw[k];
      if (v == null) continue;
      if (typeof v === "boolean") {
        out[k] = v ? "Sim" : "Não";
      } else {
        out[k] = String(v);
      }
    }
    return out;
  }

  function normalizeEntity(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = str(raw.id);
    var entityTypeId = str(raw.entityTypeId);
    if (!id || !entityTypeId) return null;
    var entity = {
      id: id,
      entityTypeId: entityTypeId,
      parentId: raw.parentId ? str(raw.parentId) : null,
      values: normalizeValues(raw.values),
    };
    if (raw.patientEpisodeId) entity.patientEpisodeId = str(raw.patientEpisodeId);
    if (raw.deletedAt) entity.deletedAt = str(raw.deletedAt);
    if (raw.deletedBy) entity.deletedBy = str(raw.deletedBy);
    return entity;
  }

  /**
   * GEN-09 / FEAT-060 / FEAT-098: contexto de linha para grain ≠ patient.
   * @returns {{ grain: string, patientEpisodeId?: string, surgeryIndex?: number, entityId?: string }|null}
   */
  function normalizeRowContext(raw) {
    if (!raw || typeof raw !== "object") return null;
    var grain = str(raw.grain);
    if (grain === "patient") return { grain: "patient" };
    if (grain.indexOf("entity:") === 0 && grain.length > "entity:".length) {
      var entityId = str(raw.entityId);
      if (!entityId) return null;
      return { grain: grain, entityId: entityId };
    }
    if (grain !== "clinical_episode" && grain !== "surgery") return null;
    var out = { grain: grain };
    var episodeId = str(raw.patientEpisodeId);
    if (episodeId) out.patientEpisodeId = episodeId;
    if (grain === "clinical_episode") {
      if (!out.patientEpisodeId) return null;
      return out;
    }
    var idx =
      raw.surgeryIndex != null && raw.surgeryIndex !== ""
        ? Number(raw.surgeryIndex)
        : NaN;
    if (!out.patientEpisodeId || isNaN(idx) || idx < 0) return null;
    out.surgeryIndex = Math.floor(idx);
    return out;
  }

  function normalizeEnrollment(raw) {
    if (!raw || typeof raw !== "object") return null;
    var status = str(raw.status);
    if (VALID_ENROLLMENT_STATUSES.indexOf(status) === -1) return null;
    var out = { status: status };
    if (raw.screenedAt) out.screenedAt = str(raw.screenedAt);
    if (raw.enrolledAt) out.enrolledAt = str(raw.enrolledAt);
    if (raw.withdrawnAt) out.withdrawnAt = str(raw.withdrawnAt);
    if (raw.withdrawnReason) out.withdrawnReason = str(raw.withdrawnReason).slice(0, 500);
    if (raw.enrolledBy) out.enrolledBy = str(raw.enrolledBy).slice(0, 200);
    if (raw.consentAt) out.consentAt = str(raw.consentAt);
    if (raw.consentRecordedBy) {
      out.consentRecordedBy = str(raw.consentRecordedBy).slice(0, 200);
    }
    if (Object.prototype.hasOwnProperty.call(raw, "rowContext")) {
      if (raw.rowContext == null) {
        /* omit — clear */
      } else {
        var rc = normalizeRowContext(raw.rowContext);
        if (rc && rc.grain !== "patient") out.rowContext = rc;
      }
    }
    return out;
  }

  function normalizeProtocolBucket(raw) {
    if (!raw || typeof raw !== "object") {
      return { entities: [], enrollment: null, atualizadoEm: null };
    }
    var entities = Array.isArray(raw.entities)
      ? raw.entities.map(normalizeEntity).filter(Boolean)
      : [];
    return {
      entities: entities,
      enrollment: normalizeEnrollment(raw.enrollment),
      atualizadoEm: raw.atualizadoEm ? str(raw.atualizadoEm) : null,
    };
  }

  function normalizeDataFreeze(raw) {
    if (!raw || typeof raw !== "object") return null;
    var frozenAt = str(raw.frozenAt);
    if (!frozenAt) return null;
    return {
      frozenAt: frozenAt,
      frozenBy: str(raw.frozenBy),
      note: str(raw.note),
    };
  }

  function emptyRegistry() {
    return {
      version: REGISTRY_VERSION,
      protocols: {},
      dataFreeze: null,
    };
  }

  function normalizeRegistry(raw) {
    if (!raw || typeof raw !== "object") return emptyRegistry();
    var protocols = {};
    if (raw.protocols && typeof raw.protocols === "object") {
      for (var pid in raw.protocols) {
        if (!Object.prototype.hasOwnProperty.call(raw.protocols, pid)) continue;
        protocols[pid] = normalizeProtocolBucket(raw.protocols[pid]);
      }
    }
    return {
      version: REGISTRY_VERSION,
      protocols: protocols,
      dataFreeze: normalizeDataFreeze(raw.dataFreeze),
    };
  }

  function isDeleted(item) {
    return !!(item && item.deletedAt);
  }

  function filterActiveEntities(entities) {
    if (!Array.isArray(entities)) return [];
    return entities.filter(function (e) {
      return !isDeleted(e);
    });
  }

  function getProtocolBucket(registry, protocolId) {
    var reg = normalizeRegistry(registry);
    if (!protocolId) return { entities: [], enrollment: null, atualizadoEm: null };
    return (
      reg.protocols[protocolId] || {
        entities: [],
        enrollment: null,
        atualizadoEm: null,
      }
    );
  }

  function isPatientEnrolled(bucket) {
    var b = bucket || { enrollment: null };
    return !!(b.enrollment && b.enrollment.status === "enrolled");
  }

  function isEnrollmentWithdrawn(bucket) {
    var b = bucket || { enrollment: null };
    return !!(b.enrollment && b.enrollment.status === "withdrawn");
  }

  function canMutateEntities(bucket) {
    return !isEnrollmentWithdrawn(bucket);
  }

  function setEnrollmentOnBucket(bucket, enrollment) {
    return Object.assign({}, bucket || {}, {
      enrollment: enrollment,
      atualizadoEm: nowIso(),
    });
  }

  function setEnrollmentStatus(registry, protocolId, status, meta) {
    meta = meta || {};
    var reg = normalizeRegistry(registry);
    var bucket = getProtocolBucket(reg, protocolId);
    var current = bucket.enrollment;
    var nextStatus = str(status);
    if (VALID_ENROLLMENT_STATUSES.indexOf(nextStatus) === -1) {
      throw new Error("enrollment_status_invalid");
    }

    var enrollment = current ? Object.assign({}, current) : { status: nextStatus };
    enrollment.status = nextStatus;
    var ts = nowIso();

    if (nextStatus === "screened" || nextStatus === "eligible") {
      if (!enrollment.screenedAt) enrollment.screenedAt = ts;
    }
    if (nextStatus === "enrolled") {
      enrollment.enrolledAt = meta.enrolledAt ? str(meta.enrolledAt) : ts;
      if (meta.enrolledBy) enrollment.enrolledBy = str(meta.enrolledBy).slice(0, 200);
    }
    if (nextStatus === "withdrawn") {
      enrollment.withdrawnAt = meta.withdrawnAt ? str(meta.withdrawnAt) : ts;
      if (meta.withdrawnReason) {
        enrollment.withdrawnReason = str(meta.withdrawnReason).slice(0, 500);
      }
    }
    if (Object.prototype.hasOwnProperty.call(meta, "rowContext")) {
      if (meta.rowContext == null) {
        delete enrollment.rowContext;
      } else {
        var rcMeta = normalizeRowContext(meta.rowContext);
        if (rcMeta && rcMeta.grain !== "patient") {
          enrollment.rowContext = rcMeta;
        } else {
          delete enrollment.rowContext;
        }
      }
    }

    var normalized = normalizeEnrollment(enrollment);
    if (!normalized) throw new Error("enrollment_invalid");
    return setProtocolBucket(reg, protocolId, setEnrollmentOnBucket(bucket, normalized));
  }

  function deriveEnrollmentFromEligibility(registry, protocolId, protocol, patientDomains) {
    var reg = normalizeRegistry(registry);
    var bucket = getProtocolBucket(reg, protocolId);
    if (bucket.enrollment && bucket.enrollment.status === "enrolled") {
      return reg;
    }
    if (bucket.enrollment && bucket.enrollment.status === "withdrawn") {
      return reg;
    }
    if (!getEligibilityApi() || !protocol) return reg;
    var eligApi = getEligibilityApi();
    var result =
      typeof eligApi.evaluateScreeningEligibility === "function"
        ? eligApi.evaluateScreeningEligibility(patientDomains, protocol)
        : eligApi.evaluatePatientEligibility(
            reg,
            protocolId,
            protocol,
            patientDomains,
          );
    var nextStatus = result.eligible ? "eligible" : "screened";
    if (
      bucket.enrollment &&
      bucket.enrollment.status === nextStatus &&
      bucket.enrollment.screenedAt
    ) {
      return reg;
    }
    return setEnrollmentStatus(reg, protocolId, nextStatus, {
      screenedAt: bucket.enrollment && bucket.enrollment.screenedAt,
    });
  }

  function getEntityTypeDef(protocol, entityTypeId) {
    if (!protocol || !entityTypeId) return null;
    var types = protocol.entityTypes || [];
    for (var i = 0; i < types.length; i++) {
      if (types[i].id === entityTypeId) return types[i];
    }
    return null;
  }

  function findActiveParentEntity(entities, parentId) {
    if (!parentId) return null;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!isDeleted(e) && e.id === parentId) return e;
    }
    return null;
  }

  function assertEntityUpsertAllowed(bucket, entity, protocol) {
    if (!canMutateEntities(bucket)) {
      throw new Error("enrollment_withdrawn_readonly");
    }
    if (!protocol) return;
    var entityType = getEntityTypeDef(protocol, entity.entityTypeId);
    if (!entityType) return;

    var active = filterActiveEntities(bucket.entities);
    var isNew = !active.some(function (e) {
      return e.id === entity.id;
    });

    if (entityType.parentEntityTypeId) {
      if (!entity.parentId) throw new Error("entity_parent_required");
      var parent = findActiveParentEntity(active, entity.parentId);
      if (!parent) throw new Error("entity_parent_invalid");
      if (parent.entityTypeId !== entityType.parentEntityTypeId) {
        throw new Error("entity_parent_type_mismatch");
      }
    }

    if (isNew && entityType.cardinality === "one") {
      var sameType = active.filter(function (e) {
        return e.entityTypeId === entity.entityTypeId;
      });
      if (entityType.parentEntityTypeId) {
        sameType = sameType.filter(function (e) {
          return e.parentId === entity.parentId;
        });
      }
      if (sameType.length > 0) {
        throw new Error("entity_cardinality_one_violation");
      }
    }
  }

  function setProtocolBucket(registry, protocolId, bucket) {
    var reg = normalizeRegistry(registry);
    reg.protocols[protocolId] = normalizeProtocolBucket(bucket);
    reg.protocols[protocolId].atualizadoEm = nowIso();
    return reg;
  }

  function upsertEntity(registry, protocolId, entity, protocol) {
    var reg = normalizeRegistry(registry);
    var bucket = getProtocolBucket(reg, protocolId);
    var normalized = normalizeEntity(entity);
    if (!normalized) return reg;
    assertEntityUpsertAllowed(bucket, normalized, protocol || null);
    var idx = bucket.entities.findIndex(function (e) {
      return e.id === normalized.id;
    });
    var entities = bucket.entities.slice();
    if (idx === -1) entities.push(normalized);
    else entities[idx] = normalized;
    return setProtocolBucket(reg, protocolId, {
      entities: entities,
      atualizadoEm: nowIso(),
    });
  }

  function softDeleteEntity(registry, protocolId, entityId, deletedBy) {
    var reg = normalizeRegistry(registry);
    var bucket = getProtocolBucket(reg, protocolId);
    var entities = bucket.entities.map(function (e) {
      if (e.id !== entityId) return e;
      return Object.assign({}, e, {
        deletedAt: nowIso(),
        deletedBy: deletedBy ? str(deletedBy) : "",
      });
    });
    return setProtocolBucket(reg, protocolId, {
      entities: entities,
      atualizadoEm: nowIso(),
    });
  }

  function newEntity(entityTypeId, parentId) {
    return {
      id: newEntityId(),
      entityTypeId: entityTypeId,
      parentId: parentId || null,
      values: {},
    };
  }

  function hasProtocolContent(registry, protocolId) {
    var bucket = getProtocolBucket(registry, protocolId);
    return filterActiveEntities(bucket.entities).length > 0;
  }

  function hasAnyProtocolContent(registry) {
    var reg = normalizeRegistry(registry);
    for (var pid in reg.protocols) {
      if (!Object.prototype.hasOwnProperty.call(reg.protocols, pid)) continue;
      if (hasProtocolContent(reg, pid)) return true;
    }
    return false;
  }

  function isRegistryFrozen(registry) {
    return !!(registry && registry.dataFreeze && registry.dataFreeze.frozenAt);
  }

  function clinicalSnapshot(registry, protocolId) {
    var bucket = getProtocolBucket(registry, protocolId);
    return JSON.stringify({
      entities: filterActiveEntities(bucket.entities),
    });
  }

  function assertRegistryEditable(existing, incoming, protocolId) {
    if (!isRegistryFrozen(existing)) return;
    if (clinicalSnapshot(existing, protocolId) === clinicalSnapshot(incoming, protocolId)) {
      return;
    }
    throw new Error("research_registry_frozen");
  }

  return {
    REGISTRY_VERSION: REGISTRY_VERSION,
    emptyRegistry: emptyRegistry,
    normalizeRegistry: normalizeRegistry,
    normalizeEntity: normalizeEntity,
    normalizeEnrollment: normalizeEnrollment,
    normalizeRowContext: normalizeRowContext,
    isDeleted: isDeleted,
    filterActiveEntities: filterActiveEntities,
    getProtocolBucket: getProtocolBucket,
    setProtocolBucket: setProtocolBucket,
    isPatientEnrolled: isPatientEnrolled,
    isEnrollmentWithdrawn: isEnrollmentWithdrawn,
    canMutateEntities: canMutateEntities,
    setEnrollmentStatus: setEnrollmentStatus,
    deriveEnrollmentFromEligibility: deriveEnrollmentFromEligibility,
    assertEntityUpsertAllowed: assertEntityUpsertAllowed,
    upsertEntity: upsertEntity,
    softDeleteEntity: softDeleteEntity,
    newEntity: newEntity,
    hasProtocolContent: hasProtocolContent,
    hasAnyProtocolContent: hasAnyProtocolContent,
    isRegistryFrozen: isRegistryFrozen,
    assertRegistryEditable: assertRegistryEditable,
    nowIso: nowIso,
  };
});
