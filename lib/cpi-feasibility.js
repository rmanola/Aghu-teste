/**
 * FEAT-115/117/118/119 — Relatório de viabilidade CPI por indicador (só agregados).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiFeasibility = api;
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

  var careLinesApi = load("cpi-care-lines.js", "AghuCpiCareLines");
  var indicatorApi = load("cpi-indicator-library.js", "AghuCpiIndicatorLibrary");
  var labSeriesApi = load("cpi-lab-series.js", "AghuCpiLabSeries");

  var LAB_SERIES_PARTIAL_THRESHOLD = 0.5;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * Facto presente se a chave existe e (array → length>0 | boolean → true | other truthy).
   * @param {object} facts
   * @param {string} field
   */
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
   * @param {number} coverage 0..1
   * @returns {"feasible"|"partial"|"blocked"}
   */
  function classifyCoverage(coverage) {
    if (coverage >= 0.8) return "feasible";
    if (coverage >= 0.3) return "partial";
    return "blocked";
  }

  function hasFiniteNumber(facts, key) {
    if (!facts || typeof facts !== "object") return false;
    var n = Number(facts[key]);
    return Number.isFinite(n);
  }

  function hasCharlsonCoverage(facts) {
    if (!facts || typeof facts !== "object") return false;
    if (facts.charlsonBand != null && str(facts.charlsonBand) !== "") return true;
    if (facts.charlson && typeof facts.charlson === "object") {
      if (facts.charlson.band != null && str(facts.charlson.band) !== "") return true;
      if (facts.charlson.score != null && Number.isFinite(Number(facts.charlson.score))) {
        return true;
      }
    }
    return factPresent(facts, "charlsonScore") || factPresent(facts, "charlsonBand");
  }

  function hasMeldCoverage(facts) {
    return (
      hasFiniteNumber(facts, "bilirubinMgDl") &&
      hasFiniteNumber(facts, "inr") &&
      hasFiniteNumber(facts, "creatinineMgDl")
    );
  }

  /**
   * Resolve patient shape para extractLabSeries (exams no patient ou em facts).
   * @param {object} caseRow
   */
  function resolvePatientForSeries(caseRow) {
    var c = caseRow && typeof caseRow === "object" ? caseRow : {};
    var facts = c.facts && typeof c.facts === "object" ? c.facts : {};
    if (c.patient && typeof c.patient === "object") return c.patient;
    if (facts.patient && typeof facts.patient === "object") return facts.patient;
    if (Array.isArray(facts.exams)) return { exams: facts.exams };
    if (Array.isArray(c.exams)) return { exams: c.exams };
    return { exams: [] };
  }

  function isCreatinineSeriesUsable(caseRow) {
    if (!labSeriesApi || typeof labSeriesApi.extractLabSeries !== "function") {
      return false;
    }
    var series = labSeriesApi.extractLabSeries(resolvePatientForSeries(caseRow), {
      analyte: "creatinina",
    });
    return !!(series && series.usable);
  }

  /**
   * @param {object} cohort
   * @param {object[]} [cohort.cases] — [{ facts, specialty?, careLineId?, patient? }]
   * @param {object[]} [cohort.indicators]
   * @param {object[]} [cohort.catalog]
   * @param {string} [cohort.specialtyFilter]
   * @param {{ indicators?: object[], catalog?: object[], specialty?: string }} [options]
   */
  function buildFeasibilityReport(cohort, options) {
    var opts = options && typeof options === "object" ? options : {};
    var body = cohort && typeof cohort === "object" ? cohort : {};
    var specialtyFilter =
      str(opts.specialty || body.specialtyFilter || body.specialty) || null;
    var casesAll = asArray(body.cases);
    var cases = specialtyFilter
      ? casesAll.filter(function (c) {
          return str((c && c.specialty) || "") === specialtyFilter;
        })
      : casesAll;
    var catalogAll = asArray(
      opts.catalog || body.catalog || (careLinesApi && careLinesApi.CARE_LINES) || [],
    );
    var catalog = specialtyFilter
      ? catalogAll.filter(function (line) {
          return line && str(line.specialty) === specialtyFilter;
        })
      : catalogAll;
    var lineIdSet = {};
    for (var ci = 0; ci < catalog.length; ci++) {
      if (catalog[ci] && catalog[ci].id) lineIdSet[str(catalog[ci].id)] = true;
    }
    var indicatorsAll = asArray(
      opts.indicators || body.indicators || (indicatorApi && indicatorApi.INDICATORS) || [],
    );
    var indicators = specialtyFilter
      ? indicatorsAll.filter(function (ind) {
          if (!ind) return false;
          if (lineIdSet[str(ind.careLineId)]) return true;
          var multi = asArray(ind.careLineIds);
          for (var mi = 0; mi < multi.length; mi++) {
            if (lineIdSet[str(multi[mi])]) return true;
          }
          return false;
        })
      : indicatorsAll;

    var totalCases = cases.length;
    var unattributedCount = 0;
    var bySpecialty = {};
    var usableSeriesCount = 0;

    for (var i = 0; i < cases.length; i++) {
      var c = cases[i] || {};
      var facts = c.facts || {};
      var specialty = str(c.specialty) || "unknown";
      if (!bySpecialty[specialty]) {
        bySpecialty[specialty] = { total: 0, unattributed: 0 };
      }
      bySpecialty[specialty].total += 1;

      var attr =
        careLinesApi && careLinesApi.attributeCareLines
          ? careLinesApi.attributeCareLines(facts, { catalog: catalog })
          : { unattributed: true, careLines: [] };
      if (attr.unattributed) {
        unattributedCount += 1;
        bySpecialty[specialty].unattributed += 1;
      }

      if (isCreatinineSeriesUsable(c)) usableSeriesCount += 1;
    }

    var unattributedRate =
      totalCases === 0 ? null : unattributedCount / totalCases;
    var usableSeriesRate =
      totalCases === 0 ? null : usableSeriesCount / totalCases;
    var degradeKdigo =
      usableSeriesRate != null && usableSeriesRate < LAB_SERIES_PARTIAL_THRESHOLD;

    var unattributedBySpecialty = {};
    var specKeys = Object.keys(bySpecialty);
    for (var s = 0; s < specKeys.length; s++) {
      var sk = specKeys[s];
      var row = bySpecialty[sk];
      unattributedBySpecialty[sk] = {
        total: row.total,
        unattributed: row.unattributed,
        rate: row.total === 0 ? null : row.unattributed / row.total,
      };
    }

    var indicatorRows = [];
    for (var j = 0; j < indicators.length; j++) {
      var ind = indicators[j];
      if (!ind || !ind.id) continue;
      var required = asArray(ind.requiredFacts);
      var missingCounts = {};
      for (var r = 0; r < required.length; r++) {
        missingCounts[required[r]] = 0;
      }

      var presentSum = 0;
      var checks = 0;
      if (required.length === 0) {
        presentSum = 1;
        checks = 1;
      } else if (totalCases === 0) {
        for (var m0 = 0; m0 < required.length; m0++) {
          missingCounts[required[m0]] = 0;
        }
        presentSum = 0;
        checks = required.length;
      } else {
        for (var k = 0; k < cases.length; k++) {
          var f = (cases[k] && cases[k].facts) || {};
          for (var m = 0; m < required.length; m++) {
            var field = required[m];
            checks += 1;
            if (factPresent(f, field)) {
              presentSum += 1;
            } else {
              missingCounts[field] += 1;
            }
          }
        }
      }

      var coverage = checks === 0 ? 0 : presentSum / checks;
      var status = classifyCoverage(coverage);
      var partialReason = null;
      var seededStatus = str(ind.status);
      if (seededStatus === "blocked") {
        // lacuna nomeada no seed — não reabrir via cobertura
        status = "blocked";
      } else if (degradeKdigo && str(ind.riskModel) === "kdigo") {
        // NEF-AC-13: cobertura de série < 0.5 prevalece sobre classificação por requiredFacts
        status = "partial";
        partialReason = "lab_series_coverage";
      }

      var missingFields = [];
      var missKeys = Object.keys(missingCounts);
      for (var mk = 0; mk < missKeys.length; mk++) {
        if (missingCounts[missKeys[mk]] > 0) missingFields.push(missKeys[mk]);
      }
      missingFields.sort();

      var rowOut = {
        indicatorId: str(ind.id),
        careLineId: str(ind.careLineId),
        dimension: str(ind.dimension),
        status: status,
        coverage: coverage,
        missingFields: missingFields,
        requiredFacts: required.slice(),
      };
      if (partialReason) rowOut.partialReason = partialReason;
      indicatorRows.push(rowOut);
    }

    // CAD-AC-12: cobertura Charlson / MELD por linha de cuidado
    var coverageByLine = {};
    for (var lc = 0; lc < catalog.length; lc++) {
      var lineDef = catalog[lc];
      if (!lineDef || !lineDef.id) continue;
      coverageByLine[str(lineDef.id)] = {
        careLineId: str(lineDef.id),
        specialty: str(lineDef.specialty),
        caseCount: 0,
        charlsonPresent: 0,
        meldPresent: 0,
        labSeriesUsable: 0,
      };
    }
    for (var cc = 0; cc < cases.length; cc++) {
      var caseRow = cases[cc] || {};
      var caseFacts = caseRow.facts || {};
      var attributed =
        careLinesApi && careLinesApi.attributeCareLines
          ? careLinesApi.attributeCareLines(caseFacts, { catalog: catalog })
          : { careLines: [] };
      var lineHits = asArray(attributed.careLines).map(function (h) {
        return str(h.careLineId);
      });
      if (caseRow.careLineId && str(caseRow.careLineId)) {
        var explicit = str(caseRow.careLineId);
        if (lineHits.indexOf(explicit) === -1) lineHits.push(explicit);
      }
      var seriesOk = isCreatinineSeriesUsable(caseRow);
      for (var lh = 0; lh < lineHits.length; lh++) {
        var lid = lineHits[lh];
        if (!coverageByLine[lid]) {
          coverageByLine[lid] = {
            careLineId: lid,
            specialty: str(caseRow.specialty) || specialtyFilter || "unknown",
            caseCount: 0,
            charlsonPresent: 0,
            meldPresent: 0,
            labSeriesUsable: 0,
          };
        }
        var cov = coverageByLine[lid];
        cov.caseCount += 1;
        if (hasCharlsonCoverage(caseFacts)) cov.charlsonPresent += 1;
        if (hasMeldCoverage(caseFacts)) cov.meldPresent += 1;
        if (seriesOk) cov.labSeriesUsable += 1;
      }
    }
    var careLineCoverage = Object.keys(coverageByLine)
      .sort()
      .map(function (id) {
        var row = coverageByLine[id];
        return {
          careLineId: row.careLineId,
          specialty: row.specialty,
          caseCount: row.caseCount,
          charlsonCoverage:
            row.caseCount === 0 ? null : row.charlsonPresent / row.caseCount,
          meldCoverage:
            row.caseCount === 0 ? null : row.meldPresent / row.caseCount,
          labSeriesCoverage:
            row.caseCount === 0 ? null : row.labSeriesUsable / row.caseCount,
        };
      });

    return {
      caseCount: totalCases,
      specialtyFilter: specialtyFilter,
      unattributedRate: unattributedRate,
      unattributedCount: unattributedCount,
      unattributedBySpecialty: unattributedBySpecialty,
      usableSeriesCount: usableSeriesCount,
      usableSeriesRate: usableSeriesRate,
      careLineCoverage: careLineCoverage,
      indicators: indicatorRows,
    };
  }

  /**
   * Serializa só agregados (sem PHI).
   * @param {object} report
   * @returns {string}
   */
  function reportToJson(report) {
    return JSON.stringify(report, null, 2);
  }

  /**
   * @param {object} report
   * @returns {string}
   */
  function reportToMarkdown(report) {
    var lines = [];
    lines.push("# CPI feasibility report");
    lines.push("");
    if (report && report.specialtyFilter) {
      lines.push("- specialty: " + report.specialtyFilter);
    }
    lines.push("- cases: " + (report && report.caseCount));
    lines.push(
      "- unattributedRate: " +
        (report && report.unattributedRate == null
          ? "n/a"
          : Number(report.unattributedRate).toFixed(3)),
    );

    // NEF-AC-12: cobertura de série laboratorial ANTES dos indicadores
    var showLabSeries =
      report &&
      (str(report.specialtyFilter) === "nefrologia" ||
        report.usableSeriesRate != null);
    if (showLabSeries) {
      lines.push("");
      lines.push("## Lab series coverage (creatinina)");
      lines.push("");
      lines.push(
        "- usableSeriesRate: " +
          (report.usableSeriesRate == null
            ? "n/a"
            : Number(report.usableSeriesRate).toFixed(3)),
      );
      lines.push(
        "- usableSeriesCount: " +
          (report.usableSeriesCount == null ? "n/a" : report.usableSeriesCount),
      );
      if (
        report.usableSeriesRate != null &&
        report.usableSeriesRate < LAB_SERIES_PARTIAL_THRESHOLD
      ) {
        lines.push(
          "- note: usableSeriesRate < " +
            LAB_SERIES_PARTIAL_THRESHOLD +
            " → indicadores riskModel=kdigo marcados partial (lab_series_coverage)",
        );
      }
    }

    lines.push("");
    lines.push("## Unattributed by specialty");
    lines.push("");
    var by = (report && report.unattributedBySpecialty) || {};
    var keys = Object.keys(by).sort();
    if (!keys.length) {
      lines.push("_none_");
    } else {
      lines.push("| specialty | total | unattributed | rate |");
      lines.push("|---|---:|---:|---:|");
      for (var i = 0; i < keys.length; i++) {
        var row = by[keys[i]];
        lines.push(
          "| " +
            keys[i] +
            " | " +
            row.total +
            " | " +
            row.unattributed +
            " | " +
            (row.rate == null ? "n/a" : Number(row.rate).toFixed(3)) +
            " |",
        );
      }
    }
    lines.push("");
    lines.push("## Care line coverage (Charlson / MELD / lab series)");
    lines.push("");
    var covLines = asArray(report && report.careLineCoverage);
    if (!covLines.length) {
      lines.push("_none_");
    } else {
      lines.push("| careLineId | cases | Charlson | MELD | lab series |");
      lines.push("|---|---:|---:|---:|---:|");
      for (var c = 0; c < covLines.length; c++) {
        var cov = covLines[c];
        lines.push(
          "| " +
            cov.careLineId +
            " | " +
            cov.caseCount +
            " | " +
            (cov.charlsonCoverage == null
              ? "n/a"
              : Number(cov.charlsonCoverage).toFixed(3)) +
            " | " +
            (cov.meldCoverage == null
              ? "n/a"
              : Number(cov.meldCoverage).toFixed(3)) +
            " | " +
            (cov.labSeriesCoverage == null
              ? "n/a"
              : Number(cov.labSeriesCoverage).toFixed(3)) +
            " |",
        );
      }
    }
    lines.push("");
    lines.push("## Indicators");
    lines.push("");
    lines.push("| id | status | coverage | missing |");
    lines.push("|---|---|---:|---|");
    var inds = asArray(report && report.indicators);
    for (var j = 0; j < inds.length; j++) {
      var ind = inds[j];
      lines.push(
        "| " +
          ind.indicatorId +
          " | " +
          ind.status +
          " | " +
          Number(ind.coverage).toFixed(3) +
          " | " +
          (asArray(ind.missingFields).join(", ") || "—") +
          " |",
      );
    }
    lines.push("");
    return lines.join("\n");
  }

  return {
    buildFeasibilityReport: buildFeasibilityReport,
    reportToJson: reportToJson,
    reportToMarkdown: reportToMarkdown,
    classifyCoverage: classifyCoverage,
    factPresent: factPresent,
    LAB_SERIES_PARTIAL_THRESHOLD: LAB_SERIES_PARTIAL_THRESHOLD,
  };
});
