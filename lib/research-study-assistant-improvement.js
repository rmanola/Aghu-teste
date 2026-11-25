/**
 * FEAT-076 — ACE trilho B Research: fila de melhoria (sem PHI / sem proposal body).
 * Espelha passometro-agent-improvement.js com taxonomia study_assistant.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistantImprovement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ERROR_CODES = Object.freeze([
    "escalate_validation",
    "llm_error",
    "token_budget_exceeded",
    "judge_failed",
    "e1_validation_failed",
    "plan_incomplete",
    "rate_limit_exceeded",
    "feature_disabled",
    "ai_consent_required",
  ]);

  var SESSION_PHASES = Object.freeze(["plan", "draft", "revise", "patch"]);

  var STATUSES = Object.freeze([
    "open",
    "triaged",
    "fixture_pending",
    "resolved",
    "wontfix",
  ]);

  function isKnownErrorCode(code) {
    return ERROR_CODES.indexOf(String(code || "")) !== -1;
  }

  function isKnownSessionPhase(phase) {
    return SESSION_PHASES.indexOf(String(phase || "")) !== -1;
  }

  /**
   * @param {object} partial
   * @returns {{ ok: true, item: object } | { ok: false, error: string }}
   */
  function createQueueItem(partial) {
    partial = partial || {};
    var errorCode = String(partial.errorCode || partial.error_code || "");
    var sessionPhase = String(
      partial.sessionPhase || partial.session_phase || "draft",
    );
    if (!errorCode) {
      return { ok: false, error: "errorCode obrigatório." };
    }
    if (!isKnownErrorCode(errorCode)) {
      return { ok: false, error: "errorCode desconhecido." };
    }
    if (!isKnownSessionPhase(sessionPhase)) {
      return { ok: false, error: "sessionPhase inválida." };
    }
    return {
      ok: true,
      item: {
        errorCode: errorCode,
        sessionPhase: sessionPhase,
        count: Math.max(1, Number(partial.count) || 1),
        status: "open",
        fixturePath: null,
        skillId: partial.skillId
          ? String(partial.skillId)
          : partial.skill_id
          ? String(partial.skill_id)
          : null,
      },
    };
  }

  function canResolve(item, evidence) {
    evidence = evidence || {};
    var path = String(evidence.fixturePath || (item && item.fixturePath) || "");
    if (!path) {
      return {
        ok: false,
        error: "Fixture de regressão obrigatória antes de fechar.",
      };
    }
    if (!/^tests\/.+\.(test\.mjs|json)$/.test(path) && !/^tests\/fixtures\//.test(path)) {
      return {
        ok: false,
        error: "fixturePath deve ser tests/*.test.mjs ou tests/fixtures/…",
      };
    }
    if (evidence.testsGreen !== true) {
      return {
        ok: false,
        error: "Testes de regressão / golden devem estar verdes.",
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

  function markTriaged(item) {
    return {
      ok: true,
      item: Object.assign({}, item, { status: "triaged" }),
    };
  }

  /**
   * Ranking por errorCode×sessionPhase (sem PHI).
   */
  function rankFailures(events) {
    var map = Object.create(null);
    var list = Array.isArray(events) ? events : [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var code = String(
        e.errorCode != null ? e.errorCode : e.error_code || "",
      );
      if (!code || !isKnownErrorCode(code)) continue;
      if (e.ok === true && !e.errorCode && !e.error_code) continue;
      var phase = String(
        e.sessionPhase != null
          ? e.sessionPhase
          : e.session_phase || e.mode || "draft",
      );
      if (!isKnownSessionPhase(phase)) phase = "draft";
      var key = code + "|" + phase;
      if (!map[key]) {
        map[key] = {
          errorCode: code,
          sessionPhase: phase,
          count: 0,
          skillId: e.skillId || e.skill_id || null,
        };
      }
      map[key].count++;
      if (!map[key].skillId && (e.skillId || e.skill_id)) {
        map[key].skillId = e.skillId || e.skill_id;
      }
    }
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });
  }

  function queueFromEvents(events) {
    var ranked = rankFailures(events);
    var items = [];
    for (var i = 0; i < ranked.length; i++) {
      var created = createQueueItem(ranked[i]);
      if (created.ok) items.push(created.item);
    }
    return items;
  }

  function planQueueUpserts(rankedOrItems, existingOpen) {
    var items = Array.isArray(rankedOrItems) ? rankedOrItems : [];
    var existing = Array.isArray(existingOpen) ? existingOpen : [];
    var byKey = Object.create(null);
    for (var i = 0; i < existing.length; i++) {
      var e = existing[i] || {};
      var eCode = String(e.errorCode != null ? e.errorCode : e.error_code || "");
      var ePhase = String(
        e.sessionPhase != null ? e.sessionPhase : e.session_phase || "draft",
      );
      byKey[eCode + "|" + ePhase] = e;
    }
    var inserts = [];
    var updates = [];
    for (var j = 0; j < items.length; j++) {
      var raw = items[j] || {};
      var created = createQueueItem(raw);
      if (!created.ok) continue;
      var item = created.item;
      var key = item.errorCode + "|" + item.sessionPhase;
      var prev = byKey[key];
      if (prev && prev.id) {
        updates.push({
          id: prev.id,
          count: Math.max(
            Math.max(1, Number(prev.count) || 1),
            item.count,
          ),
          skill_id: item.skillId || prev.skill_id || prev.skillId || null,
        });
      } else if (!prev) {
        inserts.push(item);
        byKey[key] = {
          id: "",
          error_code: item.errorCode,
          session_phase: item.sessionPhase,
          count: item.count,
          status: "open",
        };
      }
    }
    return { inserts: inserts, updates: updates };
  }

  function reflectFromEvents(events, existingOpen) {
    var ranked = rankFailures(events);
    var plan = planQueueUpserts(ranked, existingOpen);
    return {
      ranked: ranked,
      inserts: plan.inserts,
      updates: plan.updates,
    };
  }

  function fixtureSkeleton(item) {
    var code = (item && item.errorCode) || "e1_validation_failed";
    var phase = (item && item.sessionPhase) || "draft";
    return [
      "/**",
      " * Regressão FEAT-076 — " + code + " / " + phase,
      " * TODO: golden em tests/fixtures/agent-golden (sem PHI).",
      " */",
      'import assert from "node:assert/strict";',
      'import { describe, it } from "node:test";',
      "",
      'describe("regressão study ' + code + '", () => {',
      '  it("fase ' + phase + '", () => {',
      "    assert.equal(true, true);",
      "  });",
      "});",
      "",
    ].join("\n");
  }

  return {
    ERROR_CODES: ERROR_CODES,
    SESSION_PHASES: SESSION_PHASES,
    STATUSES: STATUSES,
    isKnownErrorCode: isKnownErrorCode,
    isKnownSessionPhase: isKnownSessionPhase,
    createQueueItem: createQueueItem,
    canResolve: canResolve,
    markResolved: markResolved,
    markTriaged: markTriaged,
    rankFailures: rankFailures,
    queueFromEvents: queueFromEvents,
    planQueueUpserts: planQueueUpserts,
    reflectFromEvents: reflectFromEvents,
    fixtureSkeleton: fixtureSkeleton,
  };
});
