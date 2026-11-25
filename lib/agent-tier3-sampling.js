/**
 * FEAT-075 — Tier 3 online sampling / drift (agregados sem PHI).
 * Consome rows de runs/events ou breakdown por status; aplica thresholds.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuAgentTier3Sampling = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SUCCESS_STATUSES = Object.freeze({
    study_assistant: Object.freeze(["proposed", "applied"]),
    passometro: Object.freeze(["ok", "success", "completed"]),
  });

  /** Thresholds MVP — conservadores; sample pequeno = info, não fail. */
  var DEFAULT_THRESHOLDS = Object.freeze({
    study_assistant: Object.freeze({
      minSampleSize: 5,
      minSuccessRate: 0.7,
      maxTokensP95: 24000,
      maxErrorRate: 0.4,
    }),
    passometro: Object.freeze({
      minSampleSize: 5,
      minSuccessRate: 0.7,
      maxTokensP95: 8000,
      maxErrorRate: 0.4,
    }),
  });

  /** Chaves exactas proibidas (não substring — `prompt_tokens` é metadado OK). */
  var FORBIDDEN_ROW_KEYS = Object.freeze([
    "prompt",
    "proposal",
    "messages",
    "patient",
    "prontuario",
    "pii",
    "laudo",
    "ciphertext",
    "body",
    "content",
    "text",
  ]);

  /**
   * @param {unknown} row
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  function assertAggregateSafeRow(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: "row_not_object" };
    }
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].toLowerCase();
      for (var j = 0; j < FORBIDDEN_ROW_KEYS.length; j++) {
        if (k === FORBIDDEN_ROW_KEYS[j]) {
          return { ok: false, error: "phi_like_key:" + keys[i] };
        }
      }
    }
    return { ok: true };
  }

  /**
   * @param {number[]} sortedAsc
   * @param {number} p 0–100
   * @returns {number|null}
   */
  function percentileCont(sortedAsc, p) {
    if (!sortedAsc || !sortedAsc.length) return null;
    if (sortedAsc.length === 1) return sortedAsc[0];
    var rank = (p / 100) * (sortedAsc.length - 1);
    var lo = Math.floor(rank);
    var hi = Math.ceil(rank);
    if (lo === hi) return sortedAsc[lo];
    var w = rank - lo;
    return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
  }

  /**
   * @param {string} agent
   * @returns {ReadonlyArray<string>}
   */
  function successStatusesFor(agent) {
    return SUCCESS_STATUSES[agent] || SUCCESS_STATUSES.study_assistant;
  }

  /**
   * Agrega runs brutos (metadados) por tuple_id.
   * @param {Array<Record<string, unknown>>} runs
   * @param {{ agent?: string }} [opts]
   * @returns {{ ok: true, aggregates: Array<Record<string, unknown>> } | { ok: false, error: string }}
   */
  function aggregateRunRows(runs, opts) {
    opts = opts || {};
    var agent = opts.agent || "study_assistant";
    var successSet = {};
    var ss = successStatusesFor(agent);
    for (var s = 0; s < ss.length; s++) successSet[ss[s]] = true;

    if (!Array.isArray(runs)) return { ok: false, error: "runs_not_array" };

    /** @type {Map<string, { n: number, success: number, errors: number, tokens: number[], errorCodes: Record<string, number> }>} */
    var byTuple = new Map();

    for (var i = 0; i < runs.length; i++) {
      var row = runs[i];
      var safe = assertAggregateSafeRow(row);
      if (!safe.ok) return safe;

      var tid = row.tuple_id == null ? "" : String(row.tuple_id);
      if (!tid) tid = "_missing_tuple";

      var g = byTuple.get(tid);
      if (!g) {
        g = { n: 0, success: 0, errors: 0, tokens: [], errorCodes: {} };
        byTuple.set(tid, g);
      }
      g.n += 1;
      var status = row.status == null ? "" : String(row.status);
      var okFlag = row.ok;
      if (agent === "passometro" && typeof okFlag === "boolean") {
        if (okFlag) g.success += 1;
      } else if (successSet[status]) {
        g.success += 1;
      }
      if (row.error_code != null && String(row.error_code).length) {
        g.errors += 1;
        var code = String(row.error_code);
        g.errorCodes[code] = (g.errorCodes[code] || 0) + 1;
      }
      var pt = Number(row.prompt_tokens) || 0;
      var ct = Number(row.completion_tokens) || 0;
      g.tokens.push(pt + ct);
    }

    var aggregates = [];
    byTuple.forEach(function (g, tupleId) {
      var sorted = g.tokens.slice().sort(function (a, b) {
        return a - b;
      });
      aggregates.push({
        tuple_id: tupleId,
        n: g.n,
        success_rate: g.n ? g.success / g.n : 0,
        error_rate: g.n ? g.errors / g.n : 0,
        tokens_p95: percentileCont(sorted, 95),
        top_error_codes: topN(g.errorCodes, 5),
      });
    });
    aggregates.sort(function (a, b) {
      return b.n - a.n;
    });
    return { ok: true, aggregates: aggregates };
  }

  /**
   * Agrega resultado da query SQL documentada (tuple_id, status, count, tokens_p95).
   * @param {Array<Record<string, unknown>>} rows
   * @param {{ agent?: string }} [opts]
   */
  function aggregateStatusBreakdown(rows, opts) {
    opts = opts || {};
    var agent = opts.agent || "study_assistant";
    var successSet = {};
    var ss = successStatusesFor(agent);
    for (var s = 0; s < ss.length; s++) successSet[ss[s]] = true;

    if (!Array.isArray(rows)) return { ok: false, error: "rows_not_array" };

    /** @type {Map<string, { n: number, success: number, tokensP95Max: number|null, errorCodes: Record<string, number> }>} */
    var byTuple = new Map();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var safe = assertAggregateSafeRow(row);
      if (!safe.ok) return safe;

      var tid = row.tuple_id == null ? "_missing_tuple" : String(row.tuple_id);
      var g = byTuple.get(tid);
      if (!g) {
        g = { n: 0, success: 0, tokensP95Max: null, errorCodes: {} };
        byTuple.set(tid, g);
      }
      var count = Number(row.count != null ? row.count : row.n);
      if (!isFinite(count) || count < 0) count = 0;
      g.n += count;
      var status = row.status == null ? "" : String(row.status);
      if (successSet[status]) g.success += count;
      var tp = row.tokens_p95;
      if (tp != null && isFinite(Number(tp))) {
        var ntp = Number(tp);
        g.tokensP95Max =
          g.tokensP95Max == null ? ntp : Math.max(g.tokensP95Max, ntp);
      }
      if (row.error_code != null && String(row.error_code).length) {
        var code = String(row.error_code);
        g.errorCodes[code] = (g.errorCodes[code] || 0) + count;
      }
    }

    var aggregates = [];
    byTuple.forEach(function (g, tupleId) {
      var errN = 0;
      Object.keys(g.errorCodes).forEach(function (k) {
        errN += g.errorCodes[k];
      });
      aggregates.push({
        tuple_id: tupleId,
        n: g.n,
        success_rate: g.n ? g.success / g.n : 0,
        error_rate: g.n ? errN / g.n : 0,
        tokens_p95: g.tokensP95Max,
        top_error_codes: topN(g.errorCodes, 5),
      });
    });
    aggregates.sort(function (a, b) {
      return b.n - a.n;
    });
    return { ok: true, aggregates: aggregates };
  }

  /**
   * @param {Record<string, number>} map
   * @param {number} n
   * @returns {Array<{ code: string, n: number }>}
   */
  function topN(map, n) {
    return Object.keys(map)
      .map(function (code) {
        return { code: code, n: map[code] };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      })
      .slice(0, n);
  }

  /**
   * @param {string} agent
   * @returns {Record<string, number>}
   */
  function thresholdsFor(agent) {
    var base = DEFAULT_THRESHOLDS[agent] || DEFAULT_THRESHOLDS.study_assistant;
    return {
      minSampleSize: base.minSampleSize,
      minSuccessRate: base.minSuccessRate,
      maxTokensP95: base.maxTokensP95,
      maxErrorRate: base.maxErrorRate,
    };
  }

  /**
   * @param {Array<Record<string, unknown>>} aggregates
   * @param {{ agent?: string, thresholds?: Record<string, number> }} [opts]
   * @returns {{ ok: boolean, alerts: Array<Record<string, unknown>> }}
   */
  function evaluateAggregates(aggregates, opts) {
    opts = opts || {};
    var agent = opts.agent || "study_assistant";
    var th = Object.assign({}, thresholdsFor(agent), opts.thresholds || {});
    var alerts = [];

    if (!Array.isArray(aggregates)) {
      return {
        ok: false,
        alerts: [
          {
            severity: "fail",
            code: "aggregates_not_array",
            message: "aggregates deve ser array",
          },
        ],
      };
    }

    for (var i = 0; i < aggregates.length; i++) {
      var a = aggregates[i] || {};
      var tid = a.tuple_id == null ? "?" : String(a.tuple_id);
      var n = Number(a.n) || 0;
      if (n < th.minSampleSize) {
        alerts.push({
          severity: "info",
          code: "sample_too_small",
          tuple_id: tid,
          message:
            "n=" + n + " < minSampleSize=" + th.minSampleSize + " (sem fail)",
        });
        continue;
      }
      var sr = Number(a.success_rate);
      if (isFinite(sr) && sr < th.minSuccessRate) {
        alerts.push({
          severity: "fail",
          code: "success_rate_drift",
          tuple_id: tid,
          message:
            "success_rate=" +
            sr.toFixed(3) +
            " < " +
            th.minSuccessRate +
            " (n=" +
            n +
            ")",
        });
      }
      var er = Number(a.error_rate);
      if (isFinite(er) && er > th.maxErrorRate) {
        alerts.push({
          severity: "fail",
          code: "error_rate_drift",
          tuple_id: tid,
          message:
            "error_rate=" + er.toFixed(3) + " > " + th.maxErrorRate + " (n=" + n + ")",
        });
      }
      var tp = a.tokens_p95;
      if (tp != null && isFinite(Number(tp)) && Number(tp) > th.maxTokensP95) {
        alerts.push({
          severity: "fail",
          code: "tokens_p95_drift",
          tuple_id: tid,
          message:
            "tokens_p95=" +
            Number(tp) +
            " > maxTokensP95=" +
            th.maxTokensP95,
        });
      }
    }

    var ok = !alerts.some(function (x) {
      return x.severity === "fail";
    });
    return { ok: ok, alerts: alerts };
  }

  /**
   * Avalia payload de fixture / export online.
   * @param {Record<string, unknown>} payload
   */
  function evaluateSamplingPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "payload_invalid", alerts: [] };
    }
    var agent = payload.agent ? String(payload.agent) : "study_assistant";
    var kind = payload.kind ? String(payload.kind) : "runs";
    var thOpts = { agent: agent, thresholds: payload.thresholds || undefined };

    var aggResult;
    if (kind === "status_breakdown" || kind === "aggregates") {
      aggResult = aggregateStatusBreakdown(
        /** @type {Array<Record<string, unknown>>} */ (payload.rows || payload.aggregates),
        { agent: agent },
      );
    } else {
      aggResult = aggregateRunRows(
        /** @type {Array<Record<string, unknown>>} */ (payload.runs || []),
        { agent: agent },
      );
    }
    if (!aggResult.ok) {
      return {
        ok: false,
        error: aggResult.error,
        alerts: [
          {
            severity: "fail",
            code: "aggregate_failed",
            message: String(aggResult.error),
          },
        ],
        aggregates: [],
      };
    }

    var ev = evaluateAggregates(aggResult.aggregates, thOpts);
    return {
      ok: ev.ok,
      alerts: ev.alerts,
      aggregates: aggResult.aggregates,
      agent: agent,
      kind: kind,
    };
  }

  /** SQL canónico (espelho docs) — só SELECT agregados, sem PHI. */
  var DOCUMENTED_SQL = Object.freeze({
    study_assistant_by_tuple: [
      "select",
      "  tuple_id,",
      "  status,",
      "  count(*) as count,",
      "  percentile_cont(0.95) within group (order by prompt_tokens + completion_tokens) as tokens_p95",
      "from aghu_study_assistant_runs",
      "where created_at > now() - interval '7 days'",
      "group by 1, 2",
      "order by 3 desc;",
    ].join("\n"),
    study_assistant_errors: [
      "select error_code, count(*) as count",
      "from aghu_study_assistant_runs",
      "where created_at > now() - interval '7 days' and error_code is not null",
      "group by 1 order by 2 desc limit 20;",
    ].join("\n"),
    passometro_by_tuple: [
      "select",
      "  tuple_id,",
      "  count(*) as n,",
      "  avg((ok)::int) as success_rate,",
      "  percentile_cont(0.95) within group (order by coalesce(prompt_tokens,0)+coalesce(completion_tokens,0)) as tokens_p95",
      "from aghu_agent_run_events",
      "where created_at > now() - interval '7 days'",
      "group by 1",
      "order by n desc;",
    ].join("\n"),
  });

  return {
    SUCCESS_STATUSES: SUCCESS_STATUSES,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    DOCUMENTED_SQL: DOCUMENTED_SQL,
    assertAggregateSafeRow: assertAggregateSafeRow,
    percentileCont: percentileCont,
    aggregateRunRows: aggregateRunRows,
    aggregateStatusBreakdown: aggregateStatusBreakdown,
    evaluateAggregates: evaluateAggregates,
    evaluateSamplingPayload: evaluateSamplingPayload,
    thresholdsFor: thresholdsFor,
  };
});
