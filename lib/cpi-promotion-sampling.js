/**
 * FEAT-130 — Amostragem auditada para promoção de linha candidata.
 *
 * A precisão em causa é a do matcher, não desempenho clínico: das unidades
 * atribuídas à linha, quantas lá pertencem mesmo? Sem verdade de referência
 * calculável (texto livre sem CID-10), só amostragem revista por humano.
 *
 * PHI: `unitKey` é opaco e local à amostra (careLineId + sampleRunId + posição).
 * Esta lib NÃO importa `patient-identity` e NÃO deriva chave de prontuário.
 * A ficha transporta unitKey + período; o clínico abre o caso pelo caminho
 * normal sob RBAC. O que sai do produto é evidência agregada.
 *
 * PRNG: xorshift32 com semente 20260101 (mesma constante da FEAT-127).
 * IC de proporção: Wilson — o intervalo normal ultrapassa 1 com p perto de 1.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiPromotionSampling = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var DEFAULT_SEED = 20260101;
  var DEFAULT_MAX_SAMPLE = 60;
  var DEFAULT_MIN_ATTRIBUTED = 30;
  var DEFAULT_MIN_PRECISION = 0.9;
  var WILSON_Z = 1.96;

  var FORBIDDEN_SHEET_KEYS = Object.freeze([
    "nome",
    "name",
    "prontuario",
    "dob",
    "dataNascimento",
    "patientKey",
    "recordClientId",
    "record_client_id",
    "cpf",
    "email",
  ]);

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
   * PRNG xorshift32 determinístico (CPIPRM-AC-01). Mesmo aparelho da FEAT-127.
   * @param {number} seed
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
        if (n <= 0) return 0;
        var i = Math.floor(next() * n);
        return i >= n ? n - 1 : i;
      },
    };
  }

  /** Embaralha cópia in-place com Fisher–Yates + rng. */
  function shuffleCopy(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = rng.nextIndex(i + 1);
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function monthKey(unit) {
    var d = str(unit && (unit.periodDate || unit.period || unit.month));
    if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
    return "unknown";
  }

  /**
   * IC de Wilson para proporção binomial (CPIPRM-AC-04).
   * @param {number} successes
   * @param {number} n
   * @returns {[number, number]|null}
   */
  function wilsonCi95(successes, n) {
    if (!n || n <= 0) return null;
    var z = WILSON_Z;
    var z2 = z * z;
    var p = successes / n;
    var denom = 1 + z2 / n;
    var center = (p + z2 / (2 * n)) / denom;
    var margin =
      (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    var lo = center - margin;
    var hi = center + margin;
    if (lo < 0) lo = 0;
    if (hi > 1) hi = 1;
    return [lo, hi];
  }

  /**
   * Menor n com a mesma taxa pontual cuja Wilson lo ≥ threshold.
   * Pesquisa linear limitada — n de dezenas/centenas.
   * @param {number} precision
   * @param {number} threshold
   * @param {number} fromN
   */
  function neededSampleSizeForWilson(precision, threshold, fromN) {
    if (!(precision > 0) || precision > 1) return fromN;
    var start = Math.max(fromN + 1, 1);
    for (var n = start; n <= 5000; n++) {
      var tp = Math.round(precision * n);
      if (tp > n) tp = n;
      var ci = wilsonCi95(tp, n);
      if (ci && ci[0] >= threshold) return n;
    }
    return 5000;
  }

  function makeSampleRunId(careLineId, seed, size, attributedN) {
    return (
      "smp-" +
      str(careLineId) +
      "-" +
      String(seed >>> 0) +
      "-" +
      size +
      "-of-" +
      attributedN
    );
  }

  function opaqueUnitKey(careLineId, sampleRunId, position) {
    return str(careLineId) + ":" + str(sampleRunId) + ":" + String(position);
  }

  /**
   * Aloca quotas por mês proporcionalmente ao volume, com resto determinístico.
   * @param {Object.<string, object[]>} byMonth
   * @param {number} size
   * @param {ReturnType<typeof createRng>} rng
   */
  function allocateStrata(byMonth, size, rng) {
    var months = Object.keys(byMonth).sort();
    var total = 0;
    for (var i = 0; i < months.length; i++) total += byMonth[months[i]].length;
    if (total <= 0 || size <= 0) return {};

    var quotas = {};
    var allocated = 0;
    var remainders = [];
    for (var m = 0; m < months.length; m++) {
      var month = months[m];
      var avail = byMonth[month].length;
      var exact = (avail / total) * size;
      var base = Math.floor(exact);
      if (base > avail) base = avail;
      quotas[month] = base;
      allocated += base;
      remainders.push({ month: month, frac: exact - base, avail: avail });
    }

    var left = size - allocated;
    remainders.sort(function (a, b) {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.month < b.month ? -1 : a.month > b.month ? 1 : 0;
    });
    var guard = 0;
    while (left > 0 && guard < size * 4) {
      guard += 1;
      var progressed = false;
      for (var r = 0; r < remainders.length && left > 0; r++) {
        var slot = remainders[r];
        if (quotas[slot.month] < slot.avail) {
          quotas[slot.month] += 1;
          left -= 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    // Empate residual: rng determinístico sobre meses com vaga.
    while (left > 0) {
      var candidates = [];
      for (var c = 0; c < months.length; c++) {
        if (quotas[months[c]] < byMonth[months[c]].length) {
          candidates.push(months[c]);
        }
      }
      if (!candidates.length) break;
      var pick = candidates[rng.nextIndex(candidates.length)];
      quotas[pick] += 1;
      left -= 1;
    }
    return quotas;
  }

  /**
   * Extrai amostra determinística estratificada por mês (CPIPRM-AC-01/03/12).
   *
   * @param {Array<object>} attributedUnits
   * @param {{
   *   careLineId: string,
   *   size?: number,
   *   seed?: number,
   *   strata?: "month"|string,
   *   minAttributedUnits?: number,
   *   audit?: boolean,
   *   sampleRunId?: string
   * }} options
   */
  function drawSample(attributedUnits, options) {
    var opts = options && typeof options === "object" ? options : {};
    var careLineId = str(opts.careLineId).trim();
    if (!careLineId) {
      throw new Error("cpi-promotion-sampling: careLineId é obrigatório");
    }

    var list = asArray(attributedUnits);
    var minAttr =
      finiteOrNull(opts.minAttributedUnits) != null
        ? Number(opts.minAttributedUnits)
        : DEFAULT_MIN_ATTRIBUTED;

    if (list.length < minAttr) {
      return {
        ok: false,
        reason:
          "atribuídas " +
          list.length +
          "; faltam " +
          (minAttr - list.length) +
          " para o mínimo " +
          minAttr,
        missingUnits: minAttr - list.length,
        attributedUnits: list.length,
        minAttributedUnits: minAttr,
        sample: [],
      };
    }

    var seed =
      finiteOrNull(opts.seed) != null ? Number(opts.seed) >>> 0 : DEFAULT_SEED;
    var want =
      finiteOrNull(opts.size) != null
        ? Math.floor(Number(opts.size))
        : Math.min(DEFAULT_MAX_SAMPLE, list.length);
    if (want < 1) want = 1;
    if (want > list.length) want = list.length;

    var rng = createRng(seed);
    var sampleRunId =
      str(opts.sampleRunId).trim() ||
      makeSampleRunId(careLineId, seed, want, list.length);

    var picked = [];
    var strata = str(opts.strata || "month");

    if (strata === "month") {
      var byMonth = {};
      for (var i = 0; i < list.length; i++) {
        var u = list[i];
        if (!u || typeof u !== "object") continue;
        var mk = monthKey(u);
        if (!byMonth[mk]) byMonth[mk] = [];
        byMonth[mk].push(u);
      }
      var quotas = allocateStrata(byMonth, want, rng);
      var months = Object.keys(quotas).sort();
      for (var m = 0; m < months.length; m++) {
        var month = months[m];
        var q = quotas[month] || 0;
        if (q <= 0) continue;
        var shuffled = shuffleCopy(byMonth[month], rng);
        for (var s = 0; s < q && s < shuffled.length; s++) {
          picked.push(shuffled[s]);
        }
      }
    } else {
      picked = shuffleCopy(list, rng).slice(0, want);
    }

    // Se a alocação ficou curta (meses vazios), completa com resto embaralhado.
    if (picked.length < want) {
      var pickedSet = new Set(picked);
      var rest = [];
      for (var r = 0; r < list.length; r++) {
        if (!pickedSet.has(list[r])) rest.push(list[r]);
      }
      var restShuf = shuffleCopy(rest, rng);
      for (var t = 0; t < restShuf.length && picked.length < want; t++) {
        picked.push(restShuf[t]);
      }
    }

    var sample = [];
    for (var k = 0; k < picked.length; k++) {
      var src = picked[k];
      sample.push({
        unitKey: opaqueUnitKey(careLineId, sampleRunId, k),
        periodDate: str(src.periodDate || src.period || "").slice(0, 10) || null,
        matchPattern: src.matchPattern != null ? str(src.matchPattern) : null,
        accessKey: src.accessKey != null ? str(src.accessKey) : null,
        position: k,
      });
    }

    return {
      ok: true,
      careLineId: careLineId,
      seed: seed,
      sampleRunId: sampleRunId,
      attributedUnits: list.length,
      size: sample.length,
      strata: strata,
      audit: opts.audit === true,
      sample: sample,
    };
  }

  /**
   * Ficha de revisão filtrada por RBAC (CPIPRM-AC-02/13).
   * @param {object} drawn — saída de drawSample
   * @param {{
   *   reviewerId?: string,
   *   canAccessUnit?: function(object): boolean
   * }} [options]
   */
  function buildReviewSheet(drawn, options) {
    var opts = options && typeof options === "object" ? options : {};
    var canAccess =
      typeof opts.canAccessUnit === "function"
        ? opts.canAccessUnit
        : function () {
            return true;
          };
    var rows = [];
    var list = asArray(drawn && drawn.sample);
    for (var i = 0; i < list.length; i++) {
      var unit = list[i];
      if (!unit) continue;
      if (!canAccess(unit)) continue;
      var row = {
        unitKey: str(unit.unitKey),
        periodDate: unit.periodDate || null,
        period: unit.periodDate || null,
      };
      // Garantia estrutural: nunca copiar chaves proibidas.
      for (var f = 0; f < FORBIDDEN_SHEET_KEYS.length; f++) {
        if (Object.prototype.hasOwnProperty.call(row, FORBIDDEN_SHEET_KEYS[f])) {
          delete row[FORBIDDEN_SHEET_KEYS[f]];
        }
      }
      rows.push(row);
    }
    return {
      careLineId: drawn && drawn.careLineId ? str(drawn.careLineId) : null,
      sampleRunId: drawn && drawn.sampleRunId ? str(drawn.sampleRunId) : null,
      reviewerId: opts.reviewerId != null ? str(opts.reviewerId) : null,
      rows: rows,
    };
  }

  function normalizeVerdict(v) {
    var s = str(v).toLowerCase().replace(/-/g, "_");
    if (s === "tp" || s === "true_positive" || s === "truepositive") {
      return "true_positive";
    }
    if (s === "fp" || s === "false_positive" || s === "falsepositive") {
      return "false_positive";
    }
    return s;
  }

  /**
   * Consolida vereditos: Wilson, approved/inconclusive/rejected, FP patterns,
   * divergências fora do cálculo (CPIPRM-AC-04/05/06/08).
   *
   * @param {Array<object>} sample
   * @param {Array<{ unitKey: string, verdict: string, reviewer?: string, pattern?: string }>} verdicts
   * @param {{ minSampledPrecision?: number }} [options]
   */
  function consolidateReview(sample, verdicts, options) {
    var opts = options && typeof options === "object" ? options : {};
    var minPrec =
      finiteOrNull(opts.minSampledPrecision) != null
        ? Number(opts.minSampledPrecision)
        : DEFAULT_MIN_PRECISION;

    var byKey = {};
    var list = asArray(verdicts);
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || typeof v !== "object") continue;
      var key = str(v.unitKey);
      if (!key) continue;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push({
        unitKey: key,
        verdict: normalizeVerdict(v.verdict),
        reviewer: v.reviewer != null ? str(v.reviewer) : null,
        pattern: v.pattern != null ? str(v.pattern) : null,
      });
    }

    var disagreements = [];
    var truePositives = 0;
    var counted = 0;
    var fpPatterns = {};

    var sampleList = asArray(sample);
    var keys =
      sampleList.length > 0
        ? sampleList.map(function (u) {
            return str(u.unitKey);
          })
        : Object.keys(byKey);

    for (var k = 0; k < keys.length; k++) {
      var unitKey = keys[k];
      var entries = byKey[unitKey] || [];
      if (!entries.length) continue;

      var distinct = {};
      for (var e = 0; e < entries.length; e++) {
        distinct[entries[e].verdict] = true;
      }
      var distinctList = Object.keys(distinct);
      if (distinctList.length > 1) {
        disagreements.push({
          unitKey: unitKey,
          verdicts: entries.slice(),
        });
        continue;
      }

      var verdict = distinctList[0];
      counted += 1;
      if (verdict === "true_positive") {
        truePositives += 1;
      } else if (verdict === "false_positive") {
        var pattern =
          entries[0].pattern ||
          (sampleList[k] && sampleList[k].matchPattern) ||
          "(sem padrão)";
        if (!fpPatterns[pattern]) {
          fpPatterns[pattern] = { pattern: pattern, count: 0, examples: [] };
        }
        fpPatterns[pattern].count += 1;
        if (fpPatterns[pattern].examples.length < 5) {
          fpPatterns[pattern].examples.push(unitKey);
        }
      }
    }

    var precision = counted > 0 ? truePositives / counted : 0;
    var ci95 = wilsonCi95(truePositives, counted);
    var status;
    var neededSampleSize = null;

    if (counted <= 0) {
      status = "inconclusive";
      neededSampleSize = 1;
    } else if (precision < minPrec) {
      status = "rejected";
    } else if (ci95 && ci95[0] < minPrec) {
      status = "inconclusive";
      neededSampleSize = neededSampleSizeForWilson(precision, minPrec, counted);
    } else {
      status = "approved";
    }

    var falsePositivePatterns = Object.keys(fpPatterns)
      .sort()
      .map(function (p) {
        return fpPatterns[p];
      });

    return {
      n: counted,
      truePositives: truePositives,
      precision: precision,
      ci95: ci95,
      status: status,
      minSampledPrecision: minPrec,
      neededSampleSize: neededSampleSize,
      falsePositivePatterns: falsePositivePatterns,
      disagreements: disagreements,
    };
  }

  /**
   * Evidência no formato exigido por CPIGOV-AC-10 / CPIPRM-AC-07.
   */
  function buildPromotionEvidence(consolidation, meta) {
    var m = meta && typeof meta === "object" ? meta : {};
    var c = consolidation && typeof consolidation === "object" ? consolidation : {};
    return {
      sampleId: str(m.sampleId || m.sampleRunId || ""),
      sampleSize: c.n != null ? c.n : null,
      sampledPrecision: c.precision != null ? c.precision : null,
      ci95: Array.isArray(c.ci95) ? c.ci95.slice() : null,
      status: c.status || null,
      attributedUnits:
        finiteOrNull(m.attributedUnits) != null
          ? Number(m.attributedUnits)
          : null,
      careLineId: m.careLineId != null ? str(m.careLineId) : null,
      reviewedAt: m.reviewedAt != null ? str(m.reviewedAt) : null,
      reviewedBy: m.reviewedBy != null ? str(m.reviewedBy) : null,
      falsePositivePatterns: asArray(c.falsePositivePatterns).slice(),
      disagreements: asArray(c.disagreements).map(function (d) {
        return {
          unitKey: d.unitKey,
          verdicts: asArray(d.verdicts).map(function (v) {
            return {
              verdict: v.verdict,
              reviewer: v.reviewer,
            };
          }),
        };
      }),
    };
  }

  /**
   * Devolve cópia da linha com promotion.* preenchido — NUNCA altera lifecycle
   * (CPIPRM-AC-10/11).
   */
  function applySampledEvidence(careLine, evidence) {
    var line = careLine && typeof careLine === "object" ? careLine : {};
    var ev = evidence && typeof evidence === "object" ? evidence : {};
    var promo =
      line.promotion && typeof line.promotion === "object"
        ? Object.assign({}, line.promotion)
        : {};
    if (ev.sampledPrecision != null) promo.sampledPrecision = ev.sampledPrecision;
    if (ev.sampleSize != null) promo.sampleSize = ev.sampleSize;
    if (ev.reviewedAt != null) promo.reviewedAt = ev.reviewedAt;
    if (ev.reviewedBy != null) promo.reviewedBy = ev.reviewedBy;
    if (ev.ci95 != null) promo.ci95 = ev.ci95;
    if (ev.sampleId != null) promo.sampleId = ev.sampleId;
    var reviewStatus = ev.reviewStatus != null ? ev.reviewStatus : ev.status;
    if (reviewStatus != null) promo.lastReviewStatus = reviewStatus;
    if (ev.reviewId != null) promo.reviewId = ev.reviewId;

    return Object.assign({}, line, {
      lifecycle: line.lifecycle,
      promotion: promo,
    });
  }

  /**
   * Linha persistida → evidência CPIGOV-AC-10 / CPICIC-AC-07.
   * @param {object} row
   */
  function reviewRowToEvidence(row) {
    var r = row && typeof row === "object" ? row : {};
    var wilsonLower =
      r.wilson_lower != null
        ? Number(r.wilson_lower)
        : r.wilsonLower != null
          ? Number(r.wilsonLower)
          : null;
    var ci95 =
      wilsonLower != null && Number.isFinite(wilsonLower) ? [wilsonLower, 1] : null;
    return {
      reviewId: str(r.id).trim() || null,
      sampleId: str(r.sample_run_id || r.sampleRunId).trim() || null,
      sampleSize:
        r.reviewed_n != null
          ? Number(r.reviewed_n)
          : r.reviewedN != null
            ? Number(r.reviewedN)
            : null,
      sampledPrecision:
        r.sampled_precision != null
          ? Number(r.sampled_precision)
          : r.sampledPrecision != null
            ? Number(r.sampledPrecision)
            : null,
      ci95: ci95,
      reviewStatus: str(r.status || r.reviewStatus).trim() || null,
      reviewedAt: r.reviewed_at != null ? str(r.reviewed_at) : str(r.reviewedAt) || null,
      attributedUnits:
        r.attributed_units != null
          ? Number(r.attributed_units)
          : r.attributedUnits != null
            ? Number(r.attributedUnits)
            : null,
    };
  }

  /** CPICIC-AC-11 — mais recente por linha; todas as linhas preservadas na origem. */
  function latestPromotionReviewByCareLine(reviews) {
    var latest = {};
    var list = asArray(reviews);
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || typeof r !== "object") continue;
      var careLineId = str(r.care_line_id || r.careLineId).trim();
      if (!careLineId) continue;
      var created = str(r.created_at || r.createdAt);
      var prev = latest[careLineId];
      if (!prev || created > str(prev.created_at || prev.createdAt)) {
        latest[careLineId] = r;
      }
    }
    return Object.keys(latest)
      .sort()
      .map(function (k) {
        return latest[k];
      });
  }

  /** CPICIC-AC-12 — remove identificação de revisor nas divergências. */
  function redactDisagreementReviewers(disagreements) {
    return asArray(disagreements).map(function (d) {
      if (!d || typeof d !== "object") return d;
      return {
        unitKey: str(d.unitKey),
        verdicts: asArray(d.verdicts).map(function (v) {
          if (!v || typeof v !== "object") return v;
          return {
            verdict: v.verdict,
            pattern: v.pattern != null ? str(v.pattern) : null,
          };
        }),
      };
    });
  }

  return {
    DEFAULT_SEED: DEFAULT_SEED,
    DEFAULT_MAX_SAMPLE: DEFAULT_MAX_SAMPLE,
    DEFAULT_MIN_ATTRIBUTED: DEFAULT_MIN_ATTRIBUTED,
    DEFAULT_MIN_PRECISION: DEFAULT_MIN_PRECISION,
    FORBIDDEN_SHEET_KEYS: FORBIDDEN_SHEET_KEYS,
    createRng: createRng,
    wilsonCi95: wilsonCi95,
    drawSample: drawSample,
    buildReviewSheet: buildReviewSheet,
    consolidateReview: consolidateReview,
    buildPromotionEvidence: buildPromotionEvidence,
    applySampledEvidence: applySampledEvidence,
    reviewRowToEvidence: reviewRowToEvidence,
    latestPromotionReviewByCareLine: latestPromotionReviewByCareLine,
    redactDisagreementReviewers: redactDisagreementReviewers,
  };
});
