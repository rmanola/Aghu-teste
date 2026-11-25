/**
 * URL de redirect pós-recuperação (link do e-mail Supabase Auth).
 * A extensão chama /auth/v1/recover; o utilizador redefine a palavra-passe no painel web.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuForgotPasswordUrl = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRODUCTION_WEB_APP_URL = "https://aghu.vercel.app";

  /**
   * Auth de produção + WEB_APP_URL local: o link do e-mail deve ir à origem allowlisted.
   * @param {string} baseUrl URL do painel (getWebAppUrl).
   * @returns {string|null}
   */
  function resolveRecoveryWebAppUrl(baseUrl) {
    var base = String(baseUrl || "").replace(/\/+$/, "").trim();
    if (!base) return null;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
      return PRODUCTION_WEB_APP_URL;
    }
    return base;
  }

  /**
   * @param {string} baseUrl URL do painel (getWebAppUrl), sem barra final preferível.
   * @returns {string|null} redirectTo absoluto para /auth/callback?next=/auth/update-password
   */
  function buildPasswordRecoveryRedirectUrl(baseUrl) {
    var resolved = resolveRecoveryWebAppUrl(baseUrl);
    if (!resolved) return null;
    return (
      resolved +
      "/auth/callback?next=" +
      encodeURIComponent("/auth/update-password")
    );
  }

  return {
    resolveRecoveryWebAppUrl: resolveRecoveryWebAppUrl,
    buildPasswordRecoveryRedirectUrl: buildPasswordRecoveryRedirectUrl,
  };
});
