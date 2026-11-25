/**
 * FEAT-157 — estimativa USD por chamada LLM/embedding (pins do PROCOD).
 *
 * Não há tabela de preços no resto do repo. Tarifas USD / 1M tokens, API
 * standard (não Batch, sem cache hit):
 *  • claude-haiku-4-5 — $1 in / $5 out
 *    https://www.anthropic.com/claude/haiku
 *    https://platform.claude.com/docs/en/about-claude/pricing
 *  • gpt-5-nano — $0.05 in / $0.40 out
 *    https://openai.com/index/introducing-gpt-5-for-developers/
 *    https://developers.openai.com/api/docs/models/gpt-5-nano
 *  • text-embedding-3-small — $0.02 in / $0 out
 *    https://developers.openai.com/api/docs/pricing
 *
 * Modelo desconhecido → $0 (não inventar tarifa). Sem split in/out, o total
 * conta como input (subestima LLM; embeddings só têm input).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodCost = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var USD_SCALE = 1e8;

  var RATES_USD_PER_M = Object.freeze({
    "claude-haiku-4-5": Object.freeze({ input: 1, output: 5 }),
    "gpt-5-nano": Object.freeze({ input: 0.05, output: 0.4 }),
    "text-embedding-3-small": Object.freeze({ input: 0.02, output: 0 }),
  });

  function str(v) {
    return v == null ? "" : String(v);
  }

  function roundUsd(n) {
    var x = Number(n);
    if (!isFinite(x) || x <= 0) return 0;
    return Math.round(x * USD_SCALE) / USD_SCALE;
  }

  function normalizeModel(model) {
    var m = str(model).trim().toLowerCase();
    if (!m) return "";
    if (RATES_USD_PER_M[m]) return m;
    var keys = Object.keys(RATES_USD_PER_M);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (m.indexOf(k) === 0) return k;
    }
    return m;
  }

  function ratesFor(model) {
    var key = normalizeModel(model);
    return RATES_USD_PER_M[key] || null;
  }

  /**
   * @param {{model?: string, tokensIn?: number, tokensOut?: number, tokens?: number, kind?: string}} input
   */
  function usageFromCall(input) {
    input = input || {};
    var tokensIn = Math.max(0, Number(input.tokensIn) || 0);
    var tokensOut = Math.max(0, Number(input.tokensOut) || 0);
    var tokens = Math.max(0, Number(input.tokens) || 0);
    if (!tokensIn && !tokensOut && tokens) {
      tokensIn = tokens;
      tokensOut = 0;
    }
    if (!tokens) tokens = tokensIn + tokensOut;
    var rates = ratesFor(input.model);
    var costUsd = 0;
    if (rates) {
      costUsd = roundUsd(
        (tokensIn / 1e6) * rates.input + (tokensOut / 1e6) * rates.output
      );
    }
    return {
      tokens: tokens,
      tokensIn: tokensIn,
      tokensOut: tokensOut,
      costUsd: costUsd,
      model: normalizeModel(input.model),
    };
  }

  function formatUsd(n) {
    var x = roundUsd(n);
    if (x < 0.01) return "$" + x.toFixed(6);
    return "$" + x.toFixed(4);
  }

  /** Usa costUsd dado se > 0; senão estima pela tarifa do modelo. */
  function resolveCallCost(row) {
    row = row || {};
    var given = Number(row.costUsd);
    if (isFinite(given) && given > 0) return roundUsd(given);
    return usageFromCall({
      model: row.model,
      tokens: row.tokens,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
    }).costUsd;
  }

  function sumAuditCost(input) {
    input = input || {};
    var given = Number(input.costUsdSpent);
    if (isFinite(given) && given > 0) return roundUsd(given);
    var total = 0;
    var lists = [input.llmCalls, input.embedCalls];
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        total += resolveCallCost(list[j]);
      }
    }
    if (total > 0) return roundUsd(total);
    return isFinite(given) && given >= 0 ? roundUsd(given) : 0;
  }

  function costByNode(input) {
    input = input || {};
    var map = {};
    var lists = [input.llmCalls, input.embedCalls];
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        var row = list[j] || {};
        var node = str(row.node) || "unknown";
        map[node] = roundUsd((map[node] || 0) + resolveCallCost(row));
      }
    }
    return map;
  }

  return {
    RATES_USD_PER_M: RATES_USD_PER_M,
    roundUsd: roundUsd,
    normalizeModel: normalizeModel,
    ratesFor: ratesFor,
    usageFromCall: usageFromCall,
    formatUsd: formatUsd,
    resolveCallCost: resolveCallCost,
    sumAuditCost: sumAuditCost,
    costByNode: costByNode,
  };
});
