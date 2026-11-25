/**
 * Parâmetros Stripe Checkout (trial + promo) — testável em Node.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./billing-plans.js"));
  } else {
    root.AghuStripeCheckoutSession = factory(root.AghuBillingPlans);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (billingPlans) {
  "use strict";

  var getTrialPeriodDays =
    billingPlans && billingPlans.getTrialPeriodDays
      ? billingPlans.getTrialPeriodDays
      : function () {
          return 0;
        };

  /**
   * Trial + códigos promocionais manuais (sem cupom launch automático).
   * @param {string} plan
   * @returns {Record<string, string>}
   */
  function buildCheckoutSubscriptionExtras(plan) {
    var extras = { allow_promotion_codes: "true" };
    var trialDays = getTrialPeriodDays(plan);
    if (trialDays > 0) {
      extras["subscription_data[trial_period_days]"] = String(trialDays);
    }
    return extras;
  }

  /** @param {Record<string, string>} sessionParams */
  function checkoutIncludesAutomaticDiscount(sessionParams) {
    return Object.keys(sessionParams).some(function (key) {
      return key === "discounts" || key.indexOf("discounts[") === 0;
    });
  }

  return {
    buildCheckoutSubscriptionExtras: buildCheckoutSubscriptionExtras,
    checkoutIncludesAutomaticDiscount: checkoutIncludesAutomaticDiscount,
  };
});
