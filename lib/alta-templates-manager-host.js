/**
 * FEAT-311 — Overlay de gestão de modelos (Receitas + texto de alta) no kit Alta.
 * Helpers CRUD puros (testáveis) + UI vanilla no padrão settings-overlay.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaTemplatesManagerHost = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var TAB_ORDER = [
    "receitas",
    "orientacoes",
    "laudo",
    "atestado",
    "retorno",
    "referencia",
  ];
  var TAB_LABELS = {
    receitas: "Receitas",
    orientacoes: "Orientações",
    laudo: "Laudo",
    atestado: "Atestado",
    retorno: "Retorno",
    referencia: "Referência",
  };

  var mounted = null;

  function receitaSchemaApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return root.AghuReceitaSchema;
  }

  function receitaTemplateSchemaApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-template-schema.js");
      } catch (_e) {}
    }
    return root.AghuReceitaTemplateSchema;
  }

  function textTemplateSchemaApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-text-template-schema.js");
      } catch (_e) {}
    }
    return root.AghuAltaTextTemplateSchema;
  }

  function prefsApi() {
    return root.AghuUserPreferencesClient;
  }

  function isValidKind(kind) {
    return TAB_ORDER.indexOf(String(kind || "")) >= 0;
  }

  function isTextKind(kind) {
    return kind !== "receitas" && isValidKind(kind);
  }

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "tpl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  /**
   * ALTAOM-AC-05 — append modelo RX a partir de linhas do documento activo.
   * @returns {{ ok: boolean, templates?: object[], template?: object, error?: string }}
   */
  function appendReceitaTemplateFromLines(templates, name, lines) {
    var schema = receitaSchemaApi();
    var tplSchema = receitaTemplateSchemaApi();
    if (!schema || !tplSchema) {
      return { ok: false, error: "Schema de receita indisponível." };
    }
    var trimmed = String(name || "").trim();
    if (!trimmed) {
      return { ok: false, error: "Informe um nome para o modelo." };
    }
    var exportLines = [];
    var rawLines = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < rawLines.length; i++) {
      var ln = schema.normalizeLine(rawLines[i]);
      if (!ln || !String(ln.drugName || "").trim()) continue;
      var copy = Object.assign({}, ln);
      delete copy.id;
      exportLines.push(copy);
    }
    if (!exportLines.length) {
      return {
        ok: false,
        error: "Adicione pelo menos um medicamento com nome para guardar como modelo.",
      };
    }
    var now = Date.now();
    var draft = {
      id: newId(),
      name: trimmed,
      description: "",
      tags: [],
      lines: exportLines,
      createdAt: now,
      updatedAt: now,
    };
    return upsertReceitaTemplate(templates, draft);
  }

  /**
   * @returns {{ ok: boolean, templates?: object[], template?: object, error?: string }}
   */
  function upsertReceitaTemplate(templates, draft) {
    var tplSchema = receitaTemplateSchemaApi();
    if (!tplSchema) {
      return { ok: false, error: "Schema de templates RX indisponível." };
    }
    if (!draft || typeof draft !== "object") {
      return { ok: false, error: "Modelo inválido." };
    }
    var name = String(draft.name || "").trim();
    if (!name) {
      return { ok: false, error: "Informe o nome do modelo." };
    }
    var list = Array.isArray(templates) ? templates.slice() : [];
    var now = Date.now();
    var candidate = Object.assign({}, draft, {
      name: name,
      updatedAt: now,
      createdAt: typeof draft.createdAt === "number" ? draft.createdAt : now,
      id: draft.id && String(draft.id) ? String(draft.id) : newId(),
    });
    var snap = tplSchema.normalizeTemplatesSnap({
      version: 1,
      templates: [candidate],
      atualizadoEm: now,
    });
    if (!snap.templates.length) {
      return {
        ok: false,
        error: "Modelo sem linhas válidas (medicamento com nome).",
      };
    }
    var normalized = snap.templates[0];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === normalized.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.push(normalized);
    }
    var full = tplSchema.normalizeTemplatesSnap({
      version: 1,
      templates: list,
      atualizadoEm: now,
    });
    return { ok: true, templates: full.templates, template: normalized };
  }

  function removeReceitaTemplate(templates, id) {
    var list = Array.isArray(templates) ? templates : [];
    var tid = String(id || "");
    return list.filter(function (t) {
      return t && String(t.id) !== tid;
    });
  }

  /**
   * @returns {{ ok: boolean, templates?: object[], template?: object, error?: string }}
   */
  function upsertTextTemplate(templates, draft) {
    var textSchema = textTemplateSchemaApi();
    if (!textSchema) {
      return { ok: false, error: "Schema de texto de alta indisponível." };
    }
    if (!draft || typeof draft !== "object") {
      return { ok: false, error: "Modelo inválido." };
    }
    var name = String(draft.name || "").trim();
    if (!name) {
      return { ok: false, error: "Informe o nome do modelo." };
    }
    var now = Date.now();
    var candidate = Object.assign({}, draft, {
      name: name,
      updatedAt: now,
      createdAt: typeof draft.createdAt === "number" ? draft.createdAt : now,
      id: draft.id && String(draft.id) ? String(draft.id) : newId(),
    });
    var normalized = textSchema.normalizeTemplate(candidate);
    if (!normalized) {
      return { ok: false, error: "Preencha os campos obrigatórios do modelo." };
    }
    var list = Array.isArray(templates) ? templates.slice() : [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === normalized.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.push(normalized);
    }
    var snap = textSchema.normalizeSnap({ templates: list });
    return { ok: true, templates: snap.templates, template: normalized };
  }

  function removeTextTemplate(templates, id) {
    var list = Array.isArray(templates) ? templates : [];
    var tid = String(id || "");
    return list.filter(function (t) {
      return t && String(t.id) !== tid;
    });
  }

  function emptyReceitaDraft() {
    var schema = receitaSchemaApi();
    var ln = schema
      ? schema.normalizeLine({ drugName: "", posology: "" })
      : { drugName: "", posology: "", prescriptionDocumentClass: "SIMPLE" };
    if (ln && ln.id) delete ln.id;
    return {
      id: newId(),
      name: "",
      description: "",
      tags: [],
      lines: [ln],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function emptyTextDraft(kind) {
    var k = isTextKind(kind) ? kind : "orientacoes";
    var base = {
      id: newId(),
      name: "",
      description: "",
      kind: k,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (k === "orientacoes") {
      base.orientacoesItems = [""];
    } else if (k === "laudo") {
      base.laudo = {
        evolucao: "",
        semIntercorrencias: true,
        cid10: "",
        divulgacaoCidAutorizada: false,
      };
    } else if (k === "atestado") {
      base.atestado = {
        diasAfastamento: 15,
        cid10: "",
        divulgacaoCidAutorizada: false,
      };
    } else {
      base.retorno = {
        localRetorno: "",
        dataHoraRetorno: "",
        medicoRetorno: "",
        staff: "",
        auxiliar1: "",
        auxiliar2: "",
      };
    }
    return base;
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className =
      "alta-tpl-mgr-status" + (isError ? " settings-status-error" : "");
  }

  function emitSaved(eventName, detail) {
    if (typeof document === "undefined" || typeof CustomEvent !== "function") {
      return;
    }
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
  }

  function persistReceitaTemplates(templates) {
    var prefs = prefsApi();
    var tplSchema = receitaTemplateSchemaApi();
    if (!prefs || !tplSchema) {
      return Promise.resolve(false);
    }
    var toSave = templates;
    var builtin =
      typeof module !== "undefined" && module.exports
        ? (function () {
            try {
              return require("./receita-template-builtin.js");
            } catch (_e) {
              return null;
            }
          })()
        : root.AghuReceitaTemplateBuiltin;
    if (builtin && typeof builtin.stripUnmodifiedBuiltins === "function") {
      toSave = builtin.stripUnmodifiedBuiltins(templates);
    }
    var snap = tplSchema.normalizeTemplatesSnap({
      version: 1,
      templates: toSave,
      atualizadoEm: Date.now(),
    });
    return prefs
      .writeUserPreference("receita_templates", { templates: snap })
      .then(function (ok) {
        if (ok) {
          emitSaved("aghu:receita-templates-saved", { templates: snap.templates });
        }
        return !!ok;
      });
  }

  function persistTextTemplates(templates) {
    var prefs = prefsApi();
    var textSchema = textTemplateSchemaApi();
    if (!prefs || !textSchema) {
      return Promise.resolve(false);
    }
    var snap = textSchema.normalizeSnap({ templates: templates });
    return prefs
      .writeUserPreference("alta_text_templates", { templates: snap.templates })
      .then(function (ok) {
        if (ok) {
          emitSaved("aghu:alta-template-saved", { templates: snap.templates });
        }
        return !!ok;
      });
  }

  function close() {
    if (!mounted) return;
    var overlay = mounted.overlay;
    var onClose = mounted.onClose;
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove("alta-tpl-mgr-open");
    }
    mounted = null;
    if (typeof onClose === "function") onClose();
  }

  function renderListSummary(tpl, kind) {
    if (kind === "receitas") {
      var n = (tpl.lines && tpl.lines.length) || 0;
      return n + " linha" + (n === 1 ? "" : "s");
    }
    if (kind === "orientacoes") {
      var oi = (tpl.orientacoesItems && tpl.orientacoesItems.length) || 0;
      return oi + " item(ns)";
    }
    if (kind === "laudo") return "Evolução / conclusão";
    if (kind === "atestado") {
      return (tpl.atestado && tpl.atestado.diasAfastamento
        ? tpl.atestado.diasAfastamento
        : 15) + " dias";
    }
    return (tpl.retorno && tpl.retorno.localRetorno) || "Retorno";
  }

  function collectReceitaDraftFromForm(form, existing) {
    var nameInput = form.querySelector("[data-field=name]");
    var lines = [];
    var rows = form.querySelectorAll("[data-rx-line]");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var drug = row.querySelector("[data-field=drugName]");
      var pos = row.querySelector("[data-field=posology]");
      var via = row.querySelector("[data-field=route]");
      lines.push({
        drugName: drug ? drug.value : "",
        posology: pos ? pos.value : "",
        administrationRoute: via ? via.value : "USO ORAL",
        prescriptionDocumentClass: "SIMPLE",
      });
    }
    return {
      id: existing && existing.id ? existing.id : newId(),
      name: nameInput ? nameInput.value : "",
      description: (existing && existing.description) || "",
      tags: (existing && existing.tags) || [],
      lines: lines,
      createdAt: (existing && existing.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
  }

  function collectTextDraftFromForm(form, kind, existing) {
    var nameInput = form.querySelector("[data-field=name]");
    var draft = {
      id: existing && existing.id ? existing.id : newId(),
      name: nameInput ? nameInput.value : "",
      description: (existing && existing.description) || "",
      kind: kind,
      createdAt: (existing && existing.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
    if (kind === "orientacoes") {
      var items = [];
      var areas = form.querySelectorAll("[data-field=orientacaoItem]");
      for (var i = 0; i < areas.length; i++) {
        items.push(areas[i].value || "");
      }
      draft.orientacoesItems = items;
    } else if (kind === "laudo") {
      var evol = form.querySelector("[data-field=evolucao]");
      var cid = form.querySelector("[data-field=cid10]");
      var sem = form.querySelector("[data-field=semIntercorrencias]");
      draft.laudo = {
        evolucao: evol ? evol.value : "",
        cid10: cid ? cid.value : "",
        semIntercorrencias: sem ? !!sem.checked : true,
        divulgacaoCidAutorizada: false,
      };
    } else if (kind === "atestado") {
      var dias = form.querySelector("[data-field=dias]");
      var acid = form.querySelector("[data-field=cid10]");
      draft.atestado = {
        diasAfastamento: dias ? Number(dias.value) || 15 : 15,
        cid10: acid ? acid.value : "",
        divulgacaoCidAutorizada: false,
      };
    } else if (kind === "retorno") {
      var local = form.querySelector("[data-field=localRetorno]");
      var med = form.querySelector("[data-field=medicoRetorno]");
      draft.retorno = {
        localRetorno: local ? local.value : "",
        dataHoraRetorno: "",
        medicoRetorno: med ? med.value : "",
        staff: "",
        auxiliar1: "",
        auxiliar2: "",
      };
    } else if (kind === "referencia") {
      var orig = form.querySelector("[data-field=especialidadeOrigem]");
      var dest = form.querySelector("[data-field=encaminhadoPara]");
      var cidR = form.querySelector("[data-field=cid10]");
      var hip = form.querySelector("[data-field=hipoteseDiagnostica]");
      draft.referencia = {
        especialidadeOrigem: orig ? orig.value : "",
        encaminhadoPara: dest ? dest.value : "",
        cid10: cidR ? cidR.value : "",
        hipoteseDiagnostica: hip ? hip.value : "",
      };
    }
    return draft;
  }

  function renderEditorForm(container, state) {
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!state.editing) return;

    var form = document.createElement("div");
    form.className = "alta-tpl-mgr-form";
    form.setAttribute("data-editor", "1");

    var nameField = document.createElement("label");
    nameField.className = "settings-field";
    var nameSpan = document.createElement("span");
    nameSpan.textContent = "Nome do modelo";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.setAttribute("data-field", "name");
    nameInput.value = state.editing.name || "";
    nameInput.placeholder = "Nome do modelo";
    nameField.appendChild(nameSpan);
    nameField.appendChild(nameInput);
    form.appendChild(nameField);

    if (state.activeKind === "receitas") {
      var linesWrap = document.createElement("div");
      linesWrap.className = "alta-tpl-mgr-lines";
      var lines = state.editing.lines || [];
      function addLineRow(ln) {
        var row = document.createElement("div");
        row.className = "alta-tpl-mgr-line";
        row.setAttribute("data-rx-line", "1");
        var drug = document.createElement("input");
        drug.type = "text";
        drug.setAttribute("data-field", "drugName");
        drug.placeholder = "Medicamento";
        drug.value = (ln && ln.drugName) || "";
        var pos = document.createElement("input");
        pos.type = "text";
        pos.setAttribute("data-field", "posology");
        pos.placeholder = "Posologia";
        pos.value = (ln && ln.posology) || "";
        var via = document.createElement("input");
        via.type = "text";
        via.setAttribute("data-field", "route");
        via.placeholder = "Via";
        via.value = (ln && ln.administrationRoute) || "USO ORAL";
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn-sm secondary";
        rm.textContent = "×";
        rm.setAttribute("aria-label", "Remover linha");
        rm.addEventListener("click", function () {
          if (row.parentNode) row.parentNode.removeChild(row);
        });
        row.appendChild(drug);
        row.appendChild(pos);
        row.appendChild(via);
        row.appendChild(rm);
        linesWrap.appendChild(row);
      }
      for (var li = 0; li < lines.length; li++) addLineRow(lines[li]);
      if (!lines.length) addLineRow(null);
      form.appendChild(linesWrap);
      var addLn = document.createElement("button");
      addLn.type = "button";
      addLn.className = "btn btn-sm";
      addLn.textContent = "+ Linha";
      addLn.addEventListener("click", function () {
        addLineRow(null);
      });
      form.appendChild(addLn);
    } else if (state.activeKind === "orientacoes") {
      var items = state.editing.orientacoesItems || [""];
      var itemsWrap = document.createElement("div");
      itemsWrap.className = "alta-tpl-mgr-orientacoes";
      function addOrientItem(val) {
        var ta = document.createElement("textarea");
        ta.setAttribute("data-field", "orientacaoItem");
        ta.rows = 2;
        ta.value = val || "";
        ta.placeholder = "Item de orientação";
        itemsWrap.appendChild(ta);
      }
      for (var oi = 0; oi < items.length; oi++) addOrientItem(items[oi]);
      form.appendChild(itemsWrap);
      var addItem = document.createElement("button");
      addItem.type = "button";
      addItem.className = "btn btn-sm";
      addItem.textContent = "+ item";
      addItem.addEventListener("click", function () {
        addOrientItem("");
      });
      form.appendChild(addItem);
    } else if (state.activeKind === "laudo") {
      var evolField = document.createElement("label");
      evolField.className = "settings-field";
      evolField.appendChild(document.createTextNode("Evolução"));
      var evolTa = document.createElement("textarea");
      evolTa.setAttribute("data-field", "evolucao");
      evolTa.rows = 4;
      evolTa.value = (state.editing.laudo && state.editing.laudo.evolucao) || "";
      evolField.appendChild(evolTa);
      form.appendChild(evolField);
      var cidL = document.createElement("label");
      cidL.className = "settings-field";
      cidL.appendChild(document.createTextNode("CID-10"));
      var cidIn = document.createElement("input");
      cidIn.type = "text";
      cidIn.setAttribute("data-field", "cid10");
      cidIn.value = (state.editing.laudo && state.editing.laudo.cid10) || "";
      cidL.appendChild(cidIn);
      form.appendChild(cidL);
      var semL = document.createElement("label");
      semL.className = "alta-tpl-mgr-check";
      var semCb = document.createElement("input");
      semCb.type = "checkbox";
      semCb.setAttribute("data-field", "semIntercorrencias");
      semCb.checked =
        !state.editing.laudo || state.editing.laudo.semIntercorrencias !== false;
      semL.appendChild(semCb);
      semL.appendChild(document.createTextNode(" Sem intercorrências"));
      form.appendChild(semL);
    } else if (state.activeKind === "atestado") {
      var diasL = document.createElement("label");
      diasL.className = "settings-field";
      diasL.appendChild(document.createTextNode("Dias de afastamento"));
      var diasIn = document.createElement("input");
      diasIn.type = "number";
      diasIn.min = "1";
      diasIn.setAttribute("data-field", "dias");
      diasIn.value = String(
        (state.editing.atestado && state.editing.atestado.diasAfastamento) || 15,
      );
      diasL.appendChild(diasIn);
      form.appendChild(diasL);
      var cidA = document.createElement("label");
      cidA.className = "settings-field";
      cidA.appendChild(document.createTextNode("CID-10"));
      var cidAIn = document.createElement("input");
      cidAIn.type = "text";
      cidAIn.setAttribute("data-field", "cid10");
      cidAIn.value =
        (state.editing.atestado && state.editing.atestado.cid10) || "";
      cidA.appendChild(cidAIn);
      form.appendChild(cidA);
    } else if (state.activeKind === "retorno") {
      var locL = document.createElement("label");
      locL.className = "settings-field";
      locL.appendChild(document.createTextNode("Local de retorno"));
      var locIn = document.createElement("input");
      locIn.type = "text";
      locIn.setAttribute("data-field", "localRetorno");
      locIn.value =
        (state.editing.retorno && state.editing.retorno.localRetorno) || "";
      locL.appendChild(locIn);
      form.appendChild(locL);
      var medL = document.createElement("label");
      medL.className = "settings-field";
      medL.appendChild(document.createTextNode("Médico"));
      var medIn = document.createElement("input");
      medIn.type = "text";
      medIn.setAttribute("data-field", "medicoRetorno");
      medIn.value =
        (state.editing.retorno && state.editing.retorno.medicoRetorno) || "";
      medL.appendChild(medIn);
      form.appendChild(medL);
    } else if (state.activeKind === "referencia") {
      var ref = state.editing.referencia || {};
      function addRefField(label, field, val) {
        var lab = document.createElement("label");
        lab.className = "settings-field";
        lab.appendChild(document.createTextNode(label));
        var inp = document.createElement("input");
        inp.type = "text";
        inp.setAttribute("data-field", field);
        inp.value = val || "";
        lab.appendChild(inp);
        form.appendChild(lab);
      }
      addRefField("Especialidade de origem", "especialidadeOrigem", ref.especialidadeOrigem);
      addRefField("Encaminhado para", "encaminhadoPara", ref.encaminhadoPara);
      addRefField("CID-10", "cid10", ref.cid10);
      addRefField("Hipótese diagnóstica", "hipoteseDiagnostica", ref.hipoteseDiagnostica);
    }

    var actions = document.createElement("div");
    actions.className = "alta-tpl-mgr-form-actions";
    var btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn btn-sm";
    btnSave.textContent = "Guardar";
    btnSave.addEventListener("click", function () {
      saveEditing(state, form);
    });
    var btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "btn btn-sm secondary";
    btnCancel.textContent = "Cancelar";
    btnCancel.addEventListener("click", function () {
      state.editing = null;
      state.creating = false;
      renderBody(state);
    });
    actions.appendChild(btnSave);
    actions.appendChild(btnCancel);
    form.appendChild(actions);
    container.appendChild(form);
  }

  function saveEditing(state, form) {
    setStatus(state.statusEl, "", false);
    if (state.activeKind === "receitas") {
      var draftRx = collectReceitaDraftFromForm(form, state.editing);
      var resRx = upsertReceitaTemplate(state.rxTemplates, draftRx);
      if (!resRx.ok) {
        setStatus(state.statusEl, resRx.error || "Falha ao guardar.", true);
        return;
      }
      persistReceitaTemplates(resRx.templates).then(function (ok) {
        if (!ok) {
          setStatus(state.statusEl, "Não foi possível guardar na nuvem.", true);
          return;
        }
        state.rxTemplates = resRx.templates;
        if (typeof state.onRxTemplatesChange === "function") {
          state.onRxTemplatesChange(resRx.templates);
        }
        state.editing = null;
        state.creating = false;
        setStatus(state.statusEl, "Modelo guardado.", false);
        renderBody(state);
      });
      return;
    }
    var draftTx = collectTextDraftFromForm(form, state.activeKind, state.editing);
    var resTx = upsertTextTemplate(state.altaTemplates, draftTx);
    if (!resTx.ok) {
      setStatus(state.statusEl, resTx.error || "Falha ao guardar.", true);
      return;
    }
    persistTextTemplates(resTx.templates).then(function (ok) {
      if (!ok) {
        setStatus(state.statusEl, "Não foi possível guardar na nuvem.", true);
        return;
      }
      state.altaTemplates = resTx.templates;
      if (typeof state.onAltaTemplatesChange === "function") {
        state.onAltaTemplatesChange(resTx.templates);
      }
      state.editing = null;
      state.creating = false;
      setStatus(state.statusEl, "Modelo guardado.", false);
      renderBody(state);
    });
  }

  function templatesForActiveKind(state) {
    if (state.activeKind === "receitas") {
      return state.rxTemplates || [];
    }
    var textSchema = textTemplateSchemaApi();
    var list = state.altaTemplates || [];
    if (textSchema && textSchema.filterTemplatesByKind) {
      return textSchema.filterTemplatesByKind(list, state.activeKind);
    }
    return list.filter(function (t) {
      return t && t.kind === state.activeKind;
    });
  }

  function renderBody(state) {
    var body = state.bodyEl;
    while (body.firstChild) body.removeChild(body.firstChild);

    var toolbar = document.createElement("div");
    toolbar.className = "alta-tpl-mgr-toolbar";
    var btnNew = document.createElement("button");
    btnNew.type = "button";
    btnNew.className = "btn btn-sm";
    btnNew.textContent = "Novo modelo";
    btnNew.addEventListener("click", function () {
      state.creating = true;
      state.editing =
        state.activeKind === "receitas"
          ? emptyReceitaDraft()
          : emptyTextDraft(state.activeKind);
      renderBody(state);
    });
    toolbar.appendChild(btnNew);
    body.appendChild(toolbar);

    var editorHost = document.createElement("div");
    editorHost.className = "alta-tpl-mgr-editor";
    body.appendChild(editorHost);
    renderEditorForm(editorHost, state);

    var list = document.createElement("ul");
    list.className = "alta-tpl-mgr-list";
    var items = templatesForActiveKind(state);
    if (!items.length && !state.editing) {
      var empty = document.createElement("li");
      empty.className = "alta-tpl-mgr-empty";
      empty.textContent = "Nenhum modelo nesta aba.";
      list.appendChild(empty);
    }
    items.forEach(function (tpl) {
      var li = document.createElement("li");
      li.className = "alta-tpl-mgr-item";
      var info = document.createElement("div");
      var title = document.createElement("strong");
      title.textContent = tpl.name || "Sem nome";
      var summary = document.createElement("span");
      summary.className = "alta-tpl-mgr-summary";
      summary.textContent = renderListSummary(tpl, state.activeKind);
      info.appendChild(title);
      info.appendChild(summary);
      var btns = document.createElement("div");
      btns.className = "alta-tpl-mgr-item-actions";
      var btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "btn btn-sm secondary";
      btnEdit.textContent = "Editar";
      btnEdit.addEventListener("click", function () {
        state.creating = false;
        state.editing = JSON.parse(JSON.stringify(tpl));
        renderBody(state);
      });
      var btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-sm secondary";
      btnDel.textContent = "Apagar";
      btnDel.addEventListener("click", function () {
        if (
          typeof window !== "undefined" &&
          window.confirm &&
          !window.confirm("Apagar este modelo?")
        ) {
          return;
        }
        if (state.activeKind === "receitas") {
          var nextRx = removeReceitaTemplate(state.rxTemplates, tpl.id);
          persistReceitaTemplates(nextRx).then(function (ok) {
            if (!ok) {
              setStatus(state.statusEl, "Não foi possível apagar.", true);
              return;
            }
            state.rxTemplates = nextRx;
            if (typeof state.onRxTemplatesChange === "function") {
              state.onRxTemplatesChange(nextRx);
            }
            renderBody(state);
          });
        } else {
          var nextTx = removeTextTemplate(state.altaTemplates, tpl.id);
          persistTextTemplates(nextTx).then(function (ok) {
            if (!ok) {
              setStatus(state.statusEl, "Não foi possível apagar.", true);
              return;
            }
            state.altaTemplates = nextTx;
            if (typeof state.onAltaTemplatesChange === "function") {
              state.onAltaTemplatesChange(nextTx);
            }
            renderBody(state);
          });
        }
      });
      btns.appendChild(btnEdit);
      btns.appendChild(btnDel);
      li.appendChild(info);
      li.appendChild(btns);
      list.appendChild(li);
    });
    body.appendChild(list);
  }

  function renderTabs(state) {
    var tablist = state.tablistEl;
    while (tablist.firstChild) tablist.removeChild(tablist.firstChild);
    TAB_ORDER.forEach(function (kind) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", state.activeKind === kind ? "true" : "false");
      btn.className =
        "alta-tpl-mgr-tab" + (state.activeKind === kind ? " active" : "");
      btn.textContent = TAB_LABELS[kind];
      btn.addEventListener("click", function () {
        if (state.activeKind === kind) return;
        state.activeKind = kind;
        state.editing = null;
        state.creating = false;
        setStatus(state.statusEl, "", false);
        renderTabs(state);
        renderBody(state);
      });
      tablist.appendChild(btn);
    });
  }

  /**
   * @param {{
   *   parentEl?: HTMLElement,
   *   initialKind?: string,
   *   rxTemplates?: object[],
   *   altaTemplates?: object[],
   *   onRxTemplatesChange?: function,
   *   onAltaTemplatesChange?: function,
   *   onClose?: function
   * }} opts
   */
  function open(opts) {
    opts = opts || {};
    close();

    var parent =
      opts.parentEl ||
      (typeof document !== "undefined" ? document.body : null);
    if (!parent) return;

    var initial = isValidKind(opts.initialKind) ? opts.initialKind : "receitas";
    var overlay = document.createElement("div");
    overlay.className = "alta-tpl-mgr-overlay settings-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Modelos de alta");

    var inner = document.createElement("div");
    inner.className = "settings-overlay-inner";

    var header = document.createElement("div");
    header.className = "settings-overlay-header";
    var h2 = document.createElement("h2");
    h2.textContent = "Modelos";
    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "btn btn-sm secondary";
    btnClose.textContent = "Fechar";
    btnClose.addEventListener("click", close);
    header.appendChild(h2);
    header.appendChild(btnClose);
    inner.appendChild(header);

    var hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent =
      "Receitas, orientações, laudo, atestado e retorno — sem dados de paciente.";
    inner.appendChild(hint);

    var statusEl = document.createElement("p");
    statusEl.className = "alta-tpl-mgr-status";
    statusEl.hidden = true;
    inner.appendChild(statusEl);

    var tablist = document.createElement("div");
    tablist.className = "alta-tpl-mgr-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Tipo de modelo");
    inner.appendChild(tablist);

    var bodyEl = document.createElement("div");
    bodyEl.className = "alta-tpl-mgr-body settings-body";
    inner.appendChild(bodyEl);

    overlay.appendChild(inner);
    parent.appendChild(overlay);
    if (document.body) document.body.classList.add("alta-tpl-mgr-open");

    var altaSnap = opts.altaTemplatesSnap;
    var altaList =
      Array.isArray(opts.altaTemplates)
        ? opts.altaTemplates
        : altaSnap && Array.isArray(altaSnap.templates)
          ? altaSnap.templates
          : [];

    var state = {
      overlay: overlay,
      tablistEl: tablist,
      bodyEl: bodyEl,
      statusEl: statusEl,
      activeKind: initial,
      editing: null,
      creating: false,
      rxTemplates: Array.isArray(opts.rxTemplates) ? opts.rxTemplates.slice() : [],
      altaTemplates: altaList.slice(),
      onRxTemplatesChange: opts.onRxTemplatesChange,
      onAltaTemplatesChange: opts.onAltaTemplatesChange,
      onClose: opts.onClose,
    };
    mounted = state;
    renderTabs(state);
    renderBody(state);
  }

  /**
   * Descreve UI do picker RX (ALTAOM-AC-04) — sem DOM.
   * @returns {{ mode: "empty"|"select"|"error"|"loading", showCta: boolean }}
   */
  function describeReceitaToolbar(templates, opts) {
    opts = opts || {};
    if (opts.loading) return { mode: "loading", showCta: false };
    if (opts.loadError) return { mode: "error", showCta: false };
    var list = Array.isArray(templates) ? templates : [];
    if (!list.length) return { mode: "empty", showCta: true };
    return { mode: "select", showCta: false };
  }

  return {
    TAB_ORDER: TAB_ORDER,
    TAB_LABELS: TAB_LABELS,
    isValidKind: isValidKind,
    isTextKind: isTextKind,
    appendReceitaTemplateFromLines: appendReceitaTemplateFromLines,
    upsertReceitaTemplate: upsertReceitaTemplate,
    removeReceitaTemplate: removeReceitaTemplate,
    upsertTextTemplate: upsertTextTemplate,
    removeTextTemplate: removeTextTemplate,
    emptyReceitaDraft: emptyReceitaDraft,
    emptyTextDraft: emptyTextDraft,
    describeReceitaToolbar: describeReceitaToolbar,
    open: open,
    close: close,
  };
});
