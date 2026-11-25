/**
 * NIHSS (Brott 1989) — 15 subitens, total 0–42.
 * Subitem ausente → missing nomeado; nunca soma como 0.
 * @sync web/lib/vendor/nihss-score.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuNihssScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var NIHSS_EDITION = "NIHSS-1989";

  var ITEM_MAX = {
    loc: 3,
    locQuestions: 2,
    locCommands: 2,
    gaze: 2,
    visualFields: 3,
    facialPalsy: 3,
    motorArmLeft: 4,
    motorArmRight: 4,
    motorLegLeft: 4,
    motorLegRight: 4,
    limbAtaxia: 2,
    sensory: 2,
    language: 3,
    dysarthria: 2,
    extinction: 2,
  };

  var ITEM_KEYS = Object.keys(ITEM_MAX);

  function isMissing(v) {
    return v == null || v === "";
  }

  function fail(field, detail) {
    throw new Error("nihss: " + field + (detail ? " " + detail : ""));
  }

  function severityFromTotal(total) {
    if (total === 0) return "no_stroke_symptoms";
    if (total <= 4) return "minor";
    if (total <= 15) return "moderate";
    if (total <= 20) return "moderate_severe";
    return "severe";
  }

  /**
   * @param {{ items?: object }} opts
   */
  function computeNihss(opts) {
    opts = opts || {};
    var src = opts.items && typeof opts.items === "object" ? opts.items : {};
    var missing = [];
    var items = {};
    var total = 0;
    var i;
    for (i = 0; i < ITEM_KEYS.length; i++) {
      var key = ITEM_KEYS[i];
      if (isMissing(src[key])) {
        missing.push(key);
        continue;
      }
      var raw = src[key];
      var n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      var max = ITEM_MAX[key];
      if (!Number.isInteger(n) || n < 0 || n > max) {
        fail(key, "deve ser inteiro 0–" + max);
      }
      items[key] = n;
      total += n;
    }
    if (missing.length) {
      return {
        status: "missing",
        missing: missing,
        total: null,
        items: null,
        severity: null,
        edition: NIHSS_EDITION,
      };
    }
    return {
      status: "ok",
      missing: [],
      total: total,
      items: items,
      severity: severityFromTotal(total),
      edition: NIHSS_EDITION,
    };
  }

  return {
    NIHSS_EDITION: NIHSS_EDITION,
    NIHSS_ITEM_MAX: ITEM_MAX,
    computeNihss: computeNihss,
    severityFromTotal: severityFromTotal,
  };
});
