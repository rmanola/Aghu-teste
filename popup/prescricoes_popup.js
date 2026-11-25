// prescricoes_popup.js
// Gerencia a aba Prescrições no popup da extensão AGHU
"use strict";

(function () {
  let ultimoTexto = '';

  const btnExtrair = document.getElementById('btnExtractPrescricao');
  const btnCopiar  = document.getElementById('btnCopyPrescricao');
  const statusEl   = document.getElementById('rx-status');
  const metaEl     = document.getElementById('rx-meta');
  const patientSel = document.getElementById('rxPatientSelect');
  const patientHint = document.getElementById('rxPatientHint');
  const activePatient = window.AghuPopupActivePatient;

  const rxDateFromEl = document.getElementById('rxDateFrom');
  const rxDateToEl = document.getElementById('rxDateTo');
  const rxDateBadge = document.getElementById('rxDateBadge');
  const btnRxToday = document.getElementById('btnRxToday');
  const btnRxYesterday = document.getElementById('btnRxYesterday');
  const btnRxClearDate = document.getElementById('btnRxClearDate');

  const entriesEl = document.getElementById('rx-entries');

  /** Snapshot completo do paciente (antes do filtro De/Até na UI). */
  let lastLoadedSnap = null;

  if (!btnExtrair) return;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includePage: true });
  }

  function dateBrApi() {
    return typeof window.AghuDateBr !== 'undefined' ? window.AghuDateBr : null;
  }

  function rxDateWindowApi() {
    return typeof window.AghuPrescricaoDateWindow !== 'undefined'
      ? window.AghuPrescricaoDateWindow
      : null;
  }

  /**
   * Lê De/Até da barra (BR) sem exigir ambos para display.
   * @returns {{ dateFrom: string|null, dateTo: string|null }}
   */
  function readRxDateStrings() {
    const fromRaw =
      rxDateFromEl && rxDateFromEl.value ? String(rxDateFromEl.value).trim() : '';
    const toRaw =
      rxDateToEl && rxDateToEl.value ? String(rxDateToEl.value).trim() : '';
    const api = dateBrApi();
    function toBr(raw) {
      if (!raw) return null;
      if (api && api.toFilterIso) {
        const iso = api.toFilterIso(raw);
        if (iso && api.toDisplayBr) return api.toDisplayBr(iso) || raw;
      }
      return raw;
    }
    return { dateFrom: toBr(fromRaw), dateTo: toBr(toRaw) };
  }

  /**
   * Filtra entries pela janela clínica se De/Até preenchidos.
   * @returns {{ entries: Array, total: number, filtered: boolean }}
   */
  function applyDisplayDateFilter(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const total = list.length;
    const rangeStr = readRxDateStrings();
    if (!rangeStr.dateFrom && !rangeStr.dateTo) {
      return { entries: list, total: total, filtered: false };
    }
    const win = rxDateWindowApi();
    if (!win || !win.prescricaoFilterRangeFromStrings) {
      return { entries: list, total: total, filtered: false };
    }
    const rangeOrErr = win.prescricaoFilterRangeFromStrings(
      rangeStr.dateFrom,
      rangeStr.dateTo
    );
    if (!rangeOrErr || rangeOrErr.error || typeof rangeOrErr.fromMs !== 'number') {
      return { entries: list, total: total, filtered: false };
    }
    const filtered = win.filterEntriesByClinicalRange
      ? win.filterEntriesByClinicalRange(list, rangeOrErr)
      : list.filter(function (e) {
          return win.prescricaoValidadeMatchesFilter(
            e.validadeInicial,
            e.validadeFinal,
            rangeOrErr
          );
        });
    return { entries: filtered, total: total, filtered: true };
  }

  function refreshDisplayFromSnap() {
    if (!lastLoadedSnap) return;
    displaySnapshot(lastLoadedSnap);
  }

  const rxDateFilter =
    window.AghuPopupDateFilter && window.AghuPopupDateFilter.createDateFilterHelpers
      ? window.AghuPopupDateFilter.createDateFilterHelpers({
          dateFromEl: rxDateFromEl,
          dateToEl: rxDateToEl,
          dateBadge: rxDateBadge,
          dateBrApi: dateBrApi,
        })
      : null;

  function initRxDateDefaults() {
    const api = dateBrApi();
    const today = api ? api.localTodayBr() : '';
    if (rxDateFilter) {
      rxDateFilter.setDateInput(rxDateFromEl, today);
      rxDateFilter.setDateInput(rxDateToEl, today);
      rxDateFilter.updateDateBadge();
      rxDateFilter.bindExamDateInputs();
    } else if (rxDateFromEl && rxDateToEl) {
      rxDateFromEl.value = today;
      rxDateToEl.value = today;
    }
  }

  if (btnRxToday) {
    btnRxToday.addEventListener('click', () => {
      const t = dateBrApi() ? dateBrApi().localTodayBr() : '';
      if (rxDateFilter) {
        rxDateFilter.setDateInput(rxDateFromEl, t);
        rxDateFilter.setDateInput(rxDateToEl, t);
        rxDateFilter.updateDateBadge();
      } else if (rxDateFromEl && rxDateToEl) {
        rxDateFromEl.value = t;
        rxDateToEl.value = t;
      }
      refreshDisplayFromSnap();
    });
  }
  if (btnRxYesterday) {
    btnRxYesterday.addEventListener('click', () => {
      const y = dateBrApi() ? dateBrApi().localYesterdayBr() : '';
      if (rxDateFilter) {
        rxDateFilter.setDateInput(rxDateFromEl, y);
        rxDateFilter.setDateInput(rxDateToEl, y);
        rxDateFilter.updateDateBadge();
      } else if (rxDateFromEl && rxDateToEl) {
        rxDateFromEl.value = y;
        rxDateToEl.value = y;
      }
      refreshDisplayFromSnap();
    });
  }
  if (btnRxClearDate) {
    btnRxClearDate.addEventListener('click', () => {
      if (rxDateFromEl) rxDateFromEl.value = '';
      if (rxDateToEl) rxDateToEl.value = '';
      if (rxDateFilter) rxDateFilter.updateDateBadge();
      refreshDisplayFromSnap();
    });
  }

  function onRxDatesChanged() {
    if (rxDateFilter) rxDateFilter.updateDateBadge();
    refreshDisplayFromSnap();
  }
  if (rxDateFromEl) {
    rxDateFromEl.addEventListener('change', onRxDatesChanged);
    rxDateFromEl.addEventListener('blur', onRxDatesChanged);
  }
  if (rxDateToEl) {
    rxDateToEl.addEventListener('change', onRxDatesChanged);
    rxDateToEl.addEventListener('blur', onRxDatesChanged);
  }

  initRxDateDefaults();

  /** @returns {{ dateFrom: string|null, dateTo: string|null } | { error: string }} */
  function readRxDateRangeForExtract() {
    if (rxDateFilter) {
      const range = rxDateFilter.readExtractDateRange();
      if (range.error) return { error: range.error };
      const fromIso = range.dateFrom;
      const toIso = range.dateTo;
      if (fromIso && toIso && fromIso > toIso) {
        return { error: 'Intervalo inválido: De deve ser ≤ Até.' };
      }
      const api = dateBrApi();
      return {
        dateFrom: fromIso && api ? api.toDisplayBr(fromIso) : fromIso,
        dateTo: toIso && api ? api.toDisplayBr(toIso) : toIso,
      };
    }
    const fromRaw = rxDateFromEl && rxDateFromEl.value ? String(rxDateFromEl.value).trim() : '';
    const toRaw = rxDateToEl && rxDateToEl.value ? String(rxDateToEl.value).trim() : '';
    return { dateFrom: fromRaw || null, dateTo: toRaw || null };
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

  function fmtLista(arr) {
    if (!arr || !arr.length) return '—';
    return Array.isArray(arr) ? arr.join('\n') : String(arr);
  }

  function fmtValor(v) {
    if (v == null || String(v).trim() === '') return '—';
    return String(v);
  }

  function updatePatientHint(patient) {
    if (!patientHint) return;
    if (patient && patient.ok && patient.prontuario) {
      patientHint.textContent = `Ativo: ${patient.primeiroNome} · pront. ${patient.prontuario}`;
      patientHint.classList.remove('warn');
    } else if (patient && patient.missing && patient.missing.length) {
      patientHint.textContent = `Texto da página: falta ${patient.missing.join(', ')}`;
      patientHint.classList.add('warn');
    } else {
      patientHint.textContent = '';
      patientHint.classList.remove('warn');
    }
  }

  function sortEntriesRecentFirst(entries) {
    if (!Array.isArray(entries) || !entries.length) return [];
    return entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
  }

  function entryTexto(entry) {
    if (!entry) return '';
    if (entry.texto && String(entry.texto).trim()) return String(entry.texto).trim();
    var parts = [];
    if (entry.data) parts.push('Validade: ' + entry.data);
    if (entry.dieta) parts.push('Dieta: ' + entry.dieta);
    if (entry.hidratacao && entry.hidratacao.length) {
      parts.push('HV:\n' + fmtLista(entry.hidratacao));
    }
    if (entry.antibiotico && entry.antibiotico.length) {
      parts.push('ATB:\n' + fmtLista(entry.antibiotico));
    }
    if (entry.analgesia && entry.analgesia.length) {
      parts.push('Analgesia:\n' + fmtLista(entry.analgesia));
    }
    var cats = listCategorySections(entry.categoriasMedicamento);
    for (var c = 0; c < cats.length; c++) {
      parts.push(cats[c].label + ':\n' + fmtLista(cats[c].items));
    }
    return parts.join('\n\n');
  }

  function listCategorySections(categorias) {
    var api =
      typeof AghuPrescricaoMedicationClassify !== 'undefined'
        ? AghuPrescricaoMedicationClassify
        : null;
    if (api && typeof api.listNonEmptyCategories === 'function') {
      return api.listNonEmptyCategories(categorias);
    }
    if (!categorias || typeof categorias !== 'object') return [];
    var out = [];
    var keys = Object.keys(categorias);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var items = categorias[k];
      if (!Array.isArray(items) || !items.length) continue;
      out.push({ key: k, label: k, items: items.slice() });
    }
    return out;
  }

  function concatEntriesTexto(entries) {
    var list = sortEntriesRecentFirst(entries);
    var texts = [];
    for (var i = 0; i < list.length; i++) {
      var t = entryTexto(list[i]);
      if (t) texts.push(t);
    }
    return texts.join('\n\n---\n\n');
  }

  function appendRxField(grid, labelText, valueText) {
    var field = document.createElement('div');
    field.className = 'rx-field';
    var lab = document.createElement('label');
    lab.textContent = labelText;
    var val = document.createElement('div');
    val.className = 'rx-value';
    val.textContent = valueText;
    field.appendChild(lab);
    field.appendChild(val);
    grid.appendChild(field);
  }

  /**
   * Lista de validades em acordeões.
   * N > 1: todos fechados; N === 1: único aberto.
   * @param {Array<object>} entries
   */
  function renderEntries(entries) {
    if (!entriesEl) return;
    entriesEl.replaceChildren();
    var list = sortEntriesRecentFirst(entries);
    if (!list.length) {
      ultimoTexto = '';
      return;
    }
    var openSingle = list.length === 1;
    for (var i = 0; i < list.length; i++) {
      var entry = list[i] || {};
      var details = document.createElement('details');
      details.className = 'rx-accordion';
      if (openSingle) details.open = true;

      var summary = document.createElement('summary');
      summary.textContent = fmtValor(entry.data) !== '—'
        ? String(entry.data)
        : 'Validade ' + (i + 1);
      details.appendChild(summary);

      var body = document.createElement('div');
      body.className = 'rx-accordion-body';
      var grid = document.createElement('div');
      grid.className = 'rx-grid';
      appendRxField(grid, 'Data (validade)', fmtValor(entry.data));
      appendRxField(grid, 'Dieta', fmtValor(entry.dieta));
      appendRxField(grid, 'Hidratação venosa', fmtLista(entry.hidratacao));
      appendRxField(grid, 'Antibiótico', fmtLista(entry.antibiotico));
      appendRxField(grid, 'Analgesia', fmtLista(entry.analgesia));
      var catSections = listCategorySections(entry.categoriasMedicamento);
      for (var ci = 0; ci < catSections.length; ci++) {
        appendRxField(grid, catSections[ci].label, fmtLista(catSections[ci].items));
      }
      body.appendChild(grid);
      details.appendChild(body);
      entriesEl.appendChild(details);
    }
    ultimoTexto = concatEntriesTexto(list);
  }

  function fillMeta(res, snap, displayInfo) {
    metaEl.replaceChildren();
    const periodo = (snap && snap.data) || res.data || '—';
    metaEl.appendChild(document.createTextNode('📅 '));
    const strongP = document.createElement('strong');
    strongP.textContent = periodo;
    metaEl.appendChild(strongP);

    const entryCount =
      (displayInfo && typeof displayInfo.shown === 'number' && displayInfo.shown) ||
      (res && typeof res.entryCount === 'number' && res.entryCount) ||
      (res && Array.isArray(res.entries) && res.entries.length) ||
      0;
    const meta = (res && res.meta) || {};
    if (displayInfo && displayInfo.filtered) {
      metaEl.appendChild(document.createTextNode(' \u00a0·\u00a0 '));
      metaEl.appendChild(
        document.createTextNode(
          entryCount +
            ' no filtro / ' +
            displayInfo.total +
            ' no histórico'
        )
      );
    } else if (entryCount > 1 || meta.batch) {
      metaEl.appendChild(document.createTextNode(' \u00a0·\u00a0 '));
      let batchLabel = entryCount + ' validade' + (entryCount === 1 ? '' : 's');
      if (meta.dateFrom || meta.dateTo) {
        const from = meta.dateFrom || '…';
        const to = meta.dateTo || '…';
        batchLabel +=
          ' no intervalo ' + (from === to ? from : from + ' → ' + to);
      }
      metaEl.appendChild(document.createTextNode(batchLabel));
    }

    const stats = res.stats;
    if (stats) {
      metaEl.appendChild(document.createTextNode(' \u00a0·\u00a0 '));
      metaEl.appendChild(document.createTextNode(
        `${stats.incluidas} item(ns) ativo(s), ${stats.omitidasSuspenso} suspenso(s) omitido(s)`
      ));
    }

    const aviso = meta.avisoEcf || null;
    if (aviso) {
      metaEl.appendChild(document.createElement('br'));
      const warn = document.createElement('span');
      warn.style.color = 'var(--yellow)';
      warn.textContent = '⚠ ' + aviso;
      metaEl.appendChild(warn);
    }

    metaEl.style.display = 'block';
  }

  async function refreshRxPatientSelect(selectedKey) {
    if (!patientSel || !activePatient) return;
    await activePatient.refreshSelect(patientSel, {
      includePage: true,
      selectedKey: selectedKey,
    });
  }

  async function loadPrescricaoForPatient(patientKey) {
    if (!patientKey || !window.AghuPrescricaoArchive) return false;
    const snap = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(patientKey);
    if (!snap) return false;
    displaySnapshot(snap);
    setStatus('↩ Prescrição carregada do arquivo local.', 'ok');
    return true;
  }

  async function resolveRxPatientKey() {
    if (activePatient && activePatient.getActiveKey) {
      const globalKey = activePatient.getActiveKey();
      if (globalKey && activePatient.isRealPatientKey(globalKey)) return globalKey;
    }
    if (patientSel && patientSel.value && patientSel.value !== '__page__') {
      return patientSel.value;
    }
    return null;
  }

  async function syncAfterLocalSave(patientKey) {
    if (!patientKey || !window.AghuSupabaseSync) return null;
    const out = await window.AghuSupabaseSync.syncPatient(patientKey);
    return window.AghuSupabaseSync.formatSyncMessage(out);
  }

  function displaySnapshot(snap) {
    lastLoadedSnap = snap;
    var allEntries =
      Array.isArray(snap.entries) && snap.entries.length
        ? snap.entries
        : [
            {
              data: snap.data,
              dieta: snap.dieta,
              hidratacao: snap.hidratacao,
              analgesia: snap.analgesia,
              antibiotico: snap.antibiotico,
              categoriasMedicamento: snap.categoriasMedicamento || {},
              texto: snap.texto,
              validadeInicial: snap.validadeInicial,
              validadeFinal: snap.validadeFinal,
              extractedAt: snap.atualizadoEm || 0,
            },
          ];
    var filtered = applyDisplayDateFilter(allEntries);
    renderEntries(filtered.entries);
    fillMeta(
      {
        data: snap.data,
        entryCount: filtered.entries.length,
        stats: null,
        meta: {},
      },
      snap,
      {
        filtered: filtered.filtered,
        total: filtered.total,
        shown: filtered.entries.length,
      }
    );
    btnCopiar.classList.remove('hidden');
    updatePatientHint({
      ok: true,
      primeiroNome: snap.primeiroNome,
      prontuario: snap.prontuario,
      missing: [],
    });
  }

  function entryPayloadFromResposta(entryOrRes) {
    const meta = (entryOrRes && entryOrRes.meta) || {};
    return {
      data: entryOrRes.data,
      dieta: entryOrRes.dieta,
      hidratacao: entryOrRes.hidratacao,
      analgesia: entryOrRes.analgesia,
      antibiotico: entryOrRes.antibiotico,
      categoriasMedicamento: entryOrRes.categoriasMedicamento || {},
      texto: entryOrRes.texto,
      validadeInicial:
        entryOrRes.validadeInicial || meta.validadeInicial || '',
      validadeFinal: entryOrRes.validadeFinal || meta.validadeFinal || '',
    };
  }

  async function extrairPrescricao() {
    if (window.AghuBillingStatus && window.AghuBillingStatus.guardExtraction) {
      const gate = await window.AghuBillingStatus.guardExtraction();
      if (!gate.ok) {
        const msg = window.AghuBillingStatus.formatUpgradeMessage(gate);
        setStatus(msg || 'Limite diário de extrações atingido.', 'erro');
        return;
      }
    }

    const dateRange = readRxDateRangeForExtract();
    if (dateRange.error) {
      setStatus(dateRange.error, 'erro');
      return;
    }

    setStatus('Buscando aba ativa…', 'info');
    setExtraindo(true);
    btnCopiar.classList.add('hidden');
    metaEl.style.display = 'none';

    let tabId;
    try {
      if (window.AghuActiveTab && window.AghuActiveTab.resolveAghuTabIdFromBrowser) {
        tabId = await window.AghuActiveTab.resolveAghuTabIdFromBrowser();
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
      setStatus('Nenhuma aba AGHU encontrada. Abra Prescrição Médica e clique no ícone da extensão.', 'erro');
      setExtraindo(false);
      return;
    }

    if (window.AghuActiveTab && window.AghuActiveTab.persistAghuTabId) {
      try {
        await window.AghuActiveTab.persistAghuTabId(tabId);
      } catch (_e) { /* ignore */ }
    }

    const extractMsg = {
      action: 'extrairPrescricao',
      dateFrom: dateRange.dateFrom || null,
      dateTo: dateRange.dateTo || null,
    };

    setStatus('Extraindo lotes…', 'info');

    let resposta;
    try {
      resposta = await browser.tabs.sendMessage(tabId, extractMsg);
    } catch (e) {
      try {
        const tabApi = window.AghuActiveTab;
        const files =
          tabApi && tabApi.PRESCRICAO_SCRIPT_FILES
            ? tabApi.PRESCRICAO_SCRIPT_FILES
            : [
                'lib/date-br.js',
                'lib/prescricao-date-window.js',
                'lib/receita-medication-catalog.js',
                'lib/prescricao-medication-classify.js',
                'content/prescricao_content.js',
              ];
        if (tabApi && typeof tabApi.injectScriptChain === 'function') {
          await tabApi.injectScriptChain(tabId, files);
        } else {
          for (const file of files) {
            await browser.tabs.executeScript(tabId, { file });
          }
        }
        await new Promise((r) => setTimeout(r, 200));
        resposta = await browser.tabs.sendMessage(tabId, extractMsg);
      } catch (e2) {
        setStatus('Erro ao injetar script: ' + e2.message, 'erro');
        setExtraindo(false);
        return;
      }
    }

    setExtraindo(false);

    const patient = resposta && resposta.patient ? resposta.patient : null;
    updatePatientHint(patient);

    if (!resposta || !resposta.ok) {
      setStatus(resposta?.erro || 'Erro desconhecido na extração.', 'erro');
      return;
    }

    if (window.AghuBillingStatus && window.AghuBillingStatus.recordExtraction) {
      await window.AghuBillingStatus.recordExtraction({ success: true });
    }

    let batchEntries =
      Array.isArray(resposta.entries) && resposta.entries.length >= 1
        ? resposta.entries.slice()
        : resposta
          ? [entryPayloadFromResposta(resposta)]
          : [];

    const winApi = rxDateWindowApi();
    if (
      (dateRange.dateFrom || dateRange.dateTo) &&
      winApi &&
      winApi.refilterBatchForDates
    ) {
      const ref = winApi.refilterBatchForDates(
        batchEntries,
        dateRange.dateFrom,
        dateRange.dateTo
      );
      if (!ref.ok) {
        setStatus(ref.error || 'Filtro clínico rejeitou o lote.', 'erro');
        return;
      }
      batchEntries = ref.entries;
      if (!batchEntries.length) {
        setStatus(
          'Nenhuma validade na janela clínica 16:00→15:59 para o De/Até informado.',
          'erro'
        );
        return;
      }
    }

    const entryCount = batchEntries.length;

    if (
      window.AghuPrescricaoArchive &&
      patient &&
      patient.ok &&
      patient.patientKey
    ) {
      const metaSave = {
        patientKey: patient.patientKey,
        primeiroNome: patient.primeiroNome,
        nomeCompleto: patient.nomeCompleto || '',
        prontuario: patient.prontuario,
      };
      const saveOpts =
        dateRange.dateFrom || dateRange.dateTo
          ? {
              mode: 'window_overwrite',
              dateFrom: dateRange.dateFrom,
              dateTo: dateRange.dateTo,
            }
          : undefined;
      await window.AghuPrescricaoArchive.savePrescricaoEntries(
        metaSave,
        batchEntries.map(entryPayloadFromResposta),
        saveOpts
      );
      if (
        window.AghuPatientArchive &&
        window.AghuPatientArchive.ensureMinimalPatientRecord
      ) {
        await window.AghuPatientArchive.ensureMinimalPatientRecord({
          patientKey: patient.patientKey,
          primeiroNome: patient.primeiroNome,
          nomeCompleto: patient.nomeCompleto || '',
          prontuario: patient.prontuario,
        });
      }
      await refreshRxPatientSelect(patient.patientKey);
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(patient.patientKey, { source: 'prescricoes-extract' });
      }
      if (window.AghuPrescricaoArchive.pruneStale) {
        await window.AghuPrescricaoArchive.pruneStale();
      }
      const reloaded = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(
        patient.patientKey
      );
      if (reloaded) {
        displaySnapshot(reloaded);
      } else {
        renderEntries(batchEntries);
        fillMeta({
          data: batchEntries[0] && batchEntries[0].data,
          entryCount: entryCount,
          entries: batchEntries,
          meta: {
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            batch: entryCount > 1,
          },
        });
      }
      const syncMsg = await syncAfterLocalSave(patient.patientKey);
      const skipped =
        (resposta.meta && typeof resposta.meta.skipped === 'number'
          ? resposta.meta.skipped
          : 0) ||
        (resposta.stats && typeof resposta.stats.skipped === 'number'
          ? resposta.stats.skipped
          : 0);
      const skippedHint =
        skipped > 0
          ? ` ${skipped} sem atualizar itens (seleção PF).`
          : '';
      const loteMsg =
        entryCount > 1
          ? `✅ ${entryCount} validades salvas localmente.${skippedHint}`
          : `✅ Extração concluída e salva localmente por paciente.${skippedHint}`;
      setStatus(
        syncMsg ? loteMsg + ' ' + syncMsg : loteMsg,
        skipped > 0
          ? 'info'
          : syncMsg && syncMsg.indexOf('sincronizado') !== -1
            ? 'ok'
            : 'info'
      );
    } else {
      renderEntries(batchEntries);
      fillMeta({
        data: batchEntries[0] && batchEntries[0].data,
        entryCount: entryCount,
        entries: batchEntries,
        meta: {
          dateFrom: dateRange.dateFrom,
          dateTo: dateRange.dateTo,
          batch: entryCount > 1,
        },
      });
      const miss =
        patient && patient.missing && patient.missing.length
          ? patient.missing.join(', ')
          : 'nome/prontuário';
      const loteHint =
        entryCount > 1 ? ` ${entryCount} validades.` : '';
      setStatus(
        `✅ Texto extraído.${loteHint} ⚠ Arquivo por paciente não salvo (não encontrado na página: ${miss}).`,
        'info'
      );
      await refreshRxPatientSelect(null);
    }

    btnCopiar.classList.remove('hidden');
  }

  async function copiarTexto() {
    if (!ultimoTexto) return;
    try {
      await navigator.clipboard.writeText(ultimoTexto.toLocaleUpperCase('pt-BR'));
      btnCopiar.replaceChildren(document.createTextNode('✅ Copiado!'));
      btnCopiar.disabled = true;
      setTimeout(() => {
        restoreBtnCopiar();
        btnCopiar.disabled = false;
      }, 2000);
    } catch (e) {
      setStatus('Erro ao copiar. Verifique permissões.', 'erro');
    }
  }

  if (patientSel) {
    patientSel.addEventListener('change', async () => {
      if (activePatient && activePatient.isSyncing()) return;
      const v = patientSel.value;
      if (activePatient && activePatient.isPageValue(v)) {
        if (patientHint) {
          patientHint.textContent = 'Use Extrair na página de Prescrição Médica.';
          patientHint.classList.remove('warn');
        }
        return;
      }
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(v, { source: 'prescricoes' });
      }
      await loadPrescricaoForPatient(v);
    });
  }

  document.addEventListener('aghu:prescricao-period-sync', async (ev) => {
    const detail = (ev && ev.detail) || {};
    const fromBr = detail.dateFromBr || detail.dateFrom || null;
    const toBr = detail.dateToBr || detail.dateTo || null;
    if (!fromBr && !toBr) return;
    if (rxDateFilter) {
      if (fromBr) rxDateFilter.setDateInput(rxDateFromEl, fromBr);
      if (toBr) rxDateFilter.setDateInput(rxDateToEl, toBr);
      rxDateFilter.updateDateBadge();
    } else {
      if (rxDateFromEl && fromBr) rxDateFromEl.value = fromBr;
      if (rxDateToEl && toBr) rxDateToEl.value = toBr;
    }
    const key =
      detail.patientKey ||
      (activePatient && activePatient.getActiveKey
        ? activePatient.getActiveKey()
        : null);
    if (key && window.AghuPrescricaoArchive) {
      const snap = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(key);
      if (snap) {
        displaySnapshot(snap);
        return;
      }
    }
    refreshDisplayFromSnap();
  });

  document.addEventListener('aghu:active-patient-changed', async (ev) => {
    const detail = ev.detail || {};
    if (detail.source === 'prescricoes' || detail.source === 'prescricoes-extract') return;
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
      await loadPrescricaoForPatient(key);
    }
  });

  async function startupPrescricoes() {
    try {
      if (activePatient && activePatient.ready) await activePatient.ready;
      const lk =
        activePatient && activePatient.getActiveKey
          ? activePatient.getActiveKey()
          : null;
      if (lk && activePatient && activePatient.isRealPatientKey(lk) && window.AghuPrescricaoArchive) {
        const snap = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(lk);
        if (snap && snap.texto) {
          displaySnapshot(snap);
          setStatus('↩ Último paciente (prescrição) restaurado.', 'info');
        }
        await refreshRxPatientSelect(lk);
      } else {
        await refreshRxPatientSelect(lk);
      }
    } catch (e) {
      await refreshRxPatientSelect(null);
    }
  }

  function resetClinicalUiState() {
    ultimoTexto = '';
    renderEntries([]);
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
    void refreshRxPatientSelect(null);
  }

  document.addEventListener('aghu:clinical-storage-cleared', function () {
    resetClinicalUiState();
  });

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startupPrescricoes);
  } else {
    startupPrescricoes();
  }

  btnExtrair.addEventListener('click', extrairPrescricao);
  btnCopiar.addEventListener('click', copiarTexto);
})();
