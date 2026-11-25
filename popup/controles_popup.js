// controles_popup.js
// Gerencia a aba Controles no popup da extensão AGHU
// Depende dos elementos definidos em popup.html (panel-controles)
"use strict";

(function () {
  let ultimoTexto = '';
  let ultimoTextoCanonico = '';

  // ── Elementos ──────────────────────────────────────────────────────────────
  const btnExtrair = document.getElementById('btnExtractControles');
  const btnCopiar  = document.getElementById('btnCopyControles');
  const statusEl   = document.getElementById('ctrl-status');
  const metaEl     = document.getElementById('ctrl-meta');
  const outputEl   = document.getElementById('ctrl-output');
  const patientSel = document.getElementById('ctrlPatientSelect');
  const patientHint = document.getElementById('ctrlPatientHint');
  const activePatient = window.AghuPopupActivePatient;
  const extSettings = window.AghuExtensionSettings;

  if (!btnExtrair) return; // segurança: painel não montado

  function currentPaFormat() {
    if (window.AghuPaFormatControls && typeof window.AghuPaFormatControls.getCachedPaFormat === "function") {
      return window.AghuPaFormatControls.getCachedPaFormat();
    }
    return "minmax";
  }

  function textoParaVista(canonico) {
    var view = window.AghuControlesPaView;
    if (!view || typeof view.applyPaFormatView !== "function") return canonico || "";
    return view.applyPaFormatView(canonico || "", currentPaFormat());
  }

  function renderControlesTexto() {
    ultimoTexto = textoParaVista(ultimoTextoCanonico);
    if (!outputEl) return;
    outputEl.textContent = ultimoTexto;
    outputEl.style.display = ultimoTexto ? "block" : "none";
  }

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includePage: true });
  }

  const btnExtrairDefault = btnExtrair.cloneNode(true);
  const btnCopiarDefault  = btnCopiar.cloneNode(true);

  function restoreBtnExtrair() {
    const n = btnExtrairDefault.cloneNode(true);
    btnExtrair.replaceChildren(...n.childNodes);
  }

  function restoreBtnCopiar() {
    const n = btnCopiarDefault.cloneNode(true);
    btnCopiar.replaceChildren(...n.childNodes);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function setStatus(msg, tipo) {
    if (!msg) { statusEl.style.display = 'none'; return; }
    statusEl.textContent   = msg;
    statusEl.className     = tipo || 'info';
    statusEl.style.display = 'block';
  }

  function setExtraindo(on) {
    btnExtrair.disabled = on;
    if (on) {
      btnExtrair.replaceChildren(document.createTextNode('Extraindo…'));
    } else {
      restoreBtnExtrair();
    }
  }

  function updatePatientHint(patient) {
    if (!patientHint) return;
    if (patient && patient.ok && patient.prontuario) {
      const leitoPart = patient.leito ? ` · leito ${patient.leito}` : '';
      patientHint.textContent = `Ativo: ${patient.primeiroNome} · pront. ${patient.prontuario}${leitoPart}`;
      patientHint.classList.remove('warn');
    } else if (patient && patient.missing && patient.missing.length) {
      patientHint.textContent = `Texto da página: falta ${patient.missing.join(', ')}`;
      patientHint.classList.add('warn');
    } else {
      patientHint.textContent = '';
      patientHint.classList.remove('warn');
    }
  }

  async function refreshCtrlPatientSelect(selectedKey) {
    if (!patientSel || !activePatient) return;
    await activePatient.refreshSelect(patientSel, {
      includePage: true,
      selectedKey: selectedKey,
    });
  }

  async function loadControlesForPatient(patientKey) {
    if (!patientKey || !window.AghuControlesArchive) return false;
    const snap = await window.AghuControlesArchive.loadControlesSnapshot(patientKey);
    if (!snap) return false;
    displaySnapshot(snap, {});
    setStatus('↩ Controles carregados do arquivo local.', 'ok');
    return true;
  }

  function fillMetaFromExtract(resposta) {
    metaEl.replaceChildren();
    const windowCount = resposta.windowCount || 1;
    if (windowCount > 1) {
      metaEl.appendChild(document.createTextNode('📅 '));
      const strongW = document.createElement('strong');
      strongW.textContent = String(windowCount);
      metaEl.appendChild(strongW);
      metaEl.appendChild(document.createTextNode(' janela(s) · '));
      const strongN = document.createElement('strong');
      strongN.textContent = String(resposta.n != null ? resposta.n : '?');
      metaEl.appendChild(strongN);
      metaEl.appendChild(document.createTextNode(' registro(s) (07h–07h)'));
    } else {
      metaEl.appendChild(document.createTextNode('📅 '));
      const strongP = document.createElement('strong');
      strongP.textContent = resposta.periodo || '—';
      metaEl.appendChild(strongP);
      metaEl.appendChild(document.createTextNode(' \u00a0·\u00a0 '));
      const strongN = document.createElement('strong');
      strongN.textContent = String(resposta.n != null ? resposta.n : '?');
      metaEl.appendChild(strongN);
      metaEl.appendChild(document.createTextNode(' registro(s)'));
    }
    metaEl.style.display = 'block';
  }

  async function resolveCtrlPatientKey() {
    if (activePatient && activePatient.getActiveKey) {
      const globalKey = activePatient.getActiveKey();
      if (globalKey && activePatient.isRealPatientKey(globalKey)) return globalKey;
    }
    if (patientSel && patientSel.value && patientSel.value !== '__page__') {
      return patientSel.value;
    }
    return null;
  }

  function displaySnapshot(snap, opts) {
    opts = opts || {};
    ultimoTextoCanonico = snap.texto || '';
    renderControlesTexto();
    fillMetaFromExtract({
      periodo: snap.periodo,
      n: snap.n,
      windowCount: 1,
    });
    if (!opts.skipCopiar) btnCopiar.classList.remove('hidden');
    updatePatientHint({
      ok: true,
      primeiroNome: snap.primeiroNome,
      prontuario: snap.prontuario,
      leito: snap.leito,
      missing: [],
    });
  }

  // ── Extração ───────────────────────────────────────────────────────────────
  const EXTRACT_TIMEOUT_MSG =
    'A página não respondeu. Feche o popup, clique no ícone da extensão na aba de Controles do AGHU e tente de novo.';

  async function extrairControles() {
    if (window.AghuBillingStatus && window.AghuBillingStatus.guardExtraction) {
      const gate = await window.AghuBillingStatus.guardExtraction();
      if (!gate.ok) {
        const msg = window.AghuBillingStatus.formatUpgradeMessage(gate);
        setStatus(msg || 'Limite diário de extrações atingido.', 'erro');
        return;
      }
    }

    setStatus('Buscando aba ativa…', 'info');
    setExtraindo(true);
    btnCopiar.classList.add('hidden');
    outputEl.style.display = 'none';
    metaEl.style.display   = 'none';

    const tabApi = window.AghuActiveTab;
    let tabId = null;

    try {
      if (tabApi && tabApi.resolveAghuTabIdFromBrowser) {
        tabId = await tabApi.resolveAghuTabIdFromBrowser();
      } else {
        const stored = await browser.storage.local.get('aghu_source_tab_id');
        tabId = stored.aghu_source_tab_id;
      }
    } catch (e) {
      setStatus('Erro ao acessar storage.', 'erro');
      setExtraindo(false);
      return;
    }

    if (!tabId) {
      setStatus('Nenhuma aba AGHU encontrada. Abra Controles do Paciente e clique no ícone da extensão.', 'erro');
      setExtraindo(false);
      return;
    }

    if (tabApi && tabApi.persistAghuTabId) {
      try {
        await tabApi.persistAghuTabId(tabId);
      } catch (_e) { /* ignore */ }
    }

    setStatus('Extraindo controles na página…', 'info');

    let resposta;
    try {
      if (tabApi && tabApi.sendTabMessageWithTimeout) {
        resposta = await tabApi.sendTabMessageWithTimeout(
          tabId,
          { action: 'extrairControles' },
          { injectFiles: tabApi.CONTROLES_SCRIPT_FILES }
        );
      } else {
        resposta = await browser.tabs.sendMessage(tabId, {
          action: 'extrairControles',
        });
      }
    } catch (e) {
      const msg =
        e && e.message === 'timeout_extracao'
          ? EXTRACT_TIMEOUT_MSG
          : 'Erro ao comunicar com a página: ' + (e && e.message ? e.message : 'desconhecido');
      setStatus(msg, 'erro');
      setExtraindo(false);
      return;
    } finally {
      setExtraindo(false);
    }

    const patient = resposta && resposta.patient ? resposta.patient : null;
    updatePatientHint(patient);

    if (!resposta || !resposta.ok) {
      if (resposta && resposta.texto) {
        outputEl.textContent = resposta.texto;
        outputEl.style.display = 'block';
      }
      setStatus(resposta?.erro || 'Erro desconhecido na extração.', 'erro');
      return;
    }

    if (resposta.warnings && resposta.warnings.length) {
      console.log('[AGHU] controles extract warnings', { count: resposta.warnings.length });
    }

    if (window.AghuBillingStatus && window.AghuBillingStatus.recordExtraction) {
      await window.AghuBillingStatus.recordExtraction({ success: true });
    }

    ultimoTextoCanonico = resposta.texto || '';
    renderControlesTexto();

    fillMetaFromExtract(resposta);

    const entriesToSave = Array.isArray(resposta.entries) && resposta.entries.length
      ? resposta.entries
      : [{
          texto: resposta.texto,
          periodo: resposta.periodo,
          n: resposta.n,
        }];

    if (
      window.AghuControlesArchive &&
      patient &&
      patient.ok &&
      patient.patientKey
    ) {
      const saveFn = window.AghuControlesArchive.saveControlesEntries
        || window.AghuControlesArchive.saveControlesSnapshot;
      if (window.AghuControlesArchive.saveControlesEntries) {
        await window.AghuControlesArchive.saveControlesEntries(
          {
            patientKey: patient.patientKey,
            primeiroNome: patient.primeiroNome,
            nomeCompleto: patient.nomeCompleto || '',
            prontuario: patient.prontuario,
            leito: patient.leito || '',
          },
          entriesToSave,
        );
      } else {
        await saveFn(
          {
            patientKey: patient.patientKey,
            primeiroNome: patient.primeiroNome,
            nomeCompleto: patient.nomeCompleto || '',
            prontuario: patient.prontuario,
            leito: patient.leito || '',
          },
          entriesToSave[0],
        );
      }
      await refreshCtrlPatientSelect(patient.patientKey);
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(patient.patientKey, { source: 'controles-extract' });
      }
      if (window.AghuControlesArchive.pruneStale) {
        await window.AghuControlesArchive.pruneStale();
      }
      const windowLabel = resposta.windowCount > 1
        ? `${resposta.windowCount} janelas (07h) extraídas e salvas`
        : 'Extração salva localmente';
      const warnSuffix =
        resposta.warnings && resposta.warnings.length
          ? ` ⚠ ${resposta.warnings[0]}`
          : '';
      setStatus(`✅ ${windowLabel}${warnSuffix}`, 'ok');
      if (window.AghuPopupSync && window.AghuPopupSync.scheduleSyncAfterLocalSave) {
        window.AghuPopupSync.scheduleSyncAfterLocalSave(patient.patientKey, (syncMsg) => {
          const baseOk =
            syncMsg && syncMsg.indexOf('sincronizado') !== -1
              ? '✅ Extração salva localmente · '
              : '✅ Extração salva localmente · ';
          setStatus(
            syncMsg
              ? baseOk + syncMsg + warnSuffix
              : '✅ Extração concluída e salva localmente por paciente.' + warnSuffix,
            syncMsg && syncMsg.indexOf('sincronizado') !== -1 ? 'ok' : 'info',
          );
        });
      } else {
        setStatus('✅ Extração concluída e salva localmente por paciente.', 'ok');
      }
    } else {
      const miss =
        patient && patient.missing && patient.missing.length
          ? patient.missing.join(', ')
          : 'nome/prontuário';
      setStatus(
        `✅ Texto extraído. ⚠ Arquivo por paciente não salvo (não encontrado na página: ${miss}).`,
        'info'
      );
      await refreshCtrlPatientSelect(null);
    }

    btnCopiar.classList.remove('hidden');
  }

  // ── Copiar ─────────────────────────────────────────────────────────────────
  async function copiarTexto() {
    if (!ultimoTexto) return;
    try {
      await navigator.clipboard.writeText(ultimoTexto.toLocaleUpperCase("pt-BR"));
      btnCopiar.replaceChildren(document.createTextNode('✅ Copiado!'));
      btnCopiar.disabled = true;
      setTimeout(() => {
        restoreBtnCopiar();
        btnCopiar.disabled  = false;
      }, 2000);
    } catch(e) {
      setStatus('Erro ao copiar. Verifique permissões.', 'erro');
    }
  }

  if (patientSel) {
    patientSel.addEventListener('change', async () => {
      if (activePatient && activePatient.isSyncing()) return;
      const v = patientSel.value;
      if (activePatient && activePatient.isPageValue(v)) {
        if (patientHint) {
          patientHint.textContent = 'Use Extrair na página de Controles do paciente.';
          patientHint.classList.remove('warn');
        }
        return;
      }
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(v, { source: 'controles' });
      }
      await loadControlesForPatient(v);
    });
  }

  document.addEventListener('aghu:active-patient-changed', async (ev) => {
    const detail = ev.detail || {};
    if (detail.source === 'controles' || detail.source === 'controles-extract') return;
    const key = detail.patientKey;
    if (!key || !activePatient) return;
    if (activePatient.isAnonymousKey(key)) {
      if (patientHint && activePatient.updatePatientHint) {
        await activePatient.updatePatientHint(patientHint, {
          patientKey: key,
          anonymousMessage: 'Anônimo — sem paciente vinculado',
        });
      }
      return;
    }
    if (activePatient.isRealPatientKey(key)) {
      await loadControlesForPatient(key);
    }
  });

  async function startupControles() {
    try {
      if (activePatient && activePatient.ready) await activePatient.ready;
      const lk =
        activePatient && activePatient.getActiveKey
          ? activePatient.getActiveKey()
          : null;
      if (lk && activePatient && activePatient.isRealPatientKey(lk) && window.AghuControlesArchive) {
        const snap = await window.AghuControlesArchive.loadControlesSnapshot(lk);
        if (snap && snap.texto) {
          displaySnapshot(snap, { skipCopiar: false });
          setStatus('↩ Último paciente (controles) restaurado.', 'info');
        }
        await refreshCtrlPatientSelect(lk);
      } else {
        await refreshCtrlPatientSelect(lk);
      }
    } catch (e) {
      await refreshCtrlPatientSelect(null);
    }
  }

  document.addEventListener('aghu:pa-format-changed', function () {
    if (!ultimoTextoCanonico) return;
    renderControlesTexto();
  });

  function resetClinicalUiState() {
    ultimoTexto = '';
    ultimoTextoCanonico = '';
    if (outputEl) {
      outputEl.textContent = '';
      outputEl.style.display = 'none';
    }
    if (metaEl) {
      metaEl.replaceChildren();
      metaEl.style.display = 'none';
    }
    setStatus('', '');
    if (btnCopiar) btnCopiar.classList.add('hidden');
    if (patientHint) {
      patientHint.textContent = '';
      patientHint.classList.remove('warn');
    }
    void refreshCtrlPatientSelect(null);
  }

  document.addEventListener('aghu:clinical-storage-cleared', function () {
    resetClinicalUiState();
  });

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startupControles);
  } else {
    startupControles();
  }

  // ── Listeners ──────────────────────────────────────────────────────────────
  btnExtrair.addEventListener('click', extrairControles);
  btnCopiar.addEventListener('click',  copiarTexto);

})();
