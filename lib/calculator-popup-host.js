/**
 * Host dinâmico das calculadoras na popup (accordions + busca + draft).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCalculatorPopupHost = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function registry() {
    return (
      root.AghuCalculatorPopupRegistry ||
      require("./calculator-popup-registry.js")
    );
  }

  function searchIndex() {
    return (
      root.AghuCalculatorSearchIndex ||
      require("./calculator-search-index.js")
    );
  }

  function draftMod() {
    return (
      root.AghuCalculatorManualDraft ||
      require("./calculator-manual-draft.js")
    );
  }

  function shared() {
    return root.AghuCalculatorShared || require("./calculator-shared.js");
  }

  function ckd() {
    return root.AghuCkdEpiEgfr || require("./ckd-epi-egfr.js");
  }

  function domMount() {
    return root.AghuDomMount || null;
  }

  function mountHtml(container, html) {
    var mount = domMount();
    if (mount && typeof mount.mountHtmlFragment === "function") {
      mount.mountHtmlFragment(container, html);
      return;
    }
    container.replaceChildren();
    if (!html) return;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var nodes = doc.body.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      container.appendChild(nodes[i].cloneNode(true));
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSuggestedValue(field, suggested) {
    var v = suggested[field.suggestedKey || field.key];
    if (v == null || v === "") return "";
    if (field.type === "age") return String(Math.round(v));
    if (field.type === "select") return String(v);
    if (typeof v === "number") {
      return shared().formatDecimalPt(v);
    }
    return String(v);
  }

  function resolveFieldValue(field, draft, suggested) {
    var key = field.key;
    var dm = draftMod();
    if (field.type === "checkbox") {
      return dm.resolveBoolFromDraft(draft, key, false);
    }
    if (field.type === "select") {
      var sug =
        field.key === "sex"
          ? suggested.sex || suggested[field.suggestedKey]
          : suggested[field.suggestedKey || key];
      return dm.resolveSelectFromDraft(draft, key, sug);
    }
    if (field.type === "age") {
      var ageDraft = draft["touched_" + key]
        ? dm.parseManualAge(draft[key])
        : null;
      if (ageDraft != null) return ageDraft;
      var sugAge = suggested[field.suggestedKey || "ageYears"];
      if (sugAge != null) return sugAge;
      return dm.parseManualAge(draft[key]);
    }
    var sugNum = suggested[field.suggestedKey || key];
    return dm.resolveDecimalFromDraft(draft, key, sugNum);
  }

  function collectValues(def, draft, suggested) {
    var values = {};
    for (var i = 0; i < def.fields.length; i++) {
      var field = def.fields[i];
      values[field.key] = resolveFieldValue(field, draft, suggested);
    }
    return values;
  }

  function renderFieldHtml(def, field, draft, suggested) {
    var id = "calc-" + def.id + "-" + field.key;
    var dataLabel = field.dataLabelKey
      ? suggested[field.dataLabelKey]
      : null;
    var hint = dataLabel
      ? '<span class="calc-field-hint">Última: ' +
        escapeHtml(dataLabel) +
        "</span>"
      : "";

    if (field.type === "checkbox") {
      var checked = resolveFieldValue(field, draft, suggested);
      return (
        '<label class="calc-checkbox">' +
        '<input type="checkbox" id="' +
        id +
        '" data-calc-id="' +
        def.id +
        '" data-field="' +
        field.key +
        '"' +
        (checked ? " checked" : "") +
        " /> " +
        escapeHtml(field.label) +
        "</label>"
      );
    }

    if (field.type === "select") {
      var selVal = resolveFieldValue(field, draft, suggested) || "";
      var opts = (field.options || [])
        .map(function (o) {
          return (
            '<option value="' +
            escapeHtml(o.value) +
            '"' +
            (selVal === o.value ? " selected" : "") +
            ">" +
            escapeHtml(o.label) +
            "</option>"
          );
        })
        .join("");
      return (
        '<div class="calc-field">' +
        '<label for="' +
        id +
        '">' +
        escapeHtml(field.label) +
        "</label>" +
        hint +
        '<select id="' +
        id +
        '" data-calc-id="' +
        def.id +
        '" data-field="' +
        field.key +
        '">' +
        opts +
        "</select></div>"
      );
    }

    var displayVal = "";
    if (draft["touched_" + field.key] && draft[field.key] != null) {
      var touchedRaw = String(draft[field.key]).trim();
      displayVal =
        touchedRaw !== ""
          ? String(draft[field.key])
          : formatSuggestedValue(field, suggested);
    } else {
      displayVal = formatSuggestedValue(field, suggested);
    }

    var inputMode =
      field.type === "age" ? ' inputmode="numeric"' : ' inputmode="decimal"';

    return (
      '<div class="calc-field">' +
      '<label for="' +
      id +
      '">' +
      escapeHtml(field.label) +
      "</label>" +
      hint +
      '<input type="text" id="' +
      id +
      '" data-calc-id="' +
      def.id +
      '" data-field="' +
      field.key +
      '"' +
      inputMode +
      ' autocomplete="off" value="' +
      escapeHtml(displayVal) +
      '" /></div>'
    );
  }

  function renderAccordion(def, ctx, query) {
    try {
      var si = searchIndex();
      if (!si || typeof si.isCalculatorVisible !== "function") return null;
      if (!si.isCalculatorVisible(def.id, query)) return null;

      var reg = registry();
      var assessment = reg.buildContextAssessment(def, ctx);
      var suggested = assessment.suggested || {};
      var draft = draftMod().loadDraft(def.id, ctx.patientKey);
      var values = collectValues(def, draft, suggested);
      var result = def.compute(values, draft, assessment);
      var formatted = def.formatResult(result, assessment);

      var fieldsHtml = def.fields
        .map(function (f) {
          return renderFieldHtml(def, f, draft, suggested);
        })
        .join("");

      var hint = def.hint
        ? '<p class="calc-result-hint">' + escapeHtml(def.hint) + "</p>"
        : "";

      var resultCls = "calc-result " + (formatted.cls || "muted");
      var resultBody = formatted.html
        ? formatted.html
        : escapeHtml(formatted.text || "—");

      return (
        '<details class="calc-accordion" data-calc-id="' +
        def.id +
        '"' +
        (def.defaultOpen ? " open" : "") +
        ">" +
        "<summary>" +
        escapeHtml(def.title) +
        "</summary>" +
        '<div class="calc-accordion-body">' +
        hint +
        fieldsHtml +
        '<div class="' +
        resultCls +
        '" aria-live="polite">' +
        resultBody +
        "</div></div></details>"
      );
    } catch (_e) {
      return null;
    }
  }

  function applyFormattedResult(resultEl, formatted) {
    if (!resultEl || !formatted) return;
    resultEl.className = "calc-result " + (formatted.cls || "muted");
    if (formatted.html) {
      mountHtml(resultEl, formatted.html);
    } else {
      resultEl.textContent = formatted.text || "—";
    }
  }

  function refreshCalculatorResult(calcId) {
    var state = mountedState;
    if (!state || !state.mountEl) return;
    var reg = registry();
    var def = reg && reg.getDef ? reg.getDef(calcId) : null;
    if (!def) return;

    var accordion = state.mountEl.querySelector(
      'details.calc-accordion[data-calc-id="' + calcId + '"]',
    );
    if (!accordion) return;
    var resultEl = accordion.querySelector(".calc-result");
    if (!resultEl) return;

    var ctx = state.ctx || {};
    var assessment = reg.buildContextAssessment(def, ctx);
    var suggested = assessment.suggested || {};
    var draft = draftMod().loadDraft(def.id, ctx.patientKey);
    var values = collectValues(def, draft, suggested);
    var result = def.compute(values, draft, assessment);
    var formatted = def.formatResult(result, assessment);
    applyFormattedResult(resultEl, formatted);
  }

  function snapshotUiState(mountEl) {
    var openCalcIds = [];
    var focusState = null;
    if (!mountEl || typeof mountEl.querySelectorAll !== "function") {
      return { openCalcIds: openCalcIds, focusState: focusState };
    }
    var openEls = mountEl.querySelectorAll("details.calc-accordion[open]");
    for (var i = 0; i < openEls.length; i++) {
      var id = openEls[i].getAttribute("data-calc-id");
      if (id) openCalcIds.push(id);
    }
    var active = typeof document !== "undefined" ? document.activeElement : null;
    if (
      active &&
      active.dataset &&
      active.dataset.calcId &&
      mountEl.contains &&
      mountEl.contains(active)
    ) {
      focusState = {
        calcId: active.dataset.calcId,
        field: active.dataset.field,
        selectionStart:
          typeof active.selectionStart === "number"
            ? active.selectionStart
            : null,
        selectionEnd:
          typeof active.selectionEnd === "number" ? active.selectionEnd : null,
      };
    }
    return { openCalcIds: openCalcIds, focusState: focusState };
  }

  function restoreUiState(mountEl, snapshot) {
    if (!mountEl || !snapshot) return;
    var openCalcIds = snapshot.openCalcIds || [];
    for (var i = 0; i < openCalcIds.length; i++) {
      var el = mountEl.querySelector(
        'details.calc-accordion[data-calc-id="' + openCalcIds[i] + '"]',
      );
      if (el) el.setAttribute("open", "");
    }
    var focusState = snapshot.focusState;
    if (!focusState || !focusState.calcId || !focusState.field) return;
    var input = mountEl.querySelector(
      '[data-calc-id="' +
        focusState.calcId +
        '"][data-field="' +
        focusState.field +
        '"]',
    );
    if (!input || typeof input.focus !== "function") return;
    input.focus();
    if (
      focusState.selectionStart != null &&
      focusState.selectionEnd != null &&
      typeof input.setSelectionRange === "function"
    ) {
      try {
        input.setSelectionRange(
          focusState.selectionStart,
          focusState.selectionEnd,
        );
      } catch (_e) {
        /* select/checkbox */
      }
    }
  }

  function bindEvents(mountEl) {
    if (!mountEl) return;

    function onFieldEdit(ev) {
      var t = ev.target;
      if (!t || !t.dataset || !t.dataset.calcId) return;
      var state = mountedState;
      if (!state) return;
      var calcId = t.dataset.calcId;
      var field = t.dataset.field;
      var patch = { ["touched_" + field]: true };
      if (t.type === "checkbox") {
        patch[field] = t.checked;
      } else {
        patch[field] = t.value;
      }
      draftMod().patchDraft(calcId, state.ctx.patientKey, patch);
      refreshCalculatorResult(calcId);
    }

    mountEl.addEventListener("input", onFieldEdit);
    mountEl.addEventListener("change", onFieldEdit);
  }

  var mountedState = null;

  function mount(opts) {
    opts = opts || {};
    var mountEl = opts.mountEl;
    var searchEl = opts.searchEl;
    var ctx = opts.context || {};
    if (!mountEl) return;

    function render() {
      var reg = registry();
      var defs = reg && reg.DEFS ? reg.DEFS : [];
      var query = searchEl ? String(searchEl.value || "").trim() : "";
      var activeCtx =
        mountedState && mountedState.ctx ? mountedState.ctx : ctx;
      var snapshot = snapshotUiState(mountEl);
      var html = defs
        .map(function (def) {
          return renderAccordion(def, activeCtx, query);
        })
        .filter(Boolean)
        .join("");
      if (html) {
        mountHtml(mountEl, html);
      } else {
        var mount = domMount();
        if (mount && typeof mount.mountEmptyMessage === "function") {
          mount.mountEmptyMessage(mountEl, null, "Nenhuma calculadora encontrada.");
          var emptyEl = mountEl.firstElementChild;
          if (emptyEl) emptyEl.className = "calc-empty";
        } else {
          mountEl.replaceChildren();
          var p = document.createElement("p");
          p.className = "calc-empty";
          p.textContent = "Nenhuma calculadora encontrada.";
          mountEl.appendChild(p);
        }
      }
      restoreUiState(mountEl, snapshot);
    }

    if (
      mountedState &&
      mountedState.mountEl === mountEl &&
      mountedState.searchEl === searchEl
    ) {
      mountedState.ctx = ctx;
      mountedState.render = render;
      render();
      return;
    }

    mountedState = {
      mountEl: mountEl,
      searchEl: searchEl,
      ctx: ctx,
      render: render,
    };

    bindEvents(mountEl);

    if (searchEl) {
      searchEl.addEventListener("input", render);
      searchEl.addEventListener("search", render);
    }

    render();
  }

  return {
    mount: mount,
    renderAccordion: renderAccordion,
    collectValues: collectValues,
    refreshCalculatorResult: refreshCalculatorResult,
  };
});
