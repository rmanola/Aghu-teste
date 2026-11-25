/**
 * UI Passômetro one-click (FEAT-070 / FEAT-090 / FEAT-107) — multi-prontuário,
 * período (atalhos + De/Até), seleção de domínios, status por domínio.
 */
(function () {
  "use strict";

  var periodApi = window.AghuPassometroPeriodShortcuts;
  var orchApi = window.AghuPassometroExtractOrchestrator;
  var domainApi = window.AghuPassometroDomainExtract;
  var activePatient = window.AghuPopupActivePatient;

  var textarea = document.getElementById("pmProntuarios");
  var pmDateFromEl = document.getElementById("pmDateFrom");
  var pmDateToEl = document.getElementById("pmDateTo");
  var btnHoje = document.getElementById("pmBtnHoje");
  var btnOntem = document.getElementById("pmBtnOntem");
  var btnSemanal = document.getElementById("pmBtnSemanal");
  var btnExtract = document.getElementById("btnPassometroOneClick");
  var statusEl = document.getElementById("pm-oneclick-status");
  var progressEl = document.getElementById("pm-oneclick-progress");
  var resultsEl = document.getElementById("pm-oneclick-results");
  var btnPrint = document.getElementById("btnPrintPassometro");
  var patientSel = document.getElementById("pmPatientSelect");
  var btnStop = document.getElementById("btnPmBatchStop");
  var chkCadastro = document.getElementById("pmDomainCadastro");
  var chkControles = document.getElementById("pmDomainControles");
  var chkExames = document.getElementById("pmDomainExames");
  var chkCirurgias = document.getElementById("pmDomainCirurgias");
  var chkPrescricao = document.getElementById("pmDomainPrescricao");
  var domainCheckboxes = [
    chkCadastro,
    chkControles,
    chkExames,
    chkCirurgias,
    chkPrescricao,
  ];

  if (!textarea || !btnExtract || !periodApi || !orchApi || !domainApi) return;

  var dateFilter =
    window.AghuPopupDateFilter &&
    window.AghuPopupDateFilter.createDateFilterHelpers
      ? window.AghuPopupDateFilter.createDateFilterHelpers({
          dateFromEl: pmDateFromEl,
          dateToEl: pmDateToEl,
          dateBadge: null,
        })
      : null;

  var currentPeriod = periodApi.resolvePeriodShortcut("hoje");
  var lastPatientKey = null;
  var lastSyncOk = null;
  var lastSyncMsg = null;
  var running = false;
  /** @type {AbortController | null} */
  var batchAbort = null;
  /** @type {(() => void) | null} */
  var stopCleanup = null;
  /** Evita loop atalho → setDateInput → onAfter → custom */
  var syncingFromShortcut = false;

  function setStatus(msg, tipo) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "";
    if (tipo) statusEl.classList.add(tipo);
  }

  function setStopVisible(visible, controller) {
    if (stopCleanup) {
      stopCleanup();
      stopCleanup = null;
    }
    if (!btnStop) return;
    if (!visible || !controller) {
      btnStop.hidden = true;
      return;
    }
    btnStop.hidden = false;
    var onStop = function () {
      try {
        controller.abort();
      } catch (_e) {
        /* noop */
      }
      setStatus("A interromper… (após o domínio actual)", "info");
      if (progressEl) {
        progressEl.textContent = "Parar pedido — a concluir domínio actual…";
      }
    };
    btnStop.addEventListener("click", onStop);
    stopCleanup = function () {
      btnStop.removeEventListener("click", onStop);
      btnStop.hidden = true;
    };
  }

  function setDomainChecksDisabled(disabled) {
    for (var i = 0; i < domainCheckboxes.length; i++) {
      if (domainCheckboxes[i]) domainCheckboxes[i].disabled = !!disabled;
    }
  }

  /** Lê checkboxes → objeto domains (FEAT-107). */
  function readDomainsFromUi() {
    return orchApi.normalizeBatchDomains({
      cadastro: !!(chkCadastro && chkCadastro.checked),
      exames: !!(chkExames && chkExames.checked),
      cirurgias: !!(chkCirurgias && chkCirurgias.checked),
      controles: !!(chkControles && chkControles.checked),
      prescricao: !!(chkPrescricao && chkPrescricao.checked),
    });
  }

  function updateShortcutActive() {
    var kind = currentPeriod && currentPeriod.kind;
    [btnHoje, btnOntem, btnSemanal].forEach(function (btn) {
      if (!btn) return;
      btn.classList.toggle("active", btn.getAttribute("data-period") === kind);
    });
  }

  function fillDateInputsFromPeriod(period) {
    if (!dateFilter || !period) return;
    syncingFromShortcut = true;
    try {
      dateFilter.setDateInput(pmDateFromEl, period.dateFromIso);
      dateFilter.setDateInput(pmDateToEl, period.dateToIso);
    } finally {
      syncingFromShortcut = false;
    }
  }

  function updatePeriodUi() {
    fillDateInputsFromPeriod(currentPeriod);
    updateShortcutActive();
  }

  function setPeriod(kind) {
    currentPeriod = periodApi.resolvePeriodShortcut(kind);
    updatePeriodUi();
  }

  /**
   * Lê De/Até dos inputs e resolve período custom (ou mantém atalho se coincidir).
   * Fail-fast só datas inválidas / De > Até (FEAT-110: sem gate Controles >15d).
   * @returns {{ ok: true, period: object }|{ ok: false, error: string }}
   */
  function readPeriodFromInputs() {
    if (!dateFilter || !periodApi.resolvePeriodRange) {
      return { ok: true, period: currentPeriod };
    }
    var range = dateFilter.readExtractDateRange();
    if (range.error) {
      return { ok: false, error: range.error };
    }
    if (!range.dateFrom || !range.dateTo) {
      return {
        ok: false,
        error: "Informe data inicial e final (dd/mm/aaaa).",
      };
    }
    var resolved = periodApi.resolvePeriodRange(range.dateFrom, range.dateTo);
    if (resolved.error) {
      return { ok: false, error: resolved.error };
    }
    return { ok: true, period: resolved };
  }

  function onCustomDatesChanged() {
    if (syncingFromShortcut) return;
    var result = readPeriodFromInputs();
    if (!result.ok) {
      updateShortcutActive();
      return;
    }
    currentPeriod = result.period;
    updateShortcutActive();
  }

  function domainLabel(d) {
    var map = {
      cadastro: "Cadastro",
      exames: "Exames",
      cirurgias: "Cirurgias",
      controles: "Controles",
      prescricao: "Prescrição",
      passometro: "Passômetro",
    };
    return map[d] || d;
  }

  function statusIcon(st) {
    if (st === "ok") return "✓";
    if (st === "error") return "✗";
    if (st === "cancelled") return "■";
    if (st === "running") return "…";
    if (st === "skipped") return "–";
    return "·";
  }

  var lastResults = null;

  async function renderResults(results) {
    lastResults = results || null;
    if (!resultsEl) return;
    resultsEl.replaceChildren();
    if (!results || !results.length) return;

    var cardApi = window.AghuPassometroPatientCard;

    for (var i = 0; i < results.length; i++) {
      var row = results[i];
      var card = document.createElement("div");
      card.className = "pm-oc-row" + (row.ok ? "" : " pm-oc-row-warn");
      var title = document.createElement("div");
      title.className = "pm-oc-row-title";
      title.textContent = "Prontuário " + row.prontuario;
      card.appendChild(title);

      var list = document.createElement("ul");
      list.className = "pm-oc-domains";
      var domains = row.domains || {};
      orchApi.DOMAINS.forEach(function (d) {
        var info = domains[d] || { status: "pending" };
        var li = document.createElement("li");
        li.className = "pm-oc-domain pm-oc-" + (info.status || "pending");
        li.textContent =
          statusIcon(info.status) +
          " " +
          domainLabel(d) +
          (d === "prescricao" &&
          info.status === "ok" &&
          typeof info.entryCount === "number"
            ? " (" + info.entryCount + ")"
            : "") +
          (info.error ? " — " + info.error : "");
        list.appendChild(li);
      });
      card.appendChild(list);
      resultsEl.appendChild(card);

      if (cardApi && cardApi.appendPatientDataCard) {
        await cardApi.appendPatientDataCard(card, row);
      }
    }
  }

  function onProgress(evt) {
    if (!progressEl) return;
    if (evt.type === "aborted") {
      progressEl.textContent =
        "Interrompido · " +
        (evt.done != null ? evt.done : "?") +
        "/" +
        (evt.total != null ? evt.total : "?") +
        " pacientes (parcial)";
    } else if (evt.type === "patient_start") {
      progressEl.textContent =
        "Paciente " +
        (evt.index + 1) +
        "/" +
        evt.total +
        " · prontuário " +
        evt.prontuario +
        "…";
    } else if (evt.type === "domain") {
      var entryHint =
        evt.domain === "prescricao" &&
        evt.status === "ok" &&
        typeof evt.entryCount === "number"
          ? " · " + evt.entryCount + " validade(s)"
          : "";
      var sliceHint =
        evt.domain === "controles" &&
        evt.sliceTotal > 1 &&
        evt.sliceIndex != null
          ? " (" + evt.sliceIndex + "/" + evt.sliceTotal + ")"
          : "";
      var statusPart =
        evt.domain === "controles" &&
        evt.sliceTotal > 1 &&
        evt.status === "running"
          ? "…"
          : " (" + (evt.status || "") + ")";
      progressEl.textContent =
        "Prontuário " +
        evt.prontuario +
        " · " +
        domainLabel(evt.domain) +
        sliceHint +
        statusPart +
        entryHint;
    } else if (evt.type === "patient_done") {
      progressEl.textContent =
        "Concluído " +
        (evt.index + 1) +
        "/" +
        evt.total +
        (evt.ok ? "" : " (com falhas)");
    }
  }

  async function refreshPatientSelect(selectedKey) {
    if (!patientSel || !window.AghuPassometroArchive) return;
    var arch = window.AghuPassometroArchive;
    var entries = [];
    try {
      if (arch.listForSelect) {
        entries = await arch.listForSelect();
      } else if (arch.loadIndex) {
        var idx = await arch.loadIndex();
        entries = (idx && idx.entries) || [];
      }
    } catch (_e) {
      return;
    }
    patientSel.replaceChildren();
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Último / selecionar…";
    patientSel.appendChild(opt0);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var opt = document.createElement("option");
      opt.value = e.patientKey;
      opt.textContent =
        (e.prontuario || e.patientKey) +
        (e.primeiroNome ? " — " + e.primeiroNome : "");
      patientSel.appendChild(opt);
    }
    if (selectedKey) patientSel.value = selectedKey;
  }

  async function runBatch() {
    if (running) return;
    var domains = readDomainsFromUi();
    if (!orchApi.hasAnyClinicalDomain(domains)) {
      setStatus(
        "Marque pelo menos um domínio (Cadastro, Controles, Exames, Cirurgias ou Prescrições).",
        "erro"
      );
      return;
    }

    var parsed = periodApi.parseProntuarioList(textarea.value, {
      normalizeProntuario:
        window.AghuPatientIdentity &&
        window.AghuPatientIdentity.normalizeProntuario,
    });

    if (!parsed.prontuarios.length) {
      setStatus(
        (parsed.errors && parsed.errors[0]) || "Informe prontuários válidos.",
        "erro"
      );
      return;
    }

    var periodRead = readPeriodFromInputs();
    if (!periodRead.ok) {
      setStatus(periodRead.error, "erro");
      return;
    }
    currentPeriod = periodRead.period;
    updateShortcutActive();

    if (window.AghuBillingStatus && window.AghuBillingStatus.guardExtraction) {
      var gate = await window.AghuBillingStatus.guardExtraction();
      if (!gate.ok) {
        var msg =
          window.AghuBillingStatus.formatUpgradeMessage(gate) ||
          "Limite diário de extrações atingido.";
        setStatus(msg, "erro");
        return;
      }
    }

    running = true;
    lastSyncOk = null;
    lastSyncMsg = null;
    btnExtract.disabled = true;
    setDomainChecksDisabled(true);
    setStatus("Iniciando lote…", "info");
    lastResults = null;
    if (resultsEl) resultsEl.replaceChildren();

    batchAbort =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    setStopVisible(!!batchAbort, batchAbort);

    var out;
    try {
      out = await orchApi.runPassometroBatch({
        prontuarios: parsed.prontuarios,
        period: currentPeriod,
        domains: domains,
        signal: batchAbort ? batchAbort.signal : undefined,
        nav: {
          openPol: domainApi.openPol,
          openControles: domainApi.openControles,
          openPrescricoes: domainApi.openPrescricoes,
          closeControlesPrescricoesTabs: domainApi.closeControlesPrescricoesTabs,
        },
        extract: {
          extractCadastro: domainApi.extractCadastro,
          extractExames: domainApi.extractExames,
          extractCirurgias: domainApi.extractCirurgias,
          extractControles: domainApi.extractControles,
          extractPrescricao: domainApi.extractPrescricao,
        },
        autofillAndSave: domainApi.autofillAndSave,
        onProgress: onProgress,
        syncPatient: async function (patientKey) {
          lastPatientKey = patientKey;
          if (window.AghuSupabaseSync && window.AghuSupabaseSync.syncPatient) {
            try {
              var syncRes = await window.AghuSupabaseSync.syncPatient(patientKey);
              lastSyncOk = !!(syncRes && syncRes.ok);
              lastSyncMsg =
                window.AghuSupabaseSync.formatSyncMessage
                  ? window.AghuSupabaseSync.formatSyncMessage(syncRes)
                  : null;
            } catch (_e) {
              lastSyncOk = false;
              lastSyncMsg = "Sincronização falhou: " + ((_e && _e.message) || "erro desconhecido");
            }
          }
          if (activePatient && activePatient.setActiveKey) {
            try {
              await activePatient.setActiveKey(patientKey, {
                source: "passometro-oneclick",
              });
            } catch (_e) {}
          }
        },
      });
    } catch (e) {
      setStatus((e && e.message) || "Erro no lote.", "erro");
      running = false;
      btnExtract.disabled = false;
      setDomainChecksDisabled(false);
      setStopVisible(false, null);
      batchAbort = null;
      return;
    }

    running = false;
    btnExtract.disabled = false;
    setDomainChecksDisabled(false);
    setStopVisible(false, null);
    batchAbort = null;
    await renderResults(out.results || []);
    await refreshPatientSelect(lastPatientKey);

    if (out.aborted) {
      setStatus(
        out.error ||
          "Lote interrompido (Parar) — resultado parcial; não foi concluído com sucesso.",
        "erro"
      );
    } else if (out.ok) {
      var baseMsg =
        "Lote concluído: " +
        parsed.prontuarios.length +
        " prontuário(s). Passômetro guardado localmente.";
      var finalMsg =
        window.AghuPopupSyncUi && window.AghuPopupSyncUi.mergeProgressMessage
          ? window.AghuPopupSyncUi.mergeProgressMessage(baseMsg, lastSyncMsg)
          : lastSyncMsg
            ? baseMsg + " · " + lastSyncMsg
            : baseMsg;
      setStatus(finalMsg, lastSyncOk === false ? "erro" : "ok");
    } else {
      setStatus(
        out.error || "Lote concluído com falhas — veja o status por domínio.",
        "erro"
      );
    }
  }

  async function handlePrint() {
    var pk =
      (patientSel && patientSel.value) ||
      lastPatientKey ||
      (activePatient && activePatient.getActiveKey && activePatient.getActiveKey());
    var printApi = window.AghuPassometroPrint;
    var arch = window.AghuPassometroArchive;
    if (!printApi || !arch || !pk) {
      setStatus("Selecione um paciente com passômetro local para imprimir.", "info");
      return;
    }
    var snap = await arch.loadPassometroSnapshot(pk);
    if (!snap) {
      setStatus("Sem passômetro local para este paciente.", "info");
      return;
    }
    var nome = (snap.header && snap.header.nome) || "Passômetro";
    var result = printApi.openPrintDialog(snap, {
      title: "Passômetro — " + nome,
    });
    if (result && !result.ok) {
      setStatus("Não foi possível abrir a impressão.", "erro");
    }
  }

  if (btnHoje) btnHoje.addEventListener("click", function () { setPeriod("hoje"); });
  if (btnOntem) btnOntem.addEventListener("click", function () { setPeriod("ontem"); });
  if (btnSemanal) btnSemanal.addEventListener("click", function () { setPeriod("semanal"); });
  btnExtract.addEventListener("click", function () { void runBatch(); });
  if (btnPrint) btnPrint.addEventListener("click", function () { void handlePrint(); });

  if (dateFilter) {
    var dateBr = window.AghuDateBr;
    if (dateBr && dateBr.bindBrDateInput) {
      dateBr.bindBrDateInput(pmDateFromEl, { onAfter: onCustomDatesChanged });
      dateBr.bindBrDateInput(pmDateToEl, { onAfter: onCustomDatesChanged });
    } else if (dateFilter.bindExamDateInputs) {
      dateFilter.bindExamDateInputs();
      if (pmDateFromEl) {
        pmDateFromEl.addEventListener("change", onCustomDatesChanged);
        pmDateFromEl.addEventListener("blur", onCustomDatesChanged);
      }
      if (pmDateToEl) {
        pmDateToEl.addEventListener("change", onCustomDatesChanged);
        pmDateToEl.addEventListener("blur", onCustomDatesChanged);
      }
    }
  }

  setPeriod("hoje");
  void refreshPatientSelect(null);

  document.addEventListener("aghu:pa-format-changed", function () {
    if (lastResults && lastResults.length) void renderResults(lastResults);
  });

  window.AghuPassometroOneClick = {
    setPeriod: setPeriod,
    runBatch: runBatch,
    renderResults: renderResults,
    getPeriod: function () { return currentPeriod; },
    readPeriodFromInputs: readPeriodFromInputs,
    readDomainsFromUi: readDomainsFromUi,
  };
})();
