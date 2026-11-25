/**
 * Preferências de ferramenta da extensão (FEAT-306).
 * Fonte de verdade: Edge user-preferences domain `extension_settings`.
 * Cache local `aghu_extension_settings_v1` = espelho da última leitura OK.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuExtensionSettings = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DOMAIN = "extension_settings";
  var CACHE_KEY = "aghu_extension_settings_v1";
  var LEGACY_PA_KEY = "aghu_controles_pa_format";

  var DEFAULT_SERVICE_LINE = "SERVIÇO DE CIRURGIA DO APARELHO DIGESTIVO";
  var DEFAULT_LOCATION_LINE = "HUCAM - Vitória, Espírito Santo";

  var SERVICE_PRESETS = [
    "SERVIÇO DE CIRURGIA DO APARELHO DIGESTIVO",
    "SERVIÇO DE CIRURGIA GERAL",
    "SERVIÇO DE CIRURGIA VASCULAR",
    "SERVIÇO DE CIRURGIA TORÁCICA",
    "SERVIÇO DE UROLOGIA",
    "SERVIÇO DE GINECOLOGIA E OBSTETRÍCIA",
    "SERVIÇO DE CLÍNICA MÉDICA",
    "SERVIÇO DE ORTOPEDIA E TRAUMATOLOGIA",
  ];

  var PRESET_OTHER = "__other__";

  function defaultsApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-defaults.js");
      } catch (_e) {}
    }
    return typeof globalThis !== "undefined" ? globalThis.AghuAltaDefaults : null;
  }

  function resolveDefaults() {
    var d = defaultsApi();
    return {
      service_line:
        (d && d.DEFAULT_SERVICE_LINE) || DEFAULT_SERVICE_LINE,
      location_line:
        (d && d.DEFAULT_LOCATION_LINE) || DEFAULT_LOCATION_LINE,
      pa_format: "minmax",
    };
  }

  function normalizePaFormat(raw) {
    return raw === "sequence" ? "sequence" : "minmax";
  }

  /**
   * @param {string} presetId — índice em SERVICE_PRESETS ou PRESET_OTHER
   * @param {string} customText
   * @returns {string}
   */
  function normalizeServiceSelection(presetId, customText) {
    var defs = resolveDefaults();
    if (presetId === PRESET_OTHER) {
      var custom = String(customText || "").trim();
      return custom || defs.service_line;
    }
    var idx = Number(presetId);
    if (Number.isFinite(idx) && idx >= 0 && idx < SERVICE_PRESETS.length) {
      return SERVICE_PRESETS[idx];
    }
    var asText = String(presetId || "").trim();
    if (SERVICE_PRESETS.indexOf(asText) >= 0) return asText;
    return defs.service_line;
  }

  /**
   * @param {string} serviceLine
   * @returns {{ presetId: string, customText: string }}
   */
  function matchServicePreset(serviceLine) {
    var line = String(serviceLine || "").trim();
    var idx = SERVICE_PRESETS.indexOf(line);
    if (idx >= 0) {
      return { presetId: String(idx), customText: "" };
    }
    if (!line) {
      return { presetId: "0", customText: "" };
    }
    return { presetId: PRESET_OTHER, customText: line };
  }

  /**
   * @param {unknown} raw
   * @returns {{ service_line: string, location_line: string, pa_format: "minmax"|"sequence" }}
   */
  function normalizeSettings(raw) {
    var defs = resolveDefaults();
    var src = raw && typeof raw === "object" ? raw : {};
    var service =
      typeof src.service_line === "string" && src.service_line.trim()
        ? src.service_line.trim()
        : defs.service_line;
    var location =
      typeof src.location_line === "string" && src.location_line.trim()
        ? src.location_line.trim()
        : defs.location_line;
    return {
      service_line: service,
      location_line: location,
      pa_format: normalizePaFormat(src.pa_format),
    };
  }

  function storageLocal() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return null;
  }

  function prefsClient() {
    return typeof globalThis !== "undefined"
      ? globalThis.AghuUserPreferencesClient
      : null;
  }

  async function readCache() {
    var st = storageLocal();
    if (!st) return null;
    try {
      var got = await st.get(CACHE_KEY);
      return got && got[CACHE_KEY] ? normalizeSettings(got[CACHE_KEY]) : null;
    } catch (_e) {
      return null;
    }
  }

  async function writeCache(settings) {
    var st = storageLocal();
    if (!st) return;
    try {
      var obj = {};
      obj[CACHE_KEY] = normalizeSettings(settings);
      await st.set(obj);
    } catch (_e) {
      /* ignore */
    }
  }

  async function readLegacyPaFormat() {
    var st = storageLocal();
    if (!st) return null;
    try {
      var got = await st.get(LEGACY_PA_KEY);
      if (got && got[LEGACY_PA_KEY] === "sequence") return "sequence";
      if (got && got[LEGACY_PA_KEY] === "minmax") return "minmax";
      return null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * CFG-AC-10: se cloud vazio e há chave legacy, migrar one-shot.
   * @param {object} cloudNormalized
   */
  async function maybeMigrateLegacyPa(cloudNormalized) {
    var legacy = await readLegacyPaFormat();
    if (!legacy || legacy === cloudNormalized.pa_format) return cloudNormalized;
    var next = Object.assign({}, cloudNormalized, { pa_format: legacy });
    var client = prefsClient();
    if (client && typeof client.writeUserPreference === "function") {
      var ok = await client.writeUserPreference(DOMAIN, next);
      if (ok) {
        await writeCache(next);
        var st = storageLocal();
        if (st) {
          try {
            var legacyObj = {};
            legacyObj[LEGACY_PA_KEY] = next.pa_format;
            await st.set(legacyObj);
          } catch (_e) {
            /* ignore */
          }
        }
        return next;
      }
    }
    return next;
  }

  /**
   * @returns {Promise<{ settings: object, source: "cloud"|"cache"|"defaults", error?: string }>}
   */
  async function loadSettings() {
    var client = prefsClient();
    var cached = await readCache();

    if (client && typeof client.readUserPreferences === "function") {
      try {
        var data = await client.readUserPreferences([DOMAIN]);
        var row = data && data[DOMAIN];
        if (row && typeof row === "object") {
          var hasContent =
            (typeof row.service_line === "string" && row.service_line.trim()) ||
            (typeof row.location_line === "string" && row.location_line.trim()) ||
            row.pa_format === "sequence" ||
            row.updated_at;
          var normalized = normalizeSettings(row);
          if (hasContent) {
            await writeCache(normalized);
            return { settings: normalized, source: "cloud" };
          }
          var migrated = await maybeMigrateLegacyPa(normalized);
          await writeCache(migrated);
          return { settings: migrated, source: "cloud" };
        }
      } catch (_e) {
        /* fall through */
      }
    }

    if (cached) {
      return { settings: cached, source: "cache" };
    }

    var defs = resolveDefaults();
    var legacyOnly = await readLegacyPaFormat();
    if (legacyOnly) {
      defs = Object.assign({}, defs, { pa_format: legacyOnly });
    }
    return { settings: defs, source: "defaults" };
  }

  /**
   * @param {Partial<{service_line:string,location_line:string,pa_format:string}>} partial
   * @param {object} [baseSettings]
   * @returns {Promise<{ ok: boolean, settings?: object, error?: string }>}
   */
  async function saveSettings(partial, baseSettings) {
    var base =
      baseSettings && typeof baseSettings === "object"
        ? baseSettings
        : (await loadSettings()).settings;
    var merged = normalizeSettings(Object.assign({}, base, partial || {}));

    var auth =
      typeof globalThis !== "undefined" ? globalThis.AghuSupabaseAuth : null;
    if (auth && typeof auth.getSession === "function") {
      try {
        var session = await auth.getSession();
        if (!session || !session.access_token) {
          return { ok: false, error: "no_session", settings: merged };
        }
      } catch (_e) {
        return { ok: false, error: "no_session", settings: merged };
      }
    }

    var client = prefsClient();
    if (!client || typeof client.writeUserPreference !== "function") {
      return { ok: false, error: "no_session", settings: merged };
    }

    var ok = await client.writeUserPreference(DOMAIN, merged);
    if (!ok) {
      return { ok: false, error: "save_failed", settings: merged };
    }
    await writeCache(merged);
    var st = storageLocal();
    if (st) {
      try {
        var legacy = {};
        legacy[LEGACY_PA_KEY] = merged.pa_format;
        await st.set(legacy);
      } catch (_e2) {
        /* ignore */
      }
    }
    return { ok: true, settings: merged };
  }

  /**
   * @returns {Promise<"minmax"|"sequence">}
   */
  async function getPaFormat() {
    var out = await loadSettings();
    return normalizePaFormat(out.settings.pa_format);
  }

  return {
    DOMAIN: DOMAIN,
    CACHE_KEY: CACHE_KEY,
    LEGACY_PA_KEY: LEGACY_PA_KEY,
    SERVICE_PRESETS: SERVICE_PRESETS,
    PRESET_OTHER: PRESET_OTHER,
    DEFAULT_SERVICE_LINE: DEFAULT_SERVICE_LINE,
    DEFAULT_LOCATION_LINE: DEFAULT_LOCATION_LINE,
    normalizePaFormat: normalizePaFormat,
    normalizeServiceSelection: normalizeServiceSelection,
    matchServicePreset: matchServicePreset,
    normalizeSettings: normalizeSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getPaFormat: getPaFormat,
  };
});
