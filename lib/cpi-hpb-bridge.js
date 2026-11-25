/**
 * FEAT-123 — Ponte HPB unidireccional, só de leitura. Promove `CAD-VAL-01`
 * (margemR0) e `CAD-VAL-02` (textbookOutcome) a `feasible` quando o workspace
 * tem coorte HPB. Nunca escreve em `hpb_registry` nem altera os seus adapters
 * (CPIDQ-AC-10 — verificado por teste estrutural, não só por convenção).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiHpbBridge = api;
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
        /* fall through — ausência de hpb-indicators.js não deve lançar */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var hpbIndicatorsApi = load("hpb-indicators.js", "AghuHpbIndicators");

  /**
   * @param {object} indicator — entrada de cpi-indicator-library com `hpbIndicatorKey`
   * @param {object|null|undefined} hpbCohort — registry HPB do workspace (ou null)
   * @returns {{ source: "hpb", denominatorCohort: "hpb", value: number, n: number, status?: "feasible" }|{ status: "blocked" }|null}
   */
  function resolveHpbIndicator(indicator, hpbCohort) {
    var key = indicator && indicator.hpbIndicatorKey;
    if (!key) return null;

    if (!hpbCohort || !hpbIndicatorsApi || typeof hpbIndicatorsApi.computeIndicators !== "function") {
      return { status: "blocked" };
    }

    var computed;
    try {
      computed = hpbIndicatorsApi.computeIndicators(hpbCohort);
    } catch (_e) {
      return { status: "blocked" };
    }

    if (!computed || !Object.prototype.hasOwnProperty.call(computed, key)) {
      return { status: "blocked" };
    }

    var n = Number(computed.cirurgiasHpb) || 0;
    if (n === 0) return { status: "blocked" };

    return {
      status: "feasible",
      source: "hpb",
      denominatorCohort: "hpb",
      value: Number(computed[key]) || 0,
      n: n,
    };
  }

  return {
    resolveHpbIndicator: resolveHpbIndicator,
  };
});
