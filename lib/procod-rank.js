/**
 * FEAT-157 — ordenação da proposta (Fase 5).
 *
 * O faturista lê de cima para baixo e decide sob pressão, então os faturáveis
 * saem por valor decrescente: o que mais muda a conta aparece primeiro.
 *
 * O rank ordena, nunca filtra. `todos` continua com tudo — inclusive o que não
 * é cobrável — porque é essa lista que sustenta a defesa de glosa.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodRank = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /** SH + SA + SP, em centavos. Parcela ausente conta zero. */
  function valorTotalCentavos(valores) {
    if (!valores || typeof valores !== "object") return 0;
    return (
      num(valores.valor_sh_centavos) +
      num(valores.valor_sa_centavos) +
      num(valores.valor_sp_centavos)
    );
  }

  /**
   * Ordena por valor decrescente; empate (ou ausência de tabela) cai em ordem
   * estável por código, para a saída ser reproduzível entre execuções.
   */
  function ordenarPorValor(itens, valoresPorCodigo) {
    var lista = Array.isArray(itens) ? itens : [];
    var tabela = valoresPorCodigo || {};
    return lista
      .map(function (item, idx) {
        var codigo = String((item && item.codigo) || "");
        return {
          item: item,
          idx: idx,
          codigo: codigo,
          valor: valorTotalCentavos(tabela[codigo]),
        };
      })
      .sort(function (a, b) {
        if (b.valor !== a.valor) return b.valor - a.valor;
        if (a.codigo !== b.codigo) return a.codigo < b.codigo ? -1 : 1;
        return a.idx - b.idx;
      })
      .map(function (x) {
        return Object.assign({}, x.item, { valorCentavos: x.valor });
      });
  }

  /**
   * @param {{principal: object|null, faturaveis: Array, todos: Array}} proposta
   * @param {{valoresPorCodigo?: object}} [opts]
   */
  function rankProposta(proposta, opts) {
    proposta = proposta || {};
    opts = opts || {};
    var tabela = opts.valoresPorCodigo || {};

    var faturaveis = ordenarPorValor(proposta.faturaveis, tabela);

    var total = 0;
    for (var i = 0; i < faturaveis.length; i++) total += faturaveis[i].valorCentavos;

    var principal = null;
    if (proposta.principal) {
      principal = Object.assign({}, proposta.principal, {
        valorCentavos: valorTotalCentavos(tabela[String(proposta.principal.codigo || "")]),
      });
    }

    // `todos` é a prova documental: anota valor, mas não reordena —
    // a ordem ali é a da leitura do laudo, que é como o auditor confere.
    var todos = uniqueByCodigo(
      (Array.isArray(proposta.todos) ? proposta.todos : []).map(function (item) {
        return Object.assign({}, item, {
          valorCentavos: valorTotalCentavos(tabela[String((item && item.codigo) || "")]),
        });
      })
    );

    function anotarBalde(lista) {
      return uniqueByCodigo(
        (Array.isArray(lista) ? lista : []).map(function (item) {
          return Object.assign({}, item, {
            valorCentavos: valorTotalCentavos(
              tabela[String((item && item.codigo) || "")]
            ),
          });
        })
      );
    }

    return {
      principal: principal,
      faturaveis: uniqueByCodigo(faturaveis),
      todos: todos,
      compativeis: anotarBalde(proposta.compativeis),
      sequenciais: anotarBalde(proposta.sequenciais),
      excludentes: anotarBalde(proposta.excludentes),
      totalIncrementalCentavos: total,
    };
  }

  function uniqueByCodigo(lista) {
    var seen = {};
    var out = [];
    var arr = Array.isArray(lista) ? lista : [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i] && typeof arr[i] === "object" ? arr[i] : null;
      if (!item) continue;
      var digits = String(item.codigo || "").replace(/\D/g, "");
      var codigo = digits.length >= 10 ? digits.slice(0, 10) : String(item.codigo || "").trim();
      if (!codigo || seen[codigo]) continue;
      seen[codigo] = true;
      out.push(Object.assign({}, item, { codigo: codigo }));
    }
    return out;
  }

  return {
    valorTotalCentavos: valorTotalCentavos,
    ordenarPorValor: ordenarPorValor,
    rankProposta: rankProposta,
  };
});
