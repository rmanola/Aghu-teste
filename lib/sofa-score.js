/**
 * SOFA completo (Vincent 1996) — seis sistemas 0–4, total 0–24.
 * Sistema ausente → missing nomeado; nunca pontua como 0.
 * @sync web/lib/vendor/sofa-score.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuSofaScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var SOFA_DEFINITION = "SOFA-1996";
  var SYSTEMS = [
    "respiratory",
    "coagulation",
    "liver",
    "cardiovascular",
    "cns",
    "renal",
  ];

  function isMissing(v) {
    return v == null || v === "";
  }

  function fail(field, detail) {
    throw new Error("sofa: " + field + (detail ? " " + detail : ""));
  }

  function finiteNonNeg(value, field) {
    if (!Number.isFinite(value) || value < 0) {
      fail(field, "deve ser um número finito ≥ 0");
    }
    return value;
  }

  function scoreRespiratory(block) {
    if (!block || typeof block !== "object") {
      return { missing: "respiratory" };
    }
    if (isMissing(block.pao2FiO2)) return { missing: "respiratory" };
    var pf = finiteNonNeg(block.pao2FiO2, "pao2FiO2");
    var vent = block.mechanicalVentilation;
    if (pf >= 400) return { points: 0 };
    if (pf >= 300) return { points: 1 };
    if (pf >= 200) return { points: 2 };
    if (typeof vent !== "boolean") {
      return { missing: "respiratory" };
    }
    if (!vent) return { points: 2 };
    if (pf < 100) return { points: 4 };
    return { points: 3 };
  }

  function scoreCoagulation(block) {
    if (!block || typeof block !== "object" || isMissing(block.plateletsX10e3UL)) {
      return { missing: "coagulation" };
    }
    var plt = finiteNonNeg(block.plateletsX10e3UL, "plateletsX10e3UL");
    if (plt >= 150) return { points: 0 };
    if (plt >= 100) return { points: 1 };
    if (plt >= 50) return { points: 2 };
    if (plt >= 20) return { points: 3 };
    return { points: 4 };
  }

  function scoreLiver(block) {
    if (!block || typeof block !== "object" || isMissing(block.bilirubinMgDl)) {
      return { missing: "liver" };
    }
    var b = finiteNonNeg(block.bilirubinMgDl, "bilirubinMgDl");
    if (b < 1.2) return { points: 0 };
    if (b <= 1.9) return { points: 1 };
    if (b <= 5.9) return { points: 2 };
    if (b <= 11.9) return { points: 3 };
    return { points: 4 };
  }

  function pressorPoints(doses) {
    var dopa = doses.dopamine;
    var dobu = doses.dobutamine;
    var epi = doses.epinephrine;
    var norepi = doses.norepinephrine;
    if (dopa != null) finiteNonNeg(dopa, "cardiovascular.vasopressors.dopamine");
    if (dobu != null) finiteNonNeg(dobu, "cardiovascular.vasopressors.dobutamine");
    if (epi != null) finiteNonNeg(epi, "cardiovascular.vasopressors.epinephrine");
    if (norepi != null) {
      finiteNonNeg(norepi, "cardiovascular.vasopressors.norepinephrine");
    }
    var pts = 0;
    if (dopa != null && dopa > 15) pts = Math.max(pts, 4);
    else if (dopa != null && dopa > 5) pts = Math.max(pts, 3);
    else if (dopa != null && dopa > 0) pts = Math.max(pts, 2);
    if (dobu != null && dobu > 0) pts = Math.max(pts, 2);
    if (epi != null && epi > 0.1) pts = Math.max(pts, 4);
    else if (epi != null && epi > 0) pts = Math.max(pts, 3);
    if (norepi != null && norepi > 0.1) pts = Math.max(pts, 4);
    else if (norepi != null && norepi > 0) pts = Math.max(pts, 3);
    return pts;
  }

  function scoreCardiovascular(block) {
    if (!block || typeof block !== "object") {
      return { missing: "cardiovascular" };
    }
    if (!Object.prototype.hasOwnProperty.call(block, "vasopressors")) {
      return { missing: "cardiovascular.vasopressors" };
    }
    var vp = block.vasopressors;
    var fromPressors = 0;
    if (vp != null && vp !== false) {
      if (typeof vp !== "object") {
        fail("cardiovascular.vasopressors", "deve ser objecto de doses, null ou false");
      }
      fromPressors = pressorPoints(vp);
    }
    if (fromPressors >= 2) return { points: fromPressors };
    if (isMissing(block.map)) return { missing: "cardiovascular" };
    var map = finiteNonNeg(block.map, "map");
    if (map < 70) return { points: Math.max(fromPressors, 1) };
    return { points: fromPressors };
  }

  function scoreCns(block) {
    if (!block || typeof block !== "object" || isMissing(block.gcs)) {
      return { missing: "cns" };
    }
    var gcs = block.gcs;
    if (!Number.isFinite(gcs) || gcs < 3 || gcs > 15) {
      fail("gcs", "deve ser um número entre 3 e 15");
    }
    if (gcs === 15) return { points: 0 };
    if (gcs >= 13) return { points: 1 };
    if (gcs >= 10) return { points: 2 };
    if (gcs >= 6) return { points: 3 };
    return { points: 4 };
  }

  function creatininePoints(cr) {
    if (cr < 1.2) return 0;
    if (cr <= 1.9) return 1;
    if (cr <= 3.4) return 2;
    if (cr <= 4.9) return 3;
    return 4;
  }

  function urinePoints(uo) {
    if (uo < 200) return 4;
    if (uo < 500) return 3;
    return 0;
  }

  function scoreRenal(block) {
    if (!block || typeof block !== "object") return { missing: "renal" };
    var hasCr = !isMissing(block.creatinineMgDl);
    var hasUo = !isMissing(block.urineOutputMlDay);
    if (!hasCr && !hasUo) return { missing: "renal" };
    var pts = 0;
    if (hasCr) {
      pts = Math.max(pts, creatininePoints(finiteNonNeg(block.creatinineMgDl, "creatinineMgDl")));
    }
    if (hasUo) {
      pts = Math.max(pts, urinePoints(finiteNonNeg(block.urineOutputMlDay, "urineOutputMlDay")));
    }
    return { points: pts };
  }

  var SCORERS = {
    respiratory: scoreRespiratory,
    coagulation: scoreCoagulation,
    liver: scoreLiver,
    cardiovascular: scoreCardiovascular,
    cns: scoreCns,
    renal: scoreRenal,
  };

  /**
   * @param {object} opts
   */
  function computeSofa(opts) {
    opts = opts || {};
    var missing = [];
    var systems = {};
    var i;
    for (i = 0; i < SYSTEMS.length; i++) {
      var key = SYSTEMS[i];
      var scored = SCORERS[key](opts[key]);
      if (scored.missing) {
        missing.push(scored.missing);
      } else {
        systems[key] = scored.points;
      }
    }
    if (missing.length) {
      return {
        status: "missing",
        missing: missing,
        total: null,
        systems: null,
        definition: SOFA_DEFINITION,
      };
    }
    var total =
      systems.respiratory +
      systems.coagulation +
      systems.liver +
      systems.cardiovascular +
      systems.cns +
      systems.renal;
    return {
      status: "ok",
      missing: [],
      total: total,
      systems: systems,
      definition: SOFA_DEFINITION,
    };
  }

  return {
    SOFA_DEFINITION: SOFA_DEFINITION,
    computeSofa: computeSofa,
  };
});
