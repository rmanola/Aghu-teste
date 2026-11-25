/**
 * Vista do segmento PA no resumo de Controles (FEAT-304).
 * O texto persistido é sempre sequência; minmax projeta via formatPaInterval.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesPaView = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadVitalsParse() {
    if (root && root.AghuPassometroVitalsParse) return root.AghuPassometroVitalsParse;
    if (typeof require === "function") {
      try {
        return require("./passometro-vitals-parse.js");
      } catch (_e) {
        return null;
      }
    }
    return null;
  }

  /**
   * @param {string} texto
   * @param {"minmax"|"sequence"|string} [paFormat]
   * @returns {string}
   */
  function applyPaFormatView(texto, paFormat) {
    var digest = String(texto || "");
    if (!digest) return digest;
    if (paFormat === "sequence") return digest;

    var vitals = loadVitalsParse();
    if (!vitals || typeof vitals.formatPaInterval !== "function") return digest;

    var segments = digest.split(" | ");
    var changed = false;
    var out = segments.map(function (seg) {
      var m = String(seg).match(/^(PA\s+)(.+?)(\s*mmHg\s*)$/i);
      if (!m) return seg;
      var projected = vitals.formatPaInterval(m[2]);
      if (!projected || projected === m[2].trim()) return seg;
      changed = true;
      return m[1] + projected + m[3].replace(/\s+$/, "") ;
    });
    return changed ? out.join(" | ") : digest;
  }

  return {
    applyPaFormatView: applyPaFormatView,
  };
});
