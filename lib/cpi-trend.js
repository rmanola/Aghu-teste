/**
 * FEAT-126 — Tendência temporal CPI e controlo estatístico de processo.
 *
 * Separa variação comum de causa especial com TRÊS regras fixas (Shewhart /
 * Western Electric reduzido), declaradas antes de olhar para os dados e iguais
 * para todos os indicadores: um conjunto ajustável em runtime seria um gerador
 * de achados (CPITRD-AC-12).
 *
 * Funnel plot (O/E): limites em função do esperado `E` de cada ponto, pela
 * mesma família de fórmulas de `cpi-risk-adjust.js` (`byarCi95`,
 * Wilson–Hilferty sobre a Poisson) — nunca um desvio-padrão constante
 * (CPITRD-AC-03). p-chart (proporções): `p̄ ± k·√(p̄(1−p̄)/nᵢ)`, largura por
 * ponto porque `nᵢ` varia.
 *
 * Ponto suprimido é lacuna: continua visível e nunca alimenta regra
 * (CPITRD-AC-02). Mudança de `MATCH_VERSION` ou da versão do registo de
 * referências marca `breakBefore` e interrompe as regras de sequência
 * (CPITRD-AC-09). FEAT-129 acrescenta a versão do registo de decisão
 * (`decisionRegistryVersion`) como terceira causa.
 * (CPITRD-AC-09). Abaixo de `minPoints` pontos publicáveis a série apresenta-se
 * sem limites, em vez de os estimar (CPITRD-AC-04).
 *
 * Referências: Shewhart (gráfico de controlo); ASQ, «Control Chart»; IHI, «100th
 * anniversary of the Shewhart chart»; Spiegelhalter, funnel plots para
 * comparação institucional (ICVTS doi:10.1510/icvts.2009.204768).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiTrend = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var periodApi = load("quality-period-range.js", "AghuQualityPeriodRange");
  var riskAdjustApi = load("cpi-risk-adjust.js", "AghuCpiRiskAdjust");

  /** Pontos publicáveis mínimos antes de estimar limites (CPITRD-AC-04). */
  var DEFAULT_MIN_POINTS = 8;
  /** Supressão por n pequeno — mesmo limiar do resto do CPI (CMS cell suppression). */
  var DEFAULT_MIN_DENOMINATOR =
    riskAdjustApi && riskAdjustApi.DEFAULT_MIN_DENOMINATOR != null
      ? riskAdjustApi.DEFAULT_MIN_DENOMINATOR
      : 11;

  /** Banda 95% (`sigma2`) e banda 99,8% (`sigma3`) do funnel plot. */
  var Z_95 = 1.959963985;
  var Z_998 = 3.090232306;
  /** p-chart: 2σ e 3σ sobre o erro-padrão binomial. */
  var K_SIGMA2 = 2;
  var K_SIGMA3 = 3;

  /**
   * As três regras. Congeladas e sem predicado injectável: o conjunto é uma
   * decisão registada do comité, não um parâmetro de chamada (CPITRD-AC-12).
   */
  var RULES = Object.freeze([
    Object.freeze({
      id: "beyond_control_limits",
      window: 1,
      description: "ponto além dos limites de 99,8%",
    }),
    Object.freeze({
      id: "run",
      window: 7,
      description: "sete pontos consecutivos do mesmo lado da linha central",
    }),
    Object.freeze({
      id: "two_of_three",
      window: 3,
      description: "dois de três pontos consecutivos além de 2σ do mesmo lado",
    }),
  ]);

  var RULE_IDS = Object.freeze(
    RULES.map(function (r) {
      return r.id;
    }),
  );

  var STABILITY = Object.freeze({
    STABLE: "stable",
    SPECIAL_CAUSE: "special_cause",
    INSUFFICIENT_POINTS: "insufficient_points",
  });

  var CHARTS = Object.freeze({
    FUNNEL: "funnel",
    PCHART: "pchart",
    /** Shewhart de indivíduos — série de valores (ex.: declive de calibração). */
    INDIVIDUAL: "individual",
  });

  /** Factor d₂ para amplitude móvel de n=2 (I–MR chart). */
  var MOVING_RANGE_D2 = 1.128;

  /** Filtros clínicos propagados no drill-down (espelha `QualityFilters`). */
  var DRILL_FILTER_KEYS = Object.freeze([
    "dx",
    "proc",
    "chefe",
    "profissional",
    "comp",
    "gap",
  ]);

  var PUBLISHED_LIFECYCLE = "active";

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function finiteOrNull(v) {
    if (v == null) return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function isoDate(value) {
    if (periodApi && typeof periodApi.toIsoDateLocal === "function") {
      return periodApi.toIsoDateLocal(value);
    }
    var raw = str(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
  }

  /** @param {string} iso YYYY-MM-DD */
  function nextDayIso(iso) {
    var parts = iso.split("-");
    var d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    d.setDate(d.getDate() + 1);
    return (
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    );
  }

  /** Trimestres civis: T1 = jan–mar, T2 = abr–jun, T3 = jul–set, T4 = out–dez. */
  var QUARTER_SPANS = Object.freeze([
    Object.freeze(["01-01", "03-31"]),
    Object.freeze(["04-01", "06-30"]),
    Object.freeze(["07-01", "09-30"]),
    Object.freeze(["10-01", "12-31"]),
  ]);

  /** @param {number} absoluteQuarter ano*4 + índice do trimestre (0..3) */
  function quarterWindow(absoluteQuarter) {
    var year = Math.floor(absoluteQuarter / 4);
    var q = absoluteQuarter - year * 4;
    var span = QUARTER_SPANS[q];
    return {
      from: year + "-" + span[0],
      to: year + "-" + span[1],
      label: year + "-T" + (q + 1),
    };
  }

  /**
   * Janelas trimestrais consecutivas terminando no trimestre que contém `asOf`.
   * É o default da série (Clarificação 6 do spec: trimestre em linhas de baixo
   * volume, porque a janela mensal produziria quase só pontos suprimidos).
   *
   * @param {string|Date|null|undefined} asOf — hoje quando omitido
   * @param {number} [count=8] número de janelas
   * @returns {Array<{ from: string, to: string, label: string }>} da mais antiga
   *   para a mais recente, já consecutivas por construção
   */
  function listTrailingCalendarQuarters(asOf, count) {
    var n = finiteOrNull(count);
    if (n == null) n = DEFAULT_MIN_POINTS;
    n = Math.floor(n);
    if (n < 1) {
      throw new Error("cpi-trend: count de trimestres deve ser >= 1");
    }

    var year;
    var month;
    if (asOf == null || (typeof asOf === "string" && !asOf.trim())) {
      var today = new Date();
      year = today.getFullYear();
      month = today.getMonth() + 1;
    } else {
      var iso = isoDate(asOf);
      if (!iso) {
        throw new Error("cpi-trend: asOf inválido para listar trimestres");
      }
      var parts = iso.split("-");
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    }

    var lastAbsolute = year * 4 + Math.floor((month - 1) / 3);

    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      out.push(quarterWindow(lastAbsolute - i));
    }
    return out;
  }

  /**
   * CPITRD-AC-01: janelas consecutivas e não sobrepostas. Fail-fast na
   * fronteira — uma série montada sobre janelas com falha de continuidade
   * mostraria como variação clínica o que é falha de agregação.
   * @param {Array<{ from: string, to: string, label: string }>} periods
   * @returns {Array<{ from: string, to: string, label: string }>} normalizadas
   */
  function assertConsecutivePeriods(periods) {
    if (!Array.isArray(periods)) {
      throw new Error(
        "cpi-trend: periods deve ser um array de { from, to, label }",
      );
    }
    if (periods.length === 0) {
      throw new Error("cpi-trend: periods vazio — nenhuma janela para a série");
    }

    var out = [];
    var seenLabels = Object.create(null);

    for (var i = 0; i < periods.length; i++) {
      var p = periods[i] && typeof periods[i] === "object" ? periods[i] : null;
      if (!p) {
        throw new Error("cpi-trend: janela [" + i + "] não é um objecto");
      }
      var label = str(p.label).trim();
      if (!label) {
        throw new Error("cpi-trend: janela [" + i + "] sem label");
      }
      if (seenLabels[label]) {
        throw new Error("cpi-trend: label de janela repetido: " + label);
      }
      seenLabels[label] = true;

      var from = isoDate(p.from);
      var to = isoDate(p.to);
      if (!from || !to) {
        throw new Error(
          "cpi-trend: janela " + label + " com from/to inválido ou ausente",
        );
      }
      if (from > to) {
        throw new Error(
          "cpi-trend: janela " + label + " com from posterior a to",
        );
      }

      if (i > 0) {
        var prev = out[i - 1];
        if (from <= prev.to) {
          throw new Error(
            "cpi-trend: janelas sobrepostas entre " + prev.label + " e " + label,
          );
        }
        var expectedFrom = nextDayIso(prev.to);
        if (from !== expectedFrom) {
          throw new Error(
            "cpi-trend: gap (lacuna) de continuidade entre " +
              prev.label +
              " e " +
              label +
              " — esperado from " +
              expectedFrom +
              ", recebido " +
              from,
          );
        }
      }

      out.push({ from: from, to: to, label: label });
    }

    return out;
  }

  /**
   * Banda de controlo da razão O/E para um esperado `E`, na mesma família de
   * `byarCi95` (Wilson–Hilferty sobre a Poisson). Inferior truncado em 0.
   * @param {number} expected
   * @param {number} z
   * @returns {[number, number]|null}
   */
  function poissonRatioBand(expected, z) {
    var E = finiteOrNull(expected);
    if (E == null || !(E > 0)) return null;
    var zz = finiteOrNull(z);
    if (zz == null) return null;

    var lowerFactor = 1 - 1 / (9 * E) - zz / (3 * Math.sqrt(E));
    var lower = lowerFactor > 0 ? Math.pow(lowerFactor, 3) : 0;

    var Ep1 = E + 1;
    var upper =
      (Ep1 * Math.pow(1 - 1 / (9 * Ep1) + zz / (3 * Math.sqrt(Ep1)), 3)) / E;

    return [lower, upper];
  }

  /**
   * CPITRD-AC-03: limites do funnel plot derivados do esperado de cada ponto.
   * `sigma2` = banda 95%; `sigma3` = banda 99,8%, a da regra de ponto isolado.
   * @param {number} expected
   * @param {{ z2?: number, z3?: number }} [options]
   * @returns {{ sigma2: [number, number], sigma3: [number, number] }|null}
   */
  function funnelLimits(expected, options) {
    var opts = options && typeof options === "object" ? options : {};
    var z2 = opts.z2 == null ? Z_95 : opts.z2;
    var z3 = opts.z3 == null ? Z_998 : opts.z3;
    var sigma2 = poissonRatioBand(expected, z2);
    var sigma3 = poissonRatioBand(expected, z3);
    if (!sigma2 || !sigma3) return null;
    return { sigma2: sigma2, sigma3: sigma3 };
  }

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  /**
   * p-chart: `p̄ ± k·√(p̄(1−p̄)/n)`, truncado a [0, 1]. Largura por ponto —
   * limites constantes fariam períodos pequenos parecer estáveis.
   * @param {number} pBar
   * @param {number} n
   * @param {{ k2?: number, k3?: number }} [options]
   * @returns {{ sigma2: [number, number], sigma3: [number, number] }|null}
   */
  function pChartLimits(pBar, n, options) {
    var opts = options && typeof options === "object" ? options : {};
    var k2 = opts.k2 == null ? K_SIGMA2 : Number(opts.k2);
    var k3 = opts.k3 == null ? K_SIGMA3 : Number(opts.k3);
    var p = finiteOrNull(pBar);
    var size = finiteOrNull(n);
    if (p == null || p < 0 || p > 1) return null;
    if (size == null || !(size > 0)) return null;
    if (!Number.isFinite(k2) || !Number.isFinite(k3)) return null;

    var se = Math.sqrt((p * (1 - p)) / size);
    return {
      sigma2: [clamp01(p - k2 * se), clamp01(p + k2 * se)],
      sigma3: [clamp01(p - k3 * se), clamp01(p + k3 * se)],
    };
  }

  /**
   * CPITRD-AC-11: só linha `active` publica série. Sem `lifecycle` declarado
   * (stubs legados) publica, como em `aggregateCpi`.
   * @param {{ id?: string, lifecycle?: string }|null|undefined} line
   */
  function isPublishedCareLine(line) {
    if (!line || typeof line !== "object") return false;
    var life = str(line.lifecycle).trim();
    if (!life) return true;
    return life === PUBLISHED_LIFECYCLE;
  }

  function normalizeChart(chart) {
    var c = str(chart).trim().toLowerCase();
    if (!c) return CHARTS.FUNNEL;
    if (c === "funnel" || c === "funnel_plot") return CHARTS.FUNNEL;
    if (c === "pchart" || c === "p-chart" || c === "p_chart") {
      return CHARTS.PCHART;
    }
    if (c === "individual" || c === "i-chart" || c === "individuals") {
      return CHARTS.INDIVIDUAL;
    }
    throw new Error("cpi-trend: chart desconhecido: " + c);
  }

  /** Valor plotado do ponto: razão O/E no funnel, proporção no p-chart, valor no individual. */
  function resolveValue(chart, src) {
    var observed = finiteOrNull(src.observed);
    if (chart === CHARTS.INDIVIDUAL) {
      var v = finiteOrNull(src.value);
      if (v != null) return v;
      var asRatio = finiteOrNull(src.ratio);
      return asRatio;
    }
    if (chart === CHARTS.PCHART) {
      var rate = finiteOrNull(src.rate);
      if (rate != null) return rate;
      var direct = finiteOrNull(src.value);
      if (direct != null) return direct;
      var den = finiteOrNull(src.denominator);
      if (den != null && den > 0 && observed != null) return observed / den;
      return null;
    }
    var ratio = finiteOrNull(src.ratio);
    if (ratio != null) return ratio;
    var expected = finiteOrNull(src.expected);
    if (expected != null && expected > 0 && observed != null) {
      return observed / expected;
    }
    return null;
  }

  /**
   * Limites Shewhart de indivíduos a partir da média e do σ estimado pela
   * amplitude móvel média (MR̄ / d₂). Mesmas bandas 2σ / 3σ das outras cartas.
   * @param {number} centerLine
   * @param {number} sigma
   */
  function individualLimits(centerLine, sigma) {
    var cl = finiteOrNull(centerLine);
    var s = finiteOrNull(sigma);
    if (cl == null || s == null || !(s > 0)) return null;
    return {
      sigma2: [cl - K_SIGMA2 * s, cl + K_SIGMA2 * s],
      sigma3: [cl - K_SIGMA3 * s, cl + K_SIGMA3 * s],
    };
  }

  /**
   * σ do gráfico de indivíduos: média das amplitudes móveis / d₂.
   * @param {number[]} values ordenados no tempo (só pontos publicáveis)
   */
  function estimateIndividualSigma(values) {
    if (!Array.isArray(values) || values.length < 2) return null;
    var sumMr = 0;
    var nMr = 0;
    for (var i = 1; i < values.length; i++) {
      var a = finiteOrNull(values[i - 1]);
      var b = finiteOrNull(values[i]);
      if (a == null || b == null) continue;
      sumMr += Math.abs(b - a);
      nMr += 1;
    }
    if (nMr < 1) return null;
    return sumMr / nMr / MOVING_RANGE_D2;
  }

  function sideOf(value, centerLine) {
    if (value == null || centerLine == null) return null;
    if (value > centerLine) return "above";
    if (value < centerLine) return "below";
    return "on";
  }

  /** Lado em que o ponto excede a banda, ou null. Fronteira não é sinal. */
  function exceedSide(value, band) {
    if (value == null || !band) return null;
    if (value > band[1]) return "above";
    if (value < band[0]) return "below";
    return null;
  }

  /** Motivo da quebra entre dois pontos adjacentes, ou null. */
  function breakReason(prev, cur) {
    var prevMatch = prev.matchVersion;
    var curMatch = cur.matchVersion;
    if (prevMatch != null && curMatch != null && prevMatch !== curMatch) {
      return "match_version";
    }
    var prevRegistry = prev.registryVersion;
    var curRegistry = cur.registryVersion;
    if (
      prevRegistry != null &&
      curRegistry != null &&
      prevRegistry !== curRegistry
    ) {
      return "registry_version";
    }
    // FEAT-129 (CPICFG-AC-10): versão do registo de decisão entre períodos.
    var prevDecision = prev.decisionRegistryVersion;
    var curDecision = cur.decisionRegistryVersion;
    if (
      prevDecision != null &&
      curDecision != null &&
      prevDecision !== curDecision
    ) {
      return "decision_registry_version";
    }
    // FEAT-131 (CPIDRF-AC-07): promoção de linha muda a composição da coorte.
    var prevPromo = prev.careLinePromotionVersion;
    var curPromo = cur.careLinePromotionVersion;
    if (prevPromo != null && curPromo != null && prevPromo !== curPromo) {
      return "care_line_promotion";
    }
    return null;
  }

  /**
   * Série de um indicador por janelas consecutivas, com limites de controlo,
   * sinais de causa especial e o resumo de estabilidade que a FEAT-128 consome.
   *
   * @param {Array<{
   *   period: { from: string, to: string, label: string },
   *   observed?: number, expected?: number, ratio?: number, rate?: number,
   *   denominator?: number, suppressed?: boolean, reason?: string,
   *   ci95?: [number, number]|null,
   *   matchVersion?: number, registryVersion?: number,
   *   decisionRegistryVersion?: number,
   *   chart?: "funnel"|"pchart"
   * }>} aggregatesByPeriod — ordenado por janela
   * @param {{
   *   indicatorId?: string, careLineId?: string,
   *   careLine?: { id?: string, lifecycle?: string },
   *   careLineLifecycle?: string,
   *   chart?: "funnel"|"pchart",
   *   minPoints?: number, minDenominator?: number, centerLine?: number
   * }} [options]
   */
  function buildIndicatorTrend(aggregatesByPeriod, options) {
    var opts = options && typeof options === "object" ? options : {};

    // CPITRD-AC-12: escolher a regra depois de ver a série é escolher a conclusão.
    if (opts.rules !== undefined) {
      throw new Error(
        "cpi-trend: as três regras são fixas em código — options.rules não é aceite (CPITRD-AC-12)",
      );
    }

    // CPITRD-AC-11: linha em candidate não publica série.
    if (opts.careLine !== undefined && !isPublishedCareLine(opts.careLine)) {
      throw new Error(
        "cpi-trend: linha de cuidado " +
          (str(opts.careLine && opts.careLine.id) || "?") +
          " não publicada (lifecycle " +
          (str(opts.careLine && opts.careLine.lifecycle) || "ausente") +
          ") — fora das séries publicadas (CPITRD-AC-11)",
      );
    }
    if (opts.careLineLifecycle !== undefined) {
      var declaredLifecycle = str(opts.careLineLifecycle).trim();
      if (declaredLifecycle && declaredLifecycle !== PUBLISHED_LIFECYCLE) {
        throw new Error(
          "cpi-trend: lifecycle " +
            declaredLifecycle +
            " não publicado — fora das séries publicadas (CPITRD-AC-11)",
        );
      }
    }

    var raw = asArray(aggregatesByPeriod);
    var chart = normalizeChart(
      opts.chart != null && str(opts.chart) ? opts.chart : raw[0] && raw[0].chart,
    );

    var minPoints = finiteOrNull(opts.minPoints);
    if (minPoints == null || minPoints < 1) minPoints = DEFAULT_MIN_POINTS;
    var minDenominator = finiteOrNull(opts.minDenominator);
    if (minDenominator == null || minDenominator < 0) {
      minDenominator = DEFAULT_MIN_DENOMINATOR;
    }

    var periods = raw.length
      ? assertConsecutivePeriods(
          raw.map(function (p) {
            return p && p.period;
          }),
        )
      : [];

    var rows = [];
    for (var i = 0; i < raw.length; i++) {
      var src = raw[i] && typeof raw[i] === "object" ? raw[i] : {};
      var denominator = finiteOrNull(src.denominator);
      var value = resolveValue(chart, src);

      var suppressed = src.suppressed === true;
      var reason = suppressed ? str(src.reason) || "small_n" : null;
      // CPITRD-AC-02: n abaixo do mínimo é lacuna mesmo que o caller não marque.
      if (!suppressed && denominator != null && denominator < minDenominator) {
        suppressed = true;
        reason = "small_n";
      }
      if (!suppressed && value == null) {
        suppressed = true;
        reason = "no_value";
      }

      rows.push({
        period: periods[i],
        value: suppressed ? null : value,
        suppressed: suppressed,
        reason: reason,
        observed: finiteOrNull(src.observed),
        expected: finiteOrNull(src.expected),
        denominator: denominator,
        matchVersion: finiteOrNull(src.matchVersion),
        registryVersion: finiteOrNull(src.registryVersion),
        decisionRegistryVersion: finiteOrNull(src.decisionRegistryVersion),
        careLinePromotionVersion: finiteOrNull(src.careLinePromotionVersion),
        ci95: Array.isArray(src.ci95) ? src.ci95.slice() : null,
        breakBefore: null,
        limits: null,
        side: null,
        signals: [],
      });
    }

    // CPITRD-AC-09: quebra de definição entre dois pontos adjacentes.
    var breaks = [];
    for (var b = 1; b < rows.length; b++) {
      var reasonForBreak = breakReason(rows[b - 1], rows[b]);
      if (!reasonForBreak) continue;
      rows[b].breakBefore = { reason: reasonForBreak, from: b - 1, to: b };
      breaks.push({
        reason: reasonForBreak,
        from: b - 1,
        to: b,
        periodLabel: rows[b].period.label,
      });
    }

    var usable = [];
    for (var u = 0; u < rows.length; u++) {
      if (!rows[u].suppressed) usable.push(u);
    }

    // Linha central: 1 no funnel; p̄ dos pontos publicáveis no p-chart;
    // média dos valores no gráfico de indivíduos (FEAT-131).
    var centerLine = finiteOrNull(opts.centerLine);
    if (centerLine == null) {
      if (chart === CHARTS.FUNNEL) {
        centerLine = 1;
      } else if (chart === CHARTS.INDIVIDUAL) {
        var sumVal = 0;
        var nVal = 0;
        for (var iv = 0; iv < usable.length; iv++) {
          var rowIv = rows[usable[iv]];
          if (rowIv.value == null) continue;
          sumVal += rowIv.value;
          nVal += 1;
        }
        centerLine = nVal > 0 ? sumVal / nVal : null;
      } else {
        var sumObserved = 0;
        var sumDenominator = 0;
        for (var c = 0; c < usable.length; c++) {
          var rowC = rows[usable[c]];
          if (rowC.observed == null || rowC.denominator == null) continue;
          sumObserved += rowC.observed;
          sumDenominator += rowC.denominator;
        }
        centerLine = sumDenominator > 0 ? sumObserved / sumDenominator : null;
      }
    }

    // CPITRD-AC-04: série curta apresenta-se sem limites, em vez de os estimar.
    var hasEnoughPoints = usable.length >= minPoints && centerLine != null;

    var sharedIndividualLimits = null;
    if (hasEnoughPoints && chart === CHARTS.INDIVIDUAL) {
      var indValues = [];
      for (var sv = 0; sv < usable.length; sv++) {
        indValues.push(rows[usable[sv]].value);
      }
      sharedIndividualLimits = individualLimits(
        centerLine,
        estimateIndividualSigma(indValues),
      );
    }

    if (hasEnoughPoints) {
      for (var l = 0; l < usable.length; l++) {
        var rowL = rows[usable[l]];
        rowL.limits =
          chart === CHARTS.FUNNEL
            ? funnelLimits(rowL.expected)
            : chart === CHARTS.INDIVIDUAL
              ? sharedIndividualLimits
              : pChartLimits(centerLine, rowL.denominator);
        rowL.side = sideOf(rowL.value, centerLine);
        if (
          rowL.ci95 == null &&
          chart === CHARTS.FUNNEL &&
          riskAdjustApi &&
          typeof riskAdjustApi.byarCi95 === "function" &&
          rowL.observed != null &&
          rowL.expected != null &&
          rowL.expected > 0
        ) {
          var ci = riskAdjustApi.byarCi95(rowL.observed, rowL.expected);
          rowL.ci95 = ci && ci.lower != null ? [ci.lower, ci.upper] : null;
        }
      }
    }

    // Segmentos de pontos publicáveis contíguos: lacuna ou quebra interrompe a
    // janela deslizante — nenhuma sequência atravessa um buraco nem uma mudança
    // de definição (CPITRD-AC-02/09).
    var segments = [];
    var currentSegment = null;
    for (var s = 0; s < rows.length; s++) {
      if (rows[s].suppressed) {
        currentSegment = null;
        continue;
      }
      if (rows[s].breakBefore) currentSegment = null;
      if (!currentSegment) {
        currentSegment = [];
        segments.push(currentSegment);
      }
      currentSegment.push(s);
    }

    var signals = [];

    function emit(rule, index, direction, extra) {
      var signal = {
        rule: rule,
        periodLabel: rows[index].period.label,
        direction: direction,
      };
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) {
            signal[key] = extra[key];
          }
        }
      }
      signal.__index = index;
      signals.push(signal);
    }

    function mark(index, rule) {
      if (rows[index].signals.indexOf(rule) === -1) {
        rows[index].signals.push(rule);
      }
    }

    if (hasEnoughPoints) {
      // Regra 1 — ponto além dos limites de 99,8% (CPITRD-AC-05).
      for (var bo = 0; bo < usable.length; bo++) {
        var idxBeyond = usable[bo];
        var rowBeyond = rows[idxBeyond];
        var dirBeyond = rowBeyond.limits
          ? exceedSide(rowBeyond.value, rowBeyond.limits.sigma3)
          : null;
        if (!dirBeyond) continue;
        mark(idxBeyond, "beyond_control_limits");
        emit("beyond_control_limits", idxBeyond, dirBeyond);
      }

      for (var sg = 0; sg < segments.length; sg++) {
        var seg = segments[sg];

        // Regra 2 — sete do mesmo lado da linha central (CPITRD-AC-06).
        var runSide = null;
        var runStart = 0;
        var runLength = 0;
        for (var r = 0; r <= seg.length; r++) {
          var side = r < seg.length ? rows[seg[r]].side : null;
          var sided = side === "above" || side === "below";
          if (r < seg.length && sided && side === runSide) {
            runLength += 1;
            continue;
          }
          if (runLength >= 7) {
            emit("run", seg[runStart], runSide, { length: runLength });
            for (var m = runStart; m < runStart + runLength; m++) {
              mark(seg[m], "run");
            }
          }
          if (r < seg.length && sided) {
            runSide = side;
            runStart = r;
            runLength = 1;
          } else {
            runSide = null;
            runLength = 0;
          }
        }

        // Regra 3 — dois de três além de 2σ do mesmo lado (CPITRD-AC-07).
        var exceeds = [];
        for (var e = 0; e < seg.length; e++) {
          var rowE = rows[seg[e]];
          exceeds.push(
            rowE.limits ? exceedSide(rowE.value, rowE.limits.sigma2) : null,
          );
        }
        var participates = new Array(seg.length).fill(null);
        for (var j = 0; j < seg.length; j++) {
          if (!exceeds[j]) continue;
          for (var k = Math.max(0, j - 2); k < j; k++) {
            if (exceeds[k] === exceeds[j]) {
              participates[k] = exceeds[k];
              participates[j] = exceeds[j];
            }
          }
        }
        var cluster = null;
        for (var t = 0; t < seg.length; t++) {
          if (!participates[t]) continue;
          mark(seg[t], "two_of_three");
          if (cluster && cluster.side === participates[t] && t - cluster.last <= 2) {
            cluster.last = t;
            continue;
          }
          cluster = { side: participates[t], last: t };
          emit("two_of_three", seg[t], participates[t]);
        }
      }
    }

    // Ordem determinística: pelo ponto, depois pela ordem canónica das regras.
    signals.sort(function (a, z) {
      if (a.__index !== z.__index) return a.__index - z.__index;
      return RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(z.rule);
    });
    for (var d = 0; d < signals.length; d++) delete signals[d].__index;

    var points = rows.map(function (row) {
      var point = {
        period: row.period,
        suppressed: row.suppressed,
        suppressedReason: row.reason,
        value: row.value,
        ratio: chart === CHARTS.FUNNEL ? row.value : null,
        side: row.side,
        limits: row.limits,
        ci95: row.suppressed ? null : row.ci95,
        signals: RULE_IDS.filter(function (id) {
          return row.signals.indexOf(id) !== -1;
        }),
        breakBefore: row.breakBefore,
      };
      // Lacuna não expõe contagens (supressão da FEAT-115/120, CPITRD-AC-02).
      if (!row.suppressed) {
        if (row.observed != null) point.observed = row.observed;
        if (row.expected != null) point.expected = row.expected;
        if (row.denominator != null) point.denominator = row.denominator;
      }
      return point;
    });

    var stability = !hasEnoughPoints
      ? STABILITY.INSUFFICIENT_POINTS
      : signals.length > 0
        ? STABILITY.SPECIAL_CAUSE
        : STABILITY.STABLE;

    return {
      indicatorId: str(opts.indicatorId) || null,
      careLineId:
        str(opts.careLineId) || str(opts.careLine && opts.careLine.id) || null,
      chart: chart,
      centerLine: centerLine,
      minPoints: minPoints,
      minDenominator: minDenominator,
      usablePoints: usable.length,
      rules: RULE_IDS,
      points: points,
      signals: signals,
      breaks: breaks,
      stability: stability,
    };
  }

  /**
   * CPITRD-AC-14: detalhe do período com os filtros clínicos já aplicados.
   * Ponto suprimido não é drillable — abrir o detalhe de uma lacuna anularia a
   * supressão que a criou.
   * @param {object} trendSeries — saída de `buildIndicatorTrend`
   * @param {string} periodLabel
   * @param {Record<string, unknown>} [baseFilters]
   */
  function drillDownForPoint(trendSeries, periodLabel, baseFilters) {
    if (!trendSeries || !Array.isArray(trendSeries.points)) return null;
    var label = str(periodLabel).trim();
    if (!label) return null;

    var point = null;
    for (var i = 0; i < trendSeries.points.length; i++) {
      var candidate = trendSeries.points[i];
      if (candidate && candidate.period && candidate.period.label === label) {
        point = candidate;
        break;
      }
    }
    if (!point || point.suppressed) return null;

    var src = baseFilters && typeof baseFilters === "object" ? baseFilters : {};
    var filters = {};
    for (var f = 0; f < DRILL_FILTER_KEYS.length; f++) {
      var key = DRILL_FILTER_KEYS[f];
      if (src[key] == null) continue;
      var normalized = String(src[key]).trim();
      if (normalized) filters[key] = normalized;
    }

    return {
      indicatorId: trendSeries.indicatorId || null,
      careLineId: trendSeries.careLineId || null,
      periodLabel: point.period.label,
      from: point.period.from,
      to: point.period.to,
      filters: filters,
    };
  }

  return {
    RULES: RULES,
    RULE_IDS: RULE_IDS,
    STABILITY: STABILITY,
    CHARTS: CHARTS,
    DEFAULT_MIN_POINTS: DEFAULT_MIN_POINTS,
    DEFAULT_MIN_DENOMINATOR: DEFAULT_MIN_DENOMINATOR,
    Z_95: Z_95,
    Z_998: Z_998,
    listTrailingCalendarQuarters: listTrailingCalendarQuarters,
    assertConsecutivePeriods: assertConsecutivePeriods,
    funnelLimits: funnelLimits,
    pChartLimits: pChartLimits,
    individualLimits: individualLimits,
    estimateIndividualSigma: estimateIndividualSigma,
    isPublishedCareLine: isPublishedCareLine,
    buildIndicatorTrend: buildIndicatorTrend,
    drillDownForPoint: drillDownForPoint,
  };
});
