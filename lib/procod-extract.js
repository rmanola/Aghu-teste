/**
 * FEAT-157 — extração IA dos atos cirúrgicos (camada 1).
 *
 * O LLM aqui NÃO escolhe código. Ele lê o laudo e devolve o que foi feito, em
 * estrutura. É desta compreensão que nasce o recall — foi a correcção central
 * do desenho: match léxico na entrada tetava justamente os procedimentos
 * secundários redigidos em prosa livre.
 *
 * Citação literal NÃO é porta: paráfrase é ato válido. Se o trecho for
 * substring do laudo, grava-se como evidência opcional; senão o ato segue
 * na mesma. Grounding fica na lista fechada (grupo 04) + LLM vs tb_descricao.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard,
    typeof require !== "undefined"
      ? require("./procod-catalog.js")
      : root.AghuProcodCatalog
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodExtract = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (codes, guard, catalog) {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  var SYSTEM_PROMPT = [
    "Você lê o laudo cirúrgico (CIRURGIA + ACHADOS OPERATÓRIOS + DESCRIÇÃO) e lista os ATOS realizados.",
    "",
    "Regras:",
    "- NÃO sugira códigos de procedimento. Outra etapa faz isso.",
    "- Liste todos os atos cirúrgicos efectivamente REALIZADOS, incluindo os",
    "  secundários (acessos, biópsias, lises, drenagens, suturas, drenos).",
    "- Não liste achados, técnica cirurgica, diagnósticos, nem o que foi apenas cogitado ou descartado.",
    "- CIRURGIA: é um hint do nome da cirurgia para o procedimento principal — não é o",
    "  único ato e não substitui o que a DESCRIÇÃO relata. ACHADOS não são atos.",
    "  Identifique atos compatíveis com a cirurgia principal,",
    "  ou realizados em sequência, e que são relevantes para a descrição.",
    "- Para cada ato, o campo trecho é evidência opcional: um span do laudo se",
    "  existir; senão parafraseie o ato. Não omita o ato por falta de substring.",
    "- Responda SÓ com JSON. Sem markdown, sem cerca ```, sem prosa.",
    "",
    "Exemplo sintético (principal + secundário):",
    'Texto: CIRURGIA: Colecistectomia videolaparoscópica.',
    "DESCRIÇÃO: REALIZADA COLECISTECTOMIA VIDEOLAPAROSCOPICA. COLOCACAO DE DRENO LAMINAR SUB-HEPATICO.",
    'JSON: {"raciocinio":"dois actos realizados","atos":[{"ato":"colecistectomia videolaparoscópica","via":"videolaparoscopica","sitio":"vesicula","lateralidade":"","trecho":"REALIZADA COLECISTECTOMIA VIDEOLAPAROSCOPICA"},{"ato":"drenagem sub-hepática","via":"videolaparoscopica","sitio":"leito hepatico","lateralidade":"","trecho":"COLOCACAO DE DRENO LAMINAR SUB-HEPATICO"}]}',
    "",
    'Formato: {"raciocinio":"","atos":[{"ato":"","via":"","sitio":"","lateralidade":"","trecho":""}]}',
  ].join("\n");

  /** Pin do prompt para o tuple (system_prompt_hash). Bump ao editar o texto. */
  var SYSTEM_PROMPT_ID = "PROCOD_EXTRACT_v5";

  function partsFromInput(input) {
    if (input == null) {
      return { nome: "", achadosOperatorios: "", descricao: "" };
    }
    if (typeof input === "string") {
      return { nome: "", achadosOperatorios: "", descricao: str(input) };
    }
    return {
      nome: str(input.cirurgiaNome || input.nome).trim(),
      achadosOperatorios: str(input.achadosOperatorios).trim(),
      descricao: str(input.descricao).trim(),
    };
  }

  /**
   * Laudo que o extract lê. Se houver nome ou achados, monta as três
   * secções (mesmo contrato de catalog.buildCirurgiaText). Blob legado
   * em `descricao` sozinho não é re-embrulhado.
   */
  function laudoFromInput(input) {
    var p = partsFromInput(input);
    if (p.nome || p.achadosOperatorios) {
      return catalog.buildCirurgiaText({
        nome: p.nome,
        achadosOperatorios: p.achadosOperatorios,
        descricao: p.descricao,
      });
    }
    return p.descricao;
  }

  function buildExtractPrompt(input) {
    var laudo = laudoFromInput(input);
    return {
      system: SYSTEM_PROMPT,
      systemId: SYSTEM_PROMPT_ID,
      laudo: laudo,
      user: [
        "Laudo da cirurgia (secções CIRURGIA, ACHADOS OPERATÓRIOS e DESCRIÇÃO).",
        "Atos realizados vêm sobretudo da DESCRIÇÃO; CIRURGIA é hint; ACHADOS não são atos.",
        "",
        laudo,
      ].join("\n"),
    };
  }

  /** Tolera cerca markdown (aberta ou fechada) e prosa à volta do JSON. */
  function parseExtractOutput(raw) {
    if (raw && typeof raw === "object") {
      return { ok: true, value: raw };
    }
    var text = str(raw).trim();
    if (!text) {
      return {
        ok: false,
        errorCode: codes.EXTRACT_INVALID,
        error: "Extração devolveu resposta vazia.",
      };
    }
    var parsed = guard.parseJsonFromLlm(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        errorCode: codes.EXTRACT_INVALID,
        error: "Extração não devolveu JSON válido: " + parsed.error,
      };
    }
    return { ok: true, value: parsed.value };
  }

  /**
   * Normaliza atos. Citação literal é evidência opcional — paráfrase passa.
   * Só recusa ato sem descrição do procedimento.
   *
   * @returns {{atos: Array, invalidos: Array}}
   */
  function validateAtos(value, descricao) {
    var lista =
      value && Array.isArray(value.atos)
        ? value.atos
        : Array.isArray(value)
          ? value
          : [];
    var atos = [];
    var invalidos = [];

    for (var i = 0; i < lista.length; i++) {
      var src = lista[i] || {};
      var ato = str(src.ato).trim();
      var trecho = str(src.trecho).trim();

      if (!ato) {
        invalidos.push({
          item: src,
          errorCode: codes.EXTRACT_INVALID,
          error: "Ato sem descrição do procedimento.",
        });
        continue;
      }
      var cit = trecho ? guard.validateCitation(descricao, trecho) : { ok: false };
      atos.push({
        atoId: "a" + (atos.length + 1),
        ato: ato,
        via: str(src.via).trim(),
        sitio: str(src.sitio).trim(),
        lateralidade: str(src.lateralidade).trim(),
        trecho: cit.ok && cit.trecho ? cit.trecho : trecho,
      });
    }
    return { atos: atos, invalidos: invalidos };
  }

  function normalizeAtoKeyPart(s) {
    return str(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function atoDedupeKey(ato) {
    ato = ato || {};
    return (
      normalizeAtoKeyPart(ato.ato) +
      "\u0001" +
      normalizeAtoKeyPart(ato.via) +
      "\u0001" +
      normalizeAtoKeyPart(ato.sitio)
    );
  }

  function hasLiteralCitation(ato, descricao) {
    var trecho = str(ato && ato.trecho).trim();
    if (!trecho) return false;
    var cit = guard.validateCitation(descricao, trecho);
    return cit.ok === true;
  }

  /**
   * Funde atos com a mesma chave ato+via+sítio. Citação literal ganha;
   * senão fica o primeiro. Reatribui atoId sequencial.
   */
  function dedupeAtos(atos, descricao) {
    var list = Array.isArray(atos) ? atos : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a) continue;
      var key = atoDedupeKey(a);
      if (!Object.prototype.hasOwnProperty.call(seen, key)) {
        seen[key] = out.length;
        out.push(a);
        continue;
      }
      var prev = out[seen[key]];
      if (hasLiteralCitation(a, descricao) && !hasLiteralCitation(prev, descricao)) {
        out[seen[key]] = a;
      }
    }
    for (var j = 0; j < out.length; j++) {
      out[j] = Object.assign({}, out[j], { atoId: "a" + (j + 1) });
    }
    return out;
  }

  /** Pipeline completo: saída crua do LLM → atos validados. */
  function extractAtos(raw, descricao) {
    var parsed = parseExtractOutput(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        errorCode: parsed.errorCode,
        error: parsed.error,
        atos: [],
        invalidos: [],
        raciocinio: "",
      };
    }
    var v = validateAtos(parsed.value, descricao);
    return {
      ok: true,
      atos: dedupeAtos(v.atos, descricao),
      invalidos: v.invalidos,
      raciocinio: guard.clipRaciocinio(
        parsed.value && parsed.value.raciocinio
      ),
    };
  }

  return {
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    SYSTEM_PROMPT_ID: SYSTEM_PROMPT_ID,
    laudoFromInput: laudoFromInput,
    buildExtractPrompt: buildExtractPrompt,
    parseExtractOutput: parseExtractOutput,
    validateAtos: validateAtos,
    dedupeAtos: dedupeAtos,
    extractAtos: extractAtos,
  };
});
