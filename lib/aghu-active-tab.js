/**
 * Resolve a aba AGHU para sendMessage a partir do popup (janela separada).
 * CTRL-AC-01 / CTRL-AC-02
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuActiveTab = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_PATTERNS = [
    "*://*.hcpa.edu.br/*",
    "*://*.ebserh.gov.br/*",
    "*://aghu.hucam-ufes.ebserh/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ];

  var STORAGE_KEY = "aghu_source_tab_id";

  /**
   * @param {string} pattern
   * @param {string} url
   * @returns {boolean}
   */
  function matchUrlPattern(pattern, url) {
    if (!pattern || !url) return false;
    var escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$", "i");
    return re.test(String(url));
  }

  /**
   * @param {string | undefined | null} url
   * @param {string[] | undefined} patterns
   * @returns {boolean}
   */
  function isAghuUrl(url, patterns) {
    var list = patterns && patterns.length ? patterns : DEFAULT_PATTERNS;
    if (!url) return false;
    for (var i = 0; i < list.length; i++) {
      if (matchUrlPattern(list[i], url)) return true;
    }
    return false;
  }

  /**
   * @param {import('webextension-polyfill').Tabs.Tab[]} tabs
   * @param {number | null | undefined} focusedWindowId
   * @returns {number | null}
   */
  function pickBestAghuTabId(tabs, focusedWindowId) {
    if (!tabs || !tabs.length) return null;
    if (focusedWindowId != null) {
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        if (t.windowId === focusedWindowId && t.active) return t.id;
      }
    }
    for (var j = 0; j < tabs.length; j++) {
      if (tabs[j].active) return tabs[j].id;
    }
    return tabs[0].id;
  }

  /**
   * @param {{
   *   patterns?: string[],
   *   getStoredTabId?: () => Promise<number | null | undefined>,
   *   tabsGet?: (id: number) => Promise<{ url?: string } | null>,
   *   tabsQuery?: (query: object) => Promise<Array<{ id: number, url?: string, active?: boolean, windowId?: number }>>,
   *   windowsGetAll?: (query?: object) => Promise<Array<{ id?: number, focused?: boolean }>>,
   * }} [deps]
   * @returns {Promise<number | null>}
   */
  async function resolveAghuTabId(deps) {
    deps = deps || {};
    var patterns = deps.patterns || DEFAULT_PATTERNS;

    var storedId =
      deps.getStoredTabId != null
        ? await deps.getStoredTabId()
        : null;

    if (storedId != null && deps.tabsGet) {
      try {
        var storedTab = await deps.tabsGet(storedId);
        if (storedTab && isAghuUrl(storedTab.url, patterns)) {
          return storedId;
        }
      } catch (_e) {
        /* tab fechada ou inválida */
      }
    }

    if (!deps.tabsQuery) return null;

    var allTabs = await deps.tabsQuery({});
    var aghuTabs = [];
    for (var i = 0; i < allTabs.length; i++) {
      var tab = allTabs[i];
      if (tab && tab.id != null && isAghuUrl(tab.url, patterns)) {
        aghuTabs.push(tab);
      }
    }
    if (!aghuTabs.length) return null;

    var focusedWindowId = null;
    if (deps.windowsGetAll) {
      try {
        var wins = await deps.windowsGetAll({ windowTypes: ["normal"] });
        for (var w = 0; w < wins.length; w++) {
          if (wins[w].focused && wins[w].id != null) {
            focusedWindowId = wins[w].id;
            break;
          }
        }
      } catch (_e2) {
        /* ignore */
      }
    }

    return pickBestAghuTabId(aghuTabs, focusedWindowId);
  }

  /**
   * @returns {Promise<number | null>}
   */
  async function resolveAghuTabIdFromBrowser() {
    if (typeof browser === "undefined") return null;
    return resolveAghuTabId({
      patterns:
        typeof AghuHostPatterns !== "undefined" &&
        AghuHostPatterns.AGHU_HOST_PATTERNS
          ? AghuHostPatterns.AGHU_HOST_PATTERNS
          : DEFAULT_PATTERNS,
      getStoredTabId: async function () {
        var res = await browser.storage.local.get(STORAGE_KEY);
        return res[STORAGE_KEY] || null;
      },
      tabsGet: function (id) {
        return browser.tabs.get(id);
      },
      tabsQuery: function (query) {
        return browser.tabs.query(query);
      },
      windowsGetAll: function (query) {
        return browser.windows.getAll(query);
      },
    });
  }

  /**
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  async function persistAghuTabId(tabId) {
    if (typeof browser === "undefined" || tabId == null) return;
    var obj = {};
    obj[STORAGE_KEY] = tabId;
    await browser.storage.local.set(obj);
  }

  var EXTRACT_MESSAGE_TIMEOUT_MS = 30000;

  var CONTROLES_SCRIPT_FILES = [
    "lib/patient-identity.js",
    "lib/patient-dom-extract.js",
    "lib/controles-vital-sanitize.js",
    "lib/controles-monitor-columns.js",
    "lib/controles-bh-columns.js",
    "lib/controles-bh-rows.js",
    "lib/controles-window.js",
    "lib/controles-cell-extract.js",
    "lib/controles-extract-response.js",
    "content/controles_content.js",
  ];

  var CIRURGIAS_SCRIPT_FILES = [
    "lib/patient-identity.js",
    "lib/patient-dom-extract.js",
    "lib/date-br.js",
    "lib/pdf-fetch-config.js",
    "lib/pdf-fetch-wait.js",
    "lib/cirurgias-pol-parse.js",
    "lib/cirurgias-descricao-pdf-parse.js",
    "lib/cirurgias-extract-outcome.js",
    "lib/cirurgias-period-filter.js",
    "content/cirurgia_content.js",
  ];

  var CASCA_NAV_SCRIPT_FILES = [
    "lib/patient-identity.js",
    "content/aghu-casca-nav.js",
  ];

  /** Alinhado ao content_scripts de prescrição no manifest (catalog → classify → content). */
  var PRESCRICAO_SCRIPT_FILES = [
    "lib/patient-identity.js",
    "lib/patient-dom-extract.js",
    "lib/date-br.js",
    "lib/prescricao-date-window.js",
    "lib/receita-medication-catalog.js",
    "lib/prescricao-medication-classify.js",
    "content/aghu-casca-nav.js",
    "content/prescricao_content.js",
  ];

  var CADASTRO_SCRIPT_FILES = [
    "lib/patient-identity.js",
    "lib/patient-dom-extract.js",
    "lib/date-br.js",
    "lib/ckd-epi-egfr.js",
    "lib/patient-pol-demographics.js",
    "lib/patient-pol-historico-internacoes.js",
    "content/aghu-casca-nav.js",
    "content/content.js",
  ];

  /**
   * @param {number} tabId
   * @param {string[]} files
   * @param {{ executeScript?: Function, delayMs?: number }} [deps]
   */
  async function injectScriptChain(tabId, files, deps) {
    deps = deps || {};
    var inject =
      deps.executeScript ||
      (typeof browser !== "undefined" ? browser.tabs.executeScript : null);
    if (!inject || !tabId || !files || !files.length) return;
    var delayMs = deps.delayMs != null ? deps.delayMs : 50;
    for (var i = 0; i < files.length; i++) {
      await inject(tabId, { file: files[i] });
      if (delayMs > 0) {
        await new Promise(function (r) {
          setTimeout(r, delayMs);
        });
      }
    }
  }

  /**
   * @param {number} tabId
   * @param {object} message
   * @param {{ timeoutMs?: number, sendMessage?: Function, injectFiles?: string[], executeScript?: Function }} [deps]
   * @returns {Promise<object>}
   */
  async function sendTabMessageWithTimeout(tabId, message, deps) {
    deps = deps || {};
    var timeoutMs =
      deps.timeoutMs != null ? deps.timeoutMs : EXTRACT_MESSAGE_TIMEOUT_MS;
    var sendMessage =
      deps.sendMessage ||
      (typeof browser !== "undefined" ? browser.tabs.sendMessage : null);
    if (!sendMessage) {
      throw new Error("sendMessage indisponível");
    }

    function raceSend() {
      return Promise.race([
        sendMessage(tabId, message),
        new Promise(function (_resolve, reject) {
          setTimeout(function () {
            reject(new Error("timeout_extracao"));
          }, timeoutMs);
        }),
      ]);
    }

    if (deps.forceInjectBeforeSend && deps.injectFiles && deps.injectFiles.length) {
      await injectScriptChain(tabId, deps.injectFiles, {
        executeScript: deps.executeScript,
      });
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
    }

    try {
      return await raceSend();
    } catch (firstErr) {
      if (deps.injectFiles && deps.injectFiles.length) {
        await injectScriptChain(tabId, deps.injectFiles, {
          executeScript: deps.executeScript,
        });
        await new Promise(function (r) {
          setTimeout(r, 200);
        });
        return await raceSend();
      }
      throw firstErr;
    }
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_PATTERNS: DEFAULT_PATTERNS,
    EXTRACT_MESSAGE_TIMEOUT_MS: EXTRACT_MESSAGE_TIMEOUT_MS,
    CONTROLES_SCRIPT_FILES: CONTROLES_SCRIPT_FILES,
    CIRURGIAS_SCRIPT_FILES: CIRURGIAS_SCRIPT_FILES,
    CASCA_NAV_SCRIPT_FILES: CASCA_NAV_SCRIPT_FILES,
    PRESCRICAO_SCRIPT_FILES: PRESCRICAO_SCRIPT_FILES,
    CADASTRO_SCRIPT_FILES: CADASTRO_SCRIPT_FILES,
    matchUrlPattern: matchUrlPattern,
    isAghuUrl: isAghuUrl,
    pickBestAghuTabId: pickBestAghuTabId,
    resolveAghuTabId: resolveAghuTabId,
    resolveAghuTabIdFromBrowser: resolveAghuTabIdFromBrowser,
    persistAghuTabId: persistAghuTabId,
    injectScriptChain: injectScriptChain,
    sendTabMessageWithTimeout: sendTabMessageWithTimeout,
  };
});
