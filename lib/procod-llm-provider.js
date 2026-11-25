/**
 * FEAT-157 — chamadas LLM sem SDK (OpenAI + Anthropic).
 *
 * Espelha o padrão de `generate-patient-analysis` (fetch directo) e serve o
 * guardrail cross-provider: um fornecedor extrai/selecciona, o outro verifica
 * às cegas. `fetch` e chaves entram por deps — offline usa stubs, `--live`
 * só quando as keys estão presentes.
 *
 * Nunca loga system/user com conteúdo clínico; o caller é responsável por
 * não imprimir o prompt em produção.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard,
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./procod-extract.js")
      : root.AghuProcodExtract,
    typeof require !== "undefined"
      ? require("./procod-select.js")
      : root.AghuProcodSelect
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodLlmProvider = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  guard,
  codes,
  extract,
  select
) {
  "use strict";

  var PROVIDER_OPENAI = "openai";
  var PROVIDER_ANTHROPIC = "anthropic";
  var PROVIDERS = Object.freeze([PROVIDER_OPENAI, PROVIDER_ANTHROPIC]);

  var DEFAULT_OPENAI_MODEL = "gpt-5-nano";
  var DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";
  /**
   * Verify precisa de CoT visível (raciocinio+veredito) *e* folga para
   * reasoning tokens ocultos. 2048 esgota no gpt-5-nano
   * (finish_reason=length, content vazio → openai_empty_response).
   * Orçamento na 1.ª chamada; sem retry (2.ª ida estoura o idle 150s da Edge).
   */
  var VERIFY_MAX_TOKENS_GPT5 = 8192;
  var VERIFY_MAX_TOKENS_LEGACY = 512;
  /** Esforço baixo: JSON curto; medium/high queima o orçamento em raciocínio oculto. */
  var DEFAULT_REASONING_EFFORT = "low";
  var OPENAI_URL = "https://api.openai.com/v1/chat/completions";
  var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function assertProvider(provider) {
    var p = str(provider).toLowerCase();
    if (PROVIDERS.indexOf(p) === -1) {
      throw new Error(
        "Fornecedor LLM desconhecido: «" +
          provider +
          "». Use: " +
          PROVIDERS.join(", ") +
          "."
      );
    }
    return p;
  }

  /**
   * Resolve par worker/judge com fornecedores distintos.
   * @param {{extract?: string, verify?: string}} opts
   */
  function resolveCrossProviders(opts) {
    opts = opts || {};
    var extract = assertProvider(opts.extract || PROVIDER_ANTHROPIC);
    var verify = assertProvider(opts.verify || PROVIDER_OPENAI);
    if (extract === verify) {
      throw new Error(
        "Cross-provider exige fornecedores distintos (extract=" +
          extract +
          ", verify=" +
          verify +
          ")."
      );
    }
    return { extract: extract, verify: verify };
  }

  function defaultModelFor(provider) {
    return provider === PROVIDER_ANTHROPIC
      ? DEFAULT_ANTHROPIC_MODEL
      : DEFAULT_OPENAI_MODEL;
  }

  /**
   * GPT-5 / o-series: Chat Completions rejeita temperature≠1 e `max_tokens`.
   * Usar `max_completion_tokens`, omitir temperature, e `reasoning_effort`.
   */
  function openaiIsReasoningFamily(model) {
    var m = str(model).toLowerCase();
    return (
      m.indexOf("gpt-5") === 0 ||
      m.indexOf("o1") === 0 ||
      m.indexOf("o3") === 0 ||
      m.indexOf("o4") === 0
    );
  }

  /**
   * content pode ser string, null, ou array de partes {type,text}.
   * GPT-5 frequentemente devolve content=null quando o orçamento
   * foi todo para reasoning_tokens (finish_reason=length).
   */
  function extractOpenAiMessageText(json) {
    var choice = json && json.choices && json.choices[0] ? json.choices[0] : null;
    var msg = choice && choice.message ? choice.message : null;
    var finishReason = choice && choice.finish_reason ? str(choice.finish_reason) : "";
    var refusal = msg && typeof msg.refusal === "string" ? msg.refusal.trim() : "";
    var content = msg ? msg.content : null;
    var text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      for (var i = 0; i < content.length; i++) {
        var part = content[i];
        if (typeof part === "string") text += part;
        else if (part && typeof part.text === "string") text += part.text;
      }
    }
    return {
      text: text.trim(),
      finishReason: finishReason,
      refusal: refusal,
      hasChoice: !!choice,
    };
  }

  function usageTokensOpenAi(json) {
    var usage = (json && json.usage) || {};
    var tokensIn = Number(usage.prompt_tokens) || 0;
    var tokensOut = Number(usage.completion_tokens) || 0;
    return {
      tokens: tokensIn + tokensOut,
      tokensIn: tokensIn,
      tokensOut: tokensOut,
    };
  }

  function resolveApiKey(provider, opts) {
    opts = opts || {};
    if (opts.apiKey) return str(opts.apiKey);
    if (typeof process === "undefined" || !process.env) return "";
    if (provider === PROVIDER_ANTHROPIC) {
      return str(process.env.ANTHROPIC_API_KEY || process.env.AGHU_ANTHROPIC_API_KEY);
    }
    return str(process.env.OPENAI_API_KEY || process.env.AGHU_OPENAI_API_KEY);
  }

  function resolveFetch(opts) {
    if (opts && typeof opts.fetchFn === "function") return opts.fetchFn;
    if (typeof fetch === "function") return fetch;
    throw new Error(
      "fetch indisponível — injecte deps.fetchFn (Node <18 ou ambiente sem fetch)."
    );
  }

  async function callOpenAiChat(input) {
    var fetchFn = resolveFetch(input);
    var key = resolveApiKey(PROVIDER_OPENAI, input);
    if (!key) throw new Error("OPENAI_API_KEY ausente para chamada live.");
    var model = str(input.model) || DEFAULT_OPENAI_MODEL;
    var reasoning = openaiIsReasoningFamily(model);
    var payload = {
      model: model,
      messages: [
        { role: "system", content: str(input.system) },
        { role: "user", content: str(input.user) },
      ],
    };
    if (!reasoning) {
      payload.temperature =
        typeof input.temperature === "number" ? input.temperature : 0;
    } else {
      payload.reasoning_effort =
        str(input.reasoningEffort) || DEFAULT_REASONING_EFFORT;
    }
    var maxTok = Number(input.maxTokens);
    if (maxTok > 0) {
      if (reasoning) payload.max_completion_tokens = maxTok;
      else payload.max_tokens = maxTok;
    }
    var res = await fetchFn(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error("openai_request_failed status=" + res.status);
    }
    var json = await res.json();
    var extracted = extractOpenAiMessageText(json);
    var usage = usageTokensOpenAi(json);
    if (extracted.refusal && !extracted.text) {
      throw new Error("openai_refusal");
    }
    if (!extracted.text) {
      var reason = extracted.finishReason;
      throw new Error(
        "openai_empty_response" + (reason ? " finish_reason=" + reason : "")
      );
    }
    return {
      text: extracted.text,
      provider: PROVIDER_OPENAI,
      model: model,
      tokens: usage.tokens,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
    };
  }

  async function callAnthropicMessages(input) {
    var fetchFn = resolveFetch(input);
    var key = resolveApiKey(PROVIDER_ANTHROPIC, input);
    if (!key) throw new Error("ANTHROPIC_API_KEY ausente para chamada live.");
    var model = str(input.model) || DEFAULT_ANTHROPIC_MODEL;
    var res = await fetchFn(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: Number(input.maxTokens) || 256,
        temperature: typeof input.temperature === "number" ? input.temperature : 0,
        system: str(input.system),
        messages: [{ role: "user", content: str(input.user) }],
      }),
    });
    if (!res.ok) {
      throw new Error("anthropic_request_failed status=" + res.status);
    }
    var json = await res.json();
    var block = json && json.content && json.content[0] ? json.content[0].text : "";
    if (typeof block !== "string" || !block.trim()) {
      throw new Error("anthropic_empty_response");
    }
    var usage = (json && json.usage) || {};
    var tokensIn = Number(usage.input_tokens) || 0;
    var tokensOut = Number(usage.output_tokens) || 0;
    return {
      text: block.trim(),
      provider: PROVIDER_ANTHROPIC,
      model: model,
      tokens: tokensIn + tokensOut,
      tokensIn: tokensIn,
      tokensOut: tokensOut,
    };
  }

  /**
   * @param {{provider: string, system: string, user: string,
   *          model?: string, apiKey?: string, fetchFn?: Function,
   *          temperature?: number, maxTokens?: number}} input
   */
  async function callChat(input) {
    input = input || {};
    var provider = assertProvider(input.provider);
    if (provider === PROVIDER_ANTHROPIC) {
      return callAnthropicMessages(input);
    }
    return callOpenAiChat(input);
  }

  /**
   * Verify Fn para o loop: recebe só {codigo,nome,trecho} — cego.
   * @param {{provider: string, model?: string, apiKey?: string,
   *          fetchFn?: Function}} opts
   */
  /**
   * FEAT-212 (RAG2-AC-06): rerank listwise barato. O LLM reordena a shortlist
   * top-N contra a query usando apenas códigos + nomes oficiais (sem DS —
   * orçamento de tokens). Saída é JSON array de códigos; o loop aplica via
   * resolve.applyRerank (cabeça substituída, cauda intacta). Falha de parse
   * degrada para lista vazia → ordem original preservada (fail-open seguro:
   * rerank é optimização, nunca gate).
   * @param {{provider?: string, model?: string, apiKey?: string,
   *          fetchFn?: Function, topN?: number}} opts
   */
  function createRerankFn(opts) {
    opts = opts || {};
    var provider = assertProvider(opts.provider || PROVIDER_OPENAI);
    var model = str(opts.model) || defaultModelFor(provider);
    var topN =
      typeof opts.topN === "number" && opts.topN > 0 ? opts.topN : 20;

    return async function rerank(args) {
      args = args || {};
      var query = str(args.query).trim();
      var candidatos = Array.isArray(args.candidatos) ? args.candidatos : [];
      if (!query || !candidatos.length) {
        return { value: [], tokens: 0, tokensIn: 0, tokensOut: 0 };
      }
      var linhas = [];
      for (var i = 0; i < candidatos.length && i < topN; i++) {
        var c = candidatos[i] || {};
        linhas.push(str(c.codigo) + " " + str(c.nome).trim());
      }
      var user = [
        "Query do ato cirúrgico: " + query,
        "",
        "Candidatos SIGTAP:",
        linhas.join("\n"),
        "",
        "Reordene os códigos por relevância clínica para a query.",
        'Responda APENAS com JSON: {"ordenados": ["<codigo>", ...]}',
        "Use somente códigos da lista acima; não invente códigos novos.",
      ].join("\n");
      var raw = await callChat({
        provider: provider,
        model: model,
        system:
          "Você é um reranker de códigos SIGTAP. Reordene candidatos por " +
          'relevância para a query. Responda só JSON {"ordenados": [...]}.',
        user: user,
        apiKey: opts.apiKey,
        fetchFn: opts.fetchFn,
        temperature: 0,
        maxTokens: openaiIsReasoningFamily(model) ? VERIFY_MAX_TOKENS_GPT5 : 512,
      });
      // Parse resiliente: aceita object {ordenados} ou array directo;
      // filtra para códigos presentes na shortlist (lista fechada).
      var permitidos = {};
      for (var p = 0; p < linhas.length; p++) {
        permitidos[linhas[p].split(" ")[0]] = true;
      }
      var ordenados = [];
      try {
        var m = raw.text.match(/\{[\s\S]*\}/);
        var arr = null;
        if (m) {
          var obj = JSON.parse(m[0]);
          if (Array.isArray(obj && obj.ordenados)) arr = obj.ordenados;
        }
        if (!arr) {
          var m2 = raw.text.match(/\[[\s\S]*\]/);
          if (m2) arr = JSON.parse(m2[0]);
        }
        if (Array.isArray(arr)) {
          for (var r2 = 0; r2 < arr.length; r2++) {
            var cod = str(arr[r2]);
            if (permitidos[cod] && ordenados.indexOf(cod) === -1) {
              ordenados.push(cod);
            }
          }
        }
      } catch (e) {
        ordenados = [];
      }
      return {
        value: ordenados,
        tokens: raw.tokens,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        provider: raw.provider,
        model: raw.model,
      };
    };
  }

  function createBlindVerifyFn(opts) {
    opts = opts || {};
    var provider = assertProvider(opts.provider || PROVIDER_OPENAI);
    var model = str(opts.model) || defaultModelFor(provider);

    return async function blindVerify(args) {
      args = args || {};
      // Fronteira: código/nome/DS/trecho — raciocínio anterior é lixo.
      var safe = {
        codigo: args.codigo,
        nome: args.nome,
        descricao: args.descricao,
        trecho: args.trecho,
      };
      var prompt = guard.buildBlindVerifyPrompt(safe);
      var raw = await callChat({
        provider: provider,
        model: model,
        system: prompt.system,
        user: prompt.user,
        apiKey: opts.apiKey,
        fetchFn: opts.fetchFn,
        temperature: 0,
        maxTokens: Number(opts.maxTokens) > 0
          ? Number(opts.maxTokens)
          : openaiIsReasoningFamily(model)
            ? VERIFY_MAX_TOKENS_GPT5
            : VERIFY_MAX_TOKENS_LEGACY,
      });
      var parsed = guard.parseVerifyOutput
        ? guard.parseVerifyOutput(raw.text)
        : {
            veredito: guard.parseVerifyVerdict(raw.text),
            raciocinio: "",
          };
      return {
        value: parsed.veredito,
        tokens: raw.tokens,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        provider: raw.provider,
        model: raw.model,
        raciocinio: parsed.raciocinio || "",
      };
    };
  }

  /**
   * Stub offline: mapa codigo → confirm|refute|uncertain (ou função).
   * Simula um segundo fornecedor independente do select.
   */
  function createStubVerifyFn(verdictsOrFn, meta) {
    meta = meta || {};
    var provider = str(meta.provider) || "stub-b";
    return async function stubVerify(args) {
      args = args || {};
      var codigo = str(args.codigo);
      var verdict;
      if (typeof verdictsOrFn === "function") {
        verdict = verdictsOrFn(args);
      } else {
        var map = verdictsOrFn || {};
        verdict = map[codigo];
        if (verdict == null && map["*"] != null) verdict = map["*"];
      }
      verdict = guard.normalizeVerdict(verdict);
      return {
        value: verdict,
        tokens: Number(meta.tokens) || 0,
        provider: provider,
        model: str(meta.model) || "stub",
        raciocinio: "",
      };
    };
  }

  /**
   * Par A/B independente para evals: A "seleccionou" (implícito); B verifica.
   * `goldByCodigo` = set/map de códigos correctos → confirm; resto → refute.
   */
  function createIndependentStubPair(input) {
    input = input || {};
    var gold = input.goldByCodigo || {};
    var injected = input.injectedByCodigo || {};
    var extractProvider = str(input.extractProvider) || "stub-a";
    var verifyProvider = str(input.verifyProvider) || "stub-b";

    function isGold(codigo) {
      if (typeof gold.has === "function") return gold.has(codigo);
      return !!gold[codigo];
    }
    function isInjected(codigo) {
      if (typeof injected.has === "function") return injected.has(codigo);
      return !!injected[codigo];
    }

    return {
      extractProvider: extractProvider,
      verifyProvider: verifyProvider,
      /** Select stub: devolve o que o caller pediu (já montado). */
      select: typeof input.select === "function" ? input.select : null,
      verify: createStubVerifyFn(function (args) {
        var codigo = str(args.codigo);
        // Erros injectados: B independente refuta (não vê a escolha de A).
        if (isInjected(codigo)) return "refute";
        if (isGold(codigo)) return "confirm";
        // Código fora do ouro sem marca de injecção → refute cauteloso.
        return "refute";
      }, { provider: verifyProvider, model: "stub-independent" }),
    };
  }

  function liveKeysPresent() {
    if (typeof process === "undefined" || !process.env) return false;
    var o = !!(process.env.OPENAI_API_KEY || process.env.AGHU_OPENAI_API_KEY);
    var a = !!(
      process.env.ANTHROPIC_API_KEY || process.env.AGHU_ANTHROPIC_API_KEY
    );
    return o && a;
  }

  function keyForProvider(provider, opts) {
    opts = opts || {};
    if (provider === PROVIDER_ANTHROPIC) {
      return str(opts.apiKeyAnthropic) || resolveApiKey(PROVIDER_ANTHROPIC, opts);
    }
    return str(opts.apiKeyOpenAI) || resolveApiKey(PROVIDER_OPENAI, opts);
  }

  /**
   * Deps live para o loop: extract/select num fornecedor, verify cego noutro.
   * Keys: opts.apiKeyOpenAI / opts.apiKeyAnthropic (Edge) ou process.env.
   */
  function createLiveDeps(opts) {
    opts = opts || {};
    if (!extract || typeof extract.buildExtractPrompt !== "function") {
      throw new Error("createLiveDeps exige procod-extract.");
    }
    if (!select || typeof select.buildSelectPrompt !== "function") {
      throw new Error("createLiveDeps exige procod-select.");
    }
    var pair = resolveCrossProviders({
      extract: opts.extract,
      verify: opts.verify,
    });
    var extractKey = keyForProvider(pair.extract, opts);
    var verifyKey = keyForProvider(pair.verify, opts);
    var fetchFn = opts.fetchFn;

    async function liveExtract(args) {
      args = args || {};
      var prompt = extract.buildExtractPrompt(args);
      var raw = await callChat({
        provider: pair.extract,
        system: prompt.system,
        user: prompt.user,
        apiKey: extractKey,
        fetchFn: fetchFn,
        temperature: 0,
        maxTokens: Number(opts.extractMaxTokens) || 2048,
      });
      var parsed = extract.parseExtractOutput(raw.text);
      return {
        value: raw.text,
        tokens: raw.tokens,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        provider: raw.provider,
        model: raw.model,
        raciocinio:
          parsed.ok && parsed.value
            ? guard.clipRaciocinio(parsed.value.raciocinio)
            : "",
      };
    }

    async function liveSelect(args) {
      args = args || {};
      var prompt = select.buildSelectPrompt(args);
      var raw = await callChat({
        provider: pair.extract,
        system: prompt.system,
        user: prompt.user,
        apiKey: extractKey,
        fetchFn: fetchFn,
        temperature: 0,
        maxTokens: Number(opts.selectMaxTokens) || 1024,
      });
      var result = select.selectCodes(raw.text, args);
      return {
        value: result.ok ? result.selected : [],
        tokens: raw.tokens,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        provider: raw.provider,
        model: raw.model,
        raciocinio: result.raciocinio || "",
      };
    }

    return {
      extract: liveExtract,
      select: liveSelect,
      verify: createBlindVerifyFn({
        provider: pair.verify,
        apiKey: verifyKey,
        fetchFn: fetchFn,
      }),
      providers: pair,
    };
  }

  return {
    PROVIDER_OPENAI: PROVIDER_OPENAI,
    PROVIDER_ANTHROPIC: PROVIDER_ANTHROPIC,
    PROVIDERS: PROVIDERS,
    DEFAULT_OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
    DEFAULT_ANTHROPIC_MODEL: DEFAULT_ANTHROPIC_MODEL,
    openaiIsReasoningFamily: openaiIsReasoningFamily,
    OPENAI_URL: OPENAI_URL,
    ANTHROPIC_URL: ANTHROPIC_URL,
    assertProvider: assertProvider,
    resolveCrossProviders: resolveCrossProviders,
    defaultModelFor: defaultModelFor,
    resolveApiKey: resolveApiKey,
    callChat: callChat,
    createBlindVerifyFn: createBlindVerifyFn,
    createRerankFn: createRerankFn,
    createStubVerifyFn: createStubVerifyFn,
    createIndependentStubPair: createIndependentStubPair,
    liveKeysPresent: liveKeysPresent,
    createLiveDeps: createLiveDeps,
    // re-export útil para callers que só puxam o provider
    GUARD_DIVERGENCE: codes.GUARD_DIVERGENCE,
  };
});
