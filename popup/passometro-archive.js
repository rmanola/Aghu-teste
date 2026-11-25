/**
 * Arquivo local do Passômetro por paciente (patientKey) — coleção v2 por episódio.
 */
(function () {
  "use strict";

  var PREFIX = "aghu_passometro_v1_";
  var INDEX_KEY = "aghu_passometro_index_v1";
  var LAST_KEY = "aghu_last_passometro_patient_key";
  var SCHEMA_VERSION = 2;
  var MAX_INDEX_ENTRIES = 48;
  var MAX_RECORD_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  function schemaApi() {
    return window.AghuPassometroSchema;
  }

  function collectionApi() {
    return window.AghuPassometroCollection;
  }

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  async function loadIndex() {
    var got = await browser.storage.local.get(INDEX_KEY);
    var idx = got[INDEX_KEY];
    if (!idx || !Array.isArray(idx.entries)) return { entries: [] };
    return idx;
  }

  async function saveIndex(entries) {
    var obj = {};
    obj[INDEX_KEY] = { entries: entries };
    await browser.storage.local.set(obj);
  }

  async function upsertIndex(meta) {
    var idx = await loadIndex();
    var list = idx.entries.filter(function (e) {
      return e.patientKey !== meta.patientKey;
    });
    list.unshift({
      patientKey: meta.patientKey,
      primeiroNome: meta.primeiroNome,
      nomeCompleto: meta.nomeCompleto || "",
      prontuario: meta.prontuario,
      atualizadoEm: Date.now(),
    });
    list.sort(function (a, b) {
      return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
    });
    if (list.length > MAX_INDEX_ENTRIES) {
      var dropped = list.splice(MAX_INDEX_ENTRIES);
      for (var i = 0; i < dropped.length; i++) {
        await browser.storage.local.remove(recordKey(dropped[i].patientKey));
      }
    }
    await saveIndex(list);
  }

  function pickPrimaryRegistro(collection) {
    var collApi = collectionApi();
    if (!collApi) return null;
    var coll = collApi.normalizeCollection(collection);
    if (!coll.registros.length) return null;
    var best = coll.registros[0];
    for (var i = 1; i < coll.registros.length; i++) {
      var r = coll.registros[i];
      if ((r.atualizadoEm || 0) > (best.atualizadoEm || 0)) best = r;
    }
    return best;
  }

  function recordToCollection(rec) {
    var collApi = collectionApi();
    if (!collApi) return null;
    if (rec.collection) {
      return collApi.normalizeCollection(rec.collection);
    }
    if (rec.header || rec.entries) {
      var migrated = collApi.migrateLegacySnapToCollection(
        {
          header: rec.header,
          entries: rec.entries,
          atualizadoEm: rec.atualizadoEm,
        },
        null,
      );
      return migrated.collection;
    }
    return collApi.emptyCollection();
  }

  async function loadPassometroCollection(patientKey) {
    if (!patientKey) return collectionApi() ? collectionApi().emptyCollection() : null;
    var k = recordKey(patientKey);
    var got = await browser.storage.local.get(k);
    var rec = got[k] || null;
    if (!rec) {
      return collectionApi() ? collectionApi().emptyCollection() : null;
    }
    return recordToCollection(rec);
  }

  /**
   * @param {object} meta patientKey, primeiroNome, nomeCompleto?, prontuario
   * @param {object} collection PassometroDomainV2
   */
  async function savePassometroCollection(meta, collection) {
    if (!meta || !meta.patientKey || !collection) return;
    var collApi = collectionApi();
    var coll = collApi
      ? collApi.normalizeCollection(collection)
      : collection;
    coll.atualizadoEm = Date.now();
    var rec = {
      version: SCHEMA_VERSION,
      patientKey: meta.patientKey,
      primeiroNome: meta.primeiroNome || "",
      nomeCompleto: meta.nomeCompleto || "",
      prontuario: meta.prontuario || "",
      collection: coll,
      atualizadoEm: coll.atualizadoEm,
    };
    var payload = {};
    payload[recordKey(meta.patientKey)] = rec;
    payload[LAST_KEY] = meta.patientKey;
    await browser.storage.local.set(payload);
    await upsertIndex(meta);
  }

  /**
   * @param {object} meta patientKey, primeiroNome, nomeCompleto?, prontuario
   * @param {object} snap header + entries + atualizadoEm? (episódio activo / local)
   */
  async function savePassometroSnapshot(meta, snap) {
    if (!meta || !meta.patientKey || !snap) return;
    var collApi = collectionApi();
    if (!collApi) {
      var norm = schemaApi() ? schemaApi().normalizeSnap(snap) : snap;
      norm.atualizadoEm = Date.now();
      var legacyRec = {
        version: 1,
        patientKey: meta.patientKey,
        primeiroNome: meta.primeiroNome || "",
        nomeCompleto: meta.nomeCompleto || "",
        prontuario: meta.prontuario || "",
        header: norm.header,
        entries: norm.entries,
        atualizadoEm: norm.atualizadoEm,
      };
      var legacyPayload = {};
      legacyPayload[recordKey(meta.patientKey)] = legacyRec;
      legacyPayload[LAST_KEY] = meta.patientKey;
      await browser.storage.local.set(legacyPayload);
      await upsertIndex(meta);
      return;
    }
    var collection = await loadPassometroCollection(meta.patientKey);
    var episodeId = collApi.LOCAL_EPISODE_ID;
    var primary = pickPrimaryRegistro(collection);
    if (primary) episodeId = primary.patientEpisodeId;
    var out = collApi.upsertRegistro(collection, episodeId, snap);
    await savePassometroCollection(meta, out.collection);
  }

  async function loadPassometroSnapshot(patientKey) {
    if (!patientKey) return null;
    var k = recordKey(patientKey);
    var got = await browser.storage.local.get(k);
    var rec = got[k] || null;
    if (!rec) return null;

    var collApi = collectionApi();
    if (collApi && (rec.collection || rec.version === SCHEMA_VERSION)) {
      var collection = recordToCollection(rec);
      var reg = pickPrimaryRegistro(collection);
      if (!reg) return null;
      var snap = reg.snap;
      if (schemaApi()) {
        snap = schemaApi().normalizeSnap(snap);
      }
      return Object.assign({}, rec, snap, {
        patientEpisodeId: reg.patientEpisodeId,
      });
    }

    if (schemaApi()) {
      var normLegacy = schemaApi().normalizeSnap({
        header: rec.header,
        entries: rec.entries,
        atualizadoEm: rec.atualizadoEm,
      });
      return Object.assign({}, rec, normLegacy);
    }
    return rec;
  }

  async function listForSelect() {
    var idx = await loadIndex();
    return idx.entries.slice();
  }

  async function pruneStale() {
    var idx = await loadIndex();
    var now = Date.now();
    var kept = [];
    var removedKeys = [];
    for (var i = 0; i < idx.entries.length; i++) {
      var e = idx.entries[i];
      if (e.atualizadoEm && now - e.atualizadoEm > MAX_RECORD_AGE_MS) {
        removedKeys.push(recordKey(e.patientKey));
      } else {
        kept.push(e);
      }
    }
    if (removedKeys.length) {
      await browser.storage.local.remove(removedKeys);
      await saveIndex(kept);
    }
  }

  window.AghuPassometroArchive = {
    PREFIX: PREFIX,
    INDEX_KEY: INDEX_KEY,
    LAST_KEY: LAST_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    savePassometroSnapshot: savePassometroSnapshot,
    loadPassometroSnapshot: loadPassometroSnapshot,
    savePassometroCollection: savePassometroCollection,
    loadPassometroCollection: loadPassometroCollection,
    listForSelect: listForSelect,
    pruneStale: pruneStale,
  };
})();
