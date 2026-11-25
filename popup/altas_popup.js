/**
 * Aba Alta na popup — wiring paciente + seed (PII/passômetro/prescrições) +
 * templates (RX + texto de alta) + tab activation.
 *
 * Evolução de `receitas_popup.js` (FEAT-159): a aba «Receitas» virou «Alta»
 * (label em popup.html) e o mount `#alta-mount` monta `AghuAltaPopupHost`
 * (7 sub-abas) em vez de montar `AghuReceitaPopupHost` diretamente — o host
 * RX continua a viver dentro da sub-aba Receituário (embed, sem reescrever).
 * Regra de negócio (seed fillEmptyOnly, sync laudo/atestado/retorno,
 * templates) fica em `lib/alta-schema.js` — este ficheiro só faz wiring.
 */
(function () {
  "use strict";

  var panel = document.getElementById("panel-receitas");
  if (!panel) return;

  var mountEl = document.getElementById("alta-mount");
  var statusEl = document.getElementById("receitas-status");
  var patientSel = document.getElementById("altaPatientSelect");
  var patientHintEl = document.getElementById("altaPatientHint");
  var activePatient = window.AghuPopupActivePatient;
  if (!mountEl) return;

  var AVULSO_KEY = "_receita_avulso";

  var userPrescriber = { name: "", crmNumber: "", crmUf: "", specialty: "" };
  var userRxTemplates = [];
  var userAltaTemplatesSnap = null;
  var templatesLoading = false;
  var templatesError = null;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includeAnonymous: true });
  }

  function altaSchemaApi() {
    return window.AghuAltaSchema;
  }

  function hostApi() {
    return window.AghuAltaPopupHost;
  }

  function templateSchemaApi() {
    return window.AghuReceitaTemplateSchema;
  }

  function altaArchiveApi() {
    return window.AghuAltaArchive;
  }

  function emptySnap() {
    var schema = altaSchemaApi();
    return schema ? schema.emptyAltaSnap() : { version: 2, receitas: [] };
  }

  function normalizePrescriber(raw) {
    var p = raw && raw.profile ? raw.profile : raw;
    if (!p || typeof p !== "object") {
      return { name: "", crmNumber: "", crmUf: "", specialty: "" };
    }
    return {
      name: String(p.name || "").trim(),
      crmNumber: String(p.crmNumber || "").trim(),
      crmUf: String(p.crmUf || "").trim(),
      specialty: String(p.specialty || "").trim(),
    };
  }

  function normalizeTemplatesRow(row) {
    var tplSchema = templateSchemaApi();
    if (!tplSchema) return [];
    var snap = row && row.templates ? row.templates : row;
    var normalized = tplSchema.normalizeTemplatesSnap(snap);
    var stored = normalized.templates || [];
    var builtin = window.AghuReceitaTemplateBuiltin;
    if (builtin && typeof builtin.mergeStoredWithDefaults === "function") {
      var merged = builtin.mergeStoredWithDefaults(stored);
      return builtin.sortBuiltinsFirst
        ? builtin.sortBuiltinsFirst(merged)
        : merged;
    }
    return stored;
  }

  async function loadUserPreferences() {
    var prefs = window.AghuUserPreferencesClient;
    var cfg = window.AghuSupabaseConfig;
    templatesLoading = true;
    templatesError = null;
    if (!prefs || !cfg || typeof cfg.isConfigured !== "function" || !cfg.isConfigured()) {
      templatesLoading = false;
      return;
    }
    try {
      var data = await prefs.readUserPreferences([
        "prescriber_profile",
        "receita_templates",
        "alta_text_templates",
      ]);
      if (data && data.prescriber_profile) {
        userPrescriber = normalizePrescriber(data.prescriber_profile);
      }
      if (data && data.receita_templates) {
        userRxTemplates = normalizeTemplatesRow(data.receita_templates);
      }
      // alta_text_templates é normalizado dentro de AghuAltaPopupHost.mount()
      userAltaTemplatesSnap = (data && data.alta_text_templates) || null;
      templatesError = null;
    } catch (e) {
      // ALTAOM-AC-06 — fail-fast visível (não silencioso)
      templatesError =
        e && e.message
          ? String(e.message)
          : "Não foi possível carregar os modelos da conta.";
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.className = "sync-status sync-error";
        statusEl.textContent = templatesError;
      }
    } finally {
      templatesLoading = false;
    }
  }

  async function loadSnap(patientKey) {
    if (!altaSchemaApi()) return emptySnap();
    if (!patientKey || !altaArchiveApi()) return emptySnap();
    try {
      var snap = await altaArchiveApi().loadAltaSnapshot(patientKey);
      if (snap) return snap;
    } catch (_e) {
      /* arquivo opcional */
    }
    return emptySnap();
  }

  async function loadSeedFingerprint(patientKey) {
    if (!patientKey || !altaArchiveApi()) return "";
    try {
      return await altaArchiveApi().loadSeedFingerprint(patientKey);
    } catch (_e) {
      return "";
    }
  }

  async function loadStoredPatientAddress(patientKey) {
    if (
      !patientKey ||
      !window.AghuReceitaArchive ||
      !window.AghuReceitaArchive.loadReceitaPatientAddress
    ) {
      return null;
    }
    try {
      return await window.AghuReceitaArchive.loadReceitaPatientAddress(patientKey);
    } catch (_e) {
      return null;
    }
  }

  async function loadPrescricaoSnap(patientKey) {
    if (!patientKey || patientKey === AVULSO_KEY || !window.AghuPrescricaoArchive) {
      return null;
    }
    try {
      return await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(patientKey);
    } catch (_e) {
      return null;
    }
  }

  /** Passômetro do episódio activo — fonte de seed (DIH/diagnóstico/cirurgias). */
  async function loadPassometroSnap(patientKey) {
    if (!patientKey || patientKey === AVULSO_KEY || !window.AghuPassometroArchive) {
      return null;
    }
    try {
      return await window.AghuPassometroArchive.loadPassometroSnapshot(patientKey);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Seed obrigatório a partir do passômetro local (ALTAEXT-AC-09/10/11):
   * só reaplica quando a fingerprint muda (evita loop de render) e sempre
   * com `fillEmptyOnly` — nunca sobrescreve campo já editado pelo médico.
   * @returns {{ snap: object, seedFingerprint: string }}
   */
  function applyPassometroSeed(snap, passometroSnap, storedFingerprint) {
    var schema = altaSchemaApi();
    var host = hostApi();
    if (!schema || !host) return { snap: snap, seedFingerprint: storedFingerprint || "" };
    var nextFingerprint = host.computeAltaSeedFingerprint(passometroSnap);
    if (!host.seedFingerprintChanged(storedFingerprint, nextFingerprint)) {
      return { snap: snap, seedFingerprint: storedFingerprint || nextFingerprint || "" };
    }
    var seeded = schema.applyPassometroToAlta(snap, passometroSnap, { fillEmptyOnly: true });
    return { snap: seeded, seedFingerprint: nextFingerprint };
  }

  async function applyEncaminhamentoPiiSeed(snap, patientKey) {
    var schema = altaSchemaApi();
    if (!schema || typeof schema.applyPiiToEncaminhamento !== "function") {
      return snap;
    }
    var archive = window.AghuPatientArchive;
    if (!archive || typeof archive.loadPatientRecord !== "function") {
      return snap;
    }
    try {
      var record = await archive.loadPatientRecord(patientKey);
      if (!record) return snap;
      return schema.applyPiiToEncaminhamento(snap, record, { fillEmptyOnly: true });
    } catch (_e) {
      return snap;
    }
  }

  function mountEditor(snap, meta, extra) {
    var host = hostApi();
    if (!host) return;
    extra = extra || {};
    host.mount({
      mountEl: mountEl,
      statusEl: statusEl,
      snap: snap,
      meta: meta,
      prescricaoSnap: extra.prescricaoSnap || null,
      avulso: !!extra.avulso,
      prescriber: userPrescriber,
      rxTemplates: userRxTemplates,
      templatesLoading: templatesLoading,
      templatesError: templatesError,
      altaTemplatesSnap: userAltaTemplatesSnap,
      seedFingerprint: extra.seedFingerprint || "",
    });
  }

  /**
   * ALTARX-AC-07: não destruir o DOM (e o foco do nome) quando patientKey
   * e o modo avulso são os mesmos — ex. `aghu:exams-updated` a meio da digitação.
   */
  function mountEditorIfNeeded(snap, meta, extra) {
    var host = hostApi();
    if (!host) return;
    extra = extra || {};
    var next = {
      patientKey: (meta && meta.patientKey) || "",
      avulso: !!extra.avulso,
    };
    var current =
      typeof host.getMountedIdentity === "function" ? host.getMountedIdentity() : null;
    if (
      typeof host.shouldRemountAltaEditor === "function" &&
      !host.shouldRemountAltaEditor(current, next)
    ) {
      return;
    }
    mountEditor(snap, meta, extra);
  }

  function clearMount() {
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
    var host = hostApi();
    if (host && typeof host.clearMountedIdentity === "function") {
      host.clearMountedIdentity();
    }
  }

  /** BILL-AC-39/40 — Grátis: só extrair; kit de Alta bloqueado com CTA. */
  function showAltaBlockedUi(check) {
    clearMount();
    var wrap = document.createElement("div");
    wrap.className = "alta-billing-blocked";
    wrap.setAttribute("role", "status");

    var title = document.createElement("p");
    title.className = "calc-empty";
    title.textContent =
      (check && check.message) ||
      "Kit de Alta disponível nos planos Interno, Residente, Staff ou Research.";
    wrap.appendChild(title);

    var hint = document.createElement("p");
    hint.className = "calc-field-hint";
    hint.textContent =
      "No plano Grátis pode continuar a extrair exames (cota diária). Assine para montar e imprimir o kit de alta.";
    wrap.appendChild(hint);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = "Ver planos";
    btn.addEventListener("click", function () {
      var billing = window.AghuBillingStatus;
      if (billing && typeof billing.openPlansPanel === "function") {
        billing.openPlansPanel();
      }
    });
    wrap.appendChild(btn);
    mountEl.appendChild(wrap);
  }

  async function ensureAltaKitAllowed() {
    var billing = window.AghuBillingStatus;
    if (!billing || typeof billing.checkFeature !== "function") {
      return { ok: true };
    }
    try {
      return await billing.checkFeature("altaKit");
    } catch (_e) {
      return { ok: true };
    }
  }

  // AghuAltaPopupHost dispara este evento após gravar um modelo de texto em
  // `alta_text_templates` — mantemos o cache local em dia para não perder o
  // modelo guardado num remount (troca de aba/paciente).
  document.addEventListener("aghu:alta-template-saved", function (ev) {
    if (ev && ev.detail && ev.detail.templates) {
      userAltaTemplatesSnap = { templates: ev.detail.templates };
    }
  });

  document.addEventListener("aghu:receita-templates-saved", function (ev) {
    if (ev && ev.detail && Array.isArray(ev.detail.templates)) {
      userRxTemplates = ev.detail.templates;
    }
  });

  /**
   * ALTAEXT-AC-13: paciente activo global (`AghuPopupActivePatient`), não
   * só o meta dos exames — permite escolher qualquer prontuário do arquivo.
   */
  function resolveActivePatientKey() {
    if (!activePatient) {
      var examsApiFallback = window.AghuPopupExams;
      var metaFb =
        examsApiFallback && examsApiFallback.getPatientMeta
          ? examsApiFallback.getPatientMeta()
          : null;
      return metaFb && metaFb.ok && metaFb.patientKey ? metaFb.patientKey : null;
    }
    if (activePatient.isAnonymous && activePatient.isAnonymous()) return null;
    var key = activePatient.getActiveKey ? activePatient.getActiveKey() : null;
    if (key && activePatient.isRealPatientKey && activePatient.isRealPatientKey(key)) {
      return key;
    }
    return null;
  }

  /**
   * Meta de identidade para o kit: arquivo local do patientKey activo;
   * fallback ao meta dos exames só se for o mesmo patientKey.
   */
  async function resolvePatientMeta(patientKey) {
    var examsApi = window.AghuPopupExams;
    var sessionMeta =
      examsApi && examsApi.getPatientMeta ? examsApi.getPatientMeta() : null;
    if (
      sessionMeta &&
      sessionMeta.ok &&
      sessionMeta.patientKey === patientKey
    ) {
      return {
        patientKey: patientKey,
        primeiroNome: sessionMeta.primeiroNome || "",
        nomeCompleto:
          sessionMeta.nomeCompleto || sessionMeta.primeiroNome || "",
        prontuario: sessionMeta.prontuario || "",
      };
    }
    if (
      window.AghuPatientArchive &&
      typeof window.AghuPatientArchive.loadPatientRecord === "function"
    ) {
      try {
        var rec = await window.AghuPatientArchive.loadPatientRecord(patientKey);
        if (rec) {
          return {
            patientKey: patientKey,
            primeiroNome: rec.primeiroNome || "",
            nomeCompleto: rec.nomeCompleto || rec.primeiroNome || "",
            prontuario: rec.prontuario || "",
          };
        }
      } catch (_e) {
        /* arquivo opcional */
      }
    }
    return {
      patientKey: patientKey,
      primeiroNome: "",
      nomeCompleto: "",
      prontuario: "",
    };
  }

  async function updatePatientHint(patientKey) {
    if (!activePatient || !activePatient.updatePatientHint) return;
    await activePatient.updatePatientHint(patientHintEl, {
      patientKey: patientKey,
      anonymousMessage: "Anônimo — kit avulso, sem paciente vinculado",
      emptyMessage:
        "Sem paciente — selecione um prontuário ou use Anônimo (avulso)",
    });
  }

  async function mountAvulsoKit() {
    if (activePatient && activePatient.isAnonymous && activePatient.isAnonymous()) {
      await updatePatientHint(activePatient.ANONYMOUS_VALUE);
    } else {
      await updatePatientHint(null);
    }
    var avulsoSnap = await loadSnap(AVULSO_KEY);
    var avulsoAddr = await loadStoredPatientAddress(AVULSO_KEY);
    mountEditorIfNeeded(
      avulsoSnap,
      {
        patientKey: AVULSO_KEY,
        avulso: true,
        nomeCompleto: "",
        primeiroNome: "",
        prontuario: "",
        patientAddress: avulsoAddr,
      },
      { prescricaoSnap: null, avulso: true },
    );
  }

  async function loadPatientContext() {
    if (!hostApi() || !altaSchemaApi()) return;

    var gate = await ensureAltaKitAllowed();
    if (!gate.ok) {
      showAltaBlockedUi(gate);
      return;
    }

    await loadUserPreferences();

    if (patientSel && activePatient && activePatient.refreshSelect) {
      await activePatient.refreshSelect(patientSel, {
        includeAnonymous: true,
        selectedKey: activePatient.getActiveKey
          ? activePatient.getActiveKey()
          : null,
      });
    }

    var patientKey = resolveActivePatientKey();
    if (!patientKey) {
      await mountAvulsoKit();
      return;
    }

    await updatePatientHint(patientKey);
    var meta = await resolvePatientMeta(patientKey);
    var snap = await loadSnap(patientKey);
    var storedAddr = await loadStoredPatientAddress(patientKey);
    var prescricaoSnap = await loadPrescricaoSnap(patientKey);
    var passometroSnap = await loadPassometroSnap(patientKey);
    var storedFingerprint = await loadSeedFingerprint(patientKey);
    var seeded = applyPassometroSeed(snap, passometroSnap, storedFingerprint);
    var withEnc = await applyEncaminhamentoPiiSeed(seeded.snap, patientKey);
    mountEditorIfNeeded(
      withEnc,
      {
        patientKey: patientKey,
        primeiroNome: meta.primeiroNome || "",
        nomeCompleto: meta.nomeCompleto || meta.primeiroNome || "",
        prontuario: meta.prontuario || "",
        patientAddress: storedAddr,
      },
      {
        prescricaoSnap: prescricaoSnap,
        avulso: false,
        seedFingerprint: seeded.seedFingerprint,
      },
    );
  }

  function onAltaTabActivated() {
    void loadPatientContext();
  }

  if (patientSel) {
    patientSel.addEventListener("change", function () {
      if (activePatient && activePatient.isSyncing()) return;
      var v = patientSel.value;
      if (activePatient && activePatient.setActiveKey) {
        void activePatient.setActiveKey(v, { source: "alta" }).then(function () {
          void loadPatientContext();
        });
        return;
      }
      void loadPatientContext();
    });
  }

  document.addEventListener("aghu:active-patient-changed", function (ev) {
    var detail = ev.detail || {};
    if (detail.source === "alta") return;
    void loadPatientContext();
  });

  document.addEventListener("aghu:exams-updated", function () {
    void loadPatientContext();
  });

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.tab === "receitas") onAltaTabActivated();
    });
  });

  function resetClinicalUiState() {
    clearMount();
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.style.display = "none";
    }
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

  function startAlta() {
    void loadPatientContext();
  }

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startAlta);
  } else {
    startAlta();
  }

  // Compat: código legado pode chamar window.AghuReceitasPopup.refresh().
  window.AghuReceitasPopup = {
    refresh: function () {
      void loadPatientContext();
    },
  };
  window.AghuAltasPopup = window.AghuReceitasPopup;
})();
