/**
 * FEAT-157 — adapter de catálogo e texto cirúrgico (Fase 7).
 *
 * Extrai a montagem que o CLI fazia inline: competência a partir da data,
 * índice BM25 + mapas de regras, e o texto de UMA cirurgia (nome como hint
 * + achados + descrição). Códigos SIGTAP no `nome` são stripped (PROCOD-AC-115).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./sigtap-import.js")
      : root.AghuSigtapImport,
    typeof require !== "undefined"
      ? require("./procod-resolve.js")
      : root.AghuProcodResolve,
    typeof require !== "undefined"
      ? require("./sigtap-to-rows.js")
      : root.AghuSigtapToRows,
    typeof require !== "undefined"
      ? require("./date-br.js")
      : root.AghuDateBr,
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodCatalog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  sigtap,
  resolve,
  toRows,
  dateBr,
  codes
) {
  "use strict";

  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function makeCatalogSet(codigos) {
    var map = {};
    var list = Array.isArray(codigos) ? codigos : [];
    for (var i = 0; i < list.length; i++) {
      var c = str(list[i]).trim();
      if (c) map[c] = true;
    }
    return {
      has: function (codigo) {
        return !!map[str(codigo)];
      },
    };
  }

  /**
   * Data da cirurgia (ISO ou dd/mm/aaaa) → competência AAAAMM.
   */
  function competenciaFromData(data) {
    var s = str(data).trim();
    if (!s) {
      var err = new Error("Data da cirurgia ausente — competência não resolvida.");
      err.code = codes.COMPETENCIA_MISSING;
      throw err;
    }
    var iso = s;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      iso = dateBr && dateBr.brToIso ? dateBr.brToIso(s) : "";
    }
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      var err2 = new Error(
        "Data inválida para competência: esperado AAAA-MM-DD ou dd/mm/aaaa."
      );
      err2.code = codes.COMPETENCIA_MISSING;
      throw err2;
    }
    return sigtap.resolveCompetenciaParaData(iso);
  }

  /**
   * Tabela vigente: exact match, senão a maior competência AAAAMM ≤ pedida.
   * Sem fallback para o futuro. Lista vazia → null.
   */
  function resolveCompetenciaVigente(pedida, disponiveis) {
    var want = str(pedida).trim();
    if (!/^\d{6}$/.test(want)) return null;
    var list = Array.isArray(disponiveis) ? disponiveis : [];
    var best = "";
    for (var i = 0; i < list.length; i++) {
      var c = str(list[i]).trim();
      if (!/^\d{6}$/.test(c)) continue;
      if (c === want) return c;
      if (c < want && c > best) best = c;
    }
    return best || null;
  }

  /**
   * Remove códigos SIGTAP (10 dígitos) do nome — o extract nunca deve vê-los
   * para copiar (PROCOD-AC-115). O restante fica como hint CIRURGIA:.
   */
  function stripSigtapCodes(nome) {
    return str(nome)
      .replace(/\b\d{10}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Texto que o motor lê: hint CIRURGIA: (sem código SIGTAP) + achados + descrição.
   */
  function buildCirurgiaText(cirurgia) {
    var c = cirurgia && typeof cirurgia === "object" ? cirurgia : {};
    var nome = stripSigtapCodes(c.nome);
    var achados = str(c.achadosOperatorios).trim();
    var descricao = str(c.descricao).trim();
    var parts = [];
    if (nome) parts.push("CIRURGIA: " + nome);
    if (achados) parts.push("ACHADOS OPERATÓRIOS:\n" + achados);
    if (descricao) parts.push("DESCRIÇÃO:\n" + descricao);
    return parts.join("\n\n");
  }

  function hasUsefulCirurgiaText(cirurgia) {
    return buildCirurgiaText(cirurgia).length > 0;
  }

  function resolvePassometroSnap(passometro) {
    if (!passometro || typeof passometro !== "object") return null;
    var raw = passometro;
    if (raw.version === 2 && Array.isArray(raw.registros)) {
      if (!raw.registros.length) return null;
      var best = raw.registros[0] && raw.registros[0].snap ? raw.registros[0].snap : null;
      var bestTs = raw.registros[0] && raw.registros[0].atualizadoEm
        ? raw.registros[0].atualizadoEm
        : 0;
      for (var i = 1; i < raw.registros.length; i++) {
        var ts = raw.registros[i] && raw.registros[i].atualizadoEm
          ? raw.registros[i].atualizadoEm
          : 0;
        if (ts >= bestTs) {
          bestTs = ts;
          best = raw.registros[i] && raw.registros[i].snap
            ? raw.registros[i].snap
            : best;
        }
      }
      return best;
    }
    if (raw.header || raw.entries) return raw;
    if (raw.snap && typeof raw.snap === "object") return raw.snap;
    return raw;
  }

  function listCirurgias(passometro) {
    var snap = resolvePassometroSnap(passometro);
    if (!snap || typeof snap !== "object") return [];
    var header = snap.header;
    if (header && Array.isArray(header.cirurgias)) return header.cirurgias;
    if (Array.isArray(snap.cirurgias)) return snap.cirurgias;
    return [];
  }

  function findCirurgia(passometro, cirurgiaId) {
    var id = str(cirurgiaId).trim();
    if (!id) return null;
    var list = listCirurgias(passometro);
    for (var i = 0; i < list.length; i++) {
      if (str(list[i] && list[i].id).trim() === id) return list[i];
    }
    return null;
  }

  function validateRunRequest(body) {
    body = body || {};
    var recordClientId = str(body.record_client_id).trim();
    var cirurgiaId = str(body.cirurgia_id).trim();
    if (!UUID_RE.test(recordClientId)) {
      return {
        ok: false,
        status: 422,
        error: "record_client_id_invalid",
      };
    }
    if (!cirurgiaId) {
      return { ok: false, status: 422, error: "cirurgia_id_required" };
    }
    return {
      ok: true,
      record_client_id: recordClientId,
      cirurgia_id: cirurgiaId,
      principal: str(body.principal).trim(),
    };
  }

  /**
   * Painel PROCOD só na aba Cirurgia (descrição visível).
   * Header passa showDescricao=false — nunca mostra o painel.
   */
  function shouldEnableProcodUi(opts) {
    opts = opts || {};
    if (!opts.enableProcod) return false;
    if (opts.showDescricao === false) return false;
    return true;
  }

  /**
   * Códigos em divergência sem aceite nem rejeição explícitos.
   * Commit no servidor recusa se a lista não for vazia.
   */
  function unresolvedDivergences(divergences, aceites, rejeitados) {
    var decided = {};
    var a = Array.isArray(aceites) ? aceites : [];
    var r = Array.isArray(rejeitados) ? rejeitados : [];
    var i;
    for (i = 0; i < a.length; i++) decided[str(a[i]).trim()] = true;
    for (i = 0; i < r.length; i++) decided[str(r[i]).trim()] = true;
    var out = [];
    var list = Array.isArray(divergences) ? divergences : [];
    for (i = 0; i < list.length; i++) {
      var codigo = str(list[i] && list[i].codigo).trim();
      if (codigo && !decided[codigo]) out.push(codigo);
    }
    return out;
  }

  /**
   * @param {{codigo: string, nome: string, valor_sh_centavos?: number,
   *          valor_sa_centavos?: number, valor_sp_centavos?: number}[]} procedimentos
   * @param {{registrosPorCodigo?: object, habilitacaoPorCodigo?: object,
   *          compatibilidadeRows?: Array, excecaoRows?: Array,
   *          arestasPorPrincipal?: object, excecoesCompatibilidade?: Array}} relacoes
   */
  function buildCatalogFromRows(procedimentos, relacoes) {
    relacoes = relacoes || {};
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    var filtrados = [];
    var nomePorCodigo = {};
    var descricaoPorCodigo = {};
    var valoresPorCodigo = {};
    var codigos = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var codigo = str(p.codigo).trim();
      if (!codigo) continue;
      if (!resolve.isGrupoCirurgico(codigo)) continue;
      filtrados.push(p);
      codigos.push(codigo);
      nomePorCodigo[codigo] = str(p.nome);
      descricaoPorCodigo[codigo] = str(p.descricao);
      valoresPorCodigo[codigo] = {
        valor_sh_centavos: Number(p.valor_sh_centavos) || 0,
        valor_sa_centavos: Number(p.valor_sa_centavos) || 0,
        valor_sp_centavos: Number(p.valor_sp_centavos) || 0,
      };
    }
    var registrosPorCodigo = relacoes.registrosPorCodigo || {};
    if (Array.isArray(relacoes.procedimentoRegistroRows) && toRows.buildRegistrosPorCodigo) {
      registrosPorCodigo = toRows.buildRegistrosPorCodigo(
        relacoes.procedimentoRegistroRows
      );
    }
    var arestasPorPrincipal = relacoes.arestasPorPrincipal || {};
    var arestasCompatibilidade = Array.isArray(relacoes.compatibilidadeRows)
      ? relacoes.compatibilidadeRows
      : Array.isArray(relacoes.arestasCompatibilidade)
        ? relacoes.arestasCompatibilidade
        : [];
    if (Array.isArray(relacoes.compatibilidadeRows) && toRows.buildArestasPorPrincipal) {
      arestasPorPrincipal = toRows.buildArestasPorPrincipal(
        relacoes.compatibilidadeRows
      );
    }
    if (!arestasCompatibilidade.length && arestasPorPrincipal) {
      var edgeKeys = Object.keys(arestasPorPrincipal);
      for (var e = 0; e < edgeKeys.length; e++) {
        var edges = arestasPorPrincipal[edgeKeys[e]];
        if (!Array.isArray(edges)) continue;
        for (var j = 0; j < edges.length; j++) arestasCompatibilidade.push(edges[j]);
      }
    }
    var excecoesCompatibilidade = Array.isArray(relacoes.excecaoRows)
      ? relacoes.excecaoRows
      : Array.isArray(relacoes.excecoesCompatibilidade)
        ? relacoes.excecoesCompatibilidade
        : [];
    return {
      procedimentos: filtrados,
      index: resolve.buildIndex(filtrados),
      catalogo: makeCatalogSet(codigos),
      nomePorCodigo: nomePorCodigo,
      descricaoPorCodigo: descricaoPorCodigo,
      valoresPorCodigo: valoresPorCodigo,
      registrosPorCodigo: registrosPorCodigo,
      habilitacaoPorCodigo: relacoes.habilitacaoPorCodigo || {},
      arestasPorPrincipal: arestasPorPrincipal,
      arestasCompatibilidade: arestasCompatibilidade,
      excecoesCompatibilidade: excecoesCompatibilidade,
    };
  }

  return {
    competenciaFromData: competenciaFromData,
    resolveCompetenciaVigente: resolveCompetenciaVigente,
    stripSigtapCodes: stripSigtapCodes,
    buildCirurgiaText: buildCirurgiaText,
    hasUsefulCirurgiaText: hasUsefulCirurgiaText,
    resolvePassometroSnap: resolvePassometroSnap,
    listCirurgias: listCirurgias,
    findCirurgia: findCirurgia,
    validateRunRequest: validateRunRequest,
    shouldEnableProcodUi: shouldEnableProcodUi,
    unresolvedDivergences: unresolvedDivergences,
    buildCatalogFromRows: buildCatalogFromRows,
    makeCatalogSet: makeCatalogSet,
  };
});
