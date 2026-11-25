/**
 * FEAT-157 — loop do agente codificador.
 *
 * Orquestra extract → resolve → select → guard_det → guard_verify → rules → rank,
 * validando cada transição contra o grafo e cada pré-requisito contra o runState.
 *
 * Tudo o que fala com o mundo entra por `deps` — LLM, vetores, memória. Sem
 * deps reais o loop roda inteiro com stubs, o que é o que torna os evals
 * determinísticos possíveis.
 *
 * O verificador (guard_verify) é chamado ÀS CEGAS: código, nome, DS oficial
 * (tb_descricao) e trecho — nunca a decisão da selecção.
 *
 * `guard_det` continua no grafo (única saída de `select`) mas é skipped a
 * sério: markGuardDet só para canVerify; o trace/OTLP não conta como aprovação.
 * `repair` (1 ciclo) reconsulta resolve com k maior; `escalate` → HITL quando
 * há atos mas zero códigos (não fail duro).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./procod-graph.js")
      : root.AghuProcodGraph,
    typeof require !== "undefined"
      ? require("./procod-run-state.js")
      : root.AghuProcodRunState,
    typeof require !== "undefined"
      ? require("./procod-extract.js")
      : root.AghuProcodExtract,
    typeof require !== "undefined"
      ? require("./procod-resolve.js")
      : root.AghuProcodResolve,
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard,
    typeof require !== "undefined"
      ? require("./procod-rules.js")
      : root.AghuProcodRules,
    typeof require !== "undefined"
      ? require("./procod-rank.js")
      : root.AghuProcodRank,
    typeof require !== "undefined"
      ? require("./procod-memory.js")
      : root.AghuProcodMemory,
    typeof require !== "undefined"
      ? require("./procod-confidence.js")
      : root.AghuProcodConfidence,
    typeof require !== "undefined"
      ? require("./procod-cost.js")
      : root.AghuProcodCost
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodLoop = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  codes,
  graph,
  runState,
  extract,
  resolve,
  guard,
  rules,
  rank,
  memory,
  confidence,
  cost
) {
  "use strict";

  var STATUS = Object.freeze({
    EXTRACTING: "extracting",
    RESOLVING: "resolving",
    SELECTING: "selecting",
    VERIFYING: "verifying",
    CLASSIFYING: "classifying",
    PROPOSED: "proposed",
    NEEDS_USER_INPUT: "needs_user_input",
    FAILED: "failed",
    COMMITTED: "committed",
  });

  var DEFAULT_K = 30;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function noop() {}

  function hooksOf(deps) {
    var h = (deps && deps.hooks) || {};
    return {
      beforeNode: h.beforeNode || noop,
      afterNode: h.afterNode || noop,
      onStep: h.onStep || noop,
      onGuardFail: h.onGuardFail || noop,
      onDivergence: h.onDivergence || noop,
      onProposal: h.onProposal || noop,
      onCommit: h.onCommit || noop,
    };
  }

  var RACIOCINIO_MAX = 4000;
  var EMBED_VIZINHOS_CAP = 20;

  // FEAT-212 (RAG2-AC-09): limiar de cobertura do canal denso no resolve.
  var DENSE_COVERAGE_MIN = 0.95;

  function clipRaciocinio(v) {
    var s = str(v).trim();
    if (s.length > RACIOCINIO_MAX) return s.slice(0, RACIOCINIO_MAX);
    return s;
  }

  /** Dep pode devolver o valor directo ou { value, tokens, raciocinio, ... }. */
  function unwrap(r) {
    if (r && typeof r === "object" && !Array.isArray(r) && "value" in r) {
      return {
        value: r.value,
        tokens: Number(r.tokens) || 0,
        tokensIn: Number(r.tokensIn || r.inputTokens) || 0,
        tokensOut: Number(r.tokensOut || r.outputTokens) || 0,
        raciocinio: clipRaciocinio(r.raciocinio),
        provider: str(r.provider),
        model: str(r.model),
        query: str(r.query),
      };
    }
    return {
      value: r,
      tokens: 0,
      tokensIn: 0,
      tokensOut: 0,
      raciocinio: "",
      provider: "",
      model: "",
      query: "",
    };
  }

  function appendLlmCall(calls, rec) {
    rec = rec || {};
    var row = {
      node: str(rec.node),
      raciocinio: clipRaciocinio(rec.raciocinio),
      tokens: Number(rec.tokens) || 0,
    };
    if (typeof rec.tokensIn === "number") row.tokensIn = rec.tokensIn;
    if (typeof rec.tokensOut === "number") row.tokensOut = rec.tokensOut;
    row.costUsd = typeof rec.costUsd === "number" ? rec.costUsd : 0;
    if (rec.provider) row.provider = str(rec.provider);
    if (rec.model) row.model = str(rec.model);
    if (rec.atoId) row.atoId = str(rec.atoId);
    if (rec.codigo) row.codigo = str(rec.codigo);
    calls.push(row);
  }

  var TRACE_COUNT_FIELDS = Object.freeze([
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
    "omitidosConfianca",
    "bm25",
    "rag",
    "skipped",
    "tokens",
    "tokensIn",
    "tokensOut",
    "costUsd",
  ]);

  // FEAT-212 (RAG2-AC-09): campos de fração (0..1) reportados no trace.
  var TRACE_FRACTION_FIELDS = Object.freeze(["denseCoverage"]);

  var TRACE_ITEM_CAP = 20;

  function codigoOf(row) {
    if (row && typeof row === "object") return str(row.codigo);
    return str(row);
  }

  var VERDICT_ALLOW = Object.freeze({
    confirm: true,
    refute: true,
    uncertain: true,
  });

  function pickVerdicts(raw) {
    if (!raw || typeof raw !== "object" || !raw.verdicts || typeof raw.verdicts !== "object") {
      return null;
    }
    var out = {};
    var n = 0;
    for (var k in raw.verdicts) {
      if (!Object.prototype.hasOwnProperty.call(raw.verdicts, k)) continue;
      var v = str(raw.verdicts[k]).toLowerCase();
      if (!VERDICT_ALLOW[v]) continue;
      out[str(k)] = v;
      n++;
    }
    return n ? out : null;
  }

  function namedItems(codigos, nomes, cap, valoresPorCodigo) {
    var seen = {};
    var order = [];
    var list = Array.isArray(codigos) ? codigos : [];
    nomes = nomes && typeof nomes === "object" ? nomes : {};
    var valores = valoresPorCodigo && typeof valoresPorCodigo === "object"
      ? valoresPorCodigo
      : {};
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      var c = codigoOf(raw);
      if (!c) continue;
      if (!seen[c]) {
        seen[c] = { raw: raw, count: 1 };
        order.push(c);
      } else {
        seen[c].count += 1;
      }
    }
    var out = [];
    var limit = typeof cap === "number" ? cap : TRACE_ITEM_CAP;
    for (var j = 0; j < order.length && out.length < limit; j++) {
      var codigo = order[j];
      var rec = seen[codigo];
      var src = rec.raw;
      var item = {
        codigo: codigo,
        nome: str(nomes[codigo] || (src && src.nome)),
      };
      if (rec.count > 1) item.ocorrencias = rec.count;
      if (src && typeof src === "object" && src.errorCode) {
        item.errorCode = str(src.errorCode);
      }
      if (src && typeof src === "object" && typeof src.valorCentavos === "number") {
        item.valorCentavos = src.valorCentavos;
      } else if (valores[codigo]) {
        item.valorCentavos = rank.valorTotalCentavos(valores[codigo]);
      }
      var verdicts = pickVerdicts(src);
      if (verdicts) item.verdicts = verdicts;
      out.push(item);
    }
    return out;
  }

  /** Rótulo estruturado do extract — nunca o trecho literal do laudo. */
  function extractTraceNome(ato) {
    var nome = str(ato && ato.ato).trim();
    var extra = [];
    var via = str(ato && ato.via).trim();
    var sitio = str(ato && ato.sitio).trim();
    if (via) extra.push(via);
    if (sitio) extra.push(sitio);
    if (!extra.length) return nome;
    return nome ? nome + " — " + extra.join(", ") : extra.join(", ");
  }

  function extractTraceItems(atos) {
    var list = Array.isArray(atos) ? atos : [];
    var out = [];
    for (var i = 0; i < list.length && out.length < TRACE_ITEM_CAP; i++) {
      out.push({
        codigo: "ato-" + (i + 1),
        nome: extractTraceNome(list[i]),
      });
    }
    return out;
  }

  function countUniqueCodigos(rows) {
    var seen = {};
    var n = 0;
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i++) {
      var c = codigoOf(list[i]);
      if (!c || seen[c]) continue;
      seen[c] = true;
      n++;
    }
    return n;
  }

  var ERROR_LABEL = Object.freeze({
    citation_not_substring: "citação não literal",
    extract_invalid: "extração inválida",
    code_not_in_candidates: "código fora da lista fechada",
    code_not_in_competencia: "código fora da competência",
    no_atos_extracted: "nenhum ato extraído",
    competencia_missing: "competência SIGTAP ausente",
    token_budget_exceeded: "orçamento de tokens esgotado",
    guard_divergence: "divergência entre modelos",
    baixa_confianca: "omitido por confiança baixa",
    no_candidates: "sem candidatos",
    illegal_transition: "transição ilegal no grafo",
  });

  function recusaLabel(code) {
    return ERROR_LABEL[str(code)] || str(code);
  }

  function recusaPhrase(lista) {
    var map = {};
    var i;
    for (i = 0; i < lista.length; i++) {
      var key = str(lista[i] && lista[i].errorCode) || "unknown";
      map[key] = (map[key] || 0) + 1;
    }
    var parts = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      parts.push(map[k] + "× " + recusaLabel(k));
    }
    return parts.join("; ");
  }

  function summarizeFail(errorCode) {
    return "Falhou: " + recusaLabel(errorCode);
  }

  function summarizeNode(node, extra) {
    extra = extra && typeof extra === "object" ? extra : {};
    var n;
    if (node === "extract") {
      n = Number(extra.atos) || 0;
      var rec = Number(extra.recusas) || 0;
      var recTxt = extra.recusaPhrase ? " (" + extra.recusaPhrase + ")" : "";
      return (
        n +
        " " +
        (n === 1 ? "ato válido" : "atos válidos") +
        "; " +
        rec +
        " " +
        (rec === 1 ? "recusa" : "recusas") +
        recTxt
      );
    }
    if (node === "resolve") {
      n = extra.candidatos;
      if (n == null) return "BM25 → RAG grupo 04";
      var bm = typeof extra.bm25 === "number" ? extra.bm25 : null;
      var rg = typeof extra.rag === "number" ? extra.rag : null;
      var extraR =
        bm != null || rg != null
          ? " (BM25 " + (bm || 0) + " → RAG " + (rg || 0) + ")"
          : "";
      return (
        "BM25 → RAG grupo 04 (" +
        n +
        " " +
        (n === 1 ? "candidato" : "candidatos") +
        extraR +
        ")"
      );
    }
    if (node === "select") {
      n = Number(extra.selecionados) || 0;
      var uniq =
        typeof extra.uniqueCodigos === "number"
          ? extra.uniqueCodigos
          : n;
      return (
        n +
        " " +
        (n === 1 ? "par" : "pares") +
        " · " +
        uniq +
        " " +
        (uniq === 1 ? "código único" : "códigos únicos")
      );
    }
    if (node === "guard_det") {
      if (extra.skipped) {
        var aps = Number(extra.aprovados) || 0;
        return (
          "omitido — " +
          aps +
          " " +
          (aps === 1 ? "código seguiu" : "códigos seguiram") +
          " sem travão determinístico"
        );
      }
      var rec2 = Number(extra.recusas) || 0;
      var ap = Number(extra.aprovados) || 0;
      return (
        ap +
        " " +
        (ap === 1 ? "passou os travões" : "passaram os travões") +
        "; " +
        rec2 +
        " " +
        (rec2 === 1 ? "recusado" : "recusados")
      );
    }
    if (node === "guard_verify") {
      var conf = Number(extra.confirmados) || 0;
      var div = Number(extra.divergencias) || 0;
      var nComp = Number(extra.compativeis) || 0;
      var nSeq = Number(extra.sequenciais) || 0;
      var nExcl = Number(extra.excludentes) || 0;
      var omit = Number(extra.omitidosConfianca) || 0;
      return (
        conf +
        " " +
        (conf === 1 ? "confirmado" : "confirmados") +
        "; " +
        div +
        " " +
        (div === 1 ? "divergência" : "divergências") +
        (div ? " (HITL)" : "") +
        " · " +
        nComp +
        " compatíveis · " +
        nSeq +
        " sequenciais · " +
        nExcl +
        " excludentes" +
        (omit
          ? " · " +
            omit +
            " " +
            (omit === 1 ? "omitido" : "omitidos") +
            " por confiança"
          : "")
      );
    }
    if (node === "rules") {
      var fat = Number(extra.faturaveis) || 0;
      var prin =
        typeof extra.principais === "number"
          ? extra.principais
          : extra.principal
            ? 1
            : 0;
      return (
        prin +
        " " +
        (prin === 1 ? "principal" : "principais") +
        "; " +
        fat +
        " " +
        (fat === 1 ? "faturável" : "faturáveis")
      );
    }
    if (node === "rank") {
      return "Faturáveis por valor";
    }
    return node;
  }

  function pickTraceCounts(extra) {
    var out = {};
    extra = extra && typeof extra === "object" ? extra : {};
    for (var i = 0; i < TRACE_COUNT_FIELDS.length; i++) {
      var k = TRACE_COUNT_FIELDS[i];
      if (typeof extra[k] === "number") out[k] = extra[k];
    }
    for (var f = 0; f < TRACE_FRACTION_FIELDS.length; f++) {
      var fk = TRACE_FRACTION_FIELDS[f];
      if (typeof extra[fk] === "number") out[fk] = extra[fk];
    }
    return out;
  }

  function pushTrace(trace, node, extra) {
    extra = extra && typeof extra === "object" ? extra : {};
    var step = {
      node: node,
      summary: extra.summary || summarizeNode(node, extra),
    };
    var counts = pickTraceCounts(extra);
    for (var k in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, k)) step[k] = counts[k];
    }
    if (extra.errorCode) step.errorCode = extra.errorCode;
    if (typeof extra.durationMs === "number") step.durationMs = extra.durationMs;
    if (Array.isArray(extra.itens) && extra.itens.length) step.itens = extra.itens;
    if (Array.isArray(extra.dropped) && extra.dropped.length) {
      step.dropped = extra.dropped;
    }
    trace.push(step);
    return step;
  }

  function countUniqueCandidates(state) {
    var seen = {};
    var n = 0;
    var atos = state && Array.isArray(state.atos) ? state.atos : [];
    for (var a = 0; a < atos.length; a++) {
      var list = runState.getCandidates(state, atos[a].atoId);
      for (var i = 0; i < list.length; i++) {
        var c = str(list[i]);
        if (c && !seen[c]) {
          seen[c] = true;
          n++;
        }
      }
    }
    return n;
  }

  function concatCandidates(state) {
    var all = [];
    var atos = state && Array.isArray(state.atos) ? state.atos : [];
    for (var a = 0; a < atos.length; a++) {
      var list = runState.getCandidates(state, atos[a].atoId);
      for (var i = 0; i < list.length; i++) all.push(list[i]);
    }
    return all;
  }

  function propostaTraceItems(proposta, nomes, valoresPorCodigo) {
    proposta = proposta || {};
    var rows = [];
    if (proposta.principal && proposta.principal.codigo) {
      rows.push(proposta.principal);
    }
    var fat = Array.isArray(proposta.faturaveis) ? proposta.faturaveis : [];
    for (var i = 0; i < fat.length; i++) rows.push(fat[i]);
    return namedItems(rows, nomes, TRACE_ITEM_CAP, valoresPorCodigo);
  }

  function fail(state, path, errorCode, error, reprovados, trace) {
    return {
      status: STATUS.FAILED,
      errorCode: errorCode,
      error: error,
      runId: state ? state.runId : "",
      competencia: state ? state.competencia : "",
      path: path,
      atos: state ? state.atos : [],
      proposta: null,
      divergences: state ? state.divergences : [],
      // Mesmo no caminho de erro os reprovados viajam: são telemetria de
      // qualidade, e perdê-los aqui seria descarte silencioso.
      reprovados: Array.isArray(reprovados) ? reprovados : [],
      tokensSpent: state ? state.tokensSpent : 0,
      tokensInSpent: state ? state.tokensInSpent : 0,
      tokensOutSpent: state ? state.tokensOutSpent : 0,
      costUsdSpent: state ? state.costUsdSpent : 0,
      trace: Array.isArray(trace) ? trace : [],
      llmCalls: [],
      embedCalls: [],
    };
  }

  /**
   * @param {{descricao: string, competencia: string, runId?: string,
   *          index: object, catalogo: any, registrosPorCodigo?: object,
   *          nomePorCodigo?: object, habilitacaoPorCodigo?: object,
   *          principal?: string, k?: number, maxTokens?: number}} input
   * @param {{extract: Function, select: Function, verify: Function,
   *          vetoriais?: Function, memoria?: Function, rerank?: Function,
   *          hooks?: object}} deps
   */
  async function runProcod(input, deps) {
    input = input || {};
    deps = deps || {};
    var hooks = hooksOf(deps);
    var path = [];
    var reprovados = [];
    var trace = [];
    var llmCalls = [];
    var embedCalls = [];
    var state;

    try {
      state = runState.createRunState({
        runId: input.runId,
        competencia: input.competencia,
      });
    } catch (e) {
      return fail(null, path, e.code || codes.COMPETENCIA_MISSING, e.message);
    }

    function failLocal(errorCode, error) {
      var current = path[path.length - 1];
      var last = trace[trace.length - 1];
      var snap = snapshotUsage();
      if (last && current && last.node === current) {
        last.errorCode = errorCode;
        last.summary =
          (last.summary ? last.summary + " — " : "") + summarizeFail(errorCode);
        last.tokens = snap.tokens;
        last.tokensIn = snap.tokensIn;
        last.tokensOut = snap.tokensOut;
        last.costUsd = snap.costUsd;
      } else if (current) {
        pushTrace(trace, current, {
          errorCode: errorCode,
          summary: summarizeFail(errorCode),
          tokens: snap.tokens,
          tokensIn: snap.tokensIn,
          tokensOut: snap.tokensOut,
          costUsd: snap.costUsd,
        });
      }
      return attachAudit(fail(state, path, errorCode, error, reprovados, trace));
    }

    function attachAudit(r) {
      r.llmCalls = llmCalls;
      r.embedCalls = embedCalls;
      return r;
    }

    var descricao = str(input.descricao);
    var extractInput = {
      descricao: descricao,
      cirurgiaNome: str(input.cirurgiaNome),
      achadosOperatorios: str(input.achadosOperatorios),
    };
    var laudo = extract.laudoFromInput(extractInput);
    var k = typeof input.k === "number" ? input.k : DEFAULT_K;
    var nomes = input.nomePorCodigo || {};
    var valores = input.valoresPorCodigo || {};

    var nodeStartedAt = 0;
    var tokensAtEnter = 0;
    var tokensInAtEnter = 0;
    var tokensOutAtEnter = 0;
    var costAtEnter = 0;

    function snapshotUsage() {
      return {
        tokens: Math.max(0, (state.tokensSpent || 0) - tokensAtEnter),
        tokensIn: Math.max(0, (state.tokensInSpent || 0) - tokensInAtEnter),
        tokensOut: Math.max(0, (state.tokensOutSpent || 0) - tokensOutAtEnter),
        costUsd: Math.max(0, (state.costUsdSpent || 0) - costAtEnter),
      };
    }

    function recordUsage(raw, kind) {
      var u = cost.usageFromCall({
        model: raw && raw.model,
        tokens: raw && raw.tokens,
        tokensIn: raw && raw.tokensIn,
        tokensOut: raw && raw.tokensOut,
        kind: kind,
      });
      runState.addUsage(state, u);
      return u;
    }

    function enter(node) {
      path.push(node);
      var v = graph.validatePath(path);
      if (!v.ok) return v;
      nodeStartedAt = Date.now();
      tokensAtEnter = state.tokensSpent || 0;
      tokensInAtEnter = state.tokensInSpent || 0;
      tokensOutAtEnter = state.tokensOutSpent || 0;
      costAtEnter = state.costUsdSpent || 0;
      hooks.beforeNode(node, state);
      return { ok: true };
    }

    function leave(node, extra) {
      extra = extra && typeof extra === "object" ? extra : {};
      extra.durationMs = Date.now() - nodeStartedAt;
      var snap = snapshotUsage();
      if (typeof extra.tokens !== "number") extra.tokens = snap.tokens;
      if (typeof extra.tokensIn !== "number") extra.tokensIn = snap.tokensIn;
      if (typeof extra.tokensOut !== "number") extra.tokensOut = snap.tokensOut;
      if (typeof extra.costUsd !== "number") extra.costUsd = snap.costUsd;
      var step = pushTrace(trace, node, extra);
      hooks.afterNode(node, extra);
      var payload = {
        node: node,
        status: extra.status,
        runId: state.runId,
        ok: extra.ok !== false,
        durationMs: extra.durationMs,
      };
      var counts = pickTraceCounts(extra);
      for (var ck in counts) {
        if (Object.prototype.hasOwnProperty.call(counts, ck)) payload[ck] = counts[ck];
      }
      if (typeof extra.denseCoverage === "number") {
        payload.denseCoverage = extra.denseCoverage;
      }
      if (step.errorCode) payload.errorCode = step.errorCode;
      hooks.onStep(payload);
    }

    function escalateLocal(errorCode, error, extra) {
      extra = extra && typeof extra === "object" ? extra : {};
      var ge = enter("escalate");
      if (!ge.ok) return failLocal(ge.errorCode, ge.error);
      leave("escalate", {
        errorCode: errorCode,
        summary: extra.summary || ("HITL: " + recusaLabel(errorCode)),
        candidatos: extra.candidatos,
      });
      return attachAudit({
        status: STATUS.NEEDS_USER_INPUT,
        errorCode: errorCode,
        error: error,
        runId: state.runId,
        competencia: state.competencia,
        path: path,
        atos: state.atos,
        proposta: extra.proposta || { principal: null, faturaveis: [], todos: [] },
        divergences: state.divergences,
        reprovados: reprovados,
        tokensSpent: state.tokensSpent,
        tokensInSpent: state.tokensInSpent,
        tokensOutSpent: state.tokensOutSpent,
        costUsdSpent: state.costUsdSpent,
        trace: trace,
      });
    }

    function budget() {
      return runState.checkBudget(state, input.maxTokens);
    }

    // ---------------------------------------------------------------- extract
    var g = enter("extract");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    var extracted;
    try {
      var rawExtract = unwrap(await deps.extract(extractInput));
      var extractUsage = recordUsage(rawExtract, "llm");
      extracted = extract.extractAtos(rawExtract.value, laudo);
      appendLlmCall(llmCalls, {
        node: "extract",
        provider: rawExtract.provider,
        model: rawExtract.model,
        raciocinio: rawExtract.raciocinio || extracted.raciocinio || "",
        tokens: extractUsage.tokens,
        tokensIn: extractUsage.tokensIn,
        tokensOut: extractUsage.tokensOut,
        costUsd: extractUsage.costUsd,
      });
    } catch (e) {
      return failLocal(codes.EXTRACT_INVALID, "Falha na extração: " + e.message);
    }
    if (!extracted.ok) {
      return failLocal(extracted.errorCode, extracted.error);
    }
    for (var iv = 0; iv < extracted.invalidos.length; iv++) {
      hooks.onGuardFail(extracted.invalidos[iv].item, extracted.invalidos[iv].errorCode);
      reprovados.push(extracted.invalidos[iv]);
    }
    runState.setAtos(state, extracted.atos);
    leave("extract", {
      status: STATUS.EXTRACTING,
      atos: extracted.atos.length,
      recusas: extracted.invalidos.length,
      recusaPhrase: recusaPhrase(extracted.invalidos),
      itens: extractTraceItems(extracted.atos),
    });

    var gate = runState.canEnter(state, "resolve");
    if (!gate.ok) {
      if (str(input.cirurgiaNome).trim()) {
        return escalateLocal(
          gate.errorCode,
          gate.error,
          { summary: "HITL: 0 atos extraídos, mas há nome da cirurgia" }
        );
      }
      return failLocal(gate.errorCode, gate.error);
    }

    // FEAT-212 (RAG2-AC-08/T6): canais de um ato correm em paralelo —
    // BM25 é síncrono; vetoriais e memória (2 chamadas de rede) via Promise.all.
    function canaisDoAto(ato, kResolve) {
      var query = resolve.queryFromAto(ato);
      var bm25Hits = input.index
        ? resolve.search(input.index, query, resolve.BM25_K_LARGO)
        : [];
      // FEAT-212 (RAG2-AC-13): guarda anti-PHI na fronteira do canal denso —
      // a query que atravessa para deps.vetoriais é SEMPRE a frase normalizada
      // (números longos, datas e excesso de laudo não sobrevivem). "Nunca o
      // laudo" vira comportamento testado, não promessa.
      var queryDensa = memory.normalizarFrase(query);
      if (!queryDensa) queryDensa = str(ato.ato || "").trim().toLowerCase();
      var promVetoriais =
        typeof deps.vetoriais === "function"
          ? Promise.resolve(
              deps.vetoriais(
                Object.assign({}, ato, {
                  query: queryDensa,
                  bm25: bm25Hits,
                })
              )
            ).then(function (raw) {
              return unwrap(raw);
            })
          : Promise.resolve(null);
      var promMemoria =
        typeof deps.memoria === "function"
          ? Promise.resolve(deps.memoria(ato)).then(function (raw) {
              return unwrap(raw);
            })
          : Promise.resolve(null);
      var promRegistros =
        typeof deps.memoriaRegistros === "function"
          ? Promise.resolve(deps.memoriaRegistros(ato)).then(function (raw) {
              return unwrap(raw);
            })
          : Promise.resolve(null);
      return Promise.all([promVetoriais, promMemoria, promRegistros]).then(
        function (res) {
          var vetRaw = res[0];
          var memRaw = res[1];
          var regRaw = res[2];
          var vetoriais = [];
          if (vetRaw) {
            vetoriais = vetRaw.value || [];
            if (!vetRaw.model) vetRaw.model = "text-embedding-3-small";
            var vetUsage = recordUsage(vetRaw, "embed");
            var vizinhos = [];
            var vetList = Array.isArray(vetoriais) ? vetoriais : [];
            for (
              var vi = 0;
              vi < vetList.length && vizinhos.length < EMBED_VIZINHOS_CAP;
              vi++
            ) {
              var vc = codigoOf(vetList[vi]);
              if (vc) vizinhos.push(vc);
            }
            embedCalls.push({
              node: "resolve",
              atoId: ato.atoId,
              query: vetRaw.query || query,
              model: vetRaw.model,
              tokens: vetUsage.tokens,
              tokensIn: vetUsage.tokensIn,
              tokensOut: 0,
              costUsd: vetUsage.costUsd,
              vizinhos: vizinhos,
            });
          }
          var memoria = (memRaw && memRaw.value) || [];
          var registrosMem = (regRaw && regRaw.value) || [];
          memoria = memoria.concat(
            memory.candidatosDaMemoria({
              frase: ato.trecho,
              registros: registrosMem,
            })
          );
          return {
            query: query,
            bm25Hits: bm25Hits,
            vetoriais: vetoriais,
            memoria: memoria,
            registrosMem: registrosMem,
          };
        }
      );
    }

    async function fillResolve(kResolve) {
      var bm25Total = 0;
      var ragTotal = 0;
      // FEAT-212 (RAG2-AC-09): atos que receberam vizinhos vetoriais.
      var atosComDense = {};
      var resultados = [];
      for (var a = 0; a < state.atos.length; a++) {
        resultados.push(canaisDoAto(state.atos[a], kResolve));
      }
      var resolvidos = await Promise.all(resultados);
      for (var r = 0; r < state.atos.length; r++) {
        var ato = state.atos[r];
        var canais = resolvidos[r] || {};
        var bm25Hits = canais.bm25Hits || [];
        var vetoriais = canais.vetoriais || [];
        var memoria = canais.memoria || [];
        var registrosMem = canais.registrosMem || [];
        bm25Total += bm25Hits.length;
        ragTotal += Array.isArray(vetoriais) ? vetoriais.length : 0;
        var candidatos = resolve.mergeClosedList({
          bm25: bm25Hits,
          vetoriais: vetoriais,
          memoria: memoria,
          k: kResolve,
        }).filter(function (c) {
          return resolve.isGrupoCirurgico(c);
        });
        if (typeof deps.rerank === "function" && candidatos.length) {
          var topN = resolve.RERANK_TOP_N;
          var reraw = unwrap(
            await deps.rerank({
              query: canais.query || resolve.queryFromAto(ato),
              candidatos: candidatos.slice(0, topN),
            })
          );
          recordUsage(reraw, "llm");
          candidatos = resolve.applyRerank(
            candidatos,
            reraw.value || [],
            topN
          );
        }
        if (registrosMem.length) {
          candidatos = memory.aplicarMemoria(candidatos, {
            frase: ato.trecho,
            registros: registrosMem,
          }).filter(function (c) {
            return resolve.isGrupoCirurgico(c);
          });
        }
        runState.setCandidates(state, ato.atoId, candidatos);
        if (Array.isArray(canais.vetoriais) && canais.vetoriais.length) {
          atosComDense[ato.atoId] = true;
        }
      }
      return { bm25: bm25Total, rag: ragTotal, atosComDense: atosComDense };
    }

    function leaveResolve(stats) {
      // FEAT-212 (RAG2-AC-09): cobertura do canal denso — fração de atos que
      // receberam vizinhos vetoriais. < 95% degrada com aviso, nunca em silêncio.
      var atos = state.atos.length || 0;
      var atosComDenseCount = 0;
      if (atos) {
        var denseMap = stats.atosComDense || {};
        for (var da = 0; da < state.atos.length; da++) {
          if (denseMap[state.atos[da].atoId]) atosComDenseCount++;
        }
      }
      var denseCoverage = atos ? atosComDenseCount / atos : 1;
      var avisoDense =
        atos > 0 && denseCoverage < DENSE_COVERAGE_MIN
          ? "[AGHU] cobertura de embedding baixa: " +
            Math.round(denseCoverage * 100) +
            "% dos atos com vizinhos vetoriais (limiar " +
            Math.round(DENSE_COVERAGE_MIN * 100) +
            "%) — recall denso degradado; verifique o re-embed do catálogo."
          : null;
      if (avisoDense) console.warn(avisoDense);
      leave("resolve", {
        status: STATUS.RESOLVING,
        candidatos: countUniqueCandidates(state),
        bm25: stats.bm25,
        rag: stats.rag,
        denseCoverage: denseCoverage,
        itens: namedItems(concatCandidates(state), nomes, TRACE_ITEM_CAP, valores),
      });
    }

    // ---------------------------------------------------------------- resolve
    g = enter("resolve");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    var stats = await fillResolve(k);
    leaveResolve(stats);

    if (countUniqueCandidates(state) === 0 && state.atos.length) {
      if (runState.canRepair(state).ok) {
        g = enter("repair");
        if (!g.ok) return failLocal(g.errorCode, g.error);
        runState.countRepair(state);
        leave("repair", {
          summary: "Reconsulta BM25/RAG com k maior",
          candidatos: 0,
        });
        g = enter("resolve");
        if (!g.ok) return failLocal(g.errorCode, g.error);
        stats = await fillResolve(k * 2);
        leaveResolve(stats);
      }
      if (countUniqueCandidates(state) === 0) {
        return escalateLocal(
          codes.NO_CANDIDATES,
          "Atos extraídos sem candidatos no grupo 04.",
          { candidatos: 0, summary: "HITL: atos sem códigos no grupo 04" }
        );
      }
    }

    // ----------------------------------------------------------------- select
    g = enter("select");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    var selecionados = [];
    for (var s = 0; s < state.atos.length; s++) {
      var atoS = state.atos[s];
      if (!runState.canSelect(state, atoS.atoId).ok) continue; // ato sem candidato
      var escolhas = [];
      try {
        var selRaw = unwrap(
          await deps.select({
            ato: atoS,
            descricao: laudo,
            candidatos: runState.getCandidates(state, atoS.atoId).map(function (c) {
              return {
                codigo: c,
                nome: (input.nomePorCodigo || {})[c] || "",
                descricao: (input.descricaoPorCodigo || {})[c] || "",
              };
            }),
          })
        );
        var selUsage = recordUsage(selRaw, "llm");
        appendLlmCall(llmCalls, {
          node: "select",
          provider: selRaw.provider,
          model: selRaw.model,
          atoId: atoS.atoId,
          raciocinio: selRaw.raciocinio,
          tokens: selUsage.tokens,
          tokensIn: selUsage.tokensIn,
          tokensOut: selUsage.tokensOut,
          costUsd: selUsage.costUsd,
        });
        escolhas = selRaw.value || [];
      } catch (e) {
        return failLocal(codes.EXTRACT_INVALID, "Falha na selecção: " + e.message);
      }

      var validos = [];
      for (var e2 = 0; e2 < escolhas.length; e2++) {
        var esc = escolhas[e2] || {};
        var chk = guard.validateCodeInCandidates(
          str(esc.codigo),
          runState.getCandidates(state, atoS.atoId)
        );
        if (!chk.ok) {
          // Alucinação de código: derrubada aqui, sem interromper o run.
          hooks.onGuardFail(esc, chk.errorCode);
          reprovados.push({ item: esc, errorCode: chk.errorCode, error: chk.error });
          continue;
        }
        validos.push(esc);
      }
      runState.selectCodes(
        state,
        atoS.atoId,
        validos.map(function (x) {
          return str(x.codigo);
        })
      );
      for (var vv = 0; vv < validos.length; vv++) {
        selecionados.push({
          atoId: atoS.atoId,
          codigo: str(validos[vv].codigo),
          trecho: str(validos[vv].trecho || atoS.trecho),
        });
      }
    }
    leave("select", {
      status: STATUS.SELECTING,
      selecionados: selecionados.length,
      uniqueCodigos: countUniqueCodigos(selecionados),
      itens: namedItems(selecionados, nomes, TRACE_ITEM_CAP, valores),
    });

    // Travão determinístico (citação/catálogo/regras SIGTAP) ignorado de
    // propósito: a lista fechada já correu em select; o verify cego + HITL
    // ficam como recusa. markGuardDet continua obrigatório para canVerify.
    g = enter("guard_det");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    var aprovados = [];
    for (var d = 0; d < selecionados.length; d++) {
      var item = selecionados[d];
      runState.markGuardDet(state, item.atoId, item.codigo);
      aprovados.push(item);
    }
    leave("guard_det", {
      status: STATUS.VERIFYING,
      aprovados: aprovados.length,
      recusas: 0,
      skipped: 1,
      itens: namedItems(aprovados, nomes, TRACE_ITEM_CAP, valores),
    });

    // ----------------------------------------------------------- guard_verify
    g = enter("guard_verify");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    var confirmados = [];
    var verdictByCodigo = {};
    for (var v2 = 0; v2 < aprovados.length; v2++) {
      var par = aprovados[v2];
      if (!runState.canVerify(state, par.atoId, par.codigo).ok) continue;
      // Memória de execução: par já julgado não volta ao verificador.
      var veredito = runState.isJudged(state, par.atoId, par.codigo)
        ? runState.getVerdict(state, par.atoId, par.codigo)
        : null;
      if (veredito === null && Object.prototype.hasOwnProperty.call(verdictByCodigo, par.codigo)) {
        veredito = verdictByCodigo[par.codigo];
        runState.setVerdict(state, par.atoId, par.codigo, veredito);
      }
      if (veredito === null) {
        var dsMap = input.descricaoPorCodigo;
        var requireDs = dsMap && typeof dsMap === "object";
        var ds = requireDs ? str(dsMap[par.codigo]) : "";
        if (requireDs && !ds) {
          veredito = "uncertain";
          runState.setVerdict(state, par.atoId, par.codigo, veredito);
        } else {
          var bud = budget();
          if (!bud.ok) return failLocal(bud.errorCode, bud.error);
          try {
            var vr = unwrap(
              await deps.verify({
                codigo: par.codigo,
                nome: (input.nomePorCodigo || {})[par.codigo] || "",
                descricao: ds || (requireDs ? "" : str(dsMap && dsMap[par.codigo])),
                trecho: par.trecho,
              })
            );
            var vrUsage = recordUsage(vr, "llm");
            appendLlmCall(llmCalls, {
              node: "guard_verify",
              provider: vr.provider,
              model: vr.model,
              atoId: par.atoId,
              codigo: par.codigo,
              raciocinio: vr.raciocinio,
              tokens: vrUsage.tokens,
              tokensIn: vrUsage.tokensIn,
              tokensOut: vrUsage.tokensOut,
              costUsd: vrUsage.costUsd,
            });
            veredito = str(vr.value);
          } catch (_e) {
            // openai_empty_response / timeout / request_failed → HITL, não aborta o run.
            veredito = "uncertain";
          }
          runState.setVerdict(state, par.atoId, par.codigo, veredito);
        }
        verdictByCodigo[par.codigo] = veredito;
      }

      // 4c: reconciliar selecao implicita vs verificador (outro fornecedor).
      var recon = guard.reconcileBlindVerdict("confirm", veredito);
      if (recon.action === "pass") {
        confirmados.push(par);
      } else {
        // Discordancia / incerteza → HITL. Nunca descarte silencioso.
        runState.registerDivergence(state, par.atoId, par.codigo, recon.verdicts);
        hooks.onDivergence(par, recon.verdicts);
      }
    }

    var principal = rules.normalizeCodigo(input.principal) ||
      (confirmados[0] && rules.normalizeCodigo(confirmados[0].codigo)) ||
      "";

    function candidateRank(atoId, codigo) {
      var list = runState.getCandidates(state, atoId);
      var target = rules.normalizeCodigo(codigo);
      for (var ri = 0; ri < list.length; ri++) {
        if (rules.normalizeCodigo(list[ri]) === target) {
          return { rank: ri, k: list.length };
        }
      }
      return { rank: -1, k: list.length };
    }

    var scored = [];
    for (var sc = 0; sc < confirmados.length; sc++) {
      var parSc = confirmados[sc] || {};
      var citOk = parSc.trecho
        ? guard.validateCitation(laudo, parSc.trecho).ok === true
        : false;
      var rk = candidateRank(parSc.atoId, parSc.codigo);
      var confianca = confidence.scoreConfianca({
        verdict: runState.getVerdict(state, parSc.atoId, parSc.codigo),
        citationOk: citOk,
        rank: rk.rank,
        k: rk.k,
      });
      scored.push(Object.assign({}, parSc, { confianca: confianca }));
    }
    var bestByCodigo = {};
    var scoredUnique = [];
    for (var su = 0; su < scored.length; su++) {
      var rowSc = scored[su];
      var ck = rules.normalizeCodigo(rowSc.codigo);
      if (!ck) continue;
      if (!Object.prototype.hasOwnProperty.call(bestByCodigo, ck)) {
        bestByCodigo[ck] = scoredUnique.length;
        scoredUnique.push(rowSc);
        continue;
      }
      var prevSc = scoredUnique[bestByCodigo[ck]];
      if (Number(rowSc.confianca) > Number(prevSc.confianca)) {
        scoredUnique[bestByCodigo[ck]] = rowSc;
      }
    }
    var corte = confidence.aplicarCorte(scoredUnique, principal);
    confirmados = corte.kept;

    var confirmadosAnotados =
      typeof rules.anotarCompatibilidade === "function"
        ? rules.anotarCompatibilidade({
            principal: principal,
            itens: confirmados,
            arestas: input.arestasCompatibilidade || input.arestasPorPrincipal,
            excepcoes: input.excecoesCompatibilidade,
          })
        : confirmados;
    var relCounts =
      typeof rules.contarRelacoes === "function"
        ? rules.contarRelacoes(confirmadosAnotados)
        : { compativeis: 0, sequenciais: 0, excludentes: 0 };
    var droppedVerify = state.divergences.map(function (d) {
      return {
        codigo: d.codigo,
        errorCode: codes.GUARD_DIVERGENCE,
        verdicts: d.verdicts,
      };
    });
    for (var dr = 0; dr < corte.dropped.length; dr++) {
      droppedVerify.push({
        codigo: corte.dropped[dr].codigo,
        errorCode: codes.BAIXA_CONFIANCA,
      });
    }
    leave("guard_verify", {
      status: STATUS.VERIFYING,
      confirmados: confirmados.length,
      divergencias: state.divergences.length,
      omitidosConfianca: corte.dropped.length,
      compativeis: relCounts.compativeis,
      sequenciais: relCounts.sequenciais,
      excludentes: relCounts.excludentes,
      itens: namedItems(confirmados, nomes, TRACE_ITEM_CAP, valores),
      dropped: namedItems(droppedVerify, nomes, TRACE_ITEM_CAP, valores),
    });

    // ------------------------------------------------------------ rules/rank
    var gateRules = runState.canEnter(state, "rules");
    if (!gateRules.ok) return failLocal(gateRules.errorCode, gateRules.error);
    g = enter("rules");
    if (!g.ok) return failLocal(g.errorCode, g.error);

    var seenConf = {};
    var itensRules = [];
    for (var ci = 0; ci < confirmadosAnotados.length; ci++) {
      var c = confirmadosAnotados[ci] || {};
      var codigoConf = rules.normalizeCodigo(c.codigo);
      if (!codigoConf || seenConf[codigoConf]) continue;
      seenConf[codigoConf] = true;
      itensRules.push({
        codigo: codigoConf,
        trecho: c.trecho,
        nome: str(
          (input.nomePorCodigo || {})[codigoConf] ||
            (input.nomePorCodigo || {})[c.codigo]
        ),
        relacao: c.relacao,
        tpCompatibilidade: c.tpCompatibilidade,
        motivoRelacao: c.motivoRelacao,
        confianca: c.confianca,
      });
    }
    var proposta = rules.classificarConjunto({
      principal: principal,
      itens: itensRules,
      registrosPorCodigo: input.registrosPorCodigo || {},
      habilitacaoPorCodigo: input.habilitacaoPorCodigo || {},
      arestasCompatibilidade: input.arestasCompatibilidade || input.arestasPorPrincipal,
      excecoesCompatibilidade: input.excecoesCompatibilidade,
    });
    leave("rules", {
      status: STATUS.CLASSIFYING,
      faturaveis: (proposta.faturaveis || []).length,
      principais: proposta.principal && proposta.principal.codigo ? 1 : 0,
      itens: propostaTraceItems(proposta, nomes, valores),
    });

    g = enter("rank");
    if (!g.ok) return failLocal(g.errorCode, g.error);
    // Faturáveis por valor decrescente: o faturista decide sob pressão e o que
    // mais muda a conta tem de aparecer primeiro. `todos` não é reordenado —
    // ali a ordem de leitura do laudo é o que o auditor confere.
    proposta = rank.rankProposta(proposta, {
      valoresPorCodigo: input.valoresPorCodigo || {},
    });
    leave("rank", {
      status: STATUS.CLASSIFYING,
      faturaveis: (proposta.faturaveis || []).length,
      itens: propostaTraceItems(proposta, nomes, valores),
    });

    var status = runState.hasDivergences(state)
      ? STATUS.NEEDS_USER_INPUT
      : STATUS.PROPOSED;

    var seenDiv = {};
    var divergences = [];
    for (var d = 0; d < state.divergences.length; d++) {
      var div = state.divergences[d];
      var divCodigo = str(div && div.codigo);
      if (!divCodigo || seenDiv[divCodigo]) continue;
      seenDiv[divCodigo] = true;
      divergences.push(
        Object.assign({}, div, {
          nome: str((input.nomePorCodigo || {})[divCodigo]),
        })
      );
    }

    var resultado = {
      status: status,
      runId: state.runId,
      competencia: state.competencia,
      path: path,
      atos: state.atos,
      proposta: proposta,
      divergences: divergences,
      reprovados: reprovados,
      tokensSpent: state.tokensSpent,
      tokensInSpent: state.tokensInSpent,
      tokensOutSpent: state.tokensOutSpent,
      costUsdSpent: state.costUsdSpent,
      trace: trace,
      llmCalls: llmCalls,
      embedCalls: embedCalls,
    };
    hooks.onProposal(resultado);
    return resultado;
  }

  /**
   * Fecha o ciclo de aprendizagem. O faturista aceita uns códigos e rejeita
   * outros; ambos alimentam a memória — saber que um código NÃO se aplica a uma
   * frase vale tanto quanto o inverso.
   */
  async function commitProposal(resultado, decisao, deps) {
    var hooks = hooksOf(deps);
    decisao = decisao || {};
    var aceites = Array.isArray(decisao.aceites) ? decisao.aceites : [];
    var rejeitados = Array.isArray(decisao.rejeitados) ? decisao.rejeitados : [];

    var aprendizado = [];
    var porCodigo = {};
    var todos = (resultado && resultado.proposta && resultado.proposta.todos) || [];
    for (var t = 0; t < todos.length; t++) porCodigo[todos[t].codigo] = todos[t];

    function registrar(codigo, veredito) {
      var item = porCodigo[codigo];
      if (!item) return;
      aprendizado.push({
        codigo: codigo,
        veredito: veredito,
        frase: item.trecho,
        competencia: resultado.competencia,
      });
    }
    for (var i = 0; i < aceites.length; i++) registrar(aceites[i], "confirmado");
    for (var j = 0; j < rejeitados.length; j++) registrar(rejeitados[j], "rejeitado");

    // Linhas já sanitizadas para aghu_procod_memoria. Só quando há workspace:
    // memória sem escopo vazaria codificação entre hospitais, então a ausência
    // do id produz `rows` vazio em vez de linhas órfãs.
    var rows = [];
    var workspaceId = str(decisao.workspaceId || (deps && deps.workspaceId));
    if (workspaceId) {
      rows = memory.toRows(
        { competencia: resultado.competencia, aprendizado: aprendizado },
        workspaceId
      );
    }

    await hooks.onCommit({
      aceites: aceites,
      rejeitados: rejeitados,
      aprendizado: aprendizado,
      rows: rows,
    });
    return { status: STATUS.COMMITTED, aprendizado: aprendizado, rows: rows };
  }

  return {
    STATUS: STATUS,
    DEFAULT_K: DEFAULT_K,
    TRACE_ITEM_CAP: TRACE_ITEM_CAP,
    DENSE_COVERAGE_MIN: DENSE_COVERAGE_MIN,
    runProcod: runProcod,
    commitProposal: commitProposal,
  };
});
