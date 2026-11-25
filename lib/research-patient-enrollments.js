/**
 * Inscrições de paciente por protocolo — fonte única em research_registry.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchPatientEnrollments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var registryApi = null;
  var hpbSchemaApi = null;

  try {
    if (typeof require === "function") {
      registryApi = require("./research-registry-schema.js");
      hpbSchemaApi = require("./hpb-registry-schema.js");
    }
  } catch (_e) {}

  function getRegistryApi() {
    if (registryApi) return registryApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchRegistrySchema || null;
  }

  function getHpbSchemaApi() {
    if (hpbSchemaApi) return hpbSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function protocolIdsFromList(protocols) {
    if (!Array.isArray(protocols)) return [];
    return protocols
      .map(function (p) {
        return p && p.id ? str(p.id) : "";
      })
      .filter(Boolean);
  }

  function listEnrolledProtocolIds(registry, protocols) {
    var api = getRegistryApi();
    if (!api) return [];
    var reg = api.normalizeRegistry(registry);
    var ids = protocols
      ? protocolIdsFromList(protocols)
      : Object.keys(reg.protocols || {});
    var enrolled = [];
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      var bucket = api.getProtocolBucket(reg, pid);
      if (api.isPatientEnrolled(bucket)) enrolled.push(pid);
    }
    return enrolled;
  }

  function getEnrollment(registry, protocolId) {
    var api = getRegistryApi();
    if (!api || !protocolId) return null;
    return api.getProtocolBucket(registry, protocolId).enrollment;
  }

  function enrollPatient(registry, protocolId, meta) {
    var api = getRegistryApi();
    if (!api) throw new Error("research_registry_schema_unavailable");
    if (!protocolId) throw new Error("protocol_id_required");
    return api.setEnrollmentStatus(registry, protocolId, "enrolled", meta || {});
  }

  function withdrawPatient(registry, protocolId, meta) {
    var api = getRegistryApi();
    if (!api) throw new Error("research_registry_schema_unavailable");
    if (!protocolId) throw new Error("protocol_id_required");
    return api.setEnrollmentStatus(registry, protocolId, "withdrawn", meta || {});
  }

  function hasActiveHpbEpisodes(hpbRegistry) {
    var hpbApi = getHpbSchemaApi();
    if (!hpbRegistry || typeof hpbRegistry !== "object") return false;
    if (hpbApi && hpbApi.filterRegistryActive) {
      var active = hpbApi.filterRegistryActive(hpbRegistry);
      return Array.isArray(active.episodes) && active.episodes.length > 0;
    }
    var episodes = hpbRegistry.episodes;
    if (!Array.isArray(episodes)) return false;
    return episodes.some(function (ep) {
      return ep && !ep.deletedAt;
    });
  }

  function ensureHpbBuiltinEnrollment(registry, protocolId, hpbRegistry, meta) {
    var api = getRegistryApi();
    if (!api || !protocolId) return registry;
    meta = meta || {};
    // GEN-08: só auto-inscreve se flag efectiva true (legado HUCAM sem campo = true)
    if (Object.prototype.hasOwnProperty.call(meta, "autoEnrollOnActiveEpisode")) {
      if (meta.autoEnrollOnActiveEpisode !== true) return registry;
    } else if (meta.protocol) {
      var studyApi = null;
      try {
        if (typeof require === "function") {
          studyApi = require("./hpb-study-protocol.js");
        }
      } catch (_e) {}
      if (
        studyApi &&
        studyApi.isAutoEnrollOnActiveEpisode &&
        !studyApi.isAutoEnrollOnActiveEpisode(meta.protocol)
      ) {
        return registry;
      }
    }
    var bucket = api.getProtocolBucket(registry, protocolId);
    if (api.isPatientEnrolled(bucket)) return registry;
    if (!hasActiveHpbEpisodes(hpbRegistry)) return registry;
    return enrollPatient(registry, protocolId, {
      enrolledBy: meta.enrolledBy || "system-backfill",
    });
  }

  function isProtocolEnrolled(registry, protocolId) {
    var api = getRegistryApi();
    if (!api || !protocolId) return false;
    return api.isPatientEnrolled(api.getProtocolBucket(registry, protocolId));
  }

  function sortEntityTypesForProvision(entityTypes, neededIds) {
    var sorted = [];
    var pending = neededIds.slice();
    var guard = 0;
    while (pending.length && guard < 50) {
      guard += 1;
      var progressed = false;
      for (var i = pending.length - 1; i >= 0; i--) {
        var typeId = pending[i];
        var parentEt = null;
        for (var t = 0; t < entityTypes.length; t++) {
          if (entityTypes[t].id === typeId) {
            parentEt = entityTypes[t].parentEntityTypeId || null;
            break;
          }
        }
        if (
          !parentEt ||
          sorted.indexOf(parentEt) !== -1 ||
          neededIds.indexOf(parentEt) === -1
        ) {
          sorted.push(typeId);
          pending.splice(i, 1);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return sorted.concat(pending);
  }

  /**
   * Cria entidades CRF vazias por form/entityType após inscrição (matriz coorte).
   */
  function provisionEnrollmentEntities(registry, protocolId, protocol) {
    var api = getRegistryApi();
    if (!api || !protocolId || !protocol) return registry;
    var forms = protocol.forms || [];
    if (!forms.length) return registry;

    var entityTypes = protocol.entityTypes || [];
    var neededIds = [];
    for (var f = 0; f < forms.length; f++) {
      var etId = forms[f] && forms[f].entityTypeId ? str(forms[f].entityTypeId) : "";
      if (etId && neededIds.indexOf(etId) === -1) neededIds.push(etId);
    }
    if (!neededIds.length) return registry;

    var ordered = sortEntityTypesForProvision(entityTypes, neededIds);
    var next = api.normalizeRegistry(registry);

    for (var o = 0; o < ordered.length; o++) {
      var entityTypeId = ordered[o];
      var typeDef = null;
      for (var d = 0; d < entityTypes.length; d++) {
        if (entityTypes[d].id === entityTypeId) {
          typeDef = entityTypes[d];
          break;
        }
      }
      var bucket = api.getProtocolBucket(next, protocolId);
      var active = api.filterActiveEntities(bucket.entities);
      var sameType = active.filter(function (e) {
        return e.entityTypeId === entityTypeId;
      });
      if (sameType.length > 0) continue;

      var parentId = null;
      if (typeDef && typeDef.parentEntityTypeId) {
        var parents = active.filter(function (e) {
          return e.entityTypeId === typeDef.parentEntityTypeId;
        });
        if (!parents.length) continue;
        parentId = parents[0].id;
      }

      var entity = api.newEntity(entityTypeId, parentId);
      next = api.upsertEntity(next, protocolId, entity, protocol);
    }

    return next;
  }

  return {
    listEnrolledProtocolIds: listEnrolledProtocolIds,
    getEnrollment: getEnrollment,
    enrollPatient: enrollPatient,
    withdrawPatient: withdrawPatient,
    hasActiveHpbEpisodes: hasActiveHpbEpisodes,
    ensureHpbBuiltinEnrollment: ensureHpbBuiltinEnrollment,
    isProtocolEnrolled: isProtocolEnrolled,
    provisionEnrollmentEntities: provisionEnrollmentEntities,
  };
});
