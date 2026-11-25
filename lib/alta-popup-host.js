/**
 * Host do kit de Alta na popup — 7 sub-abas, toggle Campos + Documento
 * (Documento abre janela popup dedicada), action bar (autosave/imprimir/kit)
 * e embed do host RX existente para Receituário.
 *
 * Regra de negócio (seed, sync cruzado laudo<->atestado<->retorno, templates)
 * fica em lib/alta-schema.js / alta-text-template-apply.js — este ficheiro só
 * faz wiring de DOM vanilla (sem innerHTML livre) e chama as funções já
 * existentes do motor. Ver specs/FEAT-159-alta-popup-extensao/plan.md.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAltaPopupHost = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var mountedState = null;
  var documentoWindowState = null;
  var documentoWindowPatchedListenerBound = false;
  var autosaveTimer = null;
  var AUTOSAVE_MS = 2000;

  var SUBTABS = [
    { id: "receituario", label: "Receituário" },
    { id: "orientacoes", label: "Orientações" },
    { id: "laudo", label: "Laudo" },
    { id: "laudoPersonalizado", label: "Laudo personalizado" },
    { id: "atestado", label: "Atestado" },
    { id: "acompanhante", label: "Acompanhante" },
    { id: "retorno", label: "Retorno" },
    { id: "encaminhamentos", label: "Encaminhamentos" },
  ];

  var ENC_NESTED = [
    { id: "referencia", label: "Referência" },
    { id: "contrarreferencia", label: "Contrarreferência" },
  ];

  // Kinds de template de texto por sub-aba — só existe para as 4 secções
  // que têm modelo (KIND_* em alta-text-template-schema.js) + FEAT-314 referencia.
  var TEMPLATE_KIND_BY_SUBTAB = {
    orientacoes: "orientacoes",
    laudo: "laudo",
    atestado: "atestado",
    retorno: "retorno",
    referencia: "referencia",
  };

  var PRINT_LABEL_BY_SUBTAB = {
    orientacoes: "Orientações",
    laudo: "Laudo médico",
    laudoPersonalizado: "Laudo personalizado",
    atestado: "Atestado médico",
    acompanhante: "Declaração de acompanhante",
    retorno: "Cartão de retorno",
    referencia: "Guia de Referência",
    contrarreferencia: "Guia de Contrarreferência",
  };

  var PRINT_FN_BY_SUBTAB = {
    orientacoes: "printOrientacoes",
    laudo: "printLaudo",
    laudoPersonalizado: "printLaudoPersonalizado",
    atestado: "printAtestado",
    acompanhante: "printAcompanhante",
    retorno: "printRetorno",
    referencia: "printReferencia",
    contrarreferencia: "printContrarreferencia",
  };

  /** Kinds com preview Documento (incl. Receituário — FEAT-312 / FEAT-041). */
  var DOCUMENT_KINDS = [
    "receituario",
    "orientacoes",
    "laudo",
    "laudoPersonalizado",
    "atestado",
    "acompanhante",
    "retorno",
    "referencia",
    "contrarreferencia",
  ];

  var documentoPatchedListenerBound = false;

  // ---------------------------------------------------------------------
  // Dependências (require em Node p/ testes puros; window.* no browser)
  // ---------------------------------------------------------------------

  function req(path) {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require(path);
      } catch (_e) {
        return null;
      }
    }
    return null;
  }
  function altaSchemaApi() {
    return req("./alta-schema.js") || root.AghuAltaSchema;
  }
  function previewHtmlApi() {
    return req("./alta-preview-html.js") || root.AghuAltaPreviewHtml;
  }
  function previewSyncApi() {
    return req("./alta-preview-sync.js") || root.AghuAltaPreviewSync;
  }
  function previewEditableApi() {
    return req("./alta-preview-editable.js") || root.AghuAltaPreviewEditable;
  }
  function altaPrintApi() {
    return req("./alta-print.js") || root.AghuAltaPrint;
  }
  function textTemplateSchemaApi() {
    return req("./alta-text-template-schema.js") || root.AghuAltaTextTemplateSchema;
  }
  function textTemplateApplyApi() {
    return req("./alta-text-template-apply.js") || root.AghuAltaTextTemplateApply;
  }
  function textTemplateExportApi() {
    return req("./alta-text-template-export.js") || root.AghuAltaTextTemplateExport;
  }
  function templateBuiltinApi() {
    return req("./alta-template-builtin.js") || root.AghuAltaTemplateBuiltin;
  }
  function domMountApi() {
    return req("./dom-mount.js") || root.AghuDomMount;
  }
  function patientCtxApi() {
    return req("./receita-patient-context.js") || root.AghuReceitaPatientContext;
  }
  function rxHostApi() {
    return root.AghuReceitaPopupHost;
  }
  function rxArchiveApi() {
    return root.AghuReceitaArchive;
  }
  function altaArchiveApi() {
    return root.AghuAltaArchive;
  }
  function webAppApi() {
    return root.AghuWebApp;
  }
  function userPrefsApi() {
    return root.AghuUserPreferencesClient;
  }
  function templatesManagerApi() {
    return root.AghuAltaTemplatesManagerHost;
  }
  function receitaPrintApi() {
    return req("./receita-print.js") || root.AghuReceitaPrint;
  }
  function encaminhamentoApi() {
    return req("./alta-encaminhamento.js") || root.AghuAltaEncaminhamento;
  }

  function openTemplatesManager(state, initialKind) {
    var mgr = templatesManagerApi();
    if (!mgr || typeof mgr.open !== "function") {
      setActionStatus(state, "Gestão de modelos indisponível.", true);
      return;
    }
    var kind = initialKind || "receitas";
    if (kind !== "receitas" && TEMPLATE_KIND_BY_SUBTAB[kind]) {
      kind = TEMPLATE_KIND_BY_SUBTAB[kind] || kind;
    }
    mgr.open({
      initialKind: kind,
      rxTemplates: state.rxTemplates || [],
      altaTemplates: (state.altaTemplatesSnap && state.altaTemplatesSnap.templates) || [],
      onRxTemplatesChange: function (next) {
        state.rxTemplates = next || [];
        if (state.activeSubtab === "receituario") renderAll(state);
      },
      onAltaTemplatesChange: function (next) {
        var textSchema = textTemplateSchemaApi();
        state.altaTemplatesSnap = textSchema
          ? textSchema.normalizeSnap({ templates: next || [] })
          : { templates: next || [] };
        renderAll(state);
      },
    });
  }

  // ---------------------------------------------------------------------
  // Lógica pura (testável sem DOM) — seed fingerprint
  // ---------------------------------------------------------------------

  function isValidDocumentoKind(kind) {
    return typeof kind === "string" && DOCUMENT_KINDS.indexOf(kind) !== -1;
  }

  /**
   * Path relativo da janela Documento (só kind + patientKey opaco).
   * @returns {string|null}
   */
  function buildAltaDocumentoWindowUrl(kind, patientKey) {
    if (!isValidDocumentoKind(kind)) return null;
    if (typeof patientKey !== "string" || !patientKey.trim()) return null;
    return (
      "popup/alta-documento.html?kind=" +
      encodeURIComponent(kind) +
      "&patientKey=" +
      encodeURIComponent(patientKey.trim())
    );
  }

  function requestOpenDocumentoWindow(kind, patientKey) {
    var rel = buildAltaDocumentoWindowUrl(kind, patientKey);
    if (!rel) {
      return Promise.resolve({ ok: false, error: "invalid_args" });
    }
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.sendMessage) {
      return Promise.resolve({ ok: false, error: "no_runtime" });
    }
    return browser.runtime
      .sendMessage({
        action: "openAltaDocumentoWindow",
        kind: kind,
        patientKey: String(patientKey).trim(),
      })
      .then(function (res) {
        return res && typeof res === "object" ? res : { ok: false, error: "no_response" };
      })
      .catch(function () {
        return { ok: false, error: "send_failed" };
      });
  }

  /**
   * Fingerprint estável dos campos do passômetro usados como seed do kit de
   * alta (paridade web `applyPassometroToAlta`: dataInternacao/diagnostico/
   * procedimentos[]/equipes[]). Usada para decidir se um re-seed é
   * necessário (ALTAEXT-AC-11) sem reaplicar em loop.
   * @param {object|null} passometroSnap
   * @returns {string} fingerprint estável ("" se não há dados de seed)
   */
  function computeAltaSeedFingerprint(passometroSnap) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi || !passometroSnap || typeof passometroSnap !== "object") return "";
    var seed;
    try {
      seed = schemaApi.extractAltaSeedFromPassometro(passometroSnap, null);
    } catch (_e) {
      return "";
    }
    if (!seed) return "";
    var laudo = seed.laudo || {};
    var retorno = seed.retorno || {};
    var basis = {
      dataInternacao: laudo.dataInternacao || "",
      diagnostico: laudo.diagnostico || "",
      procedimentos: Array.isArray(laudo.procedimentos) ? laudo.procedimentos : [],
      equipes: Array.isArray(retorno.equipes) ? retorno.equipes : [],
    };
    if (
      !basis.dataInternacao &&
      !basis.diagnostico &&
      !basis.procedimentos.length &&
      !basis.equipes.length
    ) {
      return "";
    }
    try {
      return JSON.stringify(basis);
    } catch (_e2) {
      return "";
    }
  }

  /**
   * @param {string} prevFingerprint fingerprint guardada na última gravação local
   * @param {string} nextFingerprint fingerprint actual do passômetro
   * @returns {boolean} true quando deve reaplicar o seed (normalizeSnap com passometro)
   */
  function seedFingerprintChanged(prevFingerprint, nextFingerprint) {
    var next = String(nextFingerprint || "");
    if (!next) return false;
    return String(prevFingerprint || "") !== next;
  }

  /**
   * @param {string} subtabId
   * @returns {string|null} kind de alta-text-template-schema.js ou null (sem modelo)
   */
  function resolveSubtabTemplateKind(subtabId) {
    return TEMPLATE_KIND_BY_SUBTAB[subtabId] || null;
  }

  /**
   * ALTAEXT-AC-08: sem identidade do paciente resolvida (avulso sem nome
   * preenchido — paridade web: nome+prontuário) o kit não deve gravar em
   * silêncio; a UI mostra mensagem explícita em vez de persistir/sincronizar.
   * Extraído como função pura (sem DOM/archive) para ser testável isolado do
   * wiring de `persistLocalSnapshot`.
   * @param {boolean} avulso paciente sem prontuário AGHU
   * @param {string} nome nome resolvido (avulsoFields.nomeCompleto ou meta)
   * @returns {boolean} true quando o sync/persistência local deve ser bloqueado
   */
  function shouldBlockAutosaveForMissingIdentity(avulso, nome) {
    return !!avulso && !String(nome || "").trim();
  }

  /**
   * ALTARX-AC-07: chrome do nome no kit.
   * Avulso → banner editável; paciente AGHU → barra só leitura no shell.
   * O RX embutido (`hideAvulsoNameUi`) não duplica o campo.
   * @param {boolean} avulso
   * @returns {"editable-banner"|"readonly-bar"}
   */
  function resolveAltaPatientNameUi(avulso) {
    return avulso ? "editable-banner" : "readonly-bar";
  }

  /**
   * ALTARX-AC-07: remount destrói o input de nome. Só remontar quando
   * patientKey ou o modo avulso mudam.
   * @param {{ patientKey?: string, avulso?: boolean }|null} current
   * @param {{ patientKey?: string, avulso?: boolean }|null} next
   * @returns {boolean}
   */
  function shouldRemountAltaEditor(current, next) {
    if (!current || !next) return true;
    return (
      String(current.patientKey || "") !== String(next.patientKey || "") ||
      !!current.avulso !== !!next.avulso
    );
  }

  function getMountedIdentity() {
    if (!mountedState || !mountedState.mountEl || !mountedState.mountEl.firstChild) {
      return null;
    }
    var meta = mountedState.meta || {};
    return {
      patientKey: meta.patientKey || "",
      avulso: !!mountedState.avulso,
    };
  }

  function clearMountedIdentity() {
    mountedState = null;
  }

  // ---------------------------------------------------------------------
  // Status / autosave
  // ---------------------------------------------------------------------

  function setActionStatus(state, msg, isError) {
    if (!state) return;
    // Uma superfície só: action bar do kit tem prioridade sobre #receitas-status
    // (evitar dois banners "Guardado" — um dentro da bar e outro abaixo do mount).
    var el = state.actionStatusEl || state.statusEl;
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = isError
      ? "sync-status sync-error"
      : "sync-status sync-ok";
    if (
      state.actionStatusEl &&
      state.statusEl &&
      state.statusEl !== state.actionStatusEl
    ) {
      state.statusEl.hidden = true;
      state.statusEl.textContent = "";
    }
  }

  function scheduleAutosave(state) {
    if (!state) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      persistLocalSnapshot(state, true);
    }, AUTOSAVE_MS);
  }

  function persistLocalSnapshot(state, silent) {
    var schemaApi = altaSchemaApi();
    var archive = altaArchiveApi();
    if (!schemaApi || !archive || !state || !state.snap) return;
    var nome =
      (state.avulsoFields && state.avulsoFields.nomeCompleto) ||
      state.meta.nomeCompleto ||
      state.meta.primeiroNome ||
      "";
    if (!schemaApi.snapHasSaveableContent(state.snap, nome)) return;
    // ALTAEXT-AC-08: sem nome+prontuário (paciente avulso sem nome) — bloqueia
    // a persistência local com mensagem explícita em vez de gravar em silêncio.
    if (shouldBlockAutosaveForMissingIdentity(state.avulso, nome)) {
      setActionStatus(state, "Preencha o nome do paciente para guardar localmente.", true);
      return;
    }
    state.snap.atualizadoEm = Date.now();
    var saveMeta = Object.assign({}, state.meta, {
      nomeCompleto: nome,
      avulso: !!state.avulso,
      patientAddress: schemaApi.resolveBestPatientAddressFromSnap(state.snap, null),
    });
    archive
      .saveAltaSnapshot(saveMeta, state.snap, { seedFingerprint: state.seedFingerprint || "" })
      .then(function () {
        if (typeof state.onDocumentoPatched === "function") {
          try {
            state.onDocumentoPatched({
              kind: state.documentoKind || null,
              patientKey: (state.meta && state.meta.patientKey) || "",
            });
          } catch (_e) {
            /* notificação best-effort */
          }
        }
        if (silent) {
          setActionStatus(state, "Guardado", false);
        } else {
          setActionStatus(state, "Guardado localmente.", false);
        }
      })
      .catch(function () {
        setActionStatus(state, "Não foi possível guardar localmente.", true);
      });
  }

  // ---------------------------------------------------------------------
  // Contexto de impressão (paridade com receita-popup-host.js)
  // ---------------------------------------------------------------------

  function resolvePrintPatient(meta, avulsoFields, patientAddress) {
    var ctxApi = patientCtxApi();
    if (!ctxApi) {
      return {
        nome: meta.nomeCompleto || meta.primeiroNome || "—",
        prontuario: meta.prontuario || "",
      };
    }
    var addrCtx = patientAddress ? { patientAddress: patientAddress } : {};
    if (meta.avulso || !meta.prontuario) {
      var resolved = ctxApi.resolvePatientContext({
        mode: "unregistered",
        nomeCompleto: (avulsoFields && avulsoFields.nomeCompleto) || meta.nomeCompleto || "",
        prontuario: meta.prontuario || "",
        patientKey: meta.patientKey || "",
      });
      return ctxApi.contextForPrint(Object.assign({}, resolved, addrCtx));
    }
    return ctxApi.contextForPrint(
      Object.assign(
        {
          nomeCompleto: meta.nomeCompleto || meta.primeiroNome || "",
          prontuario: meta.prontuario || "",
        },
        addrCtx,
      ),
    );
  }

  function buildPrintCtx(state) {
    var schemaApi = altaSchemaApi();
    var snap = state.snap;
    var addr =
      schemaApi && snap ? schemaApi.resolveBestPatientAddressFromSnap(snap, null) : null;
    var patient = resolvePrintPatient(state.meta, state.avulsoFields, addr);
    var ctx = {
      patient: patient,
      patientAddress: addr,
      receitas: snap.receitas,
      orientacoes: snap.orientacoes,
      laudo: snap.laudo,
      atestado: snap.atestado,
      acompanhante: snap.acompanhante,
      laudoPersonalizado: snap.laudoPersonalizado,
      retorno: snap.retorno,
      referencia: snap.referencia,
      contrarreferencia: snap.contrarreferencia,
      previewHtml: snap.previewHtml,
      printDate: new Date(),
    };
    var ext = root.AghuExtensionSettings;
    var cached =
      state && state._extensionSettings
        ? state._extensionSettings
        : ext && ext._memoryCache
          ? ext._memoryCache
          : null;
    if (cached && typeof cached === "object") {
      if (cached.service_line) ctx.serviceLine = cached.service_line;
      if (cached.location_line) ctx.locationLine = cached.location_line;
    }
    return ctx;
  }

  /**
   * Carrega prefs FEAT-306 para o host (print/preview).
   * @param {object} state
   * @returns {Promise<object>}
   */
  function ensureExtensionSettings(state) {
    var ext = root.AghuExtensionSettings;
    if (!ext || typeof ext.loadSettings !== "function") {
      return Promise.resolve(state);
    }
    return ext.loadSettings().then(function (out) {
      state._extensionSettings = out.settings;
      ext._memoryCache = out.settings;
      return state;
    });
  }

  // ---------------------------------------------------------------------
  // Mutação de secções — sempre via patch* do schema + invalidação de preview
  // ---------------------------------------------------------------------

  function clearPreviewSections(state, sections) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    var preview = state.snap.previewHtml;
    for (var i = 0; i < sections.length; i++) {
      preview = schemaApi.clearPreviewHtmlSection(preview, sections[i]);
    }
    state.snap.previewHtml = preview;
  }

  function applyLaudoPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap = schemaApi.patchLaudo(state.snap, partial);
    // Laudo cruza com atestado/retorno (procedimento, diagnóstico) — invalida
    // as 3 pré-visualizações para evitar overrides desactualizados.
    clearPreviewSections(state, ["laudo", "atestado", "retorno"]);
    scheduleAutosave(state);
  }

  function applyAtestadoPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap = schemaApi.patchAtestado(state.snap, partial);
    clearPreviewSections(state, ["laudo", "atestado"]);
    scheduleAutosave(state);
  }

  function applyAcompanhantePatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap = schemaApi.patchAcompanhante(state.snap, partial);
    clearPreviewSections(state, ["acompanhante"]);
    scheduleAutosave(state);
  }

  function applyLaudoPersonalizadoPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap = schemaApi.patchLaudoPersonalizado(state.snap, partial);
    clearPreviewSections(state, ["laudoPersonalizado"]);
    scheduleAutosave(state);
  }

  function applyRetornoPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap = schemaApi.patchRetorno(state.snap, partial);
    clearPreviewSections(state, ["laudo", "retorno"]);
    scheduleAutosave(state);
  }

  function applyReferenciaPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi || typeof schemaApi.patchReferencia !== "function") return;
    state.snap = schemaApi.patchReferencia(state.snap, partial);
    clearPreviewSections(state, ["referencia"]);
    scheduleAutosave(state);
  }

  function applyContrarreferenciaPatch(state, partial) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi || typeof schemaApi.patchContrarreferencia !== "function") return;
    state.snap = schemaApi.patchContrarreferencia(state.snap, partial);
    clearPreviewSections(state, ["contrarreferencia"]);
    scheduleAutosave(state);
  }

  function resolveEncNestedId(state) {
    var id = state.encNested || "referencia";
    return id === "contrarreferencia" ? "contrarreferencia" : "referencia";
  }

  function applyOrientacoesItems(state, items) {
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    state.snap.orientacoes = schemaApi.normalizeOrientacoes({ items: items, updatedAt: Date.now() });
    clearPreviewSections(state, ["orientacoes"]);
    scheduleAutosave(state);
  }

  function applyPreviewExtraction(state, kind, container) {
    var schemaApi = altaSchemaApi();
    var syncApi = previewSyncApi();
    if (!schemaApi || !syncApi || !container) return;
    var change = syncApi.extractPreviewChange(container, kind);
    var patch = change.patch || {};
    if (patch.orientacoes) {
      state.snap.orientacoes = schemaApi.normalizeOrientacoes(patch.orientacoes);
    }
    if (patch.laudo) state.snap = schemaApi.patchLaudo(state.snap, patch.laudo);
    if (patch.atestado) state.snap = schemaApi.patchAtestado(state.snap, patch.atestado);
    if (patch.laudoPersonalizado) {
      state.snap = schemaApi.patchLaudoPersonalizado(state.snap, patch.laudoPersonalizado);
    }
    if (patch.acompanhante) {
      state.snap = schemaApi.patchAcompanhante(state.snap, patch.acompanhante);
    }
    if (patch.referencia && typeof schemaApi.patchReferencia === "function") {
      state.snap = schemaApi.patchReferencia(state.snap, patch.referencia);
    }
    if (
      patch.contrarreferencia &&
      typeof schemaApi.patchContrarreferencia === "function"
    ) {
      state.snap = schemaApi.patchContrarreferencia(
        state.snap,
        patch.contrarreferencia,
      );
    }
    if (patch.retorno) state.snap = schemaApi.patchRetorno(state.snap, patch.retorno);
    if (Array.isArray(patch.receitas)) {
      var rxSchema = root.AghuReceitaSchema;
      if (rxSchema && typeof rxSchema.normalizeSnap === "function") {
        var normalizedRx = rxSchema.normalizeSnap({
          version: 1,
          receitas: patch.receitas,
        });
        state.snap.receitas = normalizedRx.receitas || patch.receitas;
      } else {
        state.snap.receitas = patch.receitas;
      }
    }
    var previewPatch = change.previewHtml || {};
    state.snap.previewHtml = schemaApi.normalizePreviewHtml(
      Object.assign({}, state.snap.previewHtml, previewPatch),
    );
    scheduleAutosave(state);
  }

  // ---------------------------------------------------------------------
  // Construtores de campo (Campos mode)
  // ---------------------------------------------------------------------

  function createFieldHint(text) {
    var hint = document.createElement("span");
    hint.className = "calc-field-hint";
    hint.textContent = text;
    return hint;
  }

  function createTextField(labelText, value, onInput, opts) {
    opts = opts || {};
    var field = document.createElement("label");
    field.className = "alta-field";
    field.appendChild(createFieldHint(labelText));
    var input = document.createElement("input");
    input.type = opts.type || "text";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.min != null) input.min = String(opts.min);
    input.value = value == null ? "" : String(value);
    input.setAttribute("aria-label", labelText);
    if (opts.readOnly) input.readOnly = true;
    input.addEventListener("input", function () {
      onInput(opts.type === "number" ? Number(input.value) || 0 : input.value);
    });
    field.appendChild(input);
    if (opts.hint) field.appendChild(createFieldHint(opts.hint));
    return field;
  }

  function createTextareaField(labelText, value, onInput, opts) {
    opts = opts || {};
    var field = document.createElement("label");
    field.className = "alta-field alta-field-block";
    field.appendChild(createFieldHint(labelText));
    var textarea = document.createElement("textarea");
    textarea.className = "alta-textarea";
    textarea.rows = opts.rows || 3;
    if (opts.placeholder) textarea.placeholder = opts.placeholder;
    textarea.value = value == null ? "" : String(value);
    textarea.setAttribute("aria-label", labelText);
    textarea.addEventListener("input", function () {
      onInput(textarea.value);
    });
    field.appendChild(textarea);
    if (opts.hint) field.appendChild(createFieldHint(opts.hint));
    return field;
  }

  function createCheckboxField(labelText, checked, onChange) {
    var field = document.createElement("label");
    field.className = "alta-field alta-field-checkbox";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!checked;
    input.addEventListener("change", function () {
      onChange(input.checked);
    });
    field.appendChild(input);
    var span = document.createElement("span");
    span.textContent = labelText;
    field.appendChild(span);
    return field;
  }

  // ---------------------------------------------------------------------
  // Renderização por sub-aba — modo Campos
  // ---------------------------------------------------------------------

  function renderOrientacoesFields(container, state) {
    var items = (state.snap.orientacoes && state.snap.orientacoes.items) || [];
    var list = document.createElement("div");
    list.className = "alta-orientacoes-editor";

    function redraw() {
      list.replaceChildren();
      items.forEach(function (item, idx) {
        var row = document.createElement("div");
        row.className = "alta-orientacao-row";
        var textarea = document.createElement("textarea");
        textarea.className = "alta-textarea";
        textarea.rows = 2;
        textarea.value = item;
        textarea.setAttribute("aria-label", "Orientação " + (idx + 1));
        textarea.addEventListener("input", function () {
          items[idx] = textarea.value;
          applyOrientacoesItems(state, items);
        });
        var btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "receitas-line-remove";
        btnRemove.title = "Remover orientação";
        btnRemove.textContent = "×";
        btnRemove.addEventListener("click", function () {
          items.splice(idx, 1);
          applyOrientacoesItems(state, items);
          redraw();
        });
        row.appendChild(textarea);
        row.appendChild(btnRemove);
        list.appendChild(row);
      });
      if (!items.length) {
        var empty = document.createElement("p");
        empty.className = "calc-empty";
        empty.textContent = "Nenhuma orientação — use «+ Orientação».";
        list.appendChild(empty);
      }
    }

    var btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "btn btn-sm";
    btnAdd.textContent = "+ Orientação";
    btnAdd.addEventListener("click", function () {
      items.push("");
      applyOrientacoesItems(state, items);
      redraw();
    });

    container.appendChild(list);
    container.appendChild(btnAdd);
    redraw();
  }

  function renderLaudoFields(container, state) {
    var laudo = state.snap.laudo || {};
    var hasProcedimentos = Array.isArray(laudo.procedimentos) && laudo.procedimentos.length > 0;

    container.appendChild(
      createTextField(
        "Data de internação",
        laudo.dataInternacao,
        function (v) {
          applyLaudoPatch(state, { dataInternacao: v });
        },
        { placeholder: "AAAA-MM-DD" },
      ),
    );
    container.appendChild(
      createTextField("Diagnóstico", laudo.diagnostico, function (v) {
        applyLaudoPatch(state, { diagnostico: v });
      }),
    );
    container.appendChild(
      createTextField(
        "Procedimento",
        laudo.procedimento,
        function (v) {
          applyLaudoPatch(state, { procedimento: v });
        },
        {
          readOnly: hasProcedimentos,
          hint: hasProcedimentos
            ? "Vários procedimentos seedados do passômetro — edite no modo Documento."
            : "",
        },
      ),
    );
    if (!hasProcedimentos) {
      container.appendChild(
        createTextField(
          "Data do procedimento",
          laudo.dataProcedimento,
          function (v) {
            applyLaudoPatch(state, { dataProcedimento: v });
          },
          { placeholder: "AAAA-MM-DD" },
        ),
      );
    }
    container.appendChild(
      createTextareaField(
        "Evolução",
        laudo.evolucao,
        function (v) {
          applyLaudoPatch(state, { evolucao: v });
        },
        { rows: 4 },
      ),
    );
    container.appendChild(
      createCheckboxField("Sem intercorrências", laudo.semIntercorrencias !== false, function (v) {
        applyLaudoPatch(state, { semIntercorrencias: v });
      }),
    );
    container.appendChild(
      createTextField("CID-10", laudo.cid10, function (v) {
        applyLaudoPatch(state, { cid10: v });
      }),
    );
    container.appendChild(
      createCheckboxField(
        "Divulgação de CID autorizada",
        !!laudo.divulgacaoCidAutorizada,
        function (v) {
          applyLaudoPatch(state, { divulgacaoCidAutorizada: v });
        },
      ),
    );
  }

  function renderAtestadoFields(container, state) {
    var atestado = state.snap.atestado || {};
    container.appendChild(
      createTextField("Procedimento", atestado.procedimento, function (v) {
        applyAtestadoPatch(state, { procedimento: v });
      }),
    );
    container.appendChild(
      createTextField(
        "Dias de afastamento",
        atestado.diasAfastamento,
        function (v) {
          applyAtestadoPatch(state, { diasAfastamento: v });
        },
        { type: "number", min: 1 },
      ),
    );
    container.appendChild(
      createTextField(
        "Data de início do afastamento",
        atestado.dataInicioAfastamento,
        function (v) {
          applyAtestadoPatch(state, { dataInicioAfastamento: v });
        },
        { placeholder: "AAAA-MM-DD" },
      ),
    );
    container.appendChild(
      createTextField("CID-10", atestado.cid10, function (v) {
        applyAtestadoPatch(state, { cid10: v });
      }),
    );
    container.appendChild(
      createCheckboxField(
        "Divulgação de CID autorizada",
        !!atestado.divulgacaoCidAutorizada,
        function (v) {
          applyAtestadoPatch(state, { divulgacaoCidAutorizada: v });
        },
      ),
    );
  }

  function renderAcompanhanteFields(container, state) {
    var acompanhante = state.snap.acompanhante || {};
    container.appendChild(
      createTextField("Nome do acompanhante", acompanhante.nomeAcompanhante, function (v) {
        applyAcompanhantePatch(state, { nomeAcompanhante: v });
      }),
    );
    container.appendChild(
      createTextField(
        "Dias de declaração",
        acompanhante.diasDeclaracao,
        function (v) {
          applyAcompanhantePatch(state, { diasDeclaracao: v });
        },
        { type: "number", min: 1 },
      ),
    );
    container.appendChild(
      createTextField(
        "Data de início",
        acompanhante.dataInicio,
        function (v) {
          applyAcompanhantePatch(state, { dataInicio: v });
        },
        { placeholder: "AAAA-MM-DD" },
      ),
    );
    container.appendChild(
      createTextField("CID-10", acompanhante.cid10, function (v) {
        applyAcompanhantePatch(state, { cid10: v });
      }),
    );
  }

  function renderLaudoPersonalizadoFields(container, state) {
    var lp = state.snap.laudoPersonalizado || {};
    container.appendChild(
      createTextField("Título", lp.titulo, function (v) {
        applyLaudoPersonalizadoPatch(state, { titulo: v });
      }),
    );
    container.appendChild(
      createTextareaField(
        "Corpo",
        lp.corpo,
        function (v) {
          applyLaudoPersonalizadoPatch(state, { corpo: v });
        },
        { rows: 8 },
      ),
    );
  }

  function renderRetornoFields(container, state) {
    var retorno = state.snap.retorno || {};
    container.appendChild(
      createTextField("Diagnóstico", retorno.diagnostico, function (v) {
        applyRetornoPatch(state, { diagnostico: v });
      }),
    );
    container.appendChild(
      createTextareaField(
        "Descrição do ato",
        retorno.descricaoAto,
        function (v) {
          applyRetornoPatch(state, { descricaoAto: v });
        },
        { rows: 3, hint: "Uma descrição por linha (um ato cirúrgico por linha)." },
      ),
    );
    container.appendChild(
      createTextareaField(
        "Data da cirurgia",
        retorno.dataCirurgia,
        function (v) {
          applyRetornoPatch(state, { dataCirurgia: v });
        },
        { rows: 3, hint: "Uma data por linha, alinhada com a descrição acima." },
      ),
    );
    container.appendChild(
      createTextField("Local do retorno", retorno.localRetorno, function (v) {
        applyRetornoPatch(state, { localRetorno: v });
      }),
    );
    container.appendChild(
      createTextField("Data/hora do retorno", retorno.dataHoraRetorno, function (v) {
        applyRetornoPatch(state, { dataHoraRetorno: v });
      }),
    );
    container.appendChild(
      createTextField("Médico do retorno", retorno.medicoRetorno, function (v) {
        applyRetornoPatch(state, { medicoRetorno: v });
      }),
    );
    var hint = document.createElement("p");
    hint.className = "calc-field-hint";
    hint.textContent = "Equipe/staff e auxiliares por ato: edite no modo Documento.";
    container.appendChild(hint);
  }

  function createCidPickerField(label, value, onPick) {
    var wrap = document.createElement("div");
    wrap.className = "alta-field";
    var lab = document.createElement("label");
    lab.textContent = label;
    wrap.appendChild(lab);
    var input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.placeholder = "Buscar CID (código ou descrição)";
    input.setAttribute("aria-label", label);
    var list = document.createElement("div");
    list.className = "alta-cid-suggest";
    list.hidden = true;
    var catalog =
      (typeof globalThis !== "undefined" && globalThis.AghuCid10Catalog) ||
      (typeof require === "function"
        ? (function () {
            try {
              return require("./cid10-catalog.js");
            } catch (_e) {
              return null;
            }
          })()
        : null);
    function hideList() {
      list.hidden = true;
      while (list.firstChild) list.removeChild(list.firstChild);
    }
    function showHits(hits) {
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!hits.length) {
        hideList();
        return;
      }
      list.hidden = false;
      hits.forEach(function (hit) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "alta-cid-suggest-item";
        btn.textContent = hit.label || hit.c;
        btn.addEventListener("click", function () {
          input.value = hit.c;
          hideList();
          onPick(hit.c);
        });
        list.appendChild(btn);
      });
    }
    input.addEventListener("input", function () {
      var q = input.value;
      if (!catalog || typeof catalog.searchCid10 !== "function") {
        onPick(q);
        return;
      }
      if (String(q).trim().length < 1) {
        hideList();
        onPick(q);
        return;
      }
      showHits(catalog.searchCid10(q, 12));
      onPick(q);
    });
    input.addEventListener("blur", function () {
      setTimeout(hideList, 150);
    });
    wrap.appendChild(input);
    wrap.appendChild(list);
    return wrap;
  }

  function renderReferenciaFields(container, state) {
    var ref = (state.snap && state.snap.referencia) || {};
    [
      ["Estabelecimento", "estabelecimentoSaude"],
      ["CNES", "cnes"],
      ["Encaminhado para", "encaminhadoPara"],
      ["Especialidade de origem", "especialidadeOrigem"],
      ["Nome do paciente", "nomePaciente"],
      ["Sexo", "sexo"],
      ["Nome da mãe", "nomeMae"],
      ["Telefone", "telefone"],
      ["Cartão SUS", "cartaoSus"],
      ["Data de nascimento", "dataNascimento"],
      ["Idade", "idade"],
      ["Pront. HUCAM", "prontuarioHucam"],
    ].forEach(function (pair) {
      container.appendChild(
        createTextField(pair[0], ref[pair[1]], function (v) {
          var p = {};
          p[pair[1]] = v;
          applyReferenciaPatch(state, p);
        }),
      );
    });
    container.appendChild(
      createCidPickerField("CID-10", ref.cid, function (v) {
        applyReferenciaPatch(state, { cid: v });
      }),
    );
    container.appendChild(
      createTextareaField(
        "Motivo do encaminhamento",
        ref.motivoEncaminhamento,
        function (v) {
          applyReferenciaPatch(state, { motivoEncaminhamento: v });
        },
        { rows: 4 },
      ),
    );
    container.appendChild(
      createTextareaField(
        "Exames / tratamento",
        ref.examesTratamento,
        function (v) {
          applyReferenciaPatch(state, { examesTratamento: v });
        },
        { rows: 3 },
      ),
    );
    container.appendChild(
      createTextField("Hipótese diagnóstica", ref.hipoteseDiagnostica, function (v) {
        applyReferenciaPatch(state, { hipoteseDiagnostica: v });
      }),
    );
  }

  function renderContrarreferenciaFields(container, state) {
    var cr = (state.snap && state.snap.contrarreferencia) || {};
    [
      ["Estabelecimento", "estabelecimentoSaude"],
      ["CNES", "cnes"],
      ["Retorno para", "retornoPara"],
      ["Especialidade que atendeu", "especialidadeAtendimento"],
      ["Nome do paciente", "nomePaciente"],
      ["Sexo", "sexo"],
      ["Nome da mãe", "nomeMae"],
      ["Telefone", "telefone"],
      ["Cartão SUS", "cartaoSus"],
      ["Data de nascimento", "dataNascimento"],
      ["Idade", "idade"],
      ["Pront. HUCAM", "prontuarioHucam"],
    ].forEach(function (pair) {
      container.appendChild(
        createTextField(pair[0], cr[pair[1]], function (v) {
          var p = {};
          p[pair[1]] = v;
          applyContrarreferenciaPatch(state, p);
        }),
      );
    });
    container.appendChild(
      createCidPickerField("CID-10", cr.cid, function (v) {
        applyContrarreferenciaPatch(state, { cid: v });
      }),
    );
    container.appendChild(
      createTextareaField(
        "Parecer / conduta",
        cr.parecerConduta,
        function (v) {
          applyContrarreferenciaPatch(state, { parecerConduta: v });
        },
        { rows: 4 },
      ),
    );
    container.appendChild(
      createTextareaField(
        "Exames / tratamento",
        cr.examesTratamento,
        function (v) {
          applyContrarreferenciaPatch(state, { examesTratamento: v });
        },
        { rows: 3 },
      ),
    );
    container.appendChild(
      createTextField("Indicação de retorno", cr.indicacaoRetorno, function (v) {
        applyContrarreferenciaPatch(state, { indicacaoRetorno: v });
      }),
    );
  }

  var FIELD_RENDERERS = {
    orientacoes: renderOrientacoesFields,
    laudo: renderLaudoFields,
    laudoPersonalizado: renderLaudoPersonalizadoFields,
    atestado: renderAtestadoFields,
    acompanhante: renderAcompanhanteFields,
    retorno: renderRetornoFields,
    referencia: renderReferenciaFields,
    contrarreferencia: renderContrarreferenciaFields,
  };

  // ---------------------------------------------------------------------
  // Modo Documento (preview HTML editável)
  // ---------------------------------------------------------------------

  function renderDocumentPreview(container, state, kind) {
    var previewApi = previewHtmlApi();
    var mountApi = domMountApi();
    if (!previewApi || !mountApi) {
      var msg = document.createElement("p");
      msg.className = "calc-empty";
      msg.textContent = "Pré-visualização indisponível.";
      container.appendChild(msg);
      return;
    }
    var ctx = buildPrintCtx(state);
    var html;
    try {
      if (kind === "receituario") {
        var docs = (state.snap && state.snap.receitas) || [];
        var activeDoc = docs[0] || null;
        var docId =
          activeDoc && activeDoc.id && String(activeDoc.id).trim()
            ? String(activeDoc.id).trim()
            : "";
        var rxOverride =
          (state.snap.previewHtml &&
            state.snap.previewHtml.receituarioDocs &&
            docId &&
            state.snap.previewHtml.receituarioDocs[docId]) ||
          null;
        html = previewApi.resolveReceituarioDocPreviewHtml(ctx, docId, rxOverride);
      } else {
        var override =
          (state.snap.previewHtml && state.snap.previewHtml[kind]) || null;
        html = previewApi.resolveDocumentPreviewHtml(kind, ctx, override);
      }
    } catch (_e) {
      html = "";
    }
    var wrap = document.createElement("div");
    wrap.className =
      kind === "receituario"
        ? "alta-preview-wrap alta-kit-preview"
        : "alta-preview-wrap";
    mountApi.mountHtmlFragment(wrap, html);
    container.appendChild(wrap);

    var editableApi = previewEditableApi();
    if (editableApi && typeof editableApi.bindEditableFieldMaintenance === "function") {
      editableApi.bindEditableFieldMaintenance(document, wrap);
    }

    function onEdit() {
      scheduleAutosave(state);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(function () {
        autosaveTimer = null;
        applyPreviewExtraction(state, kind, wrap);
        persistLocalSnapshot(state, true);
      }, AUTOSAVE_MS);
    }
    wrap.addEventListener("input", onEdit, true);
    wrap.addEventListener("blur", onEdit, true);
  }

  // ---------------------------------------------------------------------
  // Toolbar de modelos de texto (orientacoes/laudo/atestado/retorno)
  // ---------------------------------------------------------------------

  function sectionDataForKind(state, kind) {
    return state.snap[kind];
  }

  function renderTemplateToolbar(container, state, subtabId) {
    var kind = resolveSubtabTemplateKind(subtabId);
    if (!kind) return;
    var textSchema = textTemplateSchemaApi();
    var applyApi = textTemplateApplyApi();
    var exportApi = textTemplateExportApi();
    var builtinApi = templateBuiltinApi();
    if (!textSchema || !applyApi || !exportApi || !builtinApi) return;

    var toolbar = document.createElement("div");
    toolbar.className = "alta-template-toolbar";

    var storedTemplates = (state.altaTemplatesSnap && state.altaTemplatesSnap.templates) || [];
    var options = builtinApi.resolveTemplatesForKind(storedTemplates, kind);

    var select = document.createElement("select");
    select.className = "alta-template-select";
    select.setAttribute("aria-label", "Aplicar modelo de " + subtabId);
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— aplicar modelo —";
    select.appendChild(placeholder);
    options.forEach(function (tpl) {
      var opt = document.createElement("option");
      opt.value = tpl.id;
      opt.textContent = tpl.name || "Modelo";
      select.appendChild(opt);
    });
    toolbar.appendChild(select);

    var btnApply = document.createElement("button");
    btnApply.type = "button";
    btnApply.className = "btn btn-sm";
    btnApply.textContent = "Aplicar";
    btnApply.addEventListener("click", function () {
      var id = select.value;
      if (!id) return;
      var tpl = null;
      for (var i = 0; i < options.length; i++) {
        if (options[i].id === id) {
          tpl = options[i];
          break;
        }
      }
      if (!tpl) return;
      state.snap = applyApi.applyTemplate(state.snap, tpl);
      clearPreviewSections(state, [kind]);
      scheduleAutosave(state);
      setActionStatus(state, "Modelo aplicado: " + (tpl.name || ""), false);
      renderAll(state);
    });
    toolbar.appendChild(btnApply);

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "alta-template-name-input";
    nameInput.placeholder = "Nome do novo modelo";
    nameInput.setAttribute("aria-label", "Nome do novo modelo");
    toolbar.appendChild(nameInput);

    var btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn btn-sm";
    btnSave.textContent = "Guardar como modelo";
    btnSave.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) {
        setActionStatus(state, "Informe um nome para o modelo.", true);
        return;
      }
      var draft = exportApi.buildTextTemplateDraft(kind, name, sectionDataForKind(state, kind));
      if (!draft) {
        setActionStatus(state, "Nada para guardar nesta secção.", true);
        return;
      }
      var prefs = userPrefsApi();
      if (!prefs) {
        setActionStatus(state, "Preferências indisponíveis — não foi possível guardar.", true);
        return;
      }
      draft.id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "tpl_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      var nextTemplates = storedTemplates.concat([draft]);
      var normalized = textSchema.normalizeSnap({ templates: nextTemplates });
      prefs
        .writeUserPreference("alta_text_templates", { templates: normalized.templates })
        .then(function (ok) {
          if (ok) {
            state.altaTemplatesSnap = normalized;
            nameInput.value = "";
            setActionStatus(state, "Modelo guardado.", false);
            if (typeof document !== "undefined" && typeof CustomEvent === "function") {
              document.dispatchEvent(
                new CustomEvent("aghu:alta-template-saved", {
                  detail: { templates: normalized.templates },
                }),
              );
            }
            renderAll(state);
          } else {
            setActionStatus(state, "Não foi possível guardar o modelo na nuvem.", true);
          }
        })
        .catch(function () {
          setActionStatus(state, "Não foi possível guardar o modelo na nuvem.", true);
        });
    });
    toolbar.appendChild(btnSave);

    var btnManage = document.createElement("button");
    btnManage.type = "button";
    btnManage.className = "btn btn-sm secondary";
    btnManage.textContent = "Gerir modelos";
    btnManage.addEventListener("click", function () {
      openTemplatesManager(state, kind);
    });
    toolbar.appendChild(btnManage);

    var btnWeb = document.createElement("button");
    btnWeb.type = "button";
    btnWeb.className = "btn btn-sm secondary";
    btnWeb.textContent = "Abrir no painel";
    btnWeb.title = "Gestão rich no painel web";
    btnWeb.addEventListener("click", function () {
      var webApp = webAppApi();
      if (webApp && typeof webApp.openPath === "function") {
        webApp.openPath("/altas/modelos").catch(function () {
          setActionStatus(state, "Não foi possível abrir o painel web.", true);
        });
      }
    });
    if (webAppApi()) toolbar.appendChild(btnWeb);

    container.appendChild(toolbar);
  }

  // ---------------------------------------------------------------------
  // Sub-aba Receituário — embed do host RX existente (sem reescrever)
  // ---------------------------------------------------------------------

  function refreshReceitasFromRxArchive(state) {
    var rxArchive = rxArchiveApi();
    if (!rxArchive || !state.meta.patientKey) {
      return Promise.resolve();
    }
    return rxArchive
      .loadReceitaSnapshot(state.meta.patientKey)
      .then(function (rxSnap) {
        if (rxSnap && Array.isArray(rxSnap.receitas) && rxSnap.receitas.length) {
          state.snap.receitas = rxSnap.receitas;
        }
      })
      .catch(function () {
        /* arquivo RX opcional — mantém o que já está no kit */
      });
  }

  function renderReceituarioSubtab(container, state) {
    var rxHost = rxHostApi();
    if (!rxHost) {
      var msg = document.createElement("p");
      msg.className = "calc-empty";
      msg.textContent = "Editor de receituário indisponível.";
      container.appendChild(msg);
      return;
    }
    var rxMount = document.createElement("div");
    rxMount.id = "alta-receituario-rx-mount";
    var rxStatus = document.createElement("p");
    rxStatus.className = "sync-status";
    rxStatus.hidden = true;
    container.appendChild(rxMount);
    container.appendChild(rxStatus);

    refreshReceitasFromRxArchive(state).then(function () {
      rxHost.mount({
        mountEl: rxMount,
        statusEl: rxStatus,
        snap: {
          version: 1,
          receitas: state.snap.receitas,
          atualizadoEm: state.snap.atualizadoEm,
        },
        meta: state.meta,
        prescricaoSnap: state.prescricaoSnap,
        avulso: !!state.avulso,
        avulsoFields: state.avulsoFields,
        hideAvulsoNameUi: true,
        onLinesChanged: function (rxSnap) {
          if (rxSnap && Array.isArray(rxSnap.receitas)) {
            state.snap.receitas = rxSnap.receitas;
          }
          clearPreviewSections(state, ["receituario", "kit"]);
          scheduleAutosave(state);
        },
        prescriber: state.prescriber,
        templates: state.rxTemplates || [],
        templatesLoading: !!state.templatesLoading,
        templatesError: state.templatesError || null,
        onTemplatesChange: function (next) {
          state.rxTemplates = next || [];
        },
        onOpenTemplatesManager: function (kind) {
          openTemplatesManager(state, kind || "receitas");
        },
      });
    });
  }

  // ---------------------------------------------------------------------
  // Shell — sub-nav + conteúdo + action bar
  // ---------------------------------------------------------------------

  /**
   * Paciente AGHU: o embed RX esconde a barra de nome (`hideAvulsoNameUi`).
   * Sem isto o médico não vê quem é o paciente em nenhuma sub-aba.
   */
  function renderAghuNameBar(shell, state) {
    var meta = state.meta || {};
    var nome = meta.nomeCompleto || meta.primeiroNome || "";
    var bar = document.createElement("div");
    bar.className = "alta-aghu-name-bar";
    bar.setAttribute("role", "status");
    var nameEl = document.createElement("span");
    nameEl.className = "alta-aghu-name";
    nameEl.textContent = nome || "Paciente";
    bar.appendChild(nameEl);
    if (meta.prontuario) {
      var prontEl = document.createElement("span");
      prontEl.className = "alta-aghu-prontuario";
      prontEl.textContent = "Pront. " + meta.prontuario;
      bar.appendChild(prontEl);
    }
    shell.appendChild(bar);
  }

  function renderPatientIdentityChrome(shell, state) {
    if (resolveAltaPatientNameUi(!!state.avulso) === "editable-banner") {
      renderAvulsoNameBanner(shell, state);
      return;
    }
    renderAghuNameBar(shell, state);
  }

  /**
   * Paciente avulso (sem prontuário AGHU): sem este campo o nome só existia
   * dentro do host RX embutido (sub-aba Receituário) — nas outras 6 sub-abas
   * `state.avulsoFields.nomeCompleto` ficava sempre vazio e ALTAEXT-AC-08
   * bloqueava o autosave do kit para sempre. Campo único, visível em todas
   * as sub-abas, evita duplicar "nome do paciente" por secção.
   */
  function renderAvulsoNameBanner(shell, state) {
    if (!state.avulso) return;
    var banner = document.createElement("div");
    banner.className = "alta-field alta-avulso-name-banner";
    var hint = createFieldHint("Nome do paciente (avulso — sem prontuário AGHU)");
    banner.appendChild(hint);
    var input = document.createElement("input");
    input.type = "text";
    input.value = (state.avulsoFields && state.avulsoFields.nomeCompleto) || "";
    input.placeholder = "Nome completo";
    input.setAttribute("aria-label", "Nome do paciente avulso");
    input.addEventListener("input", function () {
      state.avulsoFields.nomeCompleto = input.value;
      if (state.meta) state.meta.nomeCompleto = input.value;
      scheduleAutosave(state);
      // FEAT-312: nome só no banner — reavaliar Imprimir no host RX embutido
      var rxHost = rxHostApi();
      if (rxHost && typeof rxHost.refreshPrintButtons === "function") {
        rxHost.refreshPrintButtons();
      }
    });
    banner.appendChild(input);
    shell.appendChild(banner);
  }

  function renderSubnav(shell, state) {
    var nav = document.createElement("div");
    nav.className = "alta-popup-subnav";
    SUBTABS.forEach(function (tab) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "alta-popup-subnav-btn" + (state.activeSubtab === tab.id ? " active" : "");
      btn.textContent = tab.label;
      btn.addEventListener("click", function () {
        if (state.activeSubtab === tab.id) return;
        state.activeSubtab = tab.id;
        renderAll(state);
      });
      nav.appendChild(btn);
    });
    shell.appendChild(nav);
  }

  function renderModeToggle(container, state, subtabId) {
    var toggle = document.createElement("div");
    toggle.className = "alta-popup-mode-toggle";
    var mode = state.modes[subtabId] || "campos";

    var btnCampos = document.createElement("button");
    btnCampos.type = "button";
    btnCampos.className = "alta-popup-mode-btn" + (mode === "campos" ? " active" : "");
    btnCampos.textContent = "Campos";
    btnCampos.addEventListener("click", function () {
      if (state.modes[subtabId] === "campos") return;
      state.modes[subtabId] = "campos";
      renderAll(state);
    });
    toggle.appendChild(btnCampos);

    var btnDoc = document.createElement("button");
    btnDoc.type = "button";
    btnDoc.className = "alta-popup-mode-btn";
    btnDoc.textContent = "Documento";
    btnDoc.addEventListener("click", function () {
      var pk = (state.meta && state.meta.patientKey) || "";
      requestOpenDocumentoWindow(subtabId, pk).then(function (res) {
        if (!res || !res.ok) {
          setActionStatus(
            state,
            "Não foi possível abrir o documento. Tente de novo.",
            true,
          );
        }
      });
    });
    toggle.appendChild(btnDoc);

    container.appendChild(toggle);
  }

  function renderContent(shell, state) {
    var content = document.createElement("div");
    content.className = "alta-popup-content";

    var subtabId = state.activeSubtab;
    if (subtabId === "receituario") {
      renderModeToggle(content, state, "receituario");
      renderReceituarioSubtab(content, state);
      shell.appendChild(content);
      return;
    }

    if (subtabId === "encaminhamentos") {
      var nestedNav = document.createElement("div");
      nestedNav.className = "alta-popup-subnav alta-popup-enc-nested";
      ENC_NESTED.forEach(function (tab) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "alta-popup-subnav-btn" +
          (resolveEncNestedId(state) === tab.id ? " active" : "");
        btn.textContent = tab.label;
        btn.addEventListener("click", function () {
          state.encNested = tab.id;
          renderAll(state);
        });
        nestedNav.appendChild(btn);
      });
      content.appendChild(nestedNav);
      var encKind = resolveEncNestedId(state);
      renderTemplateToolbar(content, state, encKind);
      renderModeToggle(content, state, encKind);
      state.modes[encKind] = "campos";
      var encBody = document.createElement("div");
      encBody.className = "alta-popup-subtab-body";
      var encRenderer = FIELD_RENDERERS[encKind];
      if (encRenderer) encRenderer(encBody, state);
      content.appendChild(encBody);
      shell.appendChild(content);
      return;
    }

    renderTemplateToolbar(content, state, subtabId);
    renderModeToggle(content, state, subtabId);

    // Modo Documento abre janela popup — painel principal fica só em Campos.
    state.modes[subtabId] = "campos";
    var body = document.createElement("div");
    body.className = "alta-popup-subtab-body";
    var renderer = FIELD_RENDERERS[subtabId];
    if (renderer) renderer(body, state);
    content.appendChild(body);
    shell.appendChild(content);
  }

  function renderActionBar(shell, state) {
    var bar = document.createElement("div");
    bar.className = "alta-popup-actionbar";

    var status = document.createElement("p");
    status.className = "sync-status alta-popup-actionbar-status";
    status.hidden = true;
    state.actionStatusEl = status;

    var actions = document.createElement("div");
    actions.className = "alta-popup-actionbar-actions";

    var subtabId = state.activeSubtab;
    var printKind =
      subtabId === "encaminhamentos" ? resolveEncNestedId(state) : subtabId;
    if (subtabId !== "receituario") {
      var btnPrint = document.createElement("button");
      btnPrint.type = "button";
      btnPrint.className = "btn btn-sm secondary";
      btnPrint.textContent = "Imprimir aba";
      btnPrint.addEventListener("click", function () {
        var printApi = altaPrintApi();
        var fnName = PRINT_FN_BY_SUBTAB[printKind];
        if (!printApi || !fnName || typeof printApi[fnName] !== "function") return;
        ensureExtensionSettings(state).then(function () {
          var result = printApi[fnName](buildPrintCtx(state));
          if (result && result.ok === false) {
            setActionStatus(state, result.error || "Impressão bloqueada.", true);
          } else {
            setActionStatus(state, "", false);
          }
        });
      });
      actions.appendChild(btnPrint);
    }

    var btnKit = document.createElement("button");
    btnKit.type = "button";
    btnKit.className = "btn btn-sm primary";
    btnKit.textContent = "Pré-visualizar / imprimir kit";
    btnKit.addEventListener("click", function () {
      var printApi = altaPrintApi();
      if (!printApi || typeof printApi.printAltaKit !== "function") return;
      // Receituário é editado via host RX embutido (grava na sua própria
      // archive) — refresca state.snap.receitas antes do kit para não
      // imprimir uma versão desactualizada quando o médico edita RX e
      // manda imprimir o kit sem trocar de sub-aba primeiro.
      refreshReceitasFromRxArchive(state).then(function () {
        return ensureExtensionSettings(state);
      }).then(function () {
        var result = printApi.printAltaKit(buildPrintCtx(state));
        if (result && result.ok === false) {
          setActionStatus(state, result.error || "Kit de alta incompleto.", true);
        } else {
          setActionStatus(state, "", false);
        }
      });
    });
    actions.appendChild(btnKit);

    bar.appendChild(status);
    bar.appendChild(actions);
    shell.appendChild(bar);
  }

  function renderAll(state) {
    if (!state || !state.mountEl) return;
    state.mountEl.replaceChildren();
    var shell = document.createElement("div");
    shell.className = "alta-popup-shell";
    renderPatientIdentityChrome(shell, state);
    renderSubnav(shell, state);
    renderContent(shell, state);
    renderActionBar(shell, state);
    state.mountEl.appendChild(shell);
  }

  // ---------------------------------------------------------------------
  // mount()
  // ---------------------------------------------------------------------

  /**
   * @param {{
   *   mountEl: HTMLElement,
   *   statusEl?: HTMLElement,
   *   snap: object,
   *   meta: object,
   *   prescricaoSnap?: object|null,
   *   avulso?: boolean,
   *   prescriber?: object,
   *   rxTemplates?: object[],
   *   altaTemplatesSnap?: object,
   *   seedFingerprint?: string,
   *   activeSubtab?: string
   * }} opts
   */
  function mount(opts) {
    if (!opts || !opts.mountEl) return;
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;

    var textSchema = textTemplateSchemaApi();
    var previousModes = mountedState ? mountedState.modes : null;
    var previousAvulsoFields = mountedState ? mountedState.avulsoFields : null;
    var previousActiveSubtab = mountedState ? mountedState.activeSubtab : null;

    mountedState = {
      mountEl: opts.mountEl,
      statusEl: opts.statusEl || null,
      actionStatusEl: null,
      snap: schemaApi.normalizeSnap(opts.snap || {}),
      meta: opts.meta || {},
      prescricaoSnap: opts.prescricaoSnap || null,
      avulso: !!opts.avulso,
      avulsoFields:
        previousAvulsoFields || {
          nomeCompleto: (opts.meta && (opts.meta.nomeCompleto || opts.meta.primeiroNome)) || "",
        },
      prescriber: opts.prescriber || { name: "", crmNumber: "", crmUf: "", specialty: "" },
      rxTemplates: Array.isArray(opts.rxTemplates) ? opts.rxTemplates : [],
      templatesLoading: !!opts.templatesLoading,
      templatesError: opts.templatesError || null,
      altaTemplatesSnap: opts.altaTemplatesSnap
        ? textSchema
          ? textSchema.normalizeSnap(opts.altaTemplatesSnap)
          : opts.altaTemplatesSnap
        : textSchema
          ? textSchema.emptySnap()
          : { templates: [] },
      seedFingerprint: opts.seedFingerprint || "",
      activeSubtab: opts.activeSubtab || previousActiveSubtab || "receituario",
      encNested: (mountedState && mountedState.encNested) || "referencia",
      modes:
        previousModes ||
        {
          orientacoes: "campos",
          laudo: "campos",
          laudoPersonalizado: "campos",
          atestado: "campos",
          acompanhante: "campos",
          retorno: "campos",
          referencia: "campos",
          contrarreferencia: "campos",
        },
      onDocumentoPatched: function () {
        var pk =
          (opts.meta && opts.meta.patientKey) ||
          (mountedState && mountedState.meta && mountedState.meta.patientKey) ||
          "";
        notifyDocumentoPatched(null, pk);
      },
    };

    ensureDocumentoPatchedListener();
    renderAll(mountedState);
    ensureExtensionSettings(mountedState).then(function () {
      /* prefs prontas para print/preview */
    });
  }

  function notifyDocumentoPatched(kind, patientKey) {
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.sendMessage) {
      return;
    }
    try {
      browser.runtime.sendMessage({
        action: "altaDocumentoPatched",
        kind: kind,
        patientKey: patientKey,
      });
    } catch (_e) {
      /* best-effort */
    }
  }

  function ensureDocumentoPatchedListener() {
    if (documentoPatchedListenerBound) return;
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.onMessage) {
      return;
    }
    documentoPatchedListenerBound = true;
    browser.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.action !== "altaDocumentoPatched") return;
      if (!mountedState || !mountedState.meta) return;
      var pk = mountedState.meta.patientKey || "";
      if (!pk || pk !== msg.patientKey) return;
      var archive = altaArchiveApi();
      var schemaApi = altaSchemaApi();
      if (!archive || !schemaApi || typeof archive.loadAltaSnapshot !== "function") return;
      archive.loadAltaSnapshot(pk).then(function (snap) {
        if (!snap || !mountedState) return;
        mountedState.snap = schemaApi.normalizeSnap(snap);
        renderAll(mountedState);
      });
    });
  }

  /**
   * Janela Documento: refresca snap + nome avulso quando o popup principal grava.
   */
  function ensureDocumentoWindowPatchedListener() {
    if (documentoWindowPatchedListenerBound) return;
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.onMessage) {
      return;
    }
    documentoWindowPatchedListenerBound = true;
    browser.runtime.onMessage.addListener(function (msg) {
      if (!msg || msg.action !== "altaDocumentoPatched") return;
      if (!documentoWindowState || !documentoWindowState.meta) return;
      var pk = documentoWindowState.meta.patientKey || "";
      if (!pk || pk !== msg.patientKey) return;
      var archive = altaArchiveApi();
      var schemaApi = altaSchemaApi();
      if (!archive || !schemaApi || typeof archive.loadAltaSnapshot !== "function") return;
      var kind = documentoWindowState.documentoKind;
      var mountEl = documentoWindowState.mountEl;
      if (!kind || !mountEl) return;

      var snapP = archive.loadAltaSnapshot(pk);
      var metaP =
        typeof archive.loadAltaRecordMeta === "function"
          ? archive.loadAltaRecordMeta(pk)
          : Promise.resolve(null);

      Promise.all([snapP, metaP]).then(function (pair) {
        if (!documentoWindowState || !documentoWindowState.mountEl) return;
        var snap = pair[0];
        var recordMeta = pair[1];
        if (snap) {
          documentoWindowState.snap = schemaApi.normalizeSnap(snap);
        }
        if (recordMeta) {
          var nome =
            recordMeta.nomeCompleto || recordMeta.primeiroNome || "";
          documentoWindowState.meta.nomeCompleto = nome;
          documentoWindowState.meta.primeiroNome =
            recordMeta.primeiroNome || "";
          if (!documentoWindowState.avulsoFields) {
            documentoWindowState.avulsoFields = {};
          }
          documentoWindowState.avulsoFields.nomeCompleto = nome;
        }
        while (mountEl.firstChild) {
          mountEl.removeChild(mountEl.firstChild);
        }
        renderDocumentPreview(mountEl, documentoWindowState, kind);
      });
    });
  }

  /**
   * CSS reinjetado na janela Documento (mountHtmlFragment descarta o style do HTML).
   * Receituário: receitaPrintCss. Guia Referência/Contrarref: guiaCss (não Times/baseCss).
   * @param {string} [kind]
   * @returns {string}
   */
  function buildDocumentoWindowFidelityCss(kind) {
    var previewApi = previewHtmlApi();
    if (!previewApi) return "";

    var isGuia = kind === "referencia" || kind === "contrarreferencia";
    if (isGuia) {
      var enc = encaminhamentoApi();
      var partsGuia = [];
      if (enc && typeof enc.guiaCss === "function") {
        partsGuia.push(enc.guiaCss());
      }
      if (typeof previewApi.documentoGuiaHostCss === "function") {
        partsGuia.push(previewApi.documentoGuiaHostCss());
      }
      return partsGuia.join("");
    }

    if (
      typeof previewApi.baseCss !== "function" ||
      typeof previewApi.documentoWindowHostCss !== "function"
    ) {
      return "";
    }
    var parts = [];
    if (kind === "receituario") {
      var rxPrint = receitaPrintApi();
      if (rxPrint && typeof rxPrint.receitaPrintCss === "function") {
        parts.push(rxPrint.receitaPrintCss());
      }
    }
    parts.push(previewApi.baseCss());
    parts.push(previewApi.documentoWindowHostCss());
    return parts.join("");
  }

  /**
   * Injeta CSS de fidelidade na janela Documento.
   * Id por kind para permitir troca de documento sem CSS stale.
   * @param {string} [kind]
   */
  function ensureDocumentoWindowFidelityCss(kind) {
    if (typeof document === "undefined" || !document.head) return;
    var styleId =
      "alta-documento-fidelity-css" +
      (kind ? "-" + String(kind) : "");
    var existing = document.getElementById(styleId);
    if (existing) return;
    // Remove fidelity CSS de outro kind (ex.: abriu laudo antes).
    var stale = document.querySelectorAll("[id^='alta-documento-fidelity-css']");
    for (var i = 0; i < stale.length; i++) {
      if (stale[i].parentNode) stale[i].parentNode.removeChild(stale[i]);
    }
    var css = buildDocumentoWindowFidelityCss(kind);
    if (!css) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /**
   * Página fina `alta-documento.html` — só o preview editável.
   * @param {{
   *   mountEl: HTMLElement,
   *   statusEl?: HTMLElement|null,
   *   kind: string,
   *   patientKey: string,
   *   snap: object,
   *   meta?: object,
   *   seedFingerprint?: string,
   *   avulso?: boolean
   * }} opts
   */
  function mountDocumentoWindowPage(opts) {
    if (!opts || !opts.mountEl || !isValidDocumentoKind(opts.kind)) return;
    var schemaApi = altaSchemaApi();
    if (!schemaApi) return;
    var patientKey =
      typeof opts.patientKey === "string" ? opts.patientKey.trim() : "";
    if (!patientKey) return;

    ensureDocumentoWindowFidelityCss(opts.kind);
    ensureDocumentoWindowPatchedListener();

    var state = {
      mountEl: opts.mountEl,
      statusEl: opts.statusEl || null,
      actionStatusEl: opts.statusEl || null,
      snap: schemaApi.normalizeSnap(opts.snap || {}),
      meta: Object.assign({}, opts.meta || {}, { patientKey: patientKey }),
      avulso: !!opts.avulso,
      avulsoFields: {
        nomeCompleto:
          (opts.meta && (opts.meta.nomeCompleto || opts.meta.primeiroNome)) || "",
      },
      seedFingerprint: opts.seedFingerprint || "",
      documentoKind: opts.kind,
      onDocumentoPatched: function () {
        notifyDocumentoPatched(opts.kind, patientKey);
      },
    };
    documentoWindowState = state;

    while (opts.mountEl.firstChild) {
      opts.mountEl.removeChild(opts.mountEl.firstChild);
    }
    ensureExtensionSettings(state).then(function () {
      renderDocumentPreview(opts.mountEl, state, opts.kind);
    });
  }

  return {
    mount: mount,
    mountDocumentoWindowPage: mountDocumentoWindowPage,
    SUBTABS: SUBTABS,
    ENC_NESTED: ENC_NESTED,
    DOCUMENT_KINDS: DOCUMENT_KINDS,
    isValidDocumentoKind: isValidDocumentoKind,
    buildAltaDocumentoWindowUrl: buildAltaDocumentoWindowUrl,
    buildDocumentoWindowFidelityCss: buildDocumentoWindowFidelityCss,
    requestOpenDocumentoWindow: requestOpenDocumentoWindow,
    computeAltaSeedFingerprint: computeAltaSeedFingerprint,
    seedFingerprintChanged: seedFingerprintChanged,
    resolveSubtabTemplateKind: resolveSubtabTemplateKind,
    shouldBlockAutosaveForMissingIdentity: shouldBlockAutosaveForMissingIdentity,
    resolveAltaPatientNameUi: resolveAltaPatientNameUi,
    shouldRemountAltaEditor: shouldRemountAltaEditor,
    getMountedIdentity: getMountedIdentity,
    clearMountedIdentity: clearMountedIdentity,
    buildPrintCtx: buildPrintCtx,
    ensureExtensionSettings: ensureExtensionSettings,
  };
});
