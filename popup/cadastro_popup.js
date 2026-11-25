// cadastro_popup.js — FEAT-109: demografia + internações POL → archive / episodes
"use strict";

(function () {
  const btnExtrair = document.getElementById("btnExtractCadastro");
  const statusEl = document.getElementById("cd-status");
  const metaEl = document.getElementById("cd-meta");
  const demoEl = document.getElementById("cd-demo");
  const tableBody = document.getElementById("cd-internacoes-body");
  const patientSel = document.getElementById("cdPatientSelect");
  const patientHint = document.getElementById("cdPatientHint");
  const activePatient = window.AghuPopupActivePatient;

  if (!btnExtrair) return;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includePage: true });
  }

  const EXTRACT_TIMEOUT_MS = 120000;

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
    btnExtrair.textContent = on ? "Extraindo…" : "Extrair cadastro";
  }

  function updatePatientHint(patient) {
    if (!patientHint) return;
    if (patient && patient.prontuario) {
      const nome = patient.primeiroNome || patient.nomeCompleto || "";
      patientHint.textContent = nome
        ? "Ativo: " + nome + " · pront. " + patient.prontuario
        : "Ativo: pront. " + patient.prontuario;
      patientHint.classList.remove("warn");
    } else {
      patientHint.textContent = "";
      patientHint.classList.remove("warn");
    }
  }

  function resolvePatientKey(patient) {
    const selectValue =
      patientSel && patientSel.value ? patientSel.value : null;
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

  function renderDemo(demo) {
    if (!demoEl) return;
    if (!demo) {
      demoEl.style.display = "none";
      demoEl.textContent = "";
      return;
    }
    const addr = demo.patientAddress || null;
    const lines = [
      "Nome: " + (demo.nomeCompleto || "—"),
      "Sexo: " + (demo.sexo || "—"),
      "DN: " + (demo.dataNascimentoISO || "—"),
      "Nome da mãe: " + (demo.nomeMae || "—"),
      "Cartão SUS: " + (demo.cartaoSus || "—"),
      "Endereço: " +
        (addr
          ? [addr.street, addr.number, addr.neighborhood, addr.city, addr.state]
              .filter(Boolean)
              .join(", ")
          : "—"),
    ];
    if (demo.local && demo.local.nomePai) {
      lines.push("Pai (local): " + demo.local.nomePai);
    }
    demoEl.textContent = lines.join("\n");
    demoEl.style.display = "block";
  }

  function renderInternacoes(rows) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "Nenhuma internação extraída.";
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }
    const hist = window.AghuPatientPolHistoricoInternacoes;
    const canon =
      hist && hist.canonicalizeActiveRows
        ? hist.canonicalizeActiveRows(list)
        : list;
    for (let i = 0; i < canon.length; i++) {
      const r = canon[i];
      const tr = document.createElement("tr");
      const cells = [
        r.startedAtBr || r.startedAt || "—",
        r.endedAtBr || r.endedAt || "—",
        r.especialidade || r.label || "—",
        r.staff || "—",
        r.status === "active" ? "Ativa" : "Encerrada",
      ];
      for (let c = 0; c < cells.length; c++) {
        const td = document.createElement("td");
        td.textContent = cells[c];
        tr.appendChild(td);
      }
      tableBody.appendChild(tr);
    }
  }

  async function applyCadastroToArchive(patientKey, resposta) {
    const api = window.AghuCadastroApplyArchive;
    if (!api || !api.applyCadastroToArchive) {
      throw new Error("AghuCadastroApplyArchive indisponível.");
    }
    return api.applyCadastroToArchive(patientKey, resposta);
  }

  async function extrairCadastro() {
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
    renderDemo(null);
    if (tableBody) tableBody.innerHTML = "";
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
        "erro",
      );
      setExtraindo(false);
      return;
    }

    if (tabApi && tabApi.persistAghuTabId) {
      try {
        await tabApi.persistAghuTabId(tabId);
      } catch (_e) {}
    }

    setStatus("Extraindo cadastro no POL (Dados + Histórico)…", "info");

    let resposta;
    try {
      if (tabApi && tabApi.sendTabMessageWithTimeout) {
        resposta = await tabApi.sendTabMessageWithTimeout(
          tabId,
          { action: "extractPatientCadastro" },
          {
            timeoutMs: EXTRACT_TIMEOUT_MS,
            injectFiles: tabApi.CADASTRO_SCRIPT_FILES,
          },
        );
      } else {
        resposta = await browser.tabs.sendMessage(tabId, {
          action: "extractPatientCadastro",
        });
      }
    } catch (e) {
      const msg =
        e && e.message === "timeout_extracao"
          ? "Tempo esgotado na extração de cadastro. Tente de novo."
          : "Erro ao comunicar com a página: " +
            (e && e.message ? e.message : "desconhecido");
      setStatus(msg, "erro");
      setExtraindo(false);
      return;
    }

    if (!resposta || !resposta.ok) {
      setStatus(
        (resposta && resposta.error) || "Falha ao extrair cadastro.",
        "erro",
      );
      setExtraindo(false);
      return;
    }

    const patientKey = resolvePatientKey(resposta);
    updatePatientHint(resposta);
    renderDemo(resposta.demographics);
    renderInternacoes(resposta.internacoes);

    if (!patientKey) {
      setStatus(
        "Cadastro lido, mas prontuário/paciente não identificado para gravar.",
        "warn",
      );
      setExtraindo(false);
      return;
    }

    let mergeInfo = { episodesCount: 0, imported: 0 };
    try {
      mergeInfo = await applyCadastroToArchive(patientKey, resposta);
    } catch (e) {
      setStatus(
        "Extraído, mas falha ao gravar local: " +
          (e && e.message ? e.message : "erro"),
        "erro",
      );
      setExtraindo(false);
      return;
    }

    if (metaEl) {
      metaEl.style.display = "block";
      metaEl.textContent =
        "Internações: " +
        (Array.isArray(resposta.internacoes) ? resposta.internacoes.length : 0) +
        " · episódios: " +
        mergeInfo.episodesCount +
        (resposta.restoredTab
          ? " · aba restaurada: " + resposta.restoredTab
          : "");
    }

    setStatus("Cadastro gravado localmente. A sincronizar…", "ok");
    setExtraindo(false);

    if (window.AghuPopupSync && window.AghuPopupSync.scheduleSyncAfterLocalSave) {
      window.AghuPopupSync.scheduleSyncAfterLocalSave(patientKey, (syncMsg, syncOut) => {
        const syncOk = !!(syncOut && syncOut.ok);
        if (syncMsg && !syncOk) {
          setStatus(
            "Cadastro local preservado. Sync: " + syncMsg,
            "warn",
          );
        } else if (syncMsg) {
          setStatus("Cadastro gravado. " + syncMsg, "ok");
        } else {
          setStatus("Cadastro gravado localmente.", "ok");
        }
      });
    }
  }

  btnExtrair.addEventListener("click", function () {
    extrairCadastro();
  });

})();

