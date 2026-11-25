/**
 * Navegação automática na casca AGHU (POL / Controles / Prescrições).
 * Sem login/senha. Mensagens: action === "aghuCascaNav".
 * PM1C-AC-05..07, PM1C-AC-10, PM1C-AC-13..16 (padrão humano).
 */
(function () {
  "use strict";

  /** Bump quando a lógica de nav mudar — evita listener duplicado na mesma revisão. */
  var CASCA_NAV_REV = 5;
  if (typeof window !== "undefined") {
    var cascaNavRuntimeId =
      typeof browser !== "undefined" &&
      browser.runtime &&
      browser.runtime.id
        ? String(browser.runtime.id)
        : "";
    var prevCascaNavRev = window.__AGHU_CASCA_NAV_REV__;
    var prevCascaNavRuntime = window.__AGHU_CASCA_NAV_RUNTIME__ || "";
    if (
      prevCascaNavRev >= CASCA_NAV_REV &&
      prevCascaNavRuntime === cascaNavRuntimeId &&
      cascaNavRuntimeId
    ) {
      return;
    }
    window.__AGHU_CASCA_NAV_REV__ = CASCA_NAV_REV;
    window.__AGHU_CASCA_NAV_RUNTIME__ = cascaNavRuntimeId;
  }

  var DEFAULT_TIMEOUT_MS = 20000;
  var POLL_MS = 250;
  var GATE_TIMEOUT_MS = 8000;
  var SETTLE_MS = 800;
  var MENU_SETTLE_MS = 350;
  /** Wait Processando/Carregando após Limpar/select/Pesquisar/Hídrico (FEAT-070). */
  var AJAX_IDLE_TIMEOUT_MS = 12000;
  /** Recover verificado (close+reopen / re-fill) — máx. 1× por subpasso (padrão humano). */
  var MAX_STEP_RECOVER = 1;
  /** Intervalo entre leituras consecutivas do fingerprint Liberados (estabilização). */
  var LIBERADOS_STABILIZE_MS = 250;
  /** Último fingerprint Liberados OK nesta sessão (anti-leak entre prontuários do lote). */
  var _lastLiberadosFp = "";

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function now() {
    return Date.now();
  }

  function digitsOnly(raw) {
    return String(raw == null ? "" : raw).replace(/\D/g, "");
  }

  function normalizeProntuarioDigits(raw) {
    var d = digitsOnly(raw);
    return d.replace(/^0+/, "") || d;
  }

  function setNativeValue(el, value) {
    if (!el) return;
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }));
  }

  function clickEl(el) {
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Clica o primeiro botão/elemento visível entre seletores (id ou CSS).
   * clickEl + onclick no page-context (PrimeFaces sgClear / Xray).
   * Não exige bounding box > 0 (JSDOM / layout zero).
   * @param {Document} doc
   * @param {string|string[]} selectors
   * @returns {boolean}
   */
  function clickClearInDoc(doc, selectors) {
    if (!doc) return false;
    var list = Array.isArray(selectors) ? selectors : [selectors];
    for (var i = 0; i < list.length; i++) {
      var sel = String(list[i] || "").trim();
      if (!sel) continue;
      var el = null;
      try {
        if (sel.charAt(0) === "#" || sel.indexOf("[") !== -1 || sel.indexOf(" ") !== -1) {
          el = doc.querySelector(sel);
        } else {
          el = doc.getElementById(sel) || doc.querySelector(sel);
        }
      } catch (_e) {
        try {
          el = doc.getElementById(sel);
        } catch (_e2) {}
      }
      if (!el) continue;
      try {
        var style = (el.ownerDocument && el.ownerDocument.defaultView
          ? el.ownerDocument.defaultView
          : window
        ).getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
      } catch (_eVis) {}

      // Uma ação: se há onclick, só re-eval page-context (não empilhar click+onclick).
      // JSDOM: el.click() não dispara atributo onclick — re-eval é o caminho autoritativo.
      var onclick = null;
      try {
        onclick = el.getAttribute ? el.getAttribute("onclick") : null;
      } catch (_e3) {}
      if (onclick) {
        try {
          var view = getDocWindow(doc);
          if (view) {
            var Fn = view.Function || Function;
            var pageEl = unwrapElement(el);
            // Injeta document do iframe — new Function() sem args não vê document (JSDOM/Xray).
            var fn = new Fn("document", String(onclick));
            fn.call(pageEl || el, doc);
            return true;
          }
        } catch (_e4) {}
      }
      if (clickEl(el)) return true;
    }
    return false;
  }

  /**
   * Padrão humano: uma ação → wait/verify → recover 1× → wait/verify → fail-soft.
   * @param {{act?:Function, isOk:Function, recover?:Function, waitMs?:number, error?:string}} opts
   * @returns {Promise<{ok:boolean, recovered?:boolean, error?:string}>}
   */
  async function runHumanStep(opts) {
    opts = opts || {};
    var waitMs =
      opts.waitMs != null ? opts.waitMs : Math.max(SETTLE_MS * 3, 400);
    var errorMsg = opts.error || "Passo de navegação falhou.";

    if (typeof opts.act === "function") {
      await opts.act();
    }

    var ok = false;
    if (typeof opts.isOk === "function") {
      ok = await softWaitUntil(opts.isOk, waitMs);
    }
    if (ok) return { ok: true };

    if (typeof opts.recover === "function") {
      await opts.recover();
      if (typeof opts.isOk === "function") {
        ok = await softWaitUntil(opts.isOk, waitMs);
      }
      if (ok) return { ok: true, recovered: true };
    }

    return { ok: false, error: errorMsg };
  }

  /**
   * Fecha aba casca pelo título e reabre via reopenFn (addTab/menu).
   * @param {string|string[]} titleHints
   * @param {Function} reopenFn
   * @returns {Promise<{ok:boolean}>}
   */
  async function closeAndReopenCascaTab(titleHints, reopenFn) {
    closeCascaTabByTitle(titleHints);
    await sleep(MENU_SETTLE_MS);
    if (typeof reopenFn === "function") {
      try {
        await reopenFn();
      } catch (_eReopen) {
        // Soft: iframe/menu pode já existir (fixtures / aba residual).
      }
    }
    await sleep(SETTLE_MS);
    return { ok: true };
  }

  /** Soft: espera checkFn() até timeout; não lança. */
  async function softWaitUntil(checkFn, timeoutMs) {
    var deadline = now() + (timeoutMs != null ? timeoutMs : Math.max(SETTLE_MS * 3, 400));
    while (now() < deadline) {
      try {
        if (checkFn()) return true;
      } catch (_e) {}
      await sleep(POLL_MS);
    }
    return false;
  }

  /** Firefox Xray: window da página; Chrome/Node = window. */
  function getPageWindow() {
    try {
      if (typeof window !== "undefined" && window.wrappedJSObject) {
        return window.wrappedJSObject;
      }
    } catch (_e) {}
    return typeof window !== "undefined" ? window : null;
  }

  /**
   * Window do document (iframe ou top), unwrapped para PF/PrimeFaces.
   * Espelha getPageWindow com defaultView do doc.
   */
  function getDocWindow(doc) {
    if (!doc) return getPageWindow();
    var view = null;
    try {
      view = doc.defaultView || null;
    } catch (_e) {}
    if (!view) return getPageWindow();
    try {
      if (view.wrappedJSObject) return view.wrappedJSObject;
    } catch (_e2) {}
    return view;
  }

  /**
   * Executa sourceFn no page context do doc (Xray-safe via win.Function).
   * sourceFn deve ser uma função cujo toString() é serializável (sem closures).
   * this === window do doc (PrimeFaces / PF via this.PrimeFaces).
   * @returns {*} retorno de sourceFn(...args) ou undefined
   */
  function runInDocWindow(doc, sourceFn, args) {
    var win = getDocWindow(doc);
    if (!win || typeof sourceFn !== "function") return undefined;
    var argList = Array.isArray(args) ? args : [];
    try {
      var Fn = win.Function || Function;
      var runner = new Fn(
        "fnSource",
        "argsJson",
        "var fn = (0, eval)('(' + fnSource + ')'); return fn.apply(this, JSON.parse(argsJson));"
      );
      return runner.call(win, String(sourceFn), JSON.stringify(argList));
    } catch (_e) {
      try {
        return sourceFn.apply(win, argList);
      } catch (_e2) {
        return undefined;
      }
    }
  }

  function unwrapElement(el) {
    if (!el) return null;
    try {
      if (el.wrappedJSObject) return el.wrappedJSObject;
    } catch (_e) {}
    return el;
  }

  /** Fallback HUCAM: update de panelPesq + panels de Consultar (sem botão Pesquisar). */
  var PESQ_PACIENTE_AB_U_FALLBACK =
    "pesqPaciente:pesqPaciente:panelPesq @(#prescricaoDecorate) @(#atendimentoDecorate) @(#panelPrescricao) @(#outPanelAtendimentosModal) @(#outPanelAtendimentosModalContent)";

  /** Controles HUCAM: Limpar pesquisa — args iguais ao onclick de #bt_limparPesquisa:button. */
  var CONTROLES_LIMPAR_AB_S = "bt_limparPesquisa:button";
  var CONTROLES_LIMPAR_AB_U = "@(#panelPesquisa) @(#panelAbasExterno)";

  /**
   * Extrai args string de tab.addTab('a','b',...) no onclick.
   * @returns {string[]|null}
   */
  function parseAddTabArgs(onclickStr) {
    var raw = String(onclickStr || "");
    var m = raw.match(/tab\.addTab\s*\(([\s\S]*?)\)\s*(?:;|$)/);
    if (!m) return null;
    var args = [];
    var re = /'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g;
    var hit;
    while ((hit = re.exec(m[1]))) {
      args.push(hit[1] != null ? hit[1] : hit[2]);
    }
    return args.length ? args : null;
  }

  /**
   * Executa o onclick da casca (tab.addTab + selecionarIdFavorito).
   * a.click()/clickEl NÃO abre Controles/Rx no AGHU real — precisa do handler.
   * @returns {boolean}
   */
  function invokeCascaOnclick(el) {
    if (!el) return false;
    var pageWin = getPageWindow();
    var pageEl = unwrapElement(el);
    var onclick = null;
    try {
      onclick = el.getAttribute ? el.getAttribute("onclick") : null;
    } catch (_e) {}
    if (!onclick && pageEl && pageEl.getAttribute) {
      try {
        onclick = pageEl.getAttribute("onclick");
      } catch (_e2) {}
    }

    if (onclick && pageWin) {
      try {
        var Fn = pageWin.Function || Function;
        var fn = new Fn(String(onclick));
        fn.call(pageEl || el);
        return true;
      } catch (_e3) {
        try {
          var args = parseAddTabArgs(onclick);
          if (
            args &&
            pageWin.tab &&
            typeof pageWin.tab.addTab === "function"
          ) {
            pageWin.tab.addTab.apply(pageWin.tab, args);
            return true;
          }
        } catch (_e4) {}
      }
    }

    // Fallback: click no anchor; span só se click falhou (não empilhar).
    if (clickEl(el)) return true;
    try {
      var span =
        (el.querySelector && el.querySelector("span.menu-text")) ||
        (pageEl && pageEl.querySelector && pageEl.querySelector("span.menu-text"));
      if (span) {
        var view = pageWin || window;
        span.dispatchEvent(
          new view.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: view,
          })
        );
        return true;
      }
    } catch (_e5) {}
    return false;
  }

  /**
   * Se o link addTab estiver oculto, abre cadeia de LI ancestrais (menus).
   */
  function expandCascaMenuAncestors(el) {
    if (!el || visible(el)) return;
    var host = el.parentElement;
    for (var depth = 0; host && depth < 8; depth++) {
      var tag = String(host.tagName || "").toUpperCase();
      if (tag === "LI") {
        try {
          if (host.classList && !host.classList.contains("open")) {
            host.classList.add("open");
          }
        } catch (_e) {}
        var toggle = null;
        try {
          toggle =
            host.querySelector(":scope > a:not(.divLink), :scope > span, :scope > .menu-toggle") ||
            host.firstElementChild;
        } catch (_e2) {
          toggle = host.firstElementChild;
        }
        if (toggle && toggle !== el && !toggle.contains(el)) {
          clickEl(toggle);
        }
      }
      host = host.parentElement;
    }
  }

  async function invokeAddTabLink(link) {
    if (!link) return false;
    if (!visible(link)) {
      expandCascaMenuAncestors(link);
      await sleep(MENU_SETTLE_MS);
    }
    return invokeCascaOnclick(link);
  }

  function visible(el) {
    if (!el) return false;
    try {
      var style = (el.ownerDocument && el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView
        : window
      ).getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch (_e) {
      return true;
    }
    var r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  function textOf(el) {
    return String((el && (el.textContent || el.innerText)) || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findByIdEndsWith(suffix, root) {
    root = root || document;
    try {
      var el = root.querySelector('[id$="' + suffix + '"]');
      if (el) return el;
    } catch (_e) {}
    return null;
  }

  function findByIdIncludes(part, root) {
    root = root || document;
    var all = root.querySelectorAll("[id]");
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id).indexOf(part) !== -1) return all[i];
    }
    return null;
  }

  async function waitFor(fn, timeoutMs, label) {
    var deadline = now() + (timeoutMs || DEFAULT_TIMEOUT_MS);
    while (now() < deadline) {
      var hit = fn();
      if (hit) return hit;
      await sleep(POLL_MS);
    }
    throw new Error(
      (label || "Elemento") +
        " não apareceu a tempo. Confirme o login no AGHU e tente de novo."
    );
  }

  /** priceFormat HUCAM: NNNNNNN/N (barra), não hífen. */
  function formatPolProntuario(raw) {
    var digits = digitsOnly(raw);
    if (!digits) return "";
    if (digits.length < 2) return digits;
    return digits.slice(0, -1) + "/" + digits.slice(-1);
  }

  /**
   * Localiza iframe por id/name/src (hints case-insensitive).
   * @param {string|string[]} hints
   * @returns {HTMLIFrameElement|null}
   */
  function findFrameByHints(hints) {
    var list = Array.isArray(hints) ? hints : [hints];
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var id = String(f.id || "").toLowerCase();
      var name = String(f.name || "").toLowerCase();
      var src = String(f.getAttribute("src") || "").toLowerCase();
      for (var h = 0; h < list.length; h++) {
        var hint = String(list[h] || "").toLowerCase();
        if (!hint) continue;
        if (
          id.indexOf(hint) !== -1 ||
          name.indexOf(hint) !== -1 ||
          src.indexOf(hint) !== -1
        ) {
          return f;
        }
      }
    }
    return null;
  }

  /**
   * Iframe cujo id/name/src casa hints E doc tem campo (preferir visível).
   * @param {string|string[]} hints
   * @param {(doc: Document) => Element|null} fieldFn
   * @returns {{ frame: HTMLIFrameElement, doc: Document }|null}
   */
  function findFrameWithField(hints, fieldFn) {
    var list = Array.isArray(hints) ? hints : [hints];
    var frames = document.querySelectorAll("iframe");
    var visibleHit = null;
    var anyHit = null;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var id = String(f.id || "").toLowerCase();
      var name = String(f.name || "").toLowerCase();
      var src = String(f.getAttribute("src") || "").toLowerCase();
      var matched = false;
      for (var h = 0; h < list.length; h++) {
        var hint = String(list[h] || "").toLowerCase();
        if (!hint) continue;
        if (
          id.indexOf(hint) !== -1 ||
          name.indexOf(hint) !== -1 ||
          src.indexOf(hint) !== -1
        ) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      var doc = frameDoc(f);
      if (!doc || typeof fieldFn !== "function" || !fieldFn(doc)) continue;
      var hit = { frame: f, doc: doc };
      anyHit = hit;
      try {
        if (f.offsetWidth > 0 || f.offsetHeight > 0) {
          visibleHit = hit;
          break;
        }
      } catch (_eVis) {}
    }
    return visibleHit || anyHit;
  }

  function frameDoc(frame) {
    if (!frame) return null;
    try {
      return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document) || null;
    } catch (_e) {
      return null;
    }
  }

  async function waitForFrameDoc(hints, timeoutMs) {
    var label = Array.isArray(hints) ? hints[0] : hints;
    return waitFor(
      function () {
        var frame = findFrameByHints(hints);
        if (!frame) return null;
        var doc = frameDoc(frame);
        if (doc && doc.body) return { frame: frame, doc: doc };
        return null;
      },
      timeoutMs || DEFAULT_TIMEOUT_MS,
      "Iframe " + (label || "")
    );
  }

  /**
   * querySelector no primeiro doc que tiver match (iframe + top para painéis).
   * @param {string} selector
   * @param {Document[]} docs
   * @returns {{ el: Element, doc: Document }|null}
   */
  function queryInDocs(selector, docs) {
    var list = docs && docs.length ? docs : [document];
    for (var i = 0; i < list.length; i++) {
      var doc = list[i];
      if (!doc || !doc.querySelector) continue;
      try {
        var el = doc.querySelector(selector);
        if (el) return { el: el, doc: doc };
      } catch (_e) {}
    }
    return null;
  }

  function docsForFrame(frame) {
    var docs = [];
    var doc = frameDoc(frame);
    if (doc) docs.push(doc);
    docs.push(document);
    return docs;
  }

  /**
   * Firefox Xray: Element recriado por AJAX (sgClear/Limpar) vira "dead object".
   * Document do iframe pode sobreviver — sempre reconsultar contentDocument.
   */
  function isLiveNode(el) {
    if (!el) return false;
    try {
      void el.nodeType;
      void el.ownerDocument;
      return true;
    } catch (_e) {
      return false;
    }
  }

  function isDeadObjectError(err) {
    var msg = (err && err.message) || String(err || "");
    return /dead object/i.test(msg);
  }

  /** Sempre ler contentDocument atual do iframe (pós-clear AJAX). */
  function refreshFrameContext(frame) {
    return {
      doc: frameDoc(frame),
      docs: docsForFrame(frame),
    };
  }

  function deadObjectUserError(domainLabel) {
    return (
      "DOM " +
      domainLabel +
      " atualizado após Limpar — tente de novo"
    );
  }

  /**
   * Fonte da verdade: h3.accordion-tab-pol.ui-state-active (textContent),
   * nunca o primeiro h3 inativo nem o title (só nome).
   */
  function readActivePolProntuarioDigits() {
    var active = document.querySelector(
      "h3.accordion-tab-pol.ui-state-active"
    );
    if (!active) return "";
    return digitsOnly(active.textContent || active.innerText || "");
  }

  /**
   * Gate: POL ativo == prontuário pesquisado.
   * @returns {Promise<{ok:boolean, active:string, error?:string}>}
   */
  async function waitForCascaProntuario(expected, timeoutMs) {
    var want = normalizeProntuarioDigits(expected);
    if (!want) {
      return { ok: false, active: "", error: "Prontuário vazio para gate POL." };
    }
    var deadline = now() + (timeoutMs != null ? timeoutMs : GATE_TIMEOUT_MS);
    var lastActive = "";
    while (now() < deadline) {
      var active = readActivePolProntuarioDigits();
      if (active) {
        lastActive = active;
        if (normalizeProntuarioDigits(active) === want) {
          return { ok: true, active: active };
        }
      }
      await sleep(POLL_MS);
    }
    var finalActive = lastActive || readActivePolProntuarioDigits() || "";
    return {
      ok: false,
      active: finalActive,
      error:
        "AGHU não selecionou o prontuário " +
        want +
        " (ativo: " +
        (finalActive || "nenhum") +
        ")",
    };
  }

  /** Reativa aba casca pelo título se já existir. */
  function tryActivateCascaTab(titleHints) {
    var hints = Array.isArray(titleHints) ? titleHints : [titleHints];

    // HUCAM: abas reais em #casca_tabs ul.tabs (não .ui-tabs-nav do menu).
    var li = findCascaTabLiByTitle(hints);
    if (li) {
      var inner = null;
      try {
        inner = li.querySelector("a.tabs-inner, .tabs-inner, a.ui-tabs-anchor");
      } catch (_eLi) {}
      if (inner && clickEl(inner)) return true;
      if (clickEl(li)) return true;
    }

    var tabs = document.querySelectorAll(
      ".ui-tabs-nav li a, .ui-tabs-nav a, [role='tab'], .casca-aba, a.ui-tabs-anchor"
    );
    for (var i = 0; i < tabs.length; i++) {
      var t = textOf(tabs[i]).toLowerCase();
      for (var h = 0; h < hints.length; h++) {
        var hint = String(hints[h] || "").toLowerCase();
        if (hint && t.indexOf(hint) !== -1) {
          clickEl(tabs[i]);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Título da aba casca (#casca_tabs ul.tabs > li): .tabs-title / .tabs-inner.
   * @param {Element} li
   * @returns {string}
   */
  function cascaTabLiTitle(li) {
    if (!li) return "";
    var titleEl = null;
    try {
      titleEl =
        li.querySelector(".tabs-title") ||
        li.querySelector("a.tabs-inner, .tabs-inner, span.tabs-title");
    } catch (_e) {}
    if (titleEl) return textOf(titleEl);
    // Sem close no texto: clonar sem a.tabs-close
    try {
      var clone = li.cloneNode(true);
      var closes = clone.querySelectorAll
        ? clone.querySelectorAll("a.tabs-close, .tabs-close")
        : [];
      for (var c = 0; c < closes.length; c++) {
        if (closes[c].parentNode) closes[c].parentNode.removeChild(closes[c]);
      }
      return textOf(clone);
    } catch (_e2) {
      return textOf(li);
    }
  }

  /**
   * ul.tabs > li cujo título casa com algum hint (case-insensitive, substring).
   * @param {string|string[]} hints
   * @returns {Element|null}
   */
  function findCascaTabLiByTitle(hints) {
    var list = Array.isArray(hints) ? hints : [hints];
    var root =
      document.querySelector("#casca_tabs ul.tabs") ||
      document.querySelector("#casca_tabs .tabs") ||
      document.querySelector("ul.tabs");
    if (!root) return null;
    var items = [];
    try {
      items = root.querySelectorAll(":scope > li");
    } catch (_e) {
      items = root.children || [];
    }
    if (!items.length && root.children) {
      items = [];
      for (var ch = 0; ch < root.children.length; ch++) {
        if (String(root.children[ch].tagName || "").toUpperCase() === "LI") {
          items.push(root.children[ch]);
        }
      }
    }
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var t = cascaTabLiTitle(li).toLowerCase();
      if (!t) continue;
      for (var h = 0; h < list.length; h++) {
        var hint = String(list[h] || "").toLowerCase();
        if (hint && t.indexOf(hint) !== -1) return li;
      }
    }
    return null;
  }

  /**
   * Fecha aba casca pelo título via a.tabs-close (soft se já fechada).
   * @param {string|string[]} hints
   * @returns {{ok:boolean, closed?:boolean, skipped?:boolean}}
   */
  function closeCascaTabByTitle(hints) {
    var li = findCascaTabLiByTitle(hints);
    if (!li) return { ok: true, skipped: true };
    var closeBtn = null;
    try {
      closeBtn =
        li.querySelector("a.tabs-close") ||
        li.querySelector(".tabs-close") ||
        li.querySelector("a[class*='tabs-close']");
    } catch (_e) {}
    if (!closeBtn) return { ok: true, skipped: true };

    var clicked = clickEl(closeBtn);

    var onclick = null;
    try {
      onclick = closeBtn.getAttribute ? closeBtn.getAttribute("onclick") : null;
    } catch (_e2) {}
    if (onclick) {
      try {
        var view = getPageWindow() || window;
        var Fn = view.Function || Function;
        var pageEl = unwrapElement(closeBtn);
        var fn = new Fn(String(onclick));
        fn.call(pageEl || closeBtn);
        clicked = true;
      } catch (_e3) {}
    }

    if (!clicked) {
      try {
        var view2 = getPageWindow() || window;
        closeBtn.dispatchEvent(
          new view2.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: view2,
          })
        );
        clicked = true;
      } catch (_e4) {}
    }
    return { ok: true, closed: !!clicked };
  }

  /**
   * Fecha Prescrições Médicas e Visualizar Controles (nessa ordem).
   * Nunca fecha Painel Geral nem POL. Soft se abas ausentes.
   * @returns {Promise<{ok:boolean, closed?:string[]}>}
   */
  async function closeControlesPrescricoesTabs() {
    var closed = [];
    var rx = closeCascaTabByTitle([
      "prescrições médicas",
      "prescricoes medicas",
      "prescrições medicas",
    ]);
    if (rx && rx.closed) closed.push("prescricoes");
    await sleep(MENU_SETTLE_MS);
    var ctrl = closeCascaTabByTitle([
      "visualizar controles",
      "controles do paciente",
    ]);
    if (ctrl && ctrl.closed) closed.push("controles");
    await sleep(MENU_SETTLE_MS);
    return { ok: true, closed: closed };
  }

  function findMenuItemByText(labels, root) {
    root = root || document;
    var list = Array.isArray(labels) ? labels : [labels];
    var candidates = root.querySelectorAll("a, span, li, td, div, button");
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!visible(el) && el.tagName !== "A") continue;
      var t = textOf(el).toLowerCase();
      if (!t || t.length > 80) continue;
      for (var j = 0; j < list.length; j++) {
        var lab = String(list[j] || "").toLowerCase();
        if (lab && t === lab) return el;
      }
    }
    for (var k = 0; k < candidates.length; k++) {
      var el2 = candidates[k];
      var t2 = textOf(el2).toLowerCase();
      if (!t2 || t2.length > 80) continue;
      for (var m = 0; m < list.length; m++) {
        var lab2 = String(list[m] || "").toLowerCase();
        if (lab2 && t2.indexOf(lab2) !== -1) return el2;
      }
    }
    return null;
  }

  /**
   * Preferir a.divLink / a[onclick*=addTab] cujo onclick/href contém path xhtml.
   * HUCAM: LI/span tem o texto, mas só o anchor dispara tab.addTab.
   * @param {string|string[]} pathHints
   * @returns {HTMLAnchorElement|null}
   */
  function findCascaAddTabLink(pathHints) {
    var list = Array.isArray(pathHints) ? pathHints : [pathHints];
    var candidates = document.querySelectorAll(
      'a.divLink, a[onclick*="addTab"], a[onclick*="tab.addTab"]'
    );
    for (var i = 0; i < candidates.length; i++) {
      var a = candidates[i];
      var blob = (
        String(a.getAttribute("onclick") || "") +
        " " +
        String(a.getAttribute("href") || "")
      ).toLowerCase();
      for (var h = 0; h < list.length; h++) {
        var hint = String(list[h] || "").toLowerCase();
        if (hint && blob.indexOf(hint) !== -1) return a;
      }
    }
    return null;
  }

  /** Se hit for SPAN/LI, sobe para o a.divLink / addTab mais próximo. */
  function resolveCascaMenuClickTarget(el) {
    if (!el) return null;
    var tag = String(el.tagName || "").toUpperCase();
    if (tag === "A") return el;
    try {
      var link = el.closest
        ? el.closest("a.divLink, a[onclick*='addTab'], a[onclick*='tab.addTab']")
        : null;
      if (link) return link;
      // SPAN irmão do <a> dentro do LI (padrão HUCAM)
      var host = el;
      for (var up = 0; up < 4 && host; up++) {
        if (host.querySelector) {
          var nested = host.querySelector(
            "a.divLink, a[onclick*='addTab'], a[onclick*='tab.addTab']"
          );
          if (nested) return nested;
        }
        host = host.parentElement;
      }
    } catch (_e) {}
    return el;
  }

  /**
   * Espera iframe do módulo E um campo obrigatório no contentDocument
   * (sem fallback silencioso ao document top).
   * Usa findFrameWithField (hint+campo, preferir visível) — não o 1º iframe
   * por hint (ex. Manter vazio antes de Consultar com pesqPaciente).
   */
  async function waitForFrameField(frameHints, fieldFn, label, timeoutMs) {
    return waitFor(
      function () {
        var hit = findFrameWithField(frameHints, fieldFn);
        if (!hit || !hit.doc || !hit.doc.body) return null;
        var field = fieldFn(hit.doc);
        if (!field) return null;
        return { frame: hit.frame, doc: hit.doc, field: field };
      },
      timeoutMs || DEFAULT_TIMEOUT_MS,
      label
    );
  }

  async function openMenuPath(steps) {
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var el = findMenuItemByText(step);
      if (!el) {
        throw new Error(
          'Menu "' +
            (Array.isArray(step) ? step[0] : step) +
            '" não encontrado. Abra a casca AGHU autenticada.'
        );
      }
      var target = resolveCascaMenuClickTarget(el);
      if (!visible(target)) {
        expandCascaMenuAncestors(target);
        await sleep(MENU_SETTLE_MS);
      }
      invokeCascaOnclick(target);
      await sleep(MENU_SETTLE_MS + Math.floor(Math.random() * Math.min(80, MENU_SETTLE_MS)));
    }
  }

  /**
   * Abre POL com cascade single-fire: openPOL → wait; só então change+blur; só então ab.
   * PM1C-AC-13.
   * @param {HTMLInputElement} input
   * @returns {Promise<boolean>} true se árvore/frame apareceu
   */
  async function triggerPolOpen(input) {
    function polTreeOrFrameVisible() {
      return !!(
        document.querySelector("a.node-link-pol") ||
        document.querySelector("h3.accordion-tab-pol") ||
        document.getElementById("frame_pol") ||
        document.querySelector('iframe[id*="frame_pol"]')
      );
    }

    var waitTreeMs = Math.min(12000, DEFAULT_TIMEOUT_MS);

    // 1) Preferir openPOL(true)
    try {
      var pageWin = getPageWindow();
      if (pageWin && pageWin.tab && typeof pageWin.tab.openPOL === "function") {
        pageWin.tab.openPOL(true);
      } else if (
        typeof tab !== "undefined" &&
        tab &&
        typeof tab.openPOL === "function"
      ) {
        tab.openPOL(true);
      }
    } catch (_e) {}
    if (await softWaitUntil(polTreeOrFrameVisible, waitTreeMs)) return true;

    // 2) Fallback: change + blur
    if (input) {
      try {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      } catch (_e2) {}
    }
    if (await softWaitUntil(polTreeOrFrameVisible, waitTreeMs)) return true;

    // 3) Fallback: PrimeFaces.ab
    try {
      var win = getPageWindow() || window;
      if (win.PrimeFaces && typeof win.PrimeFaces.ab === "function") {
        win.PrimeFaces.ab({
          s: (input && input.id) || "prontuarioInput",
          p: "change",
        });
      }
    } catch (_e3) {}
    return softWaitUntil(polTreeOrFrameVisible, waitTreeMs);
  }

  /** @deprecated Preferir triggerPolOpen (cascade single-fire). Mantido p/ API testes. */
  function triggerPolInputChange(input) {
    if (!input) return;
    try {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch (_e) {}

    try {
      if (typeof window.PrimeFaces !== "undefined" && window.PrimeFaces.ab) {
        window.PrimeFaces.ab({
          s: input.id || "prontuarioInput",
          p: "change",
        });
      }
    } catch (_e2) {}

    try {
      if (typeof tab !== "undefined" && tab && typeof tab.openPOL === "function") {
        tab.openPOL(true);
      }
    } catch (_e3) {}
  }

  async function fillAndOpenPolOnce(prontuario) {
    var formatted = formatPolProntuario(prontuario);
    if (!formatted) {
      return { ok: false, error: "Prontuário vazio para abrir POL." };
    }

    tryActivateCascaTab(["prontuário online", "pol", "prontuario online"]);

    var polMenu = document.getElementById("polMenu");
    if (polMenu) {
      clickEl(polMenu);
      await sleep(MENU_SETTLE_MS);
    }

    var input = await waitFor(
      function () {
        return (
          document.getElementById("prontuarioInput") ||
          findByIdEndsWith("prontuarioInput") ||
          document.querySelector("#polPanel input") ||
          document.querySelector('input[id*="prontuarioInput"]')
        );
      },
      DEFAULT_TIMEOUT_MS,
      "#prontuarioInput"
    );

    input.focus();
    setNativeValue(input, formatted);
    var opened = await triggerPolOpen(input);

    if (!opened) {
      return {
        ok: false,
        error: "POL não abriu. Confirme o prontuário e a sessão AGHU.",
      };
    }

    return { ok: true };
  }

  /**
   * Grelha Exames Liberados com pelo menos uma linha (tr[data-ri]).
   * Histórico/Internações também usa tr[data-ri] — não conta sem o tbody Liberados.
   */
  function frameHasExamesLiberadosRows(frameDoc) {
    if (!frameDoc || !frameDoc.querySelector) return false;
    var tbody =
      frameDoc.querySelector('[id*="tblistaExamesLiberados"][id$="_data"]') ||
      frameDoc.querySelector("tbody[id$='resultList_data']");
    if (!tbody) return false;
    return !!tbody.querySelector("tr[data-ri]");
  }

  function activeAccordionPanel(cascaDoc) {
    if (!cascaDoc || !cascaDoc.querySelector) return null;
    var h3 = cascaDoc.querySelector("h3.accordion-tab-pol.ui-state-active");
    if (!h3 || !h3.nextElementSibling || !h3.nextElementSibling.querySelector) {
      return null;
    }
    return h3.nextElementSibling;
  }

  function pickExamesTreeLink(links) {
    if (!links || !links.length) return null;
    var partial = null;
    for (var i = 0; i < links.length; i++) {
      var t = textOf(links[i]).toLowerCase();
      if (!t || t.indexOf("liberados") !== -1) continue;
      if (t === "exames") return links[i];
      if (!partial && t.indexOf("exames") !== -1) partial = links[i];
    }
    return partial;
  }

  /**
   * Nó Exames da árvore POL: painel do accordion activo, senão o primeiro do documento.
   * Devolve o <a> (não o label). Exacto «Exames», depois inclusão, ignora «liberados».
   */
  function findExamesRestoreLink(cascaDoc) {
    var panel = activeAccordionPanel(cascaDoc);
    if (panel) {
      var scoped = pickExamesTreeLink(panel.querySelectorAll("a.node-link-pol"));
      if (scoped) return scoped;
    }
    if (!cascaDoc || !cascaDoc.querySelectorAll) return null;
    return pickExamesTreeLink(cascaDoc.querySelectorAll("a.node-link-pol"));
  }

  /**
   * Depois do cadastro o frame pode estar em Histórico. Não reutiliza
   * clickExamesAndWaitLiberados: o fingerprint de sessão exigiria grelha diferente.
   * @returns {{ needsClick: boolean, link: Element|null }}
   */
  function planExamesRestoreClick(cascaDoc, frameDoc) {
    if (frameHasExamesLiberadosRows(frameDoc)) {
      return { needsClick: false, link: null };
    }
    return { needsClick: true, link: findExamesRestoreLink(cascaDoc) };
  }

  function findPolTreeLink(labelExact) {
    var want = String(labelExact || "").toLowerCase();
    var links = document.querySelectorAll("a.node-link-pol");
    for (var i = 0; i < links.length; i++) {
      if (textOf(links[i]).toLowerCase() === want) return links[i];
    }
    for (var j = 0; j < links.length; j++) {
      var t = textOf(links[j]).toLowerCase();
      if (t.indexOf(want) !== -1 && t.indexOf("liberados") === -1) return links[j];
    }
    return null;
  }

  function liberadosTableInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    var tbody =
      doc.querySelector('[id*="tblistaExamesLiberados"][id$="_data"]') ||
      doc.querySelector('[id*="tblistaExamesLiberados"]') ||
      doc.querySelector("tbody[id$='resultList_data']");
    if (!tbody) return null;
    if (
      tbody.querySelector("tr[data-ri]") ||
      tbody.querySelector("[id*='dataColeta']") ||
      tbody.querySelector("td")
    ) {
      return tbody;
    }
    return tbody;
  }

  function findLiberadosTable() {
    var frame = document.querySelector(
      "#frame_pol, iframe[name='frame_pol'], iframe[id*='frame_pol']"
    );
    var docs = docsForFrame(frame);
    for (var i = 0; i < docs.length; i++) {
      var hit = liberadosTableInDoc(docs[i]);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Fingerprint estrutural da grelha Liberados (sem PHI).
   * id + contagem de tr + data-ri da 1ª linha + dígitos da 1ª linha.
   */
  function liberadosTableFingerprint(tbody) {
    if (!tbody) return "";
    var id = String(tbody.id || "");
    var rows = tbody.querySelectorAll("tr[data-ri]");
    var rowCount = 0;
    var firstRi = "";
    var structDigits = "";
    if (rows.length) {
      rowCount = rows.length;
      firstRi = String(rows[0].getAttribute("data-ri") || "");
      structDigits = digitsOnly(rows[0].textContent || "").slice(0, 32);
    } else {
      var allTr = tbody.querySelectorAll("tr");
      rowCount = allTr.length;
      if (allTr.length) {
        structDigits = digitsOnly(allTr[0].textContent || "").slice(0, 32);
      }
    }
    return id + "|" + rowCount + "|" + firstRi + "|" + structDigits;
  }

  /**
   * Duas leituras consecutivas iguais do fingerprint (≠ baseline se houver).
   * Evita aceitar grelha intermediária vazia/loading.
   */
  async function stabilizeLiberadosFingerprint(baseline, timeoutMs) {
    var deadline = now() + (timeoutMs != null ? timeoutMs : Math.min(15000, DEFAULT_TIMEOUT_MS));
    var lastFp = "";
    while (now() < deadline) {
      var t = findLiberadosTable();
      var fp = t ? liberadosTableFingerprint(t) : "";
      if (
        fp &&
        (!baseline || fp !== baseline) &&
        fp === lastFp
      ) {
        return { ok: true, fp: fp };
      }
      lastFp = fp || "";
      await sleep(LIBERADOS_STABILIZE_MS);
    }
    return {
      ok: false,
      error:
        "Exames Liberados não estabilizaram após troca de paciente. Confirme o POL e tente de novo.",
    };
  }

  /**
   * Após troca de paciente: re-clica Exames e espera Liberados mudar.
   * Baseline = grelha visível agora OU fingerprint da sessão (_lastLiberadosFp).
   * Sem baseline → primeira abertura do lote (aceita qualquer grelha + estabiliza).
   * Se verify falhou com baseline: 1 re-click Exames (não reabre POL inteiro).
   */
  async function clickExamesAndWaitLiberados() {
    var link = findPolTreeLink("Exames");
    if (!link) {
      return {
        ok: false,
        error: 'Nó "Exames" não encontrado na árvore do POL.',
      };
    }

    var prevTable = findLiberadosTable();
    var prevFp = prevTable ? liberadosTableFingerprint(prevTable) : "";
    var baseline = prevFp || _lastLiberadosFp;
    var waitMs = Math.min(15000, DEFAULT_TIMEOUT_MS);

    async function clickAndWaitOnce() {
      var liveLink = findPolTreeLink("Exames");
      if (!liveLink) {
        return {
          ok: false,
          error: 'Nó "Exames" não encontrado na árvore do POL.',
        };
      }
      clickEl(liveLink);
      await sleep(SETTLE_MS);

      try {
        if (!baseline) {
          await waitFor(
            function () {
              return findLiberadosTable();
            },
            waitMs,
            "Tabela Exames Liberados"
          );
        } else {
          await waitFor(
            function () {
              var t = findLiberadosTable();
              if (!t) return null;
              var fp = liberadosTableFingerprint(t);
              if (fp && fp !== baseline) return t;
              return null;
            },
            waitMs,
            "Exames Liberados atualizados"
          );
        }
      } catch (e) {
        if (baseline) {
          var still = findLiberadosTable();
          var stillFp = still ? liberadosTableFingerprint(still) : "";
          if (!stillFp || stillFp === baseline) {
            return {
              ok: false,
              error:
                "Exames Liberados não atualizaram após troca de paciente. Confirme o POL e tente de novo.",
            };
          }
        }
        return {
          ok: false,
          error:
            (e && e.message) ||
            "Tabela Exames Liberados não apareceu após clicar Exames.",
        };
      }

      var stable = await stabilizeLiberadosFingerprint(baseline, waitMs);
      if (!stable.ok) return stable;
      _lastLiberadosFp = stable.fp;
      return { ok: true };
    }

    var first = await clickAndWaitOnce();
    if (first.ok) return first;

    // 1 re-click Exames só se verify falhou (fingerprint == baseline / timeout).
    if (baseline && MAX_STEP_RECOVER >= 1) {
      await sleep(SETTLE_MS);
      var second = await clickAndWaitOnce();
      if (second.ok) return second;
      return second;
    }

    return first;
  }

  async function openPol(prontuario) {
    var want = normalizeProntuarioDigits(prontuario);
    if (!want) {
      return { ok: false, error: "Prontuário vazio para abrir POL." };
    }

    async function fillAndGateOnce() {
      var opened;
      try {
        opened = await fillAndOpenPolOnce(prontuario);
      } catch (e) {
        opened = {
          ok: false,
          error: (e && e.message) || "Falha ao abrir POL.",
        };
      }
      if (!opened.ok) {
        return {
          ok: false,
          error: opened.error || "Falha ao abrir POL.",
          active: "",
        };
      }

      var gate = await waitForCascaProntuario(want, GATE_TIMEOUT_MS);
      if (!gate.ok) {
        return {
          ok: false,
          error: gate.error || "Gate POL falhou.",
          active: gate.active || "",
        };
      }
      return { ok: true, active: gate.active };
    }

    // PM1C-AC-14: 1 abertura + gate; se falhou → 1 recover verificado; senão fail.
    var first = await fillAndGateOnce();
    var gateResult = first;
    if (!first.ok && MAX_STEP_RECOVER >= 1) {
      await sleep(SETTLE_MS);
      gateResult = await fillAndGateOnce();
    }
    if (!gateResult.ok) {
      return {
        ok: false,
        error:
          gateResult.error ||
          first.error ||
          "AGHU não selecionou o prontuário " +
            want +
            " (ativo: " +
            (gateResult.active || first.active || "nenhum") +
            ")",
        active: gateResult.active || first.active || "",
      };
    }

    // Liberados: baseline de sessão não deve vazar entre prontuários do lote.
    _lastLiberadosFp = "";
    await sleep(SETTLE_MS);

    // Liberados: 1 re-click interno se verify falhou — não reabre POL.
    var examesNav = await clickExamesAndWaitLiberados();
    if (!examesNav.ok) return examesNav;
    return { ok: true, active: gateResult.active };
  }

  function findSuggestionInput(docs) {
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var input =
        doc.querySelector('input[id*="suggestionProntuario"][id$="_input"]') ||
        doc.querySelector('input[id$="suggestion_input"]') ||
        findByIdEndsWith("suggestion_input", doc) ||
        findByIdIncludes("suggestionProntuario", doc);
      if (input && /_hinput$/i.test(String(input.id || ""))) continue;
      if (input) return { el: input, doc: doc };
    }
    return null;
  }

  function findAutocompleteItem(digits, docs) {
    var want = normalizeProntuarioDigits(digits);
    var digs = digitsOnly(digits);
    for (var d = 0; d < docs.length; d++) {
      var doc = docs[d];
      var items = doc.querySelectorAll(
        "tr.ui-autocomplete-row, tr.ui-autocomplete-item, table.ui-autocomplete-items tr, " +
          ".ui-autocomplete-item, .ui-autocomplete-list li, .ui-autocomplete-panel li, " +
          "li.ui-menu-item, .ui-selectonemenu-item"
      );
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var labelAttr = "";
        try {
          labelAttr = String(
            el.getAttribute("data-item-label") ||
              el.getAttribute("data-item-value") ||
              ""
          );
        } catch (_e) {}
        var t = textOf(el) || labelAttr;
        var itemDigits = normalizeProntuarioDigits(t);
        if (itemDigits && itemDigits === want) return el;
        if (t && digs && digitsOnly(t).indexOf(digs) !== -1) return el;
        if (labelAttr && digs && digitsOnly(labelAttr).indexOf(digs) !== -1) {
          return el;
        }
      }
    }
    for (var d2 = 0; d2 < docs.length; d2++) {
      var first = docs[d2].querySelector(
        "tr.ui-autocomplete-item.ui-autocomplete-row, tr.ui-autocomplete-row, " +
          "table.ui-autocomplete-items tr.ui-autocomplete-item, " +
          ".ui-autocomplete-panel li, .ui-autocomplete-items li, li.ui-autocomplete-item"
      );
      if (first && visible(first)) return first;
    }
    return null;
  }

  /**
   * Dispara query real do AutoComplete PrimeFaces no window do iframe.
   * HUCAM: PF('suggestionProntuarioWG').search(digits) — painel em tabela.
   * Só setar value não basta.
   */
  function triggerAutocompleteQuery(input) {
    if (!input) return;

    var doc = null;
    try {
      doc = input.ownerDocument || null;
    } catch (_e) {}
    var view = getDocWindow(doc);
    var value = String(input.value || "");
    var lastChar = value.length ? value.charAt(value.length - 1) : "";
    var Ev = (view && view.Event) || Event;
    var KE = (view && view.KeyboardEvent) || KeyboardEvent;
    var widgetNames = ["suggestionProntuarioWG", "suggestionProntuario"];

    // Preferência HUCAM: widgetVar no page context (wrappedJSObject).
    try {
      if (view && typeof view.PF === "function") {
        for (var n = 0; n < widgetNames.length; n++) {
          try {
            var wg = view.PF(widgetNames[n]);
            if (wg && typeof wg.search === "function") {
              wg.search(value);
              return;
            }
          } catch (_eWg) {}
        }
      }
    } catch (_ePf) {}

    // Fallback Xray: Function no window do doc.
    try {
      var searched = runInDocWindow(
        doc,
        function (query, names) {
          var pfFn =
            (this && typeof this.PF === "function" && this.PF) ||
            (typeof PF === "function" ? PF : null) ||
            (typeof window !== "undefined" && typeof window.PF === "function"
              ? window.PF
              : null);
          if (!pfFn) return false;
          for (var i = 0; i < names.length; i++) {
            try {
              var w = pfFn(names[i]);
              if (w && typeof w.search === "function") {
                w.search(query);
                return true;
              }
            } catch (_e) {}
          }
          return false;
        },
        [value, widgetNames]
      );
      if (searched) return;
    } catch (_eRun) {}

    try {
      input.dispatchEvent(new Ev("input", { bubbles: true }));
      if (lastChar) {
        var code = lastChar.charCodeAt(0);
        input.dispatchEvent(
          new KE("keydown", { bubbles: true, key: lastChar, keyCode: code })
        );
        input.dispatchEvent(
          new KE("keyup", { bubbles: true, key: lastChar, keyCode: code })
        );
      }
    } catch (_e4) {}

    try {
      var PFace = view && view.PrimeFaces;
      if (PFace && typeof PFace.getWidgetById === "function") {
        var wid = String(input.id || "");
        var candidates = [];
        if (wid) candidates.push(wid);
        if (wid.indexOf("_input") !== -1) {
          candidates.push(wid.replace(/_input$/, ""));
        }
        var colonIdx = wid.lastIndexOf(":");
        if (colonIdx > 0) candidates.push(wid.slice(0, colonIdx));
        for (var c = 0; c < candidates.length; c++) {
          var w = null;
          try {
            w = PFace.getWidgetById(candidates[c]);
          } catch (_e5) {}
          if (!w) continue;
          if (typeof w.search === "function") {
            w.search(value);
            return;
          }
          if (typeof w.triggerSearch === "function") {
            w.triggerSearch();
            return;
          }
        }
      }
    } catch (_e6) {}

    try {
      var jq = view && (view.jQuery || view.$);
      if (jq) jq(input).trigger("keyup");
    } catch (_e7) {}
  }

  /**
   * Extrai u:'…' do atributo onchange (PrimeFaces.ab).
   * @returns {string|null}
   */
  function parseAbUpdateFromOnchange(onchangeStr) {
    var raw = String(onchangeStr || "");
    var m = raw.match(/\bu\s*:\s*'((?:\\'|[^'])*)'/);
    if (m) return m[1].replace(/\\'/g, "'");
    m = raw.match(/\bu\s*:\s*"((?:\\"|[^"]*)*)"/);
    if (m) return m[1].replace(/\\"/g, '"');
    return null;
  }

  /**
   * Prescrições Consultar HUCAM: busca é onchange → PrimeFaces.ab (não botão Pesquisar).
   */
  function triggerPesqPacienteChange(input) {
    if (!input) return;
    var doc = null;
    try {
      doc = input.ownerDocument || null;
    } catch (_e) {}
    var view = getDocWindow(doc);
    var inputId = String(input.id || "");
    var onchange = "";
    try {
      onchange = input.getAttribute("onchange") || "";
    } catch (_e2) {}
    var u = parseAbUpdateFromOnchange(onchange) || PESQ_PACIENTE_AB_U_FALLBACK;
    var cfg = { s: inputId, e: "change", p: inputId, u: u };

    try {
      if (view && view.PrimeFaces && typeof view.PrimeFaces.ab === "function") {
        view.PrimeFaces.ab(cfg);
        return;
      }
    } catch (_e3) {}

    try {
      var abOk = runInDocWindow(
        doc,
        function (sid, update) {
          var PF =
            (this && this.PrimeFaces) ||
            (typeof PrimeFaces !== "undefined" ? PrimeFaces : null) ||
            (typeof window !== "undefined" ? window.PrimeFaces : null);
          if (PF && typeof PF.ab === "function") {
            PF.ab({ s: sid, e: "change", p: sid, u: update });
            return true;
          }
          return false;
        },
        [inputId, u]
      );
      if (abOk) return;
    } catch (_e4) {}

    // Fallback: handler inline / jQuery change no page context.
    try {
      if (onchange && view) {
        var Fn = view.Function || Function;
        var pageEl = unwrapElement(input);
        var fn = new Fn(String(onchange));
        fn.call(pageEl || input);
        return;
      }
    } catch (_e5) {}

    try {
      var Ev = (view && view.Event) || Event;
      input.dispatchEvent(new Ev("change", { bubbles: true }));
    } catch (_e6) {}

    try {
      var jq = view && (view.jQuery || view.$);
      if (jq) jq(input).trigger("change");
    } catch (_e7) {}
  }

  /** @deprecated Preferir triggerPesqPacienteChange (Rx Consultar). Mantido p/ API testes. */
  function triggerIframeSearch(input) {
    triggerPesqPacienteChange(input);
  }

  function findControlesGridInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    return (
      doc.querySelector('[id$="tabelaVisualizacaoRegistrosM_data"]') ||
      doc.getElementById("tabelaVisualizacaoRegistrosM_data") ||
      doc.querySelector('[id*="tabelaVisualizacaoRegistros"]')
    );
  }

  function findPrescricoesListaInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    return (
      doc.querySelector('[id*="listaPrescricoesMedicas"][id$="_data"]') ||
      doc.querySelector('[id*="listaItensPrescricaoMedica"]') ||
      doc.querySelector('[id*="listaPrescricoesMedicas"]')
    );
  }

  function isPrescricoesConsultarReady(doc) {
    return !!(findPrescricoesProntuarioInDoc(doc) && findPrescricoesListaInDoc(doc));
  }

  function findSuggestionHinput(input, docs) {
    if (!input && (!docs || !docs.length)) return null;
    var rootDocs = docs && docs.length ? docs.slice() : [];
    if (input && input.ownerDocument) {
      if (rootDocs.indexOf(input.ownerDocument) === -1) {
        rootDocs.unshift(input.ownerDocument);
      }
    }
    var inputId = input ? String(input.id || "") : "";
    var hinputId = "";
    if (inputId.indexOf("_input") !== -1) {
      hinputId = inputId.replace(/_input$/, "_hinput");
    } else if (inputId.indexOf("suggestion_input") !== -1) {
      hinputId = inputId.replace(/suggestion_input/, "suggestion_hinput");
    }
    for (var d = 0; d < rootDocs.length; d++) {
      var doc = rootDocs[d];
      if (!doc || !doc.querySelector) continue;
      if (hinputId) {
        try {
          var byId = doc.getElementById(hinputId);
          if (byId) return byId;
        } catch (_e) {}
      }
      var hit =
        doc.querySelector('input[id*="suggestion"][id$="_hinput"]') ||
        doc.querySelector('input[id*="suggestion_hinput"]');
      if (hit) return hit;
    }
    return null;
  }

  async function selectSuggestionProntuario(prontuario, docs) {
    var digits = digitsOnly(prontuario);
    var hit = findSuggestionInput(docs);
    if (!hit) {
      throw new Error(
        "Campo suggestion de Controles não encontrado. Abra Visualizar Controles."
      );
    }

    var input = hit.el;
    input.focus();
    setNativeValue(input, digits);
    triggerAutocompleteQuery(input);
    await sleep(SETTLE_MS);

    var panelItem;
    try {
      panelItem = await waitFor(
        function () {
          return findAutocompleteItem(digits, docs);
        },
        Math.min(12000, DEFAULT_TIMEOUT_MS),
        "Sugestão de paciente (Controles)"
      );
    } catch (firstErr) {
      if (MAX_STEP_RECOVER >= 1) {
        triggerAutocompleteQuery(input);
        await sleep(MENU_SETTLE_MS);
        panelItem = await waitFor(
          function () {
            return findAutocompleteItem(digits, docs);
          },
          Math.min(12000, DEFAULT_TIMEOUT_MS),
          "Sugestão de paciente (Controles)"
        );
      } else {
        throw firstErr;
      }
    }

    clickEl(panelItem);
    await sleep(MENU_SETTLE_MS);

    var want = normalizeProntuarioDigits(prontuario);
    var itemDigits = normalizeProntuarioDigits(textOf(panelItem));
    var selectedDigits = normalizeProntuarioDigits(input.value);
    var hinput = findSuggestionHinput(input, docs);
    var hinputVal = hinput ? String(hinput.value || "").trim() : "";

    // OK: dígitos no input, ou hinput entidade preenchido com item do prontuário certo.
    if (selectedDigits === want) return;
    if (hinputVal && itemDigits === want) return;
    if (itemDigits === want && selectedDigits === want) return;

    throw new Error(
      "AGHU não selecionou o prontuário " +
        want +
        " (ativo: " +
        (selectedDigits || itemDigits || "nenhum") +
        ")"
    );
  }

  function parseBrDateOnly(s) {
    var m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function clinicalCtrlBoundsFromBrDates(fromBr, toBr) {
    var from = parseBrDateOnly(fromBr);
    var to = parseBrDateOnly(toBr || fromBr);
    if (!from || !to) return null;
    var api =
      typeof AghuControlesWindow !== "undefined" ? AghuControlesWindow : null;
    if (api && api.controlesAgHuQueryBounds) {
      return api.controlesAgHuQueryBounds(from, to);
    }
    var end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    end.setDate(end.getDate() + 1);
    return {
      dateFromCtrl:
        pad2(from.getDate()) +
        "/" +
        pad2(from.getMonth() + 1) +
        "/" +
        from.getFullYear() +
        " 07:00",
      dateToCtrl:
        pad2(end.getDate()) +
        "/" +
        pad2(end.getMonth() + 1) +
        "/" +
        end.getFullYear() +
        " 06:59",
    };
  }

  function expectedControlesDateValues(period) {
    period = period || {};
    var fromVal = "";
    var toVal = "";
    if (period.dateFromCtrl) {
      fromVal = period.dateFromCtrl;
      toVal = period.dateToCtrl || "";
    } else if (period.dateFromBr) {
      var bounds = clinicalCtrlBoundsFromBrDates(
        period.dateFromBr,
        period.dateToBr || period.dateFromBr
      );
      if (bounds) {
        fromVal = bounds.dateFromCtrl;
        toVal = bounds.dateToCtrl;
      } else {
        fromVal = period.dateFromBr + " 07:00";
        toVal = (period.dateToBr || period.dateFromBr) + " 06:59";
      }
    }
    return { from: fromVal, to: toVal };
  }

  function setControlesDates(period, doc) {
    doc = doc || document;
    var dates = expectedControlesDateValues(period);
    var fromVal = dates.from;
    var toVal = dates.to;

    var dataInicio =
      doc.querySelector('input[id*="dataInicio"][id$="_input"]') ||
      findByIdIncludes("dataInicio", doc) ||
      doc.querySelector("#dataInicio\\:dataInicio\\:inputId_input");
    var dataFim =
      doc.querySelector('input[id*="dataFim"][id$="_input"]') ||
      findByIdIncludes("dataFim", doc);

    if (dataInicio && fromVal) setNativeValue(dataInicio, fromVal);
    if (dataFim && toVal) setNativeValue(dataFim, toVal);
  }

  function findControlesSuggestionInDoc(doc) {
    if (!doc) return null;
    return (
      doc.querySelector('input[id*="suggestionProntuario"][id$="_input"]') ||
      doc.querySelector('input[id$="suggestion_input"]') ||
      findByIdEndsWith("suggestion_input", doc) ||
      (function () {
        var el = findByIdIncludes("suggestionProntuario", doc);
        if (el && /_hinput$/i.test(String(el.id || ""))) return null;
        return el;
      })()
    );
  }

  function findControlesLimparButton(doc) {
    if (!doc) return null;
    return (
      doc.getElementById("bt_limparPesquisa:button") ||
      doc.querySelector('button[id*="bt_limparPesquisa"]') ||
      doc.querySelector("#bt_limparPesquisa\\:button")
    );
  }

  function findControlesSgClearButton(doc) {
    if (!doc) return null;
    return (
      doc.getElementById("suggestionProntuario:suggestionProntuario:sgClear") ||
      doc.querySelector('button[id*="suggestionProntuario"][id$="sgClear"]')
    );
  }

  /**
   * Controles HUCAM: Limpar via PrimeFaces.ab só no page-context (runInDocWindow).
   * Firefox Xray: chamar view.PrimeFaces.ab com objeto do compartment da extensão
   * pode no-op e ainda retornar true — nunca usar esse atalho.
   * s/p = bt_limparPesquisa:button; u = panelPesquisa + panelAbasExterno; rv:true.
   * @param {Document} doc
   * @returns {boolean}
   */
  function triggerControlesLimparPesquisa(doc) {
    if (!doc) return false;
    var limpar = findControlesLimparButton(doc);
    if (!limpar) return false;

    var sid = String(limpar.id || CONTROLES_LIMPAR_AB_S);
    var u = CONTROLES_LIMPAR_AB_U;

    try {
      var abOk = runInDocWindow(
        doc,
        function (sourceId, update, rv) {
          var PF =
            (this && this.PrimeFaces) ||
            (typeof PrimeFaces !== "undefined" ? PrimeFaces : null) ||
            (typeof window !== "undefined" ? window.PrimeFaces : null);
          if (PF && typeof PF.ab === "function") {
            PF.ab({ s: sourceId, p: sourceId, u: update, rv: rv });
            return true;
          }
          return false;
        },
        [sid, u, true]
      );
      if (abOk) return true;
    } catch (_e) {}

    // Fallback: click + re-eval onclick do Limpar no page-context.
    return clickClearInDoc(doc, [
      "bt_limparPesquisa:button",
      'button[id*="bt_limparPesquisa"]',
      "#bt_limparPesquisa\\:button",
    ]);
  }

  /**
   * Fallback Controles: sgClear do suggestion (Limpar ausente OU retry pós-Limpar).
   * Só runInDocWindow + PF.ab (Xray-safe); senão clickClearInDoc.
   * @param {Document} doc
   * @returns {boolean}
   */
  function triggerControlesSgClear(doc) {
    if (!doc) return false;
    var btn = findControlesSgClearButton(doc);
    if (!btn) return false;

    var sid = String(btn.id || "suggestionProntuario:suggestionProntuario:sgClear");
    var onclick = "";
    try {
      onclick = btn.getAttribute("onclick") || "";
    } catch (_e) {}
    var u = parseAbUpdateFromOnchange(onclick);

    if (u) {
      try {
        var abOk = runInDocWindow(
          doc,
          function (sourceId, update) {
            var PF =
              (this && this.PrimeFaces) ||
              (typeof PrimeFaces !== "undefined" ? PrimeFaces : null) ||
              (typeof window !== "undefined" ? window.PrimeFaces : null);
            if (PF && typeof PF.ab === "function") {
              PF.ab({ s: sourceId, p: sourceId, u: update, rv: true });
              return true;
            }
            return false;
          },
          [sid, u]
        );
        if (abOk) return true;
      } catch (_e2) {}
    }

    return clickClearInDoc(doc, [
      "suggestionProntuario:suggestionProntuario:sgClear",
      'button[id*="suggestionProntuario"][id$="sgClear"]',
    ]);
  }

  /**
   * Overlay/status PrimeFaces visível (sem ui-overlay-hidden / aria-hidden).
   * @param {Element} el
   * @returns {boolean}
   */
  function isPfStatusDialogVisible(el) {
    if (!el) return false;
    try {
      if (el.classList && el.classList.contains("ui-overlay-hidden")) {
        return false;
      }
      var aria = el.getAttribute("aria-hidden");
      if (aria === "true") return false;
    } catch (_e) {}
    try {
      var style = (el.ownerDocument && el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView
        : window
      ).getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    } catch (_e2) {}
    return true;
  }

  /**
   * Diálogo Carregando/Aguarde (#j_idt361 HUCAM ou match por texto).
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findControlesCarregandoDialog(doc) {
    if (!doc || !doc.querySelector) return null;
    var byId = null;
    try {
      byId = doc.getElementById("j_idt361");
    } catch (_e) {}
    if (byId) return byId;
    var candidates = [];
    try {
      candidates = doc.querySelectorAll(
        ".ui-dialog, [role='dialog'], .ui-dialog-content"
      );
    } catch (_e2) {
      return null;
    }
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var t = textOf(el).toLowerCase();
      if (
        t.indexOf("carregando") !== -1 ||
        t.indexOf("aguarde") !== -1 ||
        t.indexOf("processando") !== -1
      ) {
        return el;
      }
    }
    return null;
  }

  /**
   * True se #form_processing, diálogo Carregando ou #casca_processing visíveis.
   * @param {Document} doc
   * @returns {boolean}
   */
  function isControlesAjaxBusy(doc) {
    if (!doc) return false;
    var processing = null;
    try {
      processing = doc.getElementById("form_processing");
    } catch (_e) {}
    if (processing && isPfStatusDialogVisible(processing)) return true;

    var carregando = findControlesCarregandoDialog(doc);
    if (carregando && isPfStatusDialogVisible(carregando)) return true;

    var casca = null;
    try {
      casca = doc.getElementById("casca_processing");
    } catch (_e2) {}
    if (casca && isPfStatusDialogVisible(casca)) return true;

    return false;
  }

  /**
   * Soft-wait até Controles idle (iframe + top). Refresh contentDocument a cada poll.
   * @param {HTMLIFrameElement} frame
   * @param {number} [timeoutMs]
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function waitControlesAjaxIdle(frame, timeoutMs) {
    var ms = timeoutMs != null ? timeoutMs : AJAX_IDLE_TIMEOUT_MS;
    var idle = await softWaitUntil(function () {
      var liveDoc = refreshFrameContext(frame).doc;
      var busyIframe = liveDoc ? isControlesAjaxBusy(liveDoc) : false;
      var busyTop = false;
      try {
        busyTop = isControlesAjaxBusy(document);
      } catch (_e) {}
      return !busyIframe && !busyTop;
    }, ms);
    if (idle) return { ok: true };
    return {
      ok: false,
      error:
        "AGHU Controles ficou em Carregando/Processando. Aguarde o modal sumir e tente de novo.",
    };
  }

  /**
   * #msgDialog (PrimeFaces) no iframe Controles — mensagens de sistema.
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findControlesMsgDialog(doc) {
    if (!doc || !doc.querySelector) return null;
    try {
      return (
        doc.getElementById("msgDialog") ||
        doc.querySelector('[id$="msgDialog"]') ||
        doc.querySelector(".ui-messages, [id*='msgDialog']")
      );
    } catch (_e) {
      return null;
    }
  }

  /**
   * Texto visível de #msgDialog (sem PHI esperado — só mensagens de sistema).
   * @param {Document} doc
   * @returns {string}
   */
  function readControlesSystemMessage(doc) {
    var dlg = findControlesMsgDialog(doc);
    if (!dlg || !isPfStatusDialogVisible(dlg)) return "";
    return textOf(dlg);
  }

  /**
   * Padrão AGHU: «Não existem registros de controles no período…» (sem PHI).
   * @param {string} text
   * @returns {boolean}
   */
  function isControlesEmptyRecordsMessage(text) {
    var t = String(text || "").toLowerCase();
    if (!t) return false;
    var noRecords =
      t.indexOf("não existem registros") !== -1 ||
      t.indexOf("nao existem registros") !== -1 ||
      t.indexOf("não há registros") !== -1 ||
      t.indexOf("nao ha registros") !== -1 ||
      t.indexOf("nenhum registro") !== -1;
    var periodHint =
      t.indexOf("período") !== -1 ||
      t.indexOf("periodo") !== -1 ||
      t.indexOf("controles") !== -1;
    return noRecords && periodHint;
  }

  /**
   * Pesquisar concluído: AJAX idle OU msgDialog de vazio legítimo visível.
   * @param {Document} doc
   * @returns {boolean}
   */
  function isControlesPesquisarComplete(doc) {
    if (!doc) return false;
    if (!isControlesAjaxBusy(doc)) return true;
    var msg = readControlesSystemMessage(doc);
    return isControlesEmptyRecordsMessage(msg);
  }

  /**
   * Fecha #msgDialog (titlebar-close) se visível.
   * @param {Document} doc
   * @returns {boolean}
   */
  function dismissControlesMsgDialog(doc) {
    if (!doc) return false;
    var dlg = findControlesMsgDialog(doc);
    if (!dlg || !isPfStatusDialogVisible(dlg)) return false;
    var closeBtn = null;
    try {
      closeBtn =
        dlg.querySelector(".ui-dialog-titlebar-close") ||
        dlg.querySelector("a.ui-dialog-titlebar-close") ||
        dlg.querySelector("[aria-label='Close'], [title='Close'], .ui-icon-closethick");
    } catch (_e) {}
    if (closeBtn) {
      try {
        var view = getDocWindow(doc) || window;
        closeBtn.dispatchEvent(
          new view.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: view,
          })
        );
      } catch (_eClick) {
        clickEl(closeBtn);
      }
      try {
        dlg.classList.add("ui-overlay-hidden");
        dlg.setAttribute("aria-hidden", "true");
      } catch (_eHide) {}
      return true;
    }
    // Fallback: ocultar overlay para não bloquear Limpar/Pesquisar do próximo.
    try {
      dlg.classList.add("ui-overlay-hidden");
      dlg.setAttribute("aria-hidden", "true");
      return true;
    } catch (_e2) {
      return false;
    }
  }

  /**
   * Se msg de vazio já visível e Carregando preso: oculta status e segue.
   * @param {Document} doc
   * @returns {boolean}
   */
  function dismissControlesCarregandoIfMsgComplete(doc) {
    if (!doc) return false;
    var msg = readControlesSystemMessage(doc);
    if (!isControlesEmptyRecordsMessage(msg)) return false;
    var carregando = findControlesCarregandoDialog(doc);
    if (!carregando || !isPfStatusDialogVisible(carregando)) return false;
    try {
      // Preferir API PF no page-context se existir.
      var hid = runInDocWindow(
        doc,
        function () {
          var el =
            (typeof document !== "undefined" && document.getElementById("j_idt361")) ||
            null;
          if (!el) return false;
          try {
            el.classList.add("ui-overlay-hidden");
            el.setAttribute("aria-hidden", "true");
          } catch (_e) {}
          var pfFn =
            (this && typeof this.PF === "function" && this.PF) ||
            (typeof PF === "function" ? PF : null);
          if (pfFn) {
            try {
              var w = pfFn("j_idt361") || pfFn("statusDialog") || null;
              if (w && typeof w.hide === "function") {
                w.hide();
                return true;
              }
            } catch (_e2) {}
          }
          return true;
        },
        []
      );
      if (hid) return true;
    } catch (_e3) {}
    try {
      carregando.classList.add("ui-overlay-hidden");
      carregando.setAttribute("aria-hidden", "true");
      return true;
    } catch (_e4) {
      return false;
    }
  }

  /**
   * Pós-Pesquisar: idle OU msgDialog vazio (não preso 12s só no Carregando).
   * @param {HTMLIFrameElement} frame
   * @param {number} [timeoutMs]
   * @returns {Promise<{ok:boolean, empty?:boolean, error?:string}>}
   */
  async function waitControlesPesquisarComplete(frame, timeoutMs) {
    var ms = timeoutMs != null ? timeoutMs : AJAX_IDLE_TIMEOUT_MS;
    var sawEmptyMsg = false;
    var done = await softWaitUntil(function () {
      var liveDoc = refreshFrameContext(frame).doc;
      var busyTop = false;
      try {
        busyTop = isControlesAjaxBusy(document);
      } catch (_e) {}

      if (liveDoc) {
        var msg = readControlesSystemMessage(liveDoc);
        if (isControlesEmptyRecordsMessage(msg)) {
          sawEmptyMsg = true;
          dismissControlesCarregandoIfMsgComplete(liveDoc);
          return true;
        }
        if (!isControlesAjaxBusy(liveDoc) && !busyTop) return true;
      } else if (!busyTop) {
        return true;
      }
      return false;
    }, ms);

    if (!done) {
      return {
        ok: false,
        error:
          "AGHU Controles ficou em Carregando/Processando. Aguarde o modal sumir e tente de novo.",
      };
    }
    return { ok: true, empty: sawEmptyMsg || undefined };
  }

  /**
   * Contagem de linhas de dados na grelha Monitorização (0 = vazio).
   * @param {Document} doc
   * @returns {number|null} null se grelha ausente
   */
  function countControlesGridRows(doc) {
    var grid = findControlesGridInDoc(doc);
    if (!grid) return null;
    var rows = grid.querySelectorAll("tr[data-ri]");
    if (rows.length) return rows.length;
    var allTr = grid.querySelectorAll("tr");
    var n = 0;
    for (var i = 0; i < allTr.length; i++) {
      var cells = allTr[i].querySelectorAll("td");
      if (cells.length) n += 1;
    }
    return n;
  }

  /** input + hinput do leito Controles vazios. */
  function areControlesLeitoFieldsEmpty(docs) {
    var list = docs && docs.length ? docs : [];
    for (var d = 0; d < list.length; d++) {
      var doc = list[d];
      if (!doc || !doc.querySelector) continue;
      var input =
        doc.querySelector('input[id*="suggestionLeito"][id$="_input"]') ||
        doc.querySelector('input[id*="suggestionLeito"][id$="suggestion_input"]');
      var hinput =
        doc.querySelector('input[id*="suggestionLeito"][id$="_hinput"]') ||
        doc.querySelector('input[id*="suggestionLeito"][id$="suggestion_hinput"]');
      if (input && String(input.value || "").trim()) return false;
      if (hinput && String(hinput.value || "").trim()) return false;
    }
    return true;
  }

  function findControlesLeitoSgClearButton(doc) {
    if (!doc) return null;
    return (
      doc.getElementById("suggestionLeito:suggestionLeito:sgClear") ||
      doc.querySelector('button[id*="suggestionLeito"][id$="sgClear"]')
    );
  }

  /**
   * Limpa só suggestion de leito residual (não o de prontuário).
   * @param {Document} doc
   * @returns {boolean}
   */
  function triggerControlesLeitoSgClear(doc) {
    if (!doc) return false;
    var btn = findControlesLeitoSgClearButton(doc);
    if (!btn) return false;
    return clickClearInDoc(doc, [
      "suggestionLeito:suggestionLeito:sgClear",
      'button[id*="suggestionLeito"][id$="sgClear"]',
    ]);
  }

  /** Subaba Controle Hídrico (#TAB_1) no iframe Visualizar Controles. */
  function findControlesHidricoTab(doc) {
    if (!doc || !doc.querySelector) return null;
    var byHref =
      doc.querySelector('a[href="#TAB_1"]') ||
      doc.querySelector('a[href*="TAB_1"]');
    if (byHref) return byHref;
    return findMenuItemByText(
      ["Controle Hídrico", "Controle Hidrico"],
      doc
    );
  }

  /** Subaba Monitorização (#TAB_0) — extract lê a grelha nesta aba. */
  function findControlesMonitorizacaoTab(doc) {
    if (!doc || !doc.querySelector) return null;
    var byHref =
      doc.querySelector('a[href="#TAB_0"]') ||
      doc.querySelector('a[href*="TAB_0"]');
    if (byHref) return byHref;
    return findMenuItemByText(
      ["Monitorização", "Monitorizacao"],
      doc
    );
  }

  /**
   * Painel Hídrico: #tabelaBlHidrico (vazio OK) ou tabela BH com registros.
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findControlesHidricoPanelInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    return (
      doc.getElementById("tabelaBlHidrico") ||
      doc.querySelector('[id$="tabelaBlHidrico"]') ||
      doc.querySelector('[id$="tabelaVisualizacaoRegistrosBH_data"]') ||
      doc.getElementById("tabelaVisualizacaoRegistrosBH") ||
      doc.querySelector('[id*="tabelaVisualizacaoRegistrosBH"]')
    );
  }

  /** input + hinput do suggestion Controles vazios (nós vivos). */
  function areControlesSuggestionFieldsEmpty(docs) {
    var hit = findSuggestionInput(docs);
    var input = hit && hit.el;
    if (input && !isLiveNode(input)) return false;
    var hinput = findSuggestionHinput(input, docs);
    if (hinput && !isLiveNode(hinput)) return false;
    var inputEmpty = !input || !String(input.value || "").trim();
    var hinputEmpty = !hinput || !String(hinput.value || "").trim();
    return inputEmpty && hinputEmpty;
  }

  function findPrescricoesProntuarioInDoc(doc) {
    if (!doc) return null;
    return (
      doc.querySelector('input[id*="pesqPaciente"][id*="prontuario"]') ||
      findByIdIncludes("pesqPaciente", doc) ||
      doc.querySelector('input[id*="prontuario"][id*="pesq"]') ||
      doc.querySelector('input[id*="inputTextProntuarioNomePaciente"]') ||
      findByIdIncludes("inputTextProntuarioNomePaciente", doc)
    );
  }

  /** Telemetria de decisão nav (sem PII). */
  function logNavDecision(code, extra) {
    try {
      var payload = { code: String(code || "") };
      if (extra && typeof extra === "object") {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) {
            payload[k] = extra[k];
          }
        }
      }
      console.log("[AGHU nav]", payload);
    } catch (_e) {}
  }

  function readControlesDateValues(doc) {
    if (!doc) return { from: "", to: "" };
    var dataInicio =
      doc.querySelector('input[id*="dataInicio"][id$="_input"]') ||
      findByIdIncludes("dataInicio", doc) ||
      doc.querySelector("#dataInicio\\:dataInicio\\:inputId_input");
    var dataFim =
      doc.querySelector('input[id*="dataFim"][id$="_input"]') ||
      findByIdIncludes("dataFim", doc);
    return {
      from: dataInicio ? String(dataInicio.value || "").trim() : "",
      to: dataFim ? String(dataFim.value || "").trim() : "",
    };
  }

  function isControlesPeriodMatching(period, doc) {
    if (!period) return true;
    var expected = expectedControlesDateValues(period);
    if (!expected.from && !expected.to) return true;
    var actual = readControlesDateValues(doc);
    return actual.from === expected.from && actual.to === expected.to;
  }

  function isControlesSuggestionPatientMatch(docs, prontuario) {
    var want = digitsOnly(prontuario);
    if (!want) return false;
    var hit = findSuggestionInput(docs);
    var input = hit && hit.el;
    var hinput = findSuggestionHinput(input, docs);
    var vals = [];
    if (input) vals.push(String(input.value || ""));
    if (hinput) vals.push(String(hinput.value || ""));
    for (var i = 0; i < vals.length; i++) {
      var d = digitsOnly(vals[i]);
      if (!d) continue;
      if (d === want || d.slice(-4) === want.slice(-4)) return true;
    }
    return false;
  }

  function isControlesSearchResultReady(doc) {
    if (!doc) return false;
    var msg = readControlesSystemMessage(doc);
    if (isControlesEmptyRecordsMessage(msg)) return true;
    var rowCount = countControlesGridRows(doc);
    if (rowCount != null && rowCount > 0) return true;
    if (findControlesHidricoPanelInDoc(doc)) return true;
    return false;
  }

  /**
   * Pesquisa já concluída apesar de Carregando preso (evita reopen casca).
   * @param {HTMLIFrameElement} frame
   * @returns {boolean}
   */
  function isControlesPesquisarSettled(frame) {
    var liveDoc = refreshFrameContext(frame).doc;
    if (!liveDoc) return false;
    var rowCount = countControlesGridRows(liveDoc);
    if (rowCount != null && rowCount > 0) return true;
    var msg = readControlesSystemMessage(liveDoc);
    if (isControlesEmptyRecordsMessage(msg)) return true;
    if (findControlesHidricoPanelInDoc(liveDoc)) return true;
    var busyTop = false;
    try {
      busyTop = isControlesAjaxBusy(document);
    } catch (_e) {}
    if (!isControlesAjaxBusy(liveDoc) && !busyTop) return true;
    return false;
  }

  function isControlesAlreadyNavigated(frame, prontuario, period) {
    var ctx = refreshFrameContext(frame);
    var doc = ctx.doc;
    if (!doc) return false;
    if (!isControlesSuggestionPatientMatch(ctx.docs, prontuario)) return false;
    if (!isControlesSearchResultReady(doc)) return false;
    if (!isControlesPeriodMatching(period, doc)) return false;
    return true;
  }

  /**
   * Subabas Hídrico → Monitorização (extract lê grelha principal).
   * @param {HTMLIFrameElement} frame
   */
  async function finishControlesSubtabs(frame) {
    var ctx = refreshFrameContext(frame);
    var iframeDoc = ctx.doc;

    var emptyByMsg =
      !!(iframeDoc &&
        isControlesEmptyRecordsMessage(readControlesSystemMessage(iframeDoc)));
    var rowCount = iframeDoc ? countControlesGridRows(iframeDoc) : null;
    var emptyByGrid = rowCount === 0;
    if (emptyByMsg || emptyByGrid) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return { ok: true, empty: true };
    }

    var gridReady = { ok: true, gridReady: true };

    var idleBeforeHidrico = await waitControlesAjaxIdle(frame);
    if (!idleBeforeHidrico.ok) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return Object.assign({}, gridReady, {
        warning:
          "BH preload skipped: " +
          (idleBeforeHidrico.error || "idle antes de Controle Hídrico."),
      });
    }

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    var hidricoTab = iframeDoc && findControlesHidricoTab(iframeDoc);
    if (!hidricoTab) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return Object.assign({}, gridReady, {
        warning: "BH preload skipped: aba Controle Hídrico não encontrada.",
      });
    }
    clickEl(hidricoTab);

    var idleAfterHidrico = await waitControlesAjaxIdle(frame);
    if (!idleAfterHidrico.ok) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return Object.assign({}, gridReady, {
        warning:
          "BH preload skipped: " +
          (idleAfterHidrico.error || "idle após Controle Hídrico."),
      });
    }

    try {
      await waitFor(
        function () {
          var liveDoc = refreshFrameContext(frame).doc;
          return liveDoc && findControlesHidricoPanelInDoc(liveDoc);
        },
        Math.min(10000, DEFAULT_TIMEOUT_MS),
        "Painel Controle Hídrico"
      );
    } catch (_eHidrico) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return Object.assign({}, gridReady, {
        warning:
          "BH preload skipped: painel Controle Hídrico não apareceu (#tabelaBlHidrico / BH).",
      });
    }

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    var monTab = iframeDoc && findControlesMonitorizacaoTab(iframeDoc);
    if (monTab) {
      clickEl(monTab);
      var idleAfterMon = await waitControlesAjaxIdle(frame);
      if (!idleAfterMon.ok) {
        if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
        return Object.assign({}, gridReady, {
          warning:
            "BH preload skipped: " +
            (idleAfterMon.error || "idle após voltar Monitorização."),
        });
      }
    }

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    if (iframeDoc) dismissControlesMsgDialog(iframeDoc);

    return gridReady;
  }

  async function openControles(prontuario, period) {
    var frameHints = [
      "visualizar_controles",
      "i_frame_visualizar_controles",
      "controlepaciente",
    ];
    var existingFrame = findFrameWithField(
      frameHints,
      findControlesSuggestionInDoc
    );

    // Hints curtos ("controles") ativam aba errada — só títulos próximos.
    var activated = tryActivateCascaTab([
      "visualizar controles",
      "controles do paciente",
    ]);

    var needAddTab = !existingFrame;
    if (!activated && needAddTab) {
      var addTabLink = findCascaAddTabLink([
        "visualizarRegistrosControle",
        "visualizarregistroscontrole",
      ]);
      if (addTabLink) {
        await invokeAddTabLink(addTabLink);
        await sleep(MENU_SETTLE_MS);
      } else {
        await openMenuPath([
          ["Controles do Paciente", "Controles"],
          ["Visualizar Controles", "Visualizar controles"],
        ]);
      }
    } else if (existingFrame && !activated) {
      logNavDecision("controles_skip_addtab_existing_frame");
      await sleep(SETTLE_MS);
    }

    await sleep(SETTLE_MS);
    var frameHit;
    try {
      frameHit = await waitForFrameField(
        frameHints,
        findControlesSuggestionInDoc,
        "Campo suggestion no iframe Controles",
        Math.min(12000, DEFAULT_TIMEOUT_MS)
      );
    } catch (_e) {
      return {
        ok: false,
        error:
          "Aba Controles não abriu (iframe sem campo). Abra Visualizar Controles na casca AGHU.",
      };
    }

    var frame = frameHit.frame;
    var ctx = refreshFrameContext(frame);
    var docs = ctx.docs;
    var iframeDoc = ctx.doc;

    if (isControlesAlreadyNavigated(frame, prontuario, period)) {
      logNavDecision("controles_fast_path");
      return finishControlesSubtabs(frame);
    }

    var controlesTabHints = [
      "visualizar controles",
      "controles do paciente",
    ];
    var controlesFrameHints = frameHints;
    var cascaReopenUsed = false;

    async function reopenControlesTab() {
      var addTabLink = findCascaAddTabLink([
        "visualizarRegistrosControle",
        "visualizarregistroscontrole",
      ]);
      if (addTabLink) {
        await invokeAddTabLink(addTabLink);
        await sleep(MENU_SETTLE_MS);
      } else {
        await openMenuPath([
          ["Controles do Paciente", "Controles"],
          ["Visualizar Controles", "Visualizar controles"],
        ]);
      }
    }

    async function recoverControlesCascaTab(reason) {
      if (cascaReopenUsed || MAX_STEP_RECOVER < 1) return false;
      cascaReopenUsed = true;
      logNavDecision("controles_casca_reopen", { reason: reason });
      await closeAndReopenCascaTab(controlesTabHints, reopenControlesTab);
      try {
        frameHit = await waitForFrameField(
          controlesFrameHints,
          findControlesSuggestionInDoc,
          "Campo suggestion no iframe Controles (pós-reopen)",
          Math.min(12000, DEFAULT_TIMEOUT_MS)
        );
        frame = frameHit.frame;
        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
        return true;
      } catch (_eRecover) {
        return false;
      }
    }

    /**
     * Clear Controles: Limpar → idle/verify; se sujo → sgClear → verify.
     * PM1C-AC-15 — sem 2º Limpar cego.
     * @returns {Promise<boolean>} true se suggestion vazio
     */
    async function clearControlesSuggestionOnce() {
      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      iframeDoc = ctx.doc;
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);

      var hadLimpar = !!(iframeDoc && findControlesLimparButton(iframeDoc));
      if (iframeDoc) {
        if (hadLimpar) {
          triggerControlesLimparPesquisa(iframeDoc);
        } else {
          triggerControlesSgClear(iframeDoc);
        }
      }
      await sleep(MENU_SETTLE_MS);

      try {
        var afterClear = await waitForFrameField(
          controlesFrameHints,
          findControlesSuggestionInDoc,
          "Campo suggestion no iframe Controles (pós-Limpar)",
          Math.min(8000, DEFAULT_TIMEOUT_MS)
        );
        frame = afterClear.frame;
        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
      } catch (_eRefresh) {
        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
      }

      var clearWaitMs = Math.max(SETTLE_MS * 3, 400);
      await softWaitUntil(function () {
        var live = refreshFrameContext(frame);
        return areControlesSuggestionFieldsEmpty(live.docs);
      }, clearWaitMs);

      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      iframeDoc = ctx.doc;

      // 2º mecanismo só após verify falhou (sgClear); sem 2º Limpar cego.
      if (
        !areControlesSuggestionFieldsEmpty(docs) &&
        iframeDoc &&
        hadLimpar &&
        findControlesSgClearButton(iframeDoc)
      ) {
        triggerControlesSgClear(iframeDoc);
        await sleep(MENU_SETTLE_MS);
        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
        await softWaitUntil(function () {
          var live = refreshFrameContext(frame);
          return areControlesSuggestionFieldsEmpty(live.docs);
        }, Math.max(SETTLE_MS, 350));
        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
      }

      return areControlesSuggestionFieldsEmpty(docs);
    }

    var cleared = false;
    ctx = refreshFrameContext(frame);
    docs = ctx.docs;
    if (isControlesSuggestionPatientMatch(docs, prontuario)) {
      cleared = true;
      logNavDecision("controles_skip_clear_patient_already_selected");
    } else {
      cleared = await clearControlesSuggestionOnce();
    }

    if (!cleared) {
      await sleep(Math.max(SETTLE_MS, 350));
      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      if (areControlesSuggestionFieldsEmpty(docs)) {
        cleared = true;
        logNavDecision("controles_skip_reopen_clear_reverified_empty");
      } else if (isControlesSuggestionPatientMatch(docs, prontuario)) {
        cleared = true;
        logNavDecision("controles_skip_clear_patient_already_selected");
      }
    }

    if (!cleared) {
      var reopenedClear = await recoverControlesCascaTab("clear_failed");
      if (!reopenedClear) {
        return {
          ok: false,
          error:
            "Controles: pesquisa não foi limpa (paciente anterior ainda selecionado). Clique Limpar no AGHU e tente de novo.",
        };
      }
      cleared = await clearControlesSuggestionOnce();
    }

    if (!cleared) {
      return {
        ok: false,
        error:
          "Controles: pesquisa não foi limpa (paciente anterior ainda selecionado). Clique Limpar no AGHU e tente de novo.",
      };
    }

    // Leito residual do paciente anterior pode filtrar a pesquisa — só suggestionLeito sgClear.
    ctx = refreshFrameContext(frame);
    docs = ctx.docs;
    iframeDoc = ctx.doc;
    if (
      iframeDoc &&
      !areControlesLeitoFieldsEmpty(docs) &&
      findControlesLeitoSgClearButton(iframeDoc)
    ) {
      triggerControlesLeitoSgClear(iframeDoc);
      await sleep(MENU_SETTLE_MS);
      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      iframeDoc = ctx.doc;
      await softWaitUntil(function () {
        var live = refreshFrameContext(frame);
        return areControlesLeitoFieldsEmpty(live.docs);
      }, Math.max(SETTLE_MS, 350));
      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      iframeDoc = ctx.doc;
    }

    // Idle após Limpar / sgClear / reopen (Processando).
    var idleAfterClear = await waitControlesAjaxIdle(frame);
    if (!idleAfterClear.ok) return idleAfterClear;

    async function selectControlesPatientOnce() {
      ctx = refreshFrameContext(frame);
      docs = ctx.docs;
      iframeDoc = ctx.doc;
      await selectSuggestionProntuario(prontuario, docs);
    }

    // FEAT-110 / PM1C-AC-33: 2º+ fatia (mesmo prontuário) — paciente já
    // selecionado; autocomplete não abre painel → não re-select.
    ctx = refreshFrameContext(frame);
    docs = ctx.docs;
    var idleAfterSelect = { ok: true };
    if (isControlesSuggestionPatientMatch(docs, prontuario)) {
      logNavDecision("controles_skip_select_patient_already_selected");
    } else {
      try {
        await selectControlesPatientOnce();
      } catch (e) {
        if (isDeadObjectError(e)) {
          ctx = refreshFrameContext(frame);
          docs = ctx.docs;
          iframeDoc = ctx.doc;
          try {
            await selectControlesPatientOnce();
          } catch (e2) {
            return {
              ok: false,
              error: isDeadObjectError(e2)
                ? deadObjectUserError("Controles")
                : (e2 && e2.message) ||
                  "Falha ao selecionar paciente em Controles.",
            };
          }
        } else {
          return {
            ok: false,
            error:
              (e && e.message) || "Falha ao selecionar paciente em Controles.",
          };
        }
      }

      // Idle após select paciente (form_processing).
      idleAfterSelect = await waitControlesAjaxIdle(frame);
      if (!idleAfterSelect.ok) return idleAfterSelect;
    }

    if (period && !period.controlesWithinMax) {
      return {
        ok: false,
        error:
          "Período acima de 15 dias — Controles AGHU não permite. Use Semanal ou menor.",
      };
    }

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    if (!iframeDoc) {
      return {
        ok: false,
        error:
          "Aba Controles não abriu (iframe sem campo). Abra Visualizar Controles na casca AGHU.",
      };
    }

    setControlesDates(period || {}, iframeDoc);

    // Idle após datas (evita AJAX sobreposto com Pesquisar).
    var idleAfterDates = await waitControlesAjaxIdle(frame);
    if (!idleAfterDates.ok) return idleAfterDates;

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;

    var btn =
      (iframeDoc && iframeDoc.getElementById("bt_pesquisar:button")) ||
      (iframeDoc && iframeDoc.querySelector('button[id*="bt_pesquisar"]')) ||
      (iframeDoc &&
        iframeDoc.querySelector('button[id$="bt_pesquisar:button"]')) ||
      (iframeDoc && findMenuItemByText(["Pesquisar"], iframeDoc));

    if (!btn || !isLiveNode(btn)) {
      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
      btn =
        (iframeDoc && iframeDoc.getElementById("bt_pesquisar:button")) ||
        (iframeDoc && iframeDoc.querySelector('button[id*="bt_pesquisar"]')) ||
        (iframeDoc &&
          iframeDoc.querySelector('button[id$="bt_pesquisar:button"]')) ||
        (iframeDoc && findMenuItemByText(["Pesquisar"], iframeDoc));
    }

    if (!btn) {
      return {
        ok: false,
        error: "Botão Pesquisar de Controles não encontrado.",
      };
    }
    clickEl(btn);

    // Pós-Pesquisar: idle OU msgDialog «não existem registros» (Carregando pode ficar preso).
    // Escopo mínimo: se Carregando eterno mas grelha pronta → settled; senão 1 reopen casca.
    var pesqComplete = await waitControlesPesquisarComplete(frame);
    if (!pesqComplete.ok) {
      if (isControlesPesquisarSettled(frame)) {
        logNavDecision("controles_skip_reopen_already_settled", {
          phase: "pesquisar",
        });
        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        var settledEmpty =
          !!(iframeDoc &&
            isControlesEmptyRecordsMessage(
              readControlesSystemMessage(iframeDoc)
            )) ||
          (iframeDoc && countControlesGridRows(iframeDoc) === 0);
        pesqComplete = { ok: true, empty: settledEmpty || undefined };
      } else {
        var reopenedPesq = await recoverControlesCascaTab("pesquisar_stuck");
        if (!reopenedPesq) {
          return pesqComplete;
        }
        cleared = await clearControlesSuggestionOnce();
        if (!cleared) return pesqComplete;

        ctx = refreshFrameContext(frame);
        docs = ctx.docs;
        iframeDoc = ctx.doc;
        idleAfterClear = await waitControlesAjaxIdle(frame);
        if (!idleAfterClear.ok) return idleAfterClear;

        try {
          await selectControlesPatientOnce();
        } catch (eSel) {
          return {
            ok: false,
            error:
              (eSel && eSel.message) ||
              "Falha ao selecionar paciente em Controles.",
          };
        }
        idleAfterSelect = await waitControlesAjaxIdle(frame);
        if (!idleAfterSelect.ok) return idleAfterSelect;

        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        if (!iframeDoc) return pesqComplete;
        setControlesDates(period || {}, iframeDoc);
        idleAfterDates = await waitControlesAjaxIdle(frame);
        if (!idleAfterDates.ok) return idleAfterDates;

        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        btn =
          (iframeDoc && iframeDoc.getElementById("bt_pesquisar:button")) ||
          (iframeDoc && iframeDoc.querySelector('button[id*="bt_pesquisar"]')) ||
          (iframeDoc &&
            iframeDoc.querySelector('button[id$="bt_pesquisar:button"]')) ||
          (iframeDoc && findMenuItemByText(["Pesquisar"], iframeDoc));
        if (!btn) return pesqComplete;
        clickEl(btn);
        pesqComplete = await waitControlesPesquisarComplete(frame);
        if (!pesqComplete.ok && isControlesPesquisarSettled(frame)) {
          logNavDecision("controles_skip_reopen_already_settled", {
            phase: "pesquisar_retry",
          });
          pesqComplete = { ok: true };
        }
      }
    }
    if (!pesqComplete.ok) return pesqComplete;

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;

    var emptyByMsg =
      !!(iframeDoc &&
        isControlesEmptyRecordsMessage(readControlesSystemMessage(iframeDoc))) ||
      !!pesqComplete.empty;
    var rowCount = iframeDoc ? countControlesGridRows(iframeDoc) : null;
    var emptyByGrid = rowCount === 0;
    var hasGrid = rowCount != null && rowCount > 0;

    if (emptyByMsg || emptyByGrid) {
      if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
      return { ok: true, empty: true };
    }

    if (!hasGrid) {
      // Soft-wait curto: grelha pode chegar um pouco após idle.
      try {
        await waitFor(
          function () {
            var liveDoc = refreshFrameContext(frame).doc;
            if (!liveDoc) return null;
            if (
              isControlesEmptyRecordsMessage(
                readControlesSystemMessage(liveDoc)
              )
            ) {
              return { empty: true };
            }
            var n = countControlesGridRows(liveDoc);
            if (n === 0) return { empty: true };
            if (n != null && n > 0) return { grid: true };
            return null;
          },
          Math.min(15000, DEFAULT_TIMEOUT_MS),
          "Grelha de Controles"
        );
      } catch (_e2) {
        if (iframeDoc) dismissControlesMsgDialog(iframeDoc);
        return {
          ok: false,
          error:
            "Grelha de Controles não apareceu após Pesquisar. Confirme o paciente e o período ≤15 dias.",
        };
      }

      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
      if (
        iframeDoc &&
        (isControlesEmptyRecordsMessage(readControlesSystemMessage(iframeDoc)) ||
          countControlesGridRows(iframeDoc) === 0)
      ) {
        dismissControlesMsgDialog(iframeDoc);
        return { ok: true, empty: true };
      }
    }

    return finishControlesSubtabs(frame);
  }

  async function openPrescricoes(prontuario) {
    // Só títulos Consultar — hints "prescrição médica" ativam Manter/aba vazia.
    var rxTabHints = [
      "prescrições médicas",
      "prescricoes medicas",
    ];
    var frameHints = [
      "prescrições_médicas",
      "prescricoes_medicas",
      "i_frame_prescri",
      "prescricaomedica",
    ];

    async function reopenPrescricoesTab() {
      var addTabLink = findCascaAddTabLink([
        "selecionarPrescricaoConsultar",
        "selecionarprescricaoconsultar",
      ]);
      if (addTabLink) {
        await invokeAddTabLink(addTabLink);
        await sleep(MENU_SETTLE_MS);
      } else {
        await openMenuPath([
          ["Prescrição", "Prescricao"],
          ["Médica", "Medica"],
          ["Pesquisas"],
          ["Prescrições Médicas", "Prescricoes Medicas", "Prescrições médicas"],
        ]);
      }
    }

    async function waitPrescricoesIframe(timeoutMs, label) {
      return await waitForFrameField(
        frameHints,
        findPrescricoesProntuarioInDoc,
        label || "Campo pesqPaciente no iframe Prescrições",
        timeoutMs
      );
    }

    var activated = tryActivateCascaTab(rxTabHints);
    if (activated) {
      await sleep(SETTLE_MS);
    }

    var consultarHit = findFrameWithField(
      frameHints,
      findPrescricoesProntuarioInDoc
    );

    // Só addTab se aba não ativada E nenhum iframe Consultar com campo
    // (igual Controles — evita 2º addTab quando tryActivateCascaTab já rodou
    // e o pesqPaciente ainda está montando).
    var needAddTab = !consultarHit;
    if (!activated && needAddTab) {
      var addTabLink = findCascaAddTabLink([
        "selecionarPrescricaoConsultar",
        "selecionarprescricaoconsultar",
      ]);
      if (addTabLink) {
        await invokeAddTabLink(addTabLink);
        await sleep(MENU_SETTLE_MS);
      } else {
        await openMenuPath([
          ["Prescrição", "Prescricao"],
          ["Médica", "Medica"],
          ["Pesquisas"],
          ["Prescrições Médicas", "Prescricoes Medicas", "Prescrições médicas"],
        ]);
      }
    } else if (consultarHit && !activated) {
      logNavDecision("prescricoes_skip_addtab_existing_frame");
      await sleep(SETTLE_MS);
    }

    await sleep(SETTLE_MS);

    var frameHit;
    try {
      frameHit = await waitPrescricoesIframe(
        Math.min(20000, DEFAULT_TIMEOUT_MS),
        "Campo pesqPaciente no iframe Prescrições (iframe visível)"
      );
    } catch (_e) {
      if (MAX_STEP_RECOVER >= 1) {
        await closeAndReopenCascaTab(rxTabHints, reopenPrescricoesTab);
        tryActivateCascaTab(rxTabHints);
        await sleep(SETTLE_MS);
        try {
          frameHit = await waitPrescricoesIframe(
            Math.min(12000, DEFAULT_TIMEOUT_MS),
            "Campo pesqPaciente no iframe Prescrições (pós-recover iframe)"
          );
        } catch (_eRecover) {
          return {
            ok: false,
            error:
              "Aba Prescrições não abriu (iframe sem campo após recover). Abra Prescrições Médicas (Consultar) na casca AGHU.",
          };
        }
      } else {
        return {
          ok: false,
          error:
            "Aba Prescrições não abriu (iframe sem campo). Abra Prescrições Médicas (Consultar) na casca AGHU.",
        };
      }
    }

    var frame = frameHit.frame;
    var digits = digitsOnly(prontuario);
    var want = normalizeProntuarioDigits(prontuario);

    // Lote: limpar prontuário+nome+lista do paciente anterior antes do fill.
    var clearDoc = refreshFrameContext(frame).doc || frameHit.doc;
    if (clearDoc) {
      clickClearInDoc(clearDoc, [
        "pesqPaciente:pesqPaciente:sgClear",
        'button[id*="pesqPaciente"][id$="sgClear"]',
      ]);
    }
    await sleep(MENU_SETTLE_MS);

    // Clear AJAX recria pesqPaciente — nunca reusar Element pré-clear (|| stale).
    var ctx = refreshFrameContext(frame);
    var iframeDoc = ctx.doc;
    try {
      var afterClear = await waitForFrameField(
        frameHints,
        findPrescricoesProntuarioInDoc,
        "Campo pesqPaciente no iframe Prescrições (pós-sgClear)",
        Math.min(8000, DEFAULT_TIMEOUT_MS)
      );
      frame = afterClear.frame;
      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
    } catch (_eRefresh) {
      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
    }

    await softWaitUntil(function () {
      var liveDoc = refreshFrameContext(frame).doc;
      var cur = liveDoc && findPrescricoesProntuarioInDoc(liveDoc);
      if (cur && !isLiveNode(cur)) return false;
      return !cur || !String(cur.value || "").trim();
    }, Math.max(SETTLE_MS * 3, 400));

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    var prontInput = iframeDoc && findPrescricoesProntuarioInDoc(iframeDoc);

    if (!prontInput || !isLiveNode(prontInput)) {
      return {
        ok: false,
        error:
          "Aba Prescrições não abriu (iframe sem campo). Abra Prescrições Médicas (Consultar) na casca AGHU.",
      };
    }

    function fillAndTriggerRx() {
      try {
        prontInput.focus();
      } catch (_eFocus) {}
      setNativeValue(prontInput, digits);
    }

    try {
      fillAndTriggerRx();
    } catch (eFill) {
      if (isDeadObjectError(eFill)) {
        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        prontInput = iframeDoc && findPrescricoesProntuarioInDoc(iframeDoc);
        if (!prontInput || !isLiveNode(prontInput)) {
          return {
            ok: false,
            error: deadObjectUserError("Prescrições"),
          };
        }
        try {
          fillAndTriggerRx();
        } catch (eFill2) {
          return {
            ok: false,
            error: isDeadObjectError(eFill2)
              ? deadObjectUserError("Prescrições")
              : (eFill2 && eFill2.message) ||
                "Falha ao preencher prontuário em Prescrições.",
          };
        }
      } else {
        return {
          ok: false,
          error:
            (eFill && eFill.message) ||
            "Falha ao preencher prontuário em Prescrições.",
        };
      }
    }

    await sleep(MENU_SETTLE_MS);

    var filled = "";
    try {
      filled = normalizeProntuarioDigits(prontInput.value);
    } catch (eVal) {
      if (isDeadObjectError(eVal)) {
        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        prontInput = iframeDoc && findPrescricoesProntuarioInDoc(iframeDoc);
        filled = prontInput
          ? normalizeProntuarioDigits(prontInput.value)
          : "";
      } else {
        throw eVal;
      }
    }
    if (!filled || filled !== want) {
      return {
        ok: false,
        error:
          "AGHU não selecionou o prontuário " +
          want +
          " (ativo: " +
          (filled || "nenhum") +
          ")",
      };
    }

    // HUCAM Consultar: onchange → PrimeFaces.ab (não há botão Pesquisar).
    try {
      triggerPesqPacienteChange(prontInput);
    } catch (eAb) {
      if (isDeadObjectError(eAb)) {
        ctx = refreshFrameContext(frame);
        iframeDoc = ctx.doc;
        prontInput = iframeDoc && findPrescricoesProntuarioInDoc(iframeDoc);
        if (!prontInput || !isLiveNode(prontInput)) {
          return { ok: false, error: deadObjectUserError("Prescrições") };
        }
        triggerPesqPacienteChange(prontInput);
      } else {
        return {
          ok: false,
          error:
            (eAb && eAb.message) ||
            "Falha ao disparar busca em Prescrições.",
        };
      }
    }

    var listaWaitMs = Math.min(15000, DEFAULT_TIMEOUT_MS);

    function prescricoesListaReady() {
      var liveDoc = refreshFrameContext(frame).doc;
      return !!(liveDoc && findPrescricoesListaInDoc(liveDoc));
    }

    // PM1C-AC-16: ab → wait lista; Pesquisar legado só se lista falhou.
    if (await softWaitUntil(prescricoesListaReady, listaWaitMs)) {
      return { ok: true };
    }

    ctx = refreshFrameContext(frame);
    iframeDoc = ctx.doc;
    var searchBtn =
      (iframeDoc && findMenuItemByText(["Pesquisar", "Search"], iframeDoc)) ||
      (iframeDoc && iframeDoc.querySelector('button[id*="bt_pesquisar"]'));
    if (searchBtn) {
      clickEl(searchBtn);
      if (await softWaitUntil(prescricoesListaReady, listaWaitMs)) {
        return { ok: true };
      }
    }

    // Recover 1×: close+reopen Consultar → fill+ab → wait.
    if (MAX_STEP_RECOVER >= 1) {
      async function reopenPrescricoesTab() {
        var addTabLink = findCascaAddTabLink([
          "selecionarPrescricaoConsultar",
          "selecionarprescricaoconsultar",
        ]);
        if (addTabLink) {
          await invokeAddTabLink(addTabLink);
          await sleep(MENU_SETTLE_MS);
        } else {
          await openMenuPath([
            ["Prescrição", "Prescricao"],
            ["Médica", "Medica"],
            ["Pesquisas"],
            ["Prescrições Médicas", "Prescricoes Medicas", "Prescrições médicas"],
          ]);
        }
      }

      await closeAndReopenCascaTab(rxTabHints, reopenPrescricoesTab);
      try {
        frameHit = await waitForFrameField(
          frameHints,
          findPrescricoesProntuarioInDoc,
          "Campo pesqPaciente no iframe Prescrições (pós-reopen)",
          Math.min(12000, DEFAULT_TIMEOUT_MS)
        );
        frame = frameHit.frame;
      } catch (_eRxReopen) {
        return {
          ok: false,
          error:
            "Lista de prescrições não apareceu após a busca. Abra Prescrições Médicas (Consultar) e confirme o prontuário.",
        };
      }

      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
      if (iframeDoc) {
        clickClearInDoc(iframeDoc, [
          "pesqPaciente:pesqPaciente:sgClear",
          'button[id*="pesqPaciente"][id$="sgClear"]',
        ]);
      }
      await sleep(MENU_SETTLE_MS);
      await softWaitUntil(function () {
        var liveDoc = refreshFrameContext(frame).doc;
        var cur = liveDoc && findPrescricoesProntuarioInDoc(liveDoc);
        if (cur && !isLiveNode(cur)) return false;
        return !cur || !String(cur.value || "").trim();
      }, Math.max(SETTLE_MS * 3, 400));

      ctx = refreshFrameContext(frame);
      iframeDoc = ctx.doc;
      prontInput = iframeDoc && findPrescricoesProntuarioInDoc(iframeDoc);
      if (!prontInput || !isLiveNode(prontInput)) {
        return {
          ok: false,
          error:
            "Lista de prescrições não apareceu após a busca. Abra Prescrições Médicas (Consultar) e confirme o prontuário.",
        };
      }

      setNativeValue(prontInput, digits);
      filled = normalizeProntuarioDigits(prontInput.value);
      if (!filled || filled !== want) {
        return {
          ok: false,
          error:
            "AGHU não selecionou o prontuário " +
            want +
            " (ativo: " +
            (filled || "nenhum") +
            ")",
        };
      }
      triggerPesqPacienteChange(prontInput);
      if (await softWaitUntil(prescricoesListaReady, listaWaitMs)) {
        return { ok: true };
      }
    }

    return {
      ok: false,
      error:
        "Lista de prescrições não apareceu após a busca. Abra Prescrições Médicas (Consultar) e confirme o prontuário.",
    };
  }

  async function handleNav(msg) {
    var target = String((msg && msg.target) || "").toLowerCase();
    var prontuario = msg && msg.prontuario;
    var period = msg && msg.period;

    if (target === "pol") {
      return openPol(prontuario);
    }
    if (target === "controles") {
      return openControles(prontuario, period);
    }
    if (target === "prescricoes" || target === "prescricao") {
      return openPrescricoes(prontuario);
    }
    if (
      target === "closecontrolesprescricoes" ||
      target === "close_controles_prescricoes"
    ) {
      return closeControlesPrescricoesTabs();
    }
    return { ok: false, error: "Alvo de navegação desconhecido: " + target };
  }

  /** Só para testes Node/JSDOM — encurta polls / settles. */
  function _setTimingForTests(opts) {
    opts = opts || {};
    if (opts.pollMs != null) POLL_MS = opts.pollMs;
    if (opts.gateTimeoutMs != null) GATE_TIMEOUT_MS = opts.gateTimeoutMs;
    if (opts.defaultTimeoutMs != null) DEFAULT_TIMEOUT_MS = opts.defaultTimeoutMs;
    if (opts.settleMs != null) SETTLE_MS = opts.settleMs;
    if (opts.menuSettleMs != null) MENU_SETTLE_MS = opts.menuSettleMs;
    if (opts.ajaxIdleTimeoutMs != null) AJAX_IDLE_TIMEOUT_MS = opts.ajaxIdleTimeoutMs;
    if (opts.liberadosStabilizeMs != null) {
      LIBERADOS_STABILIZE_MS = opts.liberadosStabilizeMs;
    }
  }

  /** Só para testes — zera fingerprint de sessão Liberados. */
  function _resetLiberadosSessionFpForTests() {
    _lastLiberadosFp = "";
  }

  // Exposto para testes/fixtures (sem PHI)
  if (typeof window !== "undefined") {
    window.AghuCascaNav = {
      formatPolProntuario: formatPolProntuario,
      setNativeValue: setNativeValue,
      triggerAutocompleteQuery: triggerAutocompleteQuery,
      triggerPesqPacienteChange: triggerPesqPacienteChange,
      triggerIframeSearch: triggerIframeSearch,
      triggerPolOpen: triggerPolOpen,
      parseAbUpdateFromOnchange: parseAbUpdateFromOnchange,
      findAutocompleteItem: findAutocompleteItem,
      findFrameByHints: findFrameByHints,
      findFrameWithField: findFrameWithField,
      tryActivateCascaTab: tryActivateCascaTab,
      findCascaTabLiByTitle: findCascaTabLiByTitle,
      waitForFrameDoc: waitForFrameDoc,
      queryInDocs: queryInDocs,
      getPageWindow: getPageWindow,
      getDocWindow: getDocWindow,
      runInDocWindow: runInDocWindow,
      runHumanStep: runHumanStep,
      closeAndReopenCascaTab: closeAndReopenCascaTab,
      invokeCascaOnclick: invokeCascaOnclick,
      expandCascaMenuAncestors: expandCascaMenuAncestors,
      findCascaAddTabLink: findCascaAddTabLink,
      resolveCascaMenuClickTarget: resolveCascaMenuClickTarget,
      readActivePolProntuarioDigits: readActivePolProntuarioDigits,
      waitForCascaProntuario: waitForCascaProntuario,
      findLiberadosTable: findLiberadosTable,
      liberadosTableFingerprint: liberadosTableFingerprint,
      frameHasExamesLiberadosRows: frameHasExamesLiberadosRows,
      findExamesRestoreLink: findExamesRestoreLink,
      planExamesRestoreClick: planExamesRestoreClick,
      clickExamesAndWaitLiberados: clickExamesAndWaitLiberados,
      _resetLiberadosSessionFpForTests: _resetLiberadosSessionFpForTests,
      clickClearInDoc: clickClearInDoc,
      triggerControlesLimparPesquisa: triggerControlesLimparPesquisa,
      triggerControlesSgClear: triggerControlesSgClear,
      findControlesLimparButton: findControlesLimparButton,
      findControlesHidricoTab: findControlesHidricoTab,
      findControlesMonitorizacaoTab: findControlesMonitorizacaoTab,
      findControlesHidricoPanelInDoc: findControlesHidricoPanelInDoc,
      isControlesAjaxBusy: isControlesAjaxBusy,
      waitControlesAjaxIdle: waitControlesAjaxIdle,
      waitControlesPesquisarComplete: waitControlesPesquisarComplete,
      findControlesMsgDialog: findControlesMsgDialog,
      readControlesSystemMessage: readControlesSystemMessage,
      isControlesEmptyRecordsMessage: isControlesEmptyRecordsMessage,
      isControlesPesquisarComplete: isControlesPesquisarComplete,
      dismissControlesMsgDialog: dismissControlesMsgDialog,
      countControlesGridRows: countControlesGridRows,
      triggerControlesLeitoSgClear: triggerControlesLeitoSgClear,
      areControlesLeitoFieldsEmpty: areControlesLeitoFieldsEmpty,
      areControlesSuggestionFieldsEmpty: areControlesSuggestionFieldsEmpty,
      isControlesSuggestionPatientMatch: isControlesSuggestionPatientMatch,
      isControlesPesquisarSettled: isControlesPesquisarSettled,
      isControlesAlreadyNavigated: isControlesAlreadyNavigated,
      isControlesPeriodMatching: isControlesPeriodMatching,
      finishControlesSubtabs: finishControlesSubtabs,
      refreshFrameContext: refreshFrameContext,
      isLiveNode: isLiveNode,
      openPol: openPol,
      openControles: openControles,
      openPrescricoes: openPrescricoes,
      findCascaTabLiByTitle: findCascaTabLiByTitle,
      closeCascaTabByTitle: closeCascaTabByTitle,
      closeControlesPrescricoesTabs: closeControlesPrescricoesTabs,
      handleNav: handleNav,
      _setTimingForTests: _setTimingForTests,
      MAX_STEP_RECOVER: MAX_STEP_RECOVER,
    };
  }

  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
      if (!request || request.action !== "aghuCascaNav") return false;
      handleNav(request)
        .then(function (res) {
          sendResponse(res || { ok: false, error: "Sem resposta da navegação." });
        })
        .catch(function (e) {
          sendResponse({
            ok: false,
            error: (e && e.message) || "Erro na navegação casca.",
          });
        });
      return true;
    });
  }
})();
