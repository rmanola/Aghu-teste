/**
 * Host do editor de receitas na popup (linhas, import AGHU, impressão, avulso).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuReceitaPopupHost = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var mountedState = null;
  var autosaveTimer = null;
  var AUTOSAVE_MS = 2000;

  function scheduleLocalAutosave(state) {
    if (!state || !archive()) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      persistLocalSnapshot(state, true);
    }, AUTOSAVE_MS);
  }

  function persistLocalSnapshot(state, silent) {
    var schemaApi = schema();
    if (!schemaApi || !state || !state.snap) return;
    var nome =
      state.avulsoFields.nomeCompleto ||
      state.meta.nomeCompleto ||
      state.meta.primeiroNome ||
      "";
    if (!schemaApi.snapHasSaveableContent(state.snap, nome)) return;
    state.snap.atualizadoEm = Date.now();
    var saveMeta = Object.assign({}, state.meta, {
      nomeCompleto: nome,
      avulso: !!state.avulso,
      patientAddress: schemaApi.resolveBestPatientAddressFromSnap(state.snap, null),
    });
    archive()
      .saveReceitaSnapshot(saveMeta, state.snap)
      .then(function () {
        if (!silent && state.statusEl) {
          setStatus(state.statusEl, "Guardado localmente.", false);
        } else if (silent && state.statusEl) {
          setStatus(state.statusEl, "Guardado", false);
        }
      })
      .catch(function () {
        if (state.statusEl) setStatus(state.statusEl, "Não foi possível guardar.", true);
      });
  }

  var CLASS_LABELS = {
    SIMPLE: "Simples",
    SPECIAL_ANTIMICROBIAL: "Antimicrobiano",
    SPECIAL_CONTROL: "Controlado",
    SPECIAL_NOTIFICATION: "Notificação",
  };

  function schema() {
    return root.AghuReceitaSchema;
  }
  function imprt() {
    return root.AghuReceitaImportAghu;
  }
  function printApi() {
    return root.AghuReceitaPrint;
  }
  function patientCtx() {
    return root.AghuReceitaPatientContext;
  }
  function archive() {
    return root.AghuReceitaArchive;
  }
  function catalog() {
    return root.AghuReceitaMedicationCatalog;
  }
  function templateApply() {
    return root.AghuReceitaTemplateApply;
  }
  function templateSchema() {
    return root.AghuReceitaTemplateSchema;
  }
  function templatesManager() {
    return root.AghuAltaTemplatesManagerHost;
  }
  function prefsClient() {
    return root.AghuUserPreferencesClient;
  }
  function validationApi() {
    return root.AghuReceitaPrintValidation;
  }

  function setStatus(statusEl, msg, isError) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
    statusEl.className = isError ? "sync-status sync-error" : "sync-status sync-ok";
  }

  /**
   * FEAT-311 / ALTAOM-AC-04/05 — toolbar de modelos RX sempre presente.
   */
  function renderReceitaTemplateToolbar(toolbar, state, doc, onApplied) {
    var statusEl = state.statusEl;
    var templates = state.templates || [];
    var mgr = templatesManager();
    var desc = mgr
      ? mgr.describeReceitaToolbar(templates, {
          loading: !!state.templatesLoading,
          loadError: state.templatesError || null,
        })
      : {
          mode: templates.length ? "select" : "empty",
          showCta: !templates.length,
        };

    var wrap = document.createElement("div");
    wrap.className = "receitas-template-toolbar";

    if (desc.mode === "loading") {
      var loading = document.createElement("span");
      loading.className = "receitas-template-loading";
      loading.setAttribute("aria-live", "polite");
      loading.textContent = "A carregar modelos…";
      wrap.appendChild(loading);
    } else if (desc.mode === "error") {
      var err = document.createElement("span");
      err.className = "receitas-template-error";
      err.setAttribute("role", "status");
      err.textContent = "Modelos indisponíveis";
      if (state.templatesError) err.title = String(state.templatesError);
      wrap.appendChild(err);
    } else if (desc.mode === "empty" || desc.showCta) {
      var cta = document.createElement("button");
      cta.type = "button";
      cta.className = "btn btn-sm secondary receitas-template-cta";
      cta.textContent = "Criar modelos de receita";
      cta.addEventListener("click", function () {
        openTemplatesManager(state, "receitas");
      });
      wrap.appendChild(cta);
    } else {
      var tplWrap = document.createElement("label");
      tplWrap.className = "receitas-template-select";
      var tplLbl = document.createElement("span");
      tplLbl.textContent = "Modelo";
      var tplSel = document.createElement("select");
      tplSel.setAttribute("aria-label", "Aplicar modelo de receita");
      var optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = "— aplicar modelo —";
      tplSel.appendChild(optEmpty);
      templates.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name || "Modelo";
        tplSel.appendChild(opt);
      });
      tplSel.addEventListener("change", function () {
        var id = tplSel.value;
        tplSel.value = "";
        if (!id) return;
        var tpl = null;
        for (var i = 0; i < templates.length; i++) {
          if (templates[i].id === id) {
            tpl = templates[i];
            break;
          }
        }
        if (!tpl) return;
        var apply = templateApply();
        if (!apply) return;
        var updated = apply.applyTemplateToDoc(doc, tpl, { replace: false });
        doc.lines = updated.lines;
        if (typeof onApplied === "function") onApplied();
        setStatus(statusEl, "Modelo aplicado: " + (tpl.name || ""), false);
      });
      tplWrap.appendChild(tplLbl);
      tplWrap.appendChild(tplSel);
      wrap.appendChild(tplWrap);

      var btnManage = document.createElement("button");
      btnManage.type = "button";
      btnManage.className = "btn btn-sm secondary";
      btnManage.textContent = "Gerir modelos";
      btnManage.addEventListener("click", function () {
        openTemplatesManager(state, "receitas");
      });
      wrap.appendChild(btnManage);
    }

    var btnSaveTpl = document.createElement("button");
    btnSaveTpl.type = "button";
    btnSaveTpl.className = "btn btn-sm";
    btnSaveTpl.textContent = "Guardar como modelo";
    btnSaveTpl.addEventListener("click", function () {
      saveActiveDocAsTemplate(state, doc);
    });
    wrap.appendChild(btnSaveTpl);

    toolbar.appendChild(wrap);
  }

  function openTemplatesManager(state, initialKind) {
    if (typeof state.onOpenTemplatesManager === "function") {
      state.onOpenTemplatesManager(initialKind || "receitas");
      return;
    }
    var mgr = templatesManager();
    if (!mgr || typeof mgr.open !== "function") {
      setStatus(state.statusEl, "Gestão de modelos indisponível.", true);
      return;
    }
    mgr.open({
      initialKind: initialKind || "receitas",
      rxTemplates: state.templates || [],
      onRxTemplatesChange: function (next) {
        state.templates = next || [];
        if (typeof state.onTemplatesChange === "function") {
          state.onTemplatesChange(state.templates);
        }
        renderEditor(state);
      },
    });
  }

  function saveActiveDocAsTemplate(state, doc) {
    var mgr = templatesManager();
    var prefs = prefsClient();
    var tplSchema = templateSchema();
    if (!mgr || !prefs || !tplSchema) {
      setStatus(state.statusEl, "Preferências indisponíveis — não foi possível guardar.", true);
      return;
    }
    var name =
      typeof window !== "undefined" && window.prompt
        ? window.prompt("Nome do modelo de receita:")
        : "";
    if (!name || !String(name).trim()) return;
    var result = mgr.appendReceitaTemplateFromLines(
      state.templates || [],
      String(name).trim(),
      (doc && doc.lines) || [],
    );
    if (!result.ok) {
      setStatus(state.statusEl, result.error || "Falha ao guardar modelo.", true);
      return;
    }
    var snap = tplSchema.normalizeTemplatesSnap({
      version: 1,
      templates: result.templates,
      atualizadoEm: Date.now(),
    });
    var builtin = root.AghuReceitaTemplateBuiltin;
    if (builtin && typeof builtin.stripUnmodifiedBuiltins === "function") {
      snap = tplSchema.normalizeTemplatesSnap({
        version: 1,
        templates: builtin.stripUnmodifiedBuiltins(snap.templates),
        atualizadoEm: Date.now(),
      });
    }
    prefs
      .writeUserPreference("receita_templates", { templates: snap })
      .then(function (ok) {
        if (!ok) {
          setStatus(state.statusEl, "Não foi possível guardar o modelo na nuvem.", true);
          return;
        }
        var display = snap.templates;
        if (builtin && typeof builtin.mergeStoredWithDefaults === "function") {
          display = builtin.mergeStoredWithDefaults(snap.templates);
          if (builtin.sortBuiltinsFirst) display = builtin.sortBuiltinsFirst(display);
        }
        state.templates = display;
        if (typeof state.onTemplatesChange === "function") {
          state.onTemplatesChange(state.templates);
        }
        if (typeof document !== "undefined" && typeof CustomEvent === "function") {
          document.dispatchEvent(
            new CustomEvent("aghu:receita-templates-saved", {
              detail: { templates: snap.templates },
            }),
          );
        }
        setStatus(
          state.statusEl,
          "Modelo «" + (result.template && result.template.name) + "» guardado.",
          false,
        );
        renderEditor(state);
      })
      .catch(function () {
        setStatus(state.statusEl, "Não foi possível guardar o modelo na nuvem.", true);
      });
  }

  function classLabel(cls) {
    return CLASS_LABELS[cls] || CLASS_LABELS.SIMPLE;
  }

  function normalizePrescriber(raw) {
    raw = raw || {};
    return {
      name: String(raw.name || "").trim(),
      crmNumber: String(raw.crmNumber || "").trim(),
      crmUf: String(raw.crmUf || "").trim(),
      specialty: String(raw.specialty || "").trim(),
    };
  }

  function resolvePrintPatient(meta, avulsoFields, patientAddress) {
    var ctxApi = patientCtx();
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
        nomeCompleto: avulsoFields.nomeCompleto || meta.nomeCompleto || "",
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

  function docHasSpecialLines(doc) {
    if (!doc || !Array.isArray(doc.lines)) return false;
    var schemaApi = schema();
    for (var i = 0; i < doc.lines.length; i++) {
      var ln = doc.lines[i];
      if (
        ln &&
        ln.prescriptionDocumentClass &&
        schemaApi &&
        typeof schemaApi.isAnvisaSpecialClass === "function" &&
        schemaApi.isAnvisaSpecialClass(ln.prescriptionDocumentClass)
      ) {
        return true;
      }
      if (
        ln &&
        ln.prescriptionDocumentClass &&
        (!schemaApi || typeof schemaApi.isAnvisaSpecialClass !== "function") &&
        (ln.prescriptionDocumentClass === "SPECIAL_CONTROL" ||
          ln.prescriptionDocumentClass === "SPECIAL_NOTIFICATION")
      ) {
        return true;
      }
    }
    return false;
  }

  function ensurePatientAddress(doc) {
    var schemaApi = schema();
    if (!doc.patientAddress && schemaApi) {
      doc.patientAddress = schemaApi.emptyPatientAddress();
    }
    return doc.patientAddress;
  }

  function syncLineClassFromDrug(ln) {
    var cat = catalog();
    if (!cat || !ln) return;
    var resolved = cat.resolveClassForDrugName(ln.drugName || "");
    ln.prescriptionDocumentClass = resolved.prescriptionDocumentClass || "SIMPLE";
    // Não atribuir catalogKey a partir do nome — texto livre deve manter via
    // desbloqueada (9 vias HUCAM) até escolha explícita na lista.
    if (resolved.controlListCode) ln.controlListCode = resolved.controlListCode;
    if (resolved.validityDays != null) ln.validityDays = resolved.validityDays;
  }

  function formatMedDisplay(ln) {
    var name = String(ln.drugName || "").trim();
    var pres = String(ln.presentation || "").trim();
    if (!name) return "";
    if (!pres) return name;
    return name + " — " + pres;
  }

  function createFieldLabel(text) {
    var hint = document.createElement("span");
    hint.className = "calc-field-hint";
    hint.textContent = text;
    return hint;
  }

  function createRouteSelect(ln, onEdit) {
    var field = document.createElement("label");
    field.className = "receitas-field";
    field.appendChild(createFieldLabel("Via"));

    var select = document.createElement("select");
    select.className = "receitas-route-input";
    select.setAttribute("aria-label", "Via de administração");

    function refresh() {
      var cat = catalog();
      select.innerHTML = "";
      if (!cat || !cat.resolveRoutesForLine) {
        select.disabled = true;
        var missing = document.createElement("option");
        missing.value = "";
        missing.textContent = "Defina o medicamento";
        select.appendChild(missing);
        return;
      }
      var resolved = cat.resolveRoutesForLine({
        catalogKey: ln.catalogKey,
        presentation: ln.presentation || "",
      });
      var allowed = resolved.allowedRoutes || [];
      if (!allowed.length) {
        select.disabled = true;
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Defina o medicamento";
        select.appendChild(empty);
        ln.route = "";
        return;
      }
      select.disabled = false;
      ln.route = cat.coerceRouteSelection(ln.route, allowed, resolved.defaultRoute);
      if (allowed.length > 1 && !ln.route) {
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Selecione";
        select.appendChild(placeholder);
      }
      for (var i = 0; i < allowed.length; i++) {
        var opt = document.createElement("option");
        opt.value = allowed[i];
        opt.textContent = allowed[i];
        select.appendChild(opt);
      }
      select.value = ln.route || "";
    }

    select.addEventListener("change", function () {
      ln.route = select.value;
      if (onEdit) onEdit();
    });

    field.appendChild(select);
    refresh();
    return { el: field, refresh: refresh };
  }

  function createMedicationInput(ln, onChange, onEdit, onRouteRefresh) {
    var field = document.createElement("label");
    field.className = "receitas-field";
    field.appendChild(createFieldLabel("Medicamento"));

    var wrap = document.createElement("div");
    wrap.className = "receitas-med-wrap";

    var drug = document.createElement("input");
    drug.type = "text";
    drug.className = "receitas-med-input";
    drug.placeholder = "ex.: Dipirona 500 mg";
    drug.value = formatMedDisplay(ln);
    drug.setAttribute("autocomplete", "off");
    drug.setAttribute("aria-label", "Medicamento e apresentação");

    var suggestions = document.createElement("ul");
    suggestions.className = "receitas-med-suggestions";
    suggestions.hidden = true;

    function applyOption(opt) {
      if (opt.isFreeText) {
        var cat = catalog();
        var parsed = cat
          ? cat.parseFreeTextMedication(opt.drugName)
          : { drugName: opt.drugName, presentation: "" };
        ln.drugName = parsed.drugName;
        ln.presentation = parsed.presentation;
        ln.catalogKey = null;
        ln.classSource = "MANUAL";
        ln.prescriptionDocumentClass = "SIMPLE";
      } else {
        ln.drugName = opt.drugName;
        ln.presentation = opt.presentation || "";
        ln.catalogKey = opt.catalogKey;
        ln.prescriptionDocumentClass = opt.prescriptionDocumentClass || "SIMPLE";
        ln.controlListCode = opt.controlListCode || null;
        ln.validityDays = opt.validityDays != null ? opt.validityDays : null;
        ln.classSource = "CATALOG";
      }
      if (opt.isFreeText) {
        syncLineClassFromDrug(ln);
      }
      var cat = catalog();
      if (cat && cat.resolveRoutesForLine) {
        var resolved = cat.resolveRoutesForLine({
          catalogKey: ln.catalogKey,
          presentation: ln.presentation || "",
        });
        ln.route = cat.coerceRouteSelection(
          ln.route,
          resolved.allowedRoutes,
          resolved.defaultRoute,
        );
      }
      drug.value = formatMedDisplay(ln);
      suggestions.hidden = true;
      if (onRouteRefresh) onRouteRefresh();
      if (onChange) onChange();
      if (onEdit) onEdit();
    }

    function showSuggestions(query) {
      var cat = catalog();
      if (!cat || !cat.searchMedicationOptions) return;
      var hits = cat.searchMedicationOptions(query || "", 10);
      suggestions.innerHTML = "";
      if (!hits.length) {
        suggestions.hidden = true;
        return;
      }
      hits.forEach(function (opt) {
        var li = document.createElement("li");
        li.className = "receitas-med-suggestion";
        li.textContent = opt.label;
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          applyOption(opt);
        });
        suggestions.appendChild(li);
      });
      suggestions.hidden = false;
    }

    drug.addEventListener("input", function () {
      var cat = catalog();
      if (cat && cat.parseFreeTextMedication) {
        var parsed = cat.parseFreeTextMedication(drug.value);
        ln.drugName = parsed.drugName;
        ln.presentation = parsed.presentation;
      } else {
        ln.drugName = drug.value;
      }
      // Digitação = texto livre até escolher sugestão; libera via (RX-AC-67).
      ln.catalogKey = null;
      ln.classSource = "MANUAL";
      showSuggestions(drug.value);
      if (onRouteRefresh) onRouteRefresh();
      if (onEdit) onEdit();
    });
    drug.addEventListener("focus", function () {
      showSuggestions(drug.value);
    });
    drug.addEventListener("blur", function () {
      setTimeout(function () {
        suggestions.hidden = true;
      }, 150);
      syncLineClassFromDrug(ln);
      var catBlur = catalog();
      if (catBlur && catBlur.resolveRoutesForLine) {
        var resolvedBlur = catBlur.resolveRoutesForLine({
          catalogKey: ln.catalogKey,
          presentation: ln.presentation || "",
        });
        ln.route = catBlur.coerceRouteSelection(
          ln.route,
          resolvedBlur.allowedRoutes,
          resolvedBlur.defaultRoute,
        );
      }
      drug.value = formatMedDisplay(ln);
      if (onRouteRefresh) onRouteRefresh();
      if (onChange) onChange();
      if (onEdit) onEdit();
    });

    wrap.appendChild(drug);
    wrap.appendChild(suggestions);
    field.appendChild(wrap);
    return field;
  }

  function docHasNotificationLines(doc) {
    if (!doc || !Array.isArray(doc.lines)) return false;
    for (var i = 0; i < doc.lines.length; i++) {
      var ln = doc.lines[i];
      if (ln && ln.prescriptionDocumentClass === "SPECIAL_NOTIFICATION") return true;
    }
    return false;
  }

  function applyPrintButtonState(btn, result) {
    if (!btn || !result) return;
    btn.disabled = !result.ok;
    // Activo = primary (acento visível); bloqueado = secondary (cinza),
    // para não parecer «morto» até ao hover quando a impressão está ok.
    if (result.ok) {
      btn.classList.add("primary");
      btn.classList.remove("secondary");
      btn.removeAttribute("title");
      return;
    }
    btn.classList.remove("primary");
    btn.classList.add("secondary");
    var first =
      result.errors && result.errors.length ? result.errors[0] : null;
    btn.title = first || "Impressão bloqueada.";
  }

  function renderEditor(state) {
    var mountEl = state.mountEl;
    var statusEl = state.statusEl;
    var snap = state.snap;
    var meta = state.meta;
    var prescricaoSnap = state.prescricaoSnap;
    var avulso = !!state.avulso;

    if (!mountEl || !schema()) return;

    var doc =
      snap.receitas && snap.receitas[0]
        ? snap.receitas[0]
        : schema().emptyReceitaDoc();
    if (!snap.receitas || !snap.receitas.length) {
      snap.receitas = [doc];
    }

    mountEl.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "receitas-editor";

    if (avulso && !state.hideAvulsoNameUi) {
      var avulsoBox = document.createElement("div");
      avulsoBox.className = "receitas-avulso-header";
      var hint = document.createElement("p");
      hint.className = "receitas-avulso-hint";
      hint.textContent = "Paciente avulso — informe o nome.";
      avulsoBox.appendChild(hint);

      var nomeLbl = document.createElement("label");
      nomeLbl.textContent = "Nome completo";
      var nomeInp = document.createElement("input");
      nomeInp.type = "text";
      nomeInp.placeholder = "Nome do paciente";
      nomeInp.value = state.avulsoFields.nomeCompleto || "";
      nomeInp.addEventListener("input", function () {
        state.avulsoFields.nomeCompleto = nomeInp.value;
        scheduleLocalAutosave(state);
        refreshPrintButtons();
      });
      avulsoBox.appendChild(nomeLbl);
      avulsoBox.appendChild(nomeInp);
      wrap.appendChild(avulsoBox);
    } else if (!state.hideAvulsoNameUi && (meta.nomeCompleto || meta.primeiroNome)) {
      var patientBar = document.createElement("div");
      patientBar.className = "receitas-patient-bar";
      var nameEl = document.createElement("span");
      nameEl.className = "receitas-patient-name";
      nameEl.textContent = meta.nomeCompleto || meta.primeiroNome || "Paciente";
      patientBar.appendChild(nameEl);
      if (meta.prontuario) {
        var prontEl = document.createElement("span");
        prontEl.className = "receitas-patient-prontuario";
        prontEl.textContent = "Pront. " + meta.prontuario;
        patientBar.appendChild(prontEl);
      }
      wrap.appendChild(patientBar);
    }

    function bumpAutosave() {
      scheduleLocalAutosave(state);
      if (typeof state.onLinesChanged === "function") {
        state.onLinesChanged(state.snap);
      }
    }

    var toolbar = document.createElement("div");
    toolbar.className = "receitas-toolbar";

    if (prescricaoSnap && imprt()) {
      var btnImport = document.createElement("button");
      btnImport.type = "button";
      btnImport.className = "btn btn-sm";
      btnImport.textContent = "Importar AGHU";
      btnImport.addEventListener("click", function () {
        var imported = imprt().importLinesFromPrescricao(prescricaoSnap);
        if (!imported.length) {
          setStatus(statusEl, "Nenhuma linha em antibiótico/analgesia.", true);
          return;
        }
        doc.lines = doc.lines.concat(imported);
        redrawLines();
        bumpAutosave();
        setStatus(statusEl, imported.length + " linha(s) importada(s).", false);
      });
      toolbar.appendChild(btnImport);
    }

    // FEAT-311 — picker sempre visível (paridade web); lista vazia → CTA
    renderReceitaTemplateToolbar(toolbar, state, doc, function () {
      redrawLines();
      bumpAutosave();
    });

    var btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "btn btn-sm";
    btnAdd.textContent = "+ Linha";
    btnAdd.addEventListener("click", function () {
      doc.lines.push(schema().normalizeLine({ drugName: "", posology: "" }));
      redrawLines();
      bumpAutosave();
    });
    toolbar.appendChild(btnAdd);
    wrap.appendChild(toolbar);

    var sncrNotice = document.createElement("p");
    sncrNotice.className = "receitas-sncr-notice";
    sncrNotice.hidden = true;
    sncrNotice.textContent =
      "Notificação especial: numeração SNCR não disponível nesta versão — use o formulário oficial se necessário.";
    wrap.appendChild(sncrNotice);

    if (docHasSpecialLines(doc)) {
      var ctxApi = patientCtx();
      var schemaApi = schema();
      if (
        schemaApi &&
        ctxApi &&
        ctxApi.resolveDefaultPatientAddress &&
        !schemaApi.hasPatientAddressContent(doc.patientAddress)
      ) {
        var defaultAddr = ctxApi.resolveDefaultPatientAddress({
          pii: meta.patientAddress ? { patientAddress: meta.patientAddress } : null,
          snap: snap,
          activeDoc: doc,
        });
        if (schemaApi.hasPatientAddressContent(defaultAddr)) {
          doc.patientAddress = defaultAddr;
        }
      }
      var addr = ensurePatientAddress(doc);
      var addrBox = document.createElement("div");
      addrBox.className = "receitas-address-box";
      var addrTitle = document.createElement("p");
      addrTitle.className = "receitas-section-title";
      addrTitle.textContent = "Endereço do paciente (obrigatório para especial)";
      addrBox.appendChild(addrTitle);

      function addrField(label, key, placeholder, modClass) {
        var field = document.createElement("label");
        field.className =
          "receitas-addr-field" + (modClass ? " " + modClass : "");
        field.appendChild(createFieldLabel(label));
        var inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = placeholder || "";
        inp.setAttribute("aria-label", label);
        inp.value = addr[key] || "";
        inp.addEventListener("input", function () {
          addr[key] = inp.value;
          bumpAutosave();
          refreshPrintButtons();
        });
        field.appendChild(inp);
        addrBox.appendChild(field);
      }

      addrField("Rua / Avenida", "street", "ex.: Av. Marechal Campos", "receitas-addr-street");
      addrField("Número", "number", "Nº", "receitas-addr-number");
      addrField("Bairro", "neighborhood", "ex.: Centro", "receitas-addr-neighborhood");
      addrField("Município", "city", "ex.: Vitória", "receitas-addr-city");
      addrField("UF", "state", "ES", "receitas-addr-uf");
      wrap.appendChild(addrBox);
    }

    var linesBox = document.createElement("div");
    linesBox.className = "receitas-lines";
    var btnPrintSimple = null;
    var btnPrintSpecial = null;

    function refreshPrintButtons() {
      if (!btnPrintSimple || !btnPrintSpecial) return;
      var val = validationApi();
      var pctx = patientCtx();
      if (!val || !pctx) return;
      var patient = resolvePrintPatient(meta, state.avulsoFields, doc.patientAddress);
      var base = {
        patient: patient,
        prescriber: {},
        lines: doc.lines,
        patientAddress: doc.patientAddress,
      };
      applyPrintButtonState(
        btnPrintSimple,
        val.validatePrintContext(Object.assign({}, base, { printType: "simple" })),
      );
      applyPrintButtonState(
        btnPrintSpecial,
        val.validatePrintContext(Object.assign({}, base, { printType: "special" })),
      );
    }

    function refreshSncrNotice() {
      sncrNotice.hidden = !docHasNotificationLines(doc);
    }

    function redrawLines() {
      linesBox.innerHTML = "";
      doc.lines.forEach(function (ln, idx) {
        var card = document.createElement("div");
        card.className = "receitas-line-card";

        var head = document.createElement("div");
        head.className = "receitas-line-head";

        var badge = document.createElement("span");
        badge.className =
          "receitas-line-badge receitas-line-badge--" +
          String(ln.prescriptionDocumentClass || "SIMPLE").toLowerCase();
        badge.textContent = classLabel(ln.prescriptionDocumentClass || "SIMPLE");

        var btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "receitas-line-remove";
        btnRemove.title = "Remover linha";
        btnRemove.textContent = "×";
        btnRemove.addEventListener("click", function () {
          doc.lines.splice(idx, 1);
          redrawLines();
          bumpAutosave();
        });

        head.appendChild(badge);
        head.appendChild(btnRemove);
        card.appendChild(head);

        var routeControl = createRouteSelect(ln, function () {
          bumpAutosave();
          refreshPrintButtons();
        });
        var medWrap = createMedicationInput(
          ln,
          function () {
            badge.textContent = classLabel(ln.prescriptionDocumentClass || "SIMPLE");
            badge.className =
              "receitas-line-badge receitas-line-badge--" +
              String(ln.prescriptionDocumentClass || "SIMPLE").toLowerCase();
            refreshSncrNotice();
            bumpAutosave();
            refreshPrintButtons();
          },
          bumpAutosave,
          function () {
            routeControl.refresh();
          },
        );
        card.appendChild(medWrap);
        card.appendChild(routeControl.el);

        var posField = document.createElement("label");
        posField.className = "receitas-field";
        posField.appendChild(createFieldLabel("Posologia"));
        var pos = document.createElement("input");
        pos.type = "text";
        pos.className = "receitas-posology-input";
        pos.placeholder = "ex.: 1 cp de 8/8 h";
        pos.setAttribute("aria-label", "Posologia");
        pos.value = ln.posology || "";
        pos.addEventListener("input", function () {
          ln.posology = pos.value;
          bumpAutosave();
          refreshPrintButtons();
        });
        posField.appendChild(pos);
        card.appendChild(posField);

        var suffixField = document.createElement("label");
        suffixField.className = "receitas-field";
        suffixField.appendChild(createFieldLabel("Tempo / quantidade"));
        var suffixInput = document.createElement("input");
        suffixInput.type = "text";
        suffixInput.className = "receitas-suffix-input";
        suffixInput.placeholder = "ex.: CONTÍNUO ou 2 caixas";
        suffixInput.setAttribute("aria-label", "Tempo ou quantidade");
        suffixInput.value = ln.quantity || ln.duration || "";
        suffixInput.addEventListener("input", function () {
          ln.quantity = suffixInput.value;
          ln.duration = "";
          bumpAutosave();
        });
        suffixField.appendChild(suffixInput);
        card.appendChild(suffixField);

        linesBox.appendChild(card);
      });
      if (!doc.lines.length) {
        var empty = document.createElement("p");
        empty.className = "calc-empty";
        empty.textContent =
          "Nenhuma linha — use «+ Linha» ou «Importar AGHU» na barra acima.";
        linesBox.appendChild(empty);
      }
      refreshSncrNotice();
      refreshPrintButtons();
    }

    redrawLines();
    wrap.appendChild(linesBox);

    var actions = document.createElement("div");
    actions.className = "receitas-action-bar";

    var autosaveHint = document.createElement("p");
    autosaveHint.className = "receitas-autosave-hint";
    autosaveHint.textContent = "Alterações guardadas automaticamente no dispositivo.";
    actions.appendChild(autosaveHint);

    function doPrint(printType) {
      if (!printApi()) return;
      ensurePatientAddress(doc);
      var patient = resolvePrintPatient(meta, state.avulsoFields, doc.patientAddress);
      var result = printApi().printPrescription(
        {
          patient: patient,
          prescriber: {},
          lines: doc.lines,
          patientAddress: doc.patientAddress,
        },
        printType,
      );
      if (!result.ok) {
        setStatus(statusEl, result.error || "Impressão bloqueada.", true);
      } else {
        setStatus(statusEl, "", false);
      }
    }

    btnPrintSimple = document.createElement("button");
    btnPrintSimple.type = "button";
    btnPrintSimple.className = "btn btn-sm primary";
    btnPrintSimple.textContent = "Imprimir simples";
    btnPrintSimple.addEventListener("click", function () {
      doPrint("simple");
    });
    actions.appendChild(btnPrintSimple);

    btnPrintSpecial = document.createElement("button");
    btnPrintSpecial.type = "button";
    btnPrintSpecial.className = "btn btn-sm secondary";
    btnPrintSpecial.textContent = "Imprimir especial";
    btnPrintSpecial.addEventListener("click", function () {
      doPrint("special");
    });
    actions.appendChild(btnPrintSpecial);

    refreshPrintButtons();
    state._refreshPrintButtons = refreshPrintButtons;

    wrap.appendChild(actions);
    mountEl.appendChild(wrap);
  }

  /**
   * @param {{ mountEl: HTMLElement, statusEl?: HTMLElement, snap: object, meta: object, prescricaoSnap?: object|null, avulso?: boolean, avulsoFields?: object, hideAvulsoNameUi?: boolean, onLinesChanged?: function, prescriber?: object, templates?: object[], templatesLoading?: boolean, templatesError?: string|null, onTemplatesChange?: function, onOpenTemplatesManager?: function }} opts
   */
  function mount(opts) {
    if (!opts || !opts.mountEl) return;

    var snap = opts.snap;
    var schemaApi = schema();
    if (!snap || !schemaApi) return;
    snap = schemaApi.normalizeSnap(snap);
    if (!snap.receitas || !snap.receitas.length) {
      var newDoc = schemaApi.emptyReceitaDoc();
      var piiAddr = opts.meta && opts.meta.patientAddress;
      if (piiAddr && schemaApi.hasPatientAddressContent(piiAddr)) {
        newDoc.patientAddress = schemaApi.normalizePatientAddress(piiAddr);
      }
      snap.receitas = [newDoc];
    }

    var avulsoFields =
      opts.avulsoFields && typeof opts.avulsoFields === "object"
        ? opts.avulsoFields
        : mountedState && mountedState.avulsoFields
          ? mountedState.avulsoFields
          : {
              nomeCompleto: opts.meta.nomeCompleto || opts.meta.primeiroNome || "",
            };

    mountedState = {
      mountEl: opts.mountEl,
      statusEl: opts.statusEl || null,
      snap: snap,
      meta: opts.meta || {},
      prescricaoSnap: opts.prescricaoSnap || null,
      avulso: !!opts.avulso,
      avulsoFields: avulsoFields,
      hideAvulsoNameUi: !!opts.hideAvulsoNameUi,
      onLinesChanged: opts.onLinesChanged || null,
      prescriber: normalizePrescriber(opts.prescriber),
      templates: Array.isArray(opts.templates) ? opts.templates : [],
      templatesLoading: !!opts.templatesLoading,
      templatesError: opts.templatesError || null,
      onTemplatesChange: opts.onTemplatesChange || null,
      onOpenTemplatesManager: opts.onOpenTemplatesManager || null,
    };

    renderEditor(mountedState);
  }

  /**
   * Reavalia Imprimir simples/especial (ex.: nome avulso alterado no banner do kit).
   */
  function refreshPrintButtons() {
    if (
      mountedState &&
      typeof mountedState._refreshPrintButtons === "function"
    ) {
      mountedState._refreshPrintButtons();
    }
  }

  return {
    mount: mount,
    refreshPrintButtons: refreshPrintButtons,
    applyPrintButtonState: applyPrintButtonState,
  };
});