/**
 * FEAT-157 — eval Fase 4: eficacia do guardrail cross-provider.
 *
 * Injeta erros SEMANTICOS que passam nos travao deterministicos
 * (codigo no catalogo + citacao literal substring) e mede se o
 * verificador do segundo fornecedor (stub B independente) os derruba.
 *
 * Portao:
 *   dropRate  >= 0.9  (erros injectados derrubados)
 *   falseKill <= 0.05 (itens correctos mortos — bound documentado; alvo ~0)
 *
 * Offline-first: stubs A/B com vereditos independentes (sem API keys).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-eval-recall.js")
      : root.AghuProcodEvalRecall,
    typeof require !== "undefined"
      ? require("./procod-eval-select.js")
      : root.AghuProcodEvalSelect,
    typeof require !== "undefined"
      ? require("./procod-guard.js")
      : root.AghuProcodGuard,
    typeof require !== "undefined"
      ? require("./procod-llm-provider.js")
      : root.AghuProcodLlmProvider,
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodEvalGuardrailXprovider = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  evalRecall,
  evalSelect,
  guard,
  llm,
  codes
) {
  "use strict";

  var DROP_RATE_THRESHOLD = 0.9;
  /** Bound documentado: false kills <= 5% (alvo operacional = 0). */
  var FALSE_KILL_MAX = 0.05;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function catalogList(procedimentos) {
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    return list
      .map(function (p) {
        return str(p.codigo);
      })
      .filter(Boolean);
  }

  function catalogSet(procedimentos) {
    var set = {};
    var list = catalogList(procedimentos);
    for (var i = 0; i < list.length; i++) set[list[i]] = true;
    return set;
  }

  function pickWrongCode(catalogo, goldSet) {
    var list = Array.isArray(catalogo) ? catalogo : [];
    for (var i = 0; i < list.length; i++) {
      var c = str(list[i]);
      if (c && !goldSet[c]) return c;
    }
    return "";
  }

  function buildItemsForCase(input) {
    input = input || {};
    var caso = input.caso;
    var sel = input.sel;
    var stub = input.stub;
    var descricao = input.descricao;
    var procedimentos = input.procedimentos;
    var opts = input.opts || {};
    var inject = opts.injectErrors !== false;

    var resolvedByAto = evalRecall.resolveAtos(procedimentos, stub.atos, opts);
    var allCatalog = catalogList(procedimentos);
    var catSet = catalogSet(procedimentos);

    var unionCandidates = allCatalog.slice();
    var goldSet = {};
    var expectedByAto = evalSelect.expectedMapFromCase(caso, sel.codigos);
    for (var g = 0; g < sel.codigos.length; g++) {
      goldSet[str(sel.codigos[g].codigo)] = true;
    }

    var itens = [];
    for (var a = 0; a < stub.atos.length; a++) {
      var ato = stub.atos[a];
      var exp = expectedByAto[ato.atoId] || [];
      for (var e = 0; e < exp.length; e++) {
        if ((resolvedByAto[ato.atoId] || []).indexOf(exp[e].codigo) === -1) {
          continue;
        }
        if (!catSet[exp[e].codigo]) continue;
        itens.push({
          atoId: ato.atoId,
          codigo: exp[e].codigo,
          trecho: exp[e].trecho || ato.trecho,
          _injected: false,
          _kind: "good",
        });
      }
    }

    var injectedHere = [];
    if (inject && itens.length) {
      var wrong = pickWrongCode(allCatalog, goldSet);
      var trechoLiteral = itens[0].trecho;
      if (!guard.validateCitation(descricao, trechoLiteral).ok) {
        trechoLiteral = stub.atos[0] ? stub.atos[0].trecho : trechoLiteral;
      }
      if (wrong && guard.validateCitation(descricao, trechoLiteral).ok) {
        injectedHere.push({
          atoId: itens[0].atoId,
          codigo: wrong,
          trecho: trechoLiteral,
          _injected: true,
          _kind: "wrong_code",
        });
      }
    }

    for (var ii = 0; ii < injectedHere.length; ii++) {
      itens.push(injectedHere[ii]);
    }

    return {
      itens: itens,
      injectedHere: injectedHere,
      unionCandidates: unionCandidates,
      goldSet: goldSet,
      resolvedByAto: resolvedByAto,
    };
  }

  async function evaluateGuardrailXprovider(input) {
    input = input || {};
    var opts = input.opts || {};
    var inject = opts.injectErrors !== false;
    var dropThreshold =
      typeof opts.dropThreshold === "number"
        ? opts.dropThreshold
        : DROP_RATE_THRESHOLD;
    var falseKillMax =
      typeof opts.falseKillMax === "number" ? opts.falseKillMax : FALSE_KILL_MAX;

    var selectedCases = evalRecall.selectGateCases(input.gabarito, opts);
    var catalogo = catalogList(input.procedimentos);
    var caseResults = [];
    var errors = [];

    var injected = 0;
    var dropped = 0;
    var escaped = 0;
    var goodTotal = 0;
    var falseKills = 0;
    var hitlCount = 0;
    var detBlockedInjected = 0;
    var divergences = [];

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

      var built = buildItemsForCase({
        caso: caso,
        sel: sel,
        stub: stub,
        descricao: descricao,
        procedimentos: input.procedimentos,
        opts: opts,
      });

      var filtered = guard.filterItems({
        descricao: descricao,
        itens: built.itens,
        candidatos: built.unionCandidates,
        catalogo: catalogo,
      });

      for (var rp = 0; rp < filtered.reprovados.length; rp++) {
        var rej = filtered.reprovados[rp];
        if (rej.item && rej.item._injected) detBlockedInjected++;
      }

      var surviving = filtered.aprovados;
      var injectedCodes = {};
      for (var ih = 0; ih < built.injectedHere.length; ih++) {
        injectedCodes[built.injectedHere[ih].codigo] = true;
      }
      injected += built.injectedHere.length;

      var pair = llm.createIndependentStubPair({
        goldByCodigo: built.goldSet,
        injectedByCodigo: injectedCodes,
        extractProvider: "stub-a",
        verifyProvider: "stub-b",
      });
      var verifyFn =
        typeof opts.verifyFn === "function" ? opts.verifyFn : pair.verify;

      var caseDropped = 0;
      var caseEscaped = 0;
      var caseFalseKill = 0;
      var caseGood = 0;
      var caseHitl = 0;

      for (var s = 0; s < surviving.length; s++) {
        var item = surviving[s];
        var vr = await verifyFn({
          codigo: item.codigo,
          nome: "",
          trecho: item.trecho,
        });
        var veredito =
          vr && typeof vr === "object" && "value" in vr
            ? str(vr.value)
            : str(vr);
        var recon = guard.reconcileBlindVerdict("confirm", veredito);

        if (item._injected) {
          if (recon.action === "pass") {
            escaped++;
            caseEscaped++;
          } else {
            dropped++;
            caseDropped++;
            hitlCount++;
            caseHitl++;
            divergences.push({
              id: caso.id,
              codigo: item.codigo,
              kind: item._kind,
              verdicts: recon.verdicts,
            });
          }
        } else {
          caseGood++;
          goodTotal++;
          if (recon.action !== "pass") {
            falseKills++;
            caseFalseKill++;
            hitlCount++;
            caseHitl++;
            divergences.push({
              id: caso.id,
              codigo: item.codigo,
              kind: "false_kill",
              verdicts: recon.verdicts,
            });
          }
        }
      }

      caseResults.push({
        id: caso.id,
        injected: built.injectedHere.length,
        surviving: surviving.length,
        dropped: caseDropped,
        escaped: caseEscaped,
        good: caseGood,
        falseKills: caseFalseKill,
        hitl: caseHitl,
      });
    }

    var dropRate = injected ? dropped / injected : null;
    var falseKillRate = goodTotal ? falseKills / goodTotal : 0;
    var pass =
      errors.length === 0 &&
      inject &&
      injected > 0 &&
      dropRate != null &&
      dropRate >= dropThreshold &&
      falseKillRate <= falseKillMax;

    return {
      tier: "guardrail-xprovider",
      mode: inject ? "inject-errors-stub-xprovider" : "clean",
      pass: pass,
      dropRate: dropRate,
      dropThreshold: dropThreshold,
      falseKillRate: falseKillRate,
      falseKillMax: falseKillMax,
      injected: injected,
      dropped: dropped,
      escaped: escaped,
      goodTotal: goodTotal,
      falseKills: falseKills,
      hitlCount: hitlCount,
      detBlockedInjected: detBlockedInjected,
      casesEvaluated: caseResults.length,
      cases: caseResults,
      divergences: divergences,
      errors: errors,
      errorCode: codes.GUARD_DIVERGENCE,
      note:
        "Portao Fase 4: dropRate>=" +
        dropThreshold +
        " nos erros semanticos injectados; falseKillRate<=" +
        falseKillMax +
        " (bound; alvo ~0). Stub B independente; HITL via guard_divergence.",
    };
  }

  return {
    DROP_RATE_THRESHOLD: DROP_RATE_THRESHOLD,
    FALSE_KILL_MAX: FALSE_KILL_MAX,
    pickWrongCode: pickWrongCode,
    buildItemsForCase: buildItemsForCase,
    evaluateGuardrailXprovider: evaluateGuardrailXprovider,
  };
});
