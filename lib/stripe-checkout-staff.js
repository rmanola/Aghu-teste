/**
 * Checkout Staff — overage fora da sessão Stripe (provisionado após subscrição).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuStripeCheckoutStaff = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Line items do Checkout Staff: só price base (sem overage).
   * @param {string} priceId
   * @returns {Record<string, string>}
   */
  function buildStaffCheckoutLineItems(priceId) {
    return {
      "line_items[0][price]": String(priceId),
      "line_items[0][quantity]": "1",
    };
  }

  /** @param {Record<string, string>} sessionParams */
  function staffCheckoutIncludesOverageLineItem(sessionParams) {
    return (
      Object.prototype.hasOwnProperty.call(sessionParams, "line_items[1][price]") ||
      Object.prototype.hasOwnProperty.call(sessionParams, "line_items[1][quantity]")
    );
  }

  return {
    buildStaffCheckoutLineItems: buildStaffCheckoutLineItems,
    staffCheckoutIncludesOverageLineItem: staffCheckoutIncludesOverageLineItem,
  };
});
