/**
 * Plano / limites — MODO OFFLINE.
 *
 * Sem verificação de assinatura na nuvem: todas as funcionalidades locais
 * ficam disponíveis, sem limite diário de extrações. Mantém a API pública
 * original para os consumidores do popup.
 */
(function () {
  "use strict";

  var CACHE_KEY = "aghu_billing_status_cache_v1";
  var DAILY_KEY = "aghu_billing_extractions_daily_v1";
  var PENDING_SIGNUP_KEY = "aghu_pending_signup_checkout_v1";
  var PENDING_POLL_KEY = "aghu_pending_checkout_poll_v1";
  var SIGNUP_PLAN_SLUGS = [];
  var PUBLIC_CHECKOUT_PLANS = [];

  var OFFLINE_STATUS = Object.freeze({
    plan: "offline",
    status: "active",
    paidActive: true,
    limits: Object.freeze({
      plan: "offline",
      label: "Offline",
      maxPatients: null,
      examRetentionDays: null,
      maxSessions: null,
      maxExtractionsPerDay: null,
    }),
    allowed: Object.freeze({
      product: true,
      sync: false,
      webPanel: false,
      organizeExams: false,
      patientAnalysis: false,
      studyProtocols: true,
      altaKit: true,
      extract: true,
    }),
  });

  function offline() {
    return { ok: false, reason: "offline", code: "offline", message: "Indisponível no modo offline." };
  }

  function hideBillingUi() {
    ["billing-banner", "btn-upgrade-cta", "billing-plans-panel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.add("hidden");
        el.setAttribute("hidden", "");
      }
    });
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  async function readDailyCount() {
    try {
      var got = await browser.storage.local.get(DAILY_KEY);
      var row = got[DAILY_KEY];
      return row && row.day === todayKey() && typeof row.count === "number" ? row.count : 0;
    } catch (_e) {
      return 0;
    }
  }

  async function incrementDailyCount() {
    var n = (await readDailyCount()) + 1;
    var payload = {};
    payload[DAILY_KEY] = { day: todayKey(), count: n };
    try {
      await browser.storage.local.set(payload);
    } catch (_e) {
      /* ignore */
    }
    return n;
  }

  async function fetchStatus() {
    return OFFLINE_STATUS;
  }

  async function readStaleCache() {
    return OFFLINE_STATUS;
  }

  async function checkFeature(_feature) {
    return { ok: true };
  }

  async function guardExtraction() {
    var n = await readDailyCount();
    return {
      ok: true,
      code: null,
      message: null,
      remaining: null,
      maxExtractionsPerDay: null,
      dailyCount: n,
      plan: "offline",
    };
  }

  async function recordExtraction(opts) {
    if (opts && opts.success === false) return null;
    return incrementDailyCount();
  }

  function formatUpgradeMessage(checkResult) {
    if (!checkResult || checkResult.ok) return null;
    return checkResult.message || "Recurso indisponível no modo offline.";
  }

  function errorMessage() {
    return "Indisponível no modo offline.";
  }

  async function noopAsync() {
    return null;
  }

  async function offlineAsync() {
    return offline();
  }

  async function refreshBanner() {
    hideBillingUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideBillingUi);
  } else {
    hideBillingUi();
  }

  window.AghuBillingStatus = {
    OFFLINE: true,
    CACHE_KEY: CACHE_KEY,
    DAILY_KEY: DAILY_KEY,
    PUBLIC_CHECKOUT_PLANS: PUBLIC_CHECKOUT_PLANS,
    pricingUrl: function () { return ""; },
    billingUrl: function () { return ""; },
    fetchStatus: fetchStatus,
    checkFeature: checkFeature,
    guardExtraction: guardExtraction,
    recordExtraction: recordExtraction,
    readDailyCount: readDailyCount,
    incrementDailyCount: incrementDailyCount,
    readStaleCache: readStaleCache,
    formatUpgradeMessage: formatUpgradeMessage,
    checkoutErrorMessage: errorMessage,
    portalErrorMessage: errorMessage,
    createCheckoutSession: offlineAsync,
    createPortalSession: offlineAsync,
    openStripeUrl: function () {},
    SIGNUP_PLAN_SLUGS: SIGNUP_PLAN_SLUGS,
    PENDING_SIGNUP_KEY: PENDING_SIGNUP_KEY,
    PENDING_POLL_KEY: PENDING_POLL_KEY,
    isSignupPlanSlug: function () { return false; },
    isPaidSignupPlan: function () { return false; },
    setPendingSignupCheckout: noopAsync,
    consumePendingSignupCheckout: noopAsync,
    startSignupCheckout: offlineAsync,
    maybeStartPendingCheckout: noopAsync,
    pollPaidActive: noopAsync,
    openPlansPanel: function () {},
    closePlansPanel: function () {},
    refreshBanner: refreshBanner,
    acceptStaffOverage: offlineAsync,
    declineStaffOverage: offlineAsync,
    _setPendingCheckoutPoll: noopAsync,
    _getPendingCheckoutPoll: function () { return false; },
    invalidate: noopAsync,
  };
})();