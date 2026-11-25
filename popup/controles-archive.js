/**
 * Histórico local de texto de Controles por paciente (mesmo critério que exames:
 * primeiro nome + prontuário no texto da página).
 */
(function () {
  "use strict";

  var PREFIX = "aghu_controles_v1_";
  var INDEX_KEY = "aghu_controles_index_v1";
  var LAST_KEY = "aghu_last_controles_patient_key";
  var SCHEMA_VERSION = 3;
  var MAX_INDEX_ENTRIES = 48;
  var MAX_RECORD_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  function newEntryId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function parseN(value) {
    return typeof value === "number" ? value : parseInt(value, 10) || 0;
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var base = {
      id: raw.id || newEntryId(),
      texto: raw.texto || "",
      periodo: raw.periodo || "",
      n: parseN(raw.n),
      extractedAt:
        typeof raw.extractedAt === "number"
          ? raw.extractedAt
          : typeof raw.atualizadoEm === "number"
            ? raw.atualizadoEm
            : Date.now(),
    };
    if (
      typeof window !== "undefined" &&
      window.AghuControlesEntryVitals &&
      window.AghuControlesEntryVitals.enrichControlesEntry
    ) {
      return window.AghuControlesEntryVitals.enrichControlesEntry(
        Object.assign({}, base, { vitals: raw.vitals || null }),
      );
    }
    return base;
  }

  function migrateRecordToV2(rec) {
    if (!rec || typeof rec !== "object") return null;
    if (rec.version === SCHEMA_VERSION && Array.isArray(rec.entries)) {
      var enrichedEntries = [];
      for (var ei = 0; ei < rec.entries.length; ei++) {
        var ne = normalizeEntry(rec.entries[ei]);
        if (ne) enrichedEntries.push(ne);
      }
      rec.entries = enrichedEntries;
      return rec;
    }
    var entries = [];
    if (Array.isArray(rec.entries)) {
      for (var i = 0; i < rec.entries.length; i++) {
        var e = normalizeEntry(rec.entries[i]);
        if (e) entries.push(e);
      }
    } else if (rec.texto != null || rec.periodo != null || rec.n != null) {
      var legacy = normalizeEntry({
        id: rec.id || newEntryId(),
        texto: rec.texto || "",
        periodo: rec.periodo || "",
        n: rec.n,
        extractedAt: rec.atualizadoEm || Date.now(),
      });
      if (legacy) entries.push(legacy);
    }
    return {
      version: SCHEMA_VERSION,
      patientKey: rec.patientKey,
      primeiroNome: rec.primeiroNome || "",
      nomeCompleto: rec.nomeCompleto || "",
      prontuario: rec.prontuario || "",
      leito: rec.leito || "",
      entries: entries,
      atualizadoEm: rec.atualizadoEm || Date.now(),
    };
  }

  function latestEntry(rec) {
    if (!rec || !Array.isArray(rec.entries) || !rec.entries.length) return null;
    var sorted = rec.entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
    return sorted[0];
  }

  function attachLatestFlatFields(rec) {
    var latest = latestEntry(rec);
    if (latest) {
      rec.texto = latest.texto;
      rec.periodo = latest.periodo;
      rec.n = latest.n;
    } else {
      rec.texto = "";
      rec.periodo = "";
      rec.n = 0;
    }
    return rec;
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
      leito: meta.leito || "",
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

  function applyMetaIdentity(rec, meta) {
    var mergeApi =
      window.AghuPatientMetaMerge && window.AghuPatientMetaMerge.applyPatientIdentityToRecord;
    if (mergeApi) {
      return mergeApi(rec, meta);
    }
    rec.primeiroNome = meta.primeiroNome;
    rec.nomeCompleto = meta.nomeCompleto || rec.nomeCompleto || "";
    rec.prontuario = meta.prontuario;
    return rec;
  }

  /**
   * @param {object} meta patientKey, primeiroNome, nomeCompleto?, prontuario, leito?
   * @param {object} data texto, periodo, n
   */
  async function saveControlesSnapshot(meta, data) {
    if (!meta || !meta.patientKey || !data) return;
    await saveControlesEntries(meta, [data]);
  }

  /**
   * Grava várias entradas (janelas 24h) num único persist.
   * @param {object} meta
   * @param {Array<{ texto: string, periodo: string, n: number }>} entriesList
   */
  async function saveControlesEntries(meta, entriesList) {
    if (!meta || !meta.patientKey || !Array.isArray(entriesList) || !entriesList.length) {
      return;
    }

    var existing = await loadControlesSnapshot(meta.patientKey);
    var rec =
      existing ||
      migrateRecordToV2({
        patientKey: meta.patientKey,
        primeiroNome: meta.primeiroNome,
        nomeCompleto: meta.nomeCompleto || "",
        prontuario: meta.prontuario,
        leito: meta.leito || "",
        entries: [],
        atualizadoEm: Date.now(),
      });

    applyMetaIdentity(rec, meta);
    if (meta.leito) rec.leito = meta.leito;

    var entries = Array.isArray(rec.entries) ? rec.entries.slice() : [];

    for (var j = 0; j < entriesList.length; j++) {
      var data = entriesList[j];
      if (!data) continue;
      var periodo = data.periodo || "";
      var newEntry = normalizeEntry({
        id: newEntryId(),
        texto: data.texto || "",
        periodo: periodo,
        n: data.n,
        extractedAt: Date.now(),
      });
      if (!newEntry) continue;

      var replaced = false;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].periodo === periodo) {
          newEntry.id = entries[i].id || newEntry.id;
          entries[i] = newEntry;
          replaced = true;
          break;
        }
      }
      if (!replaced) entries.push(newEntry);
    }

    rec.entries = entries;
    rec.atualizadoEm = Date.now();
    rec.version = SCHEMA_VERSION;

    attachLatestFlatFields(rec);

    var payload = {};
    payload[recordKey(meta.patientKey)] = rec;
    payload[LAST_KEY] = meta.patientKey;
    await browser.storage.local.set(payload);
    await upsertIndex(meta);
  }

  async function loadControlesSnapshot(patientKey) {
    if (!patientKey) return null;
    var k = recordKey(patientKey);
    var got = await browser.storage.local.get(k);
    var raw = got[k];
    if (!raw) return null;

    var rec = migrateRecordToV2(raw);
    if (!rec) return null;

    var needsPersist =
      raw.version !== SCHEMA_VERSION ||
      !Array.isArray(raw.entries) ||
      raw.texto != null;
    if (needsPersist) {
      attachLatestFlatFields(rec);
      var persist = {};
      persist[k] = rec;
      await browser.storage.local.set(persist);
    }

    return attachLatestFlatFields(rec);
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

  window.AghuControlesArchive = {
    PREFIX: PREFIX,
    INDEX_KEY: INDEX_KEY,
    LAST_KEY: LAST_KEY,
    saveControlesSnapshot: saveControlesSnapshot,
    saveControlesEntries: saveControlesEntries,
    loadControlesSnapshot: loadControlesSnapshot,
    listForSelect: listForSelect,
    pruneStale: pruneStale,
  };
})();
