/**
 * Configuração da extensão AGHU — MODO OFFLINE.
 *
 * Esta build não comunica com nenhum servidor externo (Supabase, painel web,
 * Stripe, IA). Todos os dados ficam em `browser.storage.local`.
 * `isConfigured()` devolve true para indicar que o backend local está pronto.
 */
(function () {
  "use strict";

  var OFFLINE = true;

  function applyOverrides(_overrides) {
    /* modo offline: overrides ignorados */
  }

  function isConfigured() {
    return true;
  }

  function getUrl() {
    return "";
  }

  function getAnonKey() {
    return "";
  }

  function getWebAppUrl() {
    return "";
  }

  function empty() {
    return "";
  }

  window.AghuSupabaseConfig = {
    OFFLINE: OFFLINE,
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    WEB_APP_URL: "",
    applyOverrides: applyOverrides,
    isConfigured: isConfigured,
    getUrl: getUrl,
    getAnonKey: getAnonKey,
    getWebAppUrl: getWebAppUrl,
    getOrganizeExamsUrl: empty,
    getEncryptAndUpsertUrl: empty,
    getBillingStatusUrl: empty,
    getSubmitProductFeedbackUrl: empty,
    getOrganizeExtensionSecret: empty,
  };
})();