/**
 * FEAT-124 — Relatório de expansão CPI (delta unattributed + prontidão de promoção).
 * Só agregados; nunca muta lifecycle.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiExpansionReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object") return mod;
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

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function countUnattributed(factsList, catalog) {
    var list = asArray(factsList);
    var un = 0;
    var attrApi =
      careLinesApi && typeof careLinesApi.attributeCareLines === "function"
        ? careLinesApi.attributeCareLines
        : null;
    if (!attrApi) return { total: list.length, unattributed: list.length };
    for (var i = 0; i < list.length; i++) {
      var r = attrApi(list[i], { catalog: catalog });
      if (!r || r.unattributed) un += 1;
    }
    return { total: list.length, unattributed: un };
  }

  function countAttributedToLine(factsList, catalog, careLineId) {
    var list = asArray(factsList);
    var n = 0;
    var attrApi =
      careLinesApi && typeof careLinesApi.attributeCareLines === "function"
        ? careLinesApi.attributeCareLines
        : null;
    if (!attrApi) return 0;
    var want = str(careLineId);
    for (var i = 0; i < list.length; i++) {
      var r = attrApi(list[i], { catalog: catalog });
      var hits = asArray(r && r.careLines);
      for (var h = 0; h < hits.length; h++) {
        if (str(hits[h].careLineId) === want) {
          n += 1;
          break;
        }
      }
    }
    return n;
  }

  function pp(count, total) {
    if (!total) return 0;
    return (100 * count) / total;
  }

  /**
   * @param {object[]} factsList
   * @param {{
   *   catalog?: object[],
   *   baselineCatalog?: object[],
   *   period?: string|null
   * }} [options]
   */
  function buildExpansionReport(factsList, options) {
    var opts = options && typeof options === "object" ? options : {};
    var fullCatalog = Array.isArray(opts.catalog)
      ? opts.catalog
      : careLinesApi && Array.isArray(careLinesApi.CARE_LINES)
        ? careLinesApi.CARE_LINES
        : [];
    var baseline = Array.isArray(opts.baselineCatalog)
      ? opts.baselineCatalog
      : fullCatalog.filter(function (l) {
          return l && str(l.lifecycle) === "active";
        });

    var before = countUnattributed(factsList, baseline);
    var after = countUnattributed(factsList, fullCatalog);
    var beforePp = pp(before.unattributed, before.total);
    var afterPp = pp(after.unattributed, after.total);
    var deltaPp = beforePp - afterPp;

    var candidates = fullCatalog.filter(function (l) {
      return l && str(l.lifecycle) === "candidate";
    });

    var rows = [];
    for (var i = 0; i < candidates.length; i++) {
      var line = candidates[i];
      var id = str(line.id);
      var withOnly =
        baseline.slice().concat([line]);
      var mid = countUnattributed(factsList, withOnly);
      var midPp = pp(mid.unattributed, mid.total);
      var lineDelta = beforePp - midPp;
      var attributedN = countAttributedToLine(factsList, fullCatalog, id);
      var attributedFraction =
        before.total > 0 ? attributedN / before.total : 0;

      var promo =
        line.promotion && typeof line.promotion === "object"
          ? line.promotion
          : {};
      var minUnits =
        promo.minAttributedUnits != null
          ? Number(promo.minAttributedUnits)
          : 30;
      var minPrec =
        promo.minSampledPrecision != null
          ? Number(promo.minSampledPrecision)
          : 0.9;
      var meetsUnits =
        Number.isFinite(minUnits) && attributedN >= minUnits;
      var sampled =
        promo.sampledPrecision != null
          ? Number(promo.sampledPrecision)
          : null;
      var meetsPrec =
        sampled != null &&
        Number.isFinite(sampled) &&
        Number.isFinite(minPrec) &&
        sampled >= minPrec &&
        promo.sampleSize != null &&
        promo.reviewedAt != null;

      rows.push({
        careLineId: id,
        label: str(line.label),
        attributedUnits: attributedN,
        attributedFraction: attributedFraction,
        unattributedDeltaPp: lineDelta,
        insufficientCoverageEvidence: lineDelta < 1,
        meetsMinAttributedUnits: meetsUnits,
        meetsMinSampledPrecision: !!meetsPrec,
        sampledPrecision: sampled,
        sampleSize: promo.sampleSize != null ? promo.sampleSize : null,
        reviewedAt: promo.reviewedAt != null ? promo.reviewedAt : null,
        lastReviewStatus:
          promo.lastReviewStatus != null ? str(promo.lastReviewStatus) : null,
        readyForSampling: !!(meetsUnits && !meetsPrec),
        promotionReady: !!(meetsUnits && meetsPrec),
      });
    }

    return {
      period: opts.period || null,
      matchVersion:
        careLinesApi && careLinesApi.MATCH_VERSION != null
          ? careLinesApi.MATCH_VERSION
          : null,
      cohortSize: before.total,
      unattributedBefore: before.unattributed,
      unattributedAfter: after.unattributed,
      unattributedBeforePp: beforePp,
      unattributedAfterPp: afterPp,
      unattributedDeltaPp: deltaPp,
      candidates: rows,
    };
  }

  function reportToJson(report) {
    return JSON.stringify(report, null, 2);
  }

  function reportToMarkdown(report) {
    var r = report && typeof report === "object" ? report : {};
    var lines = [];
    lines.push("# CPI expansion report");
    lines.push("");
    lines.push("- cohortSize: " + r.cohortSize);
    lines.push(
      "- unattributed before → after: " +
        Number(r.unattributedBeforePp).toFixed(2) +
        " pp → " +
        Number(r.unattributedAfterPp).toFixed(2) +
        " pp (Δ " +
        Number(r.unattributedDeltaPp).toFixed(2) +
        " pp)",
    );
    lines.push("");
    lines.push("| careLineId | attributed | Δ unattr pp | coverage OK | promo ready |");
    lines.push("|---|---:|---:|---|---|");
    var cands = asArray(r.candidates);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      lines.push(
        "| " +
          str(c.careLineId) +
          " | " +
          c.attributedUnits +
          " | " +
          Number(c.unattributedDeltaPp).toFixed(2) +
          " | " +
          (c.insufficientCoverageEvidence ? "no (<1pp)" : "yes") +
          " | " +
          (c.promotionReady ? "yes" : "no") +
          " |",
      );
    }
    lines.push("");
    lines.push(
      "_Promotion readiness is advisory only — lifecycle is never mutated by this report._",
    );
    return lines.join("\n");
  }

  return {
    buildExpansionReport: buildExpansionReport,
    reportToJson: reportToJson,
    reportToMarkdown: reportToMarkdown,
  };
});
