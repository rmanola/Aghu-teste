/**
 * Aba Receitas na popup — wiring paciente + tab activation.
 */
(function () {
  "use strict";

  var panel = document.getElementById("panel-receitas");
  if (!panel) return;

  var mountEl = document.getElementById("receitas-mount");
  var statusEl = document.getElementById("receitas-status");
  if (!mountEl) return;

  var AVULSO_KEY = "_receita_avulso";

  var userPrescriber = { name: "", crmNumber: "", crmUf: "", specialty: "" };
  var userTemplates = [];

  function schemaApi() {
    return window.AghuReceitaSchema;
  }

  function hostApi() {
    return window.AghuReceitaPopupHost;
  }

  function templateSchemaApi() {
    return window.AghuReceitaTemplateSchema;
  }

  function emptySnap() {
    var schema = schemaApi();
    if (!schema) return { version: 1, receitas: [], atualizadoEm: null };
    return {
      version: 1,
      receitas: [schema.emptyReceitaDoc()],
      atualizadoEm: Date.now(),
    };
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
    if (!prefs || !cfg || typeof cfg.isConfigured !== "function" || !cfg.isConfigured()) {
      return;
    }
    try {
      var data = await prefs.readUserPreferences([
        "prescriber_profile",
        "receita_templates",
      ]);
      if (data && data.prescriber_profile) {
        userPrescriber = normalizePrescriber(data.prescriber_profile);
      }
      if (data && data.receita_templates) {
        userTemplates = normalizeTemplatesRow(data.receita_templates);
      }
    } catch (_e) {
      /* preferências opcionais */
    }
  }

  async function loadSnap(patientKey) {
    if (!schemaApi()) return emptySnap();
    if (!patientKey || !window.AghuReceitaArchive) return emptySnap();
    try {
      var snap = await window.AghuReceitaArchive.loadReceitaSnapshot(patientKey);
      if (snap && snap.receitas && snap.receitas.length) return snap;
    } catch (_e) {
      /* arquivo opcional */
    }
    return emptySnap();
  }

  async function loadStoredPatientAddress(patientKey) {
    if (!patientKey || !window.AghuReceitaArchive || !window.AghuReceitaArchive.loadReceitaPatientAddress) {
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

  function mountEditor(snap, meta, prescricaoSnap, avulso) {
    var host = hostApi();
    if (!host) return;
    host.mount({
      mountEl: mountEl,
      statusEl: statusEl,
      snap: snap,
      meta: meta,
      prescricaoSnap: prescricaoSnap,
      avulso: avulso,
      prescriber: userPrescriber,
      templates: userTemplates,
    });
  }

  async function loadPatientContext() {
    if (!hostApi() || !schemaApi()) return;

    await loadUserPreferences();

    var examsApi = window.AghuPopupExams;
    var meta = examsApi && examsApi.getPatientMeta ? examsApi.getPatientMeta() : null;
    var hasPatient = meta && meta.ok && meta.patientKey;

    if (hasPatient) {
      var patientKey = meta.patientKey;
      var snap = await loadSnap(patientKey);
      var storedAddr = await loadStoredPatientAddress(patientKey);
      var prescricaoSnap = await loadPrescricaoSnap(patientKey);
      mountEditor(
        snap,
        {
          patientKey: patientKey,
          primeiroNome: meta.primeiroNome || "",
          nomeCompleto: meta.nomeCompleto || meta.primeiroNome || "",
          prontuario: meta.prontuario || "",
          patientAddress: storedAddr,
        },
        prescricaoSnap,
        false,
      );
      return;
    }

    var avulsoSnap = await loadSnap(AVULSO_KEY);
    var avulsoAddr = await loadStoredPatientAddress(AVULSO_KEY);
    mountEditor(
      avulsoSnap,
      {
        patientKey: AVULSO_KEY,
        avulso: true,
        nomeCompleto: "",
        primeiroNome: "",
        prontuario: "",
        patientAddress: avulsoAddr,
      },
      null,
      true,
    );
  }

  function onReceitasTabActivated() {
    mountEditor(emptySnap(), { patientKey: AVULSO_KEY, avulso: true }, null, true);
    void loadPatientContext();
  }

  document.addEventListener("aghu:exams-updated", function () {
    void loadPatientContext();
  });

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.tab === "receitas") onReceitasTabActivated();
    });
  });

  function resetClinicalUiState() {
    mountEditor(
      emptySnap(),
      {
        patientKey: AVULSO_KEY,
        avulso: true,
        nomeCompleto: "",
        primeiroNome: "",
        prontuario: "",
      },
      null,
      true,
    );
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.style.display = "none";
    }
  }

  document.addEventListener("aghu:clinical-storage-cleared", function () {
    resetClinicalUiState();
  });

  function startReceitas() {
    mountEditor(emptySnap(), { patientKey: AVULSO_KEY, avulso: true }, null, true);
    void loadPatientContext();
  }

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startReceitas);
  } else {
    startReceitas();
  }

  window.AghuReceitasPopup = {
    refresh: function () {
      void loadPatientContext();
    },
  };
})();
