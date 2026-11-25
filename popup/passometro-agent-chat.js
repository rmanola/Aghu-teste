/**
 * FEAT-071 — UI chat do agente Passômetro (vista chat; toggle de modo removido).
 * Skills executadas no cliente; Edge só LLM + schemas.
 * HITL: propose→commit (Confirmar) antes de executeCalls.
 * Fallback local one-click quando LLM falha e há prontuários parseáveis.
 */
(function () {
  "use strict";

  var skills = window.AghuPassometroAgentSkills;
  var runtime = window.AghuPassometroAgentRuntime;
  var agentLoop = window.AghuPassometroAgentLoop;
  var runStateApi = window.AghuPassometroAgentRunState;
  var orchApi = window.AghuPassometroExtractOrchestrator;
  var domainApi = window.AghuPassometroDomainExtract;
  var periodApi = window.AghuPassometroPeriodShortcuts;
  var edgeFetch = window.AghuSupabaseEdgeFetch;
  var llmFallback = window.AghuPassometroAgentLlmFallback;
  var hitlPreview = window.AghuPassometroAgentHitlPreview;
  var resultCardsApi = window.AghuPassometroAgentResultCards;

  var viewForm = document.getElementById("pm-view-formulario");
  var viewChat = document.getElementById("pm-view-chat");
  var thread = document.getElementById("pm-agent-chat-thread");
  var input = document.getElementById("pmAgentChatInput");
  var btnSend = document.getElementById("btnPmAgentSend");
  var hint = document.getElementById("pm-agent-chat-hint");
  var statusEl = document.getElementById("pm-oneclick-status");
  var progressEl = document.getElementById("pm-oneclick-progress");
  var confirmEl = document.getElementById("pm-agent-confirm");
  var confirmSummary = document.getElementById("pm-agent-confirm-summary");
  var btnConfirm = document.getElementById("btnPmAgentConfirm");
  var btnCancelPreview = document.getElementById("btnPmAgentCancelPreview");
  var btnStop = document.getElementById("btnPmBatchStop");

  if (!viewForm || !viewChat || !skills || !runtime || !agentLoop) {
    return;
  }

  var messages = [];
  var busy = false;
  var agentEnabled = false;
  var currentRunId = null;
  /** @type {{ resolve: (v: {confirmed:boolean}) => void } | null} */
  var pendingConfirm = null;
  /** @type {AbortController | null} */
  var batchAbort = null;
  /** @type {(() => void) | null} */
  var stopCleanup = null;
  /** @type {Array<{ prontuario: string, ok: boolean, domains: object }>} */
  var accumulatedCardRows = [];

  function setStatus(msg, tipo) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "";
    if (tipo) statusEl.classList.add(tipo);
  }

  function setHint(msg) {
    if (hint) hint.textContent = msg || "";
  }

  function setMode(mode) {
    var isChat = mode === "chat";
    if (isChat && !agentEnabled) {
      setHint("Chat do agente indisponível (flag ou sessão).");
      return;
    }
    if (viewForm) viewForm.hidden = isChat;
    if (viewChat) viewChat.hidden = !isChat;
  }

  function clearEmpty() {
    if (!thread) return;
    var empty = thread.querySelector(".pm-agent-chat-empty");
    if (empty) empty.remove();
  }

  function appendBubble(role, text) {
    if (!thread) return;
    clearEmpty();
    var row = document.createElement("div");
    row.className =
      "pm-agent-msg " +
      (role === "user" ? "pm-agent-msg-user" : "pm-agent-msg-assistant");
    var bubble = document.createElement("div");
    bubble.className = "pm-agent-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  function hideConfirmUi() {
    if (confirmEl) confirmEl.hidden = true;
    if (confirmSummary) confirmSummary.textContent = "";
  }

  function showConfirmUi(text) {
    if (confirmSummary) confirmSummary.textContent = text || "";
    if (confirmEl) confirmEl.hidden = false;
  }

  /**
   * Aguarda Confirmar / Cancelar (sempre no chat — 1ª versão).
   * @param {Array} calls
   * @returns {Promise<{confirmed: boolean}>}
   */
  function waitForConfirm(calls, round) {
    if (pendingConfirm) {
      pendingConfirm.resolve({ confirmed: false });
      pendingConfirm = null;
    }
    var preview =
      hitlPreview && hitlPreview.formatRoundPreview
        ? hitlPreview.formatRoundPreview(calls, round)
        : hitlPreview && hitlPreview.formatSkillCallsPreview
          ? hitlPreview.formatSkillCallsPreview(calls)
          : {
              confirmPrompt:
                "Confirmar execução de " + (calls || []).length + " skill(s)?",
              summary: "",
            };
    showConfirmUi(preview.confirmPrompt || preview.summary);
    setStatus("Aguardando confirmação (round " + (round || 1) + ")…", "info");
    setHint("Revise skill, período e quantidade antes de executar no AGHU.");
    return new Promise(function (resolve) {
      pendingConfirm = { resolve: resolve };
    });
  }

  function resolveConfirm(confirmed) {
    if (!pendingConfirm) return;
    var p = pendingConfirm;
    pendingConfirm = null;
    hideConfirmUi();
    p.resolve({ confirmed: !!confirmed });
  }

  function setStopVisible(visible, controller) {
    if (stopCleanup) {
      stopCleanup();
      stopCleanup = null;
    }
    if (!btnStop) return;
    if (!visible || !controller) {
      btnStop.hidden = true;
      return;
    }
    btnStop.hidden = false;
    var onStop = function () {
      try {
        controller.abort();
      } catch (_e) {
        /* noop */
      }
      setStatus("A interromper… (após o domínio actual)", "info");
      if (progressEl) {
        progressEl.textContent = "Parar pedido — a concluir domínio actual…";
      }
    };
    btnStop.addEventListener("click", onStop);
    stopCleanup = function () {
      btnStop.removeEventListener("click", onStop);
      btnStop.hidden = true;
    };
  }

  function onProgress(evt) {
    if (!progressEl) return;
    if (evt.type === "aborted") {
      progressEl.textContent =
        "Interrompido · " +
        (evt.done != null ? evt.done : "?") +
        "/" +
        (evt.total != null ? evt.total : "?") +
        " pacientes (parcial)";
    } else if (evt.type === "patient_start") {
      progressEl.textContent =
        "Agente · paciente " +
        (evt.index + 1) +
        "/" +
        evt.total +
        (evt.skillId ? " · " + evt.skillId : "");
    } else if (evt.type === "domain") {
      progressEl.textContent =
        "Agente · " +
        (evt.domain || "") +
        " (" +
        (evt.status || "") +
        ")";
    }
  }

  function buildDeps(eventsOut, signal) {
    return {
      signal: signal || undefined,
      onProgress: onProgress,
      reportEvent: function (evt) {
        if (eventsOut) eventsOut.push(evt);
      },
      nav: {
        openPol: domainApi.openPol,
        openControles: domainApi.openControles,
        openPrescricoes: domainApi.openPrescricoes,
        closeControlesPrescricoesTabs: domainApi.closeControlesPrescricoesTabs,
      },
      runOneClick: async function (opts) {
        var period =
          opts.period ||
          (periodApi && periodApi.resolvePeriodShortcut
            ? periodApi.resolvePeriodShortcut(opts.periodo)
            : null);
        return orchApi.runPassometroBatch({
          prontuarios: opts.prontuarios,
          period: period,
          signal: opts.signal || signal || undefined,
          nav: {
            openPol: domainApi.openPol,
            openControles: domainApi.openControles,
            openPrescricoes: domainApi.openPrescricoes,
            closeControlesPrescricoesTabs:
              domainApi.closeControlesPrescricoesTabs,
          },
          extract: {
            extractCadastro: domainApi.extractCadastro,
            extractExames: domainApi.extractExames,
            extractCirurgias: domainApi.extractCirurgias,
            extractControles: domainApi.extractControles,
            extractPrescricao: domainApi.extractPrescricao,
          },
          autofillAndSave: domainApi.autofillAndSave,
          onProgress: onProgress,
        });
      },
      extractCadastro: function (ctx) {
        return domainApi.extractCadastro(ctx);
      },
      extractExames: function (ctx) {
        return domainApi.extractExames(ctx);
      },
      extractCirurgias: function (ctx) {
        return domainApi.extractCirurgias(ctx);
      },
      extractControles: function (ctx) {
        return domainApi.extractControles(ctx);
      },
      extractPrescricao: function (ctx) {
        return domainApi.extractPrescricao(ctx);
      },
    };
  }

  async function reportEvents(_runId, _events) {
    return;
  }

  function formatAgentError(code) {
    if (edgeFetch && edgeFetch.formatEdgeError) {
      return edgeFetch.formatEdgeError(code);
    }
    if (code === "feature_disabled") {
      return "Agente Passômetro temporariamente indisponível.";
    }
    if (code === "ai_consent_required") {
      return "Aceite o consentimento de IA no painel web.";
    }
    return code || "Erro inesperado.";
  }

  function logAgentError(status, error) {
    try {
      console.log("[AGHU agent]", {
        status: status,
        error: String(error || ""),
      });
    } catch (_e) {
      /* noop */
    }
  }

  function isLlmFailure(code) {
    if (llmFallback && typeof llmFallback.isLlmFailureError === "function") {
      return llmFallback.isLlmFailureError(code);
    }
    var c = String(code || "");
    return (
      c === "llm_failed" ||
      c === "openai_request_failed" ||
      c === "openai_unauthorized" ||
      c === "openai_rate_limited" ||
      c === "openai_empty_response" ||
      c === "server_misconfigured"
    );
  }

  async function callAgent(_payload) {
    return { ok: false, status: 0, error: "feature_disabled" };
  }

  function summarizeLoopOutcome(outcome) {
    if (!outcome) return "Sem resultado.";
    if (outcome.type === "message") return String(outcome.text || "");
    if (outcome.cancelled) return "Execução cancelada — nenhuma extração no AGHU.";
    if (outcome.aborted) {
      return "Interrompido (Parar) — resultado parcial após " + (outcome.rounds || 0) + " round(s).";
    }
    if (outcome.reason === "max_rounds") {
      return "Limite de rounds atingido — tarefa incompleta.";
    }
    if (outcome.errorCode === "nav_retry_exceeded") {
      return (
        "Nav falhou repetidamente (nav_retry_exceeded) — abra um novo chat, " +
        "recarregue a extensão, dê F5 no AGHU ou navegue manualmente antes de extrair."
      );
    }
    if (outcome.edgeError) {
      return formatAgentError(outcome.edgeError);
    }
    if (outcome.errorCode) {
      return (outcome.error || "Falha no agente.") + " [" + outcome.errorCode + "]";
    }
    return outcome.error || "Agente encerrou.";
  }

  async function runChatAgentLoop(userText) {
    batchAbort =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    setStopVisible(!!batchAbort, batchAbort);

    var loopResult;
    var edgeCallCount = 0;
    try {
      loopResult = await agentLoop.runAgentLoop({
        messages: messages,
        runId: currentRunId || undefined,
        signal: batchAbort ? batchAbort.signal : undefined,
        callEdge: async function (payload) {
          edgeCallCount += 1;
          var res = await callAgent(payload);
          if (!res.ok) {
            var errCode =
              (res.data && res.data.error) || res.error || "llm_failed";
            logAgentError(res.status, errCode);
            if (errCode === "feature_disabled" || res.status === 410) {
              agentEnabled = false;
              setMode("formulario");
              setHint("Chat desabilitado no servidor (feature flag).");
            }
            if (
              edgeCallCount === 1 &&
              (await tryLocalLlmFallback(userText, errCode))
            ) {
              return {
                ok: true,
                data: { type: "message", text: "Fallback local aplicado." },
              };
            }
            return {
              ok: false,
              status: res.status,
              error: errCode,
            };
          }
          return { ok: true, data: res.data };
        },
        deps: buildDeps([], batchAbort ? batchAbort.signal : undefined),
        onProgress: onProgress,
        onRoundStart: function (round, calls) {
          if (hitlPreview && hitlPreview.formatRoundPreview) {
            var prev = hitlPreview.formatRoundPreview(calls, round);
            var skillIds = (calls || []).map(function (c) {
              return c.skillId || c.name || "";
            });
            var onlyExtract =
              skillIds.length &&
              skillIds.every(function (id) {
                return (
                  id.indexOf("passometro.nav.") !== 0 &&
                  id !== "passometro.oneclick"
                );
              });
            if (onlyExtract) {
              appendBubble(
                "assistant",
                "Extract automático (sem confirmação): " +
                  (prev.headline || skillIds.join(", "))
              );
            } else {
              appendBubble(
                "assistant",
                prev.headline || "Proposta round " + round
              );
            }
          }
        },
        onConfirm: async function (calls, round) {
          return waitForConfirm(calls, round);
        },
        onRoundTelemetry: function (info) {
          try {
            console.log("[AGHU agent]", {
              round: info.round,
              phase: info.phase,
              skills: info.skillIds,
              runStateFlags: info.runStateFlags,
              suggestExtract: info.suggestExtract || undefined,
              execOk: info.execOk,
            });
          } catch (_e) {
            /* noop */
          }
        },
        onRoundComplete: async function (info) {
          var round = (info && info.round) || 0;
          var exec = info && info.exec;
          var calls = (info && info.calls) || [];
          var summary = summarizeLocal(exec);
          if (info && info.recovery === "nav_already_ready") {
            summary =
              "Nav já pronta — ignorado re-open; a seguir extract automático.";
          } else if (info && info.autoChained) {
            summary = "Extract encadeado após nav: " + summary;
          }
          appendBubble(
            "assistant",
            "Round " + round + " concluído: " + summary
          );
          setStatus(summary, exec && exec.ok ? "ok" : "erro");
          await renderAgentExtractCards(calls, exec);
        },
        reportEvents: reportEvents,
      });
    } finally {
      setStopVisible(false, null);
      batchAbort = null;
    }

    if (loopResult && loopResult.runId) {
      currentRunId = loopResult.runId;
    }

    if (loopResult && loopResult.type === "message") {
      appendBubble("assistant", String(loopResult.text || ""));
      messages.push({
        role: "assistant",
        content: String(loopResult.text || ""),
      });
      setStatus("", "");
      return loopResult;
    }

    var summary = summarizeLoopOutcome(loopResult);
    appendBubble("assistant", summary);
    messages.push({ role: "assistant", content: summary });

    if (loopResult && loopResult.aborted) {
      setStatus("Lote interrompido — resultado parcial.", "erro");
    } else if (loopResult && loopResult.cancelled) {
      setStatus("Cancelado — sem execução no AGHU.", "info");
    } else if (loopResult && loopResult.ok === false) {
      setStatus(summary, "erro");
    } else {
      setStatus("Agente concluiu.", "ok");
    }
    return loopResult;
  }

  async function executeCalls(calls, runId, signal, runState) {
    var events = [];
    var out = await runtime.runSkillCalls({
      runId: runId,
      skillCalls: calls,
      runState: runState,
      deps: buildDeps(events, signal),
      onEvent: function (e) {
        events.push(e);
      },
    });
    await reportEvents(runId, events);
    return out;
  }

  function resetAccumulatedCardRows() {
    accumulatedCardRows = [];
  }

  async function renderAgentExtractCards(calls, exec) {
    if (!resultCardsApi || typeof resultCardsApi.buildResultCardRows !== "function") {
      return;
    }
    if (
      resultCardsApi.hasExtractCardResults &&
      !resultCardsApi.hasExtractCardResults(exec)
    ) {
      return;
    }
    var oneClick = window.AghuPassometroOneClick;
    if (!oneClick || typeof oneClick.renderResults !== "function") {
      return;
    }
    var newRows = resultCardsApi.buildResultCardRows(calls, exec);
    if (!newRows.length) return;
    accumulatedCardRows = resultCardsApi.mergeCardRows(
      accumulatedCardRows,
      newRows
    );
    await oneClick.renderResults(accumulatedCardRows);
  }

  function summarizeLocal(exec) {
    if (!exec || !exec.results || !exec.results.length) {
      return exec && exec.error
        ? "Falha: " + exec.error
        : "Nenhuma skill executada.";
    }
    if (exec.aborted) {
      return (
        "Interrompido (Parar) — resultado parcial. " +
        exec.results.length +
        " skill(s) processada(s)."
      );
    }
    var parts = [];
    for (var i = 0; i < exec.results.length; i++) {
      var r = exec.results[i];
      var card = r.scorecard;
      var res = r.result || {};
      var ok = res.ok;
      var line =
        (r.skillId || r.toolName) + ": " + (ok ? "ok" : "falhou");
      if (res.errorCode) {
        line += " [" + res.errorCode + "]";
      }
      if (!ok) {
        var navFail =
          res.patients &&
          res.patients[0] &&
          res.patients[0].navResult &&
          res.patients[0].navResult.ok === false
            ? res.patients[0].navResult
            : null;
        var errMsg =
          res.error ||
          (navFail &&
            (navFail.errorHint || navFail.errorCode)) ||
          (res.patients &&
            res.patients[0] &&
            res.patients[0].domainResult &&
            res.patients[0].domainResult.errorCode) ||
          (res.warning && res.examsCount === 0 ? res.warning : "");
        if (errMsg) {
          line += " — " + String(errMsg).slice(0, 120);
        }
      } else if (res.warning && res.examsCount === 0) {
        line += " — " + String(res.warning).slice(0, 80);
      }
      if (res.readyForExtract) {
        line += " → pronto para " + res.readyForExtract;
      } else if (res.nextSkill) {
        line += " → próximo " + res.nextSkill;
      }
      if (card) {
        line += " (score " + card.score + ")";
      }
      parts.push(line);
    }
    return parts.join(" · ");
  }

  /**
   * Executa calls após Confirmar, com Parar disponível.
   */
  async function executeConfirmedCalls(calls, runId) {
    batchAbort =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    setStopVisible(!!batchAbort, batchAbort);
    setStatus("A executar skills…", "info");
    var exec;
    try {
      exec = await executeCalls(
        calls,
        runId,
        batchAbort ? batchAbort.signal : undefined
      );
    } finally {
      setStopVisible(false, null);
      batchAbort = null;
    }
    return exec;
  }

  /**
   * Após skill_calls (Edge ou fallback): preview → Confirmar → executar → follow-up.
   */
  async function proposeAndCommit(calls, runId, assistantIntro) {
    if (assistantIntro) {
      appendBubble("assistant", String(assistantIntro));
      messages.push({ role: "assistant", content: String(assistantIntro) });
    } else if (assistantIntro !== false) {
      if (hitlPreview && hitlPreview.formatSkillCallsPreview) {
        var prev = hitlPreview.formatSkillCallsPreview(calls);
        appendBubble("assistant", prev.headline || "Proposta de execução pronta.");
        messages.push({
          role: "assistant",
          content: prev.headline || "Proposta de execução pronta.",
        });
      } else {
        appendBubble(
          "assistant",
          "Proposta de execução — confirme para continuar."
        );
      }
    }

    var decision = await waitForConfirm(calls);
    if (!decision.confirmed) {
      appendBubble("assistant", "Execução cancelada — nenhuma extração no AGHU.");
      messages.push({
        role: "assistant",
        content: "Execução cancelada — nenhuma extração no AGHU.",
      });
      setStatus("Cancelado — sem execução no AGHU.", "info");
      setHint("");
      if (progressEl) progressEl.textContent = "";
      return null;
    }

    setHint("");
    var exec = await executeConfirmedCalls(calls, runId);
    await renderAgentExtractCards(calls, exec);
    var summary = summarizeLocal(exec);
    appendBubble("assistant", summary);
    messages.push({ role: "assistant", content: summary });

    var toolResults = calls.map(function (c, idx) {
      var result =
        exec.results && exec.results[idx] && exec.results[idx].result;
      var skill =
        skills.getSkillById(c.skillId) ||
        skills.getSkillByToolName(c.name || c.toolName);
      var sanitized = skills.sanitizeSkillResult(
        result || { ok: false },
        skill
      );
      return {
        tool_call_id: c.id,
        content: JSON.stringify(sanitized),
      };
    });

    var follow = await callAgent({
      action: "chat",
      messages: messages,
      tool_results: toolResults,
      assistant_tool_calls: agentLoop.buildAssistantToolCalls(calls),
      run_id: runId,
    });
    if (follow.ok && follow.data && follow.data.type === "message") {
      appendBubble("assistant", String(follow.data.text || ""));
      messages.push({
        role: "assistant",
        content: String(follow.data.text || ""),
      });
    } else if (!follow.ok) {
      logAgentError(
        follow.status,
        (follow.data && follow.data.error) || follow.error
      );
    }

    if (exec.aborted) {
      setStatus("Lote interrompido — resultado parcial.", "erro");
    } else {
      setStatus(
        exec.ok ? "Agente concluiu com sucesso." : "Agente concluiu com falhas.",
        exec.ok ? "ok" : "erro"
      );
    }
    return exec;
  }

  /**
   * Fallback: LLM falhou mas texto tem prontuários → one-click local (com HITL).
   * @returns {Promise<boolean>} true se fallback foi aplicado
   */
  async function tryLocalLlmFallback(userText, errCode) {
    if (!isLlmFailure(errCode) || !llmFallback) return false;
    var built = llmFallback.tryBuildLocalOneClickFallback(userText, {
      parseProntuarioList:
        periodApi && periodApi.parseProntuarioList
          ? periodApi.parseProntuarioList
          : undefined,
    });
    if (!built || !built.ok) return false;

    appendBubble("assistant", built.message);
    messages.push({ role: "assistant", content: built.message });
    setStatus(built.message, "info");

    currentRunId = currentRunId || runtime.newRunId();
    var decision = await waitForConfirm([built.skillCall], 1);
    if (!decision.confirmed) {
      appendBubble("assistant", "Execução cancelada — nenhuma extração no AGHU.");
      return true;
    }
    batchAbort =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    setStopVisible(!!batchAbort, batchAbort);
    var fallbackExec;
    try {
      fallbackExec = await runtime.runSkillCalls({
        runId: currentRunId,
        skillCalls: [built.skillCall],
        deps: buildDeps([], batchAbort ? batchAbort.signal : undefined),
      });
      await renderAgentExtractCards([built.skillCall], fallbackExec);
    } finally {
      setStopVisible(false, null);
      batchAbort = null;
    }
    return true;
  }

  function unlockBusy() {
    busy = false;
    if (btnSend) btnSend.disabled = false;
  }

  async function sendMessage() {
    if (busy || !input) return;
    var text = String(input.value || "").trim();
    if (!text) return;

    busy = true;
    if (btnSend) btnSend.disabled = true;
    input.value = "";
    resetAccumulatedCardRows();
    appendBubble("user", text);
    messages.push({ role: "user", content: text });
    setStatus("Consultando agente…", "info");
    setHint("");
    hideConfirmUi();

    try {
      await runChatAgentLoop(text);
    } catch (e) {
      var em = (e && e.message) || "Falha de rede.";
      logAgentError(0, em);
      appendBubble("assistant", em);
      setStatus(em, "erro");
    }

    unlockBusy();
  }

  async function probeAgentEnabled() {
    // Chat oculto na UI — only one-click form remains.
    agentEnabled = false;
    setMode("formulario");
  }

  if (btnSend) {
    btnSend.addEventListener("click", function () {
      sendMessage();
    });
  }
  if (input) {
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendMessage();
      }
    });
  }
  if (btnConfirm) {
    btnConfirm.addEventListener("click", function () {
      resolveConfirm(true);
    });
  }
  if (btnCancelPreview) {
    btnCancelPreview.addEventListener("click", function () {
      resolveConfirm(false);
    });
  }

  probeAgentEnabled();
})();
