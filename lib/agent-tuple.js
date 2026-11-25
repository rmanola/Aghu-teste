/**
 * FEAT-073 — tuple versionada + canary % (sem PHI).
 * Usado por Passômetro (071) e Research Study Assistant (072).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuAgentTuple = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var AGENTS = Object.freeze(["passometro", "study_assistant", "procod"]);

  /** Defaults conservadores (tokens prompt+completion por run). */
  var DEFAULT_MAX_TOKENS = Object.freeze({
    passometro: 8000,
    study_assistant: 24000,
    // PROCOD (FEAT-157): extração + selecção por ato + verificação cross-provider
    // com fan-out por item. Teto mais alto porque o custo cresce com o número
    // de atos do laudo, não com o número de rounds.
    procod: 16000,
  });

  /**
   * FNV-1a 32-bit → hex curto (estável cross-runtime).
   * @param {string} input
   * @returns {string}
   */
  function fnv1aHex(input) {
    var str = String(input || "");
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * Bucket 0–99 determinístico a partir de userId (UUID opaco).
   * @param {string} userId
   * @returns {number}
   */
  function stableBucket(userId) {
    var h = fnv1aHex(String(userId || ""));
    return parseInt(h.slice(0, 8), 16) % 100;
  }

  /**
   * @param {string} userId
   * @param {number} percent 0–100
   * @returns {boolean}
   */
  function isCanaryUser(userId, percent) {
    var p = Number(percent);
    if (!isFinite(p)) p = 0;
    p = Math.max(0, Math.min(100, Math.floor(p)));
    if (p <= 0) return false;
    if (p >= 100) return true;
    if (!userId) return false;
    return stableBucket(userId) < p;
  }

  /**
   * Parse env canary; default 100 = todos com flag master on.
   * @param {string|undefined|null} raw
   * @param {number} [fallback=100]
   */
  function parseCanaryPercent(raw, fallback) {
    var fb = fallback == null ? 100 : fallback;
    if (raw == null || String(raw).trim() === "") return fb;
    var n = Number(raw);
    if (!isFinite(n)) return fb;
    return Math.max(0, Math.min(100, Math.floor(n)));
  }

  /**
   * Feature gate: kill ⊃ master ⊃ canary (canary ⊆ enabled).
   * @param {{ masterEnabled?: boolean, killSwitch?: boolean, canaryPercent?: number, userId?: string }} opts
   */
  function isFeatureAllowed(opts) {
    opts = opts || {};
    if (opts.killSwitch === true) return false;
    if (opts.masterEnabled !== true) return false;
    var pct =
      opts.canaryPercent == null ? 100 : Number(opts.canaryPercent);
    return isCanaryUser(String(opts.userId || ""), pct);
  }

  /**
   * @param {string} agent
   * @param {string[]} parts material estável (ids, caps, allowlist)
   */
  function hashRev(agent, parts) {
    var joined = [String(agent || "")]
      .concat(Array.isArray(parts) ? parts.map(String) : [])
      .join("|");
    return fnv1aHex(joined).slice(0, 8);
  }

  function yyyymmdd(date) {
    var d = date instanceof Date ? date : new Date();
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, "0");
    var day = String(d.getUTCDate()).padStart(2, "0");
    return "" + y + m + day;
  }

  /**
   * @param {{
   *   agent: 'passometro'|'study_assistant'|'procod',
   *   model?: string,
   *   skillsRev?: string,
   *   policyRev?: string,
   *   graphRev?: string,
   *   memorySchemaVersion?: string,
   *   systemPromptHash?: string,
   *   toolSchemasHash?: string,
   *   date?: Date,
   * }} opts
   */
  function buildTupleMeta(opts) {
    opts = opts || {};
    var agent = String(opts.agent || "");
    if (AGENTS.indexOf(agent) === -1) {
      return { ok: false, error: "agent inválido." };
    }
    var model = String(opts.model || "unset").slice(0, 64);
    var skillsRev = String(opts.skillsRev || "0").slice(0, 16);
    var policyRev = String(opts.policyRev || "0").slice(0, 16);
    var graphRev = String(opts.graphRev || "0").slice(0, 16);
    var memorySchemaVersion = String(opts.memorySchemaVersion || "0").slice(
      0,
      16,
    );
    var systemPromptHash = String(opts.systemPromptHash || "0").slice(0, 16);
    var toolSchemasHash = String(opts.toolSchemasHash || "0").slice(0, 16);
    var day = yyyymmdd(opts.date);
    var bodyHash = hashRev(agent, [
      model,
      skillsRev,
      policyRev,
      graphRev,
      memorySchemaVersion,
      systemPromptHash,
      toolSchemasHash,
    ]);
    var tupleId = agent + "-" + day + "-" + bodyHash;
    return {
      ok: true,
      meta: {
        tuple_id: tupleId,
        agent: agent,
        model: model,
        skills_rev: skillsRev,
        policy_rev: policyRev,
        graph_rev: graphRev,
        memory_schema_version: memorySchemaVersion,
        system_prompt_hash: systemPromptHash,
        tool_schemas_hash: toolSchemasHash,
      },
    };
  }

  /**
   * @param {string|undefined|null} raw
   * @param {'passometro'|'study_assistant'|'procod'} agent
   */
  function parseMaxTokensPerRun(raw, agent) {
    var fallback =
      DEFAULT_MAX_TOKENS[agent] != null
        ? DEFAULT_MAX_TOKENS[agent]
        : 8000;
    if (raw == null || String(raw).trim() === "") return fallback;
    var n = Number(raw);
    if (!isFinite(n) || n < 1) return fallback;
    return Math.min(Math.floor(n), 500000);
  }

  /**
   * FEAT-074 — fail-closed se prompt+completion >= max.
   * @returns {{ ok: true } | { ok: false, errorCode: 'token_budget_exceeded', total: number, max: number }}
   */
  function assertTokenBudget(promptTokens, completionTokens, maxTokens) {
    var prompt = Math.max(0, Number(promptTokens) || 0);
    var completion = Math.max(0, Number(completionTokens) || 0);
    var total = prompt + completion;
    var max = Math.max(1, Number(maxTokens) || 1);
    if (total > max) {
      return {
        ok: false,
        errorCode: "token_budget_exceeded",
        total: total,
        max: max,
      };
    }
    return { ok: true, total: total, max: max };
  }

  return {
    AGENTS: AGENTS,
    DEFAULT_MAX_TOKENS: DEFAULT_MAX_TOKENS,
    fnv1aHex: fnv1aHex,
    stableBucket: stableBucket,
    isCanaryUser: isCanaryUser,
    parseCanaryPercent: parseCanaryPercent,
    isFeatureAllowed: isFeatureAllowed,
    hashRev: hashRev,
    buildTupleMeta: buildTupleMeta,
    parseMaxTokensPerRun: parseMaxTokensPerRun,
    assertTokenBudget: assertTokenBudget,
  };
});
