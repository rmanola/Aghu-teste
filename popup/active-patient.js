/**
 * Paciente ativo global no popup — sincroniza selects entre abas.
 */
(function (root) {
  "use strict";

  var PAGE_VALUE = "__page__";
  var ANONYMOUS_VALUE = "__anonymous__";
  var NEW_VALUE = "__new__";
  var STORAGE_KEY =
    root.AghuPatientArchive && root.AghuPatientArchive.LAST_KEY
      ? root.AghuPatientArchive.LAST_KEY
      : "aghu_last_patient_key";

  var activeKey = null;
  var registered = [];
  var syncing = false;
  /** @type {Promise<void>} */
  var ready;

  function isAnonymousKey(key) {
    return key === ANONYMOUS_VALUE;
  }

  function isPageValue(value) {
    return value === PAGE_VALUE;
  }

  function isNewValue(value) {
    return value === NEW_VALUE;
  }

  function isLocalOnlyValue(value) {
    return isPageValue(value) || isNewValue(value);
  }

  function isRealPatientKey(key) {
    return !!key && !isAnonymousKey(key) && !isLocalOnlyValue(key);
  }

  function getActiveKey() {
    return activeKey;
  }

  function isAnonymous() {
    return isAnonymousKey(activeKey);
  }

  async function loadStoredKey() {
    try {
      var got = await browser.storage.local.get(STORAGE_KEY);
      var saved = got[STORAGE_KEY];
      if (saved === ANONYMOUS_VALUE || isRealPatientKey(saved)) {
        return saved;
      }
    } catch (_e) {
      /* storage indisponível */
    }
    return null;
  }

  async function persistKey(key) {
    if (!key) return;
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: key });
    } catch (_e) {
      /* storage indisponível */
    }
  }

  function formatPatientHintLabel(recordOrMeta) {
    if (!recordOrMeta) return "";
    var name =
      recordOrMeta.nomeCompleto ||
      recordOrMeta.primeiroNome ||
      "?";
    var pront = recordOrMeta.prontuario || "?";
    return name + " · pront. " + pront;
  }

  async function updatePatientHint(hintEl, opts) {
    if (!hintEl) return;
    opts = opts || {};
    var key = opts.patientKey != null ? opts.patientKey : activeKey;
    var emptyMsg =
      opts.emptyMessage ||
      "Sem paciente — extraia ou selecione um prontuário";
    var anonMsg = opts.anonymousMessage || "Anônimo — sem paciente vinculado";
    var prefix = opts.prefix || "Ativo: ";

    if (isAnonymousKey(key)) {
      hintEl.textContent = anonMsg;
      hintEl.classList.remove("warn");
      return;
    }
    if (!isRealPatientKey(key)) {
      hintEl.textContent = emptyMsg;
      hintEl.classList.add("warn");
      return;
    }
    var label = "";
    if (root.AghuPatientArchive && root.AghuPatientArchive.loadPatientRecord) {
      var rec = await root.AghuPatientArchive.loadPatientRecord(key);
      if (rec && rec.prontuario) label = formatPatientHintLabel(rec);
    }
    if (!label) {
      hintEl.textContent = emptyMsg;
      hintEl.classList.add("warn");
      return;
    }
    hintEl.textContent = prefix + label + (opts.suffix || "");
    hintEl.classList.remove("warn");
  }

  async function refreshSelect(selectEl, opts) {
    if (!selectEl || !root.AghuPatientArchive) return;
    opts = opts || {};
    var includePage = !!opts.includePage;
    var includeAnonymous = !!opts.includeAnonymous;
    var includeNew = !!opts.includeNew;
    var selectedKey = opts.selectedKey;

    var entries = await root.AghuPatientArchive.listPatientsForSelect();
    selectEl.replaceChildren();

    if (includePage) {
      var optPage = document.createElement("option");
      optPage.value = PAGE_VALUE;
      optPage.textContent = "— Página atual (extrair) —";
      selectEl.appendChild(optPage);
    }
    if (includeNew) {
      var optNew = document.createElement("option");
      optNew.value = NEW_VALUE;
      optNew.textContent = "— Novo paciente (manual) —";
      selectEl.appendChild(optNew);
    }
    if (includeAnonymous) {
      var optAnon = document.createElement("option");
      optAnon.value = ANONYMOUS_VALUE;
      optAnon.textContent = "— Anônimo —";
      selectEl.appendChild(optAnon);
    }
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var o = document.createElement("option");
      o.value = e.patientKey;
      o.textContent =
        (e.primeiroNome || "?") + " · " + (e.prontuario || "?");
      selectEl.appendChild(o);
    }

    var want = selectedKey;
    if (want === PAGE_VALUE && includePage) {
      selectEl.value = PAGE_VALUE;
      return;
    }
    if (want === NEW_VALUE && includeNew) {
      selectEl.value = NEW_VALUE;
      return;
    }
    if (want === ANONYMOUS_VALUE && includeAnonymous) {
      selectEl.value = ANONYMOUS_VALUE;
      return;
    }
    if (
      want &&
      entries.some(function (x) {
        return x.patientKey === want;
      })
    ) {
      selectEl.value = want;
      return;
    }
    if (includePage) {
      selectEl.value = PAGE_VALUE;
    } else if (includeNew) {
      selectEl.value = NEW_VALUE;
    } else if (includeAnonymous && isAnonymousKey(activeKey)) {
      selectEl.value = ANONYMOUS_VALUE;
    } else if (
      activeKey &&
      isRealPatientKey(activeKey) &&
      entries.some(function (x) {
        return x.patientKey === activeKey;
      })
    ) {
      selectEl.value = activeKey;
    } else if (entries.length) {
      selectEl.value = entries[0].patientKey;
    }
  }

  function registerSelect(selectEl, opts) {
    if (!selectEl) return;
    opts = opts || {};
    registered.push({ selectEl: selectEl, opts: opts });
    function refreshRegistered() {
      return refreshSelect(selectEl, {
        includePage: opts.includePage,
        includeAnonymous: opts.includeAnonymous,
        includeNew: opts.includeNew,
        selectedKey: activeKey,
      });
    }
    if (ready) {
      void ready.then(refreshRegistered);
    } else {
      void refreshRegistered();
    }
  }

  async function syncAllSelects(key) {
    syncing = true;
    try {
      for (var i = 0; i < registered.length; i++) {
        var item = registered[i];
        var opts = item.opts || {};
        var selected = key;
        if (isAnonymousKey(key) && !opts.includeAnonymous) {
          // Abas sem opção Anônimo: mostrar Página/Novo de forma explícita (não null→fallback).
          if (opts.includePage) {
            selected = PAGE_VALUE;
          } else if (opts.includeNew) {
            selected = NEW_VALUE;
          } else {
            selected = null;
          }
        }
        await refreshSelect(item.selectEl, {
          includePage: opts.includePage,
          includeAnonymous: opts.includeAnonymous,
          includeNew: opts.includeNew,
          selectedKey: selected,
        });
      }
    } finally {
      syncing = false;
    }
  }

  function dispatchChanged(key, source) {
    document.dispatchEvent(
      new CustomEvent("aghu:active-patient-changed", {
        detail: { patientKey: key, source: source || "" },
      }),
    );
  }

  async function setActiveKey(key, opts) {
    opts = opts || {};
    if (isLocalOnlyValue(key)) return false;
    if (!isAnonymousKey(key) && !isRealPatientKey(key)) return false;

    activeKey = key;
    await persistKey(key);
    await syncAllSelects(key);
    dispatchChanged(key, opts.source || "");
    return true;
  }

  function isSyncing() {
    return syncing;
  }

  /**
   * Select «Paciente (local)» vs activeKey — fail-fast antes de sync/gerar com identidade.
   * Alinhado quando valores iguais (inclui ambos Anônimo).
   */
  function isSelectAlignedWithActive(selectEl) {
    if (!selectEl) return true;
    var sel = selectEl.value;
    var ak = activeKey;
    if (sel === ak) return true;
    if (isAnonymousKey(sel) && isAnonymousKey(ak)) return true;
    return false;
  }

  var MISALIGNED_MSG =
    "Select e paciente activo desalinhados — volte a seleccionar o paciente";

  async function init() {
    activeKey = await loadStoredKey();
    await syncAllSelects(activeKey);
  }

  function resetClinicalUiState() {
    activeKey = null;
    void syncAllSelects(null);
    dispatchChanged(null, "purge");
  }

  document.addEventListener("aghu:clinical-storage-cleared", function () {
    resetClinicalUiState();
  });

  function startInit() {
    if (root.AghuAuthStorageGuard && root.AghuAuthStorageGuard.ready) {
      ready = root.AghuAuthStorageGuard.ready.then(init);
      return;
    }
    ready = init();
  }

  root.AghuPopupActivePatient = {
    PAGE_VALUE: PAGE_VALUE,
    ANONYMOUS_VALUE: ANONYMOUS_VALUE,
    NEW_VALUE: NEW_VALUE,
    STORAGE_KEY: STORAGE_KEY,
    getActiveKey: getActiveKey,
    isAnonymous: isAnonymous,
    isAnonymousKey: isAnonymousKey,
    isPageValue: isPageValue,
    isNewValue: isNewValue,
    isLocalOnlyValue: isLocalOnlyValue,
    isRealPatientKey: isRealPatientKey,
    isSyncing: isSyncing,
    isSelectAlignedWithActive: isSelectAlignedWithActive,
    MISALIGNED_MSG: MISALIGNED_MSG,
    setActiveKey: setActiveKey,
    refreshSelect: refreshSelect,
    syncAllSelects: syncAllSelects,
    registerSelect: registerSelect,
    updatePatientHint: updatePatientHint,
    formatPatientHintLabel: formatPatientHintLabel,
    init: init,
    resetClinicalUiState: resetClinicalUiState,
    get ready() {
      return ready;
    },
  };

  startInit();
})(typeof globalThis !== "undefined" ? globalThis : window);
