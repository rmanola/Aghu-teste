/**
 * FEAT-071 — ACE trilho B: fila de melhoria nav/extract (sem PHI).
 * Patch em casca-nav exige fixture + gate humano — nunca auto-merge.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-agent-error-codes.js")
      : root.AghuPassometroAgentErrorCodes,
    typeof require !== "undefined"
      ? require("./passometro-agent-scorecard.js")
      : root.AghuPassometroAgentScorecard
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentImprovement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  errorCodes,
  scorecard
) {
  "use strict";

  var STATUSES = Object.freeze([
    "open",
    "triaged",
    "fixture_pending",
    "resolved",
    "wontfix",
  ]);

  /**
   * @param {object} partial
   * @returns {{ ok: true, item: object } | { ok: false, error: string }}
   */
  function createQueueItem(partial) {
    partial = partial || {};
    var errorCode = String(partial.errorCode || "");
    var domain = String(partial.domain || "");
    var phase = String(partial.phase || "extract");
    if (!errorCodes.isKnownErrorCode(errorCode)) {
      return { ok: false, error: "errorCode desconhecido." };
    }
    if (errorCode === "empty_ok") {
      return { ok: false, error: "empty_ok não entra na fila." };
    }
    if (domain && !errorCodes.isKnownDomain(domain)) {
      return { ok: false, error: "domain inválido." };
    }
    if (!errorCodes.isKnownPhase(phase)) {
      return { ok: false, error: "phase inválida." };
    }
    return {
      ok: true,
      item: {
        errorCode: errorCode,
        domain: domain || "composite",
        phase: phase,
        count: Math.max(1, Number(partial.count) || 1),
        status: "open",
        fixturePath: null,
        skillId: partial.skillId ? String(partial.skillId) : null,
      },
    };
  }

  /**
   * PA-AC-17 — fechar item só com fixture de regressão.
   * @param {object} item
   * @param {{ fixturePath?: string, testsGreen?: boolean }} evidence
   */
  function canResolve(item, evidence) {
    evidence = evidence || {};
    var path = String(evidence.fixturePath || (item && item.fixturePath) || "");
    if (!path) {
      return {
        ok: false,
        error: "Fixture de regressão obrigatória antes de fechar.",
      };
    }
    if (!/^tests\/.+\.test\.mjs$/.test(path)) {
      return {
        ok: false,
        error: "fixturePath deve ser tests/*.test.mjs.",
      };
    }
    if (evidence.testsGreen !== true) {
      return {
        ok: false,
        error: "Testes de regressão devem estar verdes.",
      };
    }
    return { ok: true };
  }

  function markResolved(item, evidence) {
    var gate = canResolve(item, evidence);
    if (!gate.ok) return gate;
    return {
      ok: true,
      item: Object.assign({}, item, {
        status: "resolved",
        fixturePath: String(evidence.fixturePath || item.fixturePath),
      }),
    };
  }

  /**
   * Gera esqueleto de teste (template) a partir do errorCode — sem DOM real/PHI.
   */
  function fixtureSkeleton(item) {
    var code = (item && item.errorCode) || "extract_failed";
    var domain = (item && item.domain) || "composite";
    var phase = (item && item.phase) || "extract";
    return [
      "/**",
      " * Regressão FEAT-070/071 — " + code + " / " + domain + " / " + phase,
      " * TODO: preencher asserts com DOM sintético (sem PHI).",
      " * // PA-AC-17",
      " */",
      'import assert from "node:assert/strict";',
      'import { describe, it } from "node:test";',
      "",
      'describe("regressão ' + code + '", () => {',
      '  it("reproduz ' + phase + " em " + domain + '", () => {',
      "    assert.equal(true, true); // substituir pelo oráculo",
      "  });",
      "});",
      "",
    ].join("\n");
  }

  /**
   * A partir do ranking reflect → itens de fila (PA-AC-16).
   */
  function queueFromEvents(events) {
    var ranked = scorecard.rankNavExtractFailures(events);
    var items = [];
    for (var i = 0; i < ranked.length; i++) {
      var created = createQueueItem(ranked[i]);
      if (created.ok) items.push(created.item);
    }
    return items;
  }

  /** Janela default do cron ACE reflect (dias). */
  var REFLECT_LOOKBACK_DAYS = 7;

  /**
   * Normaliza linha DB (snake) ou evento client (camel) → shape de ranking.
   * Aceita só metadados — sem PHI.
   */
  function eventFromRow(row) {
    row = row || {};
    return {
      errorCode: row.errorCode != null ? row.errorCode : row.error_code,
      domain: row.domain,
      phase: row.phase,
      ok: row.ok,
      skillId: row.skillId != null ? row.skillId : row.skill_id,
    };
  }

  /**
   * Planeja inserts/updates na fila a partir do ranking e itens open existentes.
   * existingOpen: [{ id?, errorCode|error_code, domain, phase, count, status, skillId? }]
   * @returns {{ inserts: object[], updates: object[] }}
   */
  function planQueueUpserts(rankedOrItems, existingOpen) {
    var items = Array.isArray(rankedOrItems) ? rankedOrItems : [];
    var existing = Array.isArray(existingOpen) ? existingOpen : [];
    var byKey = Object.create(null);
    for (var i = 0; i < existing.length; i++) {
      var e = existing[i] || {};
      var eCode = String(e.errorCode != null ? e.errorCode : e.error_code || "");
      var eDomain = String(e.domain || "composite");
      var ePhase = String(e.phase || "extract");
      byKey[eCode + "|" + eDomain + "|" + ePhase] = e;
    }
    var inserts = [];
    var updates = [];
    for (var j = 0; j < items.length; j++) {
      var raw = items[j] || {};
      var created = createQueueItem({
        errorCode: raw.errorCode != null ? raw.errorCode : raw.error_code,
        domain: raw.domain,
        phase: raw.phase,
        count: raw.count,
        skillId: raw.skillId != null ? raw.skillId : raw.skill_id,
      });
      if (!created.ok) continue;
      var item = created.item;
      var key = item.errorCode + "|" + item.domain + "|" + item.phase;
      var prev = byKey[key];
      if (prev && prev.id) {
        var prevCount = Math.max(1, Number(prev.count) || 1);
        updates.push({
          id: prev.id,
          count: Math.max(prevCount, item.count),
          skillId: item.skillId || prev.skillId || prev.skill_id || null,
          status: prev.status || "open",
        });
      } else if (!prev) {
        inserts.push(item);
        byKey[key] = item;
      }
    }
    return { inserts: inserts, updates: updates };
  }

  /**
   * Reflect completo (PA-AC-16): events → ranking → plano de upsert.
   */
  function reflectFromEvents(events, existingOpen) {
    var normalized = (Array.isArray(events) ? events : []).map(eventFromRow);
    var items = queueFromEvents(normalized);
    var plan = planQueueUpserts(items, existingOpen);
    return {
      ranked: items,
      inserts: plan.inserts,
      updates: plan.updates,
    };
  }

  return {
    STATUSES: STATUSES,
    REFLECT_LOOKBACK_DAYS: REFLECT_LOOKBACK_DAYS,
    createQueueItem: createQueueItem,
    canResolve: canResolve,
    markResolved: markResolved,
    fixtureSkeleton: fixtureSkeleton,
    queueFromEvents: queueFromEvents,
    eventFromRow: eventFromRow,
    planQueueUpserts: planQueueUpserts,
    reflectFromEvents: reflectFromEvents,
  };
});
