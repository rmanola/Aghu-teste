/**
 * FEAT-132 — Retrospectiva de decisão de governança.
 *
 * Compara a série de um indicador antes e depois de `effectiveFrom`. Desenho
 * fraco (sem braço de controlo): por isso `causalityCaveat` é um **campo** de
 * cada linha — viaja para o export e para a UI (CPIRET-AC-02) — e as
 * explicações concorrentes listam sinais, quebras e deriva FEAT-131
 * (CPIRET-AC-04/08).
 *
 * Recusa com períodos insuficientes (mínimo = `minPoints` da FEAT-126) em vez
 * de publicar ruído com ressalva (CPIRET-AC-03). Ponto suprimido fica fora dos
 * dois lados e conta como lacuna (CPIRET-AC-11). Decisão sem série →
 * `not_evaluable`, nunca omitida (CPIRET-AC-12).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiDecisionRetrospective = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Alinhado a CPITRD-AC-04 / FEAT-126 `DEFAULT_MIN_POINTS`. */
  var DEFAULT_MIN_PERIODS_EACH_SIDE = 8;

  /**
   * Redacção fixa — campo estrutural, não rodapé (CPIRET-AC-02).
   * O comité lê a diferença; esta frase impede que a diferença seja lida como
   * efeito da decisão.
   */
  var CAUSALITY_CAVEAT =
    "antes-depois não estabelece causalidade";

  var STATUS = Object.freeze({
    COMPARED: "compared",
    INSUFFICIENT: "insufficient_periods",
    NOT_EVALUABLE: "not_evaluable",
  });

  var EXPLANATION_KIND = Object.freeze({
    SPECIAL_CAUSE: "special_cause",
    SERIES_BREAK: "series_break",
    MODEL_DRIFT: "model_drift",
  });

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function finiteOrNull(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isoDate(v) {
    var s = str(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
  }

  function periodFrom(point) {
    var p = point && point.period;
    if (!p) return { from: "", to: "", label: "" };
    return {
      from: str(p.from),
      to: str(p.to),
      label: str(p.label || p.to || p.from),
    };
  }

  function pointValue(point) {
    if (!point || point.suppressed) return null;
    var v = finiteOrNull(point.value);
    if (v != null) return v;
    return finiteOrNull(point.ratio);
  }

  /**
   * Antes: período termina estritamente antes de `effectiveFrom`.
   * Depois: período começa em ou após `effectiveFrom`.
   * Períodos a cavalo ficam de fora (não enviesam nenhum lado).
   */
  function sideOfPoint(point, effectiveFrom) {
    var p = periodFrom(point);
    if (p.to && p.to < effectiveFrom) return "before";
    if (p.from && p.from >= effectiveFrom) return "after";
    return null;
  }

  function meanOf(values) {
    if (!values.length) return null;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }

  function directionOf(delta) {
    if (delta == null || !Number.isFinite(delta)) return null;
    if (delta > 0) return "up";
    if (delta < 0) return "down";
    return "flat";
  }

  /**
   * Escolhe a série associada à decisão (CPIRET-AC-01/12).
   * Preferência: `indicatorId === target`, depois `careLineId === target`.
   * Empate → ordem lexicográfica de `indicatorId` (determinismo CPIRET-AC-09).
   */
  function findTrendForDecision(decision, trends) {
    var target = str(decision && decision.target).trim();
    var indicatorHint = str(
      decision && (decision.indicatorId || (decision.evidence && decision.evidence.indicatorId)),
    ).trim();
    var list = asArray(trends);
    var matches = [];

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t) continue;
      var ind = str(t.indicatorId);
      var line = str(t.careLineId);
      if (indicatorHint && ind === indicatorHint) {
        matches.push(t);
        continue;
      }
      if (target && (ind === target || line === target)) {
        matches.push(t);
      }
    }

    if (!matches.length) return null;
    matches.sort(function (a, b) {
      var ai = str(a.indicatorId);
      var bi = str(b.indicatorId);
      if (ai !== bi) return ai < bi ? -1 : 1;
      return str(a.careLineId) < str(b.careLineId) ? -1 : 1;
    });
    for (var j = 0; j < matches.length; j++) {
      if (str(matches[j].indicatorId) === target) return matches[j];
      if (indicatorHint && str(matches[j].indicatorId) === indicatorHint) {
        return matches[j];
      }
    }
    return matches[0];
  }

  function collectSignalsOnSide(trend, side, effectiveFrom) {
    var signals = asArray(trend && trend.signals);
    var count = 0;
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s) continue;
      var label = str(s.periodLabel);
      var points = asArray(trend.points);
      var point = null;
      for (var p = 0; p < points.length; p++) {
        if (periodFrom(points[p]).label === label) {
          point = points[p];
          break;
        }
      }
      if (!point) continue;
      if (sideOfPoint(point, effectiveFrom) !== side) continue;
      count += 1;
    }
    return count;
  }

  /**
   * Explicações concorrentes no intervalo comparado (CPIRET-AC-04/08 + deriva).
   * Sinal cujo período coincide com a data da decisão NÃO entra.
   */
  function buildCompetingExplanations(trend, effectiveFrom, modelDrift, decision) {
    var out = [];
    var points = asArray(trend && trend.points);
    var signals = asArray(trend && trend.signals);

    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s) continue;
      var label = str(s.periodLabel);
      var point = null;
      for (var p = 0; p < points.length; p++) {
        var pf = periodFrom(points[p]);
        if (pf.label === label) {
          point = points[p];
          break;
        }
      }
      if (!point) continue;
      var side = sideOfPoint(point, effectiveFrom);
      if (!side) continue;
      var per = periodFrom(point);
      var coincides = per.from <= effectiveFrom && effectiveFrom <= per.to;
      if (coincides) continue;
      out.push({
        kind: EXPLANATION_KIND.SPECIAL_CAUSE,
        period: label,
        detail: str(s.rule) + (s.direction ? " (" + str(s.direction) + ")" : ""),
      });
    }

    for (var b = 0; b < points.length; b++) {
      var br = points[b] && points[b].breakBefore;
      if (!br) continue;
      var sideB = sideOfPoint(points[b], effectiveFrom);
      if (sideB == null) {
        var pb = periodFrom(points[b]);
        if (!(pb.to >= effectiveFrom || pb.from >= effectiveFrom)) continue;
      }
      out.push({
        kind: EXPLANATION_KIND.SERIES_BREAK,
        period: periodFrom(points[b]).label,
        detail: str(br.reason) || "definition_break",
      });
    }

    var drifts = asArray(modelDrift);
    var target = str(decision && decision.target);
    for (var d = 0; d < drifts.length; d++) {
      var dr = drifts[d];
      if (!dr || !dr.drift) continue;
      if (
        dr.careLineId != null &&
        target &&
        str(dr.careLineId) !== target &&
        str(dr.careLineId) !== str(trend && trend.careLineId)
      ) {
        continue;
      }
      // Só no intervalo comparado (mesmo critério de sinais / quebras).
      var driftPeriod = str(dr.drift.period);
      var driftInWindow = false;
      for (var dp = 0; dp < points.length; dp++) {
        var sideD = sideOfPoint(points[dp], effectiveFrom);
        if (!sideD) continue;
        if (periodFrom(points[dp]).label === driftPeriod) {
          driftInWindow = true;
          break;
        }
      }
      if (!driftInWindow) continue;
      out.push({
        kind: EXPLANATION_KIND.MODEL_DRIFT,
        period: driftPeriod,
        detail:
          str(dr.drift.kind || "") +
          (dr.drift.rule ? " · " + str(dr.drift.rule) : ""),
      });
    }

    out.sort(function (a, z) {
      if (a.period !== z.period) return a.period < z.period ? -1 : 1;
      if (a.kind !== z.kind) return a.kind < z.kind ? -1 : 1;
      return a.detail < z.detail ? -1 : a.detail > z.detail ? 1 : 0;
    });
    return out;
  }

  /**
   * Quebra na fronteira before/after: só o primeiro ponto "after"
   * (breakBefore = transição imediatamente antes desse ponto).
   */
  function crossesBreakBetweenSides(trend, effectiveFrom) {
    var points = asArray(trend && trend.points);
    for (var i = 0; i < points.length; i++) {
      if (sideOfPoint(points[i], effectiveFrom) !== "after") continue;
      return !!(points[i] && points[i].breakBefore);
    }
    return false;
  }

  function summariseSide(points, side, effectiveFrom, trend) {
    var usableValues = [];
    var gaps = 0;
    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (sideOfPoint(pt, effectiveFrom) !== side) continue;
      if (pt.suppressed) {
        gaps += 1;
        continue;
      }
      var v = pointValue(pt);
      if (v == null) {
        gaps += 1;
        continue;
      }
      usableValues.push(v);
    }
    return {
      periods: usableValues.length,
      mean: meanOf(usableValues),
      signals: collectSignalsOnSide(trend, side, effectiveFrom),
      gaps: gaps,
    };
  }

  function baseRow(decision) {
    return {
      decisionId: str(decision && (decision.decisionId || decision.id)),
      kind: str(decision && decision.kind),
      target: decision && decision.target != null ? str(decision.target) : null,
      effectiveFrom:
        isoDate(decision && decision.effectiveFrom) ||
        str(decision && decision.effectiveFrom),
      status: STATUS.NOT_EVALUABLE,
      before: null,
      after: null,
      delta: null,
      competingExplanations: [],
      crossesBreak: false,
      causalityCaveat: CAUSALITY_CAVEAT,
      missingPeriods: null,
    };
  }

  /**
   * @param {Array<object>} decisions — entradas do registo (FEAT-128)
   * @param {Array<object>} trends — saídas de `buildIndicatorTrend`
   * @param {{
   *   minPeriodsEachSide?: number,
   *   modelDrift?: Array<object>|null
   * }} [options]
   * @returns {Array<object>}
   */
  function buildDecisionRetrospective(decisions, trends, options) {
    var opts = options && typeof options === "object" ? options : {};
    var minEach =
      opts.minPeriodsEachSide != null &&
      Number.isFinite(Number(opts.minPeriodsEachSide))
        ? Math.max(1, Number(opts.minPeriodsEachSide))
        : DEFAULT_MIN_PERIODS_EACH_SIDE;
    var modelDrift = asArray(opts.modelDrift);
    var list = asArray(decisions).slice();

    list.sort(function (a, b) {
      var ea = str(a && a.effectiveFrom);
      var eb = str(b && b.effectiveFrom);
      if (ea !== eb) return ea < eb ? -1 : 1;
      var ia = str(a && (a.decisionId || a.id));
      var ib = str(b && (b.decisionId || b.id));
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });

    var rows = [];
    for (var i = 0; i < list.length; i++) {
      var decision = list[i];
      var row = baseRow(decision);
      var effectiveFrom = isoDate(decision && decision.effectiveFrom);
      if (!effectiveFrom) {
        row.status = STATUS.NOT_EVALUABLE;
        rows.push(row);
        continue;
      }
      row.effectiveFrom = effectiveFrom;

      var trend = findTrendForDecision(decision, trends);
      if (!trend || !asArray(trend.points).length) {
        row.status = STATUS.NOT_EVALUABLE;
        rows.push(row);
        continue;
      }

      var points = asArray(trend.points);
      var before = summariseSide(points, "before", effectiveFrom, trend);
      var after = summariseSide(points, "after", effectiveFrom, trend);

      var needBefore = Math.max(0, minEach - before.periods);
      var needAfter = Math.max(0, minEach - after.periods);
      var missing = needBefore + needAfter;

      row.before = {
        periods: before.periods,
        mean: before.mean,
        signals: before.signals,
        gaps: before.gaps,
      };
      row.after = {
        periods: after.periods,
        mean: after.mean,
        signals: after.signals,
        gaps: after.gaps,
      };
      row.competingExplanations = buildCompetingExplanations(
        trend,
        effectiveFrom,
        modelDrift,
        decision,
      );
      row.crossesBreak = crossesBreakBetweenSides(trend, effectiveFrom);

      if (missing > 0) {
        row.status = STATUS.INSUFFICIENT;
        row.missingPeriods = missing;
        row.delta = null;
        rows.push(row);
        continue;
      }

      var deltaValue =
        before.mean != null && after.mean != null
          ? after.mean - before.mean
          : null;
      row.status = STATUS.COMPARED;
      row.missingPeriods = null;
      row.delta = {
        value: deltaValue,
        direction: directionOf(deltaValue),
      };
      rows.push(row);
    }

    return rows;
  }

  return {
    CAUSALITY_CAVEAT: CAUSALITY_CAVEAT,
    DEFAULT_MIN_PERIODS_EACH_SIDE: DEFAULT_MIN_PERIODS_EACH_SIDE,
    STATUS: STATUS,
    EXPLANATION_KIND: EXPLANATION_KIND,
    buildDecisionRetrospective: buildDecisionRetrospective,
  };
});
