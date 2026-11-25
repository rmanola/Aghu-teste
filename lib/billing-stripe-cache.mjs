/**
 * PERF3-AC-07: TTL do cache Stripe em aghu_billing_profiles (espelho de billing.ts).
 */

export const STRIPE_SUB_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * @param {string | null | undefined} cachedAt ISO timestamp
 * @param {number} [nowMs]
 */
export function isStripeSubCacheFresh(cachedAt, nowMs = Date.now()) {
  if (!cachedAt) return false;
  const t = Date.parse(cachedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < STRIPE_SUB_CACHE_TTL_MS;
}

/**
 * @param {unknown} raw
 * @returns {{ status: string, priceIds: string[], priceId: string | null, subId: string | null } | null}
 */
export function parseStripeSubCache(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const status = typeof o.status === "string" ? o.status : "active";
  const priceIds = Array.isArray(o.priceIds)
    ? o.priceIds.filter((id) => typeof id === "string")
    : [];
  const priceId =
    typeof o.priceId === "string"
      ? o.priceId
      : priceIds[0] ?? null;
  const subId = typeof o.subId === "string" ? o.subId : null;
  if (!subId && !priceIds.length) return null;
  return { status, priceIds, priceId, subId };
}

/**
 * @param {{ status: string, priceIds: string[], priceId: string | null, subId: string | null }} a
 * @param {{ status: string, priceIds: string[], priceId: string | null, subId: string | null }} b
 */
export function stripeSubCacheEquals(a, b) {
  if (a.status !== b.status) return false;
  if (a.subId !== b.subId) return false;
  if (a.priceId !== b.priceId) return false;
  if (a.priceIds.length !== b.priceIds.length) return false;
  return a.priceIds.every((id, i) => id === b.priceIds[i]);
}

/**
 * Espelho de persistStripeSubCacheIfNeeded em billing.ts — true = omitir UPDATE.
 * @param {string | null | undefined} profileCachedAt
 * @param {unknown} profileCacheRaw
 * @param {{ status: string, priceIds: string[], priceId: string | null, subId: string | null }} incomingRow
 * @param {number} [nowMs]
 */
export function shouldSkipStripeSubCachePersist(
  profileCachedAt,
  profileCacheRaw,
  incomingRow,
  nowMs = Date.now(),
) {
  const cached = parseStripeSubCache(profileCacheRaw);
  const fresh = isStripeSubCacheFresh(profileCachedAt, nowMs);
  return !!(fresh && cached && stripeSubCacheEquals(cached, incomingRow));
}
