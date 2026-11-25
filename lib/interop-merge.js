/**
 * Merge canónico → payload parcial sync v8 (FEAT-138).
 * Domínios omitidos não apagam ciphertext existente (mesma semântica que encrypt-and-upsert).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuInteropMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var syncPayloadApi = null;
  var episodesApi = null;
  var examMergeKeyApi = null;
  var prescricoesApi = null;

  /**
   * Resolve um módulo irmão por `require` (Node/testes) e, em falha, pelo
   * global UMD (`globalThis.<globalName>`). O bundle Edge (Deno) define
   * `module` mas não `require` — sem o fallback global, todos estes getters
   * devolviam null e os merges degradavam para "incoming substitui existente",
   * apagando histórico clínico (HL7IN-AC-02 / FHIRIN-AC-03).
   */
  function resolveApi(globalName, relPath) {
    if (typeof require === "function") {
      try {
        return require(relPath);
      } catch (_e) {
        /* Deno Edge / browser — cair para o global UMD */
      }
    }
    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : root;
    return (g && g[globalName]) || null;
  }

  function getSyncPayloadApi() {
    if (syncPayloadApi) return syncPayloadApi;
    syncPayloadApi = resolveApi("AghuSupabaseSyncPayload", "./supabase-sync-payload.js");
    return syncPayloadApi;
  }

  function getEpisodesApi() {
    if (episodesApi) return episodesApi;
    episodesApi = resolveApi("AghuPatientEpisodesSchema", "./patient-episodes-schema.js");
    return episodesApi;
  }

  function getExamMergeKeyApi() {
    if (examMergeKeyApi) return examMergeKeyApi;
    examMergeKeyApi = resolveApi("AghuExamMergeKey", "./exam-merge-key.js");
    return examMergeKeyApi;
  }

  function getPrescricoesApi() {
    if (prescricoesApi) return prescricoesApi;
    prescricoesApi = resolveApi("AghuPrescricoesNormalize", "./prescricoes-normalize.js");
    return prescricoesApi;
  }

  var ARCHIVE_SCHEMA_VERSION = 8;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function nowMs() {
    return Date.now();
  }

  function episodeToEntry(episode, patientKey) {
    if (!episode || typeof episode !== "object") return null;
    var id = str(episode.id) || str(episode.externalId);
    if (!id) return null;
    if (id.indexOf("pe-") !== 0) {
      id = "interop-" + id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    }
    return {
      id: id,
      label: str(episode.label) || str(episode.location) || "Internação",
      startedAt: str(episode.startedAt) || new Date().toISOString().slice(0, 10),
      endedAt: episode.endedAt ? str(episode.endedAt) : null,
      status: str(episode.status) === "closed" ? "closed" : "active",
      kind: str(episode.kind) || "hospitalization",
      notes: str(episode.notes),
      diagnoses: Array.isArray(episode.diagnoses) ? episode.diagnoses : [],
      complications: [],
      death: { occurred: false, date: null },
      icuAdmissions: [],
      patientKey: patientKey,
    };
  }

  function buildPatientEpisodesSnap(episode, patientKey, existingSnap) {
    var api = getEpisodesApi();
    if (!api || !api.upsertEntry) {
      // Fallback sem o schema de episódios: ainda assim acumular sobre
      // `existingSnap`, senão o último episódio apagaria os anteriores.
      var prior =
        existingSnap && Array.isArray(existingSnap.entries)
          ? existingSnap.entries
          : [];
      return {
        version: 1,
        entries: prior.concat([episodeToEntry(episode, patientKey)].filter(Boolean)),
        atualizadoEm: new Date().toISOString(),
      };
    }
    var entry = episodeToEntry(episode, patientKey);
    if (!entry) return null;
    var base = existingSnap || api.emptySnapshot();
    return api.upsertEntry(base, entry);
  }

  function buildExamsSnap(examResults) {
    var keyApi = getExamMergeKeyApi();
    var syncApi = getSyncPayloadApi();
    var examsByKey = {};
    var list = Array.isArray(examResults) ? examResults : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || typeof row !== "object") continue;
      var exam = {
        examName: str(row.examName) || "Exame",
        dataColetaISO: str(row.dataColetaISO) || "nodate",
        solicitation: str(row.solicitation),
        sample: str(row.sample),
        resultado: str(row.resultado),
        unidade: str(row.unidade),
        referencia: str(row.referencia),
        flag: str(row.flag),
      };
      var key =
        keyApi && keyApi.examMergeKey
          ? keyApi.examMergeKey(exam)
          : exam.dataColetaISO + "|" + exam.solicitation + "|" + exam.examName;
      examsByKey[key] = exam;
    }
    if (!Object.keys(examsByKey).length) return null;
    return { examsByKey: examsByKey, atualizadoEm: nowMs() };
  }

  function buildControlesSnap(vitalEntry) {
    var texto = str(vitalEntry.texto);
    if (!texto) return null;
    var entry = {
      id: str(vitalEntry.id),
      texto: texto,
      periodo: str(vitalEntry.periodo) || new Date().toLocaleString("pt-BR"),
      n: typeof vitalEntry.n === "number" ? vitalEntry.n : 0,
      extractedAt: nowMs(),
    };
    return { entries: [entry], atualizadoEm: nowMs() };
  }

  function buildPrescricoesSnap(prescription, patientKey) {
    var api = getPrescricoesApi();
    var entry = {
      data: str(prescription.data) || new Date().toLocaleDateString("pt-BR"),
      dieta: str(prescription.dieta),
      hidratacao: Array.isArray(prescription.hidratacao)
        ? prescription.hidratacao
        : prescription.medication
          ? [str(prescription.medication)]
          : [],
      analgesia: Array.isArray(prescription.analgesia) ? prescription.analgesia : [],
      antibiotico: Array.isArray(prescription.antibiotico)
        ? prescription.antibiotico
        : [],
      texto: str(prescription.texto) || str(prescription.medication),
      extractedAt: nowMs(),
      patientKey: patientKey,
    };
    if (api && api.normalizePrescricaoEntry) {
      entry = api.normalizePrescricaoEntry(entry);
    }
    if (!entry) return null;
    return { entries: [entry], atualizadoEm: nowMs() };
  }

  /**
   * INTCOR-AC-02 — payload parcial: só domínios presentes no evento canónico.
   */
  function canonicalEventToPartialPayload(event) {
    if (!event || typeof event !== "object") return null;
    var out = {
      record_client_id: event.recordClientId,
      archive_schema_version: ARCHIVE_SCHEMA_VERSION,
      pii: event.pii,
    };
    var touched = ["pii"];
    var i;

    // `episode` (HL7, singular) e `episodes` (Bundle FHIR, plural) convergem
    // aqui — cada entrada é feita upsert na mesma snapshot, em vez de a última
    // substituir as anteriores (FHIRIN-AC-05).
    var episodeList = [];
    if (event.episode) episodeList.push(event.episode);
    if (Array.isArray(event.episodes)) {
      episodeList = episodeList.concat(event.episodes);
    }
    if (episodeList.length) {
      var episodesSnap = null;
      for (i = 0; i < episodeList.length; i++) {
        episodesSnap = buildPatientEpisodesSnap(
          episodeList[i],
          event.patientKey,
          episodesSnap,
        );
      }
      if (episodesSnap) {
        out.patient_episodes = episodesSnap;
        touched.push("patient_episodes");
      }
    }
    if (event.examResults && event.examResults.length) {
      var exams = buildExamsSnap(event.examResults);
      if (exams) {
        out.exams = exams;
        touched.push("exams");
      }
    }
    var prescriptionList = [];
    if (event.prescription) prescriptionList.push(event.prescription);
    if (Array.isArray(event.prescriptions)) {
      prescriptionList = prescriptionList.concat(event.prescriptions);
    }
    if (prescriptionList.length) {
      var prescEntries = [];
      for (i = 0; i < prescriptionList.length; i++) {
        var presc = buildPrescricoesSnap(prescriptionList[i], event.patientKey);
        if (presc && Array.isArray(presc.entries)) {
          prescEntries = prescEntries.concat(presc.entries);
        }
      }
      if (prescEntries.length) {
        out.prescricoes = { entries: prescEntries, atualizadoEm: nowMs() };
        touched.push("prescricoes");
      }
    }
    if (event.vitalEntry) {
      var controles = buildControlesSnap(event.vitalEntry);
      if (controles) {
        out.controles = controles;
        touched.push("controles");
      }
    }
    return { payload: out, touchedDomains: touched };
  }

  function mergeExamsPayload(existing, incoming) {
    var syncApi = getSyncPayloadApi();
    if (syncApi && syncApi.mergeExamsArchives && existing && incoming) {
      return syncApi.mergeExamsArchives(existing, incoming);
    }
    if (!existing) return incoming;
    if (!incoming) return existing;
    var merged = Object.assign({}, existing.examsByKey || {}, incoming.examsByKey || {});
    return {
      examsByKey: merged,
      atualizadoEm: Math.max(
        existing.atualizadoEm || 0,
        incoming.atualizadoEm || 0,
      ),
    };
  }

  function mergePrescricoesPayload(existing, incoming) {
    var syncApi = getSyncPayloadApi();
    if (syncApi && syncApi.mergePrescricoesEntries && existing && incoming) {
      return syncApi.mergePrescricoesEntries(existing, incoming);
    }
    if (!existing) return incoming;
    if (!incoming) return existing;
    return {
      entries: (existing.entries || []).concat(incoming.entries || []),
      atualizadoEm: Math.max(
        existing.atualizadoEm || 0,
        incoming.atualizadoEm || 0,
      ),
    };
  }

  function mergePatientEpisodesPayload(existing, incoming) {
    var api = getEpisodesApi();
    if (!incoming) return existing;
    if (!existing) return incoming;
    if (!api || !api.upsertEntry) {
      return incoming;
    }
    var snap = api.normalizeSnapshot(existing);
    var entries = Array.isArray(incoming.entries) ? incoming.entries : [];
    for (var i = 0; i < entries.length; i++) {
      snap = api.upsertEntry(snap, entries[i]);
    }
    return snap;
  }

  /**
   * INTCOR-AC-03 — funde payloads parciais sem sobrescrever domínios omitidos no segundo.
   */
  function mergePartialSyncPayloads(base, incoming) {
    if (!base) return incoming ? Object.assign({}, incoming) : null;
    if (!incoming) return Object.assign({}, base);
    var out = {
      record_client_id: incoming.record_client_id || base.record_client_id,
      archive_schema_version:
        incoming.archive_schema_version || base.archive_schema_version || ARCHIVE_SCHEMA_VERSION,
    };
    if (incoming.pii) out.pii = incoming.pii;
    else if (base.pii) out.pii = base.pii;

    if (incoming.exams !== undefined) {
      out.exams = mergeExamsPayload(base.exams, incoming.exams);
    } else if (base.exams !== undefined) {
      out.exams = base.exams;
    }

    if (incoming.patient_episodes !== undefined) {
      out.patient_episodes = mergePatientEpisodesPayload(
        base.patient_episodes,
        incoming.patient_episodes,
      );
    } else if (base.patient_episodes !== undefined) {
      out.patient_episodes = base.patient_episodes;
    }

    if (incoming.prescricoes !== undefined) {
      out.prescricoes = mergePrescricoesPayload(base.prescricoes, incoming.prescricoes);
    } else if (base.prescricoes !== undefined) {
      out.prescricoes = base.prescricoes;
    }

    if (incoming.controles !== undefined) out.controles = incoming.controles;
    else if (base.controles !== undefined) out.controles = base.controles;

    return out;
  }

  /**
   * Funde múltiplos eventos canónicos (mesmo paciente) antes do upsert.
   */
  function mergeCanonicalEvents(events) {
    if (!Array.isArray(events) || !events.length) return null;
    var mergedPayload = null;
    var touched = [];
    for (var i = 0; i < events.length; i++) {
      var part = canonicalEventToPartialPayload(events[i]);
      if (!part) continue;
      mergedPayload = mergePartialSyncPayloads(mergedPayload, part.payload);
      touched = touched.concat(part.touchedDomains);
    }
    if (!mergedPayload) return null;
    var seen = {};
    var uniqueTouched = [];
    for (var j = 0; j < touched.length; j++) {
      if (!seen[touched[j]]) {
        seen[touched[j]] = true;
        uniqueTouched.push(touched[j]);
      }
    }
    return { payload: mergedPayload, touchedDomains: uniqueTouched };
  }

  return {
    ARCHIVE_SCHEMA_VERSION: ARCHIVE_SCHEMA_VERSION,
    canonicalEventToPartialPayload: canonicalEventToPartialPayload,
    mergePartialSyncPayloads: mergePartialSyncPayloads,
    mergeCanonicalEvents: mergeCanonicalEvents,
    buildExamsSnap: buildExamsSnap,
    buildPatientEpisodesSnap: buildPatientEpisodesSnap,
    buildPrescricoesSnap: buildPrescricoesSnap,
    buildControlesSnap: buildControlesSnap,
  };
});
