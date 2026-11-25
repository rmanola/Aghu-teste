/**
 * Stripe Sync Engine → campos admin (sem PII de pagamento).
 * Fonte única para testes Node; espelho em supabase/functions/_shared/admin-stripe-snapshot.ts
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./billing-plans.js"), require("./admin-metrics.js"));
  } else {
    root.AghuAdminStripeSnapshot = factory(root.AghuBillingPlans, root.AghuAdminMetrics);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (billingPlans, adminMetrics) {
    "use strict";

    var PAID_PLAN_SLUGS = billingPlans.PAID_SLUGS;
    var priceIdToPlan = billingPlans.priceIdToPlan;
    var PLAN_PRICES_BRL = adminMetrics.PLAN_PRICES_BRL || {
      interno: 25,
      residente: 50,
      staff: 150,
      research: 300,
    };

    var ACTIVE_STATUSES = new Set(["active", "trialing"]);

    function buildPriceEnvMap(envRecord) {
      var e = envRecord || {};
      return {
        STRIPE_PRICE_INTERNO: e.STRIPE_PRICE_INTERNO || "",
        STRIPE_PRICE_INTERNO_ANNUAL: e.STRIPE_PRICE_INTERNO_ANNUAL || "",
        STRIPE_PRICE_RESIDENTE: e.STRIPE_PRICE_RESIDENTE || "",
        STRIPE_PRICE_RESIDENTE_ANNUAL: e.STRIPE_PRICE_RESIDENTE_ANNUAL || "",
        STRIPE_PRICE_STAFF: e.STRIPE_PRICE_STAFF || "",
        STRIPE_PRICE_STAFF_ANNUAL: e.STRIPE_PRICE_STAFF_ANNUAL || "",
        STRIPE_PRICE_STAFF_OVERAGE: e.STRIPE_PRICE_STAFF_OVERAGE || "",
        STRIPE_PRICE_RESEARCH: e.STRIPE_PRICE_RESEARCH || "",
        STRIPE_PRICE_RESEARCH_ANNUAL: e.STRIPE_PRICE_RESEARCH_ANNUAL || "",
      };
    }

    function isAnnualPriceId(priceId, envMap) {
      if (!priceId || !envMap) return false;
      return (
        priceId === envMap.STRIPE_PRICE_INTERNO_ANNUAL ||
        priceId === envMap.STRIPE_PRICE_RESIDENTE_ANNUAL ||
        priceId === envMap.STRIPE_PRICE_STAFF_ANNUAL ||
        priceId === envMap.STRIPE_PRICE_RESEARCH_ANNUAL
      );
    }

    function isStaffOveragePriceId(priceId, envMap) {
      return Boolean(
        envMap && envMap.STRIPE_PRICE_STAFF_OVERAGE && priceId === envMap.STRIPE_PRICE_STAFF_OVERAGE,
      );
    }

    function billingIntervalFromPriceId(priceId, envMap) {
      if (!priceId) return null;
      if (isAnnualPriceId(priceId, envMap)) return "annual";
      var plan = priceIdToPlan(priceId, envMap);
      return plan ? "month" : null;
    }

    function normalizeAttrs(attrs) {
      if (!attrs) return null;
      if (typeof attrs === "string") {
        try {
          return JSON.parse(attrs);
        } catch (_e) {
          return null;
        }
      }
      if (typeof attrs === "object") return attrs;
      return null;
    }

    /**
     * Sync Engine expõe colunas normalizadas (items, discount, _raw_data), não attrs.
     * Reconstrói shape Stripe usada pelo parser admin/billing.
     */
    function buildSubscriptionAttrsFromSyncRow(row) {
      if (!row || typeof row !== "object") return null;
      if (row.attrs) return normalizeAttrs(row.attrs);
      if (row._raw_data) {
        var fromRaw = normalizeAttrs(row._raw_data);
        if (fromRaw) return fromRaw;
      }
      var built = {};
      if (row.items) {
        built.items = normalizeAttrs(row.items) || row.items;
      }
      if (row.discount) built.discount = row.discount;
      if (Array.isArray(row.discounts) && row.discounts.length) {
        built.discounts = row.discounts;
      }
      return Object.keys(built).length ? built : null;
    }

    function normalizeSyncSubscriptionRow(row) {
      if (!row) return null;
      return {
        id: String(row.id),
        customer: String(row.customer),
        status: String(row.status),
        attrs: buildSubscriptionAttrsFromSyncRow(row),
      };
    }

    function subscriptionItems(attrs) {
      var parsed = normalizeAttrs(attrs);
      if (!parsed) return [];
      var data = parsed.items && parsed.items.data;
      return Array.isArray(data) ? data : [];
    }

    function extractPriceIdsFromAttrs(attrs) {
      var items = subscriptionItems(attrs);
      var ids = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var priceId = item && item.price && item.price.id;
        if (priceId && ids.indexOf(priceId) === -1) ids.push(priceId);
      }
      return ids;
    }

    function planFromPriceIds(priceIds, envMap) {
      if (!Array.isArray(priceIds)) return null;
      for (var i = 0; i < priceIds.length; i++) {
        if (isStaffOveragePriceId(priceIds[i], envMap)) continue;
        var mapped = priceIdToPlan(priceIds[i], envMap);
        if (mapped) return mapped;
      }
      return null;
    }

    function primaryBillingInterval(priceIds, envMap) {
      if (!Array.isArray(priceIds)) return null;
      for (var i = 0; i < priceIds.length; i++) {
        if (isStaffOveragePriceId(priceIds[i], envMap)) continue;
        if (isAnnualPriceId(priceIds[i], envMap)) return "annual";
        if (priceIdToPlan(priceIds[i], envMap)) return "month";
      }
      return null;
    }

    function summarizeDiscount(attrs) {
      var parsed = normalizeAttrs(attrs);
      if (!parsed) {
        return { hasDiscount: false, discountSummary: null };
      }
      var discount = parsed.discount;
      if (!discount && Array.isArray(parsed.discounts) && parsed.discounts.length) {
        discount = parsed.discounts[0];
      }
      if (!discount) {
        return { hasDiscount: false, discountSummary: null };
      }
      var coupon = discount.coupon || {};
      if (coupon.id) {
        return { hasDiscount: true, discountSummary: String(coupon.id) };
      }
      if (coupon.percent_off != null) {
        return {
          hasDiscount: true,
          discountSummary: coupon.percent_off + "% off",
        };
      }
      if (coupon.amount_off != null && coupon.currency) {
        var brl = (Number(coupon.amount_off) || 0) / 100;
        return {
          hasDiscount: true,
          discountSummary: "R$ " + brl.toFixed(2) + " off",
        };
      }
      return { hasDiscount: true, discountSummary: "desconto activo" };
    }

    function itemMonthlyCents(item, envMap) {
      if (!item) return 0;
      var price = item.price || {};
      var priceId = price.id;
      var quantity = Number(item.quantity) || 1;
      var unitAmount = Number(price.unit_amount);
      if (!Number.isFinite(unitAmount)) {
        unitAmount = Number(price.unit_amount_decimal);
      }
      if (!Number.isFinite(unitAmount)) return 0;

      var interval = price.recurring && price.recurring.interval;
      var monthly = unitAmount * quantity;
      if (interval === "year") {
        monthly = monthly / 12;
      }
      if (isAnnualPriceId(priceId, envMap) && interval !== "year") {
        // Preço anual AGHU cobra mensalmente com price ID anual — já é MRR mensal.
      }
      return monthly;
    }

    function applyDiscountToCents(subtotalCents, attrs) {
      var parsed = normalizeAttrs(attrs);
      if (!parsed || subtotalCents <= 0) return subtotalCents;
      var discount = parsed.discount;
      if (!discount && Array.isArray(parsed.discounts) && parsed.discounts.length) {
        discount = parsed.discounts[0];
      }
      if (!discount || !discount.coupon) return subtotalCents;
      var coupon = discount.coupon;
      if (coupon.percent_off != null) {
        var pct = Number(coupon.percent_off) || 0;
        return Math.max(0, Math.round(subtotalCents * (1 - pct / 100)));
      }
      if (coupon.amount_off != null) {
        var off = Number(coupon.amount_off) || 0;
        return Math.max(0, subtotalCents - off);
      }
      return subtotalCents;
    }

    /**
     * MRR líquido estimado (BRL) a partir de attrs Sync Engine.
     */
    function mrrNetBrlFromSubscriptionAttrs(attrs, envMap) {
      var items = subscriptionItems(attrs);
      var subtotalCents = 0;
      for (var i = 0; i < items.length; i++) {
        subtotalCents += itemMonthlyCents(items[i], envMap);
      }
      var netCents = applyDiscountToCents(subtotalCents, attrs);
      return Math.round((netCents / 100) * 100) / 100;
    }

    function mrrCatalogBrlFromPlan(planSlug) {
      if (!planSlug || !PLAN_PRICES_BRL[planSlug]) return 0;
      return PLAN_PRICES_BRL[planSlug];
    }

    function isPaidPlan(slug) {
      return PAID_PLAN_SLUGS.indexOf(slug) !== -1;
    }

    function detectSubscriptionMismatch(planFromProfile, stripeFields) {
      if (!stripeFields) {
        if (isPaidPlan(planFromProfile)) {
          return {
            subscriptionMismatch: true,
            mismatchReason: "perfil_pago_sem_sub_stripe",
          };
        }
        return { subscriptionMismatch: false, mismatchReason: null };
      }

      var status = stripeFields.stripeStatus;
      var planStripe = stripeFields.planFromStripe;
      var active = ACTIVE_STATUSES.has(status);

      if (isPaidPlan(planFromProfile) && !active) {
        return {
          subscriptionMismatch: true,
          mismatchReason: "sub_nao_activa",
        };
      }

      if (active && planStripe && planFromProfile && planStripe !== planFromProfile) {
        return {
          subscriptionMismatch: true,
          mismatchReason: "plano_perfil_vs_stripe",
        };
      }

      if (active && !planStripe && isPaidPlan(planFromProfile)) {
        return {
          subscriptionMismatch: true,
          mismatchReason: "price_id_desconhecido",
        };
      }

      return { subscriptionMismatch: false, mismatchReason: null };
    }

    /**
     * @param {object} subRow — { id, customer, status, attrs }
     * @param {string|null} planFromProfile
     * @param {object} envMap
     */
    function mapSubscriptionToAdminFields(subRow, planFromProfile, envMap) {
      if (!subRow) {
        return detectSubscriptionMismatch(planFromProfile, null);
      }

      var priceIds = extractPriceIdsFromAttrs(subRow.attrs);
      var planFromStripe = planFromPriceIds(priceIds, envMap);
      var discount = summarizeDiscount(subRow.attrs);
      var interval = primaryBillingInterval(priceIds, envMap);
      var mrrNet = mrrNetBrlFromSubscriptionAttrs(subRow.attrs, envMap);
      var mrrCatalog = planFromStripe
        ? mrrCatalogBrlFromPlan(planFromStripe)
        : isPaidPlan(planFromProfile)
          ? mrrCatalogBrlFromPlan(planFromProfile)
          : 0;

      var stripeFields = {
        stripeSubscriptionId: subRow.id ? String(subRow.id) : null,
        stripeStatus: subRow.status ? String(subRow.status) : null,
        billingInterval: interval,
        planFromStripe: planFromStripe,
        planFromProfile: planFromProfile || "free",
        hasDiscount: discount.hasDiscount,
        discountSummary: discount.discountSummary,
        mrrCatalogBrl: mrrCatalog,
        mrrNetEstimatedBrl: mrrNet,
      };

      var mismatch = detectSubscriptionMismatch(planFromProfile || "free", stripeFields);
      return Object.assign({}, stripeFields, mismatch);
    }

    function indexSubscriptionsByCustomer(subRows) {
      var map = new Map();
      if (!Array.isArray(subRows)) return map;
      for (var i = 0; i < subRows.length; i++) {
        var row = subRows[i];
        if (!row || !row.customer) continue;
        var customerId = String(row.customer);
        var existing = map.get(customerId);
        if (!existing || !ACTIVE_STATUSES.has(existing.status)) {
          map.set(customerId, row);
        }
      }
      return map;
    }

    function aggregateStripeRevenue(subRows, envMap) {
      var mrrNetTotal = 0;
      var mrrCatalogTotal = 0;
      var withDiscount = 0;
      var annualCount = 0;
      var overageMrr = 0;
      var activeCount = 0;

      if (!Array.isArray(subRows)) {
        return {
          mrrNetTotal: 0,
          mrrCatalogTotal: 0,
          mrrDeltaBrl: 0,
          withDiscount: 0,
          annualCount: 0,
          overageMrr: 0,
          activeCount: 0,
        };
      }

      for (var i = 0; i < subRows.length; i++) {
        var sub = subRows[i];
        if (!sub || !ACTIVE_STATUSES.has(String(sub.status))) continue;
        activeCount += 1;
        var priceIds = extractPriceIdsFromAttrs(sub.attrs);
        var plan = planFromPriceIds(priceIds, envMap);
        var net = mrrNetBrlFromSubscriptionAttrs(sub.attrs, envMap);
        var catalog = plan ? mrrCatalogBrlFromPlan(plan) : 0;
        mrrNetTotal += net;
        mrrCatalogTotal += catalog;

        var disc = summarizeDiscount(sub.attrs);
        if (disc.hasDiscount) withDiscount += 1;
        if (primaryBillingInterval(priceIds, envMap) === "annual") annualCount += 1;

        var items = subscriptionItems(sub.attrs);
        for (var j = 0; j < items.length; j++) {
          var pid = items[j] && items[j].price && items[j].price.id;
          if (isStaffOveragePriceId(pid, envMap)) {
            overageMrr += itemMonthlyCents(items[j], envMap) / 100;
          }
        }
      }

      return {
        mrrNetTotal: Math.round(mrrNetTotal * 100) / 100,
        mrrCatalogTotal: Math.round(mrrCatalogTotal * 100) / 100,
        mrrDeltaBrl: Math.round((mrrCatalogTotal - mrrNetTotal) * 100) / 100,
        withDiscount: withDiscount,
        annualCount: annualCount,
        overageMrr: Math.round(overageMrr * 100) / 100,
        activeCount: activeCount,
      };
    }

    function enrichUserRow(userBase, subscriptionByCustomer, profile, envMap) {
      var customerId =
        profile && profile.stripe_customer_id
          ? String(profile.stripe_customer_id)
          : null;
      var planFromProfile = (profile && profile.plan) || userBase.plan || "free";
      var sub = customerId ? subscriptionByCustomer.get(customerId) : null;
      var stripeFields = mapSubscriptionToAdminFields(sub, planFromProfile, envMap);
      return Object.assign({}, userBase, {
        plan: planFromProfile,
        planFromStripe: stripeFields.planFromStripe,
        stripeStatus: stripeFields.stripeStatus,
        billingInterval: stripeFields.billingInterval,
        hasDiscount: stripeFields.hasDiscount,
        discountSummary: stripeFields.discountSummary,
        subscriptionMismatch: stripeFields.subscriptionMismatch,
        mismatchReason: stripeFields.mismatchReason,
        mrrCatalogBrl: stripeFields.mrrCatalogBrl,
        mrrNetEstimatedBrl: stripeFields.mrrNetEstimatedBrl,
      });
    }

    var STRIPE_SYNC_STALE_MS = 36 * 60 * 60 * 1000;

    function isStripeSyncStale(lastSyncedAt) {
      if (!lastSyncedAt) return true;
      var ts = Date.parse(lastSyncedAt);
      if (!Number.isFinite(ts)) return true;
      return Date.now() - ts > STRIPE_SYNC_STALE_MS;
    }

    function parseRpcSubscriptionPayload(payload) {
      if (Array.isArray(payload)) {
        return payload.filter(function (row) {
          return row !== null && typeof row === "object";
        });
      }
      if (typeof payload === "string") {
        try {
          return parseRpcSubscriptionPayload(JSON.parse(payload));
        } catch (_e) {
          return [];
        }
      }
      return [];
    }

    function normalizeStripeApiSubscription(sub) {
      return {
        id: String(sub.id),
        customer: String(sub.customer),
        status: String(sub.status),
        attrs: buildSubscriptionAttrsFromSyncRow(sub),
        lastSyncedAt: null,
      };
    }

    function rowsFromRpcRecords(records) {
      var lastSyncedAt = null;
      var rows = records.map(function (row) {
        var synced = row.last_synced_at
          ? String(row.last_synced_at)
          : row._last_synced_at
            ? String(row._last_synced_at)
            : null;
        if (synced && (!lastSyncedAt || synced > lastSyncedAt)) {
          lastSyncedAt = synced;
        }
        var normalized = normalizeSyncSubscriptionRow(row);
        normalized.lastSyncedAt = synced;
        return normalized;
      });
      return { rows: rows, lastSyncedAt: lastSyncedAt };
    }

    return {
      PAID_PLAN_SLUGS: PAID_PLAN_SLUGS,
      ACTIVE_STATUSES: ACTIVE_STATUSES,
      buildPriceEnvMap: buildPriceEnvMap,
      normalizeAttrs: normalizeAttrs,
      buildSubscriptionAttrsFromSyncRow: buildSubscriptionAttrsFromSyncRow,
      normalizeSyncSubscriptionRow: normalizeSyncSubscriptionRow,
      subscriptionItems: subscriptionItems,
      extractPriceIdsFromAttrs: extractPriceIdsFromAttrs,
      planFromPriceIds: planFromPriceIds,
      billingIntervalFromPriceId: billingIntervalFromPriceId,
      isStaffOveragePriceId: isStaffOveragePriceId,
      summarizeDiscount: summarizeDiscount,
      mrrNetBrlFromSubscriptionAttrs: mrrNetBrlFromSubscriptionAttrs,
      mrrCatalogBrlFromPlan: mrrCatalogBrlFromPlan,
      mapSubscriptionToAdminFields: mapSubscriptionToAdminFields,
      detectSubscriptionMismatch: detectSubscriptionMismatch,
      indexSubscriptionsByCustomer: indexSubscriptionsByCustomer,
      aggregateStripeRevenue: aggregateStripeRevenue,
      enrichUserRow: enrichUserRow,
      isStripeSyncStale: isStripeSyncStale,
      parseRpcSubscriptionPayload: parseRpcSubscriptionPayload,
      normalizeStripeApiSubscription: normalizeStripeApiSubscription,
      rowsFromRpcRecords: rowsFromRpcRecords,
    };
  },
);
