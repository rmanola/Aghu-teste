/**
 * FEAT-127 — Validação de modelos de risco importados: calibração e
 * discriminação por par (modelo, linha de cuidado, desfecho).
 *
 * Todo o O/E do CPI assenta numa afirmação por verificar — que Charlson,
 * ASA-PS e KDIGO descrevem esta população. Este módulo mede-a com os dois
 * números que a literatura trata como obrigatórios antes de usar um modelo
 * numa coorte nova: declive/intercepto de calibração e estatística C.
 *
 * Entrada: casos já agregados, `{ score, band, expectedRate, outcome }`, sem
 * identificador de doente nem de profissional (CPIVAL-AC-11). Os escores vêm
 * de `lib/cpi-risk-adjust.js` / `lib/charlson-score.js`; aqui nunca se deriva
 * um escore (CPIVAL-AC-12) nem se recalibra um modelo (CPIVAL-AC-13) —
 * recalibrar com a própria coorte empurra o O/E para 1,0 por artefacto.
 *
 * Ordem deliberada: a cobertura do escore é porta dura e é avaliada antes de
 * qualquer métrica (CPIVAL-AC-06/07). Bootstrap com PRNG próprio e semente
 * fixa — um IC que muda entre execuções torna o relatório do comité
 * irreprodutível (CPIVAL-AC-09).
 *
 * Referências: Crowson et al., «Assessing calibration of prognostic risk
 * scores» (Stat Methods Med Res, PMC3933449) — declive de calibração e
 * agrupamento por risco; Steyerberg & Vergouwe, «Towards better clinical
 * prediction models» / ENM doi:10.3803/enm.2016.31.1.38 — calibração e
 * discriminação como par obrigatório na validação externa.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiModelValidation = api;
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

  var riskAdjustApi = load("cpi-risk-adjust.js", "AghuCpiRiskAdjust");

  /** Cobertura mínima do escore na coorte; abaixo disto é porta, não nota. */
  var COVERAGE_MIN = 0.7;
  /** Eventos mínimos para `validated` (Clarificação 4 do spec). */
  var EVENTS_MIN = 20;
  /** Supressão por n pequeno — mesmo limiar do resto do CPI. */
  var DEFAULT_MIN_DENOMINATOR =
    riskAdjustApi && riskAdjustApi.DEFAULT_MIN_DENOMINATOR != null
      ? riskAdjustApi.DEFAULT_MIN_DENOMINATOR
      : 11;

  /** Semente é parte do resultado: sem ela o IC do comité é irreprodutível. */
  var BOOTSTRAP = Object.freeze({ iterations: 2000, seed: 20260101 });

  /** Reamostragens válidas mínimas antes de publicar um IC percentil. */
  var MIN_BOOTSTRAP_SAMPLES = 100;

  var STATUS = Object.freeze({
    VALIDATED: "validated",
    PROVISIONAL: "provisional",
    NOT_VALIDATED: "not_validated",
  });

  /**
   * Chaves que denunciam um caso vindo do prontuário em vez da agregação.
   * Fail-fast na fronteira: o relatório sai do produto para uma reunião, e a
   * altura de recusar um identificador é à entrada (CPIVAL-AC-11).
   */
  var FORBIDDEN_CASE_KEYS = Object.freeze([
    "patientKey",
    "recordClientId",
    "record_client_id",
    "prontuario",
    "nome",
    "name",
    "dob",
    "dataNascimento",
    "cpf",
    "email",
    "userId",
    "user_id",
    "professionalId",
    "profissional",
    "chefe",
    "equipe",
  ]);

  /** Opções que pediriam recalibração — recusadas em código (CPIVAL-AC-13). */
  var RECALIBRATION_OPTION_KEYS = Object.freeze([
    "coefficients",
    "coefs",
    "recalibrate",
    "recalibration",
    "recalibratedCoefficients",
    "refit",
    "intercept",
    "slope",
    "offset",
  ]);

  /** Sentido do enviesamento quando o declive sai do IC95% de 1. */
  var BIAS = Object.freeze({
    OVERSTATES_GRADIENT: "overstates_risk_gradient",
    UNDERSTATES_GRADIENT: "understates_risk_gradient",
  });

  var LOGIT_EPS = 1e-6;

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

  /**
   * PRNG xorshift32 determinístico. `Math.random` daria um IC diferente por
   * execução e duas reuniões do comité não seriam comparáveis.
   * @param {number} seed
   * @returns {{ next: function(): number, nextIndex: function(number): number }}
   */
  function createRng(seed) {
    var state = (seed >>> 0) || 0x9e3779b9;
    function next() {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    }
    return {
      next: next,
      nextIndex: function (n) {
        var i = Math.floor(next() * n);
        return i >= n ? n - 1 : i;
      },
    };
  }

  function clampProbability(p) {
    if (p < LOGIT_EPS) return LOGIT_EPS;
    if (p > 1 - LOGIT_EPS) return 1 - LOGIT_EPS;
    return p;
  }

  /** @param {number} p */
  function logit(p) {
    var q = clampProbability(p);
    return Math.log(q / (1 - q));
  }

  /**
   * Correção de continuidade (Haldane–Anscombe) na proporção observada de um
   * grupo: sem ela um grupo com zero eventos teria logit infinito e mataria o
   * ajuste inteiro em vez de contribuir com a informação que tem.
   * @param {number} observed
   * @param {number} n
   */
  function correctedRate(observed, n) {
    return (observed + 0.5) / (n + 1);
  }

  /**
   * CPIVAL-AC-11: um caso com identificador é erro de chamada, não algo a
   * limpar em silêncio.
   * @param {object} c
   * @param {number} index
   */
  function assertNoIdentifiers(c, index) {
    for (var i = 0; i < FORBIDDEN_CASE_KEYS.length; i++) {
      var key = FORBIDDEN_CASE_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(c, key)) {
        throw new Error(
          "cpi-model-validation: caso [" +
            index +
            "] traz identificador `" +
            key +
            "` — a validação recebe apenas { score, band, expectedRate, outcome } (CPIVAL-AC-11)",
        );
      }
    }
  }

  /**
   * Normaliza a coorte e separa o que é derivável do que não é. Um caso sem
   * escore, sem banda ou sem taxa esperada não é um caso mal calibrado: é um
   * caso a que o modelo não se aplica, e conta para a cobertura.
   *
   * @param {Array<{ score?: number, band?: string, expectedRate?: number, outcome?: number|boolean }>} cases
   * @returns {{ total: number, derivable: Array<{ score: number, band: string, expectedRate: number, outcome: 0|1 }> }}
   */
  function normalizeCases(cases) {
    var list = asArray(cases);
    var derivable = [];

    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || typeof raw !== "object") {
        throw new Error(
          "cpi-model-validation: caso [" + i + "] não é um objecto",
        );
      }
      assertNoIdentifiers(raw, i);

      var outcome = raw.outcome;
      if (typeof outcome === "boolean") outcome = outcome ? 1 : 0;
      outcome = finiteOrNull(outcome);
      if (outcome !== 0 && outcome !== 1) {
        throw new Error(
          "cpi-model-validation: caso [" +
            i +
            "] com outcome inválido — esperado 0 ou 1",
        );
      }

      var score = finiteOrNull(raw.score);
      var band = str(raw.band).trim();
      var expectedRate = finiteOrNull(raw.expectedRate);

      var applicable =
        score != null &&
        band !== "" &&
        band !== "unknown" &&
        expectedRate != null &&
        expectedRate >= 0 &&
        expectedRate <= 1;

      if (!applicable) continue;

      derivable.push({
        score: score,
        band: band,
        expectedRate: expectedRate,
        outcome: outcome,
      });
    }

    return { total: list.length, derivable: derivable };
  }

  /**
   * Grupos de risco (bandas) com supressão por denominador pequeno.
   * CPIVAL-AC-04: grupo suprimido sai do conjunto de linhas do ajuste e da
   * base de reamostragem — não é degradado a peso zero. Um grupo de oito casos
   * que entre na recta desloca-a, e é essa a diferença entre suprimir e
   * anotar.
   *
   * @param {Array<object>} derivable
   * @param {number} minDenominator
   */
  function buildRiskGroups(derivable, minDenominator) {
    var byBand = Object.create(null);
    var order = [];
    for (var i = 0; i < derivable.length; i++) {
      var c = derivable[i];
      if (!byBand[c.band]) {
        byBand[c.band] = { band: c.band, n: 0, observed: 0, expected: 0 };
        order.push(c.band);
      }
      var g = byBand[c.band];
      g.n += 1;
      g.observed += c.outcome;
      g.expected += c.expectedRate;
    }

    order.sort();

    var groups = [];
    var retainedBands = [];
    for (var k = 0; k < order.length; k++) {
      var src = byBand[order[k]];
      if (src.n < minDenominator) {
        // Supressão do CPI: lacuna não expõe contagens (FEAT-115/120).
        groups.push({
          band: src.band,
          n: null,
          observed: null,
          expected: null,
          expectedRate: null,
          observedRate: null,
          ratio: null,
          suppressed: true,
          reason: "small_n",
        });
        continue;
      }
      retainedBands.push(src.band);
      groups.push({
        band: src.band,
        n: src.n,
        observed: src.observed,
        expected: src.expected,
        expectedRate: src.expected / src.n,
        observedRate: src.observed / src.n,
        ratio: src.expected > 0 ? src.observed / src.expected : null,
        suppressed: false,
        reason: null,
      });
    }

    return { groups: groups, retainedBands: retainedBands };
  }

  /**
   * Recta ponderada de `logit(observado)` sobre `logit(esperado)` por grupo.
   * `slope = 1` e `intercept = 0` → modelo calibrado nesta população.
   *
   * @param {Array<{ n: number, observed: number, expectedRate: number }>} rows
   * @returns {{ slope: number, intercept: number }|null}
   */
  function fitCalibrationLine(rows) {
    if (rows.length < 2) return null;

    var sumW = 0;
    var sumWX = 0;
    var sumWY = 0;
    for (var i = 0; i < rows.length; i++) {
      var w = rows[i].n;
      var x = logit(rows[i].expectedRate);
      var y = logit(correctedRate(rows[i].observed, rows[i].n));
      sumW += w;
      sumWX += w * x;
      sumWY += w * y;
    }
    if (!(sumW > 0)) return null;

    var meanX = sumWX / sumW;
    var meanY = sumWY / sumW;

    var sxx = 0;
    var sxy = 0;
    for (var j = 0; j < rows.length; j++) {
      var wj = rows[j].n;
      var dx = logit(rows[j].expectedRate) - meanX;
      var dy = logit(correctedRate(rows[j].observed, rows[j].n)) - meanY;
      sxx += wj * dx * dx;
      sxy += wj * dx * dy;
    }
    // Grupos todos com o mesmo esperado: não há gradiente para estimar declive.
    if (!(sxx > 0)) return null;

    var slope = sxy / sxx;
    return { slope: slope, intercept: meanY - slope * meanX };
  }

  /**
   * Estatística C pela forma de Mann-Whitney, com empates a meio par:
   * `C = P(escore do caso com desfecho > escore do caso sem) + 0,5·P(empate)`.
   * Com escores inteiros (Charlson) os empates são a maioria — ignorá-los
   * inflacionaria a C.
   *
   * @param {Float64Array|number[]} posCount contagens por índice de escore ascendente
   * @param {Float64Array|number[]} negCount
   * @param {number} nPos
   * @param {number} nNeg
   * @returns {number|null}
   */
  function cStatisticFromCounts(posCount, negCount, nPos, nNeg) {
    if (!(nPos > 0) || !(nNeg > 0)) return null;
    var concordant = 0;
    var ties = 0;
    var cumNeg = 0;
    for (var i = 0; i < posCount.length; i++) {
      var p = posCount[i];
      var g = negCount[i];
      if (p > 0) {
        concordant += p * cumNeg;
        ties += p * g;
      }
      cumNeg += g;
    }
    return (concordant + 0.5 * ties) / (nPos * nNeg);
  }

  /** Percentil tipo 7 sobre array já ordenado. */
  function percentile(sorted, p) {
    var m = sorted.length;
    if (m === 0) return null;
    if (m === 1) return sorted[0];
    var h = (m - 1) * p;
    var lo = Math.floor(h);
    var hi = Math.min(lo + 1, m - 1);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }

  /** IC95% percentil, ou null se não houver reamostragens suficientes. */
  function percentileCi95(values) {
    if (values.length < MIN_BOOTSTRAP_SAMPLES) return null;
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    return [percentile(sorted, 0.025), percentile(sorted, 0.975)];
  }

  /**
   * IC95% do declive e do intercepto por bootstrap não-paramétrico sobre os
   * casos dos grupos retidos — a base de reamostragem é exactamente a do
   * ajuste pontual, para que remover um grupo suprimido não mexa no IC
   * (CPIVAL-AC-04).
   */
  function bootstrapCalibrationCi(
    fitCases,
    bandIndexOf,
    bandCount,
    iterations,
    seed,
  ) {
    var n = fitCases.length;
    if (n === 0 || bandCount < 2) {
      return { slopeCi95: null, interceptCi95: null, samples: 0 };
    }

    var rng = createRng(seed);
    var counts = new Float64Array(bandCount);
    var observed = new Float64Array(bandCount);
    var expected = new Float64Array(bandCount);
    var slopes = [];
    var intercepts = [];

    for (var it = 0; it < iterations; it++) {
      counts.fill(0);
      observed.fill(0);
      expected.fill(0);
      for (var d = 0; d < n; d++) {
        var c = fitCases[rng.nextIndex(n)];
        var b = bandIndexOf[c.band];
        counts[b] += 1;
        observed[b] += c.outcome;
        expected[b] += c.expectedRate;
      }
      var rows = [];
      for (var g = 0; g < bandCount; g++) {
        if (counts[g] < 1) continue;
        rows.push({
          n: counts[g],
          observed: observed[g],
          expectedRate: expected[g] / counts[g],
        });
      }
      var fit = fitCalibrationLine(rows);
      if (!fit) continue;
      slopes.push(fit.slope);
      intercepts.push(fit.intercept);
    }

    return {
      slopeCi95: percentileCi95(slopes),
      interceptCi95: percentileCi95(intercepts),
      samples: slopes.length,
    };
  }

  /** IC95% da estatística C pelo mesmo bootstrap, sobre todos os deriváveis. */
  function bootstrapCStatisticCi(
    derivable,
    scoreIndexOf,
    scoreCount,
    iterations,
    seed,
  ) {
    var n = derivable.length;
    if (n === 0) return { ci95: null, samples: 0 };

    var rng = createRng(seed);
    var pos = new Float64Array(scoreCount);
    var neg = new Float64Array(scoreCount);
    var values = [];

    for (var it = 0; it < iterations; it++) {
      pos.fill(0);
      neg.fill(0);
      var nPos = 0;
      var nNeg = 0;
      for (var d = 0; d < n; d++) {
        var c = derivable[rng.nextIndex(n)];
        var s = scoreIndexOf[c.score];
        if (c.outcome === 1) {
          pos[s] += 1;
          nPos += 1;
        } else {
          neg[s] += 1;
          nNeg += 1;
        }
      }
      var value = cStatisticFromCounts(pos, neg, nPos, nNeg);
      if (value == null) continue;
      values.push(value);
    }

    return { ci95: percentileCi95(values), samples: values.length };
  }

  /**
   * CPIVAL-AC-13: a API pública recusa coeficientes recalibrados. Recalibrar
   * com a própria coorte aproxima o esperado do observado por construção, e o
   * O/E tende a 1,0 por artefacto — é decisão de governança com efeito
   * prospectivo (FEAT-128), nunca efeito lateral de uma validação.
   *
   * @param {unknown} [coefficients]
   * @throws {Error} sempre
   */
  function refuseRecalibration(coefficients) {
    throw new Error(
      "cpi-model-validation: recalibração recusada — validar não altera o modelo. " +
        "Recalibrar com a própria coorte empurra o O/E para 1,0 por artefacto; " +
        "é decisão de governança com registo e efeito prospectivo (CPIVAL-AC-13)." +
        (coefficients == null
          ? ""
          : " Coeficientes recebidos foram descartados."),
    );
  }

  /** @param {object} opts */
  function assertNoRecalibrationOptions(opts) {
    for (var i = 0; i < RECALIBRATION_OPTION_KEYS.length; i++) {
      var key = RECALIBRATION_OPTION_KEYS[i];
      if (opts[key] !== undefined) refuseRecalibration(opts[key]);
    }
  }

  /**
   * Valida um modelo de risco importado numa população local.
   *
   * @param {Array<{ score: number, band: string, expectedRate: number, outcome: 0|1 }>} cases
   * @param {{
   *   model?: string, careLineId?: string, outcome?: string,
   *   minDenominator?: number, coverageMin?: number, eventsMin?: number,
   *   iterations?: number, seed?: number
   * }} [options]
   * @returns {object} relatório sem identificadores
   */
  function validateRiskModel(cases, options) {
    var opts = options && typeof options === "object" ? options : {};
    assertNoRecalibrationOptions(opts);

    var minDenominator = finiteOrNull(opts.minDenominator);
    if (minDenominator == null || minDenominator < 0) {
      minDenominator = DEFAULT_MIN_DENOMINATOR;
    }
    var coverageMin = finiteOrNull(opts.coverageMin);
    if (coverageMin == null) coverageMin = COVERAGE_MIN;
    var eventsMin = finiteOrNull(opts.eventsMin);
    if (eventsMin == null) eventsMin = EVENTS_MIN;
    var iterations = finiteOrNull(opts.iterations);
    if (iterations == null || iterations < 1) iterations = BOOTSTRAP.iterations;
    var seed = finiteOrNull(opts.seed);
    if (seed == null) seed = BOOTSTRAP.seed;

    var normalized = normalizeCases(cases);
    var derivable = normalized.derivable;
    var total = normalized.total;
    var share = total > 0 ? derivable.length / total : null;

    var coverage = {
      share: share,
      derivable: derivable.length,
      total: total,
    };

    var events = 0;
    for (var e = 0; e < derivable.length; e++) events += derivable[e].outcome;

    var head = {
      model: str(opts.model) || null,
      careLineId: str(opts.careLineId) || null,
      outcome: str(opts.outcome) || null,
      // Cobertura antes de qualquer métrica — porta, não nota de rodapé
      // (CPIVAL-AC-06).
      coverage: coverage,
      n: derivable.length,
      events: events,
      minimums: {
        coverageMin: coverageMin,
        eventsMin: eventsMin,
        minDenominator: minDenominator,
      },
      bootstrap: { iterations: iterations, seed: seed },
    };

    // CPIVAL-AC-07: cobertura abaixo do limiar força `not_validated` antes de
    // calcular métrica nenhuma. Um modelo derivável em 40% da coorte não é um
    // modelo mal calibrado — é um modelo que não se aplica àquela linha, e o
    // O/E aplica-se à linha inteira.
    if (share == null || share < coverageMin) {
      return Object.assign({}, head, {
        status: STATUS.NOT_VALIDATED,
        reasons: ["coverage_below_minimum"],
        statusReason:
          share == null
            ? "coorte vazia; cobertura do escore indeterminada"
            : "cobertura do escore " +
              (share * 100).toFixed(1) +
              "%; abaixo do mínimo de " +
              (coverageMin * 100).toFixed(0) +
              "% para qualquer leitura de desempenho",
        calibration: null,
        discrimination: null,
      });
    }

    var grouped = buildRiskGroups(derivable, minDenominator);
    var retained = Object.create(null);
    var bandIndexOf = Object.create(null);
    for (var r = 0; r < grouped.retainedBands.length; r++) {
      retained[grouped.retainedBands[r]] = true;
      bandIndexOf[grouped.retainedBands[r]] = r;
    }

    var fitCases = [];
    for (var f = 0; f < derivable.length; f++) {
      if (retained[derivable[f].band]) fitCases.push(derivable[f]);
    }

    var fitRows = [];
    for (var gi = 0; gi < grouped.groups.length; gi++) {
      var grp = grouped.groups[gi];
      if (grp.suppressed) continue;
      fitRows.push({
        n: grp.n,
        observed: grp.observed,
        expectedRate: grp.expectedRate,
      });
    }

    var fit = fitCalibrationLine(fitRows);
    var calibrationCi = fit
      ? bootstrapCalibrationCi(
          fitCases,
          bandIndexOf,
          grouped.retainedBands.length,
          iterations,
          seed,
        )
      : { slopeCi95: null, interceptCi95: null, samples: 0 };

    // CPIVAL-AC-10: declive fora do IC95% de 1 assinala o sentido do
    // enviesamento. `slope < 1` → o modelo exagera a diferença entre grupos de
    // risco; `slope > 1` → atenua-a.
    var slopeCi = calibrationCi.slopeCi95;
    var biasDirection = null;
    var biasReason = null;
    if (fit && slopeCi) {
      if (slopeCi[1] < 1) {
        biasDirection = BIAS.OVERSTATES_GRADIENT;
        biasReason =
          "declive " +
          fit.slope.toFixed(2) +
          " com IC95% abaixo de 1 — o modelo exagera a diferença de risco entre grupos nesta população";
      } else if (slopeCi[0] > 1) {
        biasDirection = BIAS.UNDERSTATES_GRADIENT;
        biasReason =
          "declive " +
          fit.slope.toFixed(2) +
          " com IC95% acima de 1 — o modelo atenua a diferença de risco entre grupos nesta população";
      }
    }

    var interceptCi = calibrationCi.interceptCi95;
    var baselineBias = null;
    if (fit && interceptCi) {
      if (interceptCi[0] > 0) baselineBias = "underestimates_baseline_risk";
      else if (interceptCi[1] < 0) baselineBias = "overestimates_baseline_risk";
    }

    var calibration = {
      slope: fit ? fit.slope : null,
      slopeCi95: slopeCi,
      intercept: fit ? fit.intercept : null,
      interceptCi95: interceptCi,
      groups: grouped.groups,
      groupsUsed: fitRows.length,
      groupsSuppressed: grouped.groups.length - fitRows.length,
      biasDirection: biasDirection,
      biasReason: biasReason,
      baselineBias: baselineBias,
      bootstrapSamples: calibrationCi.samples,
    };

    // Discriminação sobre todos os deriváveis: a estatística C ordena
    // indivíduos, e a supressão de grupo é um assunto da tabela de calibração.
    var scoreValues = [];
    var seenScore = Object.create(null);
    for (var s = 0; s < derivable.length; s++) {
      var sc = derivable[s].score;
      if (!seenScore[sc]) {
        seenScore[sc] = true;
        scoreValues.push(sc);
      }
    }
    scoreValues.sort(function (a, b) {
      return a - b;
    });
    var scoreIndexOf = Object.create(null);
    for (var si = 0; si < scoreValues.length; si++) {
      scoreIndexOf[scoreValues[si]] = si;
    }

    var posCount = new Float64Array(scoreValues.length);
    var negCount = new Float64Array(scoreValues.length);
    var nPos = 0;
    var nNeg = 0;
    var brierSum = 0;
    for (var p = 0; p < derivable.length; p++) {
      var cse = derivable[p];
      var idx = scoreIndexOf[cse.score];
      if (cse.outcome === 1) {
        posCount[idx] += 1;
        nPos += 1;
      } else {
        negCount[idx] += 1;
        nNeg += 1;
      }
      var diff = cse.expectedRate - cse.outcome;
      brierSum += diff * diff;
    }

    var cStatistic = cStatisticFromCounts(posCount, negCount, nPos, nNeg);
    var cCi =
      cStatistic == null
        ? { ci95: null, samples: 0 }
        : bootstrapCStatisticCi(
            derivable,
            scoreIndexOf,
            scoreValues.length,
            iterations,
            // Fluxo separado do da calibração, mas igualmente determinístico.
            (seed ^ 0x5f356495) >>> 0,
          );

    // CPIVAL-AC-08: IC a conter 0,5 é discriminação indistinguível do acaso.
    // Não existe rótulo de «aceitável» neste módulo — a leitura é do comité.
    var chanceLevel =
      cCi.ci95 != null ? cCi.ci95[0] <= 0.5 && 0.5 <= cCi.ci95[1] : null;

    var discrimination = {
      cStatistic: cStatistic,
      cCi95: cCi.ci95,
      chanceLevel: chanceLevel === true,
      interpretation:
        chanceLevel === true ? "indistinguishable_from_chance" : null,
      brier: derivable.length > 0 ? brierSum / derivable.length : null,
      bootstrapSamples: cCi.samples,
    };

    var reasons = [];
    var status = STATUS.VALIDATED;
    var statusReason = null;

    if (events < eventsMin) {
      status = STATUS.PROVISIONAL;
      reasons.push("events_below_minimum");
      statusReason =
        events +
        " evento(s); abaixo do mínimo de " +
        eventsMin +
        " para validação";
    }
    if (!fit) {
      if (status === STATUS.VALIDATED) status = STATUS.PROVISIONAL;
      reasons.push("insufficient_risk_groups");
      if (!statusReason) {
        statusReason =
          "grupos de risco publicáveis insuficientes para ajustar a recta de calibração";
      }
    }
    if (biasDirection) reasons.push(biasDirection);
    if (baselineBias) reasons.push(baselineBias);
    if (chanceLevel === true) reasons.push("discrimination_at_chance_level");
    if (calibration.groupsSuppressed > 0) reasons.push("risk_group_suppressed");

    return Object.assign({}, head, {
      status: status,
      reasons: reasons,
      statusReason: statusReason,
      calibration: calibration,
      discrimination: discrimination,
    });
  }

  function fmt(v, digits) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(digits == null ? 2 : digits);
  }

  function fmtCi(ci, digits) {
    if (!Array.isArray(ci) || ci[0] == null || ci[1] == null) return "—";
    return "[" + fmt(ci[0], digits) + ", " + fmt(ci[1], digits) + "]";
  }

  /**
   * CPIVAL-AC-11: relatório para a reunião do comité — só contagens agregadas
   * e métricas. A cobertura aparece antes das métricas em cada bloco, como no
   * objecto de resultado.
   *
   * @param {object|object[]} results — saída(s) de `validateRiskModel`
   * @param {{ generatedAt?: string }} [options]
   * @returns {string} Markdown
   */
  function validationReportToMarkdown(results, options) {
    var opts = options && typeof options === "object" ? options : {};
    var list = Array.isArray(results) ? results : [results];
    var out = [];

    out.push("# CPI — validação de modelos de risco");
    out.push("");
    out.push(
      "Gerado: " +
        (opts.generatedAt || "—") +
        " · bootstrap semente " +
        BOOTSTRAP.seed +
        " · " +
        BOOTSTRAP.iterations +
        " reamostragens",
    );
    out.push("");
    out.push(
      "Só contagens agregadas e métricas — nenhum identificador pessoal.",
    );
    out.push("");

    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      var cov = r.coverage || {};
      out.push(
        "## " +
          (r.model || "modelo") +
          " · " +
          (r.careLineId || "linha") +
          " · " +
          (r.outcome || "desfecho"),
      );
      out.push("");
      out.push(
        "- Cobertura do escore: " +
          (cov.share == null ? "—" : (cov.share * 100).toFixed(1) + "%") +
          " (" +
          (cov.derivable == null ? "—" : cov.derivable) +
          "/" +
          (cov.total == null ? "—" : cov.total) +
          " casos)",
      );
      out.push("- Casos avaliados: " + (r.n == null ? "—" : r.n));
      out.push("- Eventos: " + (r.events == null ? "—" : r.events));
      out.push(
        "- Estado: **" +
          (r.status || "—") +
          "**" +
          (r.statusReason ? " — " + r.statusReason : ""),
      );
      if (asArray(r.reasons).length) {
        out.push("- Razões: " + r.reasons.join(", "));
      }
      out.push("");

      if (!r.calibration) {
        out.push(
          "Métricas não calculadas: a cobertura é porta e não foi atingida.",
        );
        out.push("");
        continue;
      }

      out.push("### Calibração");
      out.push("");
      out.push(
        "Declive " +
          fmt(r.calibration.slope) +
          " IC95% " +
          fmtCi(r.calibration.slopeCi95) +
          " · intercepto " +
          fmt(r.calibration.intercept) +
          " IC95% " +
          fmtCi(r.calibration.interceptCi95),
      );
      if (r.calibration.biasReason) {
        out.push("");
        out.push("Enviesamento: " + r.calibration.biasReason + ".");
      }
      out.push("");
      out.push("| grupo | n | observado | esperado | O/E |");
      out.push("|-------|---|-----------|----------|-----|");
      var groups = asArray(r.calibration.groups);
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        if (grp.suppressed) {
          out.push("| " + grp.band + " | suprimido (n pequeno) | — | — | — |");
          continue;
        }
        out.push(
          "| " +
            grp.band +
            " | " +
            grp.n +
            " | " +
            grp.observed +
            " | " +
            fmt(grp.expected, 1) +
            " | " +
            fmt(grp.ratio) +
            " |",
        );
      }
      out.push("");

      out.push("### Discriminação");
      out.push("");
      out.push(
        "Estatística C " +
          fmt(r.discrimination.cStatistic, 3) +
          " IC95% " +
          fmtCi(r.discrimination.cCi95, 3) +
          " · Brier " +
          fmt(r.discrimination.brier, 4),
      );
      if (r.discrimination.chanceLevel) {
        out.push("");
        out.push(
          "O IC95% da estatística C contém 0,5: a discriminação é indistinguível do acaso nesta coorte.",
        );
      }
      out.push("");
    }

    return out.join("\n");
  }

  /**
   * @param {object|object[]} results
   * @param {{ generatedAt?: string }} [options]
   * @returns {string} JSON
   */
  function validationReportToJson(results, options) {
    var opts = options && typeof options === "object" ? options : {};
    var list = Array.isArray(results) ? results : [results];
    return JSON.stringify(
      {
        generatedAt: opts.generatedAt || null,
        bootstrap: { iterations: BOOTSTRAP.iterations, seed: BOOTSTRAP.seed },
        models: list,
      },
      null,
      2,
    );
  }

  /**
   * Resumo do estado por modelo, na forma que `cpi-dashboard-aggregate.js`
   * consome para degradar indicadores dependentes (CPIVAL-AC-05). Chaves
   * `modelo` e `modelo@linha` — a validação é por população, não em abstracto.
   *
   * @param {object[]} results
   * @returns {Record<string, string>}
   */
  function validationStatusMap(results) {
    var list = asArray(results);
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.model || !r.status) continue;
      var model = str(r.model);
      map[model] = r.status;
      if (r.careLineId) map[model + "@" + str(r.careLineId)] = r.status;
    }
    return map;
  }

  /**
   * FEAT-131 — modo por janela: corre `validateRiskModel` em cada janela
   * temporal sem alterar o modo único. Janelas abaixo de `eventsMin` são
   * marcadas `gap: true` e o resultado métrico é null (CPIDRF-AC-02) — a
   * detecção de deriva não as usa.
   *
   * @param {Array<{ period: { from: string, to: string, label: string }, cases: Array<object> }>} windows
   * @param {{
   *   model?: string, careLineId?: string, outcome?: string,
   *   minDenominator?: number, coverageMin?: number, eventsMin?: number,
   *   iterations?: number, seed?: number
   * }} [options]
   * @returns {Array<{ period: object, gap: boolean, events: number, result: object|null }>}
   */
  function validateRiskModelWindows(windows, options) {
    var opts = options && typeof options === "object" ? options : {};
    assertNoRecalibrationOptions(opts);
    var eventsMin = finiteOrNull(opts.eventsMin);
    if (eventsMin == null) eventsMin = EVENTS_MIN;

    var list = asArray(windows);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i] && typeof list[i] === "object" ? list[i] : {};
      var period = w.period || null;
      var cases = asArray(w.cases);
      // Contagem rápida de eventos antes do bootstrap — lacuna barata.
      var events = 0;
      for (var e = 0; e < cases.length; e++) {
        var oc = cases[e] && cases[e].outcome;
        if (oc === true || oc === 1) events += 1;
        else if (oc === false || oc === 0) continue;
        else {
          var n = finiteOrNull(oc);
          if (n === 1) events += 1;
        }
      }
      if (events < eventsMin) {
        out.push({
          period: period,
          gap: true,
          events: events,
          result: null,
        });
        continue;
      }
      // Semente por janela: (seed ^ índice) — cacheável e determinística
      // (bootstrap × janelas no relatório, não no render).
      var windowOpts = Object.assign({}, opts, {
        seed:
          ((finiteOrNull(opts.seed) != null ? opts.seed : BOOTSTRAP.seed) ^
            ((i + 1) * 0x9e3779b9)) >>>
          0,
      });
      var result = validateRiskModel(cases, windowOpts);
      out.push({
        period: period,
        gap: false,
        events: result.events,
        result: result,
      });
    }
    return out;
  }

  return {
    COVERAGE_MIN: COVERAGE_MIN,
    EVENTS_MIN: EVENTS_MIN,
    DEFAULT_MIN_DENOMINATOR: DEFAULT_MIN_DENOMINATOR,
    BOOTSTRAP: BOOTSTRAP,
    STATUS: STATUS,
    BIAS: BIAS,
    FORBIDDEN_CASE_KEYS: FORBIDDEN_CASE_KEYS,
    createRng: createRng,
    logit: logit,
    fitCalibrationLine: fitCalibrationLine,
    cStatisticFromCounts: cStatisticFromCounts,
    validateRiskModel: validateRiskModel,
    validateRiskModelWindows: validateRiskModelWindows,
    refuseRecalibration: refuseRecalibration,
    validationReportToMarkdown: validationReportToMarkdown,
    validationReportToJson: validationReportToJson,
    validationStatusMap: validationStatusMap,
  };
});
