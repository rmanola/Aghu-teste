/**
 * Recuperação de customer Stripe obsoleto — funções puras (testáveis em Node).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuStripeCheckoutCustomer = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isStaleStripeCustomerError(message) {
    return /no such customer/i.test(String(message));
  }

  function mapStripeCheckoutError(message) {
    var msg = String(message);
    if (/no such coupon/i.test(msg)) return "stripe_coupon_invalid";
    if (/no such price/i.test(msg)) return "invalid_plan";
    if (/quantity|metered|line_items/i.test(msg)) {
      return "staff_checkout_misconfigured";
    }
    return "checkout_failed";
  }

  function checkoutErrorHttpStatus(errorCode) {
    if (
      errorCode === "invalid_plan" ||
      errorCode === "stripe_coupon_invalid" ||
      errorCode === "staff_checkout_misconfigured"
    ) {
      return 422;
    }
    return 500;
  }

  /**
   * Simula decisão do fluxo ensureStripeCustomerForCheckout (BILL-AC-21).
   * @returns {"reuse" | "create" | "clear_and_create"}
   */
  function resolveCustomerRecoveryAction(existingCustomerId, stripeErrorMessage) {
    if (!existingCustomerId) return "create";
    if (isStaleStripeCustomerError(stripeErrorMessage)) return "clear_and_create";
    return "reuse";
  }

  return {
    isStaleStripeCustomerError: isStaleStripeCustomerError,
    mapStripeCheckoutError: mapStripeCheckoutError,
    checkoutErrorHttpStatus: checkoutErrorHttpStatus,
    resolveCustomerRecoveryAction: resolveCustomerRecoveryAction,
  };
});
