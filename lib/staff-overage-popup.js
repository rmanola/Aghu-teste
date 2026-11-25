/**
 * Diálogo mínimo de consentimento Staff overage no popup da extensão.
 */
(function () {
  "use strict";

  function dialogEl() {
    return document.getElementById("staff-overage-dialog");
  }

  function show() {
    var el = dialogEl();
    if (el) el.classList.remove("hidden");
  }

  function hide() {
    var el = dialogEl();
    if (el) el.classList.add("hidden");
  }

  async function handleAccept() {
    var billing = window.AghuBillingStatus;
    if (!billing || !billing.acceptStaffOverage) return;
    var result = await billing.acceptStaffOverage();
    if (result && result.ok) hide();
  }

  async function handleDecline() {
    var billing = window.AghuBillingStatus;
    if (!billing || !billing.declineStaffOverage) return;
    await billing.declineStaffOverage();
    hide();
  }

  async function openBilling() {
    var billing = window.AghuBillingStatus;
    if (!billing || typeof billing.createPortalSession !== "function") return;
    var result = await billing.createPortalSession();
    if (!result || !result.ok || !result.url) {
      console.warn(
        "[AGHU billing] portal overage:",
        (result && result.message) || (result && result.reason) || "failed",
      );
      return;
    }
    if (typeof billing.openStripeUrl === "function") {
      await billing.openStripeUrl(result.url);
      return;
    }
    if (window.AghuWebApp && typeof window.AghuWebApp.openUrl === "function") {
      await window.AghuWebApp.openUrl(result.url);
    }
  }

  function bind() {
    var el = dialogEl();
    if (!el || el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    var acceptBtn = document.getElementById("staff-overage-accept");
    var declineBtn = document.getElementById("staff-overage-decline");
    var billingBtn = document.getElementById("staff-overage-billing");
    var closeBtn = document.getElementById("staff-overage-close");
    if (acceptBtn) acceptBtn.addEventListener("click", function () { void handleAccept(); });
    if (declineBtn) declineBtn.addEventListener("click", function () { void handleDecline(); });
    if (billingBtn) billingBtn.addEventListener("click", function () { void openBilling(); });
    if (closeBtn) closeBtn.addEventListener("click", hide);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.AghuStaffOveragePopup = {
    show: show,
    hide: hide,
  };
})();
