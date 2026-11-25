/**
 * Cliente extensão: cria código SSO one-time via session-extension-bridge.
 */
(function () {
  "use strict";

  /**
   * @param {{ access_token: string, refresh_token: string }} session
   * @returns {Promise<{ ok: boolean, code?: string, error?: string }>}
   */
  async function createSsoCode(session) {
    var config = window.AghuSupabaseConfig;
    if (!config || !config.SUPABASE_URL) {
      return { ok: false, error: "config_missing" };
    }
    var url =
      config.SUPABASE_URL.replace(/\/$/, "") +
      "/functions/v1/session-extension-bridge";
    var res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
        apikey: config.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: "create",
        refresh_token: session.refresh_token,
      }),
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !json.code) {
      return { ok: false, error: json.error || "sso_create_failed" };
    }
    return { ok: true, code: json.code };
  }

  window.AghuSessionExtensionBridge = { createSsoCode: createSsoCode };
})();
