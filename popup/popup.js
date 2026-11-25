(function () {
  "use strict";

  let allExams = [];
  let filteredExams = [];
  const filterFlags = {
    onlyWithResult: false,
    onlyWithoutResult: false,
    onlyWithAttach: false,
  };
  let currentCacheKey = null;
  let fetchRunning = false;
  let currentPatientMeta = null;
  let sessionFromArchive = false;

  const $ = (sel) => document.querySelector(sel);

  const btnExtract = $("#btnExtract");
  const btnFetchDetails = $("#btnFetchDetails");
  const btnCopy = $("#btnCopy");
  const btnCSV = $("#btnCSV");
  const btnOnlyResults = $("#btnOnlyResults");
  const btnOnlyNoResults = $("#btnOnlyNoResults");
  const btnOnlyAttach = $("#btnOnlyAttach");
  const searchInput = $("#searchInput");
  const tableBody = $("#tableBody");
  const tableContainer = $("#tableContainer");
  const statsBar = $("#statsBar");
  const exportBar = $("#exportBar");
  const initialState = $("#initialState");
  const errorState = $("#errorState");
  const errorMessage = $("#errorMessage");
  const progressBar = $("#progressBar");
  const progressFill = $("#progressFill");
  const progressText = $("#progressText");
  const dateFromEl = $("#dateFrom");
  const dateToEl = $("#dateTo");
  const btnToday = $("#btnToday");
  const btnYesterday = $("#btnYesterday");
  const btnClearDate = $("#btnClearDate");
  const dateBadge = $("#dateBadge");
  const patientSelect = $("#patientSelect");
  const patientBarHint = $("#patientBarHint");

  const cacheApi = window.AghuPopupExamsCache;
  const renderApi = window.AghuPopupExamsRender;
  const syncApi = window.AghuPopupSync;
  let pdfBatchApi = null;

  const dateFilter = window.AghuPopupDateFilter
    ? window.AghuPopupDateFilter.createDateFilterHelpers({
        dateFromEl,
        dateToEl,
        dateBadge,
      })
    : null;

  const actionButtons = window.AghuPopupActionButtons
    ? window.AghuPopupActionButtons.createActionButtons(btnExtract, btnCopy)
    : null;
  const setExtractButtonLoading = actionButtons
    ? actionButtons.setExtractButtonLoading
    : function () {};
  const restoreCopyButton = actionButtons
    ? actionButtons.restoreCopyButton
    : function () {};
  const showCopyDoneFeedback = actionButtons
    ? actionButtons.showCopyDoneFeedback
    : function () {};

  function dateBrApi() {
    return typeof AghuDateBr !== "undefined" ? AghuDateBr : null;
  }

  function readExtractDateRange() {
    return dateFilter ? dateFilter.readExtractDateRange() : { dateFrom: null, dateTo: null };
  }

  function setDateInput(el, value) {
    if (dateFilter) dateFilter.setDateInput(el, value);
  }

  function readDisplayBr(el) {
    return dateFilter ? dateFilter.readDisplayBr(el) : null;
  }

  function updateDateBadge() {
    if (dateFilter) dateFilter.updateDateBadge();
  }

  function parseDataColetaFromRaw(raw) {
    const api = dateBrApi();
    if (api && api.parseColetaFromRaw) return api.parseColetaFromRaw(raw);
    if (!raw || String(raw).trim() === "") return { iso: null, label: "sem data" };
    return { iso: null, label: "sem data" };
  }

  function ensureColetaFields(exam) {
    const hasIso = Object.prototype.hasOwnProperty.call(exam, "dataColetaISO");
    const hasLbl = Object.prototype.hasOwnProperty.call(exam, "dataColetaLabel");
    if (hasIso && hasLbl) return exam;
    const p = parseDataColetaFromRaw(exam.date || "");
    if (!hasIso) exam.dataColetaISO = p.iso;
    if (!hasLbl) exam.dataColetaLabel = p.label;
    return exam;
  }

  function normalizeLabText(s) {
    const lp = window.AghuPdfLabParse;
    if (lp) return lp.normalizeLabText(s);
    const san = window.AghuExamSiglas && window.AghuExamSiglas.sanitizeRawLabel;
    return san ? san(s) : String(s || "").trim();
  }

  function resolveExamSigla(label) {
    const fn =
      window.AghuExamSiglas && window.AghuExamSiglas.resolveSigla
        ? window.AghuExamSiglas.resolveSigla
        : (x) => String(x || "").trim();
    return fn(normalizeLabText(label));
  }

  const buildCacheKey = (...a) => cacheApi.buildCacheKey(...a);
  const cachePatientMatches = (...a) => cacheApi.cachePatientMatches(...a);
  const saveExamListToCache = (...a) => cacheApi.saveExamListToCache(...a);

  async function saveResultToCache(cacheKey, rowIndex, entry) {
    if (!cacheKey) return;
    try {
      const stored = await browser.storage.local.get(cacheKey);
      const current = stored[cacheKey] || {};
      const prev = current[rowIndex] || {};
      current[rowIndex] = {
        fetchedResult: entry.fetchedResult,
        detailText: entry.detailText,
        hadPdf: entry.hadPdf,
        fetchHint: entry.fetchHint,
        fetchReason: entry.fetchReason,
        aiOrganized: Object.prototype.hasOwnProperty.call(entry, "aiOrganized")
          ? (entry.aiOrganized || "")
          : (prev.aiOrganized || ""),
      };
      current.__savedAt = Date.now();
      await browser.storage.local.set({ [cacheKey]: current });

      if (window.AghuPatientArchive && currentPatientMeta?.ok && cacheKey) {
        const exam = allExams.find((x) => x.rowIndex === rowIndex);
        if (exam) {
          const patch = Object.assign({}, exam, {
            fetchedResult: entry.fetchedResult || "",
            detailText: entry.detailText || "",
            hadPdf: !!entry.hadPdf,
            fetchHint: entry.fetchHint || "",
            fetchReason: entry.fetchReason || "",
            aiOrganized: Object.prototype.hasOwnProperty.call(entry, "aiOrganized")
              ? (entry.aiOrganized || "")
              : (exam.aiOrganized || ""),
          });
          await window.AghuPatientArchive.upsertSingleExam(currentPatientMeta.patientKey, patch);
        }
      }
    } catch (e) {
      console.warn("cache save failed", e);
    }
  }

  const pdfFetch = window.AghuPopupExamsPdfFetch
    ? window.AghuPopupExamsPdfFetch.createPdfFetchHelpers({
        saveResultToCache,
        getCurrentPatientMeta: () => currentPatientMeta,
      })
    : null;

  const upgradeGasometryCachedExam = pdfFetch
    ? pdfFetch.upgradeGasometryCachedExam
    : () => false;
  const upgradeAllGasometryExams = pdfFetch ? pdfFetch.upgradeAllGasometryExams : () => [];
  const upgradeAllPdfCachedExams = pdfFetch ? pdfFetch.upgradeAllPdfCachedExams : () => [];
  const persistUpgradedFetchExams = pdfFetch
    ? pdfFetch.persistUpgradedFetchExams
    : async () => {};
  const persistUpgradedGasometryToArchive = pdfFetch
    ? pdfFetch.persistUpgradedGasometryToArchive
    : async () => {};
  const applyFetchResult = pdfFetch ? pdfFetch.applyFetchResult : () => {};
  const finalizeGasometryAfterFetch = pdfFetch
    ? pdfFetch.finalizeGasometryAfterFetch
    : () => {};
  const reasonToHint = pdfFetch ? pdfFetch.reasonToHint : (r) => r || "";
  const pdfFetchCfg = pdfFetch ? pdfFetch.pdfFetchCfg : () => ({});
  const sleepMs = pdfFetch ? pdfFetch.sleepMs : (ms) => new Promise((r) => setTimeout(r, ms));
  const sendTabMessageWithTimeout = pdfFetch
    ? pdfFetch.sendTabMessageWithTimeout
    : async () => null;
  const pdfBlockMatchDeps = pdfFetch ? pdfFetch.pdfBlockMatchDeps : () => null;

  const patientBar = window.AghuPopupPatientBar
    ? window.AghuPopupPatientBar.createPatientBar({ patientBarHint, patientSelect })
    : null;
  const updatePatientBar = patientBar ? patientBar.updatePatientBar : () => {};
  const refreshPatientSelect = patientBar ? patientBar.refreshPatientSelect : async () => {};
  const activePatient = window.AghuPopupActivePatient;

  if (activePatient && patientSelect) {
    activePatient.registerSelect(patientSelect, { includePage: true });
  }

  async function loadExamsFromArchive(patientKey) {
    if (!window.AghuPatientArchive || !patientKey) return false;
    const rec = await window.AghuPatientArchive.loadPatientRecord(patientKey);
    if (!rec) return false;
    currentPatientMeta = {
      ok: true,
      missing: [],
      patientKey: rec.patientKey,
      primeiroNome: rec.primeiroNome,
      nomeCompleto: rec.nomeCompleto || "",
      prontuario: rec.prontuario,
      ...(rec.sexo ? { sexo: rec.sexo } : {}),
      ...(rec.dataNascimento || rec.dataNascimentoISO
        ? {
            dataNascimento: rec.dataNascimento || rec.dataNascimentoISO,
            dataNascimentoISO: rec.dataNascimento || rec.dataNascimentoISO,
          }
        : {}),
    };
    sessionFromArchive = true;
    currentCacheKey = null;
    allExams = window.AghuPatientArchive.examsRecordToArray(rec).map((e) => {
      const merged = {
        ...e,
        fetchHint: e.fetchHint !== undefined ? e.fetchHint : "",
        fetchReason: e.fetchReason !== undefined ? e.fetchReason : "",
        aiOrganized: e.aiOrganized !== undefined ? e.aiOrganized : "",
      };
      ensureColetaFields(merged);
      return merged;
    });
    const archiveUpgraded = upgradeAllGasometryExams(allExams);
    if (archiveUpgraded.length) await persistUpgradedGasometryToArchive(archiveUpgraded);
    filteredExams = [...allExams];
    updatePatientBar(currentPatientMeta);
    showResults();
    setProgress(100, `↩ ${allExams.length} exame(s) do arquivo local`);
    setTimeout(() => progressBar.classList.remove("visible"), 3500);
    return true;
  }

  function getExamDisplayText(exam) {
    return renderApi.getExamDisplayText(exam, upgradeGasometryCachedExam);
  }

  function fillResultCell(cell, exam) {
    return renderApi.fillResultCell(cell, exam, esc, upgradeGasometryCachedExam);
  }

  function groupByDataColeta(exams) {
    return renderApi.groupByDataColeta(exams, ensureColetaFields);
  }

  function distinctColetaKeysCount(exams) {
    return renderApi.distinctColetaKeysCount(exams, ensureColetaFields);
  }

  async function restoreResultsFromCache(exams, cacheKey, patientKey) {
    return cacheApi.restoreResultsFromCache(exams, cacheKey, patientKey, {
      upgradeAllGasometryExams,
      upgradeAllPdfCachedExams,
      persistUpgradedFetchExams,
    });
  }

  async function pruneOldCache() {
    try {
      await cacheApi.pruneOldCache();
      if (window.AghuPatientArchive) await window.AghuPatientArchive.pruneStalePatients();
      if (window.AghuControlesArchive) await window.AghuControlesArchive.pruneStale();
    } catch (_e) { /* ignore */ }
  }

  function setProgress(pct, msg) {
    progressBar.classList.add("visible");
    progressFill.style.width = `${pct}%`;
    progressText.textContent = msg;
  }

  function notifyExamsUpdated() {
    document.dispatchEvent(new CustomEvent("aghu:exams-updated"));
  }

  function showError(msg) {
    initialState.classList.add("hidden");
    tableContainer.classList.add("hidden");
    statsBar.classList.add("hidden");
    exportBar.classList.add("hidden");
    searchInput.classList.add("hidden");
    btnFetchDetails.classList.add("hidden");
    errorState.classList.remove("hidden");
    errorMessage.textContent = msg;
  }

  function showWarning(msg) {
    errorState.classList.add("hidden");
    if (patientBarHint) {
      patientBarHint.textContent = msg;
      patientBarHint.classList.add("warn");
    }
    progressBar.classList.add("visible");
    progressFill.style.width = "100%";
    progressText.textContent = "⚠ " + msg;
    setTimeout(() => progressBar.classList.remove("visible"), 5200);
  }

  function showInitialState() {
    initialState.classList.remove("hidden");
    errorState.classList.add("hidden");
    tableContainer.classList.add("hidden");
    statsBar.classList.add("hidden");
    exportBar.classList.add("hidden");
    searchInput.classList.add("hidden");
    btnFetchDetails.classList.add("hidden");
    progressBar.classList.remove("visible");
  }

  function showResults() {
    initialState.classList.add("hidden");
    errorState.classList.add("hidden");
    tableContainer.classList.remove("hidden");
    statsBar.classList.remove("hidden");
    exportBar.classList.remove("hidden");
    searchInput.classList.remove("hidden");
    const pendingFetch = window.AghuPdfFetchPartition?.isExamPendingFetch;
    const needsFetch =
      !sessionFromArchive &&
      allExams.some((e) =>
        pendingFetch
          ? pendingFetch(e)
          : !e.fetchedResult &&
            !e.detailText &&
            e.result === "" &&
            (e.hasCheckbox || e.hasAttachment),
      );
    btnFetchDetails.classList.toggle("hidden", !needsFetch);
    updateStats();
    renderTable();
    notifyExamsUpdated();
  }

  function updateStats() {
    const withResult = filteredExams.filter((e) => e.result || e.fetchedResult || e.fetchHint).length;
    const noResult = filteredExams.length - withResult;
    const withAttach = filteredExams.filter((e) => e.hasAttachment).length;
    const filtersOn =
      filterFlags.onlyWithResult ||
      filterFlags.onlyWithoutResult ||
      filterFlags.onlyWithAttach ||
      searchInput.value.trim().length > 0;
    const totalLabel =
      filtersOn && allExams.length !== filteredExams.length
        ? `${filteredExams.length}/${allExams.length}`
        : String(filteredExams.length);
    $("#statTotal").textContent = totalLabel;
    $("#statWithResult").textContent = withResult;
    $("#statNoResult").textContent = noResult;
    $("#statAttach").textContent = withAttach;
  }

  function esc(str) {
    if (str == null || str === "") return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const examsTable = window.AghuPopupExamsTable
    ? window.AghuPopupExamsTable.createExamsTable({
        tableBody,
        searchInput,
        btnOnlyResults,
        btnOnlyNoResults,
        btnOnlyAttach,
        getAllExams: () => allExams,
        getFilteredExams: () => filteredExams,
        setFilteredExams: (v) => {
          filteredExams = v;
        },
        getFilterFlags: () => filterFlags,
        ensureColetaFields,
        resolveExamSigla,
        fillResultCell,
        esc,
        groupByDataColeta,
        distinctColetaKeysCount,
        updateStats,
      })
    : null;

  const renderTable = examsTable ? examsTable.renderTable : () => {};
  const updateRow = examsTable ? examsTable.updateRow : () => {};
  const applyFilters = examsTable ? examsTable.applyFilters : () => {};

  function ensurePdfBatchApi() {
    if (pdfBatchApi) return pdfBatchApi;
    pdfBatchApi = window.AghuPopupPdfBatch.create({
      getCacheKey: () => currentCacheKey,
      saveResultToCache,
      updateRow,
      applyFilters,
      applyFetchResult,
      finalizeGasometryAfterFetch,
      reasonToHint,
      pdfFetchCfg,
      sendTabMessageWithTimeout,
      sleepMs,
      pdfBlockMatchDeps,
      setProgress,
      setFetchRunning: (v) => {
        fetchRunning = v;
      },
      btnFetchDetails,
      progressBar,
    });
    return pdfBatchApi;
  }

  const examsFetchPipeline = window.AghuExamsFetchPipeline
    ? window.AghuExamsFetchPipeline.createExamsFetchPipeline({
        saveResultToCache,
        getCacheKey: () => currentCacheKey,
        getCurrentPatientMeta: () => currentPatientMeta,
        updateRow,
        applyFilters,
        setProgress,
        setFetchRunning: (v) => {
          fetchRunning = v;
        },
        btnFetchDetails,
        progressBar,
      })
    : null;

  async function runExamsPdfFetch(tabId, exams, opts) {
    if (examsFetchPipeline) {
      return examsFetchPipeline.runExamsPdfFetch(tabId, exams, {
        ...(opts || {}),
        patientKey:
          (opts && opts.patientKey) != null
            ? opts.patientKey
            : currentPatientMeta?.patientKey || null,
        onProgress: (opts && opts.onProgress) || setProgress,
      });
    }
    const pendingFetch = window.AghuPdfFetchPartition?.isExamPendingFetch;
    const toFetch = (exams || []).filter((e) =>
      pendingFetch
        ? pendingFetch(e)
        : !e.fetchedResult &&
          !e.detailText &&
          e.result === "" &&
          (e.hasCheckbox || e.hasAttachment),
    );
    if (toFetch.length > 0) {
      await ensurePdfBatchApi().runFetchLoop(tabId, toFetch);
    }
    return {
      pdfsAttempted: toFetch.length,
      pdfsOk: toFetch.filter((e) => e.fetchedResult || e.detailText).length,
    };
  }

  async function runFetchLoop(tabId, toFetch) {
    return ensurePdfBatchApi().runFetchLoop(tabId, toFetch);
  }

  const syncPatientAfterLocalSave = (pk) => syncApi.syncPatientAfterLocalSave(pk);
  const scheduleSyncAfterLocalSave = (pk, onDone) => syncApi.scheduleSyncAfterLocalSave(pk, onDone);
  const mergeProgressMessage = (base, syncMsg) => syncApi.mergeProgressMessage(base, syncMsg);

  const extractApi = window.AghuPopupExamsExtract
    ? window.AghuPopupExamsExtract.createExamsExtract({
        btnExtract,
        setExtractButtonLoading,
        readExtractDateRange,
        dateFromEl,
        dateToEl,
        progressBar,
        cachePatientMatches,
        ensureColetaFields,
        upgradeAllGasometryExams,
        upgradeAllPdfCachedExams,
        persistUpgradedFetchExams,
        buildCacheKey,
        saveExamListToCache,
        restoreResultsFromCache,
        readDisplayBr,
        setDateInput,
        updateDateBadge,
        showError,
        showWarning,
        showResults,
        applyFilters,
        setProgress,
        updatePatientBar,
        refreshPatientSelect,
        pruneOldCache,
        runFetchLoop,
        runExamsPdfFetch,
        scheduleSyncAfterLocalSave,
        mergeProgressMessage,
        notifyExamsUpdated,
        getAllExams: () => allExams,
        setAllExams: (v) => {
          allExams = v;
        },
        getFilteredExams: () => filteredExams,
        setFilteredExams: (v) => {
          filteredExams = v;
        },
        getCurrentCacheKey: () => currentCacheKey,
        setCurrentCacheKey: (v) => {
          currentCacheKey = v;
        },
        getCurrentPatientMeta: () => currentPatientMeta,
        setCurrentPatientMeta: (v) => {
          currentPatientMeta = v;
        },
        getSessionFromArchive: () => sessionFromArchive,
        setSessionFromArchive: (v) => {
          sessionFromArchive = v;
        },
        getFetchRunning: () => fetchRunning,
      })
    : null;

  const getAghuTabId = extractApi ? extractApi.getAghuTabId : async () => null;
  const tryRestoreLastSession = extractApi
    ? extractApi.tryRestoreLastSession
    : async () => false;

  function runExamsStartup() {
    if (extractApi) {
      extractApi.wireExtractButton();
      extractApi.startupPopup();
    }
  }

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(runExamsStartup);
  } else {
    runExamsStartup();
  }

  document.addEventListener("aghu:clinical-storage-cleared", function () {
    allExams = [];
    filteredExams = [];
    currentPatientMeta = null;
    currentCacheKey = null;
    sessionFromArchive = false;
    showInitialState();
    if (patientBarHint) {
      patientBarHint.textContent = "";
      patientBarHint.classList.remove("warn");
    }
    if (patientSelect && activePatient) {
      void activePatient.refreshSelect(patientSelect, { includePage: true });
    }
  });

  if (patientSelect) {
    patientSelect.addEventListener("change", async () => {
      if (activePatient && activePatient.isSyncing()) return;
      const v = patientSelect.value;
      if (activePatient && activePatient.isPageValue(v)) {
        sessionFromArchive = false;
        allExams = [];
        filteredExams = [];
        currentCacheKey = null;
        currentPatientMeta = null;
        const restored = await tryRestoreLastSession();
        if (!restored) showInitialState();
        if (patientBarHint) {
          if (currentPatientMeta?.ok) {
            updatePatientBar(currentPatientMeta);
          } else {
            patientBarHint.textContent = restored
              ? "Sessão da página restaurada."
              : "Use Extrair na aba Exames Liberados para associar à página.";
            patientBarHint.classList.remove("warn");
          }
        }
        return;
      }
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(v, { source: "exames" });
      }
      await loadExamsFromArchive(v);
    });
  }

  document.addEventListener("aghu:active-patient-changed", async (ev) => {
    const detail = ev.detail || {};
    if (detail.source === "exames" || detail.source === "exames-extract") return;
    const key = detail.patientKey;
    if (!key) return;
    if (activePatient && activePatient.isAnonymousKey(key)) {
      sessionFromArchive = false;
      allExams = [];
      filteredExams = [];
      currentCacheKey = null;
      currentPatientMeta = null;
      showInitialState();
      if (patientBarHint && activePatient.updatePatientHint) {
        await activePatient.updatePatientHint(patientBarHint, {
          patientKey: key,
          anonymousMessage: "Anônimo — sem paciente vinculado",
        });
      }
      return;
    }
    if (activePatient && activePatient.isRealPatientKey(key)) {
      await loadExamsFromArchive(key);
    }
  });

  const todayBr = dateBrApi() ? dateBrApi().localTodayBr() : "";
  setDateInput(dateFromEl, todayBr);
  setDateInput(dateToEl, todayBr);
  updateDateBadge();

  if (btnToday) {
    btnToday.addEventListener("click", () => {
      const t = dateBrApi() ? dateBrApi().localTodayBr() : "";
      setDateInput(dateFromEl, t);
      setDateInput(dateToEl, t);
      updateDateBadge();
    });
  }
  if (btnYesterday) {
    btnYesterday.addEventListener("click", () => {
      const y = dateBrApi() ? dateBrApi().localYesterdayBr() : "";
      setDateInput(dateFromEl, y);
      setDateInput(dateToEl, y);
      updateDateBadge();
    });
  }
  if (btnClearDate) {
    btnClearDate.addEventListener("click", () => {
      dateFromEl.value = "";
      dateToEl.value = "";
      updateDateBadge();
    });
  }
  if (dateFilter) dateFilter.bindExamDateInputs();

  btnFetchDetails.addEventListener("click", async () => {
    if (fetchRunning) return;
    if (sessionFromArchive) {
      setProgress(
        100,
        "Lista carregada do arquivo local. Use Extrair na página do AGHU para buscar PDFs.",
      );
      setTimeout(() => progressBar.classList.remove("visible"), 4000);
      return;
    }
    const toFetch = allExams.filter((e) =>
      window.AghuPdfFetchPartition?.isExamPendingFetch
        ? window.AghuPdfFetchPartition.isExamPendingFetch(e)
        : !e.fetchedResult && !e.detailText && e.result === "" && (e.hasCheckbox || e.hasAttachment),
    );
    if (toFetch.length === 0) {
      setProgress(100, "Todos os exames já têm resultado.");
      setTimeout(() => progressBar.classList.remove("visible"), 2000);
      return;
    }
    const tabId = await getAghuTabId();
    if (!tabId) return;
    await runExamsPdfFetch(tabId, allExams, {
      patientKey: currentPatientMeta?.patientKey || null,
      onProgress: setProgress,
    });
    let finalMsg = null;
    if (window.AghuPatientArchive && currentPatientMeta?.ok) {
      await window.AghuPatientArchive.mergeExamsIntoRecord(
        {
          patientKey: currentPatientMeta.patientKey,
          primeiroNome: currentPatientMeta.primeiroNome,
          nomeCompleto: currentPatientMeta.nomeCompleto || "",
          prontuario: currentPatientMeta.prontuario,
        },
        allExams,
      );
      const fetchPatientKey = currentPatientMeta.patientKey;
      finalMsg = "Laudos atualizados localmente";
      scheduleSyncAfterLocalSave(fetchPatientKey, (syncMsg) => {
        setProgress(100, mergeProgressMessage("Laudos atualizados localmente", syncMsg));
        setTimeout(() => progressBar.classList.remove("visible"), 4500);
      });
    }
    if (finalMsg) {
      setProgress(100, finalMsg);
      setTimeout(() => progressBar.classList.remove("visible"), 4500);
    }
  });

  window.AghuPopupExams = {
    getExams: () => allExams.slice(),
    getPatientMeta: () => currentPatientMeta,
  };

  if (examsTable) examsTable.wireFilters();

  if (window.AghuPopupExamExport) {
    window.AghuPopupExamExport.wireExamExport({
      btnCopy,
      btnCSV,
      getFilteredExams: () => filteredExams,
      getCurrentPatientMeta: () => currentPatientMeta,
      ensureColetaFields,
      getExamDisplayText,
      resolveExamSigla,
      showCopyDoneFeedback,
      restoreCopyButton,
    });
  }
})();
