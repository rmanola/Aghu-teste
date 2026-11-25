/**
 * Ported from web/lib/patient-records/child-pugh-score.mjs
 * @sync web/lib/patient-records/child-pugh-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuChildPughScore = api;
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


function scoreBilirubin(mgDl) {
  if (mgDl < 2) return 1;
  if (mgDl <= 3) return 2;
  return 3;
}

function scoreAlbumin(gDl) {
  if (gDl > 3.5) return 1;
  if (gDl >= 2.8) return 2;
  return 3;
}

function scoreInr(inr) {
  if (inr < 1.7) return 1;
  if (inr <= 2.3) return 2;
  return 3;
}

/** @typedef {"none"|"mild"|"severe"} AscitesGrade */
/** @typedef {"none"|"grade1-2"|"grade3-4"} EncephalopathyGrade */

function scoreAscites(grade) {
  if (grade === "none") return 1;
  if (grade === "mild") return 2;
  if (grade === "severe") return 3;
  throw new Error("invalid_ascites");
}

function scoreEncephalopathy(grade) {
  if (grade === "none") return 1;
  if (grade === "grade1-2") return 2;
  if (grade === "grade3-4") return 3;
  throw new Error("invalid_encephalopathy");
}

function classifyChildPughClass(total) {
  if (total <= 6) return "A";
  if (total <= 9) return "B";
  return "C";
}

function classifyChildPughMortality(classId) {
  if (classId === "A") {
    return { label: "Classe A", detail: "mortalidade operatória ~10%" };
  }
  if (classId === "B") {
    return { label: "Classe B", detail: "mortalidade operatória ~30%" };
  }
  return { label: "Classe C", detail: "mortalidade operatória ~80%" };
}

function computeChildPugh(opts) {
  const bili = opts.bilirubinMgDl;
  const alb = opts.albuminGDl;
  const inr = opts.inr;
  const ascites = opts.ascites;
  const encephalopathy = opts.encephalopathy;

  if (
    !Number.isFinite(bili) ||
    bili <= 0 ||
    !Number.isFinite(alb) ||
    alb <= 0 ||
    !Number.isFinite(inr) ||
    inr <= 0 ||
    !ascites ||
    !encephalopathy
  ) {
    throw new Error("invalid_child_pugh_inputs");
  }

  const points = {
    bilirubin: scoreBilirubin(bili),
    albumin: scoreAlbumin(alb),
    inr: scoreInr(inr),
    ascites: scoreAscites(ascites),
    encephalopathy: scoreEncephalopathy(encephalopathy),
  };

  const total =
    points.bilirubin +
    points.albumin +
    points.inr +
    points.ascites +
    points.encephalopathy;

  const classId = classifyChildPughClass(total);

  return {
    total,
    class: classId,
    points,
    mortality: classifyChildPughMortality(classId),
  };
}


  return {
    scoreAscites: scoreAscites,
    scoreEncephalopathy: scoreEncephalopathy,
    classifyChildPughClass: classifyChildPughClass,
    classifyChildPughMortality: classifyChildPughMortality,
    computeChildPugh: computeChildPugh,
  };
});
