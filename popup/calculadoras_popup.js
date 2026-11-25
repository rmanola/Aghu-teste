// calculadoras_popup.js — aba Calculadoras / scores (16 calculadoras)
"use strict";

(function () {
  var panel = document.getElementById("panel-calculadoras");
  if (!panel) return;

  var searchEl = document.getElementById("calcSearch");
  var mountEl = document.getElementById("calc-mount");
  var patientSel = document.getElementById("calcPatientSelect");
  var patientHintEl = document.getElementById("calcPatientHint");
  var activePatient = window.AghuPopupActivePatient;
  if (!mountEl) return;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includeAnonymous: true });
  }

  function emptyContext() {
    return {
      patientKey: "local",
      exams: [],
      pii: { sexo: "" },
      passometroHeader: null,
      passometro: null,
      controles: null,
    };
  }

  function mountCalculators(context) {
    var host = window.AghuCalculatorPopupHost;
    if (!host) return false;
    host.mount({
      mountEl: mountEl,
      searchEl: searchEl,
      context: context || emptyContext(),
    });
    return true;
  }

  function resolveContextPatientKey() {
    if (!activePatient) return null;
    if (activePatient.isAnonymous()) return null;
    return activePatient.getActiveKey();
  }

  function sessionMetaForKey(meta, patientKey) {
    if (!meta || !patientKey || patientKey === "local") return null;
    if (meta.patientKey && meta.patientKey !== patientKey) return null;
    return meta;
  }

  async function resolvePii(patientKey, sessionMeta) {
    var rec = null;
    if (window.AghuPatientArchive && patientKey && patientKey !== "local") {
      rec = await window.AghuPatientArchive.loadPatientRecord(patientKey);
    }

    var cloud = null;

    var meta = sessionMeta;
    if (!meta) {
      var examsApi = window.AghuPopupExams;
      meta =
        examsApi && examsApi.getPatientMeta ? examsApi.getPatientMeta() : null;
    }
    if (meta && meta.patientKey && meta.patientKey !== patientKey) {
      meta = null;
    }

    if (window.AghuPatientPiiContext && window.AghuPatientPiiContext.mergePatientPii) {
      return window.AghuPatientPiiContext.mergePatientPii({
        record: rec,
        meta: meta,
        cloud: cloud,
      });
    }

    var pii = { sexo: "" };
    if (rec && rec.sexo) pii.sexo = rec.sexo;
    if (rec && rec.dataNascimento) {
      pii.dataNascimento = rec.dataNascimento;
    } else if (rec && rec.dataNascimentoISO) {
      pii.dataNascimento = rec.dataNascimentoISO;
    }
    if (cloud && cloud.sexo && !pii.sexo) pii.sexo = cloud.sexo;
    if (cloud && cloud.dataNascimento && !pii.dataNascimento) {
      pii.dataNascimento = cloud.dataNascimento;
    }
    if (meta && meta.sexo && !pii.sexo) pii.sexo = meta.sexo;
    if (!pii.dataNascimento) {
      var metaDob = meta
        ? meta.dataNascimentoISO || meta.dataNascimento || ""
        : "";
      if (metaDob) pii.dataNascimento = metaDob;
    }
    return pii;
  }

  async function resolveExamsForPatient(patientKey, meta) {
    if (!patientKey || patientKey === "local") return [];
    var api = window.AghuPopupExams;
    if (meta && meta.patientKey === patientKey && api && api.getExams) {
      return api.getExams();
    }
    if (window.AghuPatientArchive && window.AghuPatientArchive.loadPatientRecord) {
      var rec = await window.AghuPatientArchive.loadPatientRecord(patientKey);
      if (rec && window.AghuPatientArchive.examsRecordToArray) {
        return window.AghuPatientArchive.examsRecordToArray(rec);
      }
    }
    return [];
  }

  async function updatePatientHint(patientKey) {
    if (!activePatient || !activePatient.updatePatientHint) return;
    await activePatient.updatePatientHint(patientHintEl, {
      patientKey: patientKey,
      anonymousMessage: "Anônimo — cálculos manuais, sem dados extraídos",
      emptyMessage:
        "Sem paciente — selecione um prontuário ou use Anônimo",
    });
  }

  async function loadPatientContext() {
    if (!window.AghuCalculatorPopupHost) return;

    if (patientSel && activePatient && activePatient.refreshSelect) {
      await activePatient.refreshSelect(patientSel, {
        includeAnonymous: true,
        selectedKey: activePatient.getActiveKey(),
      });
    }

    if (activePatient && activePatient.isAnonymous()) {
      await updatePatientHint(activePatient.ANONYMOUS_VALUE);
      mountCalculators(emptyContext());
      return;
    }

    var api = window.AghuPopupExams;
    var meta = api ? api.getPatientMeta() : null;
    var patientKey = resolveContextPatientKey();
    await updatePatientHint(patientKey);

    if (!patientKey) {
      mountCalculators(emptyContext());
      return;
    }

    var exams = await resolveExamsForPatient(patientKey, meta);

    var pmHeader = null;
    var passometro = null;
    try {
      if (window.AghuPassometroArchive) {
        var pmSnap =
          await window.AghuPassometroArchive.loadPassometroSnapshot(patientKey);
        if (pmSnap) {
          passometro = pmSnap;
          if (pmSnap.header) pmHeader = pmSnap.header;
        }
      }
    } catch (_e) {
      /* passômetro opcional */
    }

    var controles = null;
    try {
      if (window.AghuControlesArchive) {
        controles = await window.AghuControlesArchive.loadControlesSnapshot(
          patientKey,
        );
      }
    } catch (_e) {
      /* controles opcionais */
    }

    var pii = { sexo: "" };
    try {
      pii = await resolvePii(
        patientKey,
        sessionMetaForKey(meta, patientKey),
      );
    } catch (_e) {
      /* PII opcional */
    }

    mountCalculators({
      patientKey: patientKey,
      exams: exams,
      pii: pii,
      passometroHeader: pmHeader,
      passometro: passometro,
      controles: controles,
    });
  }

  function onCalculadorasTabActivated() {
    mountCalculators(emptyContext());
    void loadPatientContext();
  }

  if (patientSel) {
    patientSel.addEventListener("change", function () {
      if (activePatient && activePatient.isSyncing()) return;
      var v = patientSel.value;
      if (activePatient && activePatient.setActiveKey) {
        void activePatient.setActiveKey(v, { source: "calculadoras" }).then(function () {
          void loadPatientContext();
        });
        return;
      }
      void loadPatientContext();
    });
  }

  document.addEventListener("aghu:active-patient-changed", function (ev) {
    var detail = ev.detail || {};
    if (detail.source === "calculadoras") return;
    void loadPatientContext();
  });

  document.addEventListener("aghu:exams-updated", function () {
    void loadPatientContext();
  });

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.tab === "calculadoras") onCalculadorasTabActivated();
    });
  });

  function resetClinicalUiState() {
    mountCalculators(emptyContext());
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

  function startCalculadoras() {
    mountCalculators(emptyContext());
    void loadPatientContext();
  }

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startCalculadoras);
  } else {
    startCalculadoras();
  }
})();
