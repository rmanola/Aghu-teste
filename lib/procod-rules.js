/**
 * FEAT-157 — regras de faturabilidade AIH (camada 5).
 *
 * O eixo de faturabilidade AIH continua a ser o REGISTRO (03/04/05).
 * A tabela de compatibilidade classifica o *par* com o principal
 * (compatível / sequencial / excludente) depois do verify cego — ver
 * procod-compat.js. Registro 04/05 decide se o código *pode* ser especial
 * ou secundário; a aresta decide se *este* principal o autoriza.
 *
 *   03 = AIH (Proc. Principal)     1.768 procedimentos em 202607
 *   04 = AIH (Proc. Especial)        777
 *   05 = AIH (Proc. Secundário)      796
 *
 * Duas saídas do mesmo cálculo:
 *   • `faturaveis` — o que pode ser cobrado junto (receita)
 *   • `todos`      — a lista completa com evidência (defesa de glosa)
 *
 * Princípio: ausência de dado nunca vira permissão. Um código sem registro
 * conhecido não é faturável — é desconhecido, e isso é dito, não assumido.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-compat.js")
      : root.AghuProcodCompat
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodRules = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (compat) {
  "use strict";

  compat = compat || {};

  var AIH_PRINCIPAL = "03";
  var AIH_ESPECIAL = "04";
  var AIH_SECUNDARIO = "05";

  /** tb_registro.txt da competência 202607. */
  var REGISTRO_NOMES = Object.freeze({
    "01": "BPA (Consolidado)",
    "02": "BPA (Individualizado)",
    "03": "AIH (Proc. Principal)",
    "04": "AIH (Proc. Especial)",
    "05": "AIH (Proc. Secundário)",
    "06": "APAC (Proc. Principal)",
    "07": "APAC (Proc. Secundário)",
    "08": "RAAS (Atenção Domiciliar)",
    "09": "RAAS (Atenção Psicossocial)",
    "10": "e-SUS APS (Atenção Primária à Saúde)",
  });

  /**
   * Mapa 1..5 confirmado (wiki SIGTAP + SIASUS/e-cidade). Lookup em
   * procod-compat.js; este módulo só consome `relacao` no conjunto.
   */
  var TP_COMPATIBILIDADE_SEMANTICA_CONFIRMADA =
    compat.TP_COMPATIBILIDADE_SEMANTICA_CONFIRMADA === true;

  var CLASSE_PRINCIPAL = "principal";
  var CLASSE_FATURAVEL_SECUNDARIO = "faturavel_secundario";
  var CLASSE_FATURAVEL_ESPECIAL = "faturavel_especial";
  var CLASSE_EXIGE_AIH_PROPRIA = "exige_aih_propria";
  var CLASSE_NAO_FATURAVEL_AIH = "nao_faturavel_aih";
  var CLASSE_INVALIDO_COMO_PRINCIPAL = "invalido_como_principal";
  var CLASSE_REGISTRO_DESCONHECIDO = "registro_desconhecido";
  var CLASSE_COMPATIVEL_SEQUENCIAL = "compativel_sequencial";

  var FATURAVEIS = Object.freeze([
    CLASSE_FATURAVEL_SECUNDARIO,
    CLASSE_FATURAVEL_ESPECIAL,
    CLASSE_COMPATIVEL_SEQUENCIAL,
  ]);

  function str(v) {
    return v == null ? "" : String(v);
  }

  /** SIGTAP: 10 dígitos (GGSSFFPPPD). Pontos, espaços e lixo não distinguem código. */
  function normalizeCodigo(raw) {
    var digits = str(raw).replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(0, 10);
    return str(raw).trim();
  }

  function flattenItems(list) {
    var out = [];
    var arr = Array.isArray(list) ? list : [];
    for (var i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        for (var j = 0; j < arr[i].length; j++) out.push(arr[i][j]);
      } else {
        out.push(arr[i]);
      }
    }
    return out;
  }

  function uniqueItemsByCodigo(list) {
    var seen = {};
    var out = [];
    var arr = flattenItems(list);
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i] && typeof arr[i] === "object" ? arr[i] : null;
      if (!item) continue;
      var codigo = normalizeCodigo(item.codigo);
      if (!codigo || seen[codigo]) continue;
      seen[codigo] = true;
      out.push(Object.assign({}, item, { codigo: codigo }));
    }
    return out;
  }

  function normalizeMap(src) {
    var out = {};
    var obj = src && typeof src === "object" ? src : {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = normalizeCodigo(keys[i]);
      if (k) out[k] = obj[keys[i]];
    }
    return out;
  }

  function nomeRegistro(co) {
    return REGISTRO_NOMES[str(co)] || "";
  }

  function aceitaRegistro(registros, alvo) {
    if (!Array.isArray(registros)) return false;
    return registros.indexOf(str(alvo)) !== -1;
  }

  /**
   * @param {{codigo: string, registros?: string[], exigeHabilitacao?: boolean,
   *          tpCompatibilidade?: string, ehPrincipal?: boolean,
   *          relacao?: string, motivoRelacao?: string}} input
   */
  function classificarItem(input) {
    input = input || {};
    var registros = Array.isArray(input.registros) ? input.registros : null;
    var relacao = input.relacao != null ? str(input.relacao) : "";
    var base = {
      codigo: str(input.codigo),
      registros: registros || [],
      exigeHabilitacao: input.exigeHabilitacao === true,
      tpCompatibilidade:
        input.tpCompatibilidade != null ? str(input.tpCompatibilidade) : null,
      relacao: relacao || null,
      motivoRelacao: str(input.motivoRelacao),
    };

    if (!registros || !registros.length) {
      base.classe = CLASSE_REGISTRO_DESCONHECIDO;
      base.motivo =
        "Sem registro conhecido para este código na competência — ausência de dado não é permissão de cobrança.";
      return base;
    }

    if (input.ehPrincipal) {
      if (aceitaRegistro(registros, AIH_PRINCIPAL)) {
        base.classe = CLASSE_PRINCIPAL;
        base.motivo = "Aceita registro 03 (AIH Proc. Principal).";
      } else {
        base.classe = CLASSE_INVALIDO_COMO_PRINCIPAL;
        base.motivo =
          "Não aceita registro 03 — não pode ser o procedimento principal da AIH.";
      }
      return base;
    }

    var REL_SEQ = (compat.RELACAO && compat.RELACAO.SEQUENCIAL) || "compativel_sequencial";
    if (relacao === REL_SEQ && aceitaRegistro(registros, AIH_PRINCIPAL)) {
      base.classe = CLASSE_COMPATIVEL_SEQUENCIAL;
      base.motivo =
        str(input.motivoRelacao) ||
        "Compatível em sequência com o principal (TP=5) — pode partilhar a mesma AIH.";
      return base;
    }

    if (aceitaRegistro(registros, AIH_SECUNDARIO)) {
      base.classe = CLASSE_FATURAVEL_SECUNDARIO;
      base.motivo = "Aceita registro 05 (AIH Proc. Secundário).";
    } else if (aceitaRegistro(registros, AIH_ESPECIAL)) {
      base.classe = CLASSE_FATURAVEL_ESPECIAL;
      base.motivo = "Aceita registro 04 (AIH Proc. Especial).";
    } else if (aceitaRegistro(registros, AIH_PRINCIPAL)) {
      var REL_EXCL_ITEM = (compat.RELACAO && compat.RELACAO.EXCLUDENTE) || "excludente";
      if (relacao === REL_EXCL_ITEM) {
        base.classe = CLASSE_NAO_FATURAVEL_AIH;
        base.motivo =
          str(input.motivoRelacao) ||
          "O SIGTAP não lista este par com o principal — não pode constar na mesma AIH.";
      } else {
        base.classe = CLASSE_EXIGE_AIH_PROPRIA;
        base.motivo =
          "Só aceita registro 03 (principal) — exige AIH própria, não entra como secundário.";
      }
    } else {
      base.classe = CLASSE_NAO_FATURAVEL_AIH;
      base.motivo =
        "Não aceita nenhum registro de AIH (" +
        registros.join(", ") +
        ") — fora do âmbito hospitalar.";
    }
    return base;
  }

  function isFaturavel(classe) {
    return FATURAVEIS.indexOf(str(classe)) !== -1;
  }

  /**
   * @param {{principal: string, itens: Array, registrosPorCodigo?: object,
   *          habilitacaoPorCodigo?: object, tpPorCodigo?: object,
   *          arestasCompatibilidade?: Array, excecoesCompatibilidade?: Array}} input
   * @returns {{principal: object, faturaveis: Array, todos: Array,
   *            compativeis: Array, sequenciais: Array, excludentes: Array}}
   */
  function classificarConjunto(input) {
    input = input || {};
    var principalCodigo = normalizeCodigo(input.principal);
    var itens = flattenItems(input.itens);
    var registrosPor = normalizeMap(input.registrosPorCodigo);
    var habilitacaoPor = normalizeMap(input.habilitacaoPorCodigo);
    var tpPor = normalizeMap(input.tpPorCodigo);
    var REL_EXCL = (compat.RELACAO && compat.RELACAO.EXCLUDENTE) || "excludente";
    var REL_COMP = (compat.RELACAO && compat.RELACAO.COMPATIVEL) || "compativel";
    var REL_SEQ = (compat.RELACAO && compat.RELACAO.SEQUENCIAL) || "compativel_sequencial";

    var anotados =
      typeof compat.anotarCompatibilidade === "function"
        ? compat.anotarCompatibilidade({
            principal: principalCodigo,
            itens: itens,
            arestas: input.arestasCompatibilidade || input.arestas,
            excepcoes: input.excecoesCompatibilidade || input.excepcoes,
          })
        : uniqueItemsByCodigo(itens);

    var todos = [];
    var principal = null;
    var faturaveis = [];
    var seen = {};

    for (var i = 0; i < anotados.length; i++) {
      var item = anotados[i] || {};
      var codigo = normalizeCodigo(item.codigo);
      if (!codigo) continue;
      if (seen[codigo]) {
        var prev = todos[seen[codigo] - 1];
        if (prev && !str(prev.trecho) && str(item.trecho)) {
          prev.trecho = str(item.trecho);
        }
        continue;
      }
      var ehPrincipal = codigo === principalCodigo && !principal;
      var tp = item.tpCompatibilidade != null ? item.tpCompatibilidade : tpPor[codigo];
      var classificado = classificarItem({
        codigo: codigo,
        registros: registrosPor[codigo],
        exigeHabilitacao: habilitacaoPor[codigo] === true,
        tpCompatibilidade: tp,
        ehPrincipal: ehPrincipal,
        relacao: item.relacao,
        motivoRelacao: item.motivoRelacao,
      });
      classificado.trecho = str(item.trecho);
      classificado.nome = str(item.nome);
      if (typeof item.confianca === "number" && isFinite(item.confianca)) {
        classificado.confianca = item.confianca;
      }
      if (item.relacao && !classificado.relacao) classificado.relacao = item.relacao;
      if (item.motivoRelacao && !classificado.motivoRelacao) {
        classificado.motivoRelacao = str(item.motivoRelacao);
      }
      if (classificado.relacao === REL_EXCL && classificado.motivoRelacao) {
        classificado.motivo =
          str(classificado.motivo) +
          (classificado.motivo ? " " : "") +
          classificado.motivoRelacao;
      }
      todos.push(classificado);
      seen[codigo] = todos.length;
      if (ehPrincipal) {
        principal = classificado;
      } else if (classificado.relacao !== REL_EXCL && isFaturavel(classificado.classe)) {
        faturaveis.push(classificado);
      }
    }

    var todosUnicos = uniqueItemsByCodigo(todos);
    var principalOut = null;
    if (principalCodigo) {
      for (var t = 0; t < todosUnicos.length; t++) {
        if (todosUnicos[t].codigo === principalCodigo) {
          principalOut = todosUnicos[t];
          break;
        }
      }
    }
    var compativeis = [];
    var sequenciais = [];
    var excludentes = [];
    for (var b = 0; b < todosUnicos.length; b++) {
      var row = todosUnicos[b];
      if (principalOut && row.codigo === principalOut.codigo) continue;
      if (row.relacao === REL_COMP) compativeis.push(row);
      else if (row.relacao === REL_SEQ) sequenciais.push(row);
      else if (row.relacao === REL_EXCL) excludentes.push(row);
    }
    return {
      principal: principalOut,
      faturaveis: uniqueItemsByCodigo(faturaveis),
      todos: todosUnicos,
      compativeis: uniqueItemsByCodigo(compativeis),
      sequenciais: uniqueItemsByCodigo(sequenciais),
      excludentes: uniqueItemsByCodigo(excludentes),
    };
  }

  return {
    AIH_PRINCIPAL: AIH_PRINCIPAL,
    AIH_ESPECIAL: AIH_ESPECIAL,
    AIH_SECUNDARIO: AIH_SECUNDARIO,
    REGISTRO_NOMES: REGISTRO_NOMES,
    TP_COMPATIBILIDADE_SEMANTICA_CONFIRMADA: TP_COMPATIBILIDADE_SEMANTICA_CONFIRMADA,
    CLASSE_PRINCIPAL: CLASSE_PRINCIPAL,
    CLASSE_FATURAVEL_SECUNDARIO: CLASSE_FATURAVEL_SECUNDARIO,
    CLASSE_FATURAVEL_ESPECIAL: CLASSE_FATURAVEL_ESPECIAL,
    CLASSE_EXIGE_AIH_PROPRIA: CLASSE_EXIGE_AIH_PROPRIA,
    CLASSE_NAO_FATURAVEL_AIH: CLASSE_NAO_FATURAVEL_AIH,
    CLASSE_INVALIDO_COMO_PRINCIPAL: CLASSE_INVALIDO_COMO_PRINCIPAL,
    CLASSE_REGISTRO_DESCONHECIDO: CLASSE_REGISTRO_DESCONHECIDO,
    CLASSE_COMPATIVEL_SEQUENCIAL: CLASSE_COMPATIVEL_SEQUENCIAL,
    anotarCompatibilidade: compat.anotarCompatibilidade,
    contarRelacoes: compat.contarRelacoes,
    relacaoDe: compat.relacaoDe,
    RELACAO: compat.RELACAO,
    TP_COMPAT: compat.TP_COMPAT,
    nomeRegistro: nomeRegistro,
    aceitaRegistro: aceitaRegistro,
    classificarItem: classificarItem,
    isFaturavel: isFaturavel,
    classificarConjunto: classificarConjunto,
    normalizeCodigo: normalizeCodigo,
    uniqueItemsByCodigo: uniqueItemsByCodigo,
  };
});
