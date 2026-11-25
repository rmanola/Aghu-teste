/**
 * Histórico local de prescrições por paciente (primeiro nome + prontuário).
 * v2: entries[] por janela de validade (sem cap de entradas).
 */
(function () {
  "use strict";

  var PREFIX = "aghu_prescricao_v1_";
  var INDEX_KEY = "aghu_prescricao_index_v1";
  var LAST_KEY = "aghu_last_prescricao_patient_key";
  var SCHEMA_VERSION = 2;
  var MAX_INDEX_ENTRIES = 48;
  var MAX_RECORD_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  function getNormApi() {
    if (typeof window !== "undefined" && window.AghuPrescricoesNormalize) {
      return window.AghuPrescricoesNormalize;
    }
    return null;
  }

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

  function normalizeEntry(raw) {
    var api = getNormApi();
    if (api && api.normalizePrescricaoEntry) {
      return api.normalizePrescricaoEntry(raw);
    }
    if (!raw || typeof raw !== "object") return null;
    return {
      id: raw.id || newEntryId(),
      validadeInicial: raw.validadeInicial || "",
      validadeFinal: raw.validadeFinal || "",
      data: raw.data || "",
      dieta: raw.dieta || "",
      hidratacao: Array.isArray(raw.hidratacao) ? raw.hidratacao.slice() : [],
      analgesia: Array.isArray(raw.analgesia) ? raw.analgesia.slice() : [],
      antibiotico: Array.isArray(raw.antibiotico) ? raw.antibiotico.slice() : [],
      categoriasMedicamento:
        raw.categoriasMedicamento &&
        typeof raw.categoriasMedicamento === "object" &&
        !Array.isArray(raw.categoriasMedicamento)
          ? raw.categoriasMedicamento
          : {},
      texto: raw.texto || "",
      extractedAt:
        typeof raw.extractedAt === "number"
          ? raw.extractedAt
          : typeof raw.atualizadoEm === "number"
            ? raw.atualizadoEm
            : Date.now(),
    };
  }

  function buildValidadeKey(entry) {
    var api = getNormApi();
    if (api && api.buildValidadeKey) {
      return api.buildValidadeKey(entry);
    }
    var vi = String((entry && entry.validadeInicial) || "").trim();
    var vf = String((entry && entry.validadeFinal) || "").trim();
    if (vi || vf) return "v:" + vi + "|" + vf;
    return "d:" + String((entry && entry.data) || "").trim();
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
    } else if (
      rec.dieta != null ||
      rec.data != null ||
      rec.texto != null ||
      rec.validadeInicial != null ||
      rec.validadeFinal != null
    ) {
      var legacy = normalizeEntry({
        id: rec.id || newEntryId(),
        validadeInicial: rec.validadeInicial || "",
        validadeFinal: rec.validadeFinal || "",
        data: rec.data || "",
        dieta: rec.dieta || "",
        hidratacao: rec.hidratacao,
        analgesia: rec.analgesia,
        antibiotico: rec.antibiotico,
        texto: rec.texto || "",
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
      entries: entries,
      atualizadoEm: rec.atualizadoEm || Date.now(),
    };
  }

  function latestEntry(rec) {
    var api = getNormApi();
    if (api && api.getLatestPrescricaoEntry) {
      return api.getLatestPrescricaoEntry(rec);
    }
    if (!rec || !Array.isArray(rec.entries) || !rec.entries.length) return null;
    var sorted = rec.entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
    return sorted[0];
  }

  function attachLatestFlatFields(rec) {
    var latest = latestEntry(rec);
    if (latest) {
      rec.data = latest.data || "";
      rec.dieta = latest.dieta || "";
      rec.hidratacao = Array.isArray(latest.hidratacao) ? latest.hidratacao.slice() : [];
      rec.analgesia = Array.isArray(latest.analgesia) ? latest.analgesia.slice() : [];
      rec.antibiotico = Array.isArray(latest.antibiotico) ? latest.antibiotico.slice() : [];
      rec.categoriasMedicamento =
        latest.categoriasMedicamento &&
        typeof latest.categoriasMedicamento === "object"
          ? latest.categoriasMedicamento
          : {};
      rec.texto = latest.texto || "";
      rec.validadeInicial = latest.validadeInicial || "";
      rec.validadeFinal = latest.validadeFinal || "";
    } else {
      rec.data = "";
      rec.dieta = "";
      rec.hidratacao = [];
      rec.analgesia = [];
      rec.antibiotico = [];
      rec.categoriasMedicamento = {};
      rec.texto = "";
      rec.validadeInicial = "";
      rec.validadeFinal = "";
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

  function getRxDateWindowApi() {
    if (typeof window !== "undefined" && window.AghuPrescricaoDateWindow) {
      return window.AghuPrescricaoDateWindow;
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPrescricaoDateWindow) {
      return globalThis.AghuPrescricaoDateWindow;
    }
    return null;
  }

  /**
   * @param {object} meta patientKey, primeiroNome, nomeCompleto?, prontuario
   * @param {object} data campos da prescrição + texto
   * @param {object} [opts]
   */
  async function savePrescricaoSnapshot(meta, data, opts) {
    if (!meta || !meta.patientKey || !data) return;
    await savePrescricaoEntries(meta, [data], opts);
  }

  /**
   * Grava várias entradas (janelas de validade) num único persist.
   * opts.mode === "window_overwrite" + dateFrom/dateTo → remove entries
   * na janela clínica 16:00→15:59 antes do upsert.
   * @param {object} meta
   * @param {Array<object>} entriesList
   * @param {{ mode?: string, dateFrom?: string|null, dateTo?: string|null }} [opts]
   */
  async function savePrescricaoEntries(meta, entriesList, opts) {
    if (!meta || !meta.patientKey || !Array.isArray(entriesList) || !entriesList.length) {
      return;
    }
    opts = opts || {};

    var existing = await loadPrescricaoSnapshot(meta.patientKey);
    var rec =
      existing ||
      migrateRecordToV2({
        patientKey: meta.patientKey,
        primeiroNome: meta.primeiroNome,
        nomeCompleto: meta.nomeCompleto || "",
        prontuario: meta.prontuario,
        entries: [],
        atualizadoEm: Date.now(),
      });

    applyMetaIdentity(rec, meta);

    var entries = Array.isArray(rec.entries) ? rec.entries.slice() : [];

    if (
      opts.mode === "window_overwrite" &&
      (opts.dateFrom || opts.dateTo)
    ) {
      var win = getRxDateWindowApi();
      if (
        win &&
        win.prescricaoFilterRangeFromStrings &&
        win.filterEntriesByClinicalRange
      ) {
        var rangeOrErr = win.prescricaoFilterRangeFromStrings(
          opts.dateFrom,
          opts.dateTo
        );
        if (
          rangeOrErr &&
          !rangeOrErr.error &&
          typeof rangeOrErr.fromMs === "number"
        ) {
          var kept = [];
          for (var ki = 0; ki < entries.length; ki++) {
            var existingEntry = entries[ki];
            var inWindow = win
              .filterEntriesByClinicalRange([existingEntry], rangeOrErr)
              .length;
            if (!inWindow) kept.push(existingEntry);
          }
          entries = kept;
        }
      }
    }

    for (var j = 0; j < entriesList.length; j++) {
      var data = entriesList[j];
      if (!data) continue;
      var validadeKey = buildValidadeKey(data);
      var newEntry = normalizeEntry(
        Object.assign({}, data, {
          id: newEntryId(),
          extractedAt: Date.now(),
        }),
      );
      if (!newEntry) continue;

      var replaced = false;
      for (var i = 0; i < entries.length; i++) {
        if (buildValidadeKey(entries[i]) === validadeKey) {
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

  async function loadPrescricaoSnapshot(patientKey) {
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
      raw.dieta != null;
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

  window.AghuPrescricaoArchive = {
    PREFIX: PREFIX,
    INDEX_KEY: INDEX_KEY,
    LAST_KEY: LAST_KEY,
    savePrescricaoSnapshot: savePrescricaoSnapshot,
    savePrescricaoEntries: savePrescricaoEntries,
    loadPrescricaoSnapshot: loadPrescricaoSnapshot,
    listForSelect: listForSelect,
    pruneStale: pruneStale,
  };
})();
