/**
 * FEAT-151 — Combina primitivos CPI entre workspaces de uma organização.
 * O/E pooled via computeObservedExpected; nunca soma/média de razões.
 * Supressão por parcela, do total, e complementar (CPIORG-AC-07/08/09/10).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiOrgRollup = api;
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

  var DEFAULT_MIN_DENOMINATOR =
    riskAdjustApi && riskAdjustApi.DEFAULT_MIN_DENOMINATOR != null
      ? riskAdjustApi.DEFAULT_MIN_DENOMINATOR
      : 11;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function ci95Tuple(ci) {
    if (!ci) return null;
    if (Array.isArray(ci) && ci.length >= 2) return [ci[0], ci[1]];
    if (ci.lower != null || ci.upper != null) return [ci.lower, ci.upper];
    return null;
  }

  function suppressedParcel(workspaceId, workspaceLabel, reason) {
    return {
      workspaceId: workspaceId,
      workspaceLabel: workspaceLabel,
      suppressed: true,
      n: undefined,
      observed: undefined,
      ratio: null,
      ci95: null,
      reason: reason,
    };
  }

  /**
   * @param {{ id?: string, direction?: string }} indicator
   * @param {Array<{
   *   workspaceId: string,
   *   workspaceLabel?: string,
   *   observed: number,
   *   denominator: number,
   *   expectedRate: number
   * }>} workspacePrimitives
   * @param {{ minDenominator?: number }} [options]
   */
  function combineWorkspacePrimitives(indicator, workspacePrimitives, options) {
    var opts = options && typeof options === "object" ? options : {};
    var minDenominator =
      opts.minDenominator == null
        ? DEFAULT_MIN_DENOMINATOR
        : num(opts.minDenominator);
    var direction = (indicator && indicator.direction) || "lower_is_better";
    var list = asArray(workspacePrimitives);

    var workspaces = [];
    var strata = [];

    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      var workspaceId = String(p.workspaceId || "");
      var workspaceLabel = p.workspaceLabel != null ? String(p.workspaceLabel) : "";
      var observed = num(p.observed);
      var denominator = num(p.denominator);
      var expectedRate = num(p.expectedRate);

      strata.push({
        key: workspaceId,
        observed: observed,
        denominator: denominator,
        expectedRate: expectedRate,
      });

      if (denominator < minDenominator) {
        workspaces.push(
          suppressedParcel(workspaceId, workspaceLabel, "small_n"),
        );
        continue;
      }

      var parcelOe =
        riskAdjustApi && typeof riskAdjustApi.computeObservedExpected === "function"
          ? riskAdjustApi.computeObservedExpected({
              strata: [
                {
                  key: workspaceId,
                  observed: observed,
                  denominator: denominator,
                  expectedRate: expectedRate,
                },
              ],
              minDenominator: minDenominator,
              direction: direction,
            })
          : null;

      if (!parcelOe || parcelOe.suppressed) {
        workspaces.push(
          suppressedParcel(
            workspaceId,
            workspaceLabel,
            (parcelOe && parcelOe.reason) || "small_n",
          ),
        );
        continue;
      }

      workspaces.push({
        workspaceId: workspaceId,
        workspaceLabel: workspaceLabel,
        suppressed: false,
        n: denominator,
        observed: observed,
        expected: parcelOe.expected,
        ratio: parcelOe.ratio,
        ci95: ci95Tuple(parcelOe.ci95),
        reason: null,
      });
    }

    var orgOe =
      riskAdjustApi && typeof riskAdjustApi.computeObservedExpected === "function"
        ? riskAdjustApi.computeObservedExpected({
            strata: strata,
            minDenominator: minDenominator,
            direction: direction,
          })
        : { suppressed: true, reason: "zero_denominator", ratio: null };

    var org;
    if (orgOe.suppressed) {
      org = {
        suppressed: true,
        reason: orgOe.reason || "small_n",
        observed: undefined,
        denominator: undefined,
        expected: undefined,
        ratio: null,
        ci95: null,
      };
    } else {
      org = {
        suppressed: false,
        reason: null,
        observed: orgOe.observed,
        denominator: orgOe.denominator,
        expected: orgOe.expected,
        ratio: orgOe.ratio,
        ci95: ci95Tuple(orgOe.ci95),
      };
    }

    var complementarySuppressed = null;
    var hiddenSimple = workspaces.filter(function (w) {
      return w.suppressed;
    });
    if (hiddenSimple.length === 1 && !org.suppressed) {
      var visible = [];
      for (var v = 0; v < workspaces.length; v++) {
        if (!workspaces[v].suppressed) visible.push(workspaces[v]);
      }
      if (visible.length >= 1) {
        var smallest = visible[0];
        for (var s = 1; s < visible.length; s++) {
          if (visible[s].n < smallest.n) smallest = visible[s];
        }
        complementarySuppressed = smallest.workspaceId;
        for (var w = 0; w < workspaces.length; w++) {
          if (workspaces[w].workspaceId === complementarySuppressed) {
            workspaces[w] = suppressedParcel(
              workspaces[w].workspaceId,
              workspaces[w].workspaceLabel,
              "complementary",
            );
            break;
          }
        }
      }
    }

    return {
      workspaces: workspaces,
      org: org,
      complementarySuppressed: complementarySuppressed,
    };
  }

  return {
    DEFAULT_MIN_DENOMINATOR: DEFAULT_MIN_DENOMINATOR,
    combineWorkspacePrimitives: combineWorkspacePrimitives,
  };
});
