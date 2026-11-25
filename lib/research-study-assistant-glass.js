/**
 * FEAT-077 — glass-box cliente (pipeline estimado + reconcile stepTrace).
 * Só metadados de nós; sem PHI / tokens.
 * NDJSON Edge = FEAT-078 R2 (cliente: research-study-assistant-stream.js).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistantGlass = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Allowlist de labels PT — só ids de nó do grafo (sem conteúdo clínico). */
  var STEP_LABELS_PT = Object.freeze({
    gate_auth: "Autenticação",
    ingest_context: "Ler contexto",
    plan_outline: "Montar plano",
    draft_schema: "Gerar rascunho",
    validate: "Validar schema",
    judge_output: "Revisão IA",
    repair: "Corrigir",
    clarify: "Esclarecer",
    propose: "Propor",
    await_human: "Aguardar revisão",
    escalate: "Escalar",
    applied: "Aplicado",
    discarded: "Descartado",
  });

  var PLAN_PIPELINE = Object.freeze([
    "ingest_context",
    "plan_outline",
    "judge_output",
  ]);

  var DRAFT_PIPELINE = Object.freeze([
    "ingest_context",
    "draft_schema",
    "validate",
    "judge_output",
    "propose",
    "await_human",
  ]);

  /**
   * Pipeline estimado estável por fase (glass-box enquanto busy).
   * @param {string} [mode] plan|draft|revise|patch
   * @param {string} [sessionPhase] plan|draft
   * @returns {string[]}
   */
  function expectedPipeline(mode, sessionPhase) {
    var m = String(mode || "").toLowerCase();
    var phase = String(sessionPhase || "").toLowerCase();
    if (m === "plan" || phase === "plan") {
      return PLAN_PIPELINE.slice();
    }
    return DRAFT_PIPELINE.slice();
  }

  function labelForStep(step) {
    var id = String(step || "");
    if (Object.prototype.hasOwnProperty.call(STEP_LABELS_PT, id)) {
      return STEP_LABELS_PT[id];
    }
    return id || "passo";
  }

  /**
   * Monta liveSteps iniciais (todos pending) a partir do pipeline estimado.
   * @param {string[]|null} steps
   * @returns {{ step: string, label: string, status: "pending" }[]}
   */
  function estimatedLiveSteps(steps) {
    var list = Array.isArray(steps) ? steps : [];
    return list.map(function (step) {
      return {
        step: String(step || ""),
        label: labelForStep(step),
        status: "pending",
      };
    });
  }

  /**
   * Substitui estimado por stepTrace real (ok/fail/skip). Só metadados.
   * @param {{ step: string, label?: string, status?: string }[]} estimated
   * @param {{ step?: string, ok?: boolean, durationMs?: number, codes?: string[] }[]|null} stepTrace
   * @returns {{ step: string, label: string, status: "ok"|"fail"|"skip", durationMs?: number, codes?: string[] }[]}
   */
  function reconcileLiveSteps(estimated, stepTrace) {
    var est = Array.isArray(estimated) ? estimated : [];
    var trace = Array.isArray(stepTrace) ? stepTrace : [];
    var firstByStep = Object.create(null);
    for (var i = 0; i < trace.length; i++) {
      var t = trace[i] || {};
      var sid = String(t.step || "");
      if (!sid || firstByStep[sid]) continue;
      firstByStep[sid] = t;
    }

    var seen = Object.create(null);
    var out = [];
    for (var j = 0; j < est.length; j++) {
      var row = est[j] || {};
      var step = String(row.step || "");
      if (!step) continue;
      seen[step] = true;
      var real = firstByStep[step];
      if (!real) {
        out.push({
          step: step,
          label: row.label || labelForStep(step),
          status: "skip",
        });
        continue;
      }
      var entry = {
        step: step,
        label: row.label || labelForStep(step),
        status: real.ok === false ? "fail" : "ok",
        durationMs: Number(real.durationMs) || 0,
      };
      if (Array.isArray(real.codes) && real.codes.length) {
        entry.codes = real.codes.map(String).slice(0, 8);
      }
      out.push(entry);
    }

    for (var k = 0; k < trace.length; k++) {
      var extra = trace[k] || {};
      var es = String(extra.step || "");
      if (!es || seen[es]) continue;
      seen[es] = true;
      var added = {
        step: es,
        label: labelForStep(es),
        status: extra.ok === false ? "fail" : "ok",
        durationMs: Number(extra.durationMs) || 0,
      };
      if (Array.isArray(extra.codes) && extra.codes.length) {
        added.codes = extra.codes.map(String).slice(0, 8);
      }
      out.push(added);
    }
    return out;
  }

  /** RSA-GLASS-04 — labels/liveSteps só de allowlist (sem PHI). */
  function assertGlassLabelsSafe(liveSteps) {
    var rows = Array.isArray(liveSteps) ? liveSteps : [];
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i] || {};
      var step = String(s.step || "");
      if (!Object.prototype.hasOwnProperty.call(STEP_LABELS_PT, step)) {
        return { ok: false, error: "unknown_step:" + step };
      }
      if (s.label !== STEP_LABELS_PT[step]) {
        return { ok: false, error: "label_mismatch:" + step };
      }
      if (
        Object.prototype.hasOwnProperty.call(s, "proposal") ||
        Object.prototype.hasOwnProperty.call(s, "messages") ||
        Object.prototype.hasOwnProperty.call(s, "critiques")
      ) {
        return { ok: false, error: "sensitive_key" };
      }
    }
    return { ok: true };
  }

  return {
    STEP_LABELS_PT: STEP_LABELS_PT,
    expectedPipeline: expectedPipeline,
    estimatedLiveSteps: estimatedLiveSteps,
    reconcileLiveSteps: reconcileLiveSteps,
    labelForStep: labelForStep,
    assertGlassLabelsSafe: assertGlassLabelsSafe,
  };
});
