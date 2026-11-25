/**
 * Soft delete de itens HPB — marca deletedAt/deletedBy no registry.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbDeleteItem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function getSchema() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function auditField(kind, itemId) {
    return itemId
      ? "hpb_registry:delete:" + kind + ":" + itemId
      : "hpb_registry:delete:" + kind;
  }

  /**
   * @param {object} registry
   * @param {{ kind: string, episodeId: string, itemId?: string }} path
   * @param {{ userId: string, at?: string }} opts
   * @returns {{ registry: object, audit: Array<{ kind: string, id: string, deletedBy: string, deletedAt: string }> }}
   */
  function deleteHpbItem(registry, path, opts) {
    var schema = getSchema();
    if (!schema) throw new Error("hpb-registry-schema unavailable");
    var norm = schema.normalizeRegistry(registry || {});
    var userId = String(opts?.userId || "");
    if (!userId) throw new Error("userId required for HPB delete audit");
    var at = opts?.at || schema.nowIso();
    var kind = path.kind;
    var episodeId = path.episodeId;
    var itemId = path.itemId;
    var audit = [];

    var episodes = norm.episodes.map(function (ep) {
      if (ep.id !== episodeId) return ep;

      if (kind === "episode") {
        var markedEp = schema.markDeleted(ep, { userId: userId, at: at });
        audit.push({
          kind: "episode",
          id: ep.id,
          deletedBy: userId,
          deletedAt: at,
        });
        return markedEp;
      }

      if (kind === "surgery" && itemId) {
        audit.push({
          kind: "surgery",
          id: itemId,
          deletedBy: userId,
          deletedAt: at,
        });
        return Object.assign({}, ep, {
          surgeries: (ep.surgeries || []).map(function (s) {
            if (s.id !== itemId) return s;
            return schema.markDeleted(s, { userId: userId, at: at });
          }),
        });
      }

      if (kind === "mdt" && itemId) {
        audit.push({
          kind: "mdt",
          id: itemId,
          deletedBy: userId,
          deletedAt: at,
        });
        return Object.assign({}, ep, {
          mdtMeetings: (ep.mdtMeetings || []).map(function (m) {
            if (m.id !== itemId) return m;
            return schema.markDeleted(m, { userId: userId, at: at });
          }),
        });
      }

      if (kind === "followup" && itemId) {
        audit.push({
          kind: "followup",
          id: itemId,
          deletedBy: userId,
          deletedAt: at,
        });
        return Object.assign({}, ep, {
          followups: (ep.followups || []).map(function (f) {
            if (f.id !== itemId) return f;
            return schema.markDeleted(f, { userId: userId, at: at });
          }),
        });
      }

      if (kind === "lrt" && itemId) {
        audit.push({
          kind: "lrt",
          id: itemId,
          deletedBy: userId,
          deletedAt: at,
        });
        return Object.assign({}, ep, {
          locoregional: (ep.locoregional || []).map(function (l) {
            if (l.id !== itemId) return l;
            return schema.markDeleted(l, { userId: userId, at: at });
          }),
        });
      }

      return ep;
    });

    if (!audit.length) {
      throw new Error("HPB item not found for delete");
    }

    return {
      registry: Object.assign({}, norm, {
        episodes: episodes,
        atualizadoEm: at,
      }),
      audit: audit,
    };
  }

  function auditFieldsFromEntries(entries) {
    return (entries || []).map(function (e) {
      return auditField(e.kind, e.id);
    });
  }

  return {
    deleteHpbItem: deleteHpbItem,
    auditField: auditField,
    auditFieldsFromEntries: auditFieldsFromEntries,
  };
});
