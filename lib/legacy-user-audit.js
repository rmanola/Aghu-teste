/**
 * Auditoria de gaps para utilizadores legados (billing + Stripe).
 * Funções puras — sem I/O; usadas por scripts/audit-legacy-users.mjs e testes.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(
      require("./billing-plans.js"),
      require("./admin-stripe-snapshot.js"),
      require("./admin-metrics.js"),
    );
  } else {
    root.AghuLegacyUserAudit = factory(
      root.AghuBillingPlans,
      root.AghuAdminStripeSnapshot,
      root.AghuAdminMetrics,
    );
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (billingPlans, stripeSnap, adminMetrics) {
    "use strict";

    var PAID_PLANS = billingPlans.PAID_SLUGS;
    var PLAN_LIMITS = {
      interno: 3,
      residente: 7,
      staff: 20,
    };
    var STALE_SYNC_HOURS = adminMetrics.STALE_SYNC_HOURS || 36;

    function truncateId(id) {
      if (!id || typeof id !== "string") return null;
      return id.length <= 8 ? id : id.slice(0, 8) + "…";
    }

    function isPaidPlan(slug) {
      return PAID_PLANS.indexOf(slug) !== -1;
    }

    function indexSubscriptionsByCustomer(rows) {
      return stripeSnap.indexSubscriptionsByCustomer(rows || []);
    }

    function buildActiveCustomerSet(subRows) {
      var set = new Set();
      for (var i = 0; i < (subRows || []).length; i++) {
        var row = subRows[i];
        if (!row || !row.customer) continue;
        if (row.status === "active" || row.status === "trialing") {
          set.add(String(row.customer));
        }
      }
      return set;
    }

    function parseSyncTimestamp(rows) {
      var latest = null;
      for (var i = 0; i < (rows || []).length; i++) {
        var ts =
          rows[i].last_synced_at ||
          rows[i]._last_synced_at ||
          rows[i].lastSyncedAt ||
          null;
        if (!ts) continue;
        if (!latest || String(ts) > String(latest)) latest = ts;
      }
      return latest;
    }

    function isSyncStale(latestAt, nowMs) {
      if (!latestAt) return true;
      var t = Date.parse(String(latestAt));
      if (!Number.isFinite(t)) return true;
      return nowMs - t > STALE_SYNC_HOURS * 60 * 60 * 1000;
    }

    /**
     * @param {{
     *   authUserIds: string[],
     *   billingProfiles: Array<{user_id:string, plan:string, plan_source?:string, stripe_customer_id?:string|null, staff_overage_consent?:string|null}>,
     *   patientCountsByUser: Record<string, number>,
     *   stripeSubscriptions: Array<{id:string, customer:string, status:string, items?:unknown, discount?:unknown, last_synced_at?:string}>,
     *   patientFlagMismatchCount?: number,
     *   priceEnvMap?: Record<string, string>,
     *   nowMs?: number,
     * }} input
     */
    function auditLegacyUserGaps(input) {
      var authIds = new Set(input.authUserIds || []);
      var profiles = input.billingProfiles || [];
      var patientCounts = input.patientCountsByUser || {};
      var subRows = (input.stripeSubscriptions || []).map(function (row) {
        return stripeSnap.normalizeSyncSubscriptionRow
          ? stripeSnap.normalizeSyncSubscriptionRow(row)
          : row;
      });
      var subByCustomer = indexSubscriptionsByCustomer(subRows);
      var activeCustomers = buildActiveCustomerSet(subRows);
      var envMap = input.priceEnvMap || stripeSnap.buildPriceEnvMap({});
      var nowMs = typeof input.nowMs === "number" ? input.nowMs : Date.now();
      var latestSync = parseSyncTimestamp(input.stripeSubscriptions || []);

      var billingByUser = new Map();
      for (var i = 0; i < profiles.length; i++) {
        billingByUser.set(profiles[i].user_id, profiles[i]);
      }

      var g10 = [];
      for (var id of authIds) {
        if (!billingByUser.has(id)) g10.push(id);
      }

      var g6 = [];
      var g4 = [];
      var g5 = [];
      var g7 = [];
      var g8 = [];
      var g9 = [];
      var mismatchSamples = [];

      for (var j = 0; j < profiles.length; j++) {
        var p = profiles[j];
        var uid = p.user_id;
        var plan = String(p.plan || "free");
        var customerId = p.stripe_customer_id || null;
        var patients = Number(patientCounts[uid]) || 0;
        var sub = customerId ? subByCustomer.get(customerId) : null;

        if (patients > 0 && plan === "free" && !customerId) {
          g6.push(uid);
        }

        if (
          isPaidPlan(plan) &&
          (!customerId || !activeCustomers.has(customerId))
        ) {
          g4.push(uid);
        }

        if (sub && !customerId) {
          g5.push(uid);
        }

        if (isPaidPlan(plan)) {
          var fields = stripeSnap.mapSubscriptionToAdminFields(sub, plan, envMap);
          if (fields.subscriptionMismatch) {
            mismatchSamples.push({
              userIdPrefix: truncateId(uid),
              reason: fields.mismatchReason,
            });
          }
        }

        if (plan === "interno" || plan === "residente" || plan === "staff") {
          var max = PLAN_LIMITS[plan];
          if (max != null && patients > max) g7.push(uid);
        }

        if (plan === "staff" && patients > 20) {
          var consent = p.staff_overage_consent || null;
          if (!consent || consent === "declined") g8.push(uid);
          if (consent === "accepted" && sub) {
            var attrs = sub.attrs;
            var items = stripeSnap.subscriptionItems
              ? stripeSnap.subscriptionItems(attrs)
              : [];
            var hasOverage = false;
            for (var k = 0; k < items.length; k++) {
              var priceId = items[k] && items[k].price && items[k].price.id;
              if (stripeSnap.isStaffOveragePriceId(priceId, envMap)) {
                hasOverage = true;
                break;
              }
            }
            if (!hasOverage) g9.push(uid);
          }
        }
      }

      function unique(arr) {
        return Array.from(new Set(arr));
      }

      g4 = unique(g4);
      g5 = unique(g5);
      g6 = unique(g6);
      g7 = unique(g7);
      g8 = unique(g8);
      g9 = unique(g9);

      return {
        generatedAt: new Date(nowMs).toISOString(),
        totals: {
          authUsers: authIds.size,
          billingProfiles: profiles.length,
          activeStripeSubscriptions: subRows.length,
          patientRecordsUsers: Object.keys(patientCounts).length,
        },
        infrastructure: {
          g1_syncEngineStale: isSyncStale(latestSync, nowMs),
          latestStripeSyncAt: latestSync,
          staleThresholdHours: STALE_SYNC_HOURS,
        },
        gaps: {
          g1_syncEngineStale: isSyncStale(latestSync, nowMs) ? 1 : 0,
          g4_paidProfileNoActiveSub: g4.length,
          g5_activeSubWithoutCustomerLink: g5.length,
          g6_orphanPhiUsers: g6.length,
          g7_overPatientLimit: g7.length,
          g8_staffOverLimitNoConsent: g8.length,
          g9_staffOverageNotProvisioned: g9.length,
          g10_authWithoutBillingProfile: g10.length,
          g12_patientFlagMismatches: Number(input.patientFlagMismatchCount) || 0,
        },
        samples: {
          g4_paidProfileNoActiveSub: g4.map(truncateId),
          g5_activeSubWithoutCustomerLink: g5.map(truncateId),
          g6_orphanPhiUsers: g6.map(truncateId),
          g7_overPatientLimit: g7.map(truncateId),
          g8_staffOverLimitNoConsent: g8.map(truncateId),
          g9_staffOverageNotProvisioned: g9.map(truncateId),
          g10_authWithoutBillingProfile: g10.map(truncateId),
          subscriptionMismatches: mismatchSamples,
        },
      };
    }

    return {
      auditLegacyUserGaps: auditLegacyUserGaps,
      truncateId: truncateId,
      isSyncStale: isSyncStale,
      STALE_SYNC_HOURS: STALE_SYNC_HOURS,
    };
  },
);
