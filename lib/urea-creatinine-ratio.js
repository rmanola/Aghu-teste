/**
 * Ported from web/lib/patient-records/urea-creatinine-ratio.mjs
 * @sync web/lib/patient-records/urea-creatinine-ratio.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuUreaCreatinineRatio = api;
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

  var _mod_Curb65Score = loadMod(root, "curb65-score.js", "AghuCurb65Score");
  var normalizeUreaForCurb = _mod_Curb65Score && _mod_Curb65Score.normalizeUreaForCurb;
  var _mod_CkdEpiEgfr = loadMod(root, "ckd-epi-egfr.js", "AghuCkdEpiEgfr");
  var normalizeCreatinineMgDl = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.normalizeCreatinineMgDl;



function round1(n) {
  return Math.round(n * 10) / 10;
}

function classifyUreaCreatinineRatio(ratio) {
  if (!Number.isFinite(ratio)) return { band: "unknown", label: "Indeterminado" };
  if (ratio > 20) {
    return {
      band: "prerenal",
      label: ">20 — sugestivo de etiologia pré-renal",
    };
  }
  if (ratio >= 10) {
    return { band: "normal", label: "10–20 — faixa usual" };
  }
  return {
    band: "low",
    label: "<10 — relação baixa (considerar outras causas)",
  };
}

function computeUreaCreatinineRatio(opts) {
  const ureaMgDl = opts.ureaMgDl;
  const creatinineMgDl = opts.creatinineMgDl;

  if (!Number.isFinite(ureaMgDl) || ureaMgDl < 0) {
    throw new Error("invalid_urea");
  }
  if (!Number.isFinite(creatinineMgDl) || creatinineMgDl <= 0) {
    throw new Error("invalid_creatinine");
  }

  const ratio = ureaMgDl / creatinineMgDl;
  const interpretation = classifyUreaCreatinineRatio(ratio);

  return {
    ureaMgDl,
    creatinineMgDl,
    ratio: round1(ratio),
    interpretation,
  };
}

function normalizeUreaMgDl(value, unit) {
  return normalizeUreaForCurb(value, unit).mgDl;
}

function normalizeCreatinineForRatio(value, unit) {
  return normalizeCreatinineMgDl(value, unit);
}


  return {
    classifyUreaCreatinineRatio: classifyUreaCreatinineRatio,
    computeUreaCreatinineRatio: computeUreaCreatinineRatio,
    normalizeUreaMgDl: normalizeUreaMgDl,
    normalizeCreatinineForRatio: normalizeCreatinineForRatio,
  };
});
