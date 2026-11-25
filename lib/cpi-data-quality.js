/**
 * FEAT-123 — Qualidade de dados CPI: completude por campo de indicador (não
 * por tabela), cobertura de série laboratorial, degradação por cobertura de
 * modelo de risco e lista de lacunas dos indicadores `blocked` restantes.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiDataQuality = api;
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

  var captureSchemaApi = load("cpi-capture-schema.js", "AghuCpiCaptureSchema");

  var COMPLETENESS_TARGET = 0.95;
  var RISK_MODEL_COVERAGE_THRESHOLD = 0.5;
  /** FEAT-143 / CPICAP-AC-12 — família FEAT-127 (0,7), não o 0,5 do risk model. */
  var CAPTURE_COVERAGE_MIN = 0.7;

  var RISK_MODEL_FIELDS = {
    charlson: ["charlsonBand"],
    meld: ["bilirubinMgDl", "inr", "creatinineMgDl"],
  };

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /** Mesma regra de presença de `cpi-feasibility.js` (array→length>0 etc). */
  function factPresent(facts, field) {
    if (!facts || typeof facts !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(facts, field)) return false;
    var v = facts[field];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return v;
    if (v == null) return false;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "string") return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return !!v;
  }

  /**
   * CPIDQ-AC-01/02: completude medida só sobre `requiredFacts` do indicador.
   * @param {object[]} cases
   * @param {object} indicator
   * @returns {Array<{ field: string, present: number, total: number, rate: number|null, belowTarget: boolean }>}
   */
  function measureCompleteness(cases, indicator) {
    var list = asArray(cases);
    var required = asArray(indicator && indicator.requiredFacts);
    var total = list.length;
    return required.map(function (field) {
      var present = 0;
      for (var i = 0; i < list.length; i++) {
        if (factPresent(list[i], field)) present += 1;
      }
      var rate = total === 0 ? null : present / total;
      return {
        field: field,
        present: present,
        total: total,
        rate: rate,
        belowTarget: rate != null && rate < COMPLETENESS_TARGET,
      };
    });
  }

  /**
   * CPIDQ-AC-04: fracção de episódios com ≥ `minMeasurements` medições
   * utilizáveis num campo de série (ex. `creatinineSeries`).
   * @param {object[]} cases
   * @param {string} seriesField
   * @param {number} [minMeasurements]
   */
  function measureLabSeriesCoverage(cases, seriesField, minMeasurements) {
    var list = asArray(cases);
    var min = minMeasurements == null ? 2 : minMeasurements;
    if (!list.length) return null;
    var covered = 0;
    for (var i = 0; i < list.length; i++) {
      var series = asArray(list[i] && list[i][seriesField]);
      if (series.length >= min) covered += 1;
    }
    return covered / list.length;
  }

  /**
   * @param {object[]} cases
   * @param {string} riskModel
   * @returns {number|null}
   */
  function measureRiskModelCoverage(cases, riskModel) {
    var fields = RISK_MODEL_FIELDS[riskModel];
    var list = asArray(cases);
    if (!fields || !list.length) return null;
    var present = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var allPresent = true;
      for (var f = 0; f < fields.length; f++) {
        if (!factPresent(c, fields[f])) {
          allPresent = false;
          break;
        }
      }
      if (allPresent) present += 1;
    }
    return present / list.length;
  }

  /**
   * CPIDQ-AC-05: cobertura do modelo de risco < 50% degrada indicador
   * `feasible` → `partial`, com `degradeReason` legível e específico.
   * @param {object} indicator
   * @param {object[]} cases
   * @returns {{ status: "partial", degradedFrom: "feasible", degradeReason: string }|null}
   */
  function episodeIdsFromCase(caseFacts) {
    var ids = [];
    var seen = {};
    var hosp = asArray(caseFacts && caseFacts.hospEpisodes);
    for (var h = 0; h < hosp.length; h++) {
      var hid = caseFacts.hospEpisodes[h] && caseFacts.hospEpisodes[h].id;
      if (hid != null && hid !== "" && !seen[String(hid)]) {
        seen[String(hid)] = true;
        ids.push(String(hid));
      }
    }
    var capture = caseFacts && caseFacts.capture;
    var maps = [
      capture && capture.byEpisode,
      capture && capture.unansweredByEpisode,
    ];
    for (var m = 0; m < maps.length; m++) {
      if (!maps[m] || typeof maps[m] !== "object") continue;
      var keys = Object.keys(maps[m]);
      for (var k = 0; k < keys.length; k++) {
        if (!seen[keys[k]]) {
          seen[keys[k]] = true;
          ids.push(keys[k]);
        }
      }
    }
    if (!ids.length) ids.push("_case");
    return ids;
  }

  function captureFieldsForIndicator(indicatorId) {
    if (
      !indicatorId ||
      !captureSchemaApi ||
      typeof captureSchemaApi.listFieldsFeedingIndicator !== "function"
    ) {
      return [];
    }
    return asArray(captureSchemaApi.listFieldsFeedingIndicator(indicatorId)).map(
      function (f) {
        return f && f.key;
      },
    ).filter(Boolean);
  }

  function episodeAnswered(caseFacts, episodeId, fieldKeys) {
    var capture = caseFacts && caseFacts.capture;
    var unanswered = asArray(
      capture &&
        capture.unansweredByEpisode &&
        capture.unansweredByEpisode[episodeId],
    );
    var values =
      (capture && capture.byEpisode && capture.byEpisode[episodeId]) || {};
    if (fieldKeys && fieldKeys.length) {
      for (var i = 0; i < fieldKeys.length; i++) {
        if (unanswered.indexOf(fieldKeys[i]) !== -1) return false;
        if (!Object.prototype.hasOwnProperty.call(values, fieldKeys[i])) {
          return false;
        }
      }
      return true;
    }
    return Object.keys(values).length > 0 && unanswered.length === 0;
  }

  /**
   * CPICAP-AC-12/16: fracção de episódios com captura completa (não unanswered).
   * @param {object[]} cases
   * @param {{ indicatorId?: string }} [opts]
   * @returns {number|null}
   */
  function measureCaptureCoverage(cases, opts) {
    var list = asArray(cases);
    if (!list.length) return null;
    var fieldKeys = captureFieldsForIndicator(opts && opts.indicatorId);
    var attributed = 0;
    var answered = 0;
    for (var i = 0; i < list.length; i++) {
      var eps = episodeIdsFromCase(list[i]);
      for (var e = 0; e < eps.length; e++) {
        attributed += 1;
        if (episodeAnswered(list[i], eps[e], fieldKeys)) answered += 1;
      }
    }
    return attributed === 0 ? null : answered / attributed;
  }

  /**
   * CPICAP-AC-12: cobertura de captura < 0,7 degrada feasible → partial.
   * Só aplica a indicadores alimentados por um schema registado.
   */
  function degradeByCaptureCoverage(indicator, cases) {
    if (!indicator || indicator.status !== "feasible") return null;
    var fields = captureFieldsForIndicator(indicator.id);
    if (!fields.length) return null;
    var coverage = measureCaptureCoverage(cases, { indicatorId: indicator.id });
    if (coverage == null || coverage >= CAPTURE_COVERAGE_MIN) return null;
    return {
      status: "partial",
      degradedFrom: "feasible",
      degradeReason: "capture_coverage",
    };
  }

  function caseUnansweredForIndicator(caseFacts, indicatorId) {
    var fields = captureFieldsForIndicator(indicatorId);
    if (!fields.length) return false;
    var capture = caseFacts && caseFacts.capture;
    var map = capture && capture.unansweredByEpisode;
    if (!map || typeof map !== "object") return false;
    var eps = Object.keys(map);
    for (var i = 0; i < eps.length; i++) {
      var list = asArray(map[eps[i]]);
      for (var f = 0; f < fields.length; f++) {
        if (list.indexOf(fields[f]) !== -1) return true;
      }
    }
    return false;
  }

  function degradeByCoverage(indicator, cases) {
    if (!indicator || !indicator.riskModel || indicator.status !== "feasible") {
      return null;
    }
    var coverage = measureRiskModelCoverage(cases, indicator.riskModel);
    if (coverage == null || coverage >= RISK_MODEL_COVERAGE_THRESHOLD) return null;
    return {
      status: "partial",
      degradedFrom: "feasible",
      degradeReason:
        indicator.riskModel + "_coverage_" + coverage.toFixed(2),
    };
  }

  /**
   * CPIDQ-AC-06: lacunas com campo em falta e origem possível. Exclui
   * indicadores resolvíveis pela ponte HPB (`hpbIndicatorKey`) — essas
   * promovem-se via `cpi-hpb-bridge.js`, não entram como lacuna aberta.
   * @param {object[]} indicators — INDICATORS da biblioteca
   * @returns {Array<{ id: string, missingFields: string[], originHint: string }>}
   */
  function listBlockedGaps(indicators) {
    var list = asArray(indicators);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var ind = list[i];
      if (!ind || ind.status !== "blocked") continue;
      if (ind.hpbIndicatorKey) continue;
      var missing = asArray(ind.missingFields);
      if (!missing.length) missing = asArray(ind.requiredFacts);
      out.push({
        id: String(ind.id),
        missingFields: missing.slice(),
        originHint: String(ind.blockedReason || "campo não extraído do AGHU"),
      });
    }
    return out;
  }

  return {
    COMPLETENESS_TARGET: COMPLETENESS_TARGET,
    RISK_MODEL_COVERAGE_THRESHOLD: RISK_MODEL_COVERAGE_THRESHOLD,
    CAPTURE_COVERAGE_MIN: CAPTURE_COVERAGE_MIN,
    factPresent: factPresent,
    measureCompleteness: measureCompleteness,
    measureLabSeriesCoverage: measureLabSeriesCoverage,
    measureRiskModelCoverage: measureRiskModelCoverage,
    measureCaptureCoverage: measureCaptureCoverage,
    degradeByCoverage: degradeByCoverage,
    degradeByCaptureCoverage: degradeByCaptureCoverage,
    caseUnansweredForIndicator: caseUnansweredForIndicator,
    listBlockedGaps: listBlockedGaps,
  };
});
