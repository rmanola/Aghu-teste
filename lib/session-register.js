/**
 * Registo de sessão activa na Edge Function session-register (limite global).
 * Best-effort: falha de rede não bloqueia login local.
 */
(function () {
  "use strict";

  var REGISTER_TIMEOUT_MS = 15000;

  function withTimeout(promise) {
    var nt = window.AghuNetworkTimeout;
    if (nt && nt.withNetworkTimeout) {
      return nt.withNetworkTimeout(promise, REGISTER_TIMEOUT_MS);
    }
    return promise;
  }

  /**
   * @param {string} token
   * @returns {Record<string, unknown> | null}
   */
  function decodeJwtPayload(token) {
    var parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    try {
      var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var pad = (4 - (b64.length % 4)) % 4;
      var padded = b64 + new Array(pad + 1).join("=");
      var json = atob(padded);
      return JSON.parse(json);
    } catch (_e) {
      return null;
    }
  }

  /**
   * @param {string} accessToken
   * @returns {string | null}
   */
  function getSessionIdFromAccessToken(accessToken) {
    var payload = decodeJwtPayload(accessToken);
    if (!payload || !payload.session_id) return null;
    var sid = String(payload.session_id);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sid)
      ? sid
      : null;
  }

  /**
   * @param {{ platform: "extension" | "web", access_token: string }} opts
   * @returns {Promise<{ ok: boolean, evicted?: Array<{ auth_session_id: string, platform: string }>, error?: string }>}
   */
  async function registerActiveSession(opts) {
    var cfg = window.AghuSupabaseConfig;
    if (!cfg || typeof cfg.isConfigured !== "function" || !cfg.isConfigured()) {
      return { ok: false, error: "config_not_configured" };
    }

    var accessToken = opts && opts.access_token;
    var platform = opts && opts.platform;
    if (!accessToken || (platform !== "extension" && platform !== "web")) {
      return { ok: false, error: "invalid_args" };
    }

    var authSessionId = getSessionIdFromAccessToken(accessToken);
    if (!authSessionId) {
      return { ok: false, error: "missing_session_id" };
    }

    var url =
      cfg.getUrl() + "/functions/v1/session-register";

    var res;
    try {
      res = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: {
            apikey: cfg.getAnonKey(),
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platform: platform,
            auth_session_id: authSessionId,
          }),
        }),
      );
    } catch (_e) {
      return { ok: false, error: "network" };
    }

    var data = null;
    try {
      data = await res.json();
    } catch (_e) {
      /* noop */
    }

    if (!res.ok) {
      return {
        ok: false,
        error: (data && (data.error || data.message)) || "register_failed",
      };
    }

    return {
      ok: true,
      evicted: (data && data.evicted) || [],
    };
  }

  window.AghuSessionRegister = {
    registerActiveSession: registerActiveSession,
    getSessionIdFromAccessToken: getSessionIdFromAccessToken,
  };
})();
