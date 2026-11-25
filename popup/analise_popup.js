// analise_popup.js — aba Assistentes de IA (thread de chat)
"use strict";

(function () {
  var threadEl = document.getElementById("analise-chat-thread");
  var composerEl = document.getElementById("analise-composer-input");
  var statusEl = document.getElementById("analise-status");
  var btnPrefill = document.getElementById("btnAnalisePrefill");
  var btnEnviar = document.getElementById("btnAnaliseEnviar");
  var btnNova = document.getElementById("btnAnaliseNovaConversa");
  var btnGuardar = document.getElementById("btnAnaliseGuardar");
  var btnInstrucoes = document.getElementById("btnAnaliseInstrucoes");
  var patientSel = document.getElementById("analisePatientSelect");
  var patientHintEl = document.getElementById("analisePatientHint");
  var promptDialog = document.getElementById("analise-prompt-dialog");
  var assistantSelect = document.getElementById("analise-assistant-select");
  var tplName = document.getElementById("analise-template-name");
  var tplPrompt = document.getElementById("analise-template-prompt");
  var btnTplNovo = document.getElementById("btnAnaliseTplNovo");
  var btnTplDup = document.getElementById("btnAnaliseTplDup");
  var btnTplDel = document.getElementById("btnAnaliseTplDel");
  var btnPromptSave = document.getElementById("btnAnalisePromptSave");
  var btnPromptClose = document.getElementById("btnAnalisePromptClose");
  var activePatient = window.AghuPopupActivePatient;

  if (!threadEl || !composerEl) return;

  var snapApi = window.AghuPatientAnalysisSnap;
  var chatUi = window.AghuPatientAnalysisChatUi;
  var tplApi = window.AghuPatientAnalysisPromptTemplates;
  var prefsClient = window.AghuUserPreferencesClient;
  var MIN_PRONT = 200;
  var MIN_FOLLOW = 20;

  var NO_PATIENT_KEY =
    (window.AghuAnaliseArchive && window.AghuAnaliseArchive.NO_PATIENT_ARCHIVE_KEY) ||
    "_no_patient";
  var loadedArchiveKey = null;
  var currentPatientKey = NO_PATIENT_KEY;
  var currentSnap = snapApi ? snapApi.emptyAnaliseSnap() : { messages: [], text: "", prontuarioText: "", sourceFingerprint: "" };
  var promptPrefs = tplApi ? tplApi.createDefaultPreferences() : null;
  var sending = false;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includeAnonymous: true });
  }

  function setStatus(msg, tipo) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.style.display = "none";
      return;
    }
    statusEl.textContent = msg;
    statusEl.className = "status-msg " + (tipo || "info");
    statusEl.style.display = "block";
  }

  function isAnonymousMode() {
    return activePatient && activePatient.isAnonymous();
  }

  function resolveContextPatientKey() {
    if (isAnonymousMode()) return null;
    return activePatient ? activePatient.getActiveKey() : null;
  }

  function assertPatientUiAligned() {
    if (!activePatient || !patientSel) return true;
    if (typeof activePatient.isSelectAlignedWithActive === "function") {
      return activePatient.isSelectAlignedWithActive(patientSel);
    }
    var sel = patientSel.value;
    var ak = activePatient.getActiveKey();
    if (sel === ak) return true;
    if (
      activePatient.isAnonymousKey &&
      activePatient.isAnonymousKey(sel) &&
      activePatient.isAnonymous()
    ) {
      return true;
    }
    return false;
  }

  function reportMisalignedPatientUi() {
    setStatus(
      (activePatient && activePatient.MISALIGNED_MSG) ||
        "Select e paciente activo desalinhados — volte a seleccionar o paciente",
      "error",
    );
    void refreshPatientContext();
  }

  function resolveStorageKey(optionalPatientKey) {
    return optionalPatientKey || NO_PATIENT_KEY;
  }

  function isNoPatientStorageKey(storageKey) {
    return storageKey === NO_PATIENT_KEY;
  }

  function renderThread(loading) {
    if (!chatUi || !snapApi) return;
    chatUi.renderThread(threadEl, currentSnap.messages || [], {
      loading: !!loading,
      onEdit: function (id, content) {
        currentSnap.messages = (currentSnap.messages || []).map(function (m) {
          if (m.id === id) {
            return Object.assign({}, m, { content: content, source: "manual" });
          }
          return m;
        });
        currentSnap.editedByUser = true;
        if (snapApi.buildSaveSnap) currentSnap = snapApi.buildSaveSnap(currentSnap);
        renderThread(false);
      },
    });
  }

  async function loadPromptPrefs() {
    if (!prefsClient || !tplApi) return;
    var data = await prefsClient.readUserPreferences(["analysis_prompt_templates"]);
    if (
      data &&
      typeof data === "object" &&
      Object.keys(data).length === 0 &&
      prefsClient.USER_PREFERENCE_DOMAINS &&
      !prefsClient.USER_PREFERENCE_DOMAINS.has("analysis_prompt_templates")
    ) {
      console.warn(
        "[AGHU] analysis_prompt_templates ausente no cliente — recarregue a extensão",
      );
    }
    var row = data && data.analysis_prompt_templates;
    promptPrefs = tplApi.parsePreferencesFromApiRow
      ? tplApi.parsePreferencesFromApiRow(row)
      : tplApi.sanitizePreferences(
          row && typeof row === "object"
            ? {
                active_template_id: row.active_template_id,
                templates: row.templates,
              }
            : null,
        );
  }

  function activeTemplate() {
    if (!tplApi || !promptPrefs) return null;
    var id = promptPrefs.active_template_id;
    var list = promptPrefs.templates || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return tplApi.getActiveTemplate(promptPrefs);
  }

  /** Aplica nome/instruções do diálogo ao template activo em promptPrefs. */
  function applyDialogEditsToPrefs() {
    if (!tplApi || !promptPrefs) return;
    var activeId = promptPrefs.active_template_id;
    var nameVal = tplName
      ? tplName.value.trim().slice(0, tplApi.MAX_NAME_LEN)
      : "";
    var promptVal = tplPrompt
      ? tplPrompt.value.trim().slice(0, tplApi.MAX_PROMPT_LEN)
      : "";
    promptPrefs.templates = (promptPrefs.templates || []).map(function (t) {
      if (t.id !== activeId || t.isBuiltin === true) return t;
      return Object.assign({}, t, {
        name: nameVal || t.name,
        systemPrompt: promptVal || t.systemPrompt,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async function persistPromptPrefs(opts) {
    if (!prefsClient || !tplApi || !promptPrefs) {
      return { ok: false, error: "not_configured" };
    }
    if (!opts || opts.applyDialog !== false) {
      applyDialogEditsToPrefs();
    }
    var result = await savePromptPrefs();
    if (result.ok) {
      await loadPromptPrefs();
      fillAssistantSelect();
      fillPromptDialog();
    }
    return result;
  }

  function formatPromptSaveError(code) {
    var edge = window.AghuSupabaseEdgeFetch;
    if (edge && typeof edge.formatEdgeError === "function") {
      return edge.formatEdgeError(code);
    }
    if (code === "no_session") return "Inicie sessão para guardar instruções.";
    if (code === "validation_failed") return "Dados do assistente inválidos.";
    if (code === "persist_failed") return "Falha ao guardar no servidor.";
    return code || "Falha ao guardar instruções.";
  }

  function fillAssistantSelect() {
    if (!assistantSelect || !tplApi || !promptPrefs) return;
    assistantSelect.innerHTML = "";
    (promptPrefs.templates || []).forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      assistantSelect.appendChild(opt);
    });
    assistantSelect.value = promptPrefs.active_template_id;
  }

  function fillPromptDialog() {
    if (!tplApi || !promptPrefs) return;
    fillAssistantSelect();
    var active = activeTemplate();
    if (tplName) {
      tplName.value = active ? active.name : "";
      tplName.disabled = !!(active && active.isBuiltin);
    }
    if (tplPrompt) {
      tplPrompt.value = active ? active.systemPrompt : "";
      tplPrompt.readOnly = !!(active && active.isBuiltin);
    }
    if (btnTplDel) {
      btnTplDel.disabled = !!(active && active.isBuiltin);
    }
  }

  async function savePromptPrefs() {
    if (!prefsClient || !tplApi || !promptPrefs) return { ok: false, error: "not_configured" };
    promptPrefs = tplApi.sanitizePreferences(promptPrefs);
    var payload = tplApi.preferencesForStorage
      ? tplApi.preferencesForStorage(promptPrefs)
      : promptPrefs;
    if (tplApi.isValidWritePayload && !tplApi.isValidWritePayload(payload)) {
      return { ok: false, error: "validation_failed" };
    }
    if (!prefsClient.invokeUserPreferences) {
      var legacyOk = await prefsClient.writeUserPreference(
        "analysis_prompt_templates",
        payload,
      );
      return legacyOk ? { ok: true } : { ok: false, error: "persist_failed" };
    }
    var out = await prefsClient.invokeUserPreferences({
      action: "write",
      domain: "analysis_prompt_templates",
      payload: payload,
    });
    return out.ok ? { ok: true } : { ok: false, error: out.error || "persist_failed" };
  }

  async function updatePatientHint(patientKey) {
    if (!activePatient || !activePatient.updatePatientHint) return;
    await activePatient.updatePatientHint(patientHintEl, {
      patientKey: patientKey,
      anonymousMessage: "Anônimo — rascunho local, sem sync na nuvem",
      emptyMessage: "Sem paciente — selecione um prontuário ou use Anônimo",
      suffix: " — Guardar envia à nuvem",
    });
  }

  async function loadForPatient(storageKey) {
    var key = storageKey || NO_PATIENT_KEY;
    if (key === loadedArchiveKey) {
      currentPatientKey = key;
      return;
    }
    if (!window.AghuAnaliseArchive) return;

    currentPatientKey = key;
    loadedArchiveKey = key;
    var raw = await window.AghuAnaliseArchive.loadAnaliseSnapshot(key);
    currentSnap = snapApi
      ? snapApi.normalizeAnaliseSnap(raw || snapApi.emptyAnaliseSnap())
      : raw || { messages: [], text: "", prontuarioText: "", sourceFingerprint: "" };
    renderThread(false);
    if (composerEl) composerEl.value = "";
  }

  async function prefillFromLocal() {
    if (isAnonymousMode()) {
      setStatus("Modo anônimo — cole manualmente ou selecione um paciente.", "info");
      return;
    }
    var pk = resolveContextPatientKey();
    if (!pk) {
      setStatus("Sem dados locais — cole manualmente ou extraia na aba Exames.", "info");
      return;
    }
    var patientRecord = null;
    var controles = null;
    var prescricoes = null;
    var passometro = null;
    if (window.AghuPatientArchive) {
      patientRecord = await window.AghuPatientArchive.loadPatientRecord(pk);
    }
    if (window.AghuControlesArchive) {
      controles = await window.AghuControlesArchive.loadControlesSnapshot(pk);
    }
    if (window.AghuPrescricaoArchive) {
      prescricoes = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(pk);
    }
    if (window.AghuPassometroArchive) {
      passometro = await window.AghuPassometroArchive.loadPassometroSnapshot(pk);
    }
    var ctx = window.AghuPatientAnalysisContext;
    if (!ctx) return;
    var draft = ctx.buildProntuarioDraftFromSync({
      pii: patientRecord,
      exams: patientRecord && patientRecord.examsByKey
        ? { examsByKey: patientRecord.examsByKey, atualizadoEm: patientRecord.atualizadoEm }
        : null,
      controles: controles,
      prescricoes: prescricoes,
      passometro: passometro,
    });
    if (draft) {
      composerEl.value = draft;
      setStatus("Prontuário preenchido a partir do arquivo local.", "ok");
    } else {
      setStatus("Nenhum dado local encontrado para este paciente.", "info");
    }
  }

  async function resolveRecordClientIdForGenerate() {
    if (isAnonymousMode()) {
      return { recordClientId: null, patientKey: null };
    }
    var pk = resolveContextPatientKey();
    var identity = window.AghuPatientIdentity;
    var patientRecord = null;
    if (pk && window.AghuPatientArchive) {
      patientRecord = await window.AghuPatientArchive.loadPatientRecord(pk);
    }
    if (pk && window.AghuSupabaseSync && window.AghuSupabaseSync.ensureRecordClientId) {
      var fromSync = await window.AghuSupabaseSync.ensureRecordClientId(pk);
      if (fromSync) return { recordClientId: fromSync, patientKey: pk };
    }
    if (
      identity &&
      identity.recordClientIdFromProntuarioSync &&
      patientRecord &&
      patientRecord.prontuario
    ) {
      var derived = identity.recordClientIdFromProntuarioSync(patientRecord.prontuario);
      if (derived) return { recordClientId: derived, patientKey: pk };
    }
    return { recordClientId: null, patientKey: pk };
  }

  async function getAccessToken() {
    if (!window.AghuSupabaseAuth || !window.AghuSupabaseAuth.getAccessToken) return null;
    return window.AghuSupabaseAuth.getAccessToken();
  }

  function formatAnalysisError(code) {
    var edge = window.AghuSupabaseEdgeFetch;
    if (edge && typeof edge.formatEdgeError === "function") {
      return edge.formatEdgeError(code);
    }
    if (code === "invalid_token") return "Sessão expirada. Saia e entre novamente no popup.";
    return code || "Falha na geração";
  }

  async function callGenerate() {
    if (sending || !snapApi) return;
    var text = composerEl.value.trim();
    if (!text) return;
    if (!assertPatientUiAligned()) {
      reportMisalignedPatientUi();
      return;
    }
    var hasAssistant = (currentSnap.messages || []).some(function (m) {
      return m.role === "assistant";
    });
    var minLen = hasAssistant ? MIN_FOLLOW : MIN_PRONT;
    if (text.length < minLen) {
      setStatus(
        hasAssistant
          ? "Mensagem: mínimo " + MIN_FOLLOW + " caracteres."
          : "Prontuário: mínimo " + MIN_PRONT + " caracteres.",
        "warn",
      );
      return;
    }
    var token = await getAccessToken();
    if (!token) {
      setStatus("Inicie sessão para gerar análise.", "warn");
      return;
    }
    var cfg = window.AghuSupabaseConfig;
    if (!cfg || !cfg.isConfigured()) {
      setStatus("Supabase não configurado.", "error");
      return;
    }

    var userMsg = snapApi.createMessage(
      "user",
      text,
      (currentSnap.messages || []).length === 0 ? "prefill" : "manual",
    );
    var nextMessages = (currentSnap.messages || []).slice();
    nextMessages.push(userMsg);
    currentSnap.messages = nextMessages;
    composerEl.value = "";
    sending = true;
    renderThread(true);

    var resolved = await resolveRecordClientIdForGenerate();
    var recordClientId = resolved.recordClientId;
    // Identidade no body só se select e activo ainda alinhados (fail-fast).
    if (recordClientId && !assertPatientUiAligned()) {
      currentSnap.messages = (currentSnap.messages || []).filter(function (m) {
        return m.id !== userMsg.id;
      });
      composerEl.value = text;
      sending = false;
      renderThread(false);
      reportMisalignedPatientUi();
      return;
    }
    var storageKey = isAnonymousMode()
      ? NO_PATIENT_KEY
      : recordClientId
        ? resolveStorageKey(resolved.patientKey)
        : NO_PATIENT_KEY;

    var activeTpl = activeTemplate();
    var mode = snapApi.inferGenerateMode(nextMessages);
    var body = {
      mode: mode,
      messages: nextMessages.map(function (m) {
        return { role: m.role, content: m.content };
      }),
    };
    if (activeTpl && activeTpl.systemPrompt) {
      body.systemPrompt = activeTpl.systemPrompt;
    }
    if (recordClientId) body.record_client_id = recordClientId;

    try {
      currentSnap.messages = (currentSnap.messages || []).filter(function (m) {
        return m.id !== userMsg.id;
      });
      composerEl.value = text;
    } finally {
      sending = false;
      renderThread(false);
    }
  }

  async function guardarLocal() {
    if (!window.AghuAnaliseArchive || !snapApi) return;
    if (!assertPatientUiAligned()) {
      reportMisalignedPatientUi();
      return;
    }
    var storageKey;
    if (isAnonymousMode()) {
      storageKey = NO_PATIENT_KEY;
    } else {
      var contextPk = resolveContextPatientKey();
      storageKey = resolveStorageKey(contextPk);
    }
    currentSnap = snapApi.buildSaveSnap(currentSnap);
    if (activeTemplate()) {
      currentSnap.activeSystemPromptTemplateId = activeTemplate().id;
    }
    await window.AghuAnaliseArchive.saveAnaliseSnapshot(storageKey, currentSnap);
    currentPatientKey = storageKey;
    loadedArchiveKey = storageKey;
    var syncPk = null;
    if (!isAnonymousMode() && !isNoPatientStorageKey(storageKey)) {
      var contextPkForSync = resolveContextPatientKey();
      if (contextPkForSync && storageKey === resolveStorageKey(contextPkForSync)) {
        syncPk = contextPkForSync;
      }
    }
    // Anônimo: só local — nunca syncPatient. Misalign já barrado acima.
    if (syncPk && window.AghuSupabaseSync && window.AghuSupabaseSync.syncPatient) {
      await window.AghuSupabaseSync.syncPatient(syncPk);
      setStatus("Guardado localmente.", "ok");
    } else if (isNoPatientStorageKey(storageKey)) {
      setStatus("Guardado localmente (sem paciente vinculado).", "ok");
    } else {
      setStatus("Guardado localmente.", "ok");
    }
  }

  function novaConversa() {
    currentSnap = snapApi ? snapApi.emptyAnaliseSnap() : { messages: [], text: "", prontuarioText: "", sourceFingerprint: "" };
    composerEl.value = "";
    renderThread(false);
    setStatus("", null);
  }

  function openPromptDialog() {
    void (async function () {
      await loadPromptPrefs();
      fillPromptDialog();
      if (promptDialog && promptDialog.showModal) promptDialog.showModal();
    })();
  }

  function closePromptDialog() {
    if (promptDialog && promptDialog.close) promptDialog.close();
  }

  async function refreshPatientContext() {
    await loadPromptPrefs();
    fillAssistantSelect();
    if (patientSel && activePatient && activePatient.refreshSelect) {
      await activePatient.refreshSelect(patientSel, {
        includeAnonymous: true,
        selectedKey: activePatient.getActiveKey(),
      });
    }
    if (isAnonymousMode()) {
      await updatePatientHint(
        activePatient ? activePatient.ANONYMOUS_VALUE : NO_PATIENT_KEY,
      );
      loadedArchiveKey = null;
      await loadForPatient(NO_PATIENT_KEY);
      return;
    }
    var contextPk = resolveContextPatientKey();
    await updatePatientHint(contextPk);
    loadedArchiveKey = null;
    await loadForPatient(resolveStorageKey(contextPk));
  }

  if (btnPrefill) btnPrefill.addEventListener("click", function () { void prefillFromLocal(); });
  if (btnEnviar) btnEnviar.addEventListener("click", function () { void callGenerate(); });
  if (btnNova) btnNova.addEventListener("click", novaConversa);
  if (btnGuardar) btnGuardar.addEventListener("click", function () { void guardarLocal(); });
  if (btnInstrucoes) btnInstrucoes.addEventListener("click", openPromptDialog);
  if (btnPromptClose) btnPromptClose.addEventListener("click", closePromptDialog);

  if (assistantSelect) {
    assistantSelect.addEventListener("change", function () {
      void (async function () {
        if (!tplApi || !promptPrefs) return;
        promptPrefs.active_template_id = assistantSelect.value;
        var result = await persistPromptPrefs({ applyDialog: false });
        if (!result.ok) {
          await loadPromptPrefs();
          fillAssistantSelect();
          setStatus(formatPromptSaveError(result.error), "error");
        }
      })();
    });
  }
  if (btnTplNovo) {
    btnTplNovo.addEventListener("click", function () {
      void (async function () {
        if (!tplApi || !promptPrefs) return;
        applyDialogEditsToPrefs();
        var t = tplApi.createBlankTemplate();
        promptPrefs.templates.push(t);
        promptPrefs.active_template_id = t.id;
        promptPrefs = tplApi.sanitizePreferences(promptPrefs);
        fillPromptDialog();
        var result = await persistPromptPrefs({ applyDialog: false });
        setStatus(
          result.ok ? "Assistente criado." : formatPromptSaveError(result.error),
          result.ok ? "ok" : "error",
        );
      })();
    });
  }
  if (btnTplDup) {
    btnTplDup.addEventListener("click", function () {
      void (async function () {
        if (!tplApi || !promptPrefs) return;
        applyDialogEditsToPrefs();
        var active = activeTemplate();
        if (!active) return;
        var copy = tplApi.createBlankTemplate(active.name + " (cópia)");
        copy.systemPrompt = active.systemPrompt;
        promptPrefs.templates.push(copy);
        promptPrefs.active_template_id = copy.id;
        promptPrefs = tplApi.sanitizePreferences(promptPrefs);
        fillPromptDialog();
        var result = await persistPromptPrefs({ applyDialog: false });
        setStatus(
          result.ok ? "Assistente duplicado." : formatPromptSaveError(result.error),
          result.ok ? "ok" : "error",
        );
      })();
    });
  }
  if (btnTplDel) {
    btnTplDel.addEventListener("click", function () {
      void (async function () {
        if (!tplApi || !promptPrefs) return;
        var active = activeTemplate();
        if (!active || active.isBuiltin) return;
        applyDialogEditsToPrefs();
        promptPrefs.templates = promptPrefs.templates.filter(function (t) {
          return t.id !== active.id;
        });
        promptPrefs.active_template_id = promptPrefs.templates[0]
          ? promptPrefs.templates[0].id
          : tplApi.BUILTIN_DEFAULT_ID;
        promptPrefs = tplApi.sanitizePreferences(promptPrefs);
        fillPromptDialog();
        var result = await persistPromptPrefs({ applyDialog: false });
        setStatus(
          result.ok ? "Assistente eliminado." : formatPromptSaveError(result.error),
          result.ok ? "ok" : "error",
        );
      })();
    });
  }
  if (btnPromptSave) {
    btnPromptSave.addEventListener("click", function () {
      void (async function () {
        if (!tplApi || !promptPrefs) return;
        var result = await persistPromptPrefs();
        setStatus(
          result.ok ? "Instruções guardadas." : formatPromptSaveError(result.error),
          result.ok ? "ok" : "error",
        );
        if (result.ok) closePromptDialog();
      })();
    });
  }

  if (patientSel) {
    patientSel.addEventListener("change", function () {
      if (activePatient && activePatient.isSyncing()) return;
      var v = patientSel.value;
      if (activePatient && activePatient.setActiveKey) {
        void activePatient.setActiveKey(v, { source: "analise" }).then(function () {
          void refreshPatientContext();
        });
        return;
      }
      void refreshPatientContext();
    });
  }

  document.addEventListener("aghu:active-patient-changed", function (ev) {
    var detail = ev.detail || {};
    if (detail.source === "analise") return;
    void refreshPatientContext();
  });

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.tab === "analise") void refreshPatientContext();
    });
  });

  function resetClinicalUiState() {
    currentPatientKey = NO_PATIENT_KEY;
    loadedArchiveKey = null;
    novaConversa();
    if (patientHintEl) {
      patientHintEl.textContent = "";
      patientHintEl.classList.remove("warn");
    }
    if (patientSel && activePatient) {
      void activePatient.refreshSelect(patientSel, { includeAnonymous: true });
    }
  }

  document.addEventListener("aghu:clinical-storage-cleared", function () {
    resetClinicalUiState();
  });

  function startAnalise() {
    void refreshPatientContext();
  }

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startAnalise);
  } else {
    startAnalise();
  }
})();
