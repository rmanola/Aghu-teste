/**
 * FEAT-157 — evals Fase 3: precisão da selecção + eficácia do guardrail.
 *
 * select  — oracle offline escolhe códigos do gabarito ∩ candidatos;
 *           mede precision/recall da selecção (sem LLM).
 * guardrail — injeta citação inválida + código fantasma; portão:
 *           escapes = 0 (nenhum erro injectado sobrevive a filterItems).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-eval-recall.js")
      : root.AghuProcodEvalRecall,
    typeof require !== "undefined"
      ? require("./procod-select.js")
      : root.AghuProcodSelect,
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard,
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodEvalSelect = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  evalRecall,
  select,
  guard,
  codes
) {
  "use strict";

  var SELECT_PRECISION_THRESHOLD = 1.0;
  var GUARDRAIL_MAX_ESCAPES = 0;
  var PHANTOM_CODE = "9999999999";
  var FAKE_CITATION = "trecho fabricado que nao existe no laudo sintetico XYZ";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function catalogSet(procedimentos) {
    var set = {};
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    for (var i = 0; i < list.length; i++) {
      set[str(list[i].codigo)] = true;
    }
    return set;
  }

  function expectedMapFromCase(caso, codigos) {
    var map = {};
    var atos = Array.isArray(caso && caso.atos_esperados) ? caso.atos_esperados : [];
    var byAto = {};
    for (var a = 0; a < atos.length; a++) {
      byAto[str(atos[a].ato_id)] = atos[a];
    }
    var list = Array.isArray(codigos) ? codigos : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var atoId = str(row.ato_id);
      if (!map[atoId]) map[atoId] = [];
      var ancora = byAto[atoId];
      map[atoId].push({
        codigo: str(row.codigo),
        trecho: str(ancora && ancora.trecho_ancoragem),
      });
    }
    return map;
  }

  function scoreSelectCase(expected, selectedByAto) {
    var expectedSet = {};
    var selectedSet = {};
    var exp = Array.isArray(expected) ? expected : [];
    for (var i = 0; i < exp.length; i++) {
      expectedSet[str(exp[i].codigo)] = true;
    }
    for (var atoId in selectedByAto) {
      if (!Object.prototype.hasOwnProperty.call(selectedByAto, atoId)) continue;
      var list = selectedByAto[atoId] || [];
      for (var j = 0; j < list.length; j++) {
        selectedSet[str(list[j].codigo)] = true;
      }
    }
    var tp = 0;
    var fp = 0;
    var fn = 0;
    for (var c in expectedSet) {
      if (!Object.prototype.hasOwnProperty.call(expectedSet, c)) continue;
      if (selectedSet[c]) tp++;
      else fn++;
    }
    for (var s in selectedSet) {
      if (!Object.prototype.hasOwnProperty.call(selectedSet, s)) continue;
      if (!expectedSet[s]) fp++;
    }
    var precision = tp + fp ? tp / (tp + fp) : tp === 0 && fp === 0 ? 1 : null;
    var recall = tp + fn ? tp / (tp + fn) : null;
    return {
      tp: tp,
      fp: fp,
      fn: fn,
      precision: precision,
      recall: recall,
    };
  }

  /**
   * Offline: stub extract → resolve → oracle select (gabarito ∩ candidatos).
   */
  async function evaluateSelect(input) {
    input = input || {};
    var opts = input.opts || {};
    var threshold =
      typeof opts.threshold === "number"
        ? opts.threshold
        : SELECT_PRECISION_THRESHOLD;
    var selectedCases = evalRecall.selectGateCases(input.gabarito, opts);
    var caseResults = [];
    var tp = 0;
    var fp = 0;
    var fn = 0;
    var errors = [];
    var closedListRejects = 0;

    for (var i = 0; i < selectedCases.length; i++) {
      var sel = selectedCases[i];
      var caso = sel.case;
      var srcKey = str(caso.source_file);
      var descricao = str(
        input.sourcesByRelativePath && input.sourcesByRelativePath[srcKey]
      );
      if (!descricao) {
        errors.push({ id: caso.id, error: "Fonte em falta: " + srcKey });
        continue;
      }
      var stub = evalRecall.stubAtosFromGabarito(caso, descricao);
      if (!stub.ok) {
        errors.push({ id: caso.id, error: stub.error, invalidos: stub.invalidos });
        continue;
      }
      var resolvedByAto = evalRecall.resolveAtos(
        input.procedimentos,
        stub.atos,
        opts
      );
      var expectedByAto = expectedMapFromCase(caso, sel.codigos);
      var oracle = select.createOracleSelectFn(expectedByAto);
      var selectedByAto = {};
      var nomePorCodigo = {};
      var procs = Array.isArray(input.procedimentos) ? input.procedimentos : [];
      for (var p = 0; p < procs.length; p++) {
        nomePorCodigo[str(procs[p].codigo)] = str(procs[p].nome);
      }

      for (var a = 0; a < stub.atos.length; a++) {
        var ato = stub.atos[a];
        var cands = resolvedByAto[ato.atoId] || [];
        var candidatos = cands.map(function (codigo) {
          return { codigo: codigo, nome: nomePorCodigo[codigo] || "" };
        });
        // Injecção de alucinação no caminho do oracle: raw LLM fantasma
        // filtrado por filterClosedList antes do resultado final.
        var filtered = await select.runSelect(
          { ato: ato, descricao: descricao, candidatos: candidatos },
          { selectFn: oracle }
        );
        selectedByAto[ato.atoId] = filtered.selected;
        closedListRejects += (filtered.rejected || []).length;
      }

      // Stress: raw fora da lista tem de cair em rejected.
      var phantomProbe = select.filterClosedList(
        [{ codigo: PHANTOM_CODE, trecho: stub.atos[0] && stub.atos[0].trecho }],
        resolvedByAto[stub.atos[0] && stub.atos[0].atoId] || []
      );
      if (phantomProbe.selected.length !== 0) {
        errors.push({
          id: caso.id,
          error: "Lista fechada deixou passar código fantasma.",
        });
      }
      closedListRejects += phantomProbe.rejected.length;

      var scored = scoreSelectCase(sel.codigos, selectedByAto);
      tp += scored.tp;
      fp += scored.fp;
      fn += scored.fn;
      caseResults.push({
        id: caso.id,
        precision: scored.precision,
        recall: scored.recall,
        tp: scored.tp,
        fp: scored.fp,
        fn: scored.fn,
        selectedByAto: selectedByAto,
        resolvedByAto: resolvedByAto,
      });
    }

    var precision = tp + fp ? tp / (tp + fp) : null;
    var recall = tp + fn ? tp / (tp + fn) : null;
    var pass =
      precision != null &&
      precision >= threshold &&
      errors.length === 0 &&
      fp === 0;

    return {
      tier: "select",
      mode: "offline-oracle",
      threshold: threshold,
      pass: pass,
      precision: precision,
      recall: recall,
      tp: tp,
      fp: fp,
      fn: fn,
      closedListRejects: closedListRejects,
      casesEvaluated: caseResults.length,
      cases: caseResults,
      errors: errors,
      note:
        "Portão Fase 3 (select): oracle offline; FP=0 e precision≥threshold; phantom fora da lista rejeitado.",
    };
  }

  /**
   * Monta itens "bons" do gabarito + erros injectados (citação / fantasma).
   * Portão: nenhum injectado em `aprovados`.
   */
  function evaluateGuardrail(input) {
    input = input || {};
    var opts = input.opts || {};
    var inject = opts.injectErrors !== false;
    var maxEscapes =
      typeof opts.maxEscapes === "number" ? opts.maxEscapes : GUARDRAIL_MAX_ESCAPES;
    var selectedCases = evalRecall.selectGateCases(input.gabarito, opts);
    var cat = catalogSet(input.procedimentos);
    var catalogo = Object.keys(cat);
    var caseResults = [];
    var injected = 0;
    var escaped = 0;
    var dropped = 0;
    var errors = [];
    var escapedItems = [];

    for (var i = 0; i < selectedCases.length; i++) {
      var sel = selectedCases[i];
      var caso = sel.case;
      var srcKey = str(caso.source_file);
      var descricao = str(
        input.sourcesByRelativePath && input.sourcesByRelativePath[srcKey]
      );
      if (!descricao) {
        errors.push({ id: caso.id, error: "Fonte em falta: " + srcKey });
        continue;
      }
      var stub = evalRecall.stubAtosFromGabarito(caso, descricao);
      if (!stub.ok) {
        errors.push({ id: caso.id, error: stub.error });
        continue;
      }
      var resolvedByAto = evalRecall.resolveAtos(
        input.procedimentos,
        stub.atos,
        opts
      );
      var unionCandidates = [];
      var seenCand = {};
      for (var atoId in resolvedByAto) {
        if (!Object.prototype.hasOwnProperty.call(resolvedByAto, atoId)) continue;
        var cl = resolvedByAto[atoId] || [];
        for (var c = 0; c < cl.length; c++) {
          if (!seenCand[cl[c]]) {
            seenCand[cl[c]] = true;
            unionCandidates.push(cl[c]);
          }
        }
      }

      var itens = [];
      var expectedByAto = expectedMapFromCase(caso, sel.codigos);
      for (var a = 0; a < stub.atos.length; a++) {
        var ato = stub.atos[a];
        var exp = expectedByAto[ato.atoId] || [];
        for (var e = 0; e < exp.length; e++) {
          // Só inclui esperado se estiver nos candidatos (pré-condição Fase 2).
          if ((resolvedByAto[ato.atoId] || []).indexOf(exp[e].codigo) === -1) {
            continue;
          }
          itens.push({
            codigo: exp[e].codigo,
            trecho: exp[e].trecho || ato.trecho,
            _injected: false,
            _kind: "good",
          });
        }
      }

      var injectedHere = [];
      if (inject) {
        injectedHere.push({
          codigo: PHANTOM_CODE,
          trecho: stub.atos[0] ? stub.atos[0].trecho : "x",
          _injected: true,
          _kind: "phantom",
        });
        var goodCode =
          (itens[0] && itens[0].codigo) ||
          (unionCandidates[0] ? unionCandidates[0] : "0407030034");
        injectedHere.push({
          codigo: goodCode,
          trecho: FAKE_CITATION,
          _injected: true,
          _kind: "bad_citation",
        });
        for (var ii = 0; ii < injectedHere.length; ii++) {
          itens.push(injectedHere[ii]);
        }
      }

      var filtered = guard.filterItems({
        descricao: descricao,
        itens: itens,
        candidatos: unionCandidates,
        catalogo: catalogo,
      });

      var caseEscaped = [];
      for (var ap = 0; ap < filtered.aprovados.length; ap++) {
        var item = filtered.aprovados[ap];
        if (item._injected) {
          escaped++;
          caseEscaped.push(item);
          escapedItems.push({ id: caso.id, item: item });
        }
      }
      for (var rp = 0; rp < filtered.reprovados.length; rp++) {
        if (filtered.reprovados[rp].item && filtered.reprovados[rp].item._injected) {
          dropped++;
        }
      }
      injected += injectedHere.length;

      caseResults.push({
        id: caso.id,
        injected: injectedHere.length,
        dropped: filtered.reprovados.filter(function (r) {
          return r.item && r.item._injected;
        }).length,
        escaped: caseEscaped.length,
        aprovados: filtered.aprovados.length,
        reprovados: filtered.reprovados.map(function (r) {
          return {
            codigo: r.item && r.item.codigo,
            kind: r.item && r.item._kind,
            errorCode: r.errorCode,
          };
        }),
      });
    }

    var pass =
      errors.length === 0 &&
      escaped <= maxEscapes &&
      (inject ? injected > 0 : true);

    return {
      tier: "guardrail",
      mode: inject ? "inject-errors" : "clean",
      pass: pass,
      injected: injected,
      dropped: dropped,
      escaped: escaped,
      maxEscapes: maxEscapes,
      casesEvaluated: caseResults.length,
      cases: caseResults,
      escapedItems: escapedItems,
      errors: errors,
      codes: {
        phantom: codes.CODE_NOT_IN_CANDIDATES,
        citation: codes.CITATION_NOT_SUBSTRING,
      },
      note:
        "Portão Fase 3 (guardrail): citação inválida=0 escapes; código fantasma=0 escapes.",
    };
  }

  return {
    SELECT_PRECISION_THRESHOLD: SELECT_PRECISION_THRESHOLD,
    GUARDRAIL_MAX_ESCAPES: GUARDRAIL_MAX_ESCAPES,
    PHANTOM_CODE: PHANTOM_CODE,
    FAKE_CITATION: FAKE_CITATION,
    expectedMapFromCase: expectedMapFromCase,
    scoreSelectCase: scoreSelectCase,
    evaluateSelect: evaluateSelect,
    evaluateGuardrail: evaluateGuardrail,
  };
});
