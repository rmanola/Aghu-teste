/**
 * FEAT-089 — loop multi-round observe→act (cliente testável).
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
      ? require("./passometro-agent-run-state.js")
      : root.AghuPassometroAgentRunState,
    typeof require !== "undefined"
      ? require("./passometro-agent-runtime.js")
      : root.AghuPassometroAgentRuntime
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentLoop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  skills,
  graph,
  runStateApi,
  runtime
) {
  "use strict";

  var MAX_AGENT_ROUNDS = 8;

  function buildToolResultsFromExec(calls, exec) {
    var list = Array.isArray(calls) ? calls : [];
    var results = (exec && exec.results) || [];
    return list.map(function (c, idx) {
      var skill =
        skills.getSkillById(c.skillId) ||
        skills.getSkillByToolName(c.name || c.toolName);
      var raw = results[idx] && results[idx].result;
      var sanitized = skills.sanitizeSkillResult(raw || { ok: false }, skill);
      return {
        tool_call_id: c.id,
        content: JSON.stringify(sanitized),
      };
    });
  }

  function buildAssistantToolCalls(calls) {
    var list = Array.isArray(calls) ? calls : [];
    return list.map(function (c) {
      return {
        id: String(c.id || ""),
        name: String(c.name || c.toolName || ""),
        arguments:
          c.arguments != null
            ? c.arguments
            : c.args != null
              ? c.args
              : {},
      };
    });
  }

  /**
   * Tool result sintético quando gate bloqueia re-nav (sem HITL/DOM).
   * @param {Array} calls
   * @param {{ suggestExtractSkillId?: string, suggestToolName?: string }} gate
   */
  function buildSyntheticNavAlreadyReadyToolResults(calls, gate) {
    var list = Array.isArray(calls) ? calls : [];
    return list.map(function (c) {
      var skill =
        skills.getSkillById(c.skillId) ||
        skills.getSkillByToolName(c.name || c.toolName);
      var payload = {
        ok: true,
        skipped: true,
        errorCode: "nav_already_ready",
        navComplete: true,
        kind: "nav",
        phase: "nav",
        nextSkill: gate.suggestExtractSkillId,
        readyForExtract: gate.suggestToolName,
      };
      return {
        tool_call_id: c.id,
        content: JSON.stringify(skills.sanitizeSkillResult(payload, skill)),
      };
    });
  }

  function appendAgentTurn(agentTurns, assistantToolCalls, toolResults) {
    if (
      !Array.isArray(agentTurns) ||
      !assistantToolCalls ||
      !assistantToolCalls.length ||
      !toolResults ||
      !toolResults.length
    ) {
      return;
    }
    agentTurns.push({
      assistant_tool_calls: assistantToolCalls,
      tool_results: toolResults,
    });
  }

  function countRunStateFlags(runState) {
    if (!runState) return { pol: 0, controles: 0, prescricoes: 0 };
    function countMap(m) {
      if (!m || typeof m !== "object") return 0;
      return Object.keys(m).length;
    }
    return {
      pol: countMap(runState.polReady),
      controles: countMap(runState.controlesReady),
      prescricoes: countMap(runState.prescricoesReady),
    };
  }

  function resolveCallSkillId(call) {
    if (graph && typeof graph.resolveCallSkillId === "function") {
      return graph.resolveCallSkillId(call);
    }
    call = call || {};
    if (call.skillId) return String(call.skillId);
    return String(call.name || call.toolName || "");
  }

  function callArguments(call) {
    call = call || {};
    return call.arguments != null ? call.arguments : call.args || {};
  }

  function buildAutoExtractCall(navCall, gate, roundNum) {
    if (!gate || !gate.suggestExtractSkillId || !gate.suggestToolName) {
      return null;
    }
    var args = callArguments(navCall);
    var prontuarios = Array.isArray(args.prontuarios) ? args.prontuarios : [];
    if (!prontuarios.length) return null;
    return {
      id: "auto_" + gate.suggestToolName + "_r" + roundNum,
      name: gate.suggestToolName,
      skillId: gate.suggestExtractSkillId,
      arguments: {
        prontuarios: prontuarios,
        periodo: args.periodo || "hoje",
      },
    };
  }

  /**
   * Extract tipado já com nav ready no runState → sem HITL (só status).
   * @param {Array} calls
   * @param {object} runState
   */
  function shouldAutoConfirmExtract(calls, runState) {
    var list = Array.isArray(calls) ? calls : [];
    if (!list.length || !runStateApi) return false;
    for (var i = 0; i < list.length; i++) {
      var skillId = resolveCallSkillId(list[i]);
      if (runStateApi.isNavSkillId && runStateApi.isNavSkillId(skillId)) {
        return false;
      }
      if (skillId === "passometro.oneclick") return false;
      var flag =
        runStateApi.extractFlagForSkillId &&
        runStateApi.extractFlagForSkillId(skillId);
      if (!flag) return false;
      var args = callArguments(list[i]);
      var prontuarios = Array.isArray(args.prontuarios) ? args.prontuarios : [];
      if (!prontuarios.length) return false;
      for (var j = 0; j < prontuarios.length; j++) {
        if (!runStateApi.isExtractReady(runState, skillId, prontuarios[j])) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Após nav ok (ou nav_already_ready), encadeia extract localmente — sem HITL nem Edge.
   * @returns {Promise<{ executed: boolean, exec?: object, runState?: object, cancelled?: boolean }>}
   */
  async function maybeAutoChainExtract(opts) {
    opts = opts || {};
    var navCall = opts.navCall;
    var gate = opts.gate;
    var roundNum = opts.roundNum;
    var runId = opts.runId;
    var runState = opts.runState;
    var extractCall = buildAutoExtractCall(navCall, gate, roundNum);
    if (!extractCall) return { executed: false };

    if (typeof opts.onRoundStart === "function") {
      opts.onRoundStart(roundNum, [extractCall]);
    }

    /* Nav já confirmada pelo médico — extract encadeado sem 2º HITL. */
    if (opts.signal && opts.signal.aborted) {
      return { executed: false, cancelled: false, aborted: true };
    }

    var events = [];
    var extractExec = await runtime.runSkillCalls({
      runId: runId,
      skillCalls: [extractCall],
      runState: runState,
      deps: opts.execDeps,
      onEvent: function (e) {
        events.push(e);
        if (opts.onEvent) opts.onEvent(e);
      },
    });

    if (extractExec && extractExec.runState) {
      runState = extractExec.runState;
    }

    if (typeof opts.reportEvents === "function" && events.length) {
      await opts.reportEvents(runId, events);
    }

    if (typeof opts.onRoundTelemetry === "function") {
      opts.onRoundTelemetry({
        round: roundNum,
        phase: "auto_extract_chained",
        skillIds: [extractCall.skillId],
        runStateFlags: countRunStateFlags(runState),
        execOk: !!(extractExec && extractExec.ok),
      });
    }

    if (typeof opts.onRoundComplete === "function") {
      await opts.onRoundComplete({
        round: roundNum,
        calls: [extractCall],
        exec: extractExec,
        autoChained: true,
      });
    }

    appendAgentTurn(
      opts.agentTurns,
      buildAssistantToolCalls([extractCall]),
      buildToolResultsFromExec([extractCall], extractExec)
    );

    return {
      executed: true,
      exec: extractExec,
      runState: runState,
      events: events,
    };
  }

  /**
   * @param {object} opts
   * @param {Array} opts.messages
   * @param {string} [opts.runId]
   * @param {AbortSignal} [opts.signal]
   * @param {Function} opts.callEdge — (payload) => { ok, data?, error?, status? }
   * @param {object} [opts.deps] — deps para runtime.runSkillCalls
   * @param {Function} [opts.onConfirm] — async (calls, round) => { confirmed }
   * @param {Function} [opts.onRoundStart] — (round, calls)
   * @param {Function} [opts.onProgress]
   * @param {Function} [opts.reportEvents] — async (runId, events)
   * @param {Function} [opts.onRoundTelemetry] — (info) void
   * @param {number} [opts.maxRounds]
   */
  async function runAgentLoop(opts) {
    opts = opts || {};
    var messages = opts.messages || [];
    var runId =
      opts.runId || (runtime && runtime.newRunId ? runtime.newRunId() : "run");
    var runState =
      opts.runState ||
      (runStateApi && runStateApi.createRunState
        ? runStateApi.createRunState()
        : null);
    var maxRounds =
      typeof opts.maxRounds === "number" ? opts.maxRounds : MAX_AGENT_ROUNDS;
    var round = 0;
    var agentTurns = [];
    var lastExec = null;
    var onConfirm =
      typeof opts.onConfirm === "function"
        ? opts.onConfirm
        : typeof opts.waitForConfirm === "function"
          ? opts.waitForConfirm
          : async function () {
              return { confirmed: true };
            };

    while (round < maxRounds) {
      if (opts.signal && opts.signal.aborted) {
        return {
          ok: false,
          aborted: true,
          runId: runId,
          runState: runState,
          rounds: round,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      var payload = {
        action: "chat",
        messages: messages,
        run_id: runId,
      };
      if (agentTurns.length) {
        payload.agent_turns = agentTurns;
      }

      var res = await opts.callEdge(payload);
      if (!res || !res.ok) {
        return {
          ok: false,
          runId: runId,
          runState: runState,
          rounds: round,
          edgeError: (res && res.error) || "llm_failed",
          status: res && res.status,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      var data = res.data || {};
      runId = data.runId || runId;

      if (data.error === "token_budget_exceeded") {
        return {
          ok: false,
          type: "budget_exceeded",
          runId: runId,
          runState: runState,
          rounds: round + 1,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      if (data.type === "message") {
        return {
          ok: true,
          type: "message",
          text: String(data.text || ""),
          runId: runId,
          runState: runState,
          rounds: round + 1,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      if (
        data.type !== "skill_calls" ||
        !Array.isArray(data.calls) ||
        !data.calls.length
      ) {
        return {
          ok: false,
          runId: runId,
          runState: runState,
          rounds: round,
          error: "unexpected_response",
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      var calls = data.calls;
      var roundNum = round + 1;
      var normalizedCalls = calls.map(function (c) {
        return {
          skillId: c.skillId,
          name: c.name,
          args: c.arguments,
        };
      });

      if (typeof opts.onRoundTelemetry === "function") {
        opts.onRoundTelemetry({
          round: roundNum,
          phase: "proposed",
          skillIds: calls.map(function (c) {
            return c.skillId || c.name;
          }),
          runStateFlags: countRunStateFlags(runState),
        });
      }

      if (typeof opts.onRoundStart === "function") {
        opts.onRoundStart(roundNum, calls);
      } else if (typeof opts.onAssistantIntro === "function" && data.text) {
        opts.onAssistantIntro(String(data.text), { final: false });
      }

      var gate = { ok: true };
      if (
        graph &&
        typeof graph.validateSkillCallsWithRunState === "function"
      ) {
        gate = graph.validateSkillCallsWithRunState(normalizedCalls, runState);
      }

      if (!gate.ok && gate.errorCode === "nav_already_ready") {
        var assistantCalls = buildAssistantToolCalls(calls);
        var syntheticResults = buildSyntheticNavAlreadyReadyToolResults(
          calls,
          gate
        );
        appendAgentTurn(agentTurns, assistantCalls, syntheticResults);

        if (typeof opts.onRoundTelemetry === "function") {
          opts.onRoundTelemetry({
            round: roundNum,
            phase: "nav_already_ready_skipped",
            skillIds: calls.map(function (c) {
              return c.skillId || c.name;
            }),
            runStateFlags: countRunStateFlags(runState),
            suggestExtract: gate.suggestToolName,
          });
        }

        if (typeof opts.onRoundComplete === "function") {
          await opts.onRoundComplete({
            round: roundNum,
            calls: calls,
            exec: {
              ok: true,
              skipped: true,
              errorCode: "nav_already_ready",
              results: calls.map(function (c, idx) {
                return {
                  skillId: resolveCallSkillId(c),
                  result: JSON.parse(syntheticResults[idx].content),
                };
              }),
            },
            recovery: "nav_already_ready",
          });
        }

        var chainAfterSkip = await maybeAutoChainExtract({
          navCall: calls[0],
          gate: gate,
          roundNum: roundNum,
          runId: runId,
          runState: runState,
          agentTurns: agentTurns,
          signal: opts.signal,
          execDeps: Object.assign({}, opts.deps || {}, {
            onProgress: opts.onProgress || (opts.deps && opts.deps.onProgress),
            signal: opts.signal,
          }),
          onConfirm: onConfirm,
          onRoundStart: opts.onRoundStart,
          onRoundComplete: opts.onRoundComplete,
          onRoundTelemetry: opts.onRoundTelemetry,
          reportEvents: opts.reportEvents,
          onEvent: function (e) {
            if (opts.deps && typeof opts.deps.reportEvent === "function") {
              opts.deps.reportEvent(e);
            }
          },
        });
        if (chainAfterSkip.cancelled) {
          return {
            ok: false,
            cancelled: true,
            runId: runId,
            runState: runState,
            rounds: round,
            lastExec: lastExec,
            agentTurns: agentTurns,
          };
        }
        if (chainAfterSkip.executed) {
          lastExec = chainAfterSkip.exec;
          runState = chainAfterSkip.runState || runState;
        }

        round++;
        continue;
      }

      if (!gate.ok) {
        return {
          ok: false,
          runId: runId,
          runState: runState,
          rounds: round,
          error: gate.error || "Batch inválido.",
          errorCode: gate.errorCode || "nav_required",
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      var autoExtract = shouldAutoConfirmExtract(calls, runState);
      var decision = autoExtract
        ? { confirmed: true }
        : await onConfirm(calls, roundNum);
      if (!decision || !decision.confirmed) {
        return {
          ok: false,
          cancelled: true,
          runId: runId,
          runState: runState,
          rounds: round,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      if (opts.signal && opts.signal.aborted) {
        return {
          ok: false,
          aborted: true,
          runId: runId,
          runState: runState,
          rounds: round,
          lastExec: lastExec,
          agentTurns: agentTurns,
        };
      }

      var events = [];
      var execDeps = Object.assign({}, opts.deps || {}, {
        onProgress: opts.onProgress || (opts.deps && opts.deps.onProgress),
        signal: opts.signal,
      });

      var exec = await runtime.runSkillCalls({
        runId: runId,
        skillCalls: calls,
        runState: runState,
        deps: execDeps,
        onEvent: function (e) {
          events.push(e);
          if (opts.deps && typeof opts.deps.reportEvent === "function") {
            opts.deps.reportEvent(e);
          }
        },
      });
      lastExec = exec;
      if (exec && exec.runState) runState = exec.runState;

      if (typeof opts.reportEvents === "function" && events.length) {
        await opts.reportEvents(runId, events);
      }

      if (typeof opts.onRoundTelemetry === "function") {
        opts.onRoundTelemetry({
          round: roundNum,
          phase: "executed",
          skillIds: calls.map(function (c) {
            return c.skillId || c.name;
          }),
          runStateFlags: countRunStateFlags(runState),
          execOk: !!(exec && exec.ok),
        });
      }

      if (typeof opts.onRoundComplete === "function") {
        await opts.onRoundComplete({ round: roundNum, calls: calls, exec: exec });
      }

      var turnAssistant = buildAssistantToolCalls(calls);
      var turnResults = buildToolResultsFromExec(calls, exec);
      appendAgentTurn(agentTurns, turnAssistant, turnResults);

      if (
        calls.length === 1 &&
        runStateApi &&
        typeof runStateApi.isNavSkillId === "function" &&
        runStateApi.isNavSkillId(resolveCallSkillId(calls[0])) &&
        exec &&
        exec.ok &&
        !exec.aborted
      ) {
        var navCallDone = calls[0];
        var navSkillIdDone = resolveCallSkillId(navCallDone);
        var navPronts = callArguments(navCallDone).prontuarios || [];
        var readyGate = runStateApi.isNavRedundant(
          runState,
          navSkillIdDone,
          navPronts
        );
        if (
          !readyGate.ok &&
          readyGate.errorCode === "nav_already_ready"
        ) {
          var chainAfterNav = await maybeAutoChainExtract({
            navCall: navCallDone,
            gate: readyGate,
            roundNum: roundNum,
            runId: runId,
            runState: runState,
            agentTurns: agentTurns,
            signal: opts.signal,
            execDeps: execDeps,
            onConfirm: onConfirm,
            onRoundStart: opts.onRoundStart,
            onRoundComplete: opts.onRoundComplete,
            onRoundTelemetry: opts.onRoundTelemetry,
            reportEvents: opts.reportEvents,
            onEvent: function (e) {
              events.push(e);
              if (opts.deps && typeof opts.deps.reportEvent === "function") {
                opts.deps.reportEvent(e);
              }
            },
          });
          if (chainAfterNav.cancelled) {
            return {
              ok: false,
              cancelled: true,
              runId: runId,
              runState: runState,
              rounds: round,
              lastExec: lastExec,
              agentTurns: agentTurns,
            };
          }
          if (chainAfterNav.executed) {
            lastExec = chainAfterNav.exec;
            runState = chainAfterNav.runState || runState;
          }
        }
      }

      round++;
    }

    return {
      ok: false,
      type: "max_rounds",
      reason: "max_rounds",
      errorCode: "max_rounds_exceeded",
      runId: runId,
      runState: runState,
      rounds: round,
      lastExec: lastExec,
      agentTurns: agentTurns,
    };
  }

  return {
    MAX_AGENT_ROUNDS: MAX_AGENT_ROUNDS,
    runAgentLoop: runAgentLoop,
    buildToolResultsFromExec: buildToolResultsFromExec,
    buildAssistantToolCalls: buildAssistantToolCalls,
    buildSyntheticNavAlreadyReadyToolResults:
      buildSyntheticNavAlreadyReadyToolResults,
    appendAgentTurn: appendAgentTurn,
    countRunStateFlags: countRunStateFlags,
    resolveCallSkillId: resolveCallSkillId,
    buildAutoExtractCall: buildAutoExtractCall,
    maybeAutoChainExtract: maybeAutoChainExtract,
    shouldAutoConfirmExtract: shouldAutoConfirmExtract,
  };
});
