/**
 * ECOG Performance Status — atribuição clínica, domínio 0–4.
 * @sync web/lib/vendor/ecog-status.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuEcogStatus = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var ECOG_EDITION = "ECOG-1982";

  var LABELS = {
    0: "Plenamente activo, sem restrição",
    1: "Restrito em actividade extenuante; ambulatório, trabalho leve",
    2: "Ambulatório, incapaz de trabalhar",
    3: "Capaz apenas de autocuidado limitado; acamado/cadeira >50% do tempo",
    4: "Completamente incapaz; acamado",
  };

  /**
   * @param {{ score?: unknown }} opts
   */
  function assignEcog(opts) {
    opts = opts || {};
    var score = opts.score;
    if (typeof score === "string" && score.trim() !== "" && /^(0|1|2|3|4)$/.test(score.trim())) {
      score = Number(score.trim());
    }
    if (!Number.isInteger(score) || score < 0 || score > 4) {
      throw new Error(
        "ecog: score deve ser inteiro de 0 a 4 (domínio funcional); recusado: " +
          String(opts.score),
      );
    }
    return {
      score: score,
      label: LABELS[score],
      ambulatory: score <= 2,
      edition: ECOG_EDITION,
    };
  }

  return {
    ECOG_EDITION: ECOG_EDITION,
    ECOG_LABELS: LABELS,
    assignEcog: assignEcog,
  };
});
