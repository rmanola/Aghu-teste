/**
 * Gate de extração diária (plano Grátis) — lógica pura testável.
 * Depende de billing-access.js e billing-plans.js.
 */
(function (root, factory) {
  "use strict";
  var accessRef =
    typeof module !== "undefined" && module.exports
      ? require("./billing-access.js")
      : root.AghuBillingAccess;
  var api = factory(accessRef);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuBillingExtractionGate = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (billingAccess) {
  "use strict";

  /**
   * Resolve estado de billing para gate de extração.
   * @param {object|null} status — resposta fresca de get-billing-status
   * @param {object|null} staleStatus — cache expirado (fallback de plano)
   * @returns {object} estado normalizado para billing-access
   */
  function resolveExtractionState(status, staleStatus) {
    var src = status || staleStatus || null;
    if (!src) {
      return billingAccess.normalizeState({ plan: "free", status: "active" });
    }
    return billingAccess.normalizeState({
      plan: src.plan,
      status: src.status || "active",
    });
  }

  /**
   * @param {object} state — normalizeState / resolveExtractionState
   * @param {number} dailyCount
   * @returns {{ ok: boolean, code?: string, message?: string, remaining: number|null, maxExtractionsPerDay: number|null, dailyCount: number, plan: string }}
   */
  function checkExtractionAllowed(state, dailyCount) {
    var n = typeof dailyCount === "number" ? dailyCount : 0;
    var result = billingAccess.checkAccess(state, "extract", {
      dailyExtractionCount: n,
    });
    var plan = billingAccess.effectivePlan(state);
    var max = billingAccess.maxExtractionsPerDay(state);
    var remaining = null;
    if (max != null) {
      remaining = Math.max(0, max - n);
    }
    return {
      ok: result.ok,
      code: result.ok ? null : result.code,
      message: result.ok ? null : result.message,
      remaining: remaining,
      maxExtractionsPerDay: max,
      dailyCount: n,
      plan: plan,
    };
  }

  /**
   * Incrementar contador após extração bem-sucedida (incl. lista vazia).
   * @param {{ success?: boolean }} opts
   * @returns {boolean}
   */
  function shouldIncrementExtraction(opts) {
    return !!(opts && opts.success);
  }

  /**
   * @param {{ ok?: boolean, code?: string, message?: string }} checkResult
   * @param {string} [pricingUrl]
   * @returns {string|null}
   */
  function formatExtractionLimitMessage(checkResult, pricingUrl) {
    if (!checkResult || checkResult.ok) return null;
    if (checkResult.code !== "extraction_limit_reached") return null;
    var base =
      checkResult.message ||
      "Limite diário de extrações do plano Grátis atingido.";
    var url = pricingUrl || "https://aghu.vercel.app/pricing";
    return base + " Tente amanhã ou assine em " + url + ".";
  }

  /**
   * Texto para banner: cota → "2/5 extrações hoje"; ilimitado → "7 extrações hoje".
   * @param {number} dailyCount
   * @param {number|null} maxPerDay
   * @returns {string}
   */
  function formatExtractionBannerHint(dailyCount, maxPerDay) {
    var n = typeof dailyCount === "number" ? dailyCount : 0;
    if (maxPerDay == null) return n + " extrações hoje";
    return n + "/" + maxPerDay + " extrações hoje";
  }

  return {
    resolveExtractionState: resolveExtractionState,
    checkExtractionAllowed: checkExtractionAllowed,
    shouldIncrementExtraction: shouldIncrementExtraction,
    formatExtractionLimitMessage: formatExtractionLimitMessage,
    formatExtractionBannerHint: formatExtractionBannerHint,
  };
});
