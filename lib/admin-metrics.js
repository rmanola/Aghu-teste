/**
 * Métricas operacionais/financeiras do painel admin AGHU (sem PHI).
 * Fonte única para Edge Functions e testes Node.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuAdminMetrics = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PLAN_PRICES_BRL = {
    interno: 25,
    residente: 50,
    staff: 150,
    research: 300,
  };

  var PAID_PLAN_SLUGS = ["interno", "residente", "staff", "research"];

  var SUPABASE_FREE_LIMITS = {
    database_size_bytes: 500 * 1024 * 1024,
    egress_bytes: 5 * 1024 * 1024 * 1024,
    edge_function_invocations: 500000,
    auth_mau: 50000,
  };

  var VERCEL_HOBBY_LIMITS = {
    edge_requests: 1000000,
    fast_data_transfer_bytes: 100 * 1024 * 1024 * 1024,
    fluid_cpu_hours: 4,
    function_invocations: 1000000,
  };

  var STRIPE_BR = {
    cardPercent: 0.0399,
    cardFixedBrl: 0.39,
    billingPercent: 0.007,
  };

  var STALE_SYNC_HOURS = 36;

  function isPaidPlan(slug) {
    return PAID_PLAN_SLUGS.indexOf(slug) !== -1;
  }

  /**
   * @param {Record<string, number>} planCounts — ex.: { interno: 1, residente: 2 }
   * @returns {number} MRR em BRL
   */
  function estimateMrrBrl(planCounts) {
    if (!planCounts || typeof planCounts !== "object") return 0;
    var total = 0;
    for (var slug in planCounts) {
      if (!Object.prototype.hasOwnProperty.call(planCounts, slug)) continue;
      var price = PLAN_PRICES_BRL[slug];
      if (typeof price !== "number") continue;
      var count = Number(planCounts[slug]) || 0;
      total += price * count;
    }
    return total;
  }

  /**
   * @param {number} mrrBrl
   * @param {number} numCharges
   */
  function estimateStripeFeesBrl(mrrBrl, numCharges) {
    var mrr = Number(mrrBrl) || 0;
    var charges = Number(numCharges) || 0;
    return (
      mrr * STRIPE_BR.cardPercent +
      charges * STRIPE_BR.cardFixedBrl +
      mrr * STRIPE_BR.billingPercent
    );
  }

  function estimateMarginPct(mrrBrl, stripeFeesBrl, infraBrl) {
    var mrr = Number(mrrBrl) || 0;
    if (mrr <= 0) return 0;
    var infra = Number(infraBrl) || 0;
    var stripe = Number(stripeFeesBrl) || 0;
    return ((mrr - stripe - infra) / mrr) * 100;
  }

  /**
   * Estima invocações Edge/mês a partir de utilizadores pagos (fallback sem snapshot).
   */
  function estimateEdgeInvocationsMonthly(authUsers, paidProfiles, avgPatientsPerPaid) {
    var users = Number(authUsers) || 0;
    var paid = Number(paidProfiles) || 0;
    var avg = Number(avgPatientsPerPaid) || 5;
    return Math.round(users * 50 + paid * avg * 30);
  }

  /**
   * @param {Array<{source:string, metric_key:string, metric_value:number}>} snapshotRows
   */
  function snapshotToMap(snapshotRows) {
    var map = {};
    if (!Array.isArray(snapshotRows)) return map;
    for (var i = 0; i < snapshotRows.length; i++) {
      var row = snapshotRows[i];
      if (!row || !row.metric_key) continue;
      var key = row.source + ":" + row.metric_key;
      map[key] = Number(row.metric_value);
    }
    return map;
  }

  /**
   * @param {object} input
   * @param {Array} [input.latestSnapshots]
   * @param {number} [input.dbSizeBytes]
   * @param {number} [input.paidProfiles]
   * @param {number} [input.authUsers]
   */
  function buildLimitUsage(input) {
    var map = snapshotToMap(input && input.latestSnapshots);
    var dbSize =
      map["supabase:database_size_bytes"] ??
      (input && input.dbSizeBytes) ??
      null;
    var egress =
      map["supabase:egress_bytes"] ?? null;
    var edgeInv =
      map["supabase:edge_function_invocations"] ??
      (input
        ? estimateEdgeInvocationsMonthly(
            input.authUsers,
            input.paidProfiles,
            5,
          )
        : null);
    var vercelEdge =
      map["vercel:edge_requests"] ?? null;
    var vercelTransfer =
      map["vercel:fast_data_transfer_bytes"] ?? null;

    function pct(value, limit) {
      if (value == null || limit == null || limit <= 0) return null;
      return (Number(value) / limit) * 100;
    }

    return {
      database: {
        value: dbSize,
        limit: SUPABASE_FREE_LIMITS.database_size_bytes,
        percent: pct(dbSize, SUPABASE_FREE_LIMITS.database_size_bytes),
        estimated: map["supabase:database_size_bytes"] == null && dbSize != null,
      },
      egress: {
        value: egress,
        limit: SUPABASE_FREE_LIMITS.egress_bytes,
        percent: pct(egress, SUPABASE_FREE_LIMITS.egress_bytes),
        estimated: egress == null,
      },
      edgeInvocations: {
        value: edgeInv,
        limit: SUPABASE_FREE_LIMITS.edge_function_invocations,
        percent: pct(edgeInv, SUPABASE_FREE_LIMITS.edge_function_invocations),
        estimated: map["supabase:edge_function_invocations"] == null,
      },
      vercelEdgeRequests: {
        value: vercelEdge,
        limit: VERCEL_HOBBY_LIMITS.edge_requests,
        percent: pct(vercelEdge, VERCEL_HOBBY_LIMITS.edge_requests),
        estimated: vercelEdge == null,
      },
      vercelDataTransfer: {
        value: vercelTransfer,
        limit: VERCEL_HOBBY_LIMITS.fast_data_transfer_bytes,
        percent: pct(vercelTransfer, VERCEL_HOBBY_LIMITS.fast_data_transfer_bytes),
        estimated: vercelTransfer == null,
      },
    };
  }

  /**
   * @param {object} metrics
   */
  function buildAlerts(metrics) {
    var alerts = [];
    if (!metrics || typeof metrics !== "object") return alerts;

    var paid = Number(metrics.paidProfiles) || 0;
    var stripeSubs = Number(metrics.stripeActiveSubs) || 0;
    if (paid !== stripeSubs) {
      alerts.push({
        severity: "warning",
        code: "paid_stripe_mismatch",
        message:
          "Perfis pagos (" +
          paid +
          ") diferem de assinaturas Stripe ativas (" +
          stripeSubs +
          "). Verificar mix test/live ou Sync Engine.",
      });
    }

    var limitUsage = metrics.limitUsage;
    if (limitUsage && limitUsage.database && limitUsage.database.percent != null) {
      if (limitUsage.database.percent >= 80) {
        alerts.push({
          severity: "danger",
          code: "db_limit_high",
          message:
            "Base de dados acima de 80% do limite free (" +
            Math.round(limitUsage.database.percent) +
            "%).",
        });
      }
    }

    if (metrics.syncStatus && metrics.syncStatus.stale) {
      alerts.push({
        severity: "warning",
        code: "infra_sync_stale",
        message:
          "Última sincronização de infra há mais de " +
          STALE_SYNC_HOURS +
          "h. Métricas Vercel/Supabase podem estar desatualizadas.",
      });
    }

    var region = metrics.supabaseRegion;
    if (region && region !== "sa-east-1") {
      alerts.push({
        severity: "info",
        code: "region_not_sa_east",
        message:
          "Projeto Supabase em " +
          region +
          " (docs recomendam sa-east-1 para LGPD).",
      });
    }

    if (metrics.vercelTier === "Hobby" && paid > 0) {
      alerts.push({
        severity: "warning",
        code: "vercel_hobby_commercial",
        message:
          "Vercel Hobby com produto comercial pago — considerar Pro quando MRR > R$2.000.",
      });
    }

    if (metrics.stripeSyncEngineAvailable === false) {
      alerts.push({
        severity: "warning",
        code: "stripe_sync_engine_missing",
        message:
          "Stripe Sync Engine indisponível (RPC/schema/API). MRR líquido e status por utilizador indisponíveis.",
      });
    } else if (
      metrics.stripeDataSource === "stripe_api" ||
      (metrics.stripeDataSource === "sync_engine" && metrics.stripeSyncStale)
    ) {
      alerts.push({
        severity: "warning",
        code: "stripe_sync_stale",
        message:
          metrics.stripeDataSource === "stripe_api"
            ? "Dados Stripe via API live — Sync Engine Postgres desatualizado ou inacessível."
            : "Dados Stripe Sync Engine desatualizados (última sync há mais de 36h).",
      });
    }

    var mismatchUsers = Number(metrics.userSubscriptionMismatchCount) || 0;
    if (mismatchUsers > 0) {
      alerts.push({
        severity: "warning",
        code: "user_subscription_mismatch",
        message:
          mismatchUsers +
          " utilizador(es) com divergência entre perfil local e subscrição Stripe.",
      });
    }

    return alerts;
  }

  /**
   * @param {object} baseline
   */
  function buildScenarios(baseline) {
    var b = baseline || {};
    var todayMrr = estimateMrrBrl(b.planCounts || {});
    var todayPaid = Number(b.paidProfiles) || 0;

    var presets = [
      {
        id: "A",
        label: "Hoje",
        users: Number(b.authUsers) || 0,
        paid: todayPaid,
        patients: Number(b.patientRecords) || 0,
        dbMb: b.dbSizeBytes
          ? Math.round(b.dbSizeBytes / (1024 * 1024))
          : 0,
        mrr: todayMrr,
        numCharges: todayPaid,
        infraBrl: 0,
        note: "Baseline live",
      },
      {
        id: "B",
        label: "Early (6m)",
        users: 80,
        paid: 25,
        patients: 200,
        dbMb: 50,
        mrr: 1850,
        numCharges: 25,
        infraBrl: 0,
        note: "Ainda dentro do free",
      },
      {
        id: "C",
        label: "Tração (12–18m)",
        users: 300,
        paid: 120,
        patients: 1500,
        dbMb: 400,
        mrr: 10500,
        numCharges: 120,
        infraBrl: 300,
        note: "Supabase Pro + Vercel Pro provável",
      },
      {
        id: "D",
        label: "Staff scale",
        users: 200,
        paid: 50,
        patients: 1250,
        dbMb: 450,
        mrr: 8750,
        numCharges: 50,
        infraBrl: 280,
        note: "50 Staff, média 25 pac., overage",
      },
    ];

    return presets.map(function (s) {
      var stripe = estimateStripeFeesBrl(s.mrr, s.numCharges);
      return {
        id: s.id,
        label: s.label,
        users: s.users,
        paid: s.paid,
        patients: s.patients,
        dbMb: s.dbMb,
        mrrBrl: s.mrr,
        stripeFeesBrl: Math.round(stripe * 100) / 100,
        marginPct: Math.round(estimateMarginPct(s.mrr, stripe, s.infraBrl) * 10) / 10,
        infraBrl: s.infraBrl,
        note: s.note,
      };
    });
  }

  /**
   * ADMIN-AC-09: stale se último fetch > STALE_SYNC_HOURS.
   * @param {string|null} lastFetchedAt ISO timestamp
   */
  function isSyncStale(lastFetchedAt) {
    if (!lastFetchedAt) return true;
    var ts = Date.parse(lastFetchedAt);
    if (Number.isNaN(ts)) return true;
    var hours = (Date.now() - ts) / (1000 * 60 * 60);
    return hours > STALE_SYNC_HOURS;
  }

  /**
   * ADMIN-AC-07: chave de upsert para deduplicação no mesmo dia.
   */
  function snapshotUpsertKey(snapshotDate, source, metricKey) {
    return String(snapshotDate) + "|" + source + "|" + metricKey;
  }

  /**
   * Mescla métricas novas sobre existentes no mesmo dia (simula upsert).
   * @param {Array<{snapshot_date:string,source:string,metric_key:string}>} existing
   * @param {Array<{snapshot_date:string,source:string,metric_key:string,metric_value:number}>} incoming
   */
  function mergeSnapshotRows(existing, incoming) {
    var byKey = {};
    var all = (existing || []).concat(incoming || []);
    for (var i = 0; i < all.length; i++) {
      var row = all[i];
      if (!row) continue;
      var key = snapshotUpsertKey(
        row.snapshot_date,
        row.source,
        row.metric_key,
      );
      byKey[key] = row;
    }
    return Object.keys(byKey).map(function (k) {
      return byKey[k];
    });
  }

  return {
    PLAN_PRICES_BRL: PLAN_PRICES_BRL,
    PAID_PLAN_SLUGS: PAID_PLAN_SLUGS,
    SUPABASE_FREE_LIMITS: SUPABASE_FREE_LIMITS,
    VERCEL_HOBBY_LIMITS: VERCEL_HOBBY_LIMITS,
    STALE_SYNC_HOURS: STALE_SYNC_HOURS,
    isPaidPlan: isPaidPlan,
    estimateMrrBrl: estimateMrrBrl,
    estimateStripeFeesBrl: estimateStripeFeesBrl,
    estimateMarginPct: estimateMarginPct,
    estimateEdgeInvocationsMonthly: estimateEdgeInvocationsMonthly,
    snapshotToMap: snapshotToMap,
    buildLimitUsage: buildLimitUsage,
    buildAlerts: buildAlerts,
    buildScenarios: buildScenarios,
    isSyncStale: isSyncStale,
    snapshotUpsertKey: snapshotUpsertKey,
    mergeSnapshotRows: mergeSnapshotRows,
  };
});
