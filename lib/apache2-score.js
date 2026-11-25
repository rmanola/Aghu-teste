/**
 * APACHE II (Knaus 1985) — APS de 12 variáveis + idade + estado crónico.
 * Variável ausente → missing nomeado; nunca assume normal.
 * @sync web/lib/vendor/apache2-score.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuApache2Score = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var APACHE_EDITION = "APACHE-II";
  var PATM_MMHG = 760;
  var PH2O_MMHG = 47;
  var RQ = 0.8;

  var APS_KEYS = [
    "temperatureC",
    "map",
    "heartRate",
    "respiratoryRate",
    "oxygenation",
    "arterialPh",
    "sodiumMEqL",
    "potassiumMEqL",
    "creatinineMgDl",
    "hematocritPct",
    "wbcX10e3UL",
    "gcs",
  ];

  function isMissing(v) {
    return v == null || v === "";
  }

  function fail(field, detail) {
    throw new Error("apache2: " + field + (detail ? " " + detail : ""));
  }

  function finite(value, field) {
    if (!Number.isFinite(value)) fail(field, "deve ser um número finito");
    return value;
  }

  function scoreTemp(t) {
    if (t >= 41) return 4;
    if (t >= 39) return 3;
    if (t >= 38.5) return 1;
    if (t >= 36) return 0;
    if (t >= 34) return 1;
    if (t >= 32) return 2;
    if (t >= 30) return 3;
    return 4;
  }

  function scoreMap(m) {
    if (m >= 160) return 4;
    if (m >= 130) return 3;
    if (m >= 110) return 2;
    if (m >= 70) return 0;
    if (m >= 50) return 2;
    return 4;
  }

  function scoreHr(h) {
    if (h >= 180) return 4;
    if (h >= 140) return 3;
    if (h >= 110) return 2;
    if (h >= 70) return 0;
    if (h >= 55) return 2;
    if (h >= 40) return 3;
    return 4;
  }

  function scoreRr(r) {
    if (r >= 50) return 4;
    if (r >= 35) return 3;
    if (r >= 25) return 1;
    if (r >= 12) return 0;
    if (r >= 10) return 1;
    if (r >= 6) return 2;
    return 4;
  }

  function scoreAaDO2(aa) {
    if (aa >= 500) return 4;
    if (aa >= 350) return 3;
    if (aa >= 200) return 2;
    return 0;
  }

  function scorePaO2(p) {
    if (p > 70) return 0;
    if (p >= 61) return 1;
    if (p >= 55) return 3;
    return 4;
  }

  function scorePh(p) {
    if (p >= 7.7) return 4;
    if (p >= 7.6) return 3;
    if (p >= 7.5) return 1;
    if (p >= 7.33) return 0;
    if (p >= 7.25) return 2;
    if (p >= 7.15) return 3;
    return 4;
  }

  function scoreNa(n) {
    if (n >= 180) return 4;
    if (n >= 160) return 3;
    if (n >= 155) return 2;
    if (n >= 150) return 1;
    if (n >= 130) return 0;
    if (n >= 120) return 2;
    if (n >= 111) return 3;
    return 4;
  }

  function scoreK(k) {
    if (k >= 7) return 4;
    if (k >= 6) return 3;
    if (k >= 5.5) return 1;
    if (k >= 3.5) return 0;
    if (k >= 3) return 1;
    if (k >= 2.5) return 2;
    return 4;
  }

  function scoreCr(c) {
    if (c >= 3.5) return 4;
    if (c >= 2) return 3;
    if (c >= 1.5) return 2;
    if (c >= 0.6) return 0;
    return 2;
  }

  function scoreHct(h) {
    if (h >= 60) return 4;
    if (h >= 50) return 2;
    if (h >= 46) return 1;
    if (h >= 30) return 0;
    if (h >= 20) return 2;
    return 4;
  }

  function scoreWbc(w) {
    if (w >= 40) return 4;
    if (w >= 20) return 2;
    if (w >= 15) return 1;
    if (w >= 3) return 0;
    if (w >= 1) return 2;
    return 4;
  }

  function agePoints(age) {
    if (age <= 44) return 0;
    if (age <= 54) return 2;
    if (age <= 64) return 3;
    if (age <= 74) return 5;
    return 6;
  }

  function computeAaDO2(fio2, paO2, paCO2) {
    var pao2Alv = fio2 * (PATM_MMHG - PH2O_MMHG) - paCO2 / RQ;
    return pao2Alv - paO2;
  }

  function scoreOxygenation(ox) {
    if (!ox || typeof ox !== "object") return { missing: "oxygenation" };
    if (isMissing(ox.fio2)) return { missing: "oxygenation.fio2" };
    var fio2 = finite(ox.fio2, "fio2");
    if (fio2 <= 0 || fio2 > 1) fail("fio2", "deve estar entre 0 (exclusive) e 1");
    if (fio2 >= 0.5) {
      if (!isMissing(ox.aaDO2MmHg)) {
        return { points: scoreAaDO2(finite(ox.aaDO2MmHg, "aaDO2MmHg")) };
      }
      if (isMissing(ox.paO2MmHg)) return { missing: "oxygenation.paO2MmHg" };
      if (isMissing(ox.paCO2MmHg)) return { missing: "oxygenation.paCO2MmHg" };
      var aa = computeAaDO2(
        fio2,
        finite(ox.paO2MmHg, "paO2MmHg"),
        finite(ox.paCO2MmHg, "paCO2MmHg"),
      );
      return { points: scoreAaDO2(aa) };
    }
    if (isMissing(ox.paO2MmHg)) return { missing: "oxygenation.paO2MmHg" };
    return { points: scorePaO2(finite(ox.paO2MmHg, "paO2MmHg")) };
  }

  function chronicPoints(ch) {
    if (!ch || typeof ch !== "object") return { missing: "chronicHealth" };
    if (isMissing(ch.severeOrganInsufficiencyOrImmunocompromised)) {
      return { missing: "chronicHealth.severeOrganInsufficiencyOrImmunocompromised" };
    }
    if (ch.severeOrganInsufficiencyOrImmunocompromised !== true) {
      return { points: 0 };
    }
    var t = ch.admissionType;
    if (isMissing(t)) return { missing: "chronicHealth.admissionType" };
    if (t === "elective_postoperative") return { points: 2 };
    if (t === "nonoperative" || t === "emergency_postoperative") return { points: 5 };
    fail("chronicHealth.admissionType", "valor inválido: " + t);
  }

  /**
   * @param {object} opts
   */
  function computeApache2(opts) {
    opts = opts || {};
    var missing = [];
    var i;
    for (i = 0; i < APS_KEYS.length; i++) {
      if (isMissing(opts[APS_KEYS[i]])) missing.push(APS_KEYS[i]);
    }
    if (isMissing(opts.ageYears)) missing.push("ageYears");
    if (isMissing(opts.acuteRenalFailure) && opts.acuteRenalFailure !== false) {
      missing.push("acuteRenalFailure");
    }
    if (isMissing(opts.chronicHealth)) missing.push("chronicHealth");
    if (missing.length) {
      return {
        status: "missing",
        missing: missing,
        total: null,
        apsTotal: null,
        agePoints: null,
        chronicHealthPoints: null,
        components: null,
        edition: APACHE_EDITION,
      };
    }

    var gcs = finite(opts.gcs, "gcs");
    if (gcs < 3 || gcs > 15) fail("gcs", "deve estar entre 3 e 15");

    var ox = scoreOxygenation(opts.oxygenation);
    if (ox.missing) {
      return {
        status: "missing",
        missing: [ox.missing],
        total: null,
        apsTotal: null,
        agePoints: null,
        chronicHealthPoints: null,
        components: null,
        edition: APACHE_EDITION,
      };
    }

    var ch = chronicPoints(opts.chronicHealth);
    if (ch.missing) {
      return {
        status: "missing",
        missing: [ch.missing],
        total: null,
        apsTotal: null,
        agePoints: null,
        chronicHealthPoints: null,
        components: null,
        edition: APACHE_EDITION,
      };
    }

    if (typeof opts.acuteRenalFailure !== "boolean") {
      fail("acuteRenalFailure", "deve ser boolean");
    }

    var crBase = scoreCr(finite(opts.creatinineMgDl, "creatinineMgDl"));
    var crPts = opts.acuteRenalFailure ? crBase * 2 : crBase;
    var age = finite(opts.ageYears, "ageYears");
    if (age < 0 || age > 130) fail("ageYears", "fora do domínio");

    var components = {
      temperature: scoreTemp(finite(opts.temperatureC, "temperatureC")),
      map: scoreMap(finite(opts.map, "map")),
      heartRate: scoreHr(finite(opts.heartRate, "heartRate")),
      respiratoryRate: scoreRr(finite(opts.respiratoryRate, "respiratoryRate")),
      oxygenation: ox.points,
      arterialPh: scorePh(finite(opts.arterialPh, "arterialPh")),
      sodium: scoreNa(finite(opts.sodiumMEqL, "sodiumMEqL")),
      potassium: scoreK(finite(opts.potassiumMEqL, "potassiumMEqL")),
      creatinine: crPts,
      hematocrit: scoreHct(finite(opts.hematocritPct, "hematocritPct")),
      wbc: scoreWbc(finite(opts.wbcX10e3UL, "wbcX10e3UL")),
      gcs: 15 - gcs,
    };

    var apsTotal =
      components.temperature +
      components.map +
      components.heartRate +
      components.respiratoryRate +
      components.oxygenation +
      components.arterialPh +
      components.sodium +
      components.potassium +
      components.creatinine +
      components.hematocrit +
      components.wbc +
      components.gcs;

    var agePts = agePoints(age);
    var chPts = ch.points;
    return {
      status: "ok",
      missing: [],
      total: apsTotal + agePts + chPts,
      apsTotal: apsTotal,
      agePoints: agePts,
      chronicHealthPoints: chPts,
      components: components,
      edition: APACHE_EDITION,
    };
  }

  return {
    APACHE_EDITION: APACHE_EDITION,
    computeApache2: computeApache2,
    computeAaDO2: computeAaDO2,
  };
});
