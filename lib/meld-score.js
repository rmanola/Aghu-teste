/**
 * Ported from web/lib/patient-records/meld-score.mjs
 * @sync web/lib/patient-records/meld-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuMeldScore = api;
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

  var _mod_CalculatorUnits = loadMod(root, "calculator-units.js", "AghuCalculatorUnits");
  var tryNormalizeCreatinine = _mod_CalculatorUnits && _mod_CalculatorUnits.tryNormalizeCreatinine;


const MELD_MIN = 11;
const MELD_MAX = 40;

function meldCreatinineForScore(creatinineMgDl, onDialysis) {
  if (onDialysis) return 4;
  let cr = creatinineMgDl;
  if (cr < 1) cr = 1;
  if (cr > 4) cr = 4;
  return cr;
}

function meldFloorLab(value) {
  return value < 1 ? 1 : value;
}

/**
 * MELD original (UNOS) a partir de laboratório em mg/dL (Cr, bilirrubina) e INR.
 */
function computeMeld(opts) {
  const cr = meldCreatinineForScore(
    opts.creatinineMgDl,
    !!opts.onDialysis,
  );
  const bili = meldFloorLab(opts.bilirubinMgDl);
  const inr = meldFloorLab(opts.inr);

  const raw =
    (0.957 * Math.log(cr) +
      0.378 * Math.log(bili) +
      1.12 * Math.log(inr) +
      0.643) *
    10;

  return Math.round(raw);
}

/**
 * MELD-Na (2016). Se MELD ≤ 11, retorna MELD sem ajuste de sódio.
 */
function computeMeldNa(opts) {
  const meld = computeMeld(opts);
  if (meld <= MELD_MIN) {
    return { meld, meldNa: meld, sodiumUsed: null };
  }

  let na = opts.sodiumMEqL;
  if (!Number.isFinite(na)) {
    return { meld, meldNa: meld, sodiumUsed: null, missingSodium: true };
  }
  if (na < 125) na = 125;
  if (na > 137) na = 137;

  let meldNa =
    meld +
    1.32 * (137 - na) -
    0.033 * meld * (137 - na);
  meldNa = Math.round(meldNa);
  if (meldNa < MELD_MIN) meldNa = MELD_MIN;
  if (meldNa > MELD_MAX) meldNa = MELD_MAX;

  return { meld, meldNa, sodiumUsed: na };
}

function classifyMeldRisk(meldNa) {
  if (!Number.isFinite(meldNa)) {
    return { label: "—", detail: "" };
  }
  if (meldNa < 10) {
    return { label: "<10%", detail: "mortalidade em 3 meses ~1–2%" };
  }
  if (meldNa <= 19) {
    return { label: "6%", detail: "mortalidade em 3 meses ~6%" };
  }
  if (meldNa <= 29) {
    return { label: "20%", detail: "mortalidade em 3 meses ~20%" };
  }
  if (meldNa <= 39) {
    return { label: "52%", detail: "mortalidade em 3 meses ~52%" };
  }
  return { label: ">71%", detail: "mortalidade em 3 meses >71%" };
}


  return {
    computeMeld: computeMeld,
    computeMeldNa: computeMeldNa,
    classifyMeldRisk: classifyMeldRisk,
  };
});
