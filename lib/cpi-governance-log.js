/**
 * FEAT-128 — Registo de decisão de governança do CPI.
 *
 * É o registo que a FEAT-124 (promoção de linha), a FEAT-125 (troca de
 * referência) e a FEAT-127 (recalibração de modelo) pressupõem e que ainda não
 * existia: todas exigem «decisão registada» e nenhuma tinha onde a registar.
 *
 * Três invariantes:
 *
 *   1. **Anexo imutável** — `appendDecision` devolve uma lista nova e congelada;
 *      nunca muta nem apaga uma entrada anterior (CPIGOV-AC-08). O registo é a
 *      prova de que a definição mudou por decisão e não por acidente, e um
 *      registo editável não prova nada.
 *   2. **`rationale` obrigatório** — um registo sem razão escrita é
 *      indistinguível de nenhum registo (CPIGOV-AC-07). Cada `kind` exige ainda
 *      os campos sem os quais a decisão não é reconstituível (CPIGOV-AC-10).
 *   3. **Efeito prospectivo** — `resolveConfigAt` dobra as decisões com
 *      `effectiveFrom <= date` e ignora as posteriores, pelo que a série
 *      histórica mantém a definição vigente à época (CPIGOV-AC-09/15).
 *      Reprocessar a história com a definição nova apagaria a razão pela qual a
 *      decisão foi tomada.
 *
 * Sem PHI: identifica linhas, indicadores, referências, modelos e o autor da
 * decisão como membro de workspace — nunca um doente.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiGovernanceLog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Domínio fechado: um `kind` novo é uma alteração de contrato, não um campo livre. */
  var KIND = Object.freeze({
    CARE_LINE_PROMOTION: "care_line_promotion",
    CARE_LINE_RETIREMENT: "care_line_retirement",
    REFERENCE_CHANGE: "reference_change",
    MODEL_RECALIBRATION: "model_recalibration",
    INDICATOR_LIBRARY_CHANGE: "indicator_library_change",
    SOURCE_ALLOWLIST_CHANGE: "source_allowlist_change",
    /** FEAT-211 PROCOD2-T5 — aprovação HITL de commit SIGTAP (sem PHI no rationale). */
    PROCOD_COMMIT: "procod_commit",
  });

  var KINDS = Object.freeze([
    KIND.CARE_LINE_PROMOTION,
    KIND.CARE_LINE_RETIREMENT,
    KIND.REFERENCE_CHANGE,
    KIND.MODEL_RECALIBRATION,
    KIND.INDICATOR_LIBRARY_CHANGE,
    KIND.SOURCE_ALLOWLIST_CHANGE,
    KIND.PROCOD_COMMIT,
  ]);

  /**
   * Mínimos de promoção da FEAT-124 (`defaultPromotion` em `cpi-care-lines.js`).
   * Registados aqui porque a promoção é a decisão, e a decisão tem de trazer a
   * evidência que a justifica (CPIGOV-AC-10).
   */
  var PROMOTION_MINIMUMS = Object.freeze({
    minAttributedUnits: 30,
    minSampledPrecision: 0.9,
  });

  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function plain(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }

  function num(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isoDate(v) {
    var raw = str(v).trim();
    if (!raw) return null;
    return ISO_DATE.test(raw.slice(0, 10)) ? raw.slice(0, 10) : null;
  }

  /** Congela em profundidade — o registo é prova, não rascunho (CPIGOV-AC-08). */
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) deepFreeze(value[keys[i]]);
    return value;
  }

  function cloneJson(value) {
    if (value == null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  /** Registo vazio — sempre a mesma forma, para o caller nunca inventar uma. */
  function createLog(entries) {
    return deepFreeze(asArray(entries).map(cloneJson));
  }

  // O `rationale` é texto livre escrito por uma pessoa e é reproduzido no
  // pacote do comité, que sai do produto. Um prontuário colado à mão não é
  // apanhado por verificação de chaves, só de valor — e aqui, na escrita, é o
  // último ponto em que ainda se pode recusar em vez de redigir depois.
  // Corridas de 6+ dígitos cobrem prontuário e CPF sem pontuação; datas ISO
  // (4-2-2) e denominadores de coorte ficam abaixo do limite.
  var LONG_DIGIT_RUN = /\d{6,}/;
  var FORMATTED_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

  function looksLikePatientIdentifier(text) {
    return LONG_DIGIT_RUN.test(text) || FORMATTED_CPF.test(text);
  }

  function evidenceOf(decision) {
    var ev = plain(decision.evidence);
    if (ev) return ev;
    // `evidence` como lista de referências é forma legítima, mas por si só não
    // traz cobertura nem precisão — a validação por `kind` reporta o que falta.
    if (Array.isArray(decision.evidence)) return { refs: decision.evidence };
    return null;
  }

  /** CPIGOV-AC-10: promoção sem evidência de cobertura e precisão é recusada. */
  function validatePromotionEvidence(decision, errors) {
    var ev = evidenceOf(decision);
    if (!ev) {
      errors.push(
        "care_line_promotion exige `evidence` com cobertura atribuída e precisão amostrada (FEAT-124)",
      );
      return;
    }
    var units = num(ev.attributedUnits);
    var precision = num(ev.sampledPrecision);
    var sampleSize = num(ev.sampleSize);

    if (units == null) {
      errors.push("care_line_promotion exige `evidence.attributedUnits` (cobertura)");
    } else if (units < PROMOTION_MINIMUMS.minAttributedUnits) {
      errors.push(
        "care_line_promotion: cobertura " +
          units +
          " abaixo do mínimo " +
          PROMOTION_MINIMUMS.minAttributedUnits +
          " da FEAT-124",
      );
    }

    if (precision == null) {
      errors.push(
        "care_line_promotion exige `evidence.sampledPrecision` (precisão amostrada)",
      );
    } else if (precision < PROMOTION_MINIMUMS.minSampledPrecision) {
      errors.push(
        "care_line_promotion: precisão amostrada " +
          precision +
          " abaixo do mínimo " +
          PROMOTION_MINIMUMS.minSampledPrecision +
          " da FEAT-124",
      );
    }

    if (sampleSize == null || sampleSize <= 0) {
      errors.push(
        "care_line_promotion exige `evidence.sampleSize` — uma precisão sem tamanho de amostra não é verificável",
      );
    }

    // CPICIC-AC-10 — promoção que cite revisão inconclusiva ou recusada é rejeitada.
    var reviewId = str(ev.reviewId).trim();
    if (reviewId) {
      var reviewStatus = str(ev.reviewStatus || ev.status)
        .trim()
        .toLowerCase();
      if (reviewStatus === "inconclusive" || reviewStatus === "rejected") {
        errors.push(
          "care_line_promotion: revisão citada não está aprovada — inconclusive/rejected mantêm candidate (CPICIC-AC-10)",
        );
      }
    }
  }

  function validateByKind(decision, kind, errors) {
    if (kind === KIND.CARE_LINE_PROMOTION) {
      validatePromotionEvidence(decision, errors);
      return;
    }
    if (kind === KIND.CARE_LINE_RETIREMENT) {
      if (!isoDate(decision.effectiveFrom)) {
        errors.push(
          "care_line_retirement exige `effectiveFrom` (YYYY-MM-DD) — a retirada é prospectiva",
        );
      }
      return;
    }
    if (kind === KIND.REFERENCE_CHANGE) {
      var from = plain(decision.from);
      var to = plain(decision.to);
      if (!from || !str(from.referenceId).trim()) {
        errors.push("reference_change exige `from.referenceId` do registo de referências");
      }
      if (!to || !str(to.referenceId).trim()) {
        errors.push("reference_change exige `to.referenceId` do registo de referências");
      }
      return;
    }
    if (kind === KIND.MODEL_RECALIBRATION) {
      var evidence = evidenceOf(decision);
      if (!evidence || !str(evidence.validationReport).trim()) {
        errors.push(
          "model_recalibration exige `evidence.validationReport` com o relatório da FEAT-127",
        );
      }
      return;
    }
    if (kind === KIND.INDICATOR_LIBRARY_CHANGE) {
      // `target` já é exigido em comum; nada específico além disso.
      return;
    }
    if (kind === KIND.PROCOD_COMMIT) {
      var procodEv = evidenceOf(decision);
      if (!procodEv || !str(procodEv.runId).trim()) {
        errors.push("procod_commit exige `evidence.runId` (UUID do run PROCOD)");
      }
      if (!procodEv || !str(procodEv.recordClientId).trim()) {
        errors.push("procod_commit exige `evidence.recordClientId` (UUID canónico)");
      }
      if (!procodEv || !str(procodEv.cirurgiaId).trim()) {
        errors.push("procod_commit exige `evidence.cirurgiaId` (id da cirurgia no passômetro)");
      }
      return;
    }
    if (kind === KIND.SOURCE_ALLOWLIST_CHANGE) {
      var dest = plain(decision.to);
      var host = dest ? str(dest.host).trim() : str(decision.to).trim();
      if (!host) {
        errors.push(
          "source_allowlist_change exige `to.host` com o domínio acrescentado ou removido",
        );
      }
      // `to.action` fica de fora do domínio fechado ("add"/"remove") só
      // quando omitido — omitido é "add" implícito (histórico). Qualquer
      // outro valor (erro de digitação, "removed" no passado) é recusado em
      // vez de cair silenciosamente em "add" — uma remoção mal escrita não
      // pode acabar registada como adição (CPIGOV-AC-10).
      var actionRaw = dest ? dest.action : undefined;
      if (actionRaw != null && str(actionRaw).trim()) {
        var actionNorm = str(actionRaw).trim();
        if (actionNorm !== "add" && actionNorm !== "remove") {
          errors.push(
            'source_allowlist_change: `to.action` deve ser exactamente "add" ou "remove" (recebido "' +
              actionNorm +
              '")',
          );
        }
      }
      return;
    }
  }

  /**
   * Valida uma decisão sem a escrever. Devolve a lista completa de problemas —
   * recusar campo a campo obrigaria o autor a várias tentativas.
   * @returns {string[]}
   */
  function validateDecision(decision) {
    var errors = [];
    var d = plain(decision);
    if (!d) return ["decisão deve ser um objecto"];

    var kind = str(d.kind).trim();
    if (!kind) errors.push("`kind` obrigatório");
    else if (KINDS.indexOf(kind) === -1) {
      errors.push("`kind` desconhecido: " + kind + " — domínio fechado " + KINDS.join(", "));
    }

    if (!str(d.id).trim()) errors.push("`id` obrigatório");
    if (!isoDate(d.decidedAt)) errors.push("`decidedAt` obrigatório (YYYY-MM-DD)");
    if (!str(d.decidedBy).trim()) errors.push("`decidedBy` obrigatório");

    // CPIGOV-AC-07 — a razão escrita é o que distingue governança de formalidade.
    if (!str(d.rationale).trim()) {
      errors.push("`rationale` obrigatório — decisão sem razão escrita é recusada");
    } else if (looksLikePatientIdentifier(str(d.rationale))) {
      errors.push(
        "`rationale` não pode conter identificador de doente (6+ dígitos seguidos ou CPF formatado) — o texto é reproduzido no pacote do comité (CPIGOV-AC-12)",
      );
    }

    if (
      kind !== KIND.SOURCE_ALLOWLIST_CHANGE &&
      KINDS.indexOf(kind) !== -1 &&
      !str(d.target).trim()
    ) {
      errors.push("`target` obrigatório para " + kind);
    }

    if (d.effectiveFrom != null && !isoDate(d.effectiveFrom)) {
      errors.push("`effectiveFrom` inválido — esperado YYYY-MM-DD");
    }

    if (KINDS.indexOf(kind) !== -1) validateByKind(d, kind, errors);

    return errors;
  }

  /**
   * Anexa uma decisão. Nunca muta `log`: devolve `{ ok, log, errors }` com a
   * lista nova congelada, ou a lista original intacta quando recusa
   * (CPIGOV-AC-07/08/10).
   *
   * @param {ReadonlyArray<object>} log
   * @param {object} decision
   * @returns {{ ok: boolean, log: ReadonlyArray<object>, errors: string[], entry: object|null }}
   */
  function appendDecision(log, decision) {
    var current = createLog(log);
    var errors = validateDecision(decision);
    if (errors.length) {
      return { ok: false, log: current, errors: errors, entry: null };
    }

    var d = plain(decision);
    var effectiveFrom = isoDate(d.effectiveFrom) || isoDate(d.decidedAt);

    var entry = {
      id: str(d.id).trim(),
      decidedAt: isoDate(d.decidedAt),
      decidedBy: str(d.decidedBy).trim(),
      kind: str(d.kind).trim(),
      target: str(d.target).trim() || null,
      from: d.from == null ? null : cloneJson(d.from),
      to: d.to == null ? null : cloneJson(d.to),
      rationale: str(d.rationale).trim(),
      evidence: d.evidence == null ? null : cloneJson(d.evidence),
      effectiveFrom: effectiveFrom,
      sequence: current.length,
    };

    var next = current.slice();
    next.push(entry);
    deepFreeze(entry);

    return { ok: true, log: deepFreeze(next), errors: [], entry: entry };
  }

  /**
   * CPIGOV-AC-15: cronologia completa, ordenada por `effectiveFrom` e desempatada
   * pela ordem de anexo — duas decisões no mesmo dia aplicam-se pela ordem em que
   * foram tomadas.
   * @param {ReadonlyArray<object>} log
   * @param {{ kind?: string, target?: string, until?: string }} [filter]
   */
  function listDecisions(log, filter) {
    var f = plain(filter) || {};
    var wantKind = str(f.kind).trim();
    var wantTarget = str(f.target).trim();
    var until = isoDate(f.until);

    var out = asArray(log).filter(function (entry) {
      if (!entry) return false;
      if (wantKind && str(entry.kind) !== wantKind) return false;
      if (wantTarget && str(entry.target) !== wantTarget) return false;
      if (until && str(entry.effectiveFrom) > until) return false;
      return true;
    });

    return out.slice().sort(function (a, b) {
      var ea = str(a.effectiveFrom);
      var eb = str(b.effectiveFrom);
      if (ea !== eb) return ea < eb ? -1 : 1;
      return (a.sequence || 0) - (b.sequence || 0);
    });
  }

  function emptyConfig(asOf) {
    return {
      asOf: asOf,
      careLines: {},
      references: {},
      models: {},
      indicators: {},
      sourceAllowlist: { added: [], removed: [] },
      appliedDecisionIds: [],
    };
  }

  function applyEntry(config, entry) {
    var kind = str(entry.kind);
    var target = str(entry.target);
    var to = plain(entry.to) || {};
    var from = plain(entry.from) || {};

    if (kind === KIND.CARE_LINE_PROMOTION || kind === KIND.CARE_LINE_RETIREMENT) {
      var lifecycle =
        str(to.lifecycle).trim() ||
        (kind === KIND.CARE_LINE_PROMOTION ? "active" : "retired");
      config.careLines[target] = {
        lifecycle: lifecycle,
        previousLifecycle: str(from.lifecycle).trim() || null,
        decisionId: entry.id,
        effectiveFrom: entry.effectiveFrom,
      };
      return;
    }

    if (kind === KIND.REFERENCE_CHANGE) {
      config.references[target] = {
        referenceId: str(to.referenceId).trim(),
        previousReferenceId: str(from.referenceId).trim() || null,
        decisionId: entry.id,
        effectiveFrom: entry.effectiveFrom,
      };
      return;
    }

    if (kind === KIND.MODEL_RECALIBRATION) {
      config.models[target] = {
        decisionId: entry.id,
        effectiveFrom: entry.effectiveFrom,
        validationReport:
          (plain(entry.evidence) && str(plain(entry.evidence).validationReport)) || null,
      };
      return;
    }

    if (kind === KIND.INDICATOR_LIBRARY_CHANGE) {
      config.indicators[target] = {
        change: to,
        decisionId: entry.id,
        effectiveFrom: entry.effectiveFrom,
      };
      return;
    }

    if (kind === KIND.SOURCE_ALLOWLIST_CHANGE) {
      var host = str(to.host).trim() || str(entry.to).trim();
      var action = str(to.action).trim() || "add";
      var bucket = action === "remove" ? "removed" : "added";
      var other = bucket === "added" ? "removed" : "added";
      var otherIdx = config.sourceAllowlist[other].indexOf(host);
      if (otherIdx !== -1) config.sourceAllowlist[other].splice(otherIdx, 1);
      if (config.sourceAllowlist[bucket].indexOf(host) === -1) {
        config.sourceAllowlist[bucket].push(host);
      }
      return;
    }
  }

  /**
   * Configuração vigente numa data: dobra sobre as decisões com
   * `effectiveFrom <= date` (CPIGOV-AC-09/15). Uma decisão com efeito no dia
   * seguinte não conta — é a fronteira que a fixture testa dos dois lados.
   *
   * @param {ReadonlyArray<object>} log
   * @param {string} date — YYYY-MM-DD
   */
  function resolveConfigAt(log, date) {
    var asOf = isoDate(date);
    if (!asOf) {
      throw new Error("cpi-governance-log: data inválida para resolveConfigAt (YYYY-MM-DD)");
    }
    var config = emptyConfig(asOf);
    var applicable = listDecisions(log, { until: asOf });
    for (var i = 0; i < applicable.length; i++) {
      applyEntry(config, applicable[i]);
      config.appliedDecisionIds.push(str(applicable[i].id));
    }
    return config;
  }

  /**
   * Decisões cujo `decidedAt` cai no mês `YYYY-MM` — o que o pacote do comité
   * publica como «decisões do período».
   * @param {ReadonlyArray<object>} log
   * @param {string} month — YYYY-MM
   */
  function decisionsInMonth(log, month) {
    var m = str(month).trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) {
      throw new Error("cpi-governance-log: mês inválido (esperado YYYY-MM)");
    }
    return asArray(log)
      .filter(function (entry) {
        return entry && str(entry.decidedAt).slice(0, 7) === m;
      })
      .slice()
      .sort(function (a, b) {
        return (a.sequence || 0) - (b.sequence || 0);
      });
  }

  return {
    KIND: KIND,
    KINDS: KINDS,
    PROMOTION_MINIMUMS: PROMOTION_MINIMUMS,
    createLog: createLog,
    looksLikePatientIdentifier: looksLikePatientIdentifier,
    validateDecision: validateDecision,
    appendDecision: appendDecision,
    listDecisions: listDecisions,
    resolveConfigAt: resolveConfigAt,
    decisionsInMonth: decisionsInMonth,
  };
});
