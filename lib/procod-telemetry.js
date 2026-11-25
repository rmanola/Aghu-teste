/**
 * FEAT-157 — telemetria do agente codificador (Fase 6).
 *
 * Duas coisas, ambas reusando o que o repo já tem:
 *  • tuple/canary/cost cap via `lib/agent-tuple.js` (agent: "procod");
 *  • traces OTLP via `lib/agent-otlp-export.js`, que Langfuse consome como
 *    backend OTLP — sem SDK, sem dependência nova, e a allowlist anti-PHI
 *    continua sendo a nossa.
 *
 * O que NUNCA sai daqui: descrição cirúrgica, trecho citado, nome de
 * procedimento. Um trecho de laudo é PHI, e um span com evidência literal
 * vazaria o laudo para o backend de observabilidade. Só metadados viajam:
 * nó, contagens, duração, tokens, código de erro.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./agent-tuple.js")
      : root.AghuAgentTuple,
    typeof require !== "undefined"
      ? require("./agent-otlp-export.js")
      : root.AghuAgentOtlpExport,
    typeof require !== "undefined"
      ? require("./procod-graph.js")
      : root.AghuProcodGraph,
    typeof require !== "undefined"
      ? require("./procod-extract.js")
      : root.AghuProcodExtract
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodTelemetry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  tuple,
  otlp,
  graph,
  extract
) {
  "use strict";

  var AGENT = "procod";
  /** Bump quando o shape do runState mudar. */
  var MEMORY_SCHEMA_VERSION = "1";

  /**
   * Campos do step que podem virar atributo de span. Qualquer outro é
   * descartado — a lista é permissiva por engano de omissão, nunca por engano
   * de inclusão.
   */
  var STEP_NUMERIC_FIELDS = Object.freeze([
    "atos",
    "recusas",
    "candidatos",
    "selecionados",
    "aprovados",
    "confirmados",
    "divergencias",
    "faturaveis",
    "compativeis",
    "sequenciais",
    "excludentes",
    "bm25",
    "rag",
    "skipped",
    "tokens",
    "tokensIn",
    "tokensOut",
    "costUsd",
  ]);

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * Hash do prompt de extração — do TEXTO, não só do id.
   *
   * `buildTupleMeta` trunca cada campo em 16 caracteres, e ids como
   * "PROCOD_EXTRACT_v1"/"v2" têm 17: passá-los crus faria v1 e v2 colidirem no
   * mesmo tuple, e um prompt novo entraria em produção sem invalidar o canary.
   * Hashear o texto resolve os dois problemas de uma vez — cabe no limite e
   * deixa de depender de alguém lembrar de bumpar o id ao editar o prompt.
   */
  function systemPromptHash() {
    return tuple.hashRev(AGENT, [
      extract.SYSTEM_PROMPT_ID,
      extract.SYSTEM_PROMPT,
    ]);
  }

  /**
   * @param {{model?: string, date?: Date}} [opts]
   */
  function buildProcodTuple(opts) {
    opts = opts || {};
    return tuple.buildTupleMeta({
      agent: AGENT,
      model: opts.model,
      // O grafo é a política: a topologia é o que garante que nada escapa aos
      // guardrails, então mudá-la tem de invalidar o canary.
      graphRev: graph.GRAPH_REV,
      skillsRev: opts.skillsRev || "0",
      policyRev: opts.policyRev || "0",
      memorySchemaVersion: MEMORY_SCHEMA_VERSION,
      systemPromptHash: systemPromptHash(),
      toolSchemasHash: opts.toolSchemasHash || "0",
      date: opts.date,
    });
  }

  function maxTokensPerRun(env) {
    return tuple.parseMaxTokensPerRun(
      env && env.AGHU_PROCOD_MAX_TOKENS_PER_RUN,
      AGENT
    );
  }

  /**
   * Converte os steps do loop em spans PHI-safe.
   * Recebe o que `onStep` emitiu; devolve o shape que `spansFromStepTrace` espera.
   */
  function toStepTrace(steps) {
    var list = Array.isArray(steps) ? steps : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {};
      var entry = {
        step: str(s.node),
        ok: s.ok !== false,
        durationMs: Number(s.durationMs) || 0,
      };
      for (var f = 0; f < STEP_NUMERIC_FIELDS.length; f++) {
        var key = STEP_NUMERIC_FIELDS[f];
        if (typeof s[key] === "number") entry[key] = s[key];
      }
      out.push(entry);
    }
    return out;
  }

  /**
   * Payload OTLP a partir de um resultado do loop.
   * @param {object} resultado saída de runProcod
   * @param {{steps?: Array, tupleId?: string, model?: string}} [opts]
   */
  function buildProcodTracePayload(resultado, opts) {
    resultado = resultado || {};
    opts = opts || {};
    var spans = otlp.spansFromStepTrace(toStepTrace(opts.steps), {
      runId: str(resultado.runId),
      status: str(resultado.status),
      errorCode: resultado.errorCode || undefined,
    });
    return otlp.buildTracePayload({
      runId: str(resultado.runId),
      tupleId: str(opts.tupleId),
      agent: AGENT,
      model: str(opts.model),
      serviceName: "aghu-procod",
      spans: spans,
    });
  }

  /**
   * Exporta fail-open: observabilidade nunca derruba faturamento.
   * Sem URL configurada, é no-op silencioso.
   */
  async function exportProcodTraces(url, resultado, opts) {
    if (!otlp.isValidOtlpUrl(url)) return { ok: false, skipped: true };
    var payload = buildProcodTracePayload(resultado, opts);
    return otlp.exportOtlpTraces(url, payload, opts);
  }

  return {
    AGENT: AGENT,
    MEMORY_SCHEMA_VERSION: MEMORY_SCHEMA_VERSION,
    STEP_NUMERIC_FIELDS: STEP_NUMERIC_FIELDS,
    systemPromptHash: systemPromptHash,
    buildProcodTuple: buildProcodTuple,
    maxTokensPerRun: maxTokensPerRun,
    toStepTrace: toStepTrace,
    buildProcodTracePayload: buildProcodTracePayload,
    exportProcodTraces: exportProcodTraces,
  };
});
