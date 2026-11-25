/**
 * Preferências do utilizador — MODO OFFLINE.
 *
 * Mesma API do cliente original (Edge Function user-preferences), mas lê e
 * grava em `browser.storage.local`. Formato: { [domain]: payload }.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "aghu_user_preferences_offline_v1";

  var USER_PREFERENCE_DOMAINS = new Set([
    "exam_visibility",
    "passometro_template",
    "monitoring_scores",
    "prescriber_profile",
    "receita_templates",
    "alta_text_templates",
    "analise_templates",
    "analysis_prompt_templates",
    "extension_settings",
  ]);

  function storage() {
    return typeof browser !== "undefined" && browser.storage && browser.storage.local
      ? browser.storage.local
      : null;
  }

  async function loadAll() {
    var st = storage();
    if (!st) return {};
    var got = await st.get(STORAGE_KEY);
    var m = got && got[STORAGE_KEY];
    return m && typeof m === "object" ? m : {};
  }

  async function saveAll(map) {
    var st = storage();
    if (!st) throw new Error("storage_unavailable");
    var obj = {};
    obj[STORAGE_KEY] = map;
    await st.set(obj);
  }

  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  async function readUserPreferences(domains) {
    var list = Array.isArray(domains)
      ? domains.filter(function (d) {
          return typeof d === "string" && USER_PREFERENCE_DOMAINS.has(d);
        })
      : ["exam_visibility", "passometro_template", "monitoring_scores", "analysis_prompt_templates"];
    try {
      var all = await loadAll();
      var out = {};
      list.forEach(function (d) {
        if (Object.prototype.hasOwnProperty.call(all, d)) out[d] = clone(all[d]);
      });
      return out;
    } catch (_e) {
      return {};
    }
  }

  async function writeUserPreference(domain, payload) {
    if (!USER_PREFERENCE_DOMAINS.has(domain)) return false;
    try {
      var all = await loadAll();
      all[domain] = clone(payload);
      await saveAll(all);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function invokeUserPreferences(body) {
    body = body || {};
    if (body.action === "read") {
      return { ok: true, status: 200, data: await readUserPreferences(body.domains) };
    }
    if (body.action === "write") {
      var ok = await writeUserPreference(body.domain, body.payload);
      return ok
        ? { ok: true, status: 200, data: { ok: true } }
        : { ok: false, status: 400, error: "validation_failed" };
    }
    return { ok: false, status: 400, error: "invalid_action" };
  }

  root.AghuUserPreferencesClient = {
    readUserPreferences: readUserPreferences,
    writeUserPreference: writeUserPreference,
    invokeUserPreferences: invokeUserPreferences,
    USER_PREFERENCE_DOMAINS: USER_PREFERENCE_DOMAINS,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);