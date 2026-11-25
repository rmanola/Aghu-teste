/**
 * FEAT-157 — mapeia registros crus do SIGTAP para as linhas das tabelas.
 *
 * Fica em lib/ e não no script porque é regra de negócio: conversão de tipo,
 * tratamento de sentinela e validação de coerência da competência. Script é
 * I/O; isto é testável.
 *
 * Regra de conversão: campo numérico vazio ou só espaços vira null, nunca 0 —
 * «não informado» e «zero» são coisas diferentes numa tabela de faturamento.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuSigtapToRows = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function txt(v) {
    var s = str(v).trim();
    return s === "" ? null : s;
  }

  /** Numérico do SIGTAP: vazio → null; zero-padded → inteiro. */
  function num(v) {
    var s = str(v).trim();
    if (s === "") return null;
    if (!/^\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  /**
   * Garante que o arquivo é mesmo da competência pedida. O DT_COMPETENCIA vem
   * dentro de cada registro, então importar 202607 a partir do pacote de 202606
   * é um erro detectável — e detectá-lo aqui evita um catálogo silenciosamente
   * misturado, que corromperia todos os evals depois.
   */
  function assertCompetencia(rows, competencia, arquivo) {
    var esperado = str(competencia);
    for (var i = 0; i < rows.length; i++) {
      var dt = str(rows[i].DT_COMPETENCIA).trim();
      if (dt && dt !== esperado) {
        throw new Error(
          "Competência divergente em " +
            str(arquivo) +
            ", linha " +
            (i + 1) +
            ": arquivo diz " +
            dt +
            ", importação pediu " +
            esperado +
            "."
        );
      }
    }
    return true;
  }

  function toProcedimentoRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo: str(r.CO_PROCEDIMENTO).trim(),
        nome: str(r.NO_PROCEDIMENTO).trim(),
        complexidade: txt(r.TP_COMPLEXIDADE),
        sexo: txt(r.TP_SEXO),
        vl_idade_minima: num(r.VL_IDADE_MINIMA),
        vl_idade_maxima: num(r.VL_IDADE_MAXIMA),
        qt_maxima_execucao: num(r.QT_MAXIMA_EXECUCAO),
        qt_dias_permanencia: num(r.QT_DIAS_PERMANENCIA),
        valor_sh_centavos: num(r.VL_SH),
        valor_sa_centavos: num(r.VL_SA),
        valor_sp_centavos: num(r.VL_SP),
        co_financiamento: txt(r.CO_FINANCIAMENTO),
        descricao: null,
      });
    }
    return out;
  }

  function toCompatibilidadeRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo_principal: str(r.CO_PROCEDIMENTO_PRINCIPAL).trim(),
        registro_principal: str(r.CO_REGISTRO_PRINCIPAL).trim(),
        codigo_compativel: str(r.CO_PROCEDIMENTO_COMPATIVEL).trim(),
        registro_compativel: str(r.CO_REGISTRO_COMPATIVEL).trim(),
        tp_compatibilidade: str(r.TP_COMPATIBILIDADE).trim(),
        qt_permitida: num(r.QT_PERMITIDA),
      });
    }
    return out;
  }

  function toCidRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo: str(r.CO_PROCEDIMENTO).trim(),
        cid: str(r.CO_CID).trim(),
        principal: str(r.ST_PRINCIPAL).trim().toUpperCase() === "S",
      });
    }
    return out;
  }

  function toHabilitacaoRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo: str(r.CO_PROCEDIMENTO).trim(),
        co_habilitacao: str(r.CO_HABILITACAO).trim(),
        nu_grupo_habilitacao: txt(r.NU_GRUPO_HABILITACAO),
      });
    }
    return out;
  }

  function toRegistroRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({
        competencia: competencia,
        co_registro: str(rows[i].CO_REGISTRO).trim(),
        no_registro: str(rows[i].NO_REGISTRO).trim(),
      });
    }
    return out;
  }

  function toProcedimentoRegistroRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({
        competencia: competencia,
        codigo: str(rows[i].CO_PROCEDIMENTO).trim(),
        co_registro: str(rows[i].CO_REGISTRO).trim(),
      });
    }
    return out;
  }

  /**
   * Excepções de compatibilidade (rl_excecao_compatibilidade).
   * Sobrepõem o par genérico quando o procedimento de restrição está presente.
   */
  /** DS oficial (tb_descricao.txt) — dado público DATASUS, não PHI. */
  function toDescricaoRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo: str(r.CO_PROCEDIMENTO).trim(),
        descricao: str(r.DS_PROCEDIMENTO).trim(),
      });
    }
    return out;
  }

  function mergeDescricaoIntoProcedimentos(procedimentoRows, descricaoRows) {
    var map = {};
    var list = Array.isArray(descricaoRows) ? descricaoRows : [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i] || {};
      if (d.codigo) map[d.codigo] = str(d.descricao);
    }
    var procs = Array.isArray(procedimentoRows) ? procedimentoRows : [];
    for (var j = 0; j < procs.length; j++) {
      var codigo = str(procs[j] && procs[j].codigo);
      if (codigo && map[codigo]) procs[j].descricao = map[codigo];
    }
    return procs;
  }

  function toExcecaoCompatibilidadeRows(rows, competencia) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        competencia: competencia,
        codigo_restricao: str(r.CO_PROCEDIMENTO_RESTRICAO).trim(),
        codigo_principal: str(r.CO_PROCEDIMENTO_PRINCIPAL).trim(),
        registro_principal: str(r.CO_REGISTRO_PRINCIPAL).trim(),
        codigo_compativel: str(r.CO_PROCEDIMENTO_COMPATIVEL).trim(),
        registro_compativel: str(r.CO_REGISTRO_COMPATIVEL).trim(),
        tp_compatibilidade: str(r.TP_COMPATIBILIDADE).trim(),
      });
    }
    return out;
  }

  /** Índice códigos → registros aceites, que é o que a classificação consome. */
  /**
   * Postgres recusa INSERT … ON CONFLICT quando o mesmo lote traz a PK duas vezes
   * («cannot affect row a second time»). O pacote DATASUS pode repetir a chave
   * (ex.: rl_procedimento_habilitacao). Última ocorrência vence.
   */
  function dedupeRowsByKeys(rows, onConflict) {
    var keys = String(onConflict || "")
      .split(",")
      .map(function (k) {
        return k.trim();
      })
      .filter(Boolean);
    if (!keys.length || !rows || !rows.length) return rows || [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var parts = [];
      for (var k = 0; k < keys.length; k++) {
        parts.push(String(row[keys[k]] == null ? "" : row[keys[k]]));
      }
      var id = parts.join("\u0001");
      if (Object.prototype.hasOwnProperty.call(seen, id)) {
        out[seen[id]] = row;
      } else {
        seen[id] = out.length;
        out.push(row);
      }
    }
    return out;
  }

  function buildRegistrosPorCodigo(procedimentoRegistroRows) {
    var map = {};
    for (var i = 0; i < procedimentoRegistroRows.length; i++) {
      var r = procedimentoRegistroRows[i];
      if (!map[r.codigo]) map[r.codigo] = [];
      if (map[r.codigo].indexOf(r.co_registro) === -1) {
        map[r.codigo].push(r.co_registro);
      }
    }
    return map;
  }

  function buildArestasPorPrincipal(compatibilidadeRows) {
    var map = {};
    var list = Array.isArray(compatibilidadeRows) ? compatibilidadeRows : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      var codigo = str(r.codigo_principal).trim();
      if (!codigo) continue;
      if (!map[codigo]) map[codigo] = [];
      map[codigo].push(r);
    }
    return map;
  }

  return {
    txt: txt,
    num: num,
    assertCompetencia: assertCompetencia,
    toProcedimentoRows: toProcedimentoRows,
    toCompatibilidadeRows: toCompatibilidadeRows,
    toCidRows: toCidRows,
    toHabilitacaoRows: toHabilitacaoRows,
    toRegistroRows: toRegistroRows,
    toProcedimentoRegistroRows: toProcedimentoRegistroRows,
    toDescricaoRows: toDescricaoRows,
    mergeDescricaoIntoProcedimentos: mergeDescricaoIntoProcedimentos,
    toExcecaoCompatibilidadeRows: toExcecaoCompatibilidadeRows,
    buildRegistrosPorCodigo: buildRegistrosPorCodigo,
    buildArestasPorPrincipal: buildArestasPorPrincipal,
    dedupeRowsByKeys: dedupeRowsByKeys,
  };
});
