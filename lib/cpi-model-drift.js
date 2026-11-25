/**
 * FEAT-131 — Deriva de modelo ao longo do tempo.
 *
 * Orquestra `cpi-model-validation` por janela e `cpi-trend` (regras congeladas
 * da FEAT-126) sobre a série do declive de calibração. **Não declara limiar
 * próprio** — CPIDRF-AC-03 é verificável por asserção estrutural.
 *
 * Composição, não invenção: a estatística vive nas duas libs; aqui só se
 * traduz o resultado para o vocabulário de validação (estados, kind escala vs
 * sinal, `not_validated` prospectivo, pendência de recalibração).
 *
 * Referências: BMJ «Evaluation of clinical prediction models» (calibração
 * drift); Davis et al. / PMC8627243 — detecção de deriva de calibração.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiModelDrift = api;
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

  var validationApi = load("cpi-model-validation.js", "AghuCpiModelValidation");
  var trendApi = load("cpi-trend.js", "AghuCpiTrend");

  var NOT_VALIDATED = "not_validated";
  var RISK_MODEL_NOT_VALIDATED_REASON = "risk_model_not_validated";

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
   * CPIDRF-AC-11: recalibrar continua recusado — a deriva é o momento em que a
   * tentação fica mais forte. Pendência registada; nunca execução.
   * @param {unknown} [coefficients]
   */
  function refuseRecalibration(coefficients) {
    if (
      validationApi &&
      typeof validationApi.refuseRecalibration === "function"
    ) {
      return validationApi.refuseRecalibration(coefficients);
    }
    throw new Error(
      "cpi-model-drift: recalibração recusada — deriva regista pendência, não altera o modelo (CPIDRF-AC-11).",
    );
  }

  /** @param {object} opts */
  function stripRecalibrationOptions(opts) {
    var clean = {};
    var keys = Object.keys(opts);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (RECALIBRATION_OPTION_KEYS.indexOf(key) !== -1) continue;
      clean[key] = opts[key];
    }
    return clean;
  }

  /**
   * Escolhe o sinal de deriva clinicamente útil: preferir ponto além dos
   * limites (mudança no período) a uma corrida artificial causada pelo
   * deslocamento da linha central quando o outlier entra no cálculo.
   * @param {object[]} signals
   * @returns {{ rule: string, period: string, direction: string|null }|null}
   */
  function firstDriftFromSignals(signals) {
    var list = asArray(signals);
    if (list.length === 0) return null;
    var preferred = null;
    for (var i = 0; i < list.length; i++) {
      if (str(list[i].rule) === "beyond_control_limits") {
        preferred = list[i];
        break;
      }
    }
    var s = preferred || list[list.length - 1];
    return {
      rule: str(s.rule),
      period: str(s.periodLabel),
      direction: s.direction != null ? str(s.direction) : null,
    };
  }

  /**
   * CPIDRF-AC-12: no período da deriva do declive, se a estatística C também
   * disparou no mesmo período → perda de sinal; senão → escala.
   * @param {object|null} slopeDrift
   * @param {object} cTrend
   */
  function classifyKind(slopeDrift, cTrend) {
    if (!slopeDrift) return null;
    var period = slopeDrift.period;
    var cSignals = asArray(cTrend && cTrend.signals);
    for (var i = 0; i < cSignals.length; i++) {
      if (
        str(cSignals[i].periodLabel) === period &&
        str(cSignals[i].rule) === "beyond_control_limits"
      ) {
        return "signal";
      }
    }
    return "scale";
  }

  /**
   * Detecta deriva de calibração ao longo de janelas consecutivas.
   *
   * @param {Array<{
   *   period: { from: string, to: string, label: string },
   *   cases: Array<object>,
   *   matchVersion?: number,
   *   registryVersion?: number,
   *   decisionRegistryVersion?: number,
   *   careLinePromotionVersion?: number
   * }>} windows
   * @param {{
   *   model?: string, careLineId?: string, outcome?: string,
   *   minPoints?: number, eventsMin?: number,
   *   iterations?: number, seed?: number
   * }} [options]
   */
  function detectModelDrift(windows, options) {
    var rawOpts = options && typeof options === "object" ? options : {};
    // Recalibração pedida na entrada: engolir e recusar — nunca executar.
    var hadRecalibrationAsk = false;
    for (var rk = 0; rk < RECALIBRATION_OPTION_KEYS.length; rk++) {
      if (rawOpts[RECALIBRATION_OPTION_KEYS[rk]] !== undefined) {
        hadRecalibrationAsk = true;
        break;
      }
    }
    var opts = stripRecalibrationOptions(rawOpts);

    if (!validationApi || typeof validationApi.validateRiskModelWindows !== "function") {
      throw new Error(
        "cpi-model-drift: cpi-model-validation.validateRiskModelWindows indisponível",
      );
    }
    if (!trendApi || typeof trendApi.buildIndicatorTrend !== "function") {
      throw new Error("cpi-model-drift: cpi-trend.buildIndicatorTrend indisponível");
    }

    var model = str(opts.model) || null;
    var careLineId = str(opts.careLineId) || null;
    var outcome = str(opts.outcome) || null;
    var minPoints = finiteOrNull(opts.minPoints);
    if (minPoints == null) minPoints = trendApi.DEFAULT_MIN_POINTS || 8;

    var windowList = asArray(windows);
    var validated = validationApi.validateRiskModelWindows(windowList, opts);

    var points = [];
    var slopeSeries = [];
    var cSeries = [];

    for (var i = 0; i < windowList.length; i++) {
      var src = windowList[i] || {};
      var v = validated[i] || { gap: true, events: 0, result: null, period: src.period };
      var period = v.period || src.period;
      var gap = v.gap === true;
      var result = v.result;
      var slope = null;
      var intercept = null;
      var cStat = null;
      var events = v.events != null ? v.events : 0;
      var status = null;

      if (!gap && result) {
        slope =
          result.calibration && result.calibration.slope != null
            ? result.calibration.slope
            : null;
        intercept =
          result.calibration && result.calibration.intercept != null
            ? result.calibration.intercept
            : null;
        cStat =
          result.discrimination && result.discrimination.cStatistic != null
            ? result.discrimination.cStatistic
            : null;
        events = result.events != null ? result.events : events;
        status = result.status || null;
        // Sem métrica de calibração → lacuna para detecção.
        if (slope == null) gap = true;
      }

      points.push({
        period: period,
        slope: gap ? null : slope,
        intercept: gap ? null : intercept,
        cStat: gap ? null : cStat,
        events: events,
        gap: gap,
        status: status,
      });

      var meta = {
        period: period,
        suppressed: gap || slope == null,
        reason: gap ? "events_below_minimum" : slope == null ? "no_value" : null,
        value: gap ? null : slope,
        // Denominador só para o trend não aplicar small_n indevido.
        denominator: gap ? 0 : Math.max(events, 1),
        matchVersion: finiteOrNull(src.matchVersion),
        registryVersion: finiteOrNull(src.registryVersion),
        decisionRegistryVersion: finiteOrNull(src.decisionRegistryVersion),
        careLinePromotionVersion: finiteOrNull(src.careLinePromotionVersion),
      };
      slopeSeries.push(meta);
      cSeries.push(
        Object.assign({}, meta, {
          suppressed: gap || cStat == null,
          value: gap || cStat == null ? null : cStat,
          reason:
            gap || cStat == null
              ? gap
                ? "events_below_minimum"
                : "no_value"
              : null,
        }),
      );
    }

    var trendOpts = {
      indicatorId: model && careLineId ? model + "@" + careLineId + ":slope" : "slope",
      careLineId: careLineId,
      chart: "individual",
      minPoints: minPoints,
      // A lacuna de eventos já foi aplicada; não re-suprimir por n do CPI.
      minDenominator: 1,
    };

    var slopeTrend =
      slopeSeries.length > 0
        ? trendApi.buildIndicatorTrend(slopeSeries, trendOpts)
        : {
            stability: "insufficient_points",
            signals: [],
            breaks: [],
            points: [],
          };

    var cTrend =
      cSeries.length > 0
        ? trendApi.buildIndicatorTrend(
            cSeries,
            Object.assign({}, trendOpts, {
              indicatorId:
                model && careLineId ? model + "@" + careLineId + ":cStat" : "cStat",
            }),
          )
        : { stability: "insufficient_points", signals: [], breaks: [], points: [] };

    var breaks = asArray(slopeTrend.breaks).map(function (b) {
      return {
        period: b.periodLabel,
        reason: b.reason,
      };
    });

    var slopeDrift = firstDriftFromSignals(slopeTrend.signals);
    var kind = classifyKind(slopeDrift, cTrend);
    var drift =
      slopeDrift == null
        ? null
        : {
            rule: slopeDrift.rule,
            period: slopeDrift.period,
            direction: slopeDrift.direction,
            kind: kind,
          };

    var stability = slopeTrend.stability;

    // Estado anterior ao sinal: último status publicável antes do período k.
    var priorStatus = "validated";
    var validationFrom = { period: null, status: priorStatus };
    if (drift) {
      var driftIdx = -1;
      for (var d = 0; d < points.length; d++) {
        if (points[d].period && points[d].period.label === drift.period) {
          driftIdx = d;
          break;
        }
      }
      for (var p = 0; p < (driftIdx < 0 ? points.length : driftIdx); p++) {
        if (!points[p].gap && points[p].status) priorStatus = points[p].status;
      }
      validationFrom = {
        period: drift.period,
        status: NOT_VALIDATED,
      };
    } else if (points.length > 0) {
      var last = points[points.length - 1];
      validationFrom = {
        period: last.period && last.period.label ? last.period.label : null,
        status: last.status || (last.gap ? "provisional" : priorStatus),
      };
    }

    var pendingDecision = null;
    if (drift || hadRecalibrationAsk) {
      pendingDecision = {
        kind: "model_recalibration",
        target: {
          model: model,
          careLineId: careLineId,
          outcome: outcome,
        },
        rationaleRequired: true,
        // Nunca executada — só registo para governança (CPIDRF-AC-11).
        executed: false,
      };
    }

    return {
      model: model,
      careLineId: careLineId,
      outcome: outcome,
      points: points,
      breaks: breaks,
      stability: stability,
      drift: drift,
      validationFrom: validationFrom,
      pendingDecision: pendingDecision,
      // Diagnóstico de teste / relatório — não é PHI.
      _slopeTrend: slopeTrend,
      _cTrend: cTrend,
    };
  }

  /**
   * CPIDRF-AC-05: estado de validação por período (prospectivo).
   * @param {object} driftResult
   * @returns {Record<string, string>}
   */
  function validationStatusByPeriod(driftResult) {
    var map = Object.create(null);
    if (!driftResult || !Array.isArray(driftResult.points)) return map;
    var driftPeriod = driftResult.drift && driftResult.drift.period;
    var seenDrift = false;
    for (var i = 0; i < driftResult.points.length; i++) {
      var p = driftResult.points[i];
      var label = p.period && p.period.label ? str(p.period.label) : String(i);
      if (driftPeriod && label === driftPeriod) seenDrift = true;
      if (seenDrift) {
        map[label] = NOT_VALIDATED;
      } else if (p.gap) {
        map[label] = "provisional";
      } else {
        map[label] = p.status || "validated";
      }
    }
    return map;
  }

  /**
   * Mapa no formato que `aggregateCpi` / CPIVAL-AC-05 já consome.
   * @param {object} driftResult
   * @param {{ asOfPeriod?: string }} [options]
   * @returns {Record<string, string>}
   */
  function toValidationMap(driftResult, options) {
    var opts = options && typeof options === "object" ? options : {};
    var model = driftResult && driftResult.model ? str(driftResult.model) : "";
    var careLineId =
      driftResult && driftResult.careLineId ? str(driftResult.careLineId) : "";
    if (!model) return {};

    var byPeriod = validationStatusByPeriod(driftResult);
    var status = "validated";
    if (opts.asOfPeriod && byPeriod[opts.asOfPeriod]) {
      status = byPeriod[opts.asOfPeriod];
    } else if (driftResult.drift) {
      status = NOT_VALIDATED;
    } else if (driftResult.validationFrom && driftResult.validationFrom.status) {
      status = driftResult.validationFrom.status;
    }

    var map = {};
    map[model] = status;
    if (careLineId) map[model + "@" + careLineId] = status;
    return map;
  }

  function validationStatusFor(map, riskModel, careLineId) {
    if (!map || typeof map !== "object" || !riskModel) return null;
    var scoped = map[riskModel + "@" + careLineId];
    var entry = scoped !== undefined ? scoped : map[riskModel];
    if (entry == null) return null;
    if (typeof entry === "object") {
      return entry.status != null ? str(entry.status) : null;
    }
    return str(entry) || null;
  }

  /**
   * Degrada indicadores dependentes para `partial` pelo caminho FEAT-127
   * (CPIDRF-AC-06) — API clara para o aggregate/UI sem reescrever o cálculo.
   *
   * @param {object} aggregateLike — `{ careLines: [{ indicators: [...] }] }`
   * @param {object} driftResult
   * @param {{ asOfPeriod?: string }} [options]
   */
  function applyDriftDegrade(aggregateLike, driftResult, options) {
    var map = toValidationMap(driftResult, options);
    var src =
      aggregateLike && typeof aggregateLike === "object" ? aggregateLike : {};
    var careLines = asArray(src.careLines).map(function (line) {
      var lineId = str(line && line.careLineId);
      var indicators = asArray(line && line.indicators).map(function (ind) {
        var copy = Object.assign({}, ind);
        var riskModel = str(copy.riskModel);
        if (!riskModel) return copy;
        var status = validationStatusFor(map, riskModel, lineId);
        if (status !== NOT_VALIDATED) return copy;
        if (copy.suppressed || copy.status === "blocked") return copy;
        if (copy.status !== "partial") {
          copy.degradedFrom = copy.status;
        }
        copy.status = "partial";
        copy.validationStatus = NOT_VALIDATED;
        var reason = RISK_MODEL_NOT_VALIDATED_REASON;
        if (copy.degradeReason) {
          if (String(copy.degradeReason).indexOf(reason) === -1) {
            copy.degradeReason = String(copy.degradeReason) + "; " + reason;
          }
        } else {
          copy.degradeReason = reason;
        }
        return copy;
      });
      return Object.assign({}, line, { indicators: indicators });
    });
    return Object.assign({}, src, { careLines: careLines, modelDrift: driftResult });
  }

  /**
   * Relatório Markdown — só métricas agregadas (CPIDRF-AC-10).
   * @param {object|object[]} results
   * @param {{ generatedAt?: string }} [options]
   */
  function driftReportToMarkdown(results, options) {
    var opts = options && typeof options === "object" ? options : {};
    var list = Array.isArray(results) ? results : [results];
    var out = [];
    out.push("# CPI — deriva de modelos de risco");
    out.push("");
    out.push("Gerado: " + (opts.generatedAt || "—"));
    out.push("");
    out.push(
      "Só métricas agregadas por janela — nenhum identificador pessoal. A detecção reusa as três regras congeladas da FEAT-126; este módulo não declara limiar.",
    );
    out.push("");

    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      out.push(
        "## " +
          (r.model || "modelo") +
          " · " +
          (r.careLineId || "linha") +
          " · " +
          (r.outcome || "desfecho"),
      );
      out.push("");
      out.push("- Estabilidade: **" + (r.stability || "—") + "**");
      if (r.drift) {
        out.push(
          "- Deriva: regra `" +
            r.drift.rule +
            "` no período " +
            r.drift.period +
            " (" +
            (r.drift.direction || "—") +
            ") — kind **" +
            (r.drift.kind || "—") +
            "**",
        );
        out.push(
          "- Validação a partir de " +
            (r.validationFrom && r.validationFrom.period
              ? r.validationFrom.period
              : "—") +
            ": **" +
            (r.validationFrom && r.validationFrom.status
              ? r.validationFrom.status
              : NOT_VALIDATED) +
            "** (prospectivo)",
        );
      } else {
        out.push("- Deriva: nenhuma");
      }
      if (r.pendingDecision) {
        out.push(
          "- Pendência: `" +
            r.pendingDecision.kind +
            "` (rationaleRequired; **não executada**)",
        );
      }
      out.push("");
      out.push("| período | declive | intercepto | C | eventos | lacuna |");
      out.push("|---------|---------|------------|---|---------|--------|");
      var pts = asArray(r.points);
      for (var p = 0; p < pts.length; p++) {
        var pt = pts[p];
        var label = pt.period && pt.period.label ? pt.period.label : "—";
        out.push(
          "| " +
            label +
            " | " +
            (pt.slope == null ? "—" : Number(pt.slope).toFixed(3)) +
            " | " +
            (pt.intercept == null ? "—" : Number(pt.intercept).toFixed(3)) +
            " | " +
            (pt.cStat == null ? "—" : Number(pt.cStat).toFixed(3)) +
            " | " +
            (pt.events == null ? "—" : pt.events) +
            " | " +
            (pt.gap ? "sim" : "não") +
            " |",
        );
      }
      out.push("");
      if (asArray(r.breaks).length) {
        out.push("Quebras de série:");
        for (var b = 0; b < r.breaks.length; b++) {
          out.push(
            "- " + r.breaks[b].period + ": `" + r.breaks[b].reason + "`",
          );
        }
        out.push("");
      }
    }
    return out.join("\n");
  }

  /**
   * @param {object|object[]} results
   * @param {{ generatedAt?: string }} [options]
   */
  function driftReportToJson(results, options) {
    var opts = options && typeof options === "object" ? options : {};
    var list = Array.isArray(results) ? results : [results];
    var models = list.map(function (r) {
      if (!r || typeof r !== "object") return r;
      var pub = {};
      var keys = Object.keys(r);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k] === "_slopeTrend" || keys[k] === "_cTrend") continue;
        pub[keys[k]] = r[keys[k]];
      }
      return pub;
    });
    return JSON.stringify(
      {
        generatedAt: opts.generatedAt || null,
        models: models,
      },
      null,
      2,
    );
  }

  /**
   * CPIMOD-AC-07/08 — deriva sobre snapshots gravados à época.
   * Não recalcula janelas com a coorte corrente; usa slope/cStat persistidos.
   *
   * @param {Array<{
   *   window_from?: string, window_to?: string, windowFrom?: string, windowTo?: string,
   *   status?: string, calibration?: { slope?: number, intercept?: number },
   *   discrimination?: { cStatistic?: number },
   *   registry_version?: number, registryVersion?: number
   * }>} snapshots — ordenados ou não (ordenamos por window_to)
   * @param {{ model?: string, careLineId?: string, outcome?: string, minPoints?: number }} [options]
   */
  function detectModelDriftFromSnapshots(snapshots, options) {
    var rawOpts = options && typeof options === "object" ? options : {};
    var hadRecalibrationAsk = false;
    for (var rk = 0; rk < RECALIBRATION_OPTION_KEYS.length; rk++) {
      if (rawOpts[RECALIBRATION_OPTION_KEYS[rk]] !== undefined) {
        hadRecalibrationAsk = true;
        break;
      }
    }
    var opts = stripRecalibrationOptions(rawOpts);

    if (!trendApi || typeof trendApi.buildIndicatorTrend !== "function") {
      throw new Error("cpi-model-drift: cpi-trend.buildIndicatorTrend indisponível");
    }

    var model = str(opts.model) || null;
    var careLineId = str(opts.careLineId) || null;
    var outcome = str(opts.outcome) || null;
    var minPoints = finiteOrNull(opts.minPoints);
    if (minPoints == null) minPoints = trendApi.DEFAULT_MIN_POINTS || 8;

    var list = asArray(snapshots)
      .slice()
      .sort(function (a, b) {
        var ta = str(a && (a.window_to || a.windowTo));
        var tb = str(b && (b.window_to || b.windowTo));
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });

    var points = [];
    var slopeSeries = [];
    var cSeries = [];

    for (var i = 0; i < list.length; i++) {
      var snap = list[i] || {};
      var from = str(snap.window_from || snap.windowFrom);
      var to = str(snap.window_to || snap.windowTo);
      var label = from && to ? from + "/" + to : "snap-" + i;
      var period = { from: from || null, to: to || null, label: label };
      var cal = snap.calibration && typeof snap.calibration === "object"
        ? snap.calibration
        : {};
      var disc =
        snap.discrimination && typeof snap.discrimination === "object"
          ? snap.discrimination
          : {};
      var slope = finiteOrNull(cal.slope);
      var intercept = finiteOrNull(cal.intercept);
      var cStat = finiteOrNull(disc.cStatistic);
      var status = snap.status != null ? str(snap.status) : null;
      var gap = slope == null || status === NOT_VALIDATED;

      points.push({
        period: period,
        slope: gap ? null : slope,
        intercept: gap ? null : intercept,
        cStat: gap ? null : cStat,
        events: null,
        gap: gap,
        status: status,
      });

      var regVer = finiteOrNull(
        snap.registry_version != null ? snap.registry_version : snap.registryVersion,
      );
      var meta = {
        period: period,
        suppressed: gap,
        reason: gap ? "snapshot_gap" : null,
        value: gap ? null : slope,
        denominator: gap ? 0 : 1,
        registryVersion: regVer,
      };
      slopeSeries.push(meta);
      cSeries.push(
        Object.assign({}, meta, {
          suppressed: gap || cStat == null,
          value: gap || cStat == null ? null : cStat,
          reason: gap || cStat == null ? "snapshot_gap" : null,
        }),
      );
    }

    var trendOpts = {
      indicatorId: model && careLineId ? model + "@" + careLineId + ":slope" : "slope",
      careLineId: careLineId,
      chart: "individual",
      minPoints: minPoints,
      minDenominator: 1,
    };

    var slopeTrend =
      slopeSeries.length > 0
        ? trendApi.buildIndicatorTrend(slopeSeries, trendOpts)
        : {
            stability: "insufficient_points",
            signals: [],
            breaks: [],
            points: [],
          };

    var cTrend =
      cSeries.length > 0
        ? trendApi.buildIndicatorTrend(
            cSeries,
            Object.assign({}, trendOpts, {
              indicatorId:
                model && careLineId ? model + "@" + careLineId + ":cStat" : "cStat",
            }),
          )
        : { stability: "insufficient_points", signals: [], breaks: [], points: [] };

    var breaks = asArray(slopeTrend.breaks).map(function (b) {
      return { period: b.periodLabel, reason: b.reason };
    });

    var slopeDrift = firstDriftFromSignals(slopeTrend.signals);
    var kind = classifyKind(slopeDrift, cTrend);
    var drift =
      slopeDrift == null
        ? null
        : {
            rule: slopeDrift.rule,
            period: slopeDrift.period,
            direction: slopeDrift.direction,
            kind: kind,
          };

    var priorStatus = "validated";
    var validationFrom = { period: null, status: priorStatus };
    if (drift) {
      var driftIdx = -1;
      for (var d = 0; d < points.length; d++) {
        if (points[d].period && points[d].period.label === drift.period) {
          driftIdx = d;
          break;
        }
      }
      for (var p = 0; p < (driftIdx < 0 ? points.length : driftIdx); p++) {
        if (!points[p].gap && points[p].status) priorStatus = points[p].status;
      }
      // CPIMOD-AC-08: marca not_validated a partir da detecção; não reescreve história.
      validationFrom = { period: drift.period, status: NOT_VALIDATED };
    } else if (points.length > 0) {
      var last = points[points.length - 1];
      validationFrom = {
        period: last.period && last.period.label ? last.period.label : null,
        status: last.status || (last.gap ? "provisional" : priorStatus),
      };
    }

    var pendingDecision = null;
    if (drift || hadRecalibrationAsk) {
      pendingDecision = {
        kind: "model_recalibration",
        target: { model: model, careLineId: careLineId, outcome: outcome },
        rationaleRequired: true,
        executed: false,
      };
    }

    return {
      model: model,
      careLineId: careLineId,
      outcome: outcome,
      points: points,
      breaks: breaks,
      stability: slopeTrend.stability,
      drift: drift,
      validationFrom: validationFrom,
      pendingDecision: pendingDecision,
      source: "persisted_snapshots",
      _slopeTrend: slopeTrend,
      _cTrend: cTrend,
    };
  }

  return {
    NOT_VALIDATED: NOT_VALIDATED,
    RISK_MODEL_NOT_VALIDATED_REASON: RISK_MODEL_NOT_VALIDATED_REASON,
    detectModelDrift: detectModelDrift,
    detectModelDriftFromSnapshots: detectModelDriftFromSnapshots,
    validationStatusByPeriod: validationStatusByPeriod,
    toValidationMap: toValidationMap,
    applyDriftDegrade: applyDriftDegrade,
    refuseRecalibration: refuseRecalibration,
    driftReportToMarkdown: driftReportToMarkdown,
    driftReportToJson: driftReportToJson,
  };
});
