/**
 * FEAT-313: decisão de revogação quando a Stripe não tem subscription activa.
 * Espelho em supabase/functions/_shared/billing.ts (resolveStripeRevocation).
 */

const PAID_PLANS = new Set(["interno", "residente", "staff", "research"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * @param {{
 *   profilePlan?: string,
 *   planSource?: string,
 *   hasCustomer?: boolean,
 *   lookupConfirmed?: boolean,
 *   subscriptions?: Array<{ status?: string }>,
 * }} input
 * @returns {{ plan: string, status: string, revoked: boolean, shouldPersistFree: boolean }}
 */
export function resolveStripeRevocation(input) {
  const plan = typeof input?.profilePlan === "string" ? input.profilePlan : "free";
  const planSource = typeof input?.planSource === "string" ? input.planSource : "";
  const subs = Array.isArray(input?.subscriptions) ? input.subscriptions : [];
  const active = subs.find((s) => s && ACTIVE_STATUSES.has(String(s.status)));

  if (!PAID_PLANS.has(plan) || planSource !== "stripe") {
    return {
      plan,
      status: active ? String(active.status) : "active",
      revoked: false,
      shouldPersistFree: false,
    };
  }

  if (!input?.hasCustomer) {
    return {
      plan: "free",
      status: "no_subscription",
      revoked: true,
      shouldPersistFree: true,
    };
  }

  if (!input?.lookupConfirmed) {
    return {
      plan,
      status: "active",
      revoked: false,
      shouldPersistFree: false,
    };
  }

  if (active) {
    return {
      plan,
      status: String(active.status),
      revoked: false,
      shouldPersistFree: false,
    };
  }

  const inactive = subs.find((s) => s && typeof s.status === "string" && s.status);
  return {
    plan: "free",
    status: inactive ? String(inactive.status) : "no_subscription",
    revoked: true,
    shouldPersistFree: true,
  };
}
