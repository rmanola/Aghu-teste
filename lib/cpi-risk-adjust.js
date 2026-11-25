/**
 * FEAT-115 — Motor O/E: estratificação, razão observado/esperado, IC95% Byar, small-n.
 * Byar: Rothman & Boice / OpenEpi SMR. minDenominator default 11 (CMS cell suppression).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiRiskAdjust = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_MIN_DENOMINATOR = 11;
  var Z = 1.96;
  var BYAR_O0_UPPER = 3.69;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * IC95% Byar sobre contagem observada O, dividido por esperado E.
   * @param {number} O
   * @param {number} E
   * @returns {{ lower: number, upper: number }}
   */
  function byarCi95(O, E) {
    if (!(E > 0)) {
      return { lower: null, upper: null };
    }
    if (O === 0) {
      return { lower: 0, upper: BYAR_O0_UPPER / E };
    }
    var sqrtO = Math.sqrt(O);
    var lowerObs =
      O * Math.pow(1 - 1 / (9 * O) - Z / (3 * sqrtO), 3);
    var Op1 = O + 1;
    var sqrtOp1 = Math.sqrt(Op1);
    var upperObs =
      Op1 * Math.pow(1 - 1 / (9 * Op1) + Z / (3 * sqrtOp1), 3);
    return { lower: lowerObs / E, upper: upperObs / E };
  }

  /**
   * @param {"lower_is_better"|"higher_is_better"|string|null|undefined} direction
   * @param {number|null} ratio
   * @returns {"worse"|"better"|"as_expected"|null}
   */
  function performanceFromRatio(direction, ratio) {
    if (ratio == null || !Number.isFinite(ratio)) return null;
    var dir = direction || "lower_is_better";
    if (ratio === 1) return "as_expected";
    if (dir === "higher_is_better") {
      if (ratio > 1) return "better";
      if (ratio < 1) return "worse";
    }
    // lower_is_better (default)
    if (ratio > 1) return "worse";
    if (ratio < 1) return "better";
    return "as_expected";
  }

  /**
   * @param {{
   *   strata: Array<{ key?: string, observed: number, denominator: number, expectedRate: number }>,
   *   minDenominator?: number,
   *   direction?: string
   * }} input
   */
  function computeObservedExpected(input) {
    var opts = input && typeof input === "object" ? input : {};
    var strata = asArray(opts.strata);
    var minDenominator =
      opts.minDenominator == null
        ? DEFAULT_MIN_DENOMINATOR
        : num(opts.minDenominator);
    var direction = opts.direction || "lower_is_better";

    var observed = 0;
    var denominator = 0;
    var expected = 0;
    for (var i = 0; i < strata.length; i++) {
      var s = strata[i] || {};
      var o = num(s.observed);
      var d = num(s.denominator);
      var rate = num(s.expectedRate);
      observed += o;
      denominator += d;
      expected += d * rate;
    }

    // CPI-AC-09: denominador 0 (ou esperado 0) → ratio null + suppressed
    if (denominator === 0 || expected === 0) {
      return {
        ratio: null,
        suppressed: true,
        reason: denominator === 0 ? "zero_denominator" : "zero_expected",
        observed: observed,
        denominator: denominator,
        expected: expected,
        ci95: { lower: null, upper: null },
        significant: false,
        performance: null,
      };
    }

    // CPI-AC-11: small_n — não expor contagens
    if (denominator < minDenominator) {
      return {
        suppressed: true,
        reason: "small_n",
        ratio: null,
        ci95: null,
        significant: false,
        performance: null,
      };
    }

    var ratio = observed / expected;
    var ci95 = byarCi95(observed, expected);
    var significant = !(ci95.lower <= 1 && 1 <= ci95.upper);
    var performance = performanceFromRatio(direction, ratio);

    return {
      observed: observed,
      denominator: denominator,
      expected: expected,
      ratio: ratio,
      ci95: ci95,
      significant: significant,
      suppressed: false,
      reason: null,
      performance: performance,
    };
  }

  /**
   * Estratos Charlson para O/E (CG-AC-06/07).
   * Casos com `charlson.confidence === "none"` (ou sem banda) → key `"unknown"`.
   * `expectedRate` do unknown = `expectedRates.unknown` ou média ponderada dos estratos conhecidos.
   *
   * @param {{
   *   cases?: Array<{
   *     observed?: boolean|number,
   *     charlson?: { confidence?: string, band?: string|null },
   *     charlsonBand?: string|null
   *   }>,
   *   expectedRates?: Record<string, number>
   * }} input
   * @returns {{
   *   strata: Array<{ key: string, observed: number, denominator: number, expectedRate: number }>,
   *   unknownShare: number|null
   * }}
   */
  function buildCharlsonStrata(input) {
    var opts = input && typeof input === "object" ? input : {};
    var cases = asArray(opts.cases);
    var expectedRates =
      opts.expectedRates && typeof opts.expectedRates === "object"
        ? opts.expectedRates
        : {};

    var buckets = Object.create(null);
    var unknownCount = 0;

    function ensureBucket(key) {
      if (!buckets[key]) {
        buckets[key] = { key: key, observed: 0, denominator: 0 };
      }
      return buckets[key];
    }

    for (var i = 0; i < cases.length; i++) {
      var c = cases[i] || {};
      var ch = c.charlson && typeof c.charlson === "object" ? c.charlson : null;
      var confidence = ch && ch.confidence != null ? String(ch.confidence) : "";
      var bandRaw =
        ch && ch.band != null && String(ch.band)
          ? String(ch.band)
          : c.charlsonBand != null && String(c.charlsonBand)
            ? String(c.charlsonBand)
            : "";
      var key =
        confidence === "none" || !bandRaw || bandRaw === "unknown"
          ? "unknown"
          : bandRaw;
      if (key === "unknown") unknownCount += 1;

      var obs = c.observed;
      var observedN =
        typeof obs === "boolean" ? (obs ? 1 : 0) : num(obs);

      var b = ensureBucket(key);
      b.denominator += 1;
      b.observed += observedN;
    }

    var knownKeys = Object.keys(buckets).filter(function (k) {
      return k !== "unknown";
    });
    var knownDen = 0;
    var knownExpectedMass = 0;
    for (var k = 0; k < knownKeys.length; k++) {
      var kk = knownKeys[k];
      var den = buckets[kk].denominator;
      var rate = num(expectedRates[kk]);
      knownDen += den;
      knownExpectedMass += den * rate;
    }
    var weightedUnknownRate =
      knownDen > 0 ? knownExpectedMass / knownDen : 0;
    var unknownRate =
      expectedRates.unknown != null && Number.isFinite(Number(expectedRates.unknown))
        ? Number(expectedRates.unknown)
        : weightedUnknownRate;

    var strata = [];
    var allKeys = Object.keys(buckets).sort(function (a, b) {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    for (var s = 0; s < allKeys.length; s++) {
      var keyS = allKeys[s];
      var row = buckets[keyS];
      strata.push({
        key: keyS,
        observed: row.observed,
        denominator: row.denominator,
        expectedRate: keyS === "unknown" ? unknownRate : num(expectedRates[keyS]),
      });
    }

    return {
      strata: strata,
      unknownShare: cases.length === 0 ? null : unknownCount / cases.length,
    };
  }

  return {
    DEFAULT_MIN_DENOMINATOR: DEFAULT_MIN_DENOMINATOR,
    byarCi95: byarCi95,
    performanceFromRatio: performanceFromRatio,
    computeObservedExpected: computeObservedExpected,
    buildCharlsonStrata: buildCharlsonStrata,
  };
});
