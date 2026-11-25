/**
 * Coleção de passômetros por episódio de internação (domínio passometro v2).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuPassometroCollection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 2;

  var passometroSchemaApi = null;
  var patientEpisodesApi = null;
  var dateBrApi = null;
  var syncPayloadApi = null;

  try {
    if (typeof require === "function") {
      passometroSchemaApi = require("./passometro-schema.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      dateBrApi = require("./date-br.js");
    }
  } catch (_e) {}

  function getPassometroSchema() {
    if (passometroSchemaApi) return passometroSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    passometroSchemaApi = g.AghuPassometroSchema || null;
    return passometroSchemaApi;
  }

  function getPatientEpisodesSchema() {
    if (patientEpisodesApi) return patientEpisodesApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    patientEpisodesApi = g.AghuPatientEpisodesSchema || null;
    return patientEpisodesApi;
  }

  function getDateBr() {
    if (dateBrApi) return dateBrApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    dateBrApi = g.AghuDateBr || null;
    return dateBrApi;
  }

  var episodesBridgeApi = null;

  function getEpisodesBridge() {
    if (episodesBridgeApi) return episodesBridgeApi;
    try {
      if (typeof require === "function") {
        episodesBridgeApi = require("./passometro-episodes-bridge.js");
      }
    } catch (_e) {}
    if (!episodesBridgeApi) {
      var g = typeof globalThis !== "undefined" ? globalThis : {};
      episodesBridgeApi = g.AghuPassometroEpisodesBridge || null;
    }
    return episodesBridgeApi;
  }

  function getSyncPayloadApi() {
    if (syncPayloadApi) return syncPayloadApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    syncPayloadApi = g.AghuSupabaseSyncPayload || null;
    return syncPayloadApi;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function nowMs() {
    return Date.now();
  }

  function isLegacySnapV1(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.version === VERSION && Array.isArray(raw.registros)) return false;
    return !!(raw.header || raw.entries);
  }

  function emptyCollection() {
    return {
      version: VERSION,
      registros: [],
      atualizadoEm: null,
    };
  }

  function normalizeRegistro(raw) {
    if (!raw || typeof raw !== "object") return null;
    var episodeId = str(raw.patientEpisodeId);
    if (!episodeId) return null;
    var pm = getPassometroSchema();
    var snap = raw.snap && typeof raw.snap === "object" ? raw.snap : {};
    var normalizedSnap = pm && pm.normalizeSnap ? pm.normalizeSnap(snap) : snap;
    var atualizadoEm = raw.atualizadoEm;
    if (typeof atualizadoEm !== "number" || !Number.isFinite(atualizadoEm)) {
      atualizadoEm = normalizedSnap.atualizadoEm || null;
    }
    return {
      patientEpisodeId: episodeId,
      snap: normalizedSnap,
      atualizadoEm: atualizadoEm,
    };
  }

  function normalizeCollection(raw) {
    if (!raw || typeof raw !== "object") return emptyCollection();
    if (isLegacySnapV1(raw)) {
      return emptyCollection();
    }
    var registros = Array.isArray(raw.registros) ? raw.registros : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < registros.length; i++) {
      var reg = normalizeRegistro(registros[i]);
      if (!reg || seen[reg.patientEpisodeId]) continue;
      seen[reg.patientEpisodeId] = true;
      out.push(reg);
    }
    var atualizadoEm = raw.atualizadoEm;
    if (typeof atualizadoEm !== "number" || !Number.isFinite(atualizadoEm)) {
      atualizadoEm = null;
    }
    return {
      version: VERSION,
      registros: out,
      atualizadoEm: atualizadoEm,
    };
  }

  function findActiveHospitalizationEpisode(patientEpisodesSnap) {
    var pe = getPatientEpisodesSchema();
    if (!pe) return null;
    var snap = pe.normalizeSnapshot(patientEpisodesSnap || pe.emptySnapshot());
    var active = pe.filterActiveEntries(snap).filter(function (entry) {
      return entry.status === "active" && entry.kind === "hospitalization";
    });
    if (!active.length) return null;
    return active[0];
  }

  function isoToBrDih(isoDate) {
    var raw = str(isoDate);
    if (!raw) return "";
    var db = getDateBr();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw) && db && db.isoToBr) {
      return db.isoToBr(raw.slice(0, 10));
    }
    return raw;
  }

  function brDihToIso(brDate) {
    var raw = str(brDate);
    if (!raw) return "";
    var db = getDateBr();
    if (db && db.brToIso) {
      var iso = db.brToIso(raw);
      if (iso) return iso;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return "";
  }

  function migrateLegacySnapToCollection(legacySnap, patientEpisodesSnap) {
    var pe = getPatientEpisodesSchema();
    var pm = getPassometroSchema();
    if (!legacySnap || typeof legacySnap !== "object") {
      return {
        collection: emptyCollection(),
        patientEpisodes: null,
        episodesChanged: false,
      };
    }
    var normalizedSnap = pm && pm.normalizeSnap ? pm.normalizeSnap(legacySnap) : legacySnap;
    var episodesSnap = pe
      ? pe.normalizeSnapshot(patientEpisodesSnap || pe.emptySnapshot())
      : { version: 1, entries: [], atualizadoEm: null };
    var active = findActiveHospitalizationEpisode(episodesSnap);
    var episodeId = active ? active.id : null;
    var episodesChanged = false;

    if (!episodeId && pe) {
      episodeId = pe.newEpisodeId();
      var stub = pe.normalizeEntry({
        id: episodeId,
        label: "Internação (migrado)",
        startedAt:
          brDihToIso(normalizedSnap.header && normalizedSnap.header.dih) || "",
        endedAt: null,
        status: "active",
        kind: "hospitalization",
        notes: "",
        diagnoses: [],
      });
      if (stub) {
        episodesSnap = pe.upsertEntry(episodesSnap, stub);
        episodesChanged = true;
      }
    }

    if (!episodeId) {
      return {
        collection: emptyCollection(),
        patientEpisodes: null,
        episodesChanged: false,
      };
    }

    var collection = emptyCollection();
    collection.registros.push({
      patientEpisodeId: episodeId,
      snap: normalizedSnap,
      atualizadoEm: normalizedSnap.atualizadoEm || nowMs(),
    });
    collection.atualizadoEm = collection.registros[0].atualizadoEm;
    return {
      collection: collection,
      patientEpisodes: episodesChanged ? episodesSnap : null,
      episodesChanged: episodesChanged,
    };
  }

  /**
   * Normaliza domínio passometro (v1 legado ou v2).
   * @returns {{ collection: object, patientEpisodes: object | null, episodesChanged: boolean }}
   */
  function normalizePassometroDomain(raw, patientEpisodesSnap) {
    if (!raw || typeof raw !== "object") {
      return {
        collection: emptyCollection(),
        patientEpisodes: null,
        episodesChanged: false,
      };
    }
    if (isLegacySnapV1(raw)) {
      return migrateLegacySnapToCollection(raw, patientEpisodesSnap);
    }
    return {
      collection: normalizeCollection(raw),
      patientEpisodes: null,
      episodesChanged: false,
    };
  }

  function findRegistro(collection, patientEpisodeId) {
    var id = str(patientEpisodeId);
    if (!id) return null;
    var coll = normalizeCollection(collection);
    for (var i = 0; i < coll.registros.length; i++) {
      if (coll.registros[i].patientEpisodeId === id) return coll.registros[i];
    }
    return null;
  }

  function emptySnapForEpisode(episode) {
    var pm = getPassometroSchema();
    var snap = pm && pm.emptySnap ? pm.emptySnap() : { header: {}, entries: [], atualizadoEm: null };
    if (episode && episode.startedAt) {
      var dih = isoToBrDih(episode.startedAt);
      if (dih && snap.header) snap.header.dih = dih;
    }
    return snap;
  }

  function ensureRegistroForEpisode(collection, episode) {
    var coll = normalizeCollection(collection);
    var episodeId = str(episode && episode.id);
    if (!episodeId) return { collection: coll, created: false };
    var existing = findRegistro(coll, episodeId);
    if (existing) return { collection: coll, created: false };
    var snap = emptySnapForEpisode(episode);
    return upsertRegistro(coll, episodeId, snap);
  }

  function upsertRegistro(collection, patientEpisodeId, snap) {
    var coll = normalizeCollection(collection);
    var episodeId = str(patientEpisodeId);
    if (!episodeId) throw new Error("patient_episode_id_required");
    var pm = getPassometroSchema();
    var normalizedSnap = pm && pm.normalizeSnap ? pm.normalizeSnap(snap || {}) : snap || {};
    var ts = nowMs();
    normalizedSnap.atualizadoEm = ts;
    var found = false;
    var registros = coll.registros.map(function (r) {
      if (r.patientEpisodeId !== episodeId) return r;
      found = true;
      return {
        patientEpisodeId: episodeId,
        snap: normalizedSnap,
        atualizadoEm: ts,
      };
    });
    if (!found) {
      registros.push({
        patientEpisodeId: episodeId,
        snap: normalizedSnap,
        atualizadoEm: ts,
      });
    }
    return {
      collection: {
        version: VERSION,
        registros: registros,
        atualizadoEm: ts,
      },
      created: !found,
    };
  }

  function resolveSnapForEpisode(collection, patientEpisodeId) {
    var reg = findRegistro(collection, patientEpisodeId);
    if (!reg) return null;
    return reg.snap;
  }

  function resolveActiveSnap(collection, patientEpisodesSnap) {
    var active = findActiveHospitalizationEpisode(patientEpisodesSnap);
    if (!active) return null;
    var coll = normalizeCollection(collection);
    var reg = findRegistro(coll, active.id);
    if (reg) return reg.snap;
    var ensured = ensureRegistroForEpisode(coll, active);
    var ensuredReg = findRegistro(ensured.collection, active.id);
    return ensuredReg ? ensuredReg.snap : null;
  }

  function resolveViewSnap(collection, patientEpisodesSnap, viewEpisodeId) {
    var pe = getPatientEpisodesSchema();
    if (!pe) return resolveActiveSnap(collection, patientEpisodesSnap);
    var id = str(viewEpisodeId);
    if (!id) return resolveActiveSnap(collection, patientEpisodesSnap);
    var entry = pe.getEntry(patientEpisodesSnap, id);
    if (!entry || entry.deletedAt) return resolveActiveSnap(collection, patientEpisodesSnap);
    if (entry.kind !== "hospitalization") return resolveActiveSnap(collection, patientEpisodesSnap);
    var coll = normalizeCollection(collection);
    var reg = findRegistro(coll, id);
    if (reg) return reg.snap;
    if (entry.status === "active") {
      var ensured = ensureRegistroForEpisode(coll, entry);
      var ensuredViewReg = findRegistro(ensured.collection, id);
      return ensuredViewReg ? ensuredViewReg.snap : null;
    }
    return null;
  }

  function isPassometroEditable(episode) {
    if (!episode || episode.deletedAt) return false;
    if (episode.kind !== "hospitalization") return false;
    return episode.status === "active";
  }

  /**
   * Editável quando não há episódio resolvido (bootstrap — primeiro save cria internação)
   * ou quando o episódio é internação hospitalar activa.
   */
  function canEditPassometroForEpisode(episode) {
    if (!episode) return true;
    return isPassometroEditable(episode);
  }

  function headerDihFromCollection(coll) {
    for (var hi = 0; hi < coll.registros.length; hi++) {
      var reg = coll.registros[hi];
      if (!registroHasContent(reg)) continue;
      var dih =
        reg.snap && reg.snap.header ? str(reg.snap.header.dih) : "";
      if (dih) return dih;
    }
    return "";
  }

  /**
   * Provisiona internação activa em memória quando há passômetro clínico mas sem episódio activo.
   * @returns {{ collection: object, patientEpisodes: object, episodesChanged: boolean }}
   */
  function bootstrapHospitalizationContext(collection, patientEpisodesSnap) {
    var pe = getPatientEpisodesSchema();
    var coll = normalizeCollection(collection);
    if (!pe) {
      return {
        collection: coll,
        patientEpisodes: patientEpisodesSnap,
        episodesChanged: false,
      };
    }
    var episodes = pe.normalizeSnapshot(
      patientEpisodesSnap || pe.emptySnapshot(),
    );
    var active = findActiveHospitalizationEpisode(episodes);
    if (active) {
      return {
        collection: coll,
        patientEpisodes: episodes,
        episodesChanged: false,
      };
    }
    if (!hasPassometroContent(coll)) {
      return {
        collection: coll,
        patientEpisodes: episodes,
        episodesChanged: false,
      };
    }

    var headerDih = headerDihFromCollection(coll);
    if (!headerDih) {
      var anySnap = resolveAnySnapFromDomain(coll, episodes);
      if (anySnap && anySnap.header) {
        headerDih = str(anySnap.header.dih);
      }
    }

    var episodeId = pe.newEpisodeId();
    if (coll.registros.length === 1) {
      var orphanRegId = str(coll.registros[0].patientEpisodeId);
      if (
        orphanRegId &&
        orphanRegId !== LOCAL_EPISODE_ID &&
        !pe.getEntry(episodes, orphanRegId)
      ) {
        episodeId = orphanRegId;
      }
    }
    var stub = pe.normalizeEntry({
      id: episodeId,
      label: headerDih ? "Internação " + headerDih : "Internação",
      startedAt: brDihToIso(headerDih) || "",
      endedAt: null,
      status: "active",
      kind: "hospitalization",
      notes: "",
      diagnoses: [],
    });
    if (!stub) {
      return {
        collection: coll,
        patientEpisodes: episodes,
        episodesChanged: false,
      };
    }
    episodes = pe.upsertEntry(episodes, stub);

    if (coll.registros.length === 1) {
      var orphanId = str(coll.registros[0].patientEpisodeId);
      if (orphanId !== episodeId) {
        coll = rebindRegistroEpisodeId(coll, orphanId || LOCAL_EPISODE_ID, episodeId);
      }
    }

    return {
      collection: coll,
      patientEpisodes: episodes,
      episodesChanged: true,
    };
  }

  function registroHasContent(registro) {
    if (!registro || !registro.snap) return false;
    var api = getSyncPayloadApi();
    if (api && api.slimPassometro) {
      return !!api.slimPassometro(registro.snap);
    }
    var snap = registro.snap;
    return !!(
      (Array.isArray(snap.entries) && snap.entries.length) ||
      (snap.header && Object.keys(snap.header).some(function (k) {
        return str(snap.header[k]);
      }))
    );
  }

  function hasPassometroContent(collection) {
    var coll = normalizeCollection(collection);
    for (var i = 0; i < coll.registros.length; i++) {
      if (registroHasContent(coll.registros[i])) return true;
    }
    return false;
  }

  function mergeCollections(localRaw, cloudRaw, patientEpisodesSnap) {
    var localNorm = normalizePassometroDomain(localRaw, patientEpisodesSnap);
    var cloudNorm = normalizePassometroDomain(cloudRaw, patientEpisodesSnap);
    var merged = normalizeCollection(localNorm.collection);
    var patientEpisodes =
      localNorm.episodesChanged
        ? localNorm.patientEpisodes
        : cloudNorm.episodesChanged
          ? cloudNorm.patientEpisodes
          : null;
    var episodesChanged = !!(localNorm.episodesChanged || cloudNorm.episodesChanged);

    var localColl = localNorm.collection;
    var episodesForRebind =
      patientEpisodesSnap ||
      cloudNorm.patientEpisodes ||
      localNorm.patientEpisodes;
    var activeEp = findActiveHospitalizationEpisode(episodesForRebind);
    if (activeEp && findRegistro(localColl, LOCAL_EPISODE_ID)) {
      localColl = rebindRegistroEpisodeId(
        localColl,
        LOCAL_EPISODE_ID,
        activeEp.id,
      );
    }

    var byId = Object.create(null);
    for (var ci = 0; ci < cloudNorm.collection.registros.length; ci++) {
      var cr = cloudNorm.collection.registros[ci];
      byId[cr.patientEpisodeId] = cr;
    }
    for (var li = 0; li < localColl.registros.length; li++) {
      var lr = localColl.registros[li];
      var prev = byId[lr.patientEpisodeId];
      if (!prev) {
        byId[lr.patientEpisodeId] = lr;
        continue;
      }
      var localTs = lr.atualizadoEm || 0;
      var cloudTs = prev.atualizadoEm || 0;
      byId[lr.patientEpisodeId] = localTs >= cloudTs ? lr : prev;
    }
    var registros = Object.keys(byId).map(function (k) {
      return byId[k];
    });
    merged.registros = registros;
    merged.atualizadoEm = nowMs();
    return {
      collection: merged,
      patientEpisodes: patientEpisodes,
      episodesChanged: episodesChanged,
    };
  }

  var LOCAL_EPISODE_ID = "pe-local";

  function rebindRegistroEpisodeId(collection, fromId, toId) {
    var from = str(fromId);
    var to = str(toId);
    if (!from || !to || from === to) {
      return normalizeCollection(collection);
    }
    var coll = normalizeCollection(collection);
    var source = findRegistro(coll, from);
    if (!source) return coll;
    var target = findRegistro(coll, to);
    if (target) {
      var mergedSnap =
        (source.atualizadoEm || 0) >= (target.atualizadoEm || 0)
          ? source.snap
          : target.snap;
      var registros = coll.registros.filter(function (r) {
        return r.patientEpisodeId !== from && r.patientEpisodeId !== to;
      });
      registros.push({
        patientEpisodeId: to,
        snap: mergedSnap,
        atualizadoEm: Math.max(source.atualizadoEm || 0, target.atualizadoEm || 0),
      });
      return {
        version: VERSION,
        registros: registros,
        atualizadoEm: nowMs(),
      };
    }
    var rebound = coll.registros.map(function (r) {
      if (r.patientEpisodeId !== from) return r;
      return {
        patientEpisodeId: to,
        snap: r.snap,
        atualizadoEm: r.atualizadoEm,
      };
    });
    return {
      version: VERSION,
      registros: rebound,
      atualizadoEm: nowMs(),
    };
  }

  function listHospitalizationRegistros(collection, patientEpisodesSnap) {
    var pe = getPatientEpisodesSchema();
    var coll = normalizeCollection(collection);
    if (!pe) return coll.registros;
    var snap = pe.normalizeSnapshot(patientEpisodesSnap || pe.emptySnapshot());
    var episodesById = Object.create(null);
    for (var i = 0; i < snap.entries.length; i++) {
      var e = snap.entries[i];
      if (!e.deletedAt) episodesById[e.id] = e;
    }
    return coll.registros
      .filter(function (r) {
        var ep = episodesById[r.patientEpisodeId];
        return ep && ep.kind === "hospitalization";
      })
      .map(function (r) {
        return {
          registro: r,
          episode: episodesById[r.patientEpisodeId],
        };
      });
  }

  function resolveAnySnapFromDomain(raw, patientEpisodesSnap) {
    var norm = normalizePassometroDomain(raw, patientEpisodesSnap);
    var episodes = patientEpisodesSnap || norm.patientEpisodes;
    var active = resolveActiveSnap(norm.collection, episodes);
    if (active) return active;
    var coll = normalizeCollection(norm.collection);
    if (!coll.registros.length) return null;
    var best = coll.registros[0];
    for (var i = 1; i < coll.registros.length; i++) {
      if ((coll.registros[i].atualizadoEm || 0) > (best.atualizadoEm || 0)) {
        best = coll.registros[i];
      }
    }
    return best.snap;
  }

  /**
   * Sincroniza diagnósticos/meta do header de cada registro para o episódio correspondente (leitura hub).
   * @returns {{ patientEpisodes: object, episodesChanged: boolean }}
   */
  function syncPatientEpisodesFromCollection(collection, patientEpisodesSnap) {
    var bridge = getEpisodesBridge();
    var pe = getPatientEpisodesSchema();
    var coll = normalizeCollection(collection);
    var episodes = pe
      ? pe.normalizeSnapshot(patientEpisodesSnap || pe.emptySnapshot())
      : patientEpisodesSnap || { version: 1, entries: [], atualizadoEm: null };
    if (!bridge || !bridge.syncPassometroHeaderToEpisode) {
      return { patientEpisodes: episodes, episodesChanged: false };
    }
    var episodesChanged = false;
    for (var ri = 0; ri < coll.registros.length; ri++) {
      var reg = coll.registros[ri];
      var episodeId = str(reg.patientEpisodeId);
      var header = reg.snap && reg.snap.header ? reg.snap.header : null;
      if (!episodeId || !header) continue;
      var sync = bridge.syncPassometroHeaderToEpisode(
        episodes,
        episodeId,
        header,
      );
      if (sync && sync.changed) {
        episodes = sync.snapshot;
        episodesChanged = true;
      }
    }
    return { patientEpisodes: episodes, episodesChanged: episodesChanged };
  }

  return {
    VERSION: VERSION,
    emptyCollection: emptyCollection,
    normalizeCollection: normalizeCollection,
    normalizePassometroDomain: normalizePassometroDomain,
    isLegacySnapV1: isLegacySnapV1,
    findRegistro: findRegistro,
    findActiveHospitalizationEpisode: findActiveHospitalizationEpisode,
    ensureRegistroForEpisode: ensureRegistroForEpisode,
    upsertRegistro: upsertRegistro,
    resolveSnapForEpisode: resolveSnapForEpisode,
    resolveActiveSnap: resolveActiveSnap,
    resolveViewSnap: resolveViewSnap,
    isPassometroEditable: isPassometroEditable,
    canEditPassometroForEpisode: canEditPassometroForEpisode,
    bootstrapHospitalizationContext: bootstrapHospitalizationContext,
    hasPassometroContent: hasPassometroContent,
    mergeCollections: mergeCollections,
    listHospitalizationRegistros: listHospitalizationRegistros,
    rebindRegistroEpisodeId: rebindRegistroEpisodeId,
    LOCAL_EPISODE_ID: LOCAL_EPISODE_ID,
    emptySnapForEpisode: emptySnapForEpisode,
    migrateLegacySnapToCollection: migrateLegacySnapToCollection,
    syncPatientEpisodesFromCollection: syncPatientEpisodesFromCollection,
    resolveAnySnapFromDomain: resolveAnySnapFromDomain,
  };
});
