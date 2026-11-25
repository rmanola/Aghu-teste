/**
 * Preferência de tema: system | light | dark (popup + testes Node).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuThemePreference = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "aghu_theme";
  var VALID = ["system", "light", "dark"];
  var CYCLE = ["system", "light", "dark"];

  function normalizePreference(value) {
    if (typeof value !== "string") return "system";
    var v = value.trim().toLowerCase();
    return VALID.indexOf(v) >= 0 ? v : "system";
  }

  /**
   * @param {"system"|"light"|"dark"} preference
   * @param {boolean} prefersDark — resultado de matchMedia('prefers-color-scheme: dark')
   * @returns {"light"|"dark"}
   */
  function resolveTheme(preference, prefersDark) {
    var pref = normalizePreference(preference);
    if (pref === "light") return "light";
    if (pref === "dark") return "dark";
    return prefersDark ? "dark" : "light";
  }

  /**
   * Aplica data-theme no documento. system → remove atributo (CSS media decide).
   * @param {Document} doc
   * @param {"system"|"light"|"dark"} preference
   */
  function applyThemePreference(doc, preference) {
    var pref = normalizePreference(preference);
    var el = doc && doc.documentElement;
    if (!el) return;
    if (pref === "system") {
      el.removeAttribute("data-theme");
      return;
    }
    el.setAttribute("data-theme", pref);
  }

  function nextPreference(current) {
    var pref = normalizePreference(current);
    var idx = CYCLE.indexOf(pref);
    return CYCLE[(idx + 1) % CYCLE.length];
  }

  function preferenceLabel(preference) {
    var pref = normalizePreference(preference);
    if (pref === "light") return "Tema claro";
    if (pref === "dark") return "Tema escuro";
    return "Tema do sistema";
  }

  /**
   * @param {{ get: (keys: string|string[]) => Promise<Record<string, unknown>> }} storage
   */
  async function loadThemePreference(storage) {
    if (!storage || typeof storage.get !== "function") return "system";
    try {
      var res = await storage.get(STORAGE_KEY);
      return normalizePreference(res && res[STORAGE_KEY]);
    } catch (_e) {
      return "system";
    }
  }

  /**
   * @param {{ set: (obj: Record<string, string>) => Promise<void> }} storage
   */
  async function saveThemePreference(storage, preference) {
    if (!storage || typeof storage.set !== "function") return;
    await storage.set({ [STORAGE_KEY]: normalizePreference(preference) });
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    VALID: VALID,
    CYCLE: CYCLE,
    normalizePreference: normalizePreference,
    resolveTheme: resolveTheme,
    applyThemePreference: applyThemePreference,
    nextPreference: nextPreference,
    preferenceLabel: preferenceLabel,
    loadThemePreference: loadThemePreference,
    saveThemePreference: saveThemePreference,
  };
});
