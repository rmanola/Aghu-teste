/**
 * FEAT-132 — Revisão de limiares / bandas de interpretação.
 *
 * Distribuição observada, travessias de banda e contrafactual de cortes
 * alternativos sobre a mesma série (CPIRET-AC-05/06). Devolve contagens —
 * **nunca** campo de recomendação nem escreve banda (CPIRET-AC-07, estrutural).
 *
 * Bandas por omissão alinham-se ao painel (FEAT-121): verde 0,85–1,15;
 * vermelho <0,70 ou >1,35; âmbar no restante (quando o ponto é colorável).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiThresholdReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BANDS = Object.freeze({
    greenMin: 0.85,
    greenMax: 1.15,
    redLow: 0.7,
    redHigh: 1.35,
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

  function pointValue(point) {
    if (!point || point.suppressed) return null;
    var v = finiteOrNull(point.value);
    if (v != null) return v;
    return finiteOrNull(point.ratio);
  }

  function normalizeBands(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    return {
      greenMin:
        finiteOrNull(src.greenMin) != null
          ? Number(src.greenMin)
          : DEFAULT_BANDS.greenMin,
      greenMax:
        finiteOrNull(src.greenMax) != null
          ? Number(src.greenMax)
          : DEFAULT_BANDS.greenMax,
      redLow:
        finiteOrNull(src.redLow) != null
          ? Number(src.redLow)
          : DEFAULT_BANDS.redLow,
      redHigh:
        finiteOrNull(src.redHigh) != null
          ? Number(src.redHigh)
          : DEFAULT_BANDS.redHigh,
    };
  }

  /**
   * Classifica um valor O/E nas bandas do painel.
   * @returns {"green"|"amber"|"red"|null}
   */
  function classifyBand(value, bands) {
    if (value == null || !Number.isFinite(value)) return null;
    if (value >= bands.greenMin && value <= bands.greenMax) return "green";
    if (value < bands.redLow || value > bands.redHigh) return "red";
    return "amber";
  }

  /** Fora da banda verde → “cross” no sentido de travessia de atenção. */
  function wouldCross(value, bands) {
    var c = classifyBand(value, bands);
    return c === "amber" || c === "red";
  }

  /** Fora do verde E no vermelho → “signal” contrafactual (corte severo). */
  function wouldSignal(value, bands) {
    return classifyBand(value, bands) === "red";
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var idx = (sorted.length - 1) * p;
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    var w = idx - lo;
    return sorted[lo] * (1 - w) + sorted[hi] * w;
  }

  function distributionOf(values) {
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var n = sorted.length;
    if (!n) {
      return { min: null, p25: null, median: null, p75: null, max: null, n: 0 };
    }
    return {
      min: sorted[0],
      p25: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      max: sorted[n - 1],
      n: n,
    };
  }

  function collectValues(trend) {
    var values = [];
    var points = asArray(trend && trend.points);
    for (var i = 0; i < points.length; i++) {
      var v = pointValue(points[i]);
      if (v != null) values.push(v);
    }
    return values;
  }

  function countCrossings(values, bands) {
    var crossings = { green: 0, amber: 0, red: 0 };
    for (var i = 0; i < values.length; i++) {
      var c = classifyBand(values[i], bands);
      if (c && crossings[c] != null) crossings[c] += 1;
    }
    return crossings;
  }

  function countSignals(trend) {
    return asArray(trend && trend.signals).length;
  }

  function counterfactualFor(values, alternativeBands) {
    var alts = asArray(alternativeBands);
    var out = [];
    for (var i = 0; i < alts.length; i++) {
      var band = normalizeBands(alts[i]);
      var wouldSig = 0;
      var wouldCr = 0;
      for (var v = 0; v < values.length; v++) {
        if (wouldSignal(values[v], band)) wouldSig += 1;
        if (wouldCross(values[v], band)) wouldCr += 1;
      }
      out.push({
        band: {
          greenMin: band.greenMin,
          greenMax: band.greenMax,
          redLow: band.redLow,
          redHigh: band.redHigh,
        },
        wouldSignal: wouldSig,
        wouldCross: wouldCr,
      });
    }
    return out;
  }

  /**
   * @param {Array<object>} trends — saídas de `buildIndicatorTrend`
   * @param {{
   *   bands?: object,
   *   alternativeBands?: Array<object>
   * }} [options]
   * @returns {Array<object>}
   */
  function buildThresholdReview(trends, options) {
    var opts = options && typeof options === "object" ? options : {};
    var bands = normalizeBands(opts.bands);
    // Cópia defensiva — nunca mutar o input do caller (CPIRET-AC-07).
    var alternativeBands = asArray(opts.alternativeBands).map(function (b) {
      return normalizeBands(b);
    });

    var list = asArray(trends).slice();
    list.sort(function (a, b) {
      var ai = str(a && a.indicatorId);
      var bi = str(b && b.indicatorId);
      if (ai !== bi) return ai < bi ? -1 : 1;
      return str(a && a.careLineId) < str(b && b.careLineId) ? -1 : 1;
    });

    var rows = [];
    for (var i = 0; i < list.length; i++) {
      var trend = list[i];
      if (!trend) continue;
      var values = collectValues(trend);
      rows.push({
        indicatorId: trend.indicatorId != null ? str(trend.indicatorId) : null,
        careLineId: trend.careLineId != null ? str(trend.careLineId) : null,
        distribution: distributionOf(values),
        crossings: countCrossings(values, bands),
        signals: countSignals(trend),
        counterfactual: counterfactualFor(values, alternativeBands),
      });
    }
    return rows;
  }

  return {
    DEFAULT_BANDS: DEFAULT_BANDS,
    classifyBand: classifyBand,
    buildThresholdReview: buildThresholdReview,
  };
});
