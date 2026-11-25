/**
 * Regras de acesso por plano de assinatura (gating web, extensão, Edge Functions).
 * Depende de billing-plans.js (browser) ou require (Node).
 */
(function (root, factory) {
  "use strict";
  var plansRef =
    typeof module !== "undefined" && module.exports
      ? require("./billing-plans.js")
      : root.AghuBillingPlans;
  var api = factory(plansRef);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuBillingAccess = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (billingPlans) {
  "use strict";

  function normalizeState(input) {
    var plan = billingPlans.isPlanSlug(input && input.plan)
      ? input.plan
      : "free";
    var status =
      input && typeof input.status === "string" ? input.status : "active";
    var paidActive =
      billingPlans.PAID_SLUGS.indexOf(plan) !== -1 &&
      billingPlans.isActiveSubscriptionStatus(status);
    return { plan: plan, status: status, paidActive: paidActive };
  }

  function effectivePlan(state) {
    var s = normalizeState(state);
    return s.paidActive ? s.plan : "free";
  }

  function canUseWebPanel(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).webPanel;
  }

  function canUseProduct(state) {
    return canUseWebPanel(state);
  }

  function canSync(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).sync;
  }

  function canUseOrganizeExams(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).organizeExams;
  }

  function canUsePatientAnalysis(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).patientAnalysis;
  }

  function canUseStudyProtocols(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).studyProtocols;
  }

  function canUseAltaKit(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).altaKit;
  }

  function maxPatients(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).maxPatients;
  }

  function examRetentionDays(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).examRetentionDays;
  }

  function maxSessions(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).maxSessions;
  }

  function maxExtractionsPerDay(state) {
    var plan = effectivePlan(state);
    return billingPlans.getPlanConfig(plan).maxExtractionsPerDay;
  }

  function canExtract(state, dailyCount) {
    var plan = effectivePlan(state);
    var cfg = billingPlans.getPlanConfig(plan);
    if (cfg.maxExtractionsPerDay == null) return true;
    var n = typeof dailyCount === "number" ? dailyCount : 0;
    return n < cfg.maxExtractionsPerDay;
  }

  function buildLimits(state) {
    var plan = effectivePlan(state);
    var cfg = billingPlans.getPlanConfig(plan);
    return {
      plan: plan,
      label: cfg.label,
      maxPatients: cfg.maxPatients,
      examRetentionDays: cfg.examRetentionDays,
      maxSessions: cfg.maxSessions,
      maxExtractionsPerDay: cfg.maxExtractionsPerDay,
    };
  }

  function buildAllowed(state) {
    return {
      product: canUseProduct(state),
      sync: canSync(state),
      webPanel: canUseWebPanel(state),
      organizeExams: canUseOrganizeExams(state),
      patientAnalysis: canUsePatientAnalysis(state),
      studyProtocols: canUseStudyProtocols(state),
      altaKit: canUseAltaKit(state),
      extract: canExtract(state),
    };
  }

  function checkAccess(state, feature, opts) {
    var daily = opts && opts.dailyExtractionCount;
    if (feature === "product" && !canUseProduct(state)) {
      return {
        ok: false,
        code: "subscription_required",
        message: "Assinatura Interno, Residente, Staff ou Research necessária.",
      };
    }
    if (feature === "sync" && !canSync(state)) {
      return {
        ok: false,
        code: "sync_not_allowed",
        message: "Sync na nuvem requer plano pago ativo.",
      };
    }
    if (feature === "webPanel" && !canUseWebPanel(state)) {
      return {
        ok: false,
        code: "web_panel_not_allowed",
        message: "Painel web requer plano pago ativo.",
      };
    }
    if (feature === "organizeExams" && !canUseOrganizeExams(state)) {
      return {
        ok: false,
        code: "organize_exams_not_allowed",
        message: "Organização de exames com IA requer plano Residente, Staff ou Research.",
      };
    }
    if (feature === "patientAnalysis" && !canUsePatientAnalysis(state)) {
      return {
        ok: false,
        code: "patient_analysis_not_allowed",
        message: "Análise clínica com IA requer plano Residente, Staff ou Research.",
      };
    }
    if (feature === "studyProtocols" && !canUseStudyProtocols(state)) {
      return {
        ok: false,
        code: "study_protocols_not_allowed",
        message: "Protocolos de estudo HPB requerem plano Research.",
      };
    }
    if (feature === "altaKit" && !canUseAltaKit(state)) {
      return {
        ok: false,
        code: "alta_kit_not_allowed",
        message: "Kit de Alta requer plano Interno, Residente, Staff ou Research activo.",
      };
    }
    if (feature === "extract" && !canExtract(state, daily)) {
      return {
        ok: false,
        code: "extraction_limit_reached",
        message: "Limite diário de extrações do plano Grátis atingido.",
      };
    }
    return { ok: true };
  }

  return {
    normalizeState: normalizeState,
    effectivePlan: effectivePlan,
    canUseProduct: canUseProduct,
    canUseWebPanel: canUseWebPanel,
    canSync: canSync,
    canUseOrganizeExams: canUseOrganizeExams,
    canUsePatientAnalysis: canUsePatientAnalysis,
    canUseStudyProtocols: canUseStudyProtocols,
    canUseAltaKit: canUseAltaKit,
    maxPatients: maxPatients,
    examRetentionDays: examRetentionDays,
    maxSessions: maxSessions,
    maxExtractionsPerDay: maxExtractionsPerDay,
    canExtract: canExtract,
    buildLimits: buildLimits,
    buildAllowed: buildAllowed,
    checkAccess: checkAccess,
  };
});
