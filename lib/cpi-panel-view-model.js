/**
 * FEAT-121 — Modelo de vista puro: agregado da FEAT-120 → cartões, bandas, estados.
 * Sem DOM, sem Next.js — testável em node (CPIUI-AC-03..09, AC-13). Nunca recalcula
 * razão nem intervalo; toda a aritmética vive aqui e em cpi-dashboard-aggregate.js.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiPanelViewModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var BAND_GREEN_MIN = 0.85;
  var BAND_GREEN_MAX = 1.15;
  var BAND_RED_LOW = 0.7;
  var BAND_RED_HIGH = 1.35;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /**
   * CPIUI-AC-03/04: bandas nas fronteiras exactas; IC95% contendo 1 nunca
   * colore, independentemente do ponto — a cor não aparece sem suporte
   * estatístico.
   * @param {number|null} ratio
   * @param {[number,number]|null} ci95
   * @returns {"green"|"yellow"|"red"|"none"}
   */
  function bandForRatio(ratio, ci95) {
    if (ratio == null || !Number.isFinite(ratio)) return "none";
    if (
      Array.isArray(ci95) &&
      ci95[0] != null &&
      ci95[1] != null &&
      ci95[0] <= 1 &&
      1 <= ci95[1]
    ) {
      return "none";
    }
    if (ratio >= BAND_GREEN_MIN && ratio <= BAND_GREEN_MAX) return "green";
    if (ratio < BAND_RED_LOW || ratio > BAND_RED_HIGH) return "red";
    return "yellow";
  }

  /** @param {object} ind */
  function cardStateFor(ind) {
    if (ind.status === "blocked") return "blocked";
    if (ind.suppressed) return "suppressed";
    return ind.status === "partial" ? "partial" : "feasible";
  }

  /**
   * Mapa indicador → filtros de drill-down em `/pacientes`. Indicador sem
   * entrada aqui não fica clicável (CPIUI-AC-08).
   */
  var DRILL_SUFFIX_MAP = {
    "SAF-03": { icu: "unplanned" },
  };

  /**
   * Constrói `/pacientes?...` sem depender de Next.js — mesmo contrato de
   * `buildPacientesFilterHref` (só serializa chaves com valor truthy).
   * @param {Record<string,string>} patch
   * @param {string} period
   */
  function buildDrillHref(patch, period) {
    var params = Object.assign({ period: period }, patch);
    var keys = Object.keys(params).sort();
    var qs = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = params[k];
      if (v) qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
    return qs.length ? "/pacientes?" + qs.join("&") : "/pacientes";
  }

  /**
   * @param {object} ind
   * @param {string} period
   */
  function drillHrefFor(ind, period) {
    var suffixes = Object.keys(DRILL_SUFFIX_MAP);
    var matched = null;
    for (var i = 0; i < suffixes.length; i++) {
      if (String(ind.id).indexOf(suffixes[i], String(ind.id).length - suffixes[i].length) !== -1) {
        matched = suffixes[i];
        break;
      }
    }
    if (!matched) return null;
    return buildDrillHref(DRILL_SUFFIX_MAP[matched], period);
  }

  /**
   * @param {object} ind
   * @param {string} period
   */
  function buildCard(ind, period) {
    var state = cardStateFor(ind);
    var applicable = state === "feasible" || state === "partial";
    var ratio = applicable ? ind.ratio : null;
    var ci95 = applicable ? ind.ci95 : null;
    return {
      id: ind.id,
      label: ind.label || ind.id,
      dimension: ind.dimension,
      state: state,
      ratio: ratio,
      ci95: ci95,
      band: applicable ? bandForRatio(ratio, ci95) : "none",
      significant: applicable ? !!ind.significant : false,
      coverage:
        ind.riskModelCoverageShare != null
          ? Number(ind.riskModelCoverageShare)
          : null,
      missingFields: state === "blocked" ? asArray(ind.missingFields).slice() : [],
      drillHref:
        state === "blocked" || state === "suppressed"
          ? null
          : drillHrefFor(ind, period),
      referenceSource: ind.referenceSource != null ? ind.referenceSource : null,
      referenceYear: ind.referenceYear != null ? ind.referenceYear : null,
      referencePopulation:
        ind.referencePopulation != null ? ind.referencePopulation : null,
      referenceCitation:
        ind.referenceCitation != null ? ind.referenceCitation : null,
      referenceId: ind.referenceId != null ? ind.referenceId : null,
      stale: !!ind.stale,
      noReference: !!ind.noReference,
      referenceRange: Array.isArray(ind.referenceRange)
        ? ind.referenceRange.slice()
        : null,
      degradeReason: ind.degradeReason != null ? ind.degradeReason : null,
      // FEAT-127 — estado de validação do modelo de risco nesta população
      // (CPIVAL-AC-06/14). O cartão apresenta-o por texto; a cor nunca é o
      // único portador da informação.
      riskModel: ind.riskModel != null ? ind.riskModel : null,
      validationStatus:
        ind.validationStatus != null ? ind.validationStatus : null,
      // FEAT-136 — janela do snapshot (CPIMOD-AC-14).
      validationWindowFrom:
        ind.validationWindowFrom != null ? ind.validationWindowFrom : null,
      validationWindowTo:
        ind.validationWindowTo != null ? ind.validationWindowTo : null,
      // FEAT-131 — deriva do modelo (distinta de desempenho clínico).
      driftKind: ind.driftKind != null ? ind.driftKind : null,
      driftPeriod: ind.driftPeriod != null ? ind.driftPeriod : null,
      driftRule: ind.driftRule != null ? ind.driftRule : null,
      observingCount:
        ind.observingCount != null && Number.isFinite(Number(ind.observingCount))
          ? Number(ind.observingCount)
          : 0,
      cumprido:
        ind.cumprido != null && Number.isFinite(Number(ind.cumprido))
          ? Number(ind.cumprido)
          : null,
      emAberto:
        ind.emAberto != null && Number.isFinite(Number(ind.emAberto))
          ? Number(ind.emAberto)
          : null,
      perdido:
        ind.perdido != null && Number.isFinite(Number(ind.perdido))
          ? Number(ind.perdido)
          : null,
      lostShare:
        ind.lostShare != null && Number.isFinite(Number(ind.lostShare))
          ? Number(ind.lostShare)
          : null,
      source: ind.source != null ? String(ind.source) : null,
    };
  }

  /**
   * Anexa kind/período de deriva aos indicadores a partir de `aggregate.modelDrift`.
   * @param {object} ind
   * @param {object[]} drifts
   * @param {string} careLineId
   */
  function enrichIndicatorDrift(ind, drifts, careLineId) {
    var list = asArray(drifts);
    var riskModel = ind.riskModel != null ? String(ind.riskModel) : "";
    if (!riskModel || list.length === 0) return ind;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || !d.drift) continue;
      if (String(d.model) !== riskModel) continue;
      if (
        d.careLineId != null &&
        careLineId &&
        String(d.careLineId) !== String(careLineId)
      ) {
        continue;
      }
      return Object.assign({}, ind, {
        driftKind: d.drift.kind || null,
        driftPeriod: d.drift.period || null,
        driftRule: d.drift.rule || null,
      });
    }
    return ind;
  }

  /**
   * CPIUI-AC-01: só linhas com pelo menos um caso atribuído (n>0 — o agregado
   * da FEAT-120 já omite linhas vazias; este filtro é rede de segurança).
   * CPIUI-AC-07: taxa de unattributed junto de cada linha — sem CID-10 não há
   * especialidade conhecida por caso não atribuído (ver FEATURES.md, nota
   * FEAT-115..119), por isso a taxa é global da coorte, não por especialidade.
   * @param {object|null|undefined} aggregate — saída de aggregateCpi
   * @param {{ period?: string, careLineId?: string|null, dimension?: string|null }|null|undefined} options
   */
  function buildCpiPanelViewModel(aggregate, options) {
    var opts = options && typeof options === "object" ? options : {};
    var period = opts.period || "30d";

    if (!aggregate || !Array.isArray(aggregate.careLines)) {
      return { careLines: [], empty: true };
    }

    var nTotal = (aggregate.cohort && aggregate.cohort.nTotal) || 0;
    var nUnattributed = (aggregate.cohort && aggregate.cohort.nUnattributed) || 0;
    var unattributedRate = nTotal > 0 ? nUnattributed / nTotal : null;

    var lines = aggregate.careLines.filter(function (l) {
      return l && l.n > 0;
    });
    if (opts.careLineId) {
      lines = lines.filter(function (l) {
        return l.careLineId === opts.careLineId;
      });
    }

    var modelDrift = asArray(aggregate.modelDrift);

    var careLines = lines.map(function (line) {
      var indicators = asArray(line.indicators);
      if (opts.dimension) {
        indicators = indicators.filter(function (i) {
          return i.dimension === opts.dimension;
        });
      }
      return {
        careLineId: line.careLineId,
        label: line.label,
        specialty: line.specialty,
        n: line.n,
        unattributedRate: unattributedRate,
        cards: indicators.map(function (ind) {
          return buildCard(
            enrichIndicatorDrift(ind, modelDrift, line.careLineId),
            period,
          );
        }),
      };
    });

    return {
      careLines: careLines,
      empty: careLines.length === 0,
      // FEAT-129 (CPICFG-AC-13) — data de referência e decisões aplicadas
      effectiveConfig: aggregate.effectiveConfig
        ? {
            asOf: aggregate.effectiveConfig.asOf || null,
            registryVersion:
              aggregate.effectiveConfig.registryVersion != null
                ? Number(aggregate.effectiveConfig.registryVersion)
                : null,
            applied: !!aggregate.effectiveConfig.applied,
            appliedDecisions: asArray(
              aggregate.effectiveConfig.appliedDecisions,
            ).map(function (d) {
              return {
                id: d && d.id != null ? String(d.id) : "",
                kind: d && d.kind != null ? String(d.kind) : "",
                target: d && d.target != null ? String(d.target) : null,
                effectiveFrom:
                  d && d.effectiveFrom != null ? String(d.effectiveFrom) : "",
              };
            }),
          }
        : null,
    };
  }

  return {
    BAND_GREEN_MIN: BAND_GREEN_MIN,
    BAND_GREEN_MAX: BAND_GREEN_MAX,
    BAND_RED_LOW: BAND_RED_LOW,
    BAND_RED_HIGH: BAND_RED_HIGH,
    bandForRatio: bandForRatio,
    buildCpiPanelViewModel: buildCpiPanelViewModel,
  };
});
