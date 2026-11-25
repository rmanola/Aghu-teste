/**
 * Migra chaves legadas (prontuario_nome) para prontuário-only e remapeia sync meta.
 */
(function () {
  "use strict";

  var MIGRATE_FLAG = "aghu_patient_migrate_v3_done";

  function identity() {
    return window.AghuPatientIdentity;
  }

  function canonicalKeyFromMeta(meta) {
    var id = identity();
    if (!id || !meta) return null;
    return id.buildPatientKey(meta.prontuario) || meta.patientKey || null;
  }

  async function migrateIndex(indexKey, recordPrefix, mergeRecord) {
    var got = await browser.storage.local.get(indexKey);
    var idx = got[indexKey];
    if (!idx || !Array.isArray(idx.entries)) return;

    var id = identity();
    if (!id) return;

    var byPront = {};
    for (var i = 0; i < idx.entries.length; i++) {
      var e = idx.entries[i];
      var canon = canonicalKeyFromMeta(e);
      if (!canon) continue;
      if (!byPront[canon]) byPront[canon] = [];
      byPront[canon].push(e);
    }

    var newEntries = [];
    var keysToRemove = [];

    for (var pront in byPront) {
      if (!Object.prototype.hasOwnProperty.call(byPront, pront)) continue;
      var group = byPront[pront];
      group.sort(function (a, b) {
        return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
      });
      var head = group[0];
      var mergedMeta = {
        patientKey: pront,
        primeiroNome: head.primeiroNome || "",
        nomeCompleto: head.nomeCompleto || "",
        prontuario: id.normalizeProntuario(head.prontuario) || pront,
        atualizadoEm: head.atualizadoEm || Date.now(),
      };
      newEntries.push(mergedMeta);

      var canonRec = null;
      for (var g = 0; g < group.length; g++) {
        var legacyKey = group[g].patientKey;
        if (!legacyKey) continue;
        var rk = recordPrefix + legacyKey;
        var part = got[rk];
        if (!part && g === 0) {
          var fetchOne = await browser.storage.local.get(rk);
          part = fetchOne[rk];
        }
        if (part && mergeRecord) {
          canonRec = mergeRecord(canonRec, part, pront);
        }
        if (legacyKey !== pront) keysToRemove.push(rk);
      }

      if (mergeRecord && canonRec) {
        canonRec.patientKey = pront;
        canonRec.prontuario = mergedMeta.prontuario;
        var canonRk = recordPrefix + pront;
        var payload = {};
        payload[canonRk] = canonRec;
        await browser.storage.local.set(payload);
      }
    }

    newEntries.sort(function (a, b) {
      return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
    });

    var idxPayload = {};
    idxPayload[indexKey] = { entries: newEntries };
    await browser.storage.local.set(idxPayload);

    if (keysToRemove.length) {
      await browser.storage.local.remove(keysToRemove);
    }
  }

  function mergePatientRecords(prev, next, pront) {
    if (!next) return prev;
    if (!prev) {
      var out = Object.assign({}, next);
      out.patientKey = pront;
      return out;
    }
    if (!prev.examsByKey) prev.examsByKey = {};
    if (next.examsByKey) {
      var keys = Object.keys(next.examsByKey);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!prev.examsByKey[k]) prev.examsByKey[k] = next.examsByKey[k];
      }
    }
    prev.primeiroNome = prev.primeiroNome || next.primeiroNome;
    prev.nomeCompleto =
      (prev.nomeCompleto || "").length >= (next.nomeCompleto || "").length
        ? prev.nomeCompleto
        : next.nomeCompleto;
    prev.atualizadoEm = Math.max(prev.atualizadoEm || 0, next.atualizadoEm || 0);
    return prev;
  }

  function mergeControlesRecords(prev, next, pront) {
    if (!next) return prev;
    var api = window.AghuSupabaseSyncPayload;
    if (api && api.mergeControlesEntries) {
      return Object.assign(
        {},
        api.mergeControlesEntries(prev, next),
        { patientKey: pront, prontuario: next.prontuario || (prev && prev.prontuario) },
      );
    }
    return next || prev;
  }

  function mergeGenericSnap(prev, next, pront) {
    if (!next) return prev;
    if (!prev) return Object.assign({}, next, { patientKey: pront });
    return Object.assign({}, prev, next, {
      patientKey: pront,
      atualizadoEm: Math.max(prev.atualizadoEm || 0, next.atualizadoEm || 0),
    });
  }

  async function migrateSyncMeta() {
    var id = identity();
    if (!id) return;
    var got = await browser.storage.local.get("aghu_sync_meta_v1");
    var map = got.aghu_sync_meta_v1;
    if (!map || typeof map !== "object") map = {};

    var byPront = {};
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var pk = keys[i];
      var entry = map[pk] || {};
      var pront =
        id.normalizeProntuario(entry.prontuario) ||
        id.normalizeProntuario(pk);
      if (!id.isValidProntuarioForIdentity(pront)) continue;
      if (!byPront[pront]) byPront[pront] = entry;
      else {
        byPront[pront].lastSyncedAt = Math.max(
          byPront[pront].lastSyncedAt || 0,
          entry.lastSyncedAt || 0,
        );
      }
    }

    var newMap = {};
    for (var p in byPront) {
      if (!Object.prototype.hasOwnProperty.call(byPront, p)) continue;
      var recordId = await id.recordClientIdFromProntuario(p);
      newMap[p] = {
        patientKey: p,
        prontuario: p,
        recordClientId: recordId,
        lastSyncedAt: byPront[p].lastSyncedAt || null,
        lastError: byPront[p].lastError || null,
      };
    }

    var payload = {};
    payload.aghu_sync_meta_v1 = newMap;
    await browser.storage.local.set(payload);
  }

  async function runPatientStorageMigration() {
    var id = identity();
    if (!id) return { ok: false, reason: "no_identity" };

    var flagGot = await browser.storage.local.get(MIGRATE_FLAG);
    if (flagGot[MIGRATE_FLAG]) return { ok: true, skipped: true };

    await migrateIndex(
      "aghu_patient_index_v1",
      "aghu_patient_v1_",
      mergePatientRecords,
    );
    await migrateIndex(
      "aghu_controles_index_v1",
      "aghu_controles_v1_",
      mergeControlesRecords,
    );
    await migrateIndex(
      "aghu_prescricao_index_v1",
      "aghu_prescricao_v1_",
      mergeGenericSnap,
    );
    await migrateIndex(
      "aghu_passometro_index_v1",
      "aghu_passometro_v1_",
      mergeGenericSnap,
    );
    await migrateSyncMeta();

    var done = {};
    done[MIGRATE_FLAG] = true;
    await browser.storage.local.set(done);
    return { ok: true, skipped: false };
  }

  window.AghuPatientStorageMigrate = {
    MIGRATE_FLAG: MIGRATE_FLAG,
    runPatientStorageMigration: runPatientStorageMigration,
  };
})();
