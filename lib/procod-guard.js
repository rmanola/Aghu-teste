/**
 * FEAT-157 — guardrails determinísticos (camada 4a).
 *
 * Travões por comparação (sem julgamento LLM):
 *   1. lista fechada     — o código foi proposto pela resolução?
 *   2. citação literal   — o trecho existe mesmo no laudo?
 *   3. catálogo          — o código existe na competência da cirurgia?
 *   4. regras SIGTAP     — sexo/idade/CID/exclusão, quando o contexto as traz
 *
 * Rodam antes do verificador cross-provider de propósito: são grátis, e é
 * desperdício gastar uma chamada de LLM num item que `indexOf` já derruba.
 *
 * Sobre a normalização da citação: colapsamos whitespace, caixa, diacríticos
 * (NFKD) e pontuação `.,;:` só para *localizar* o span. O trecho persistido é
 * sempre o recorte original do laudo. Palavra ausente continua recusada —
 * não há Levenshtein.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodGuard = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (codes) {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function fail(errorCode, error) {
    return { ok: false, errorCode: errorCode, error: error };
  }

  /** Colapsa whitespace e baixa a caixa. Acentos preservados (display / testes). */
  function normalizeForCitation(text) {
    return str(text).replace(/\s+/g, " ").trim().toLowerCase();
  }

  /**
   * folded + mapa foldedIndex → índice no original.
   * Whitespace colapsa; caixa baixa; NFKD sem marcas; `.,;:` ignorados.
   */
  function foldMap(text) {
    var s = str(text);
    var folded = "";
    var map = [];
    var lastWasSpace = true;
    for (var i = 0; i < s.length; i++) {
      var origI = i;
      var unit = s.charAt(i);
      if (typeof unit.normalize === "function") {
        unit = unit.normalize("NFKD");
      }
      for (var u = 0; u < unit.length; u++) {
        var c = unit.charAt(u);
        var code = c.charCodeAt(0);
        if (code >= 0x0300 && code <= 0x036f) continue;
        if (c === "." || c === "," || c === ";" || c === ":") continue;
        if (/\s/.test(c)) {
          if (lastWasSpace) continue;
          folded += " ";
          map.push(origI);
          lastWasSpace = true;
          continue;
        }
        folded += c.toLowerCase();
        map.push(origI);
        lastWasSpace = false;
      }
    }
    while (folded.length && folded.charAt(folded.length - 1) === " ") {
      folded = folded.slice(0, -1);
      map.pop();
    }
    return { folded: folded, map: map };
  }

  function snapCitationSpan(descricao, foldedStart, foldedLen, fonteMap) {
    if (foldedLen < 1 || !fonteMap.length) return str(descricao);
    var start = fonteMap[foldedStart];
    var last = fonteMap[foldedStart + foldedLen - 1];
    if (typeof start !== "number" || typeof last !== "number") {
      return str(descricao);
    }
    return str(descricao).slice(start, last + 1);
  }

  /**
   * Cerca markdown fechada, cerca aberta (Haiku: ```json { ... sem fecho)
   * e fallback do primeiro `{` ao último `}`.
   */
  function unwrapLlmJsonText(raw) {
    var text = str(raw).trim();
    if (!text) return "";
    var closed = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (closed) {
      text = closed[1].trim();
    } else if (/^```/i.test(text)) {
      text = text.replace(/^```(?:json)?\s*/i, "");
      text = text.replace(/\s*```\s*$/i, "").trim();
    }
    try {
      JSON.parse(text);
      return text;
    } catch (_e) {
      var a = text.indexOf("{");
      var b = text.lastIndexOf("}");
      if (a >= 0 && b > a) return text.slice(a, b + 1);
      return text;
    }
  }

  function parseJsonFromLlm(raw) {
    if (raw && typeof raw === "object") {
      return { ok: true, value: raw };
    }
    var text = unwrapLlmJsonText(raw);
    if (!text) {
      return { ok: false, error: "resposta vazia" };
    }
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /** TRAVÃO 2 — a evidência tem de existir no laudo; acento/pontuação encaixam. */
  function validateCitation(descricao, trecho) {
    var alvo = foldMap(trecho);
    if (!alvo.folded) {
      return fail(
        codes.CITATION_NOT_SUBSTRING,
        "Item sem trecho citado — evidência é obrigatória."
      );
    }
    var fonte = foldMap(descricao);
    var idx = fonte.folded.indexOf(alvo.folded);
    if (idx === -1) {
      return fail(
        codes.CITATION_NOT_SUBSTRING,
        "Trecho citado não existe na descrição: «" + str(trecho).slice(0, 80) + "»."
      );
    }
    return {
      ok: true,
      trecho: snapCitationSpan(descricao, idx, alvo.folded.length, fonte.map),
    };
  }

  function contains(colecao, valor) {
    if (!colecao) return false;
    if (typeof colecao.has === "function") return colecao.has(valor);
    if (Array.isArray(colecao)) return colecao.indexOf(valor) !== -1;
    return false;
  }

  /** TRAVÃO 1 — lista fechada. */
  function validateCodeInCandidates(codigo, candidatos) {
    if (!contains(candidatos, str(codigo))) {
      return fail(
        codes.CODE_NOT_IN_CANDIDATES,
        "Código " + str(codigo) + " não foi proposto pela resolução."
      );
    }
    return { ok: true };
  }

  /** TRAVÃO 3 — existe na competência vigente. */
  function validateCodeInCompetencia(codigo, catalogo) {
    if (!contains(catalogo, str(codigo))) {
      return fail(
        codes.CODE_NOT_IN_COMPETENCIA,
        "Código " + str(codigo) + " não existe na competência da cirurgia."
      );
    }
    return { ok: true };
  }

  /**
   * Regras SIGTAP opcionais (só quando o caller traz meta).
   * Ausência de meta NÃO vira permissão inventada — simplesmente não checa.
   *
   * @param {string} codigo
   * @param {{paciente?: {sexo?: string, idadeMeses?: number},
   *          metaByCodigo?: Object,
   *          cid?: string,
   *          cidsPorCodigo?: Object,
   *          selecionados?: string[],
   *          exclusoes?: Array<{a:string,b:string}>}} ctx
   */
  function validateSigtapRules(codigo, ctx) {
    ctx = ctx || {};
    var code = str(codigo);
    var meta = (ctx.metaByCodigo && ctx.metaByCodigo[code]) || null;
    var paciente = ctx.paciente || null;

    if (meta && paciente) {
      var sexoProc = str(meta.sexo || meta.TP_SEXO).toUpperCase();
      var sexoPac = str(paciente.sexo).toUpperCase();
      // N/I = ambos; M/F restringem.
      if (sexoProc && sexoProc !== "N" && sexoProc !== "I" && sexoPac) {
        if (sexoProc !== sexoPac) {
          return fail(
            codes.CODE_NOT_IN_COMPETENCIA,
            "Código " + code + " exige sexo " + sexoProc + ", paciente " + sexoPac + "."
          );
        }
      }
      var idade = paciente.idadeMeses;
      if (typeof idade === "number" && isFinite(idade)) {
        var min =
          meta.idadeMinima != null
            ? Number(meta.idadeMinima)
            : meta.VL_IDADE_MINIMA != null
              ? Number(meta.VL_IDADE_MINIMA)
              : null;
        var max =
          meta.idadeMaxima != null
            ? Number(meta.idadeMaxima)
            : meta.VL_IDADE_MAXIMA != null
              ? Number(meta.VL_IDADE_MAXIMA)
              : null;
        if (min != null && isFinite(min) && idade < min) {
          return fail(
            codes.CODE_NOT_IN_COMPETENCIA,
            "Código " + code + " abaixo da idade mínima SIGTAP."
          );
        }
        if (max != null && isFinite(max) && max > 0 && idade > max) {
          return fail(
            codes.CODE_NOT_IN_COMPETENCIA,
            "Código " + code + " acima da idade máxima SIGTAP."
          );
        }
      }
    }

    var cid = str(ctx.cid).trim().toUpperCase();
    var cidsMap = ctx.cidsPorCodigo;
    if (cid && cidsMap && Object.prototype.hasOwnProperty.call(cidsMap, code)) {
      var permitidos = cidsMap[code];
      var okCid = false;
      if (Array.isArray(permitidos)) {
        for (var i = 0; i < permitidos.length; i++) {
          if (str(permitidos[i]).toUpperCase() === cid) {
            okCid = true;
            break;
          }
        }
      } else if (typeof permitidos.has === "function") {
        okCid = permitidos.has(cid);
      }
      if (!okCid) {
        return fail(
          codes.CODE_NOT_IN_COMPETENCIA,
          "Código " + code + " incompatível com CID " + cid + "."
        );
      }
    }

    var selecionados = Array.isArray(ctx.selecionados) ? ctx.selecionados : [];
    var exclusoes = Array.isArray(ctx.exclusoes) ? ctx.exclusoes : [];
    for (var e = 0; e < exclusoes.length; e++) {
      var pair = exclusoes[e] || {};
      var a = str(pair.a || pair.co_procedimento_restricao);
      var b = str(pair.b || pair.co_procedimento_principal);
      if (!a || !b) continue;
      if (
        (a === code && contains(selecionados, b)) ||
        (b === code && contains(selecionados, a))
      ) {
        return fail(
          codes.CODE_NOT_IN_COMPETENCIA,
          "Código " + code + " exclusivo com " + (a === code ? b : a) + "."
        );
      }
    }

    return { ok: true };
  }

  /**
   * Travões na ordem barato → caro. Devolve o primeiro erro.
   * @param {{descricao: string, codigo: string, trecho: string,
   *          candidatos: any, catalogo: any,
   *          paciente?: object, metaByCodigo?: object, cid?: string,
   *          cidsPorCodigo?: object, selecionados?: string[],
   *          exclusoes?: Array}} input
   */
  function runDeterministicGuards(input) {
    input = input || {};
    var r = validateCodeInCandidates(input.codigo, input.candidatos);
    if (!r.ok) return r;
    if (input.catalogo) {
      r = validateCodeInCompetencia(input.codigo, input.catalogo);
      if (!r.ok) return r;
    }
    r = validateCitation(input.descricao, input.trecho);
    if (!r.ok) return r;
    return validateSigtapRules(input.codigo, input);
  }

  /**
   * Aplica os travões a uma lista. Reprovado não é descartado em silêncio —
   * sai com o item original e o motivo, que é material de telemetria e da
   * fila de improvement.
   */
  function filterItems(input) {
    input = input || {};
    var itens = Array.isArray(input.itens) ? input.itens : [];
    var aprovados = [];
    var reprovados = [];
    var selecionados = itens.map(function (it) {
      return str(it && it.codigo);
    });
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i] || {};
      var r = runDeterministicGuards({
        descricao: input.descricao,
        codigo: item.codigo,
        trecho: item.trecho,
        candidatos: input.candidatos,
        catalogo: input.catalogo,
        paciente: input.paciente,
        metaByCodigo: input.metaByCodigo,
        cid: input.cid,
        cidsPorCodigo: input.cidsPorCodigo,
        selecionados: selecionados,
        exclusoes: input.exclusoes,
      });
      if (r.ok) {
        aprovados.push(item);
      } else {
        reprovados.push({
          item: item,
          errorCode: r.errorCode,
          error: r.error,
        });
      }
    }
    return { aprovados: aprovados, reprovados: reprovados };
  }

  var VERDICT_CONFIRM = "confirm";
  var VERDICT_REFUTE = "refute";
  var VERDICT_UNCERTAIN = "uncertain";
  var VERDICTS = Object.freeze([
    VERDICT_CONFIRM,
    VERDICT_REFUTE,
    VERDICT_UNCERTAIN,
  ]);

  var BLIND_VERIFY_SYSTEM = [
    "Você verifica se um código SIGTAP é suportado pelo ato/laudo,",
    "confrontando a DESCRIÇÃO OFICIAL (DS / tb_descricao) do procedimento.",
    "",
    "Regras:",
    "- Recebe código, nome, DS oficial e trecho/ato. Sem a decisão de quem escolheu.",
    "- Confronta o NOME e a DS com o que o trecho descreve (via, sítio, acto).",
    "- Sem DS oficial, responda uncertain — NÃO invente definição.",
    "- confirm: o ato/laudo sustenta esse procedimento segundo a DS.",
    "- refute: a DS não cobre o acto (erro semântico ou troca).",
    "- uncertain: informação insuficiente ou DS ausente.",
    "",
    'Responda só com JSON: {"raciocinio":"","veredito":"confirm"|"refute"|"uncertain"}',
  ].join("\n");

  var BLIND_VERIFY_PROMPT_ID = "PROCOD_BLIND_VERIFY_v3";

  var RACIOCINIO_MAX = 4000;

  function clipRaciocinio(v) {
    var s = str(v).trim();
    if (s.length > RACIOCINIO_MAX) return s.slice(0, RACIOCINIO_MAX);
    return s;
  }

  function normalizeVerdict(raw) {
    var v = str(raw).trim().toLowerCase();
    if (v === VERDICT_CONFIRM || v === "confirmed" || v === "yes" || v === "true") {
      return VERDICT_CONFIRM;
    }
    if (v === VERDICT_REFUTE || v === "refuted" || v === "no" || v === "false") {
      return VERDICT_REFUTE;
    }
    if (v === VERDICT_UNCERTAIN || v === "unknown" || v === "abstain") {
      return VERDICT_UNCERTAIN;
    }
    return VERDICT_UNCERTAIN;
  }

  /**
   * Prompt cego (4b): código + nome + DS oficial + trecho. Sem raciocínio anterior.
   * @param {{codigo: string, nome?: string, descricao?: string, trecho: string}} input
   */
  function buildBlindVerifyPrompt(input) {
    input = input || {};
    var ds = str(input.descricao).trim();
    var user = [
      "Código SIGTAP: " + str(input.codigo),
      "Nome do procedimento (NO_PROCEDIMENTO): " +
        (str(input.nome) || "(não informado)"),
      "Descrição oficial (tb_descricao / DS): " +
        (ds || "(ausente — responda uncertain, não invente)"),
      "Trecho / ato (evidência; pode ser paráfrase):",
      str(input.trecho),
    ].join("\n");
    return {
      system: BLIND_VERIFY_SYSTEM,
      systemId: BLIND_VERIFY_PROMPT_ID,
      user: user,
    };
  }

  function parseVerifyOutput(raw) {
    var text = str(raw).trim();
    if (!text) return { veredito: VERDICT_UNCERTAIN, raciocinio: "" };
    var parsed = parseJsonFromLlm(raw);
    if (parsed.ok && parsed.value && typeof parsed.value === "object") {
      return {
        veredito: normalizeVerdict(
          parsed.value.veredito || parsed.value.verdict || parsed.value.label
        ),
        raciocinio: clipRaciocinio(parsed.value.raciocinio),
      };
    }
    var m = text.match(/\b(confirm|refute|uncertain)\b/i);
    return {
      veredito: m ? normalizeVerdict(m[1]) : VERDICT_UNCERTAIN,
      raciocinio: "",
    };
  }

  function parseVerifyVerdict(raw) {
    return parseVerifyOutput(raw).veredito;
  }

  /**
   * 4c — reconcilia selecção (implícita confirm) com o verificador.
   * Discordância / incerteza → HITL; nunca descarte silencioso.
   *
   * @returns {{action: "pass"|"hitl", errorCode?: string, verdicts: object}}
   */
  function reconcileBlindVerdict(selecaoImplied, verificador) {
    var sel = normalizeVerdict(selecaoImplied || VERDICT_CONFIRM);
    var ver = normalizeVerdict(verificador);
    var verdicts = { selecao: sel, verificador: ver };
    if (sel === VERDICT_CONFIRM && ver === VERDICT_CONFIRM) {
      return { action: "pass", verdicts: verdicts };
    }
    return {
      action: "hitl",
      errorCode: codes.GUARD_DIVERGENCE,
      verdicts: verdicts,
    };
  }

  /**
   * Dois juízes independentes (A vs B). Concordam em confirm → pass;
   * discordam ou incerteza → HITL.
   */
  function reconcileProviderPair(verdictA, verdictB) {
    var a = normalizeVerdict(verdictA);
    var b = normalizeVerdict(verdictB);
    var verdicts = { providerA: a, providerB: b };
    if (a === VERDICT_CONFIRM && b === VERDICT_CONFIRM) {
      return { action: "pass", verdicts: verdicts };
    }
    if (a === VERDICT_REFUTE && b === VERDICT_REFUTE) {
      return {
        action: "drop",
        errorCode: codes.GUARD_DIVERGENCE,
        verdicts: verdicts,
      };
    }
    return {
      action: "hitl",
      errorCode: codes.GUARD_DIVERGENCE,
      verdicts: verdicts,
    };
  }

  return {
    normalizeForCitation: normalizeForCitation,
    unwrapLlmJsonText: unwrapLlmJsonText,
    parseJsonFromLlm: parseJsonFromLlm,
    validateCitation: validateCitation,
    validateCodeInCandidates: validateCodeInCandidates,
    validateCodeInCompetencia: validateCodeInCompetencia,
    validateSigtapRules: validateSigtapRules,
    runDeterministicGuards: runDeterministicGuards,
    filterItems: filterItems,
    VERDICT_CONFIRM: VERDICT_CONFIRM,
    VERDICT_REFUTE: VERDICT_REFUTE,
    VERDICT_UNCERTAIN: VERDICT_UNCERTAIN,
    VERDICTS: VERDICTS,
    BLIND_VERIFY_SYSTEM: BLIND_VERIFY_SYSTEM,
    BLIND_VERIFY_PROMPT_ID: BLIND_VERIFY_PROMPT_ID,
    RACIOCINIO_MAX: RACIOCINIO_MAX,
    clipRaciocinio: clipRaciocinio,
    normalizeVerdict: normalizeVerdict,
    buildBlindVerifyPrompt: buildBlindVerifyPrompt,
    parseVerifyOutput: parseVerifyOutput,
    parseVerifyVerdict: parseVerifyVerdict,
    reconcileBlindVerdict: reconcileBlindVerdict,
    reconcileProviderPair: reconcileProviderPair,
  };
});
