// passometro_popup.js — editor local + sync na aba Passômetro (handlers/init)
"use strict";

(function () {
  const statusEl = document.getElementById("pm-status");
  const metaEl = document.getElementById("pm-meta");
  const patientSel = document.getElementById("pmPatientSelect");
  const patientHint = document.getElementById("pmPatientHint");
  const episodeBar = document.getElementById("pmEpisodeBar");
  const episodeSel = document.getElementById("pmEpisodeSelect");
  const episodeHint = document.getElementById("pmEpisodeHint");
  const activePatient = window.AghuPopupActivePatient;
  const btnSave = document.getElementById("btnSavePassometro");
  const btnAddDay = document.getElementById("btnAddPassometroDay");
  const btnFillPatient = document.getElementById("btnFillPassometroPatient");
  const btnPrint = document.getElementById("btnPrintPassometro");
  const headerForm = document.getElementById("pm-header-form");
  const entriesRoot = document.getElementById("pm-entries");
  const examsPreviewEl = document.getElementById("pm-exams-preview");
  const pmCustomLabel = document.getElementById("pmCustomLabel");
  const btnPmAddCustom = document.getElementById("btnPmAddCustom");
  const pmScoreSelect = document.getElementById("pmScoreSelect");
  const btnPmAddScore = document.getElementById("btnPmAddScore");
  const pmCustomFieldsList = document.getElementById("pmCustomFieldsList");

  if (!btnSave || !headerForm) return;

  if (activePatient && patientSel) {
    activePatient.registerSelect(patientSel, { includeNew: true });
  }

  const schema = () => window.AghuPassometroSchema;
  const archive = () => window.AghuPassometroArchive;
  const layout = () => window.AghuPassometroLayout;
  const templateApi = () => window.AghuPassometroTemplate;
  const printApi = () => window.AghuPassometroPrint;
  const examsTableApi = () => window.AghuPassometroExamsTable;
  const autofillApi = () => window.AghuPassometroAutofill;

  let currentExamsRaw = null;
  let userTemplate = null;
  let currentPatientKey = null;
  let currentCollection = null;
  let currentEpisodeId = null;
  let editableEpisodeId = null;
  let readOnlyMode = false;
  let currentSnap = schema() ? schema().emptySnap() : { header: {}, entries: [], atualizadoEm: null };
  let autosaveTimer = null;
  let autosaveInFlight = false;
  let pendingForceNewPassometro = false;
  let autosaveQueued = false;
  const AUTOSAVE_MS = 1500;

  let render;

  function effectiveTemplate(snap) {
    const tpl = templateApi();
    if (!tpl) return null;
    const base = userTemplate || tpl.DEFAULT_TEMPLATE;
    return tpl.resolveEffectiveTemplate(base, snap && snap.layout ? snap.layout : null);
  }

  function dateBrApi() {
    return typeof AghuDateBr !== "undefined" ? AghuDateBr : null;
  }

  function collectionApi() {
    return window.AghuPassometroCollection;
  }

  function registroLabel(registro) {
    if (!registro) return "Internação";
    var dih =
      registro.snap &&
      registro.snap.header &&
      registro.snap.header.dih
        ? String(registro.snap.header.dih).trim()
        : "";
    if (dih) return "DIH " + dih;
    var id = String(registro.patientEpisodeId || "");
    if (id === "pe-local") return "Internação local";
    return id.length > 12 ? "Internação " + id.slice(-6) : "Internação";
  }

  function pickEditableEpisodeId(collection) {
    var collApi = collectionApi();
    var arch = archive();
    if (!collApi || !collection || !Array.isArray(collection.registros)) return null;
    if (!collection.registros.length) return collApi.LOCAL_EPISODE_ID;
    if (arch && typeof arch.pickPrimaryRegistro === "function") {
      /* pickPrimaryRegistro is internal — mirror logic */
    }
    var best = collection.registros[0];
    for (var i = 1; i < collection.registros.length; i++) {
      var r = collection.registros[i];
      if ((r.atualizadoEm || 0) > (best.atualizadoEm || 0)) best = r;
    }
    return best.patientEpisodeId;
  }

  function applyReadOnlyMode(enabled) {
    readOnlyMode = enabled;
    var controls = [
      btnSave,
      btnAddDay,
      btnFillPatient,
      btnPmAddCustom,
      btnPmAddScore,
      pmCustomLabel,
      pmScoreSelect,
    ];
    for (var i = 0; i < controls.length; i++) {
      if (controls[i]) controls[i].disabled = enabled;
    }
    if (headerForm) {
      headerForm.querySelectorAll("input, textarea, select, button").forEach(function (el) {
        el.disabled = enabled;
      });
    }
    if (entriesRoot) {
      entriesRoot.querySelectorAll("input, textarea, select, button").forEach(function (el) {
        el.disabled = enabled;
      });
    }
    if (episodeHint) {
      episodeHint.textContent = enabled
        ? "Internação arquivada — somente leitura."
        : "";
      episodeHint.classList.toggle("warn", enabled);
    }
  }

  function refreshEpisodeSelect(collection, selectedId) {
    if (!episodeSel || !episodeBar || !collectionApi()) return;
    var coll = collectionApi().normalizeCollection(collection);
    if (coll.registros.length <= 1) {
      episodeBar.classList.add("hidden");
      episodeSel.replaceChildren();
      return;
    }
    episodeBar.classList.remove("hidden");
    episodeSel.replaceChildren();
    editableEpisodeId = pickEditableEpisodeId(coll);
    for (var i = 0; i < coll.registros.length; i++) {
      var reg = coll.registros[i];
      var opt = document.createElement("option");
      opt.value = reg.patientEpisodeId;
      opt.textContent =
        registroLabel(reg) +
        (reg.patientEpisodeId === editableEpisodeId ? " (activa)" : " (arquivada)");
      episodeSel.appendChild(opt);
    }
    var nextId = selectedId || editableEpisodeId || coll.registros[0].patientEpisodeId;
    episodeSel.value = nextId;
    currentEpisodeId = nextId;
    applyReadOnlyMode(nextId !== editableEpisodeId);
  }

  function snapFromCollection(collection, episodeId) {
    var collApi = collectionApi();
    if (!collApi || !collection) return null;
    var coll = collApi.normalizeCollection(collection);
    var reg = collApi.findRegistro(coll, episodeId);
    if (!reg) return null;
    var snap = reg.snap;
    if (schema()) snap = schema().normalizeSnap(snap);
    return snap;
  }

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

  async function flushPendingSave() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      await runAutosave();
      return;
    }
    if (autosaveInFlight) {
      while (autosaveInFlight) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void runAutosave(), AUTOSAVE_MS);
  }

  async function runAutosave() {
    if (autosaveInFlight) {
      autosaveQueued = true;
      return;
    }
    autosaveInFlight = true;
    try {
      const pk = await saveLocal({ silent: true });
      if (pk) setStatus("Guardado localmente.", "info");
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        scheduleAutosave();
      }
    }
  }

  function attachBrDateInput(inp, onAfter) {
    const api = dateBrApi();
    if (!api || !api.bindBrDateInput) return;
    api.bindBrDateInput(inp, { onAfter: () => { onAfter?.(); scheduleAutosave(); } });
  }

  function readCirurgiasFromForm() {
    const root = headerForm.querySelector("[data-pm-cirurgias-list]");
    if (!root) return [];
    const rows = root.querySelectorAll("[data-pm-cirurgia-row]");
    const list = [];
    rows.forEach((row) => {
      const id = row.getAttribute("data-pm-cirurgia-id") || "";
      const dataInp = row.querySelector('[data-pm-cirurgia="data"]');
      const descInp = row.querySelector('[data-pm-cirurgia="descricao"]');
      list.push({
        id: id,
        data: dataInp ? dataInp.value : "",
        descricao: descInp ? descInp.value : "",
      });
    });
    return list;
  }

  function localTodayBr() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }

  function applyTodayDihToForm() {
    var dihInput = headerForm && headerForm.querySelector('[name="dih"], [data-field="dih"]');
    if (dihInput && !String(dihInput.value || "").trim()) {
      dihInput.value = localTodayBr();
    }
  }

  function readHeaderFromForm() {
    const h = schema() ? schema().emptyHeader() : {};
    const tpl = effectiveTemplate(currentSnap);
    if (!tpl) return h;
    for (const f of tpl.fields.filter(
      (x) => x.section === "header" && x.visible !== false && x.kind !== "score"
    )) {
      if (f.widget === "cirurgias") {
        h.cirurgias = readCirurgiasFromForm();
        continue;
      }
      if (f.widget === "diagnosticos") {
        const root = headerForm.querySelector("[data-pm-diagnosticos-list]");
        if (!root) {
          h.diagnosticos = [];
          continue;
        }
        const rows = root.querySelectorAll("[data-pm-diagnostico-row]");
        const list = [];
        rows.forEach((row) => {
          const id = row.getAttribute("data-pm-diagnostico-id") || "";
          const dataInp = row.querySelector('[data-pm-diagnostico="data"]');
          const textoInp = row.querySelector('[data-pm-diagnostico="texto"]');
          list.push({
            id: id,
            data: dataInp ? dataInp.value : "",
            texto: textoInp ? textoInp.value : "",
          });
        });
        h.diagnosticos = list;
        continue;
      }
      const el = headerForm.querySelector(`[data-pm-header="${f.key}"]`);
      const val = el ? el.value : "";
      if (f.kind === "custom") {
        if (!h.custom) h.custom = {};
        h.custom[f.key] = val;
      } else {
        h[f.key] = val;
      }
    }
    return h;
  }

  function writeHeaderToForm(header) {
    const h = header || {};
    const api = dateBrApi();
    const tpl = effectiveTemplate(currentSnap);
    const fields = tpl
      ? tpl.fields.filter((f) => f.section === "header" && f.visible !== false && f.kind !== "score")
      : [];
    for (const f of fields) {
      if (f.widget === "cirurgias" || f.widget === "diagnosticos") {
        if (render && render.writeHeaderToForm) render.writeHeaderToForm(h);
        continue;
      }
      const el = headerForm.querySelector(`[data-pm-header="${f.key}"]`);
      if (!el) continue;
      let raw = f.kind === "custom" && h.custom ? h.custom[f.key] || "" : h[f.key] || "";
      el.value =
        f.key === "dih" && api
          ? api.normalizeBrDateDisplay(raw)
          : raw;
    }
  }

  function syncPoFromHeaderToEntries() {
    const poApi = window.AghuPassometroPo;
    if (!poApi || !poApi.computePoDnForHeader) return;
    const header = readHeaderFromForm();
    const cirurgias =
      poApi.normalizeCirurgias && poApi.normalizeCirurgias(header);
    if (!cirurgias || !cirurgias.length) return;
    entriesRoot.querySelectorAll("[data-pm-entry-id]").forEach((card) => {
      const dataInp = card.querySelector('[data-pm-field="data"]');
      const poInp = card.querySelector('[data-pm-field="po"]');
      if (!dataInp || !poInp) return;
      const po = poApi.computePoDnForHeader(header, dataInp.value);
      poInp.value = po || "";
    });
  }

  async function saveUserTemplateRemote(template) {
    const tpl = templateApi();
    const prefs = window.AghuUserPreferencesClient;
    const cfg = window.AghuSupabaseConfig;
    if (!tpl || !prefs || !cfg || !cfg.isConfigured || !cfg.isConfigured()) return;
    try {
      await prefs.writeUserPreference("passometro_template", {
        template: tpl.sanitizeTemplate(template),
      });
    } catch (_e) {
      /* ignore */
    }
  }

  function applyUserTemplate(nextTpl) {
    const tpl = templateApi();
    if (!tpl) return;
    userTemplate = tpl.sanitizeTemplate(nextTpl);
    void saveUserTemplateRemote(userTemplate);
    const header = readHeaderFromForm();
    const entries = render.collectEntriesFromDom();
    render.renderCustomizeFieldsList();
    render.renderHeaderForm(userTemplate);
    writeHeaderToForm(header);
    render.renderEntries(entries, userTemplate);
  }

  render = window.AghuPassometroPopupRender.create({
    headerForm,
    entriesRoot,
    examsPreviewEl,
    metaEl,
    pmCustomFieldsList,
    patientSel,
    getCurrentSnap: () => currentSnap,
    getUserTemplate: () => userTemplate,
    getCurrentExamsRaw: () => currentExamsRaw,
    setCurrentSnap: (snap) => { currentSnap = snap; },
    setCurrentExamsRaw: (raw) => { currentExamsRaw = raw; },
    setCurrentPatientKey: (pk) => { currentPatientKey = pk; },
    effectiveTemplate,
    readHeaderFromForm,
    writeHeaderToForm,
    scheduleAutosave,
    attachBrDateInput,
    syncPoFromHeaderToEntries,
    schema,
    layout,
    archive,
    templateApi,
    examsTableApi,
    dateBrApi,
    applyUserTemplate,
    setStatus,
    patientHint,
    autofillApi,
    currentSnapFromDom: () =>
      schema()
        ? schema().normalizeSnap({
            header: readHeaderFromForm(),
            entries: render.collectEntriesFromDom(),
            atualizadoEm: currentSnap.atualizadoEm,
          })
        : {
            header: readHeaderFromForm(),
            entries: render.collectEntriesFromDom(),
            atualizadoEm: currentSnap.atualizadoEm,
          },
  });

  function scoreRegistryApi() {
    return window.AghuPassometroScoreRegistry;
  }

  function populateScoreSelect() {
    if (!pmScoreSelect) return;
    const reg = scoreRegistryApi();
    if (!reg || !Array.isArray(reg.SCORE_CATALOG)) return;
    pmScoreSelect.replaceChildren();
    for (const s of reg.SCORE_CATALOG) {
      const opt = document.createElement("option");
      opt.value = s.scoreId;
      opt.textContent = s.label;
      pmScoreSelect.appendChild(opt);
    }
  }

  function readCustomSectionFromForm() {
    const checked = document.querySelector('input[name="pmCustomSection"]:checked');
    return checked && checked.value === "header" ? "header" : "entry";
  }

  function handleAddCustomField() {
    const api = templateApi();
    if (!api || !pmCustomLabel) return;
    const label = (pmCustomLabel.value || "").trim();
    if (!label) return;
    applyUserTemplate(
      api.addCustomField(effectiveTemplate(currentSnap), {
        label,
        section: readCustomSectionFromForm(),
        widget: "text",
      })
    );
    pmCustomLabel.value = "";
  }

  function handleAddScoreField() {
    const api = templateApi();
    const reg = scoreRegistryApi();
    if (!api || !reg || !pmScoreSelect) return;
    const scoreId = String(pmScoreSelect.value || "").trim();
    if (!scoreId) return;
    const meta = reg.catalogById ? reg.catalogById(scoreId) : null;
    applyUserTemplate(
      api.addScoreField(effectiveTemplate(currentSnap), {
        scoreId,
        label: (meta && meta.label) || scoreId.toUpperCase(),
        scoreParams: meta && meta.defaultParams ? meta.defaultParams : {},
      })
    );
  }

  async function loadUserTemplate() {
    const tpl = templateApi();
    if (!tpl) return;
    userTemplate = tpl.DEFAULT_TEMPLATE;
    const prefs = window.AghuUserPreferencesClient;
    const cfg = window.AghuSupabaseConfig;
    if (!prefs || !cfg || typeof cfg.isConfigured !== "function" || !cfg.isConfigured()) {
      render.renderCustomizeFieldsList();
      return;
    }
    try {
      const data = await prefs.readUserPreferences(["passometro_template"]);
      const row = data && data.passometro_template;
      if (row && typeof row === "object" && row.template) {
        userTemplate = tpl.sanitizeTemplate(row.template);
      }
    } catch (_e) {
      /* ignore */
    }
    render.renderCustomizeFieldsList();
  }

  function resolvePatientMeta() {
    const header = readHeaderFromForm();
    const nome = (header.nome || "").trim();
    const prontuario = (header.prontuario || "").trim();
    let patientKey = currentPatientKey;
    if (!patientKey) {
      patientKey =
        window.AghuPatientIdentity && window.AghuPatientIdentity.buildPatientKey
          ? window.AghuPatientIdentity.buildPatientKey(prontuario)
          : (prontuario || "").replace(/\D/g, "").replace(/^0+/, "") || null;
    }
    return {
      patientKey,
      primeiroNome: nome.split(/\s+/)[0] || "Paciente",
      nomeCompleto: nome,
      prontuario: prontuario || "?",
    };
  }

  async function saveLocal(opts = {}) {
    const silent = Boolean(opts.silent);
    if (readOnlyMode) {
      if (!silent) setStatus("Internação arquivada — somente leitura.", "info");
      return null;
    }
    const meta = resolvePatientMeta();
    const raw = {
      header: readHeaderFromForm(),
      entries: render.collectEntriesFromDom(),
      layout: currentSnap.layout || null,
      atualizadoEm: Date.now(),
    };
    const snap = schema() ? schema().normalizeSnap(raw) : raw;
    if (!archive()) {
      setStatus("Arquivo local indisponível.", "erro");
      return null;
    }
    await archive().savePassometroSnapshot(meta, snap);
    currentPatientKey = meta.patientKey;
    currentSnap = snap;
    if (archive().loadPassometroCollection) {
      currentCollection = await archive().loadPassometroCollection(meta.patientKey);
      currentEpisodeId = currentEpisodeId || editableEpisodeId || pickEditableEpisodeId(currentCollection);
      refreshEpisodeSelect(currentCollection, currentEpisodeId);
    }
    if (metaEl) {
      metaEl.textContent =
        "Atualizado localmente: " + new Date(snap.atualizadoEm).toLocaleString("pt-BR");
      metaEl.style.display = "block";
    }
    if (!silent) {
      await render.refreshPatientSelect(meta.patientKey);
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(meta.patientKey, { source: "passometro-save" });
      }
      render.displaySnap(schema() ? schema().normalizeSnap(Object.assign({}, snap, meta)) : snap);
    }
    return meta.patientKey;
  }

  async function syncAfterSave(patientKey, opts) {
    if (!patientKey || !window.AghuSupabaseSync) return null;
    opts = opts || {};
    var syncOpts = {
      forceNewPassometro:
        opts.forceNewPassometro === true || pendingForceNewPassometro === true,
      confirmedClose: opts.confirmedClose === true,
    };
    var out = await window.AghuSupabaseSync.syncPatient(patientKey, syncOpts);
    if (out && out.reason === "needs_confirm_close") {
      var ok = window.confirm(
        "A internação activa na nuvem já tem passômetro clínico. Ao sincronizar, essa internação será encerrada e uma nova será criada. Continuar?",
      );
      if (!ok) return "Nuvem: sincronização cancelada (confirme para nova internação).";
      out = await window.AghuSupabaseSync.syncPatient(patientKey, {
        forceNewPassometro: true,
        confirmedClose: true,
      });
    }
    if (out && out.ok) {
      pendingForceNewPassometro = false;
    }
    return window.AghuSupabaseSync.formatSyncMessage(out);
  }

  async function handleSave() {
    setStatus("A guardar…", "info");
    const pk = await saveLocal({ silent: true });
    if (!pk) return;
    const syncMsg = await syncAfterSave(pk);
    setStatus(
      syncMsg ? "✅ Guardado. " + syncMsg : "✅ Guardado localmente.",
      syncMsg && syncMsg.indexOf("sincronizado") !== -1 ? "ok" : "info"
    );
  }

  function addDay() {
    if (readOnlyMode) {
      setStatus("Internação arquivada — somente leitura.", "info");
      return;
    }
    const entry = schema() ? schema().emptyEntry() : { id: String(Date.now()), data: "" };
    const index = entriesRoot.querySelectorAll("[data-pm-entry-id]").length;
    entriesRoot.appendChild(render.buildEntryCard(entry, index, effectiveTemplate(currentSnap)));
    scheduleAutosave();
  }

  function handlePrint() {
    const api = printApi();
    if (!api) {
      setStatus("Módulo de impressão indisponível.", "error");
      return;
    }
    const snap = {
      header: readHeaderFromForm(),
      entries: render.collectEntriesFromDom(),
      layout: currentSnap.layout || null,
      atualizadoEm: currentSnap.atualizadoEm || null,
    };
    if (snap.entries.length === 0) {
      const ok = window.confirm("Nenhum dia registado. Imprimir só o cabeçalho?");
      if (!ok) return;
    }
    const exams = currentExamsRaw;
    const nome = (snap.header.nome || "").trim() || "Passômetro";
    const result = api.openPrintDialog(snap, {
      title: "Passômetro — " + nome,
      exams,
      template: effectiveTemplate(snap),
    });
    if (result && !result.ok) setStatus("Não foi possível abrir o diálogo de impressão.", "error");
  }

  async function loadPassometroForPatient(patientKey) {
    if (!patientKey || !archive()) return false;
    if (archive().loadPassometroCollection && collectionApi()) {
      currentCollection = await archive().loadPassometroCollection(patientKey);
      editableEpisodeId = pickEditableEpisodeId(currentCollection);
      currentEpisodeId = editableEpisodeId;
      refreshEpisodeSelect(currentCollection, currentEpisodeId);
      const snap = snapFromCollection(currentCollection, currentEpisodeId);
      if (!snap) return false;
      currentPatientKey = patientKey;
      render.displaySnap(snap);
      currentSnap = snap;
      void render.refreshExamsPreviewForPatient(patientKey);
      if (autofillApi() && autofillApi().isPassometroEmpty(snap)) {
        void render.fillFromAllArchives(patientKey, { overwrite: true });
      } else {
        setStatus("↩ Passômetro carregado do arquivo local.", "ok");
      }
      return true;
    }
    const snap = await archive().loadPassometroSnapshot(patientKey);
    if (!snap) return false;
    currentPatientKey = patientKey;
    render.displaySnap(snap);
    void render.refreshExamsPreviewForPatient(patientKey);
    if (autofillApi() && autofillApi().isPassometroEmpty(snap)) {
      void render.fillFromAllArchives(patientKey, { overwrite: true });
    } else {
      setStatus("↩ Passômetro carregado do arquivo local.", "ok");
    }
    return true;
  }

  if (episodeSel) {
    episodeSel.addEventListener("change", () => {
      if (!currentCollection || !collectionApi()) return;
      const episodeId = episodeSel.value;
      currentEpisodeId = episodeId;
      const snap = snapFromCollection(currentCollection, episodeId);
      if (!snap) return;
      currentSnap = snap;
      render.displaySnap(snap);
      applyReadOnlyMode(episodeId !== editableEpisodeId);
    });
  }

  if (patientSel) {
    patientSel.addEventListener("change", async () => {
      await flushPendingSave();
      if (activePatient && activePatient.isSyncing()) return;
      const v = patientSel.value;
      if (activePatient && activePatient.isNewValue(v)) {
        currentPatientKey = null;
        currentExamsRaw = null;
        pendingForceNewPassometro = true;
        render.renderExamsPreview(null);
        render.displaySnap(schema() ? schema().emptySnap() : { header: {}, entries: [] });
        applyTodayDihToForm();
        if (patientHint) patientHint.textContent = "Novo passômetro — preencha o cabeçalho.";
        return;
      }
      pendingForceNewPassometro = false;
      if (activePatient && activePatient.setActiveKey) {
        await activePatient.setActiveKey(v, { source: "passometro" });
      }
      await loadPassometroForPatient(v);
    });
  }

  document.addEventListener("aghu:active-patient-changed", async (ev) => {
    const detail = ev.detail || {};
    if (detail.source === "passometro" || detail.source === "passometro-save") return;
    const key = detail.patientKey;
    if (!key || !activePatient) return;
    if (activePatient.isAnonymousKey(key)) {
      if (patientHint && activePatient.updatePatientHint) {
        await activePatient.updatePatientHint(patientHint, {
          patientKey: key,
          anonymousMessage: "Anônimo — sem paciente vinculado",
        });
      }
      return;
    }
    if (activePatient.isRealPatientKey(key)) {
      await loadPassometroForPatient(key);
    }
  });

  async function startup() {
    populateScoreSelect();
    await loadUserTemplate();
    if (activePatient && activePatient.ready) await activePatient.ready;
    const lk =
      activePatient && activePatient.getActiveKey
        ? activePatient.getActiveKey()
        : null;
    await render.refreshPatientSelect(lk);
    try {
      if (lk && activePatient && activePatient.isRealPatientKey(lk) && archive()) {
        const snap = await archive().loadPassometroSnapshot(lk);
        if (snap) {
          currentPatientKey = lk;
          render.displaySnap(snap);
          await render.refreshExamsPreviewForPatient(lk);
          if (autofillApi() && autofillApi().isPassometroEmpty(snap)) {
            await render.fillFromAllArchives(lk, { overwrite: true });
          } else {
            setStatus("↩ Último passômetro restaurado.", "info");
          }
        }
      }
      if (archive() && archive().pruneStale) await archive().pruneStale();
    } catch (_e) {
      /* ignore */
    }
  }

  function resetClinicalUiState() {
    currentPatientKey = null;
    currentCollection = null;
    currentEpisodeId = null;
    editableEpisodeId = null;
    readOnlyMode = false;
    currentExamsRaw = null;
    if (episodeBar) episodeBar.classList.add("hidden");
    if (episodeHint) episodeHint.textContent = "";
    currentSnap = schema() ? schema().emptySnap() : { header: {}, entries: [], atualizadoEm: null };
    if (render) {
      render.renderExamsPreview(null);
      render.displaySnap(currentSnap);
      void render.refreshPatientSelect(null);
    }
    setStatus("", "");
    if (patientHint) {
      patientHint.textContent = "";
      patientHint.classList.remove("warn");
    }
  }

  document.addEventListener("aghu:clinical-storage-cleared", function () {
    resetClinicalUiState();
  });

  headerForm.addEventListener("input", scheduleAutosave);
  entriesRoot.addEventListener("input", scheduleAutosave);
  btnSave.addEventListener("click", () => void handleSave());
  if (btnAddDay) btnAddDay.addEventListener("click", addDay);
  if (btnFillPatient) btnFillPatient.addEventListener("click", () => void render.fillFromAllArchives(null, { overwrite: true }));
  if (btnPrint) btnPrint.addEventListener("click", () => void handlePrint());
  if (btnPmAddCustom) btnPmAddCustom.addEventListener("click", handleAddCustomField);
  if (btnPmAddScore) btnPmAddScore.addEventListener("click", handleAddScoreField);

  if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
    window.AghuAuthStorageGuard.ready.then(startup);
  } else {
    startup();
  }

  window.AghuPassometroPopup = {
    flushPendingSave: flushPendingSave,
  };
})();
