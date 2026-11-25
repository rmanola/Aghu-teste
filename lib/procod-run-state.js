/**
 * FEAT-157 — runState do agente codificador.
 *
 * Duas responsabilidades:
 *  1. Gatear transições (pré-requisitos verificados antes de gastar token).
 *  2. Ser a memória de EXECUÇÃO — o par (ato × candidato) já julgado nunca é
 *     re-julgado no mesmo run, que é o custo dominante porque o guardrail faz
 *     fan-out por item.
 *
 * A lista fechada de candidatos vive aqui: `selectCodes` recusa qualquer código
 * que a resolução não tenha proposto. É o primeiro dos três travões.
 *
 * Estruturas são objetos planos (não Set/Map) de propósito: o state entra em
 * trace/telemetria e precisa serializar.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./sigtap-import.js")
      : root.AghuSigtapImport
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodRunState = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  codes,
  sigtap
) {
  "use strict";

  var MAX_REPAIR = 2;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function pairKey(atoId, codigo) {
    return str(atoId) + ":" + str(codigo);
  }

  /**
   * @param {{runId?: string, competencia?: string}} opts
   */
  function createRunState(opts) {
    opts = opts || {};
    if (!str(opts.competencia).trim()) {
      throw codes.makeError(
        codes.COMPETENCIA_MISSING,
        "runState exige competencia (AAAAMM) — a codificação resolve contra a tabela vigente na data da cirurgia."
      );
    }
    // Explode aqui se o formato for inválido (fail-fast na fronteira).
    var competencia = sigtap.parseCompetencia(opts.competencia);
    return {
      runId: str(opts.runId),
      competencia: competencia,
      extractDone: false,
      atos: [],
      resolvedByAto: {},
      selectedByAto: {},
      guardDetPassed: {},
      guardVerdict: {},
      divergences: [],
      repairCount: 0,
      tokensSpent: 0,
      tokensInSpent: 0,
      tokensOutSpent: 0,
      costUsdSpent: 0,
    };
  }

  /** A competência é fixada na criação e não muda dentro do run. */
  function setCompetencia() {
    throw codes.makeError(
      codes.COMPETENCIA_MISSING,
      "Competência é imutável dentro do run — crie outro run para outra competência."
    );
  }

  function setAtos(state, atos) {
    state.atos = Array.isArray(atos) ? atos.slice() : [];
    state.extractDone = true; // o extract rodou, mesmo que não tenha achado nada
    return state;
  }

  function setCandidates(state, atoId, codigos) {
    state.resolvedByAto[str(atoId)] = Array.isArray(codigos)
      ? codigos.slice()
      : [];
    return state;
  }

  function getCandidates(state, atoId) {
    return state.resolvedByAto[str(atoId)] || [];
  }

  /**
   * TRAVÃO 1 — lista fechada. Código que a resolução não propôs não entra,
   * por mais convincente que o LLM tenha sido.
   */
  function selectCodes(state, atoId, codigos) {
    var candidatos = getCandidates(state, atoId);
    var list = Array.isArray(codigos) ? codigos : [];
    for (var i = 0; i < list.length; i++) {
      if (candidatos.indexOf(list[i]) === -1) {
        throw codes.makeError(
          codes.CODE_NOT_IN_CANDIDATES,
          "Código " +
            list[i] +
            " não está entre os candidatos do ato " +
            str(atoId) +
            " (" +
            candidatos.length +
            " candidatos)."
        );
      }
    }
    state.selectedByAto[str(atoId)] = list.slice();
    return state;
  }

  function getSelected(state, atoId) {
    return state.selectedByAto[str(atoId)] || [];
  }

  function markGuardDet(state, atoId, codigo) {
    state.guardDetPassed[pairKey(atoId, codigo)] = true;
    return state;
  }

  function passedGuardDet(state, atoId, codigo) {
    return state.guardDetPassed[pairKey(atoId, codigo)] === true;
  }

  function setVerdict(state, atoId, codigo, verdict) {
    state.guardVerdict[pairKey(atoId, codigo)] = str(verdict);
    return state;
  }

  function getVerdict(state, atoId, codigo) {
    return state.guardVerdict[pairKey(atoId, codigo)] || "";
  }

  /** Memória de execução: já julgado neste run? */
  function isJudged(state, atoId, codigo) {
    return Object.prototype.hasOwnProperty.call(
      state.guardVerdict,
      pairKey(atoId, codigo)
    );
  }

  function eachSelectedPair(state, fn) {
    for (var atoId in state.selectedByAto) {
      if (!Object.prototype.hasOwnProperty.call(state.selectedByAto, atoId)) {
        continue;
      }
      var list = state.selectedByAto[atoId];
      for (var i = 0; i < list.length; i++) {
        var stop = fn(atoId, list[i]);
        if (stop === false) return false;
      }
    }
    return true;
  }

  /** Gate por nó do grafo. */
  function canEnter(state, node) {
    var n = str(node);
    if (n === "resolve") {
      if (!state.extractDone || !state.atos.length) {
        return {
          ok: false,
          errorCode: codes.NO_ATOS_EXTRACTED,
          error: "Nenhum ato cirúrgico extraído — resolve não tem o que resolver.",
        };
      }
      return { ok: true };
    }
    if (n === "rules") {
      var faltando = null;
      eachSelectedPair(state, function (atoId, codigo) {
        // Par reprovado no guardrail determinístico saiu do fluxo de propósito.
        // Exigir veredito dele confundiria «descartado» com «pendente» e faria
        // um item legitimamente derrubado bloquear o run inteiro.
        if (!passedGuardDet(state, atoId, codigo)) return true;
        if (!isJudged(state, atoId, codigo)) {
          faltando = pairKey(atoId, codigo);
          return false;
        }
        return true;
      });
      if (faltando) {
        return {
          ok: false,
          errorCode: codes.VERDICT_MISSING,
          error: "Par sem veredito do guardrail: " + faltando + ".",
        };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  function canSelect(state, atoId) {
    if (!getCandidates(state, atoId).length) {
      return {
        ok: false,
        errorCode: codes.NO_CANDIDATES,
        error: "Ato " + str(atoId) + " não tem candidatos resolvidos.",
      };
    }
    return { ok: true };
  }

  /**
   * O barato antes do caro: nunca se gasta chamada de verificação num par que
   * já falhou na checagem determinística.
   */
  function canVerify(state, atoId, codigo) {
    if (!passedGuardDet(state, atoId, codigo)) {
      return {
        ok: false,
        errorCode: codes.ILLEGAL_TRANSITION,
        error:
          "Par " +
          pairKey(atoId, codigo) +
          " não passou no guardrail determinístico.",
      };
    }
    return { ok: true };
  }

  function canRepair(state) {
    if (state.repairCount >= MAX_REPAIR) {
      return {
        ok: false,
        errorCode: codes.REPAIR_EXHAUSTED,
        error: "Repair esgotado (" + MAX_REPAIR + ") — escalar para HITL.",
      };
    }
    return { ok: true };
  }

  function countRepair(state) {
    state.repairCount += 1;
    return state;
  }

  /** Divergência é registrada, nunca descartada em silêncio. */
  function registerDivergence(state, atoId, codigo, verdicts) {
    state.divergences.push({
      atoId: str(atoId),
      codigo: str(codigo),
      verdicts: verdicts || {},
    });
    return state;
  }

  function hasDivergences(state) {
    return state.divergences.length > 0;
  }

  function addTokens(state, n) {
    state.tokensSpent += Number(n) || 0;
    return state;
  }

  function addUsage(state, usage) {
    usage = usage || {};
    addTokens(state, usage.tokens);
    state.tokensInSpent += Number(usage.tokensIn) || 0;
    state.tokensOutSpent += Number(usage.tokensOut) || 0;
    var extra = Number(usage.costUsd) || 0;
    if (extra > 0) {
      state.costUsdSpent = Math.round((state.costUsdSpent + extra) * 1e8) / 1e8;
    }
    return state;
  }

  function checkBudget(state, maxTokens) {
    var max = Number(maxTokens) || 0;
    if (max > 0 && state.tokensSpent > max) {
      return {
        ok: false,
        errorCode: codes.TOKEN_BUDGET_EXCEEDED,
        error:
          "Orçamento de tokens excedido: " + state.tokensSpent + " > " + max + ".",
      };
    }
    return { ok: true };
  }

  return {
    MAX_REPAIR: MAX_REPAIR,
    pairKey: pairKey,
    createRunState: createRunState,
    setCompetencia: setCompetencia,
    setAtos: setAtos,
    setCandidates: setCandidates,
    getCandidates: getCandidates,
    selectCodes: selectCodes,
    getSelected: getSelected,
    markGuardDet: markGuardDet,
    passedGuardDet: passedGuardDet,
    setVerdict: setVerdict,
    getVerdict: getVerdict,
    isJudged: isJudged,
    eachSelectedPair: eachSelectedPair,
    canEnter: canEnter,
    canSelect: canSelect,
    canVerify: canVerify,
    canRepair: canRepair,
    countRepair: countRepair,
    registerDivergence: registerDivergence,
    hasDivergences: hasDivergences,
    addTokens: addTokens,
    addUsage: addUsage,
    checkBudget: checkBudget,
  };
});
