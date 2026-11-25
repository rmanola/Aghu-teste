// passometro_popup-render.js — DOM render API for Passômetro popup tab
"use strict";

(function () {
  function create(deps) {
    const {
      headerForm,
      entriesRoot,
      examsPreviewEl,
      metaEl,
      pmCustomFieldsList,
      pmScoreSelect,
      pmCustomLabel,
      patientSel,
      getCurrentSnap,
      setCurrentSnap,
      getUserTemplate,
      setUserTemplate,
      getCurrentExamsRaw,
      setCurrentExamsRaw,
      effectiveTemplate,
      scheduleAutosave,
      attachBrDateInput,
      schema,
      layout,
      templateApi,
      examsTableApi,
      dateBrApi,
      archive,
      scoreRegistryApi,
      saveUserTemplateRemote,
      readCustomSectionFromForm,
    } = deps;

    function fieldDefFor(tpl, key) {
      if (!tpl || !tpl.fields) return { key: key, kind: "builtin", section: "entry" };
      for (var i = 0; i < tpl.fields.length; i++) {
        if (tpl.fields[i].key === key) return tpl.fields[i];
      }
      return { key: key, kind: "builtin", section: "entry" };
    }

    function formatPmLimitHint(maxChars, maxLines) {
      const limApi = globalThis.AghuPassometroFieldLimits;
      if (limApi && limApi.formatLimitHint) {
        return limApi.formatLimitHint(maxChars, maxLines);
      }
      const lines = Math.max(1, Number(maxLines) || 1);
      const lineWord = lines === 1 ? "linha" : "linhas";
      return "Máx. " + maxChars + " caracteres · " + lines + " " + lineWord + " na impressão";
    }

    function updatePmCharCounter(span, inp, lim) {
      if (!span || !inp || !lim) return;
      const limApi = globalThis.AghuPassometroFieldLimits;
      if (limApi && limApi.formatCharCounterText) {
        span.textContent = limApi.formatCharCounterText(
          inp.value || "",
          lim.maxChars,
          lim.maxLines,
        );
      } else {
        const n = String(inp.value || "").length;
        const over = n >= lim.maxChars;
        span.textContent =
          n +
          "/" +
          lim.maxChars +
          (over ? " — Limite de caracteres" : "") +
          "\n" +
          formatPmLimitHint(lim.maxChars, lim.maxLines);
      }
      const n = String(inp.value || "").length;
      span.classList.toggle("pm-char-count-over", n >= lim.maxChars);
    }

    function updatePmSharedEntryCounter(span, cdInp, pendInp) {
      if (!span) return;
      const limApi = globalThis.AghuPassometroFieldLimits;
      const cd = (cdInp && cdInp.value) || "";
      const pend = (pendInp && pendInp.value) || "";
      if (limApi && limApi.formatSharedEntryCounterText) {
        span.textContent = limApi.formatSharedEntryCounterText(cd, pend);
      }
      const usage =
        limApi && limApi.resolveSharedEntryUsage
          ? limApi.resolveSharedEntryUsage(cd, pend)
          : null;
      span.classList.toggle("pm-char-count-over", !!(usage && usage.over));
      if (cdInp && usage) {
        const own =
          limApi && limApi.plainTextLength
            ? limApi.plainTextLength(cd)
            : String(cd).length;
        cdInp.maxLength = own + usage.remainingChars;
      }
      if (pendInp && usage) {
        const own =
          limApi && limApi.plainTextLength
            ? limApi.plainTextLength(pend)
            : String(pend).length;
        pendInp.maxLength = own + usage.remainingChars;
      }
    }

    function readHeaderNarrativeDraftFromDom() {
      const h = {
        hdaHpp: "",
        diagnosticos: readDiagnosticosFromForm(),
        cirurgias: readCirurgiasFromForm(),
      };
      const hdaEl = headerForm
        ? headerForm.querySelector('[data-pm-header="hdaHpp"]')
        : null;
      if (hdaEl) h.hdaHpp = hdaEl.value || "";
      return h;
    }

    function updatePmHeaderNarrativeCounter(span) {
      if (!span) return;
      const limApi = globalThis.AghuPassometroFieldLimits;
      const header = readHeaderNarrativeDraftFromDom();
      if (limApi && limApi.formatHeaderNarrativeCounterText) {
        span.textContent = limApi.formatHeaderNarrativeCounterText(header);
      }
      const usage =
        limApi && limApi.resolveHeaderNarrativeUsage
          ? limApi.resolveHeaderNarrativeUsage(header)
          : null;
      span.classList.toggle("pm-char-count-over", !!(usage && usage.over));

      function applyRoom(el, preferKey, preferIndex) {
        if (!el || !limApi || !limApi.resolveHeaderNarrativeRoom) return;
        const room = limApi.resolveHeaderNarrativeRoom(
          header,
          preferKey,
          preferIndex == null ? null : preferIndex,
        );
        if (room && typeof room.maxChars === "number") {
          el.maxLength = Math.max(0, room.maxChars);
        }
      }

      if (headerForm) {
        const hdaEl = headerForm.querySelector('[data-pm-header="hdaHpp"]');
        applyRoom(hdaEl, "hdaHpp", null);
        const diagRows = headerForm.querySelectorAll(
          "[data-pm-diagnostico-row]",
        );
        diagRows.forEach((row, idx) => {
          applyRoom(
            row.querySelector('[data-pm-diagnostico="texto"]'),
            "diagnosticoTexto",
            idx,
          );
        });
        const cirRows = headerForm.querySelectorAll("[data-pm-cirurgia-row]");
        cirRows.forEach((row, idx) => {
          applyRoom(
            row.querySelector('[data-pm-cirurgia="nome"]'),
            "cirurgiaNome",
            idx,
          );
          applyRoom(
            row.querySelector('[data-pm-cirurgia="achadosOperatorios"]'),
            "achadosOperatorios",
            idx,
          );
        });
      }
    }

    function refreshPmCharCounterForInput(inp) {
      if (!inp || !inp.getAttribute) return;
      const id = inp.getAttribute("aria-describedby");
      if (!id) return;
      const span =
        (inp.parentElement &&
          inp.parentElement.querySelector(
            '[id="' + String(id).replace(/"/g, "") + '"]',
          )) ||
        document.getElementById(id);
      if (!span) return;
      if (span.dataset.sharedEntry === "1") {
        const card = inp.closest("article") || inp.closest(".pm-entry");
        const root = card || document;
        const cdInp = root.querySelector('[data-pm-field="cd"]');
        const pendInp = root.querySelector('[data-pm-field="pendencias"]');
        updatePmSharedEntryCounter(span, cdInp, pendInp);
        return;
      }
      if (span.dataset.headerNarrative === "1") {
        updatePmHeaderNarrativeCounter(span);
        return;
      }
      if (span.dataset.maxChars == null) return;
      updatePmCharCounter(span, inp, {
        maxChars: Number(span.dataset.maxChars),
        maxLines: Number(span.dataset.maxLines || 1),
      });
    }

    /** maxLength + contador n/max visível e aria-describedby (paridade hub FEAT-158). */
    function applyPmFieldLimit(inp, def, idPrefix, opts) {
      const limApi = globalThis.AghuPassometroFieldLimits;
      if (!limApi || !limApi.resolveFieldLimit) return null;
      const lim = limApi.resolveFieldLimit(def);
      const key = def && def.key ? String(def.key) : "";
      const isShared = key === "cd" || key === "pendencias";
      const isHeaderNarrative =
        key === "hdaHpp" ||
        key === "diagnosticos" ||
        key === "cirurgias" ||
        (lim && lim.group === "header_shared") ||
        (opts && opts.headerNarrativePreferKey);

      if (isShared && limApi.formatSharedEntryCounterText) {
        const counterId =
          (idPrefix || "pm") + "-shared-cd-pendencias-limit";
        let span = document.getElementById(counterId);
        if (!span) {
          span = document.createElement("span");
          span.className = "pm-char-count";
          span.id = counterId;
          span.dataset.sharedEntry = "1";
          span.setAttribute("aria-live", "polite");
        }
        inp.setAttribute("aria-describedby", counterId);
        const isTextarea = String(inp.tagName || "").toLowerCase() === "textarea";
        if (isTextarea) {
          // Pool de impressão = 2; UI do popup usa ≥4 linhas para digitar com conforto.
          const lines = Math.max(4, Number(lim.maxLines) || 1);
          inp.rows = lines;
          inp.style.height = lines * 18 + 12 + "px";
          inp.style.resize = "none";
          inp.style.overflowY = "auto";
        }
        const refresh = () => {
          const card =
            (opts && opts.entryRoot) ||
            inp.closest("article") ||
            inp.closest(".pm-entry") ||
            document;
          const cdInp = card.querySelector('[data-pm-field="cd"]');
          const pendInp = card.querySelector('[data-pm-field="pendencias"]');
          updatePmSharedEntryCounter(span, cdInp, pendInp);
        };
        inp.addEventListener("input", refresh);
        refresh();
        return { lim: lim, counter: span, shared: true, refresh: refresh };
      }

      if (isHeaderNarrative && limApi.formatHeaderNarrativeCounterText) {
        const counterId = "pm-header-narrative-shared-limit";
        let span = document.getElementById(counterId);
        if (!span) {
          span = document.createElement("span");
          span.className = "pm-char-count";
          span.id = counterId;
          span.dataset.headerNarrative = "1";
          span.setAttribute("aria-live", "polite");
        }
        inp.setAttribute("aria-describedby", counterId);
        const isTextarea = String(inp.tagName || "").toLowerCase() === "textarea";
        if (isTextarea) {
          const lines = Math.max(1, Number(lim.maxLines) || 1);
          inp.rows = lines;
          inp.style.height = lines * 18 + 12 + "px";
          inp.style.resize = "none";
          inp.style.overflowY = "auto";
        }
        const refresh = () => updatePmHeaderNarrativeCounter(span);
        inp.addEventListener("input", refresh);
        refresh();
        return {
          lim: lim,
          counter: span,
          headerNarrative: true,
          refresh: refresh,
        };
      }

      if (!(lim.maxChars > 0)) {
        const isTextarea = String(inp.tagName || "").toLowerCase() === "textarea";
        if (isTextarea) {
          inp.rows = 2;
          inp.style.resize = "vertical";
        }
        return { lim: lim, counter: null, uncapped: true };
      }

      inp.maxLength = lim.maxChars;
      const isTextarea = String(inp.tagName || "").toLowerCase() === "textarea";
      if (isTextarea) {
        inp.rows = lim.maxLines;
        inp.style.height = lim.maxLines * 18 + 12 + "px";
        inp.style.resize = "none";
        inp.style.overflowY = "auto";
      }
      const counterId =
        (idPrefix || "pm") + "-" + (def.key || "field") + "-limit";
      const span = document.createElement("span");
      span.className = "pm-char-count";
      span.id = counterId;
      span.dataset.maxChars = String(lim.maxChars);
      span.dataset.maxLines = String(lim.maxLines);
      span.setAttribute("aria-live", "polite");
      inp.setAttribute("aria-describedby", counterId);
      updatePmCharCounter(span, inp, lim);
      inp.addEventListener("input", () => updatePmCharCounter(span, inp, lim));
      return { lim: lim, counter: span };
    }

    const VITAL_FIELD_KEYS = new Set([
      "fc",
      "fr",
      "sato2",
      "tax",
      "pa",
      "hgt",
      "diurese",
      "bh",
      "fezes",
      "drenos",
      "drenoTl",
      "drenoJp",
      "drenoPig",
      "vomitos",
    ]);

    function readVitalsTouchedFromCard(card) {
      const raw = card.getAttribute("data-pm-vitals-touched");
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_e) {
        return {};
      }
    }

    function markVitalTouched(card, key) {
      if (!VITAL_FIELD_KEYS.has(key)) return;
      const touched = readVitalsTouchedFromCard(card);
      touched[key] = true;
      card.setAttribute("data-pm-vitals-touched", JSON.stringify(touched));
    }

    function readCirurgiasFromForm() {
      const root = headerForm.querySelector("[data-pm-cirurgias-list]");
      if (!root) return [];
      const rows = root.querySelectorAll("[data-pm-cirurgia-row]");
      const list = [];
      rows.forEach((row) => {
        const id = row.getAttribute("data-pm-cirurgia-id") || "";
        const dataInp = row.querySelector('[data-pm-cirurgia="data"]');
        const nomeInp = row.querySelector('[data-pm-cirurgia="nome"]');
        const equipeInp = row.querySelector('[data-pm-cirurgia="equipe"]');
        const achadosInp = row.querySelector(
          '[data-pm-cirurgia="achadosOperatorios"]'
        );
        const descInp = row.querySelector('[data-pm-cirurgia="descricao"]');
        // Legado: campo único "descricao" era o nome do procedimento.
        const nomeVal = nomeInp
          ? nomeInp.value
          : descInp && !row.querySelector('[data-pm-cirurgia="nome"]')
            ? descInp.value
            : "";
        list.push({
          id: id,
          data: dataInp ? dataInp.value : "",
          nome: nomeVal,
          equipe: equipeInp ? equipeInp.value : "",
          achadosOperatorios: achadosInp ? achadosInp.value : "",
          descricao: nomeInp && descInp ? descInp.value : "",
        });
      });
      return list;
    }

    function readDiagnosticosFromForm() {
      const root = headerForm.querySelector("[data-pm-diagnosticos-list]");
      if (!root) return [];
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
      return list;
    }

    function readHeaderFromForm() {
      const h = schema() ? schema().emptyHeader() : {};
      const tpl = effectiveTemplate(getCurrentSnap());
      if (!tpl) return h;
      const fields = tpl.fields.filter(
        (f) => f.section === "header" && f.visible !== false && f.kind !== "score"
      );
      for (const f of fields) {
        if (f.widget === "cirurgias") {
          h.cirurgias = readCirurgiasFromForm();
          continue;
        }
        if (f.widget === "diagnosticos") {
          h.diagnosticos = readDiagnosticosFromForm();
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
      const limApi = globalThis.AghuPassometroFieldLimits;
      if (limApi && typeof limApi.clampHeaderNarrative === "function") {
        return limApi.clampHeaderNarrative(h, null, null);
      }
      return h;
    }

    function writeCirurgiasToForm(cirurgias) {
      const root = headerForm.querySelector("[data-pm-cirurgias-list]");
      if (!root) return;
      root.replaceChildren();
      const api = dateBrApi();
      const list = Array.isArray(cirurgias) ? cirurgias : [];
      list.forEach((c) => {
        const row = document.createElement("div");
        row.className = "pm-cirurgia-row";
        row.setAttribute("data-pm-cirurgia-row", "1");
        row.setAttribute("data-pm-cirurgia-id", c.id || "");

        const dateLbl = document.createElement("label");
        const dateSpan = document.createElement("span");
        dateSpan.textContent = "Data";
        dateLbl.appendChild(dateSpan);
        const dataInp = document.createElement("input");
        dataInp.type = "text";
        dataInp.setAttribute("data-pm-cirurgia", "data");
        dataInp.value =
          api && c.data ? api.normalizeBrDateDisplay(c.data) : c.data || "";
        if (api) {
          attachBrDateInput(dataInp, () => syncPoFromHeaderToEntries());
        } else {
          dataInp.addEventListener("input", () => syncPoFromHeaderToEntries());
        }
        dateLbl.appendChild(dataInp);

        const nomeLbl = document.createElement("label");
        const nomeSpan = document.createElement("span");
        nomeSpan.textContent = "Procedimento";
        nomeLbl.appendChild(nomeSpan);
        const nomeInp = document.createElement("input");
        nomeInp.type = "text";
        nomeInp.setAttribute("data-pm-cirurgia", "nome");
        nomeInp.value = c.nome || "";
        const nomeApplied = applyPmFieldLimit(
          nomeInp,
          { key: "cirurgias", widget: "text", section: "header" },
          "pm-cirurgia-" + (c.id || "x") + "-nome",
          { headerNarrativePreferKey: "cirurgiaNome" },
        );
        nomeInp.addEventListener("input", () => scheduleAutosave());
        nomeLbl.appendChild(nomeInp);
        if (nomeApplied && nomeApplied.counter && !nomeApplied.counter.isConnected) {
          nomeLbl.appendChild(nomeApplied.counter);
        }

        const equipeLbl = document.createElement("label");
        equipeLbl.className = "pm-cirurgia-full";
        const equipeSpan = document.createElement("span");
        equipeSpan.textContent = "Equipe";
        equipeLbl.appendChild(equipeSpan);
        const equipeInp = document.createElement("textarea");
        equipeInp.rows = 2;
        equipeInp.setAttribute("data-pm-cirurgia", "equipe");
        equipeInp.value = c.equipe || "";
        equipeInp.addEventListener("input", () => scheduleAutosave());
        equipeLbl.appendChild(equipeInp);

        const achadosLbl = document.createElement("label");
        achadosLbl.className = "pm-cirurgia-full";
        const achadosSpan = document.createElement("span");
        achadosSpan.textContent = "Achados operatórios";
        achadosLbl.appendChild(achadosSpan);
        const achadosInp = document.createElement("textarea");
        achadosInp.setAttribute("data-pm-cirurgia", "achadosOperatorios");
        achadosInp.value = c.achadosOperatorios || "";
        const achadosApplied = applyPmFieldLimit(
          achadosInp,
          { key: "cirurgias", widget: "textarea", section: "header" },
          "pm-cirurgia-" + (c.id || "x") + "-achados",
          { headerNarrativePreferKey: "achadosOperatorios" },
        );
        achadosInp.addEventListener("input", () => scheduleAutosave());
        achadosLbl.appendChild(achadosInp);
        if (
          achadosApplied &&
          achadosApplied.counter &&
          !achadosApplied.counter.isConnected
        ) {
          achadosLbl.appendChild(achadosApplied.counter);
        }

        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "pm-remove-cirurgia";
        btnRemove.textContent = "Remover";
        btnRemove.addEventListener("click", () => {
          row.remove();
          syncPoFromHeaderToEntries();
          scheduleAutosave();
        });

        row.appendChild(dateLbl);
        row.appendChild(nomeLbl);
        row.appendChild(btnRemove);
        row.appendChild(equipeLbl);
        row.appendChild(achadosLbl);
        root.appendChild(row);
      });
    }

    function writeDiagnosticosToForm(diagnosticos) {
      const root = headerForm.querySelector("[data-pm-diagnosticos-list]");
      if (!root) return;
      root.replaceChildren();
      const api = dateBrApi();
      const list = Array.isArray(diagnosticos) ? diagnosticos : [];
      list.forEach((d) => {
        const row = document.createElement("div");
        row.className = "pm-diagnostico-row";
        row.setAttribute("data-pm-diagnostico-row", "1");
        row.setAttribute("data-pm-diagnostico-id", d.id || "");

        const dateLbl = document.createElement("label");
        const dateSpan = document.createElement("span");
        dateSpan.textContent = "Data";
        dateLbl.appendChild(dateSpan);
        const dataInp = document.createElement("input");
        dataInp.type = "text";
        dataInp.setAttribute("data-pm-diagnostico", "data");
        dataInp.value =
          api && d.data ? api.normalizeBrDateDisplay(d.data) : d.data || "";
        if (api) {
          attachBrDateInput(dataInp, () => scheduleAutosave());
        } else {
          dataInp.addEventListener("input", () => scheduleAutosave());
        }
        dateLbl.appendChild(dataInp);

        const textoLbl = document.createElement("label");
        const textoSpan = document.createElement("span");
        textoSpan.textContent = "Diagnóstico";
        textoLbl.appendChild(textoSpan);
        const textoInp = document.createElement("input");
        textoInp.type = "text";
        textoInp.setAttribute("data-pm-diagnostico", "texto");
        textoInp.value = d.texto || "";
        const textoApplied = applyPmFieldLimit(
          textoInp,
          { key: "diagnosticos", widget: "text", section: "header" },
          "pm-diagnostico-" + (d.id || "x") + "-texto",
          { headerNarrativePreferKey: "diagnosticoTexto" },
        );
        textoInp.addEventListener("input", () => scheduleAutosave());
        textoLbl.appendChild(textoInp);
        if (
          textoApplied &&
          textoApplied.counter &&
          !textoApplied.counter.isConnected
        ) {
          textoLbl.appendChild(textoApplied.counter);
        }

        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "pm-remove-diagnostico";
        btnRemove.textContent = "Remover";
        btnRemove.addEventListener("click", () => {
          row.remove();
          scheduleAutosave();
        });

        row.appendChild(dateLbl);
        row.appendChild(textoLbl);
        row.appendChild(btnRemove);
        root.appendChild(row);
      });
    }

    function writeHeaderToForm(header) {
      const h = header || {};
      const api = dateBrApi();
      const tpl = effectiveTemplate(getCurrentSnap());
      const fields = tpl
        ? tpl.fields.filter(
            (f) => f.section === "header" && f.visible !== false && f.kind !== "score"
          )
        : [];
      for (const f of fields) {
        if (f.widget === "cirurgias") {
          writeCirurgiasToForm(h.cirurgias);
          continue;
        }
        if (f.widget === "diagnosticos") {
          writeDiagnosticosToForm(h.diagnosticos);
          continue;
        }
        const el = headerForm.querySelector(`[data-pm-header="${f.key}"]`);
        if (!el) continue;
        let raw = "";
        if (f.kind === "custom" && h.custom) raw = h.custom[f.key] || "";
        else raw = h[f.key] || "";
        if (f.key === "dih" && api) {
          el.value = api.normalizeBrDateDisplay(raw);
        } else {
          el.value = raw;
        }
        refreshPmCharCounterForInput(el);
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
        refreshPmCharCounterForInput(poInp);
      });
    }

    function resolveScoreDisplay(entry, fieldDef, header) {
      const tpl = templateApi();
      if (!tpl || !tpl.resolveFieldDisplay) return "—";
      const out = tpl.resolveFieldDisplay(
        { header: header || {}, entry: entry || {} },
        fieldDef,
        { entry: entry, exams: getCurrentExamsRaw() }
      );
      return out && out.display != null ? String(out.display) : "—";
    }

    function entryTitle(index, entryData) {
      const internacao = window.AghuPassometroInternacao;
      const dih = (readHeaderFromForm().dih || "").trim();
      if (internacao && internacao.formatEntryTitle) {
        return internacao.formatEntryTitle(dih, entryData || "", index);
      }
      const dataTrim = (entryData || "").trim();
      const base = `Dia ${index + 1}`;
      return dataTrim ? `${base} — ${dataTrim}` : base;
    }

    function syncEntryTitlesFromHeader() {
      const cards = entriesRoot.querySelectorAll("[data-pm-entry-id]");
      cards.forEach((card, i) => {
        const title = card.querySelector("h3");
        const dataInp = card.querySelector('[data-pm-field="data"]');
        const dataVal = dataInp ? dataInp.value : "";
        if (title) title.textContent = entryTitle(i, dataVal);
      });
    }

    function renumberEntries() {
      syncEntryTitlesFromHeader();
    }

    function refreshEntryScores(card, tpl) {
      if (!card || !tpl) return;
      const header = readHeaderFromForm();
      card.querySelectorAll("[data-pm-score]").forEach((inp) => {
        const key = inp.getAttribute("data-pm-score");
        if (!key) return;
        const def = fieldDefFor(tpl, key);
        const entry = {};
        card.querySelectorAll("[data-pm-field]").forEach((el) => {
          const f = el.getAttribute("data-pm-field");
          if (f) entry[f] = el.value;
        });
        entry.id = card.getAttribute("data-pm-entry-id");
        inp.value = resolveScoreDisplay(entry, def, header);
      });
    }

    function bindHeaderDateFields() {
      attachBrDateInput(headerForm.querySelector('[data-pm-header="dih"]'), () =>
        syncEntryTitlesFromHeader()
      );
    }

    function addCirurgiaRow() {
      const root = headerForm.querySelector("[data-pm-cirurgias-list]");
      if (!root || !schema()) return;
      const id = schema().newEntryId();
      writeCirurgiasToForm([
        ...readCirurgiasFromForm(),
        { id: id, data: "", nome: "", descricao: "", equipe: "", achadosOperatorios: "" },
      ]);
      scheduleAutosave();
    }

    function addDiagnosticoRow() {
      const root = headerForm.querySelector("[data-pm-diagnosticos-list]");
      if (!root || !schema()) return;
      const id = schema().newEntryId();
      writeDiagnosticosToForm([
        ...readDiagnosticosFromForm(),
        { id: id, data: "", texto: "" },
      ]);
      scheduleAutosave();
    }

    function applyUserTemplate(nextTpl) {
      const tpl = templateApi();
      if (!tpl) return;
      const sanitized = tpl.sanitizeTemplate(nextTpl);
      setUserTemplate(sanitized);
      void saveUserTemplateRemote(sanitized);
      const header = readHeaderFromForm();
      const entries = collectEntriesFromDom();
      renderCustomizeFieldsList();
      renderHeaderForm(sanitized);
      writeHeaderToForm(header);
      renderEntries(entries, sanitized);
    }

    function renderCustomizeFieldsList() {
      if (!pmCustomFieldsList) return;
      const tpl = effectiveTemplate(getCurrentSnap());
      pmCustomFieldsList.replaceChildren();
      if (!tpl || !tpl.fields) return;
      const customLike = tpl.fields
        .filter((f) => f.kind === "custom" || f.kind === "score")
        .sort((a, b) => {
          const sa = a.section === "header" ? 0 : 1;
          const sb = b.section === "header" ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return String(a.label).localeCompare(String(b.label));
        });
      for (const f of customLike) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = f.label + (f.kind === "score" ? " (score)" : "");
        const meta = document.createElement("span");
        meta.className = "pm-custom-meta";
        meta.textContent = f.section === "header" ? "cabeçalho" : "controles";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Excluir";
        btn.addEventListener("click", () => {
          const api = templateApi();
          if (!api || !api.removeTemplateField) return;
          applyUserTemplate(api.removeTemplateField(tpl, f.key));
        });
        li.appendChild(label);
        li.appendChild(meta);
        li.appendChild(btn);
        pmCustomFieldsList.appendChild(li);
      }
    }

    function renderHeaderForm(tpl) {
      if (!headerForm || !tpl) return;
      headerForm.replaceChildren();
      const rows = tpl.headerRows || [];
      for (const row of rows) {
        const rowEl = document.createElement("div");
        rowEl.className = "pm-header-row";
        for (const cell of row) {
          if (!cell) continue;
          const def = fieldDefFor(tpl, cell.key);
          if (def.visible === false || def.kind === "score") continue;
          const label = document.createElement("label");
          if (cell.wide) label.className = "pm-wide";
          const span = document.createElement("span");
          span.textContent = cell.label;
          label.appendChild(span);
          if (def.widget === "cirurgias") {
            const list = document.createElement("div");
            list.className = "pm-cirurgias-list";
            list.setAttribute("data-pm-cirurgias-list", "1");
            label.appendChild(list);
            const btnAdd = document.createElement("button");
            btnAdd.type = "button";
            btnAdd.className = "pm-add-cirurgia";
            btnAdd.textContent = "Adicionar cirurgia";
            btnAdd.addEventListener("click", () => addCirurgiaRow());
            label.appendChild(btnAdd);
          } else if (def.widget === "diagnosticos") {
            const list = document.createElement("div");
            list.className = "pm-diagnosticos-list";
            list.setAttribute("data-pm-diagnosticos-list", "1");
            label.appendChild(list);
            const btnAdd = document.createElement("button");
            btnAdd.type = "button";
            btnAdd.className = "pm-add-diagnostico";
            btnAdd.textContent = "Adicionar diagnóstico";
            btnAdd.addEventListener("click", () => addDiagnosticoRow());
            label.appendChild(btnAdd);
          } else {
            const isTextarea = def.widget === "textarea";
            const inp = document.createElement(isTextarea ? "textarea" : "input");
            if (!isTextarea) inp.type = "text";
            inp.setAttribute("data-pm-header", cell.key);
            const applied = applyPmFieldLimit(inp, def, "pm-header");
            label.appendChild(inp);
            if (
              applied &&
              applied.counter &&
              !applied.counter.isConnected
            ) {
              label.appendChild(applied.counter);
            }
          }
          rowEl.appendChild(label);
        }
        headerForm.appendChild(rowEl);
      }
      bindHeaderDateFields();
    }

    function collectEntriesFromDom() {
      const tpl = effectiveTemplate(getCurrentSnap());
      const cards = entriesRoot.querySelectorAll("[data-pm-entry-id]");
      const entries = [];
      cards.forEach((card) => {
        const id = card.getAttribute("data-pm-entry-id");
        const entry = schema() ? schema().emptyEntry(id) : { id };
        const inputs = card.querySelectorAll("[data-pm-field]");
        inputs.forEach((inp) => {
          const f = inp.getAttribute("data-pm-field");
          if (!f) return;
          const def = fieldDefFor(tpl, f);
          if (def.kind === "custom") {
            if (!entry.custom) entry.custom = {};
            entry.custom[f] = inp.value;
          } else {
            entry[f] = inp.value;
          }
        });
        const touched = readVitalsTouchedFromCard(card);
        if (Object.keys(touched).length) entry.vitalsTouched = touched;
        entries.push(entry);
      });
      return entries;
    }

    function buildEntryCard(entry, index, tpl) {
      const template = tpl || effectiveTemplate(getCurrentSnap());
      const gridRows =
        template && template.entryRows
          ? template.entryRows
          : layout()?.GRID_ROWS || [];

      const article = document.createElement("article");
      article.className = "pm-entry-card";
      article.setAttribute("data-pm-entry-id", entry.id);
      if (entry.vitalsTouched && Object.keys(entry.vitalsTouched).length) {
        article.setAttribute(
          "data-pm-vitals-touched",
          JSON.stringify(entry.vitalsTouched),
        );
      }

      const head = document.createElement("div");
      head.className = "pm-entry-head";
      const title = document.createElement("h3");
      title.textContent = entryTitle(index, entry.data);
      head.appendChild(title);

      const dateLbl = document.createElement("label");
      dateLbl.className = "pm-entry-date";
      const dateSpan = document.createElement("span");
      dateSpan.textContent = "Data";
      dateLbl.appendChild(dateSpan);
      const dataInp = document.createElement("input");
      dataInp.type = "text";
      dataInp.setAttribute("data-pm-field", "data");
      const api = dateBrApi();
      if (api) {
        dataInp.value = api.normalizeBrDateDisplay(entry.data || "");
        attachBrDateInput(dataInp, () => {
          title.textContent = entryTitle(index, dataInp.value);
          syncPoFromHeaderToEntries();
          refreshEntryScores(article, template);
        });
      } else {
        dataInp.value = entry.data || "";
        dataInp.addEventListener("input", () => {
          refreshEntryScores(article, template);
          scheduleAutosave();
        });
      }
      dateLbl.appendChild(dataInp);
      head.appendChild(dateLbl);

      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "pm-remove";
      btnRemove.textContent = "Remover";
      btnRemove.addEventListener("click", () => {
        article.remove();
        renumberEntries();
        scheduleAutosave();
      });
      head.appendChild(btnRemove);
      article.appendChild(head);

      for (const row of gridRows) {
        const rowEl = document.createElement("div");
        rowEl.className = "pm-grid-row";
        for (const cell of row) {
          if (!cell || cell.key === "data") {
            if (!cell) {
              const sp = document.createElement("div");
              sp.className = "pm-grid-spacer";
              rowEl.appendChild(sp);
            }
            continue;
          }
          const field = cell.key;
          const label = cell.label;
          const span = cell.span;
          const def = fieldDefFor(template, field);
          if (def.visible === false) continue;

          const labelEl = document.createElement("label");
          if (span === 7) labelEl.className = "pm-grid-full";
          else if (span === 4) labelEl.className = "pm-grid-span-4";
          else if (span === 3) labelEl.className = "pm-grid-span-3";
          else if (span === 2) labelEl.className = "pm-grid-span-2";
          const spanLbl = document.createElement("span");
          spanLbl.className = "pm-grid-label";
          spanLbl.textContent = label;
          labelEl.appendChild(spanLbl);

          if (def.kind === "score") {
            const inp = document.createElement("input");
            inp.type = "text";
            inp.readOnly = true;
            inp.disabled = true;
            inp.setAttribute("data-pm-score", field);
            inp.value = resolveScoreDisplay(entry, def, readHeaderFromForm());
            labelEl.appendChild(inp);
          } else {
            const isTextarea =
              def.widget === "textarea" || field === "cd" || field === "pendencias";
            const inp = document.createElement(isTextarea ? "textarea" : "input");
            if (!isTextarea) inp.type = "text";
            inp.setAttribute("data-pm-field", field);
            inp.value = entry[field] || (entry.custom && entry.custom[field]) || "";
            const applied = applyPmFieldLimit(
              inp,
              def,
              "pm-entry-" + (entry.id || index),
              { entryRoot: article },
            );
            if (!applied && isTextarea) {
              inp.rows = field === "cd" ? 3 : 2;
            }
            if (applied && applied.shared && applied.refresh) {
              applied.refresh();
            } else if (applied && applied.counter && !applied.uncapped) {
              updatePmCharCounter(applied.counter, inp, applied.lim);
            }
            inp.addEventListener("input", () => {
              markVitalTouched(article, field);
              refreshEntryScores(article, template);
              if (applied && applied.shared && applied.refresh) applied.refresh();
              scheduleAutosave();
            });
            labelEl.appendChild(inp);
            if (applied && applied.counter) {
              if (applied.shared) {
                if (!applied.counter.parentElement) {
                  labelEl.appendChild(applied.counter);
                }
              } else {
                labelEl.appendChild(applied.counter);
              }
            }
          }
          rowEl.appendChild(labelEl);
        }
        article.appendChild(rowEl);
      }
      return article;
    }

    function renderEntries(entries, tpl) {
      const template = tpl || effectiveTemplate(getCurrentSnap());
      entriesRoot.replaceChildren();
      (entries || []).forEach((e, i) => {
        entriesRoot.appendChild(buildEntryCard(e, i, template));
      });
    }

    function renderExamsPreview(examsRaw) {
      setCurrentExamsRaw(examsRaw || null);
      if (!examsPreviewEl) return;
      const api = examsTableApi();
      if (!api || !api.buildExamsTableHtml) {
        examsPreviewEl.replaceChildren();
        return;
      }
      const domMount = globalThis.AghuDomMount;
      if (!examsRaw) {
        if (domMount) {
          domMount.mountEmptyMessage(
            examsPreviewEl,
            "pm-exams-preview-empty",
            "Nenhum exame sincronizado para este paciente."
          );
        } else {
          examsPreviewEl.replaceChildren();
        }
        return;
      }
      const html = api.buildExamsTableHtml(examsRaw, {
        title: "Exames (sincronizados)",
      });
      if (!html) {
        if (domMount) {
          domMount.mountEmptyMessage(
            examsPreviewEl,
            "pm-exams-preview-empty",
            "Nenhum exame sincronizado para este paciente."
          );
        } else {
          examsPreviewEl.replaceChildren();
        }
        return;
      }
      if (domMount) {
        domMount.mountHtmlFragment(examsPreviewEl, html);
      } else {
        examsPreviewEl.replaceChildren();
      }
    }

    function displaySnap(snap) {
      const normalized = schema() ? schema().normalizeSnap(snap) : snap;
      setCurrentSnap(normalized);
      const tpl = effectiveTemplate(normalized);
      renderHeaderForm(tpl);
      writeHeaderToForm(normalized.header);
      renderEntries(normalized.entries, tpl);
      if (metaEl) {
        metaEl.textContent = snap.atualizadoEm
          ? "Atualizado localmente: " + new Date(snap.atualizadoEm).toLocaleString("pt-BR")
          : "";
        metaEl.style.display = snap.atualizadoEm ? "block" : "none";
      }
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

    async function refreshPatientSelect(selectedKey) {
      if (!patientSel) return;
      const activeApi = root.AghuPopupActivePatient;
      if (activeApi && activeApi.refreshSelect) {
        await activeApi.refreshSelect(patientSel, {
          includeNew: true,
          selectedKey: selectedKey,
        });
        return;
      }
      if (!archive()) return;
      const entries = await archive().listForSelect();
      patientSel.replaceChildren();
      const optNew = document.createElement("option");
      optNew.value = "__new__";
      optNew.textContent = "— Novo paciente (manual) —";
      patientSel.appendChild(optNew);
      for (const e of entries) {
        const o = document.createElement("option");
        o.value = e.patientKey;
        o.textContent = `${e.primeiroNome || "?"} · ${e.prontuario || "?"}`;
        patientSel.appendChild(o);
      }
      if (selectedKey && entries.some((x) => x.patientKey === selectedKey)) {
        patientSel.value = selectedKey;
      } else {
        patientSel.value = "__new__";
      }
    }

    async function loadUserTemplate() {
      const tpl = templateApi();
      if (!tpl) return;
      setUserTemplate(tpl.DEFAULT_TEMPLATE);
      const prefs = window.AghuUserPreferencesClient;
      const cfg = window.AghuSupabaseConfig;
      if (
        !prefs ||
        !cfg ||
        typeof cfg.isConfigured !== "function" ||
        !cfg.isConfigured()
      ) {
        renderCustomizeFieldsList();
        return;
      }
      try {
        const data = await prefs.readUserPreferences(["passometro_template"]);
        const row = data && data.passometro_template;
        if (row && typeof row === "object" && row.template) {
          setUserTemplate(tpl.sanitizeTemplate(row.template));
        }
      } catch (_e) {
        /* ignore */
      }
      renderCustomizeFieldsList();
    }

    function handleAddCustomField() {
      const api = templateApi();
      if (!api || !pmCustomLabel) return;
      const label = (pmCustomLabel.value || "").trim();
      if (!label) return;
      const tpl = effectiveTemplate(getCurrentSnap());
      applyUserTemplate(
        api.addCustomField(tpl, {
          label: label,
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
      const tpl = effectiveTemplate(getCurrentSnap());
      applyUserTemplate(
        api.addScoreField(tpl, {
          scoreId: scoreId,
          label: (meta && meta.label) || scoreId.toUpperCase(),
          scoreParams: meta && meta.defaultParams ? meta.defaultParams : {},
        })
      );
    }

    function addDay() {
      const entry = schema() ? schema().emptyEntry() : { id: String(Date.now()), data: "" };
      const index = entriesRoot.querySelectorAll("[data-pm-entry-id]").length;
      const tpl = effectiveTemplate(getCurrentSnap());
      entriesRoot.appendChild(buildEntryCard(entry, index, tpl));
      scheduleAutosave();
    }

    return {
      readHeaderFromForm,
      writeHeaderToForm,
      collectEntriesFromDom,
      renderCustomizeFieldsList,
      renderHeaderForm,
      buildEntryCard,
      renderEntries,
      renderExamsPreview,
      displaySnap,
      populateScoreSelect,
      refreshPatientSelect,
      loadUserTemplate,
      handleAddCustomField,
      handleAddScoreField,
      addDay,
      bindHeaderDateFields,
    };
  }

  window.AghuPassometroPopupRender = { create };
})();
