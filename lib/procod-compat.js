/**
 * FEAT-157 — lookup oficial de compatibilidade SIGTAP.
 *
 * Classifica códigos JÁ identificados na descrição contra o principal.
 * Não expande a lista fechada (não é GAG). Semântica de TP_COMPATIBILIDADE
 * 1..5: wiki SIGTAP + SIASUS/e-cidade.
 *
 *   1 = compatível
 *   2 = excludente
 *   3 = concomitante (APAC — fora dos baldes da UI)
 *   4 = obrigatória (OPME — fora dos baldes da UI)
 *   5 = compatível sequencial
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodCompat = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TP_COMPAT = Object.freeze({
    COMPATIVEL: "1",
    EXCLUDENTE: "2",
    CONCOMITANTE: "3",
    OBRIGATORIA: "4",
    SEQUENCIAL: "5",
  });

  var RELACAO = Object.freeze({
    COMPATIVEL: "compativel",
    EXCLUDENTE: "excludente",
    CONCOMITANTE: "concomitante",
    OBRIGATORIA: "obrigatoria",
    SEQUENCIAL: "compativel_sequencial",
    SEM_RELACAO: "sem_relacao_explicita",
    DESCONHECIDO: "desconhecido",
  });

  function str(v) {
    return v == null ? "" : String(v);
  }

  function normalizeCodigo(raw) {
    var digits = str(raw).replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(0, 10);
    return str(raw).trim();
  }

  function pairKey(a, b) {
    return normalizeCodigo(a) + "\u0001" + normalizeCodigo(b);
  }

  function relacaoDe(tp) {
    var t = str(tp).trim();
    if (t === TP_COMPAT.COMPATIVEL) return RELACAO.COMPATIVEL;
    if (t === TP_COMPAT.EXCLUDENTE) return RELACAO.EXCLUDENTE;
    if (t === TP_COMPAT.CONCOMITANTE) return RELACAO.CONCOMITANTE;
    if (t === TP_COMPAT.OBRIGATORIA) return RELACAO.OBRIGATORIA;
    if (t === TP_COMPAT.SEQUENCIAL) return RELACAO.SEQUENCIAL;
    if (!t) return RELACAO.SEM_RELACAO;
    return RELACAO.DESCONHECIDO;
  }

  function motivoRelacao(relacao, tp) {
    if (relacao === RELACAO.COMPATIVEL) {
      return "Compatível com o principal (TP=1) — pode acompanhar o mesmo acto/AIH.";
    }
    if (relacao === RELACAO.EXCLUDENTE) {
      if (!str(tp).trim()) {
        return "O SIGTAP não lista este par com o principal — não pode constar na mesma AIH.";
      }
      return "Excludente com o principal (TP=2) — não pode constar na mesma AIH.";
    }
    if (relacao === RELACAO.SEQUENCIAL) {
      return "Compatível em sequência com o principal (TP=5) — dois principais de subgrupos distintos podem partilhar a AIH.";
    }
    if (relacao === RELACAO.CONCOMITANTE) {
      return "Concomitante (TP=3) — fora do âmbito AIH desta proposta.";
    }
    if (relacao === RELACAO.OBRIGATORIA) {
      return "Compatibilidade obrigatória (TP=4) — tipicamente OPME.";
    }
    if (relacao === RELACAO.DESCONHECIDO) {
      return "Tipo de compatibilidade não reconhecido — não se inventa regra de glosa.";
    }
    return "O SIGTAP não lista este par com o principal — não pode constar na mesma AIH.";
  }

  function flattenArestas(arestas) {
    if (Array.isArray(arestas)) return arestas;
    if (!arestas || typeof arestas !== "object") return [];
    var out = [];
    var keys = Object.keys(arestas);
    for (var i = 0; i < keys.length; i++) {
      var list = arestas[keys[i]];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) out.push(list[j]);
    }
    return out;
  }

  /**
   * @param {{principal: string, itens: Array, arestas?: Array|object,
   *          excepcoes?: Array, excecoesCompatibilidade?: Array,
   *          arestasCompatibilidade?: Array|object}} input
   * @returns {Array} itens anotados com relacao / tpCompatibilidade / motivoRelacao
   */
  function anotarCompatibilidade(input) {
    input = input || {};
    var principal = normalizeCodigo(input.principal);
    var src = Array.isArray(input.itens) ? input.itens : [];
    var arestas = flattenArestas(
      input.arestas || input.arestasCompatibilidade
    );
    var excepcoes = Array.isArray(input.excepcoes)
      ? input.excepcoes
      : Array.isArray(input.excecoesCompatibilidade)
        ? input.excecoesCompatibilidade
        : [];

    var confirmed = {};
    if (principal) confirmed[principal] = true;
    var unique = [];
    var seen = {};
    for (var i = 0; i < src.length; i++) {
      var item = src[i] && typeof src[i] === "object" ? src[i] : null;
      if (!item) continue;
      var codigo = normalizeCodigo(item.codigo);
      if (!codigo) continue;
      confirmed[codigo] = true;
      if (seen[codigo]) continue;
      seen[codigo] = true;
      unique.push(Object.assign({}, item, { codigo: codigo }));
    }

    var exMap = {};
    for (var e = 0; e < excepcoes.length; e++) {
      var ex = excepcoes[e] || {};
      var restricao = normalizeCodigo(ex.codigo_restricao);
      if (!restricao || !confirmed[restricao]) continue;
      var exFrom = normalizeCodigo(ex.codigo_principal);
      var exTo = normalizeCodigo(ex.codigo_compativel);
      if (!exFrom || !exTo) continue;
      exMap[pairKey(exFrom, exTo)] = str(ex.tp_compatibilidade || ex.tpCompatibilidade).trim();
    }

    var dirMap = {};
    var reverseExcl = {};
    for (var a = 0; a < arestas.length; a++) {
      var edge = arestas[a] || {};
      var from = normalizeCodigo(edge.codigo_principal);
      var to = normalizeCodigo(edge.codigo_compativel);
      var tp = str(edge.tp_compatibilidade || edge.tpCompatibilidade).trim();
      if (!from || !to || !tp) continue;
      var key = pairKey(from, to);
      if (!dirMap[key] || tp === TP_COMPAT.EXCLUDENTE) dirMap[key] = tp;
      if (tp === TP_COMPAT.EXCLUDENTE && to === principal) {
        reverseExcl[from] = tp;
      }
    }

    var out = [];
    for (var u = 0; u < unique.length; u++) {
      var row = unique[u];
      if (row.codigo === principal) {
        row.relacao = null;
        row.tpCompatibilidade = null;
        row.motivoRelacao = "";
        out.push(row);
        continue;
      }
      var pk = pairKey(principal, row.codigo);
      var chosen = Object.prototype.hasOwnProperty.call(exMap, pk)
        ? exMap[pk]
        : dirMap[pk] || reverseExcl[row.codigo] || "";
      var relacao = chosen ? relacaoDe(chosen) : RELACAO.EXCLUDENTE;
      row.tpCompatibilidade = chosen || null;
      row.relacao = relacao;
      row.motivoRelacao = motivoRelacao(relacao, chosen);
      out.push(row);
    }
    return out;
  }

  function contarRelacoes(itens) {
    var counts = {
      compativeis: 0,
      sequenciais: 0,
      excludentes: 0,
    };
    var list = Array.isArray(itens) ? itens : [];
    for (var i = 0; i < list.length; i++) {
      var r = str(list[i] && list[i].relacao);
      if (r === RELACAO.COMPATIVEL) counts.compativeis += 1;
      else if (r === RELACAO.SEQUENCIAL) counts.sequenciais += 1;
      else if (r === RELACAO.EXCLUDENTE) counts.excludentes += 1;
    }
    return counts;
  }

  return {
    TP_COMPAT: TP_COMPAT,
    RELACAO: RELACAO,
    TP_COMPATIBILIDADE_SEMANTICA_CONFIRMADA: true,
    normalizeCodigo: normalizeCodigo,
    relacaoDe: relacaoDe,
    motivoRelacao: motivoRelacao,
    anotarCompatibilidade: anotarCompatibilidade,
    contarRelacoes: contarRelacoes,
  };
});
