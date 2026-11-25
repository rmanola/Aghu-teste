/**
 * FEAT-157 — selecção IA entre candidatos (camada 3).
 *
 * O LLM só escolhe códigos da lista fechada que a resolução propôs.
 * Código fora da lista → `code_not_in_candidates` (não chega ao guard_det
 * como aprovado). Citação e catálogo ficam para `procod-guard.js`.
 *
 * Sem SDK: a chamada ao fornecedor entra por `deps.llm` (injectável). Offline
 * usa stub/oracle — o mesmo contrato que o loop espera em `deps.select`.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodSelect = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (codes, guard) {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  var SYSTEM_PROMPT = [
    "Você escolhe códigos SIGTAP para UM ato cirúrgico.",
    "",
    "Regras:",
    "- Escolha APENAS códigos da lista de CANDIDATOS fornecida (grupo 04).",
    "- Nunca invente código. Se nenhum candidato servir, devolva lista vazia.",
    "- Confronta o NOME oficial (NO_PROCEDIMENTO) e a DESCRIÇÃO OFICIAL (DS)",
    "  com a via e o sítio do ato. O nome curto não basta se a DS excluir o ato.",
    "- Sem DS oficial no candidato, não o escolha (fail-closed — não invente DS).",
    "- O trecho é evidência opcional; pode parafrasear.",
    "- Pode escolher zero, um ou vários candidatos quando o ato os justifica.",
    "",
    'Responda só com JSON: {"raciocinio":"","escolhas":[{"codigo":"","trecho":""}]}',
  ].join("\n");

  /** Pin do prompt para o tuple (system_prompt_hash). Bump ao editar o texto. */
  var SYSTEM_PROMPT_ID = "PROCOD_SELECT_v4";

  // FEAT-212 (RAG2-AC-07): orçamento de inject — candidatos no prompt,
  // DS truncada com contador e âncora repetida ao fim (lost-in-the-middle).
  var MAX_CANDIDATOS_SELECT = 15;
  var DS_MAX_CHARS = 240;

  /**
   * Trunca a DS oficial com contador explícito (o LLM sabe que leu um corte).
   * @param {string} ds
   */
  function truncarDs(ds) {
    var s = str(ds).replace(/\s+/g, " ").trim();
    if (s.length <= DS_MAX_CHARS) return { texto: s, truncado: false };
    return {
      texto: s.slice(0, DS_MAX_CHARS) + "… [+ " + (s.length - DS_MAX_CHARS) + " chars]",
      truncado: true,
    };
  }

  function candidateCodes(candidatos) {
    var list = Array.isArray(candidatos) ? candidatos : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var codigo = typeof c === "string" ? str(c) : str(c && c.codigo);
      if (codigo) out.push(codigo);
    }
    return out;
  }

  function formatCandidatosBlock(candidatos) {
    var list = Array.isArray(candidatos) ? candidatos : [];
    var lines = [];
    var cortados = 0;
    for (
      var i = 0;
      i < list.length && lines.length < MAX_CANDIDATOS_SELECT;
      i++
    ) {
      var c = list[i];
      if (typeof c === "string") {
        lines.push("- " + c);
        continue;
      }
      var codigo = str(c && c.codigo);
      var nome = str(c && c.nome);
      var ds = str(c && c.descricao);
      if (!codigo) continue;
      var line = "- " + codigo + (nome ? " — " + nome : "");
      var t = truncarDs(ds);
      if (ds) line += "\n  DS: " + t.texto;
      else line += "\n  DS: (ausente — não escolher este código)";
      lines.push(line);
    }
    cortados = Math.max(0, list.filter(Boolean).length - MAX_CANDIDATOS_SELECT);
    var corpo = lines.length ? lines.join("\n") : "(nenhum)";
    if (cortados > 0) {
      corpo +=
        "\n(+" + cortados + " candidatos omitidos pelo orçamento de contexto —" +
        " os primeiros são os mais relevantes pelo ranking)";
    }
    return corpo;
  }

  /**
   * Âncora do ato repetida ao fim do user prompt — o fim da janela pesa mais
   * que o meio (lost-in-the-middle); a decisão final lê a evidência por último.
   * @param {{ato?: object}} input
   */
  function ancoraFinal(input) {
    var ato = (input && input.ato) || {};
    return [
      "LEMBRETE (âncora):",
      "- ato: " + str(ato.ato),
      "- via: " + str(ato.via),
      "- sítio: " + str(ato.sitio),
      "- lateralidade: " + str(ato.lateralidade),
      "- trecho: " + str(ato.trecho),
      "Escolha APENAS entre os códigos da lista de CANDIDATOS acima.",
    ].join("\n");
  }

  function buildSelectPrompt(input) {
    input = input || {};
    var ato = input.ato || {};
    var user = [
      "Ato:",
      "- atoId: " + str(ato.atoId),
      "- ato: " + str(ato.ato),
      "- via: " + str(ato.via),
      "- sítio: " + str(ato.sitio),
      "- lateralidade: " + str(ato.lateralidade),
      "- trecho do extract: " + str(ato.trecho),
      "",
      "Candidatos (lista fechada):",
      formatCandidatosBlock(input.candidatos),
      "",
      "Descrição cirúrgica:",
      "",
      str(input.descricao),
      "",
      ancoraFinal(input),
    ].join("\n");
    return {
      system: SYSTEM_PROMPT,
      systemId: SYSTEM_PROMPT_ID,
      user: user,
    };
  }

  /** Tolera cerca markdown (aberta ou fechada) e prosa à volta do JSON. */
  function parseSelectOutput(raw) {
    if (raw && typeof raw === "object") {
      return { ok: true, value: raw };
    }
    var text = str(raw).trim();
    if (!text) {
      return {
        ok: false,
        errorCode: codes.EXTRACT_INVALID,
        error: "Selecção devolveu resposta vazia.",
      };
    }
    var parsed = guard.parseJsonFromLlm(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        errorCode: codes.EXTRACT_INVALID,
        error: "Selecção não devolveu JSON válido: " + parsed.error,
      };
    }
    return { ok: true, value: parsed.value };
  }

  function contains(colecao, valor) {
    if (!colecao) return false;
    if (typeof colecao.has === "function") return colecao.has(valor);
    if (Array.isArray(colecao)) return colecao.indexOf(valor) !== -1;
    return false;
  }

  /**
   * Filtra escolhas à lista fechada. Fora da lista → rejeitado com
   * `code_not_in_candidates` (não silencioso).
   *
   * @returns {{selected: Array, rejected: Array}}
   */
  function filterClosedList(escolhas, candidatos) {
    var allowed = candidateCodes(candidatos);
    var lista = Array.isArray(escolhas) ? escolhas : [];
    var selected = [];
    var rejected = [];
    var seen = {};

    for (var i = 0; i < lista.length; i++) {
      var src = lista[i] || {};
      var codigo = str(src.codigo).trim();
      if (!codigo) {
        rejected.push({
          item: src,
          errorCode: codes.EXTRACT_INVALID,
          error: "Escolha sem código.",
        });
        continue;
      }
      if (!contains(allowed, codigo)) {
        rejected.push({
          item: src,
          errorCode: codes.CODE_NOT_IN_CANDIDATES,
          error: "Código " + codigo + " não está na lista fechada de candidatos.",
        });
        continue;
      }
      if (seen[codigo]) continue;
      seen[codigo] = true;
      selected.push({
        codigo: codigo,
        trecho: str(src.trecho).trim(),
      });
    }
    return { selected: selected, rejected: rejected };
  }

  /**
   * Pipeline: saída crua do LLM → escolhas validadas na lista fechada.
   */
  function selectCodes(raw, input) {
    input = input || {};
    var parsed = parseSelectOutput(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        errorCode: parsed.errorCode,
        error: parsed.error,
        selected: [],
        rejected: [],
        raciocinio: "",
      };
    }
    var value = parsed.value;
    var lista =
      value && Array.isArray(value.escolhas)
        ? value.escolhas
        : Array.isArray(value)
          ? value
          : [];
    var filtered = filterClosedList(lista, input.candidatos);
    return {
      ok: true,
      selected: filtered.selected,
      rejected: filtered.rejected,
      raciocinio: guard.clipRaciocinio(value && value.raciocinio),
    };
  }

  /**
   * Contrato do loop: `deps.select({ ato, descricao, candidatos })`.
   * Se `deps.llm` existir, chama-o com o prompt; senão exige `deps.raw`
   * (já parseável) ou devolve lista vazia.
   *
   * @param {object} deps
   * @param {Function} [deps.llm] async (prompt) => string|object
   * @param {Function} [deps.selectFn] override total (oracle/stub)
   */
  async function runSelect(input, deps) {
    deps = deps || {};
    if (typeof deps.selectFn === "function") {
      var direct = await deps.selectFn(input);
      var asList = Array.isArray(direct)
        ? direct
        : direct && Array.isArray(direct.selected)
          ? direct.selected
          : [];
      var filtered = filterClosedList(asList, input && input.candidatos);
      return {
        selected: filtered.selected,
        rejected: filtered.rejected,
        raciocinio: guard.clipRaciocinio(direct && direct.raciocinio),
      };
    }
    var prompt = buildSelectPrompt(input);
    var raw;
    if (typeof deps.llm === "function") {
      raw = await deps.llm(prompt);
    } else if (deps.raw != null) {
      raw = deps.raw;
    } else {
      return { selected: [], rejected: [] };
    }
    var result = selectCodes(raw, input);
    if (!result.ok) {
      return {
        selected: [],
        rejected: [
          {
            item: null,
            errorCode: result.errorCode,
            error: result.error,
          },
        ],
        raciocinio: "",
      };
    }
    return {
      selected: result.selected,
      rejected: result.rejected,
      raciocinio: result.raciocinio || "",
    };
  }

  /**
   * Stub offline: escolhe do gabarito só códigos que ainda estão nos candidatos.
   * Precisão perfeita quando recall da resolução cobre o esperado.
   *
   * @param {Object<string, string[]|Array<{codigo:string,trecho?:string}>>} expectedByAtoId
   */
  function createOracleSelectFn(expectedByAtoId) {
    var map = expectedByAtoId || {};
    return async function oracleSelect(input) {
      input = input || {};
      var atoId = str(input.ato && input.ato.atoId);
      var allowed = candidateCodes(input.candidatos);
      var expected = map[atoId] || [];
      var out = [];
      for (var i = 0; i < expected.length; i++) {
        var row = expected[i];
        var codigo = typeof row === "string" ? str(row) : str(row && row.codigo);
        if (!codigo || allowed.indexOf(codigo) === -1) continue;
        var trecho =
          typeof row === "object" && row
            ? str(row.trecho || (input.ato && input.ato.trecho))
            : str(input.ato && input.ato.trecho);
        out.push({ codigo: codigo, trecho: trecho });
      }
      return out;
    };
  }

  return {
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    SYSTEM_PROMPT_ID: SYSTEM_PROMPT_ID,
    MAX_CANDIDATOS_SELECT: MAX_CANDIDATOS_SELECT,
    DS_MAX_CHARS: DS_MAX_CHARS,
    truncarDs: truncarDs,
    ancoraFinal: ancoraFinal,
    buildSelectPrompt: buildSelectPrompt,
    parseSelectOutput: parseSelectOutput,
    candidateCodes: candidateCodes,
    filterClosedList: filterClosedList,
    selectCodes: selectCodes,
    runSelect: runSelect,
    createOracleSelectFn: createOracleSelectFn,
  };
});
