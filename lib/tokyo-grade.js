/**
 * Tokyo Guidelines 2018 — grau por condição (colecistite | colangite).
 * Disfunção orgânica manda (severe). Grau moderado pelos critérios TG18 da condição.
 * Critério em falta → status missing; nunca inferir ligeiro.
 * @sync web/lib/vendor/tokyo-grade.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuTokyoGrade = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var TOKYO_EDITION = "TG18";
  var CONDITIONS = { cholecystitis: true, cholangitis: true };

  var CHOLANGITIS_MODERATE = [
    "leukocytosis",
    "feverGte39",
    "ageGte75",
    "hyperbilirubinemia",
    "hypoalbuminemia",
  ];
  var CHOLECYSTITIS_MODERATE = [
    "wbcGt18000",
    "palpableTenderMass",
    "durationGt72h",
    "markedLocalInflammation",
  ];

  function fail(msg) {
    throw new Error(msg);
  }

  function namedDysfunction(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] != null && String(list[i]).trim() !== "") {
        out.push(String(list[i]).trim());
      }
    }
    return out;
  }

  function missingModerate(keys, mc) {
    var missing = [];
    var src = mc && typeof mc === "object" ? mc : {};
    for (var i = 0; i < keys.length; i++) {
      if (src[keys[i]] == null) missing.push(keys[i]);
    }
    return missing;
  }

  function countTrue(keys, mc) {
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (mc[keys[i]] === true) n += 1;
    }
    return n;
  }

  /**
   * @param {{
   *   condition?: string,
   *   organDysfunction?: string[],
   *   moderateCriteria?: Record<string, boolean>,
   * }} opts
   */
  function gradeTokyo(opts) {
    opts = opts || {};
    if (!opts.condition || !CONDITIONS[opts.condition]) {
      fail("tokyo: condition obrigatória (cholecystitis|cholangitis)");
    }

    if (opts.organDysfunction == null) {
      return {
        status: "missing",
        missing: ["organDysfunction"],
        grade: null,
        condition: opts.condition,
        edition: TOKYO_EDITION,
      };
    }
    if (!Array.isArray(opts.organDysfunction)) {
      fail("tokyo: organDysfunction deve ser um array");
    }

    var dysfunction = namedDysfunction(opts.organDysfunction);
    if (dysfunction.length > 0) {
      return {
        status: "ok",
        missing: [],
        grade: "severe",
        condition: opts.condition,
        organDysfunction: dysfunction.slice(),
        edition: TOKYO_EDITION,
      };
    }

    var keys =
      opts.condition === "cholangitis" ? CHOLANGITIS_MODERATE : CHOLECYSTITIS_MODERATE;
    var missing = missingModerate(keys, opts.moderateCriteria);
    if (missing.length) {
      return {
        status: "missing",
        missing: missing,
        grade: null,
        condition: opts.condition,
        edition: TOKYO_EDITION,
      };
    }

    var mc = opts.moderateCriteria;
    var grade;
    var moderateCount = countTrue(keys, mc);
    if (opts.condition === "cholangitis") {
      grade = moderateCount >= 2 ? "moderate" : "mild";
    } else {
      grade = moderateCount >= 1 ? "moderate" : "mild";
    }

    return {
      status: "ok",
      missing: [],
      grade: grade,
      condition: opts.condition,
      moderateCount: moderateCount,
      edition: TOKYO_EDITION,
    };
  }

  return {
    TOKYO_EDITION: TOKYO_EDITION,
    CHOLANGITIS_MODERATE: CHOLANGITIS_MODERATE,
    CHOLECYSTITIS_MODERATE: CHOLECYSTITIS_MODERATE,
    gradeTokyo: gradeTokyo,
  };
});
