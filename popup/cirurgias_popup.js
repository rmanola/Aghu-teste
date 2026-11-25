// cirurgias_popup.js — FEAT-062: extrair cirurgias do POL → passômetro
"use strict";

(function () {
  const btnExtrair = document.getElementById("btnExtractCirurgias");
  const statusEl = document.getElementById("cx-status");
  const metaEl = document.getElementById("cx-meta");
  const outputEl = document.getElementById("cx-output");
  const patientSel = document.getElementById("cxPatientSelect");
  const patientHint = document.getElementById("cxPatientHint");
  const activePatient = window.AghuPopupActivePatient;

  if (!btnExtrair) return;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includePage: true });
  }

  const EXTRACT_TIMEOUT_MS = 180000;

  function setStatus(msg, tipo) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.style.display = "none";
      return;
    }
    statusEl.textContent = msg;
    statusEl.className = tipo || "info";
    statusEl.style.display = "block";
  }

  function setExtraindo(on) {
    btnExtrair.disabled = on;
    btnExtrair.textContent = on ? "Extraindo…" : "Extrair Cirurgias";
  }

  function updatePatientHint(patient) {
    if (!patientHint) return;
    if (patient && patient.ok && patient.prontuario) {
      const nome = patient.primeiroNome || patient.nomeCompleto || "";
      patientHint.textContent = nome
        ? "Ativo: " + nome + " · pront. " + patient.prontuario
        : "Ativo: pront. " + patient.prontuario;
      patientHint.classList.remove("warn");
    } else if (patient && patient.missing && patient.missing.length) {
      patientHint.textContent =
        "Texto da página: falta " + patient.missing.join(", ");
      patientHint.classList.add("warn");
    } else if (patient && patient.prontuario) {
      const nome = patient.primeiroNome || patient.nomeCompleto || "";
      patientHint.textContent = nome
        ? nome + " · " + patient.prontuario
        : String(patient.prontuario);
      patientHint.classList.remove("warn");
    } else {
      patientHint.textContent = "";
      patientHint.classList.remove("warn");
    }
  }

  function resolvePatientKey(patient) {
    const gate = window.AghuCirurgiasPatientGate;
    const selectValue =
      patientSel && patientSel.value ? patientSel.value : null;
    if (gate && gate.resolveCirurgiasPatientKey) {
      return gate.resolveCirurgiasPatientKey(
        patient,
        selectValue,
        window.AghuPatientIdentity
      );
    }
    // Fallback se o módulo não carregou: preferir página com prontuário.
    if (patient && patient.prontuario && patient.patientKey) {
      return patient.patientKey;
    }
    if (
      patient &&
      patient.prontuario &&
      window.AghuPatientIdentity &&
      window.AghuPatientIdentity.buildPatientKey
    ) {
      return window.AghuPatientIdentity.buildPatientKey(patient.prontuario);
    }
    if (selectValue && selectValue !== "__page__") return selectValue;
    if (patient && patient.patientKey) return patient.patientKey;
    return null;
  }

  function archive() {
    return window.AghuPassometroArchive || null;
  }

  function schema() {
    return window.AghuPassometroSchema || null;
  }

  function mergeApi() {
    return window.AghuCirurgiasMerge || null;
  }

  function summarizeCirurgias(list) {
    if (!Array.isArray(list) || !list.length) return "(nenhuma)";
    return list
      .map(function (c, i) {
        return (
          i +
          1 +
          ") " +
          (c.data || "?") +
          " — " +
          (c.nome || "(sem nome)") +
          (c.equipe ? " [equipe]" : "") +
          (c.achadosOperatorios ? " [achados]" : "") +
          (c.descricao ? " [descricao]" : "")
        );
      })
      .join("\n");
  }

  async function syncAfterSave(patientKey) {
    if (!patientKey || !window.AghuSupabaseSync) return null;
    const out = await window.AghuSupabaseSync.syncPatient(patientKey);
    return window.AghuSupabaseSync.formatSyncMessage(out);
  }

  async function extrairCirurgias() {
    if (window.AghuBillingStatus && window.AghuBillingStatus.guardExtraction) {
      const gate = await window.AghuBillingStatus.guardExtraction();
      if (!gate.ok) {
        const msg = window.AghuBillingStatus.formatUpgradeMessage(gate);
        setStatus(msg || "Limite diário de extrações atingido.", "erro");
        return;
      }
    }

    setStatus("Buscando aba AGHU…", "info");
    setExtraindo(true);
    if (outputEl) {
      outputEl.textContent = "";
      outputEl.style.display = "none";
    }
    if (metaEl) metaEl.style.display = "none";

    const tabApi = window.AghuActiveTab;
    let tabId = null;
    try {
      if (tabApi && tabApi.resolveAghuTabIdFromBrowser) {
        tabId = await tabApi.resolveAghuTabIdFromBrowser();
      } else {
        const stored = await browser.storage.local.get("aghu_source_tab_id");
        tabId = stored.aghu_source_tab_id;
      }
    } catch (_e) {
      setStatus("Erro ao acessar storage.", "erro");
      setExtraindo(false);
      return;
    }

    if (!tabId) {
      setStatus(
        "Nenhuma aba AGHU encontrada. Abra o POL do paciente e tente de novo.",
        "erro"
      );
      setExtraindo(false);
      return;
    }

    if (tabApi && tabApi.persistAghuTabId) {
      try {
        await tabApi.persistAghuTabId(tabId);
      } catch (_e) {}
    }

    setStatus("Extraindo cirurgias no POL…", "info");

    let resposta;
    try {
      if (tabApi && tabApi.sendTabMessageWithTimeout) {
        resposta = await tabApi.sendTabMessageWithTimeout(
          tabId,
          { action: "extrairCirurgias" },
          {
            timeoutMs: EXTRACT_TIMEOUT_MS,
            injectFiles: tabApi.CIRURGIAS_SCRIPT_FILES,
          }
        );
      } else {
        resposta = await browser.tabs.sendMessage(tabId, {
          action: "extrairCirurgias",
        });
      }
    } catch (e) {
      const msg =
        e && e.message === "timeout_extracao"
          ? "Tempo esgotado na extração de cirurgias. Tente de novo."
          : "Erro ao comunicar com a página: " +
            (e && e.message ? e.message : "desconhecido");
      setStatus(msg, "erro");
      setExtraindo(false);
      return;
    }

    setExtraindo(false);

    const patient = resposta && resposta.patient ? resposta.patient : null;
    updatePatientHint(patient);

    if (!resposta || (!resposta.ok && !(resposta.cirurgias || []).length)) {
      setStatus(
        (resposta && resposta.erro) || "Erro desconhecido na extração.",
        "erro"
      );
      if (outputEl && resposta) {
        outputEl.textContent =
          "Skipped: " +
          ((resposta.skipped && resposta.skipped.length) || 0) +
          " · Errors: " +
          ((resposta.errors && resposta.errors.length) || 0);
        outputEl.style.display = "block";
      }
      return;
    }

    if (window.AghuBillingStatus && window.AghuBillingStatus.recordExtraction) {
      await window.AghuBillingStatus.recordExtraction({ success: true });
    }

    const extracted = Array.isArray(resposta.cirurgias)
      ? resposta.cirurgias
      : [];
    const patientKey = resolvePatientKey(patient);
    const gate = window.AghuCirurgiasPatientGate;
    const saveGate =
      gate && gate.buildCirurgiasSaveMeta
        ? gate.buildCirurgiasSaveMeta(patient, patientKey)
        : null;

    if (!saveGate || !saveGate.ok) {
      const miss =
        (saveGate && saveGate.missing && saveGate.missing.length
          ? saveGate.missing.join(", ")
          : null) ||
        (patient && patient.missing && patient.missing.length
          ? patient.missing.join(", ")
          : "nome/prontuário");
      setStatus(
        (saveGate && saveGate.error) ||
          "Identidade incompleta na página — não gravar cirurgias (falta " +
            miss +
            ").",
        "erro"
      );
      if (outputEl) {
        outputEl.textContent = summarizeCirurgias(extracted);
        outputEl.style.display = "block";
      }
      return;
    }

    const sch = schema();
    const merge = mergeApi();
    const arch = archive();
    if (!sch || !merge || !arch) {
      setStatus("Módulos de passômetro/merge indisponíveis.", "erro");
      return;
    }

    let snap = await arch.loadPassometroSnapshot(patientKey);
    if (!snap) {
      snap = sch.emptySnap();
    }
    const merged = merge.mergeCirurgiasIntoSnap(snap, extracted, sch);
    const meta = saveGate.meta;
    await arch.savePassometroSnapshot(meta, merged.snap);

    if (
      window.AghuPatientArchive &&
      window.AghuPatientArchive.ensureMinimalPatientRecord
    ) {
      try {
        await window.AghuPatientArchive.ensureMinimalPatientRecord(meta);
      } catch (_e) {}
    }

    if (activePatient && activePatient.setActiveKey) {
      try {
        await activePatient.setActiveKey(patientKey, {
          source: "cirurgias-extract",
        });
      } catch (_e) {}
    }

    const skipN = (resposta.skipped && resposta.skipped.length) || 0;
    const errN = (resposta.errors && resposta.errors.length) || 0;
    const selectFailN = Array.isArray(resposta.errors)
      ? resposta.errors.filter(function (e) {
          return e && e.reason === "select_failed";
        }).length
      : 0;
    const otherErrN = Math.max(0, errN - selectFailN);
    const passometroLen = (
      (merged.snap.header && merged.snap.header.cirurgias) ||
      []
    ).length;
    const collapsed =
      window.AghuCirurgiasExtractOutcome &&
      window.AghuCirurgiasExtractOutcome.isBatchKeyCollapse
        ? window.AghuCirurgiasExtractOutcome.isBatchKeyCollapse({
            extractedCount: extracted.length,
            mergedLength: passometroLen,
            updated: merged.updated,
          })
        : extracted.length >= 2 &&
          passometroLen === 1 &&
          merged.updated === extracted.length;
    const parts = [
      "Cirurgias: +" + merged.added + " novas, " + merged.updated + " atualizadas",
    ];
    if (skipN) parts.push(skipN + " sem descrição");
    if (selectFailN) parts.push(selectFailN + " falha ao selecionar");
    if (otherErrN) parts.push(otherErrN + " com erro");
    if (collapsed) {
      parts.push(
        extracted.length +
          " PDFs colapsaram na mesma chave — selecione de novo a aba Cirurgias"
      );
    }
    const tipoStatus =
      collapsed || errN || (extracted.length === 0 && skipN > 0)
        ? "aviso"
        : "ok";
    setStatus(parts.join("; ") + ".", tipoStatus);

    if (metaEl) {
      metaEl.textContent =
        "Lista POL: " +
        (resposta.listCount || extracted.length) +
        " · Passômetro agora: " +
        passometroLen +
        " cirurgia(s)";
      metaEl.style.display = "block";
    }
    if (outputEl) {
      outputEl.textContent = summarizeCirurgias(
        (merged.snap.header && merged.snap.header.cirurgias) || []
      );
      outputEl.style.display = "block";
    }

    console.log("[AGHU] cirurgias extract saved", {
      added: merged.added,
      updated: merged.updated,
      skipped: skipN,
      errors: errN,
    });

    try {
      const syncMsg = await syncAfterSave(patientKey);
      if (syncMsg) {
        const syncOk = /sincronizado/i.test(syncMsg);
        setStatus(
          statusEl.textContent + " · " + syncMsg,
          syncOk ? "ok" : "aviso"
        );
      }
    } catch (_e) {
      setStatus(
        statusEl.textContent + " · Sync falhou (dados locais preservados).",
        "aviso"
      );
    }
  }

  document.addEventListener("aghu:active-patient-changed", async (ev) => {
    const detail = ev.detail || {};
    if (detail.source === "cirurgias" || detail.source === "cirurgias-extract") {
      return;
    }
    const key = detail.patientKey;
    if (!key || !activePatient) return;
    if (activePatient.isAnonymousKey(key)) {
      if (patientHint && activePatient.updatePatientHint) {
        await activePatient.updatePatientHint(patientHint, {
          patientKey: key,
          anonymousMessage: "Anônimo — sem paciente vinculado",
        });
      }
      if (outputEl) {
        outputEl.textContent = "";
        outputEl.style.display = "none";
      }
      if (metaEl) {
        metaEl.replaceChildren();
        metaEl.style.display = "none";
      }
      return;
    }
    if (activePatient.isRealPatientKey(key)) {
      if (patientSel && activePatient.refreshSelect) {
        await activePatient.refreshSelect(patientSel, {
          includePage: true,
          selectedKey: key,
        });
      }
      if (patientHint && activePatient.updatePatientHint) {
        await activePatient.updatePatientHint(patientHint, {
          patientKey: key,
        });
      }
    }
  });

  btnExtrair.addEventListener("click", extrairCirurgias);
})();
