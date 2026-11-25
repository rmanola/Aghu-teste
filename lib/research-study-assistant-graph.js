/**
 * FEAT-072 — grafo do assistente Research (harness allowlist).
 * LLM só via deps injetadas (draft/judge); validate é oráculo determinístico.
 */
(function (root, factory) {
  "use strict";
  var assistant =
    typeof require !== "undefined"
      ? require("./research-study-assistant.js")
      : root.AghuResearchStudyAssistant;
  var api = factory(assistant);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistantGraph = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (assistant) {
  "use strict";

  var NODES = (assistant && assistant.ALLOWED_GRAPH_NODES) || [];
  /** FEAT-073 — rev estável do grafo (tuple). */
  var GRAPH_REV = "1";

  function isAllowedNode(step) {
    return NODES.indexOf(String(step || "")) !== -1;
  }

  function pushTrace(state, step, ok, durationMs, extra, onStep) {
    var entry = {
      step: step,
      ok: ok !== false,
      durationMs: Number(durationMs) || 0,
    };
    if (extra && Array.isArray(extra.codes)) entry.codes = extra.codes;
    if (extra && extra.scores) entry.scores = extra.scores;
    if (extra && extra.model) entry.model = extra.model;
    if (extra && typeof extra.promptTokens === "number") {
      entry.promptTokens = extra.promptTokens;
    }
    if (extra && typeof extra.completionTokens === "number") {
      entry.completionTokens = extra.completionTokens;
    }
    state.stepTrace.push(entry);
    if (typeof onStep === "function") {
      try {
        onStep(entry);
      } catch (_e) {
        /* onStep best-effort */
      }
    }
  }

  function nextAfterValidate(state) {
    if (state.validationErrors && state.validationErrors.length) {
      if (state.repairAttempts < assistant.MAX_REPAIR_ATTEMPTS) {
        return "repair";
      }
      return "escalate";
    }
    return "judge_output";
  }

  /**
   * @param {object} state
   * @param {"pass"|"fail"|"unavailable"} judgeResult
   * @param {{ kind?: string, clarifyingQuestions?: string[], needsUser?: string[], codes?: string[] }|null} classification
   */
  function nextAfterJudge(state, judgeResult, classification) {
    if (judgeResult === "unavailable") {
      if (state.warnings.indexOf("judge_unavailable") === -1) {
        state.warnings.push("judge_unavailable");
      }
      // FEAT-106 B2 — fail-closed: HITL, não propose silencioso
      state.clarifyingQuestions = assistant.mergePendingQuestions({
        previous: state.pendingQuestions || state.clarifyingQuestions || [],
        fromLlm: [
          "O juiz automático está indisponível. Confirma o rascunho actual ou descreva o que ajustar?",
        ],
        answeredPending: [],
        lastUserMessage: assistant.lastUserContent(state.messages),
      });
      state.pendingQuestions = state.clarifyingQuestions;
      return "clarify";
    }
    if (judgeResult === "pass") {
      return "propose";
    }
    // fail
    var cls =
      classification ||
      assistant.classifyJudgeCritiques(state.judgeCritiques, []);
    if (cls.kind === "needs_user") {
      state.clarifyingQuestions = cls.clarifyingQuestions || [];
      return "clarify";
    }
    if (state.repairAttempts < assistant.MAX_REPAIR_ATTEMPTS) {
      return "repair";
    }
    // esgotou repairs auto: propose com avisos (E1 ok) — nunca escalate por judge
    if (state.warnings.indexOf("judge_failed_after_retries") === -1) {
      state.warnings.push("judge_failed_after_retries");
    }
    return "propose";
  }

  function enterClarify(state, classification, onStep) {
    var cls =
      classification ||
      assistant.classifyJudgeCritiques(state.judgeCritiques, []);
    var fromCls =
      (cls.clarifyingQuestions && cls.clarifyingQuestions.length
        ? cls.clarifyingQuestions
        : null) ||
      assistant.buildClarifyingQuestions(state.judgeCritiques, cls.codes || []);
    var questions = assistant.mergePendingQuestions({
      previous: state.pendingQuestions || state.clarifyingQuestions || [],
      fromLlm: fromCls,
      answeredPending: [],
      lastUserMessage: assistant.lastUserContent(state.messages),
    });
    state.clarifyingQuestions = questions;
    state.pendingQuestions = questions;
    // FEAT-086: guidance quando schema incompleto ou forms desalinhados do plano
    var needGuidance =
      (state.warnings && state.warnings.indexOf("schema_incomplete") !== -1) ||
      (typeof assistant.proposalFormsMisalignedWithPlan === "function" &&
        assistant.proposalFormsMisalignedWithPlan(
          state.proposal,
          state.studyPlan
        ));
    var clarifyOpts = needGuidance
      ? {
          guidance: assistant.buildSchemaIncompleteGuidance(
            state.studyPlan,
            state.validationErrors && state.validationErrors.length
              ? state.validationErrors
              : cls.codes || [],
            state.proposal,
            state.specialtyHint
          ),
        }
      : undefined;
    state.assistantMessage = assistant.buildClarifyAssistantMessage(
      state.proposal,
      questions,
      cls.needsUser || state.judgeCritiques,
      clarifyOpts
    );
    pushTrace(
      state,
      "clarify",
      true,
      0,
      {
        codes: (cls.codes || []).slice(0, 8),
      },
      onStep
    );
    state.status = "needs_user_input";
    state.errorCode = null;
    return state;
  }

  /** FEAT-083/084 — falha E1 esgotada → clarify com coaching (não erro vermelho). */
  function enterClarifyFromValidation(state, validationErrors, onStep) {
    var errs = Array.isArray(validationErrors)
      ? validationErrors
      : state.validationErrors || [];
    var fromErrs =
      assistant.buildClarifyingQuestionsFromValidationErrors(errs);
    var questions = assistant.mergePendingQuestions({
      previous: state.pendingQuestions || state.clarifyingQuestions || [],
      fromLlm: fromErrs,
      answeredPending: [],
      lastUserMessage: assistant.lastUserContent(state.messages),
    });
    state.clarifyingQuestions = questions;
    state.pendingQuestions = questions;
    var guidance = assistant.buildSchemaIncompleteGuidance(
      state.studyPlan,
      errs,
      state.proposal,
      state.specialtyHint
    );
    state.assistantMessage = assistant.buildClarifyAssistantMessage(
      state.proposal,
      questions,
      [],
      { guidance: guidance }
    );
    if (state.warnings.indexOf("schema_incomplete") === -1) {
      state.warnings.push("schema_incomplete");
    }
    pushTrace(
      state,
      "clarify",
      true,
      0,
      {
        codes: errs.slice(0, 8),
      },
      onStep
    );
    state.status = "needs_user_input";
    state.errorCode = null;
    return state;
  }

  /**
   * @param {object} state
   * @param {{
   *   draftProposal: (ctx) => Promise<{ proposal, assistantMessage?, tokens?, model? }>,
   *   judgeProposal?: (ctx) => Promise<{ pass, scores, critiques, codes }|null>,
   *   onStep?: (entry: { step: string, ok: boolean, durationMs: number }) => void,
   *   now?: () => number
   * }} deps
   */
  async function runGraph(state, deps) {
    var d = deps || {};
    var now = typeof d.now === "function" ? d.now : Date.now;
    var onStep = typeof d.onStep === "function" ? d.onStep : null;
    function trace(step, ok, durationMs, extra) {
      pushTrace(state, step, ok, durationMs, extra, onStep);
    }
    if (!state || state.status !== "running") {
      return state;
    }
    if (!Array.isArray(state.clarifyingQuestions)) {
      state.clarifyingQuestions = [];
    }

    // ingest_context
    var t0 = now();
    var effectiveMode =
      state.sessionPhase === "plan" || state.mode === "plan" ? "plan" : state.mode;
    var hint =
      state.specialtyHint || assistant.lastUserContent(state.messages);
    state.skillIds = assistant.selectSkills(effectiveMode, hint);
    var grounding =
      assistant.buildSkillMetaPreamble() +
      "\n\n" +
      assistant.buildSkillGrounding(state.skillIds);
    var catalogSubset = assistant.catalogGroundingSubset(hint);
    trace("ingest_context", true, now() - t0);

    // Fase plan: outline via deps.planOutline (sem proposal CRF)
    if (state.sessionPhase === "plan" || state.mode === "plan") {
      var tp = now();
      if (typeof d.planOutline !== "function") {
        // Fallback: se não houver planOutline, tratar como clarify vazio
        trace("plan_outline", false, 0, {
          codes: ["plan_fn_missing"],
        });
        state.status = "failed";
        state.errorCode = "llm_error";
        return state;
      }
      var planRes;
      try {
        planRes = await d.planOutline({
          state: state,
          grounding: grounding,
          catalogSubset: catalogSubset,
        });
      } catch (_e) {
        trace("plan_outline", false, now() - tp, {
          codes: ["llm_error"],
        });
        state.status = "failed";
        state.errorCode = "llm_error";
        return state;
      }
      var previousPlan = state.studyPlan;
      var mergedPlan = assistant.mergeStudyPlanFields(
        previousPlan,
        planRes && planRes.studyPlan ? planRes.studyPlan : null
      );
      state.studyPlan = assistant.sanitizeStudyPlanGrain({
        plan: mergedPlan,
        previousPlan: previousPlan,
        messages: state.messages,
      });
      var qsFromPlan = (planRes && planRes.clarifyingQuestions) || [];
      var answeredFromPlan = (planRes && planRes.answeredPending) || [];
      state.clarifyingQuestions = assistant.mergePendingQuestions({
        previous: state.pendingQuestions || state.clarifyingQuestions || [],
        fromLlm: qsFromPlan,
        answeredPending: answeredFromPlan,
        lastUserMessage: assistant.lastUserContent(state.messages),
        messages: state.messages,
        studyPlan: state.studyPlan,
      });
      state.pendingQuestions = state.clarifyingQuestions;
      state.assistantMessage =
        (planRes && planRes.assistantMessage) ||
        "Plano em construção — responda às perguntas.";
      trace("plan_outline", true, now() - tp, {
        model: planRes && planRes.model,
      });

      if (typeof d.judgePlan === "function") {
        var tj = now();
        try {
          var planVerdict = await d.judgePlan({
            state: state,
            studyPlan: state.studyPlan,
            userRequest: assistant.lastUserContent(state.messages),
          });
          if (!planVerdict) {
            if (state.warnings.indexOf("judge_unavailable") === -1) {
              state.warnings.push("judge_unavailable");
            }
            state.clarifyingQuestions = assistant.mergePendingQuestions({
              previous: state.pendingQuestions || state.clarifyingQuestions || [],
              fromLlm: [
                "O juiz automático está indisponível. Confirme o plano actual ou indique o que ajustar?",
              ],
              answeredPending: [],
              lastUserMessage: assistant.lastUserContent(state.messages),
              studyPlan: state.studyPlan,
            });
            state.pendingQuestions = state.clarifyingQuestions;
            if (state.studyPlan) state.studyPlan.complete = false;
            trace("judge_output", false, now() - tj, {
              codes: ["judge_unavailable"],
            });
            state.status = "needs_user_input";
            state.errorCode = null;
            return state;
          } else if (planVerdict.pass === false) {
            var pcls = assistant.classifyJudgeCritiques(
              planVerdict.critiques || [],
              planVerdict.codes || []
            );
            if (pcls.clarifyingQuestions && pcls.clarifyingQuestions.length) {
              state.clarifyingQuestions = assistant.mergePendingQuestions({
                previous: state.clarifyingQuestions,
                fromLlm: pcls.clarifyingQuestions,
                answeredPending: [],
                lastUserMessage: assistant.lastUserContent(state.messages),
                studyPlan: state.studyPlan,
              });
              state.pendingQuestions = state.clarifyingQuestions;
            }
            if (state.studyPlan) state.studyPlan.complete = false;
            trace("judge_output", false, now() - tj, {
              codes: planVerdict.codes || [],
              scores: planVerdict.scores || {},
              model: planVerdict.model,
            });
          } else {
            trace("judge_output", true, now() - tj, {
              codes: (planVerdict && planVerdict.codes) || [],
              scores: (planVerdict && planVerdict.scores) || {},
              model: planVerdict && planVerdict.model,
            });
          }
        } catch (_je) {
          if (state.warnings.indexOf("judge_unavailable") === -1) {
            state.warnings.push("judge_unavailable");
          }
          // FEAT-106 B2 — fail-closed no plan também
          state.clarifyingQuestions = assistant.mergePendingQuestions({
            previous: state.pendingQuestions || state.clarifyingQuestions || [],
            fromLlm: [
              "O juiz automático está indisponível. Confirme o plano actual ou indique o que ajustar?",
            ],
            answeredPending: [],
            lastUserMessage: assistant.lastUserContent(state.messages),
            studyPlan: state.studyPlan,
          });
          state.pendingQuestions = state.clarifyingQuestions;
          if (state.studyPlan) state.studyPlan.complete = false;
          trace("judge_output", false, now() - tj, {
            codes: ["judge_unavailable"],
          });
          state.status = "needs_user_input";
          state.errorCode = null;
          return state;
        }
      }

      if (state.clarifyingQuestions && state.clarifyingQuestions.length) {
        if (state.studyPlan) state.studyPlan.complete = false;
        state.status = "planning";
        state.errorCode = null;
        return state;
      }

      var ready =
        state.studyPlan &&
        state.studyPlan.complete === true &&
        (!state.clarifyingQuestions || !state.clarifyingQuestions.length);
      state.status = ready ? "plan_ready" : "planning";
      state.errorCode = null;
      return state;
    }

    // FEAT-085: confirmar pack CRF com «sim» antes do draft LLM
    var packAffirm = assistant.applySuggestedPackOnAffirmation({
      studyPlan: state.studyPlan,
      proposal: state.proposal || state.currentProtocol,
      pendingQuestions: state.pendingQuestions || state.clarifyingQuestions || [],
      lastUserMessage: assistant.lastUserContent(state.messages),
      specialtyHint: state.specialtyHint,
    });
    var packSeed = null;
    if (packAffirm.applied) {
      state.studyPlan = packAffirm.studyPlan;
      state.pendingQuestions = packAffirm.pendingQuestions;
      state.clarifyingQuestions = packAffirm.pendingQuestions;
      if (packAffirm.proposal) {
        packSeed = packAffirm.proposal;
        state.proposal = packAffirm.proposal;
      }
    }

    var loopGuard = 0;
    var phase = "draft_schema";
    var lastJudgeClassification = null;

    while (loopGuard < 8 && state.status === "running") {
      loopGuard++;

      if (phase === "draft_schema" || phase === "repair") {
        var isRepair = phase === "repair";
        if (isRepair) {
          state.repairAttempts += 1;
          trace("repair", true, 0, {
            codes: state.validationErrors.slice(0, 8),
          });
        }
        var td = now();
        if (typeof d.draftProposal !== "function") {
          trace("draft_schema", false, 0, {
            codes: ["draft_fn_missing"],
          });
          state.status = "failed";
          state.errorCode = "llm_error";
          return state;
        }
        var draftRes;
        try {
          draftRes = await d.draftProposal({
            state: state,
            grounding: grounding,
            catalogSubset: catalogSubset,
            repair: isRepair,
            validationErrors: state.validationErrors,
            judgeCritiques: state.judgeCritiques,
            packConfirmed: Boolean(packSeed),
          });
        } catch (_e) {
          trace("draft_schema", false, now() - td, {
            codes: ["llm_error"],
          });
          state.status = "failed";
          state.errorCode = "llm_error";
          return state;
        }
        var mergeBase = packSeed || state.currentProtocol;
        var mergeMode = packSeed ? "revise" : state.mode;
        var merged = assistant.mergeProposal(
          mergeMode,
          mergeBase,
          draftRes && draftRes.proposal
        );
        // FEAT-086: preservar id/code do protocolo em edição se seed/LLM omitirem
        if (packSeed && state.currentProtocol) {
          if (state.currentProtocol.id != null && merged && merged.id == null) {
            merged.id = state.currentProtocol.id;
          }
          if (
            state.currentProtocol.code != null &&
            merged &&
            merged.code == null
          ) {
            merged.code = state.currentProtocol.code;
          }
        }
        merged = assistant.preferAghuSourceForLabFields(merged);
        state.proposal = merged;
        if (draftRes && draftRes.assistantMessage) {
          state.assistantMessage = String(draftRes.assistantMessage);
        }
        trace("draft_schema", true, now() - td, {
          model: draftRes && draftRes.model,
          promptTokens: draftRes && draftRes.tokens && draftRes.tokens.prompt,
          completionTokens:
            draftRes && draftRes.tokens && draftRes.tokens.completion,
        });
        phase = "validate";
        continue;
      }

      if (phase === "validate") {
        var tv = now();
        var v = assistant.validateProposal(state.proposal);
        if (v.ok) {
          state.proposal = v.protocol;
          state.validationErrors = [];
          trace("validate", true, now() - tv, {
            codes: ["aghu.validation.ok"],
          });
          phase = nextAfterValidate(state);
        } else {
          state.validationErrors = v.errors || ["invalid_protocol_proposal"];
          trace("validate", false, now() - tv, {
            codes: state.validationErrors.slice(0, 8),
          });
          phase = nextAfterValidate(state);
        }
        if (phase === "escalate") {
          trace("escalate", false, 0, {
            codes: state.validationErrors.slice(0, 8),
          });
          // FEAT-083: com proposal + erros E1 → clarify (não failed)
          if (
            state.proposal &&
            state.validationErrors &&
            state.validationErrors.length
          ) {
            return enterClarifyFromValidation(
              state,
              state.validationErrors,
              onStep
            );
          }
          state.status = "failed";
          state.errorCode = "escalate_validation";
          return state;
        }
        continue;
      }

      if (phase === "judge_output") {
        var tj = now();
        if (typeof d.judgeProposal !== "function") {
          trace("judge_output", true, now() - tj, {
            codes: ["judge_unavailable"],
          });
          phase = nextAfterJudge(state, "unavailable");
          continue;
        }
        var verdict;
        try {
          verdict = await d.judgeProposal({
            state: state,
            userRequest: assistant.lastUserContent(state.messages),
            proposal: state.proposal,
            judgeSkill: assistant.loadSkillSheet("output_judge"),
          });
        } catch (_e) {
          trace("judge_output", true, now() - tj, {
            codes: ["judge_unavailable"],
          });
          phase = nextAfterJudge(state, "unavailable");
          continue;
        }
        if (!verdict) {
          trace("judge_output", true, now() - tj, {
            codes: ["judge_unavailable"],
          });
          phase = nextAfterJudge(state, "unavailable");
          continue;
        }
        // Sempre via parseJudgeVerdict (normaliza scores altos + codes vazios → pass)
        var parsed = assistant.parseJudgeVerdict(verdict);
        if (!parsed.ok) {
          trace("judge_output", true, now() - tj, {
            codes: ["judge_unavailable"],
          });
          phase = nextAfterJudge(state, "unavailable");
          continue;
        }
        var jv = parsed.verdict;
        state.judgeCritiques = jv.critiques || [];
        trace("judge_output", jv.pass === true, now() - tj, {
          codes: jv.codes || [],
          scores: jv.scores || {},
        });
        if (jv.pass) {
          phase = nextAfterJudge(state, "pass");
        } else {
          lastJudgeClassification = assistant.classifyJudgeCritiques(
            jv.critiques,
            jv.codes
          );
          if (lastJudgeClassification.kind === "auto_fixable") {
            state.validationErrors = (
              lastJudgeClassification.autoFixable.length
                ? lastJudgeClassification.autoFixable
                : jv.critiques || []
            ).slice(0, 8);
          } else {
            state.validationErrors = (
              lastJudgeClassification.needsUser || jv.critiques || []
            ).slice(0, 8);
          }
          phase = nextAfterJudge(state, "fail", lastJudgeClassification);
        }
        continue;
      }

      if (phase === "clarify") {
        return enterClarify(state, lastJudgeClassification, onStep);
      }

      if (phase === "propose") {
        var tp = now();
        if (!state.assistantMessage) {
          state.assistantMessage = assistant.summarizeProposal(state.proposal);
        }
        trace("propose", true, now() - tp);
        trace("await_human", true, 0);
        state.status = "proposed";
        return state;
      }

      // unknown phase
      state.status = "failed";
      state.errorCode = "llm_error";
      return state;
    }

    // Loop esgotado: se E1 ok → propose ou clarify; E1 fail com erros → clarify
    var exhaustion = assistant.resolveLoopExhaustion(state);
    if (exhaustion.phase === "clarify") {
      if (exhaustion.fromValidation) {
        if (
          state.stepTrace.every(function (s) {
            return !s || s.step !== "escalate";
          })
        ) {
          trace("escalate", false, 0, {
            codes: (state.validationErrors || []).slice(0, 8),
          });
        }
        return enterClarifyFromValidation(
          state,
          exhaustion.validationErrors || state.validationErrors,
          onStep
        );
      }
      if (state.warnings.indexOf("judge_failed_after_retries") === -1) {
        state.warnings.push("judge_failed_after_retries");
      }
      return enterClarify(state, exhaustion.classification, onStep);
    }
    if (exhaustion.phase === "propose" && state.proposal) {
      if (state.warnings.indexOf("judge_failed_after_retries") === -1) {
        state.warnings.push("judge_failed_after_retries");
      }
      if (!state.assistantMessage) {
        state.assistantMessage = assistant.summarizeProposal(state.proposal);
      }
      trace("propose", true, 0);
      trace("await_human", true, 0);
      state.status = "proposed";
      state.errorCode = null;
      return state;
    }
    state.status = "failed";
    state.errorCode = "escalate_validation";
    return state;
  }

  function applyAction(state, action) {
    var a = String(action || "");
    if (a === "apply") {
      state.status = "applied";
      pushTrace(state, "applied", true, 0);
      return { ok: true, state: state };
    }
    if (a === "discard") {
      state.status = "discarded";
      pushTrace(state, "discarded", true, 0);
      return { ok: true, state: state };
    }
    return { ok: false, error: "invalid_action", state: state };
  }

  return {
    GRAPH_REV: GRAPH_REV,
    isAllowedNode: isAllowedNode,
    listNodes: function () {
      return NODES.slice();
    },
    nextAfterValidate: nextAfterValidate,
    nextAfterJudge: nextAfterJudge,
    runGraph: runGraph,
    applyAction: applyAction,
    pushTrace: pushTrace,
    enterClarify: enterClarify,
    enterClarifyFromValidation: enterClarifyFromValidation,
  };
});
