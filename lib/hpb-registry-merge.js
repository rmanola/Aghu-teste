/**
 * Merge de hpb_registry — upsert episódio/cirurgia sem perder submódulos ocultos.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbRegistryMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var computedApi = null;
  try {
    if (typeof require === "function") {
      schemaApi = require("./hpb-registry-schema.js");
      computedApi = require("./hpb-computed.js");
    }
  } catch (_e) {}

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function getComputedApi() {
    if (computedApi) return computedApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbComputed || null;
  }

  function enrichSurgery(surgery, opts) {
    if (!surgery || typeof surgery !== "object") return surgery;
    var computed = getComputedApi();
    if (!computed) return surgery;
    opts = opts || {};
    var out = Object.assign({}, surgery);
    var surgeryDate = out.core && out.core.date ? out.core.date : "";
    if (out.preop && computed.enrichPreop) {
      out.preop = computed.enrichPreop(out.preop, { sex: opts.sex });
    }
    if (out.robotic) out.robotic = computed.enrichRobotic(out.robotic);
    if (out.pathology) out.pathology = computed.enrichPathology(out.pathology);
    if (out.postop) out.postop = computed.enrichPostop(out.postop, surgeryDate);
    return out;
  }

  function mergeTombstone(existing, incoming) {
    var exAt =
      existing && existing.deletedAt ? String(existing.deletedAt) : "";
    var inAt =
      incoming && incoming.deletedAt ? String(incoming.deletedAt) : "";
    if (!exAt && !inAt) return {};
    if (!exAt) {
      return { deletedAt: inAt, deletedBy: incoming.deletedBy };
    }
    if (!inAt) {
      return { deletedAt: exAt, deletedBy: existing.deletedBy };
    }
    if (inAt >= exAt) {
      return { deletedAt: inAt, deletedBy: incoming.deletedBy };
    }
    return { deletedAt: exAt, deletedBy: existing.deletedBy };
  }

  function applyTombstoneMerge(existing, incoming, out) {
    return Object.assign(out, mergeTombstone(existing, incoming));
  }

  function mergeChildList(existingList, incomingList, mergeFn) {
    if (!Array.isArray(incomingList)) return existingList;
    if (!Array.isArray(existingList)) return incomingList;
    var byId = {};
    existingList.forEach(function (item) {
      if (item && item.id) byId[item.id] = item;
    });
    var out = incomingList.map(function (item) {
      if (!item || !item.id) return item;
      var ex = byId[item.id];
      return ex ? mergeFn(ex, item) : item;
    });
    existingList.forEach(function (item) {
      if (item && item.id && !out.some(function (x) { return x.id === item.id; })) {
        out.push(item);
      }
    });
    return out;
  }

  function mergeSurgery(existing, incoming) {
    if (!existing) return enrichSurgery(incoming);
    if (!incoming) return enrichSurgery(existing);
    var out = Object.assign({}, existing, incoming);
    var subKeys = [
      "preop",
      "hepatectomy",
      "pancreatectomy",
      "biliary",
      "vascular",
      "robotic",
      "pathology",
      "postop",
    ];
    for (var i = 0; i < subKeys.length; i++) {
      var k = subKeys[i];
      if (incoming[k] === undefined) out[k] = existing[k];
      else if (incoming[k] === null) out[k] = null;
      else if (existing[k] && typeof existing[k] === "object" && typeof incoming[k] === "object") {
        out[k] = Object.assign({}, existing[k], incoming[k]);
      }
    }
    if (existing.core && incoming.core) {
      out.core = Object.assign({}, existing.core, incoming.core);
    }
    applyTombstoneMerge(existing, incoming, out);
    return enrichSurgery(out);
  }

  function episodeIdentityKey(ep) {
    if (!ep || typeof ep !== "object") return "";
    var started = String(ep.startedAt || "").trim();
    var diag = String(ep.primaryDiagnosis || "").trim();
    if (!started && !diag) return "";
    return started + "::" + diag;
  }

  function findEpisodeIndex(reg, episode) {
    if (!episode || !reg || !Array.isArray(reg.episodes)) return -1;
    var id = episode.id ? String(episode.id) : "";
    if (id) {
      var byId = reg.episodes.findIndex(function (e) {
        return e && e.id === id;
      });
      if (byId >= 0) return byId;
    }
    var key = episodeIdentityKey(episode);
    if (!key) return -1;
    return reg.episodes.findIndex(function (e) {
      return e && !e.deletedAt && episodeIdentityKey(e) === key;
    });
  }

  function dedupeEpisodesById(episodes) {
    if (!Array.isArray(episodes)) return [];
    var byId = Object.create(null);
    var order = [];
    for (var i = 0; i < episodes.length; i++) {
      var ep = episodes[i];
      if (!ep || !ep.id) {
        order.push({ kind: "raw", value: ep });
        continue;
      }
      if (byId[ep.id]) {
        byId[ep.id] = mergeEpisode(byId[ep.id], ep);
      } else {
        byId[ep.id] = ep;
        order.push({ kind: "id", value: ep.id });
      }
    }
    return order.map(function (entry) {
      if (entry.kind === "raw") return entry.value;
      return byId[entry.value];
    });
  }

  function mergeEpisode(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    var out = Object.assign({}, existing, incoming);
    applyTombstoneMerge(existing, incoming, out);
    if (Array.isArray(incoming.mdtMeetings)) {
      out.mdtMeetings = mergeChildList(
        existing.mdtMeetings,
        incoming.mdtMeetings,
        function (a, b) {
          return applyTombstoneMerge(a, b, Object.assign({}, a, b));
        },
      );
    }
    if (Array.isArray(incoming.followups)) {
      out.followups = mergeChildList(
        existing.followups,
        incoming.followups,
        function (a, b) {
          return applyTombstoneMerge(a, b, Object.assign({}, a, b));
        },
      );
    }
    if (Array.isArray(incoming.locoregional)) {
      out.locoregional = mergeChildList(
        existing.locoregional,
        incoming.locoregional,
        function (a, b) {
          return applyTombstoneMerge(a, b, Object.assign({}, a, b));
        },
      );
    }
    if (Array.isArray(incoming.surgeries) && Array.isArray(existing.surgeries)) {
      var byId = {};
      existing.surgeries.forEach(function (s) {
        if (s && s.id) byId[s.id] = s;
      });
      out.surgeries = incoming.surgeries.map(function (s) {
        if (!s || !s.id) return s;
        return mergeSurgery(byId[s.id], s);
      });
      existing.surgeries.forEach(function (s) {
        if (s && s.id && !out.surgeries.some(function (x) { return x.id === s.id; })) {
          out.surgeries.push(s);
        }
      });
    } else if (!Array.isArray(incoming.surgeries) && Array.isArray(existing.surgeries)) {
      out.surgeries = existing.surgeries;
    }
    return out;
  }

  var queryRecordsApi = null;
  try {
    if (typeof require === "function") {
      queryRecordsApi = require("./hpb-query-records.js");
    }
  } catch (_e) {}

  function getQueryRecordsApi() {
    if (queryRecordsApi) return queryRecordsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbQueryRecords || null;
  }

  function mergeRegistry(existing, incoming) {
    var schema = getSchemaApi();
    var norm = schema ? schema.normalizeRegistry : function (r) { return r; };
    var a = norm(existing || {});
    var b = norm(incoming || {});
    function withMergedProvenance(primary, secondary) {
      var out = Object.assign({}, primary, secondary, {
        episodes: dedupeEpisodesById(primary.episodes || []),
        fieldProvenance: Object.assign(
          {},
          primary.fieldProvenance || {},
          secondary.fieldProvenance || {},
        ),
      });
      return out;
    }
    if (!a.episodes.length) return withMergedProvenance(b, a);
    if (!b.episodes.length) return withMergedProvenance(a, b);
    var byId = {};
    a.episodes.forEach(function (ep) {
      if (ep && ep.id) byId[ep.id] = ep;
    });
    var incomingEpisodes = dedupeEpisodesById(b.episodes);
    var episodes = incomingEpisodes.map(function (ep) {
      if (!ep || !ep.id) return ep;
      return mergeEpisode(byId[ep.id], ep);
    });
    a.episodes.forEach(function (ep) {
      if (ep && ep.id && !episodes.some(function (x) { return x && x.id === ep.id; })) {
        episodes.push(ep);
      }
    });
    var merged = {
      version: b.version || a.version,
      episodes: dedupeEpisodesById(episodes),
      atualizadoEm: b.atualizadoEm || a.atualizadoEm,
      alertResolutions: Object.assign({}, a.alertResolutions, b.alertResolutions),
      fieldProvenance: Object.assign(
        {},
        a.fieldProvenance || {},
        b.fieldProvenance || {},
      ),
      dataFreeze: Object.prototype.hasOwnProperty.call(b, "dataFreeze")
        ? b.dataFreeze
        : a.dataFreeze ?? null,
    };
    var queryApi = getQueryRecordsApi();
    if (queryApi && queryApi.syncQueryOpenTimestamps) {
      return queryApi.syncQueryOpenTimestamps(merged);
    }
    return merged;
  }

  function upsertEpisode(registry, episode) {
    var schema = getSchemaApi();
    var norm = schema ? schema.normalizeRegistry : function (r) { return r; };
    var reg = norm(registry);
    var idx = findEpisodeIndex(reg, episode);
    if (idx >= 0) {
      reg.episodes[idx] = mergeEpisode(reg.episodes[idx], episode);
    } else {
      var epNew = Object.assign({}, episode);
      if (Array.isArray(epNew.surgeries)) {
        epNew.surgeries = epNew.surgeries.map(enrichSurgery);
      }
      reg.episodes.push(epNew);
    }
    reg.atualizadoEm = schema ? schema.nowIso() : new Date().toISOString();
    var queryApi = getQueryRecordsApi();
    if (queryApi && queryApi.syncQueryOpenTimestamps) {
      reg = queryApi.syncQueryOpenTimestamps(reg);
    }
    return reg;
  }

  return {
    enrichSurgery: enrichSurgery,
    mergeSurgery: mergeSurgery,
    mergeEpisode: mergeEpisode,
    mergeRegistry: mergeRegistry,
    upsertEpisode: upsertEpisode,
    episodeIdentityKey: episodeIdentityKey,
    findEpisodeIndex: findEpisodeIndex,
    dedupeEpisodesById: dedupeEpisodesById,
  };
});
