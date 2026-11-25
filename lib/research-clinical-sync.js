/**
 * Sincronização contínua episódio clínico → research_registry (campos clinicalSource).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchClinicalSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var patientEpisodesApi = null;
  var registrySchemaApi = null;
  var clinicalBridgeApi = null;

  try {
    if (typeof require === "function") {
      patientEpisodesApi = require("./patient-episodes-schema.js");
      registrySchemaApi = require("./research-registry-schema.js");
      clinicalBridgeApi = require("./patient-episodes-hpb-bridge.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function isEnrolled(registry, protocolId) {
    if (!registrySchemaApi) return false;
    var bucket = registrySchemaApi.getProtocolBucket(registry, protocolId);
    return !!(bucket.enrollment && bucket.enrollment.status === "enrolled");
  }

  function resolveClinicalEpisodeForEntity(
    patientEpisodesSnap,
    entity,
    editedEpisodeId,
  ) {
    if (!patientEpisodesApi) return null;
    var snap = patientEpisodesApi.normalizeSnapshot(patientEpisodesSnap);
    var entityPe = entity && str(entity.patientEpisodeId);
    if (entityPe) {
      var linked = patientEpisodesApi.getEntry(snap, entityPe);
      if (linked && !linked.deletedAt) return linked;
    }
    var edited = str(editedEpisodeId);
    if (edited) {
      var one = patientEpisodesApi.getEntry(snap, edited);
      if (one && !one.deletedAt) return one;
    }
    var active = patientEpisodesApi.filterActiveEntries(snap);
    if (active.length === 1) return active[0];
    return null;
  }

  function fieldsWithClinicalSource(protocol) {
    var out = [];
    if (!protocol || !Array.isArray(protocol.forms)) return out;
    for (var f = 0; f < protocol.forms.length; f++) {
      var form = protocol.forms[f];
      var fields = form.fields || [];
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field && field.clinicalSource && field.clinicalSource.path) {
          out.push({
            entityTypeId: form.entityTypeId,
            fieldKey: field.key,
            path: str(field.clinicalSource.path),
          });
        }
      }
    }
    return out;
  }

  function syncEntityFromClinical(entity, clinicalEntry, fieldMappings, overwrite) {
    if (!entity || !clinicalEntry || !clinicalBridgeApi) return entity;
    var next = Object.assign({}, entity, {
      values: Object.assign({}, entity.values || {}),
    });
    var changed = false;
    for (var i = 0; i < fieldMappings.length; i++) {
      var map = fieldMappings[i];
      if (map.entityTypeId !== entity.entityTypeId) continue;
      var value = clinicalBridgeApi.resolveClinicalPath(clinicalEntry, map.path);
      if (!overwrite && str(next.values[map.fieldKey]) !== "") continue;
      if (str(next.values[map.fieldKey]) !== str(value)) {
        next.values[map.fieldKey] = value;
        changed = true;
      }
    }
    return changed ? next : entity;
  }

  /**
   * @returns {{ registry: object, changed: boolean }}
   */
  function applyClinicalSyncToResearchRegistry(
    patientEpisodesSnap,
    researchRegistry,
    protocols,
    opts,
  ) {
    opts = opts || {};
    if (!registrySchemaApi) {
      return { registry: researchRegistry || {}, changed: false };
    }
    var reg = registrySchemaApi.normalizeRegistry(researchRegistry || {});
    var protocolList = Array.isArray(protocols) ? protocols : [];
    if (!protocolList.length) return { registry: reg, changed: false };

    var changed = false;
    for (var p = 0; p < protocolList.length; p++) {
      var protocol = protocolList[p];
      if (!protocol || !protocol.id) continue;
      if (!isEnrolled(reg, protocol.id)) continue;
      var mappings = fieldsWithClinicalSource(protocol);
      if (!mappings.length) continue;

      var bucket = registrySchemaApi.getProtocolBucket(reg, protocol.id);
      var entities = registrySchemaApi.filterActiveEntities(bucket.entities);
      var nextEntities = bucket.entities.slice();
      var bucketChanged = false;

      for (var e = 0; e < entities.length; e++) {
        var entity = entities[e];
        var clinical = resolveClinicalEpisodeForEntity(
          patientEpisodesSnap,
          entity,
          opts.editedEpisodeId,
        );
        if (!clinical) continue;
        var synced = syncEntityFromClinical(
          entity,
          clinical,
          mappings,
          opts.overwrite !== false,
        );
        if (synced === entity) continue;
        var idx = nextEntities.findIndex(function (x) {
          return x.id === synced.id;
        });
        if (idx === -1) continue;
        nextEntities[idx] = synced;
        bucketChanged = true;
      }

      if (bucketChanged) {
        reg = registrySchemaApi.setProtocolBucket(reg, protocol.id, {
          entities: nextEntities,
          enrollment: bucket.enrollment,
          atualizadoEm: registrySchemaApi.nowIso
            ? registrySchemaApi.nowIso()
            : new Date().toISOString(),
        });
        changed = true;
      }
    }

    return { registry: reg, changed: changed };
  }

  return {
    resolveClinicalEpisodeForEntity: resolveClinicalEpisodeForEntity,
    fieldsWithClinicalSource: fieldsWithClinicalSource,
    applyClinicalSyncToResearchRegistry: applyClinicalSyncToResearchRegistry,
  };
});
