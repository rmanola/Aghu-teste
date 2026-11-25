/**
 * Sincronização cifrada com Supabase (encrypt-and-upsert).
 * Requer sessão Auth + lib/supabase-sync-payload.js carregado antes.
 */
(function () {
  "use strict";

  var SYNC_META_KEY = "aghu_sync_meta_v1";
  /** @type {Record<string, Promise<{ ok: boolean, reason?: string, httpStatus?: number }>>} */
  var syncInFlight = {};
  /** Motivo quando buildPayload aborta (ex.: leitura cloud falhou). */
  var lastPayloadBlockReason = null;

  var SYNC_NETWORK_TIMEOUT_MS = 30000;
  var SYNC_GLOBAL_TIMEOUT_MS = 60000;

  function withNetworkTimeout(promise, ms) {
    var nt = window.AghuNetworkTimeout;
    if (nt && nt.withNetworkTimeout) {
      return nt.withNetworkTimeout(promise, ms);
    }
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error("network_timeout"));
        }, ms);
      }),
    ]);
  }

  function payloadApi() {
    return window.AghuSupabaseSyncPayload;
  }

  async function loadSyncMetaMap() {
    var got = await browser.storage.local.get(SYNC_META_KEY);
    var m = got[SYNC_META_KEY];
    if (!m || typeof m !== "object") return {};
    return m;
  }

  async function saveSyncMetaMap(map) {
    var payload = {};
    payload[SYNC_META_KEY] = map;
    await browser.storage.local.set(payload);
  }

  function identityApi() {
    return window.AghuPatientIdentity;
  }

  function syncIdentityApi() {
    return window.AghuSyncPatientIdentity;
  }

  function syncIdentityDeps() {
    var id = identityApi();
    var deps = {
      identity: id,
      loadSyncMetaMap: loadSyncMetaMap,
      saveSyncMetaMap: saveSyncMetaMap,
      recordClientIdFromProntuario: function (prontuario) {
        return id.recordClientIdFromProntuario(prontuario);
      },
    };
    if (window.AghuPatientArchive && window.AghuPatientArchive.loadPatientRecord) {
      deps.loadPatientRecord = window.AghuPatientArchive.loadPatientRecord.bind(
        window.AghuPatientArchive,
      );
    }
    if (window.AghuControlesArchive && window.AghuControlesArchive.loadControlesSnapshot) {
      deps.loadControlesSnapshot = window.AghuControlesArchive.loadControlesSnapshot.bind(
        window.AghuControlesArchive,
      );
    }
    if (window.AghuPrescricaoArchive && window.AghuPrescricaoArchive.loadPrescricaoSnapshot) {
      deps.loadPrescricaoSnapshot = window.AghuPrescricaoArchive.loadPrescricaoSnapshot.bind(
        window.AghuPrescricaoArchive,
      );
    }
    if (window.AghuPassometroArchive && window.AghuPassometroArchive.loadPassometroSnapshot) {
      deps.loadPassometroSnapshot = window.AghuPassometroArchive.loadPassometroSnapshot.bind(
        window.AghuPassometroArchive,
      );
    }
    return deps;
  }

  /**
   * @param {string} patientKey
   * @returns {Promise<string | null>}
   */
  async function ensureRecordClientId(patientKey) {
    var api = syncIdentityApi();
    if (!api || !api.ensureRecordClientId) return null;
    return api.ensureRecordClientId(patientKey, syncIdentityDeps());
  }

  /**
   * @param {string} patientKey
   * @returns {Promise<{ recordClientId?: string, lastSyncedAt?: number, lastError?: string } | null>}
   */
  async function getSyncMeta(patientKey) {
    if (!patientKey) return null;
    var map = await loadSyncMetaMap();
    return map[patientKey] || null;
  }

  async function updateSyncMeta(patientKey, patch) {
    var map = await loadSyncMetaMap();
    map[patientKey] = Object.assign({}, map[patientKey] || {}, patch);
    await saveSyncMetaMap(map);
  }

  function cloudFetchApi() {
    return window.AghuSyncCloudFetch;
  }

  function cloudFetchDeps(accessToken, recordClientId, fields) {
    var cfg = window.AghuSupabaseConfig;
    var api = cloudFetchApi();
    var auth = window.AghuSupabaseAuth;
    if (!cfg || !cfg.isConfigured() || !api || !accessToken || !recordClientId) {
      return null;
    }
    var deps = {
      getUrl: function () {
        return cfg.getUrl();
      },
      getAnonKey: function () {
        return cfg.getAnonKey();
      },
      fetchFn: fetch,
      accessToken: accessToken,
      recordClientId: recordClientId,
      fields: fields,
    };
    if (auth && typeof auth.refreshSession === "function") {
      deps.refreshSession = auth.refreshSession.bind(auth);
    }
    if (auth && typeof auth.getAccessToken === "function") {
      deps.getAccessToken = auth.getAccessToken.bind(auth);
    }
    if (window.AghuWorkspaceStorage && typeof window.AghuWorkspaceStorage.getActiveWorkspaceId === "function") {
      deps.getWorkspaceId = window.AghuWorkspaceStorage.getActiveWorkspaceId.bind(
        window.AghuWorkspaceStorage,
      );
    }
    return deps;
  }

  function localOnlyResult() {
    return { ok: true, skipped: true, reason: "local_only" };
  }

  async function fetchCloudRecordFieldsBatch(_accessToken, _recordClientId, fields) {
    return { status: "skip", requestedFields: fields || [], skipped: true, reason: "local_only" };
  }

  async function fetchCloudPii(_accessToken, _recordClientId) {
    return localOnlyResult();
  }

  /**
   * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string }>}
   */
  async function fetchCloudExams(_accessToken, _recordClientId) {
    return localOnlyResult();
  }

  /**
   * @param {string} patientKey
   * @param {string | null} accessToken
   * @param {{ forceNewPassometro?: boolean, confirmedClose?: boolean }} [syncOpts]
   * @returns {Promise<object | null>}
   */
  async function buildPayload(patientKey, accessToken, syncOpts) {
    syncOpts = syncOpts || {};
    lastPayloadBlockReason = null;
    try {
      var api = payloadApi();
      if (!api || !patientKey) return null;

      var recordClientId = await ensureRecordClientId(patientKey);
      if (!recordClientId) {
        lastPayloadBlockReason = "patient_not_identified";
        return null;
      }

      var patientRecord = null;
      var controlesSnap = null;
      var prescricaoSnap = null;
      var passometroSnap = null;
      var analiseSnap = null;
      var receitaSnap = null;

      if (window.AghuPatientArchive && window.AghuPatientArchive.loadPatientRecord) {
        patientRecord = await window.AghuPatientArchive.loadPatientRecord(patientKey);
      }
      if (window.AghuControlesArchive && window.AghuControlesArchive.loadControlesSnapshot) {
        controlesSnap = await window.AghuControlesArchive.loadControlesSnapshot(patientKey);
      }
      if (window.AghuPrescricaoArchive && window.AghuPrescricaoArchive.loadPrescricaoSnapshot) {
        prescricaoSnap = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(patientKey);
      }
      if (window.AghuPassometroArchive && window.AghuPassometroArchive.loadPassometroSnapshot) {
        passometroSnap = await window.AghuPassometroArchive.loadPassometroSnapshot(patientKey);
      }
      if (window.AghuAnaliseArchive && window.AghuAnaliseArchive.loadAnaliseSnapshot) {
        analiseSnap = await window.AghuAnaliseArchive.loadAnaliseSnapshot(patientKey);
      }
      if (window.AghuReceitaArchive && window.AghuReceitaArchive.loadReceitaSnapshot) {
        receitaSnap = await window.AghuReceitaArchive.loadReceitaSnapshot(patientKey);
      }

      var syncMeta = await getSyncMeta(patientKey);
      var needsControlesMerge =
        !!(accessToken && recordClientId && api.mergeControlesEntries && syncMeta && syncMeta.lastSyncedAt);
      var needsExamsMerge = !!(
        accessToken &&
        recordClientId &&
        api.mergeExamsArchives &&
        patientRecord &&
        patientRecord.examsByKey &&
        Object.keys(patientRecord.examsByKey).length > 0
      );
      var needsPii = !!(
        accessToken &&
        recordClientId &&
        (patientRecord ||
          prescricaoSnap ||
          controlesSnap ||
          passometroSnap ||
          analiseSnap ||
          receitaSnap ||
          (syncMeta && syncMeta.lastSyncedAt))
      );
      var needsPassometroMerge = !!(
        accessToken &&
        recordClientId &&
        (passometroSnap || (syncMeta && syncMeta.lastSyncedAt))
      );
      var needsPrescricoesMerge =
        !!(accessToken && recordClientId && api.mergePrescricoesEntries && syncMeta && syncMeta.lastSyncedAt);
      var needsHpbRegistryMerge = !!(
        accessToken &&
        recordClientId &&
        passometroSnap
      );
      var needsPatientEpisodesMerge = !!(
        accessToken &&
        recordClientId &&
        passometroSnap
      );
      var needsResearchRegistryMerge = !!(
        accessToken &&
        recordClientId &&
        (needsPatientEpisodesMerge || needsHpbRegistryMerge)
      );

      var cloudFetch = cloudFetchApi();
      var cloudFields =
        cloudFetch && cloudFetch.collectBuildPayloadCloudFields
          ? cloudFetch.collectBuildPayloadCloudFields({
              needsControlesMerge: needsControlesMerge,
              needsExamsMerge: needsExamsMerge,
              needsPii: needsPii,
              needsPassometroMerge: needsPassometroMerge,
              needsPatientEpisodesMerge: needsPatientEpisodesMerge,
              needsPrescricoesMerge: needsPrescricoesMerge,
              needsHpbRegistryMerge: needsHpbRegistryMerge,
              needsResearchRegistryMerge: needsResearchRegistryMerge,
            })
          : [];

      var cloudFetchT0 = Date.now();
      var cloudBatch =
        cloudFields.length > 0
          ? await fetchCloudRecordFieldsBatch(accessToken, recordClientId, cloudFields)
          : null;
      console.log("[AGHU] sync phase", {
        phase: "cloudFetch",
        durationMs: Date.now() - cloudFetchT0,
        fieldCount: cloudFields.length,
        status: cloudBatch ? cloudBatch.status : "skip",
        httpStatus: cloudBatch && cloudBatch.httpStatus != null ? cloudBatch.httpStatus : null,
        retried: !!(cloudBatch && cloudBatch.retried),
      });

      if (
        cloudFetch &&
        cloudFetch.shouldBlockSyncOnCloudBatchError &&
        cloudFetch.shouldBlockSyncOnCloudBatchError(cloudBatch, cloudFields, syncMeta)
      ) {
        var cloudHttp = cloudBatch && cloudBatch.httpStatus != null ? cloudBatch.httpStatus : 0;
        lastPayloadBlockReason =
          cloudHttp > 0
            ? "cloud_fields_unavailable:http_" + cloudHttp
            : "cloud_fields_unavailable";
        console.warn("[AGHU] sync error", {
          phase: "cloudBatchMerge",
          reason: lastPayloadBlockReason,
          requestedFields: cloudFields,
          cloudHttpStatus: cloudHttp,
        });
        return null;
      }

      var cloudPii =
        needsPii && cloudBatch && cloudBatch.status === "ok" ? cloudBatch.pii || null : null;
      var cloudPassometro =
        needsPassometroMerge && cloudBatch && cloudBatch.status === "ok"
          ? cloudBatch.passometro || null
          : null;
      var cloudHpbRegistry =
        needsHpbRegistryMerge && cloudBatch && cloudBatch.status === "ok"
          ? cloudBatch.hpb_registry || null
          : null;
      var cloudPatientEpisodes =
        needsPatientEpisodesMerge && cloudBatch && cloudBatch.status === "ok"
          ? cloudBatch.patient_episodes || null
          : null;
      var localPatientEpisodes =
        patientRecord && patientRecord.patientEpisodes
          ? patientRecord.patientEpisodes
          : null;
      if (
        localPatientEpisodes &&
        cloudPatientEpisodes &&
        window.AghuPatientEpisodesPolImport &&
        window.AghuPatientEpisodesPolImport.mergeHospitalizationSnapshots
      ) {
        cloudPatientEpisodes =
          window.AghuPatientEpisodesPolImport.mergeHospitalizationSnapshots(
            cloudPatientEpisodes,
            localPatientEpisodes,
          );
      } else if (localPatientEpisodes) {
        cloudPatientEpisodes = localPatientEpisodes;
      }
      var cloudResearchRegistry =
        needsResearchRegistryMerge && cloudBatch && cloudBatch.status === "ok"
          ? cloudBatch.research_registry || null
          : null;

      if (window.AghuPassometroAutofill) {
        var pmAutofill = window.AghuPassometroAutofill;
        var autofillSources = {
          pii: patientRecord
            ? {
                nomeCompleto: patientRecord.nomeCompleto || patientRecord.primeiroNome || "",
                prontuario: patientRecord.prontuario || "",
                dataNascimento: patientRecord.dataNascimento || patientRecord.dataNascimentoISO || "",
                sexo: patientRecord.sexo || "",
              }
            : prescricaoSnap
              ? {
                  nomeCompleto: prescricaoSnap.nomeCompleto || prescricaoSnap.primeiroNome || "",
                  prontuario: prescricaoSnap.prontuario || "",
                }
              : null,
          controles: controlesSnap,
          prescricoes: prescricaoSnap,
          exams:
            patientRecord && patientRecord.examsByKey
              ? {
                  examsByKey: patientRecord.examsByKey,
                  atualizadoEm: patientRecord.atualizadoEm || null,
                }
              : null,
        };
        var builtPm = pmAutofill.buildPassometroFromSources(autofillSources);
        var pmEmpty =
          !passometroSnap || pmAutofill.isPassometroEmpty(passometroSnap);
        var rxFields =
          pmAutofill.extractPrescricaoFields && prescricaoSnap
            ? pmAutofill.extractPrescricaoFields(prescricaoSnap)
            : { hasAny: false };
        var shouldAutofill =
          pmEmpty &&
          builtPm.entries.length > 0 &&
          ((pmAutofill.hasControlesAutofillSources &&
            pmAutofill.hasControlesAutofillSources(autofillSources)) ||
            rxFields.hasAny);
        if (shouldAutofill) {
          passometroSnap = pmAutofill.applyAutofill(
            passometroSnap || { header: {}, entries: [] },
            builtPm,
            { mode: "append_and_refresh_vitals" },
          );
          var pmMeta = patientRecord || prescricaoSnap;
          if (
            window.AghuPassometroArchive &&
            window.AghuPassometroArchive.savePassometroSnapshot &&
            pmMeta &&
            pmMeta.patientKey
          ) {
            await window.AghuPassometroArchive.savePassometroSnapshot(
              {
                patientKey: patientKey,
                primeiroNome: pmMeta.primeiroNome || "",
                nomeCompleto: pmMeta.nomeCompleto || "",
                prontuario: pmMeta.prontuario || "",
              },
              passometroSnap,
            );
          }
        }
      }

      if (
        passometroSnap &&
        cloudPassometro &&
        window.AghuPassometroCollection &&
        window.AghuPassometroCollection.mergeCollections
      ) {
        var mergedPm = window.AghuPassometroCollection.mergeCollections(
          passometroSnap,
          cloudPassometro,
          cloudPatientEpisodes,
        );
        passometroSnap = mergedPm.collection;
        if (mergedPm.episodesChanged && mergedPm.patientEpisodes) {
          cloudPatientEpisodes = mergedPm.patientEpisodes;
        }
        if (
          window.AghuPassometroArchive &&
          window.AghuPassometroArchive.savePassometroCollection &&
          patientRecord
        ) {
          await window.AghuPassometroArchive.savePassometroCollection(
            {
              patientKey: patientKey,
              primeiroNome: patientRecord.primeiroNome || "",
              nomeCompleto: patientRecord.nomeCompleto || "",
              prontuario: patientRecord.prontuario || "",
            },
            passometroSnap,
          );
        }
      } else if (
        passometroSnap &&
        cloudPassometro &&
        window.AghuPassometroAutofill &&
        window.AghuPassometroAutofill.mergePassometroSnapshotsForSync
      ) {
        passometroSnap = window.AghuPassometroAutofill.mergePassometroSnapshotsForSync(
          passometroSnap,
          cloudPassometro,
        );
      } else if (!passometroSnap && cloudPassometro) {
        passometroSnap = cloudPassometro;
      }

      if (needsControlesMerge && cloudBatch) {
        var cloudControles = cloudBatch.status === "ok" ? cloudBatch.controles : null;
        if (cloudControles || controlesSnap) {
          var mergedCtrl = api.mergeControlesEntries(controlesSnap, cloudControles);
          if (mergedCtrl && mergedCtrl.entries && mergedCtrl.entries.length) {
            controlesSnap = Object.assign({}, controlesSnap || {}, mergedCtrl);
          }
        }
      }

      if (needsPrescricoesMerge && cloudBatch) {
        var cloudPrescricoes = cloudBatch.status === "ok" ? cloudBatch.prescricoes : null;
        if (cloudPrescricoes || prescricaoSnap) {
          var mergedRx = api.mergePrescricoesEntries(prescricaoSnap, cloudPrescricoes);
          if (mergedRx && mergedRx.entries && mergedRx.entries.length) {
            prescricaoSnap = Object.assign({}, prescricaoSnap || {}, mergedRx);
          }
        }
      }

      if (needsExamsMerge) {
        var cloudExamsResult =
          cloudFetch && cloudFetch.examsResultFromBatch
            ? cloudFetch.examsResultFromBatch(cloudBatch || { status: "skip" })
            : await fetchCloudExams(accessToken, recordClientId);
        if (
          cloudExamsResult.status === "error" &&
          syncMeta &&
          syncMeta.lastSyncedAt &&
          patientRecord &&
          patientRecord.examsByKey &&
          Object.keys(patientRecord.examsByKey).length > 0
        ) {
          var examsHttp = cloudExamsResult.httpStatus || 0;
          lastPayloadBlockReason =
            examsHttp > 0
              ? "cloud_exams_unavailable:http_" + examsHttp
              : "cloud_exams_unavailable";
          console.warn("[AGHU] sync error", {
            phase: "cloudExamsMerge",
            reason: lastPayloadBlockReason,
            cloudExamsHttpStatus: examsHttp,
          });
          return null;
        }
        var cloudExams =
          cloudExamsResult.status === "ok" ? cloudExamsResult.exams : null;
        var localExamsSnap =
          patientRecord && patientRecord.examsByKey
            ? {
                examsByKey: patientRecord.examsByKey,
                atualizadoEm: patientRecord.atualizadoEm || null,
              }
            : null;
        if (cloudExams || localExamsSnap) {
          var mergedExams = api.mergeExamsArchives(localExamsSnap, cloudExams);
          if (mergedExams && mergedExams.examsByKey) {
            patientRecord = Object.assign({}, patientRecord || {}, {
              examsByKey: mergedExams.examsByKey,
              atualizadoEm: mergedExams.atualizadoEm,
            });
            if (
              window.AghuPatientArchive &&
              window.AghuPatientArchive.replaceExamsByKey
            ) {
              await window.AghuPatientArchive.replaceExamsByKey(
                patientKey,
                mergedExams.examsByKey,
                mergedExams.atualizadoEm,
              );
            }
          }
        }
      }

      var payload = api.buildPayloadFromSnapshots({
        patientKey: patientKey,
        recordClientId: recordClientId,
        patientRecord: patientRecord,
        controlesSnap: controlesSnap,
        prescricaoSnap: prescricaoSnap,
        passometroSnap: passometroSnap,
        analiseSnap: analiseSnap,
        receitaSnap: receitaSnap,
        hpbRegistrySnap: cloudHpbRegistry,
        patientEpisodesSnap: cloudPatientEpisodes,
        researchRegistrySnap: cloudResearchRegistry,
        cloudPii: cloudPii,
        forceNewPassometro: syncOpts.forceNewPassometro === true,
        confirmedClose: syncOpts.confirmedClose === true,
      });
      if (payload) {
        var idApi = identityApi();
        if (
          idApi &&
          typeof idApi.isCompletePatientIdentity === "function" &&
          !idApi.isCompletePatientIdentity(payload.pii)
        ) {
          lastPayloadBlockReason = "patient_identity_incomplete";
          console.warn("[AGHU] sync error", {
            phase: "buildPayload",
            reason: lastPayloadBlockReason,
          });
          return null;
        }
      }
      return payload;
    } catch (err) {
      console.warn("[AGHU] sync error", {
        phase: "buildPayload",
        message: err && err.message ? err.message : "unknown",
      });
      var errMsg = err && err.message ? String(err.message).slice(0, 120) : "unknown";
      lastPayloadBlockReason = "payload_build_failed:" + errMsg.replace(/\s+/g, "_");
      return null;
    }
  }

  /**
   * @param {{ ok?: boolean, reason?: string, httpStatus?: number }} out
   * @returns {string | null}
   */
  function formatSyncMessage(out) {
    if (!out) return null;
    if (out.skipped || out.reason === "local_only") return "";
    if (out.ok) return "Nuvem: sincronizado.";
    if (out.reason === "patient_overage_consent_required") {
      var billing =
        window.AghuBillingStatus && window.AghuBillingStatus.billingUrl
          ? window.AghuBillingStatus.billingUrl()
          : null;
      return (
        "Nuvem: limite de 20 pacientes incluídos — aceite R$ 5/mês por paciente extra em " +
        (billing || "/billing") +
        " ou use o diálogo de consentimento."
      );
    }
    if (out.reason === "sync_not_allowed" || out.reason === "subscription_required") {
      var pricing =
        window.AghuBillingStatus && window.AghuBillingStatus.pricingUrl
          ? window.AghuBillingStatus.pricingUrl()
          : null;
      return pricing
        ? "Nuvem: plano pago necessário — " + pricing
        : "Nuvem: plano pago necessário para sync.";
    }
    if (out.reason === "no_session") {
      return "Nuvem: inicie sessão para sincronizar.";
    }
    if (out.reason === "session_expired") {
      return "Nuvem: sessão expirada — saia e entre novamente no popup.";
    }
    if (out.reason === "not_configured") {
      return "Nuvem: Supabase não configurado.";
    }
    if (out.reason === "no_payload") {
      return "Nuvem: sem dados locais para este paciente.";
    }
    if (out.reason === "patient_not_identified") {
      return "Nuvem: paciente não identificado na extração (nome/prontuário).";
    }
    if (
      out.reason === "patient_limit_reached" ||
      out.reason === "patient_limit_exceeded"
    ) {
      var billingLimit =
        window.AghuBillingStatus && window.AghuBillingStatus.billingUrl
          ? window.AghuBillingStatus.billingUrl()
          : null;
      return billingLimit
        ? "Nuvem: limite de pacientes — " + billingLimit
        : "Nuvem: limite de pacientes do plano atingido.";
    }
    if (out.reason === "sync_in_flight") {
      return "Nuvem: sincronização em curso…";
    }
    if (out.reason === "network_error") {
      return "Nuvem: erro de rede.";
    }
    if (out.reason === "sync_timeout") {
      return "Nuvem: sincronização expirou — tente de novo.";
    }
    if (out.reason === "sync_error") {
      return "Nuvem: falha na sincronização — tente de novo.";
    }
    if (out.reason === "payload_build_failed") {
      return "Nuvem: falha ao montar dados para sincronizar.";
    }
    if (String(out.reason || "").indexOf("payload_build_failed:") === 0) {
      return "Nuvem: falha ao montar dados para sincronizar.";
    }
    if (out.reason === "payload_too_large") {
      return "Nuvem: dados demasiado grandes para sincronizar.";
    }
    if (
      out.reason === "cloud_exams_unavailable" ||
      String(out.reason || "").indexOf("cloud_exams_unavailable:") === 0
    ) {
      var examsErrDetail = String(out.reason || "").replace("cloud_exams_unavailable:", "");
      if (examsErrDetail === "http_401") {
        return "Nuvem: sessão expirada ao ler exames — saia e entre novamente, ou tente sincronizar de novo.";
      }
      if (examsErrDetail.indexOf("http_") === 0) {
        return (
          "Nuvem: não foi possível ler exames na nuvem (" +
          examsErrDetail.replace("http_", "HTTP ") +
          ") — sync cancelado para não apagar correções manuais."
        );
      }
      return "Nuvem: não foi possível ler exames na nuvem — sync cancelado para não apagar correções manuais.";
    }
    if (
      out.reason === "cloud_fields_unavailable" ||
      String(out.reason || "").indexOf("cloud_fields_unavailable:") === 0
    ) {
      var cloudErrDetail = String(out.reason || "").replace(
        "cloud_fields_unavailable:",
        "",
      );
      if (cloudErrDetail === "http_401") {
        return "Nuvem: sessão expirada ao ler dados na nuvem — saia e entre novamente.";
      }
      if (cloudErrDetail.indexOf("http_") === 0) {
        return (
          "Nuvem: não foi possível ler dados na nuvem (" +
          cloudErrDetail.replace("http_", "HTTP ") +
          ") — sync cancelado."
        );
      }
      return "Nuvem: não foi possível ler dados na nuvem — sync cancelado.";
    }
    if (String(out.reason || "").indexOf("http_") === 0) {
      return "Nuvem: falha (" + String(out.reason).replace("http_", "HTTP ") + ").";
    }
    return "Nuvem: " + (out.reason || "falha desconhecida") + ".";
  }

  async function postPayload(_accessToken, _body) {
    // Modo offline: nunca envia dados para a nuvem.
    return localOnlyResult();
  }

  /**
   * @param {string} patientKey
   * @param {{ forceNewPassometro?: boolean, confirmedClose?: boolean }} [syncOpts]
   * @returns {Promise<{ ok: boolean, reason?: string, httpStatus?: number }>}
   */
  async function syncPatient(patientKey, syncOpts) {
    syncOpts = syncOpts || {};
    if (!patientKey) return { ok: false, reason: "invalid_patient" };
    return localOnlyResult();

    if (syncInFlight[patientKey]) return syncInFlight[patientKey];

    syncInFlight[patientKey] = withNetworkTimeout(
      (async function () {
        try {
          var cfg = window.AghuSupabaseConfig;
          var auth = window.AghuSupabaseAuth;
          if (!cfg || !cfg.isConfigured()) {
            return { ok: false, reason: "not_configured" };
          }
          if (!auth) return { ok: false, reason: "no_session" };

          var authT0 = Date.now();
          var token = await auth.getAccessToken();
          console.log("[AGHU] sync phase", {
            phase: "auth",
            durationMs: Date.now() - authT0,
            hasToken: !!token,
          });
          if (!token) return { ok: false, reason: "no_session" };

          if (window.AghuBillingStatus) {
            var billingT0 = Date.now();
            var syncCheck = await window.AghuBillingStatus.checkFeature("sync");
            console.log("[AGHU] sync phase", {
              phase: "billing",
              durationMs: Date.now() - billingT0,
              ok: syncCheck.ok,
            });
            if (!syncCheck.ok) {
              return {
                ok: false,
                reason: syncCheck.code || "sync_not_allowed",
              };
            }
          }

          var recordClientId = await ensureRecordClientId(patientKey);
          if (!recordClientId) {
            return { ok: false, reason: "patient_not_identified" };
          }

          var buildT0 = Date.now();
          var body = await buildPayload(patientKey, token, syncOpts);
          console.log("[AGHU] sync phase", {
            phase: "buildPayload",
            durationMs: Date.now() - buildT0,
            hasBody: !!body,
          });
          if (!body) {
            var payloadApiRef = payloadApi();
            var meta =
              payloadApiRef && payloadApiRef.getLastBuildPayloadMeta
                ? payloadApiRef.getLastBuildPayloadMeta()
                : null;
            if (meta && meta.needsConfirmClose) {
              return { ok: false, reason: "needs_confirm_close" };
            }
            return {
              ok: false,
              reason: lastPayloadBlockReason || "no_payload",
            };
          }

          var postT0 = Date.now();
          var out = await postPayload(token, body);
          console.log("[AGHU] sync phase", {
            phase: "post",
            durationMs: Date.now() - postT0,
            ok: out.ok,
            reason: out.reason || null,
          });
          if (out.httpStatus === 401) {
            try {
              await auth.refreshSession();
            } catch (_e) {
              /* ignore */
            }
            token = await auth.getAccessToken();
            if (token) {
              var retryT0 = Date.now();
              out = await postPayload(token, body);
              console.log("[AGHU] sync phase", {
                phase: "post",
                durationMs: Date.now() - retryT0,
                ok: out.ok,
                reason: out.reason || null,
                retry: true,
              });
            }
          }

          if (!out.ok && out.reason === "patient_overage_consent_required") {
            if (window.AghuStaffOveragePopup && window.AghuStaffOveragePopup.show) {
              window.AghuStaffOveragePopup.show();
            }
          }
          if (out.ok) {
            await updateSyncMeta(patientKey, {
              lastSyncedAt: Date.now(),
              lastError: null,
            });
          } else {
            await updateSyncMeta(patientKey, {
              lastError: out.reason || "unknown",
            });
          }
          return out;
        } catch (err) {
          console.warn("[AGHU] sync error", {
            phase: "syncPatient",
            message: err && err.message ? err.message : "unknown",
          });
          return { ok: false, reason: "sync_error" };
        }
      })(),
      SYNC_GLOBAL_TIMEOUT_MS,
    ).catch(function (err) {
      if (err && err.message === "network_timeout") {
        return { ok: false, reason: "sync_timeout" };
      }
      console.warn("[AGHU] sync error", {
        phase: "syncPatient_outer",
        message: err && err.message ? err.message : "unknown",
      });
      return { ok: false, reason: "sync_error" };
    }).finally(function () {
      delete syncInFlight[patientKey];
    });

    return syncInFlight[patientKey];
  }

  window.AghuSupabaseSync = {
    SYNC_META_KEY: SYNC_META_KEY,
    buildPayload: buildPayload,
    syncPatient: syncPatient,
    getSyncMeta: getSyncMeta,
    ensureRecordClientId: ensureRecordClientId,
    fetchCloudPii: fetchCloudPii,
    fetchCloudExams: fetchCloudExams,
    formatSyncMessage: formatSyncMessage,
  };
})();
