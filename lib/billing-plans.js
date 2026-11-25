/**
 * Planos de assinatura AGHU — limites e metadados (fonte única para extensão e testes).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuBillingPlans = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {'free'|'interno'|'residente'|'staff'|'research'} BillingPlanSlug */

  var PLANS = {
    free: {
      slug: "free",
      label: "Grátis",
      priceCents: 0,
      maxPatients: 0,
      patientOverageCents: null,
      examRetentionDays: null,
      maxSessions: 1,
      maxExtractionsPerDay: 3,
      sync: false,
      webPanel: false,
      organizeExams: false,
      patientAnalysis: false,
      studyProtocols: false,
      altaKit: false,
    },
    interno: {
      slug: "interno",
      label: "Interno",
      priceCents: 1500,
      maxPatients: 3,
      patientOverageCents: null,
      examRetentionDays: 90, // janela de visualização (aba Exames / matriz)
      maxSessions: 2,
      maxExtractionsPerDay: 5,
      sync: true,
      webPanel: true,
      organizeExams: false,
      patientAnalysis: false,
      studyProtocols: false,
      altaKit: true,
    },
    residente: {
      slug: "residente",
      label: "Residente",
      priceCents: 3000,
      maxPatients: 7,
      patientOverageCents: null,
      examRetentionDays: 90, // janela de visualização (aba Exames / matriz)
      maxSessions: 2,
      maxExtractionsPerDay: 15,
      sync: true,
      webPanel: true,
      organizeExams: true,
      patientAnalysis: true,
      studyProtocols: false,
      altaKit: true,
    },
    staff: {
      slug: "staff",
      label: "Staff",
      priceCents: 10000,
      maxPatients: 20,
      patientOverageCents: 500,
      examRetentionDays: 365, // janela de visualização (aba Exames / matriz)
      maxSessions: 10,
      maxExtractionsPerDay: null,
      sync: true,
      webPanel: true,
      organizeExams: true,
      patientAnalysis: true,
      studyProtocols: false,
      altaKit: true,
    },
    research: {
      slug: "research",
      label: "Research",
      priceCents: 30000,
      maxPatients: null,
      patientOverageCents: null,
      examRetentionDays: null,
      maxSessions: 10,
      maxExtractionsPerDay: null,
      sync: true,
      webPanel: true,
      organizeExams: true,
      patientAnalysis: true,
      studyProtocols: true,
      altaKit: true,
    },
  };

  var PAID_SLUGS = ["interno", "residente", "staff", "research"];
  var ACTIVE_STATUSES = new Set(["active", "trialing"]);

  /** Price IDs legados (live) — grandfather após redução de preço. */
  var LEGACY_STRIPE_PRICE_IDS = {
    interno: [
      "price_1TgGrhAtRo1fGfaoehHOiDjT",
      "price_1TgGrhAtRo1fGfaoCp8DzrbD",
    ],
    residente: [
      "price_1TgGrbAtRo1fGfaoW5vLdvos",
      "price_1TgGrbAtRo1fGfaoltPyMvjM",
    ],
    staff: [
      "price_1TgzdgAtRo1fGfaoz1WNTi7O", // R$ 150/mês
      "price_1TgzdnAtRo1fGfaozYkbLboz", // R$ 135/mês (anual −10%)
    ],
  };

  var TRIAL_PERIOD_DAYS = {
    interno: 7,
    residente: 7,
    staff: 30,
    research: 30,
  };

  function isPlanSlug(s) {
    return typeof s === "string" && Object.prototype.hasOwnProperty.call(PLANS, s);
  }

  function getPlanConfig(slug) {
    if (!isPlanSlug(slug)) return PLANS.free;
    return PLANS[slug];
  }

  function isActiveSubscriptionStatus(status) {
    return typeof status === "string" && ACTIVE_STATUSES.has(status);
  }

  function getTrialPeriodDays(slug) {
    if (!isPlanSlug(slug) || slug === "free") return 0;
    return TRIAL_PERIOD_DAYS[slug] ?? 0;
  }

  /** Desconto plano anual (cobrança mensal com compromisso de 12 meses). */
  var ANNUAL_MONTHLY_DISCOUNT = 0.1;

  function annualMonthlyCents(monthlyCents) {
    return Math.round(monthlyCents * (1 - ANNUAL_MONTHLY_DISCOUNT));
  }

  function priceIdMatchesPlan(priceId, plan, envMap) {
    var envKey = "STRIPE_PRICE_" + plan.toUpperCase();
    if (envMap[envKey] && priceId === envMap[envKey]) return true;
    var annualKey = envKey + "_ANNUAL";
    if (envMap[annualKey] && priceId === envMap[annualKey]) return true;
    var legacy = LEGACY_STRIPE_PRICE_IDS[plan];
    if (legacy && legacy.indexOf(priceId) >= 0) return true;
    return false;
  }

  function priceIdToPlan(priceId, envMap) {
    if (!priceId || !envMap) return null;
    for (var i = 0; i < PAID_SLUGS.length; i++) {
      var slug = PAID_SLUGS[i];
      if (priceIdMatchesPlan(priceId, slug, envMap)) return slug;
    }
    return null;
  }

  return {
    PLANS: PLANS,
    PAID_SLUGS: PAID_SLUGS,
    ACTIVE_STATUSES: ACTIVE_STATUSES,
    LEGACY_STRIPE_PRICE_IDS: LEGACY_STRIPE_PRICE_IDS,
    TRIAL_PERIOD_DAYS: TRIAL_PERIOD_DAYS,
    ANNUAL_MONTHLY_DISCOUNT: ANNUAL_MONTHLY_DISCOUNT,
    annualMonthlyCents: annualMonthlyCents,
    isPlanSlug: isPlanSlug,
    getPlanConfig: getPlanConfig,
    getTrialPeriodDays: getTrialPeriodDays,
    isActiveSubscriptionStatus: isActiveSubscriptionStatus,
    priceIdToPlan: priceIdToPlan,
    priceIdMatchesPlan: priceIdMatchesPlan,
  };
});
