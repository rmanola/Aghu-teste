/**
 * FEAT-071/089 — runtime cliente (skill_calls → execute → sanitize + runState).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-agent-skills.js")
      : root.AghuPassometroAgentSkills,
    typeof require !== "undefined"
      ? require("./passometro-agent-graph.js")
      : root.AghuPassometroAgentGraph,
    typeof require !== "undefined"
      ? require("./passometro-agent-scorecard.js")
      : root.AghuPassometroAgentScorecard,
    typeof require !== "undefined"
      ? require("./passometro-agent-error-codes.js")
      : root.AghuPassometroAgentErrorCodes,
    typeof require !== "undefined"
      ? require("./passometro-agent-run-state.js")
      : root.AghuPassometroAgentRunState
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  skills,
  graph,
  scorecard,
  errorCodes,
  runStateApi
) {
  "use strict";

  function newRunId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return (
      "run_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function createRunState() {
    return runStateApi && runStateApi.createRunState
      ? runStateApi.createRunState()
      : {
          polReady: Object.create(null),
          controlesReady: Object.create(null),
          prescricoesReady: Object.create(null),
          navRetries: Object.create(null),
        };
  }

  function normalizeSkillCalls(calls) {
    var list = Array.isArray(calls) ? calls : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var toolName = c.name || c.toolName || "";
      var skillId = c.skillId || "";
      var skill =
        (skillId && skills.getSkillById(skillId)) ||
        (toolName && skills.getSkillByToolName(toolName));
      if (!skill) {
        out.push({
          ok: false,
          error: "Skill desconhecida.",
          errorCode: "unknown_skill",
          raw: { name: toolName, skillId: skillId },
        });
        continue;
      }
      out.push({
        ok: true,
        skillId: skill.skillId,
        toolName: skill.toolName,
        args: c.arguments != null ? c.arguments : c.args || {},
      });
    }
    return out;
  }

  /**
   * @param {object} opts
   * @param {Array} opts.skillCalls
   * @param {object} opts.deps
   * @param {string} [opts.runId]
   * @param {object} [opts.runState]
   * @param {(evt: object) => void} [opts.onEvent]
   */
  async function runSkillCalls(opts) {
    opts = opts || {};
    var runId = opts.runId || newRunId();
    var deps = opts.deps || {};
    var runState =
      opts.runState != null ? opts.runState : createRunState();
    var onEvent =
      typeof opts.onEvent === "function" ? opts.onEvent : function () {};
    var normalized = normalizeSkillCalls(opts.skillCalls);
    var skillIds = [];
    for (var i = 0; i < normalized.length; i++) {
      if (normalized[i].ok) skillIds.push(normalized[i].skillId);
      else {
        onEvent(
          errorCodes.buildRunEvent({
            skillId: "",
            phase: "extract",
            errorCode: "unknown_skill",
            ok: false,
          })
        );
        return {
          ok: false,
          runId: runId,
          runState: runState,
          error: normalized[i].error,
          errorCode: "unknown_skill",
          results: [],
        };
      }
    }

    var seq = graph.validateSkillSequence(skillIds, {
      runState: runState,
      skillCalls: normalized,
    });
    if (!seq.ok) {
      return {
        ok: false,
        runId: runId,
        runState: runState,
        error: seq.error,
        errorCode: seq.errorCode || "forbidden_tool",
        results: [],
      };
    }

    var reportEvent = function (partial) {
      var evt = errorCodes.buildRunEvent(partial);
      if (!evt || evt.error) {
        onEvent({
          runId: runId,
          ok: false,
          errorCode: "extract_failed",
          phase: partial && partial.phase,
          skillId: partial && partial.skillId,
          domain: partial && partial.domain,
        });
        return;
      }
      var payload = Object.assign({ runId: runId }, evt);
      if (typeof opts.onEvent === "function") {
        onEvent(payload);
      } else if (typeof deps.reportEvent === "function") {
        deps.reportEvent(payload);
      }
    };

    var execDeps = Object.assign({}, deps, {
      reportEvent: reportEvent,
      runState: runState,
    });
    var results = [];
    var allOk = true;
    var aborted = false;

    for (var j = 0; j < normalized.length; j++) {
      if (deps.signal && deps.signal.aborted) {
        aborted = true;
        allOk = false;
        break;
      }
      var call = normalized[j];
      var result = await skills.executeSkill(
        call.skillId,
        call.args,
        execDeps
      );
      var skill = skills.getSkillById(call.skillId);
      var card = scorecard.scoreSkillResult(result, {
        skillId: call.skillId,
        kind: skill && skill.kind,
        domain: skill && skill.domains && skill.domains[0],
      });
      if (!result || !result.ok) allOk = false;
      if (result && result.aborted) aborted = true;
      results.push({
        skillId: call.skillId,
        toolName: call.toolName,
        result: result,
        scorecard: card,
      });
      if (aborted) break;
    }

    return {
      ok: allOk,
      aborted: aborted,
      runId: runId,
      runState: runState,
      results: results,
    };
  }

  function suggestSkillFromUserText(text) {
    return skills.preferSkillForIntent(text);
  }

  return {
    newRunId: newRunId,
    createRunState: createRunState,
    normalizeSkillCalls: normalizeSkillCalls,
    runSkillCalls: runSkillCalls,
    suggestSkillFromUserText: suggestSkillFromUserText,
  };
});
