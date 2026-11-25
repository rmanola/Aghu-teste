/**
 * Ported from web/lib/patient-records/acid-base-visibility.mjs
 * @sync web/lib/patient-records/acid-base-visibility.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAcidBaseVisibility = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod_AcidBase = loadMod(root, "acid-base.js", "AghuAcidBase");
  var getGasometryRef = _mod_AcidBase && _mod_AcidBase.getGasometryRef;


/** @param {object | null | undefined} panel */
function resolveAgValue(panel) {
  if (!panel) return null;
  return (
    panel.correctedAnionGap?.((correctedAnionGapMEqL) != null && (correctedAnionGapMEqL) !== undefined ? (correctedAnionGapMEqL) : (panel.anionGap))?.((anionGapMEqL) != null && (anionGapMEqL) !== undefined ? (anionGapMEqL) : (null))
  );
}

/** @param {object | null | undefined} classification */
function isMetabolicAcidosis(classification) {
  return classification?.primaryDisorder === "metabolic_acidosis";
}

/** @param {number | null} agValue @param {"arterial"|"venous"|null|undefined} channel */
function isAnionGapElevated(agValue, channel) {
  const ref = getGasometryRef(channel);
  return agValue != null && agValue > ref.anionGapMEqL.max;
}

/** AG no resumo/tile — só acidose metabólica com AG calculável */
function shouldShowAnionGapInSummary(panel, classification, channel) {
  return isMetabolicAcidosis(classification) && resolveAgValue(panel) != null;
}

/** Δ/Δ — acidose metabólica + AG elevado + objeto deltaDelta */
function shouldShowDeltaDelta(panel, classification, channel) {
  if (!panel?.deltaDelta || !isMetabolicAcidosis(classification)) return false;
  const ag = resolveAgValue(panel);
  return ag != null && isAnionGapElevated(ag, channel);
}


  return {
    resolveAgValue: resolveAgValue,
    isMetabolicAcidosis: isMetabolicAcidosis,
    isAnionGapElevated: isAnionGapElevated,
    shouldShowAnionGapInSummary: shouldShowAnionGapInSummary,
    shouldShowDeltaDelta: shouldShowDeltaDelta,
  };
});
