/**
 * Campos calculados HPB — port das fórmulas Excel MVP v2.5.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbComputed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MONTHS_DIVISOR = 30.4375;

  function parseDate(v) {
    if (!v) return null;
    var d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b) {
    var da = parseDate(a);
    var db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function monthsBetween(a, b) {
    var days = daysBetween(a, b);
    if (days == null) return null;
    return Math.round((days / MONTHS_DIVISOR) * 10) / 10;
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isYes(v) {
    var s = String(v ?? "")
      .trim()
      .toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function isFemale(sex) {
    var s = String(sex ?? "")
      .trim()
      .toLowerCase();
    return s === "feminino" || s === "f" || s === "female";
  }

  function computeLengthOfStayDays(dischargeDate, surgeryDate) {
    return daysBetween(surgeryDate, dischargeDate);
  }

  function computeLnRatio(lnPositive, lnExamined) {
    var pos = Number(lnPositive);
    var ex = Number(lnExamined);
    if (!Number.isFinite(pos) || !Number.isFinite(ex) || ex <= 0) return null;
    return Math.round((pos / ex) * 1000) / 1000;
  }

  function parseTimeToMinutes(t) {
    if (!t) return null;
    var s = String(t).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    var d = parseDate(t);
    if (!d) return null;
    return d.getHours() * 60 + d.getMinutes();
  }

  function computeConsoleTimeMin(start, end) {
    var a = parseTimeToMinutes(start);
    var b = parseTimeToMinutes(end);
    if (a == null || b == null || b < a) return null;
    return b - a;
  }

  var CLAVIEN_GTE3 = { IIIa: 1, IIIb: 1, IVa: 1, IVb: 1, V: 1 };

  function computeClavienGte3(clavienMax) {
    if (!clavienMax) return false;
    return !!CLAVIEN_GTE3[String(clavienMax).trim()];
  }

  function computeSurvivalMonths(surgeryDate, deathDate, lastContact) {
    var end = deathDate || lastContact;
    return monthsBetween(surgeryDate, end);
  }

  function computeSldMonths(surgeryDate, recurrenceDate) {
    return monthsBetween(surgeryDate, recurrenceDate);
  }

  function computeAdjuvancyTimeMonths(surgeryDate, adjuvancyStartDate) {
    return monthsBetween(surgeryDate, adjuvancyStartDate);
  }

  function computeDaysToPathologyReport(surgeryDate, reportDate) {
    return daysBetween(surgeryDate, reportDate);
  }

  /** MELD clássico (UNOS) — bilirrubina, INR, creatinina; diálise → Cr=4. */
  function computeMeldClassic(bilirubin, inr, creatinine, dialysis) {
    var bil = num(bilirubin);
    var i = num(inr);
    var cr = num(creatinine);
    if (bil == null || i == null || cr == null) return null;
    bil = Math.max(1, bil);
    i = Math.max(1, i);
    cr = isYes(dialysis) ? 4 : Math.min(4, Math.max(1, cr));
    var score =
      3.78 * Math.log(bil) + 11.2 * Math.log(i) + 9.57 * Math.log(cr) + 6.43;
    return Math.max(6, Math.min(40, Math.round(score)));
  }

  /** MELD-Na — Na limitada a 125–137; se MELD≤11 retorna MELD. */
  function computeMeldNa(meldClassic, sodium) {
    var meld = num(meldClassic);
    var na = num(sodium);
    if (meld == null || na == null) return null;
    if (meld <= 11) return meld;
    var naClamped = Math.min(137, Math.max(125, na));
    var score =
      meld + 1.32 * (137 - naClamped) - 0.033 * meld * (137 - naClamped);
    return Math.max(6, Math.min(40, Math.round(score)));
  }

  /**
   * MELD 3.0 — bilirrubina, INR, creatinina (cap 3; diálise→3), sódio, albumina, sexo.
   * Ref. Excel MVP v2.5 / Kim et al.
   */
  function computeMeld30(opts) {
    opts = opts || {};
    var bil = num(opts.bilirubin);
    var i = num(opts.inr);
    var cr = num(opts.creatinine);
    var na = num(opts.sodium);
    var alb = num(opts.albumin);
    if (bil == null || i == null || cr == null || na == null || alb == null) {
      return null;
    }
    bil = Math.max(1, bil);
    i = Math.max(1, i);
    cr = isYes(opts.dialysis) ? 3 : Math.min(3, Math.max(1, cr));
    var naClamped = Math.min(137, Math.max(125, na));
    var albClamped = Math.min(3.5, Math.max(1.5, alb));
    var female = isFemale(opts.sex) ? 1.33 : 0;
    var score =
      female +
      4.56 * Math.log(bil) +
      0.82 * (137 - naClamped) -
      0.24 * (137 - naClamped) * Math.log(bil) +
      9.09 * Math.log(i) +
      11.14 * Math.log(cr) +
      1.85 * (3.5 - albClamped) -
      1.83 * (3.5 - albClamped) * Math.log(cr) +
      6;
    return Math.max(6, Math.min(40, Math.round(score)));
  }

  function computeDeathWithinDays(surgeryDate, deathDate, days) {
    if (!surgeryDate || !deathDate) return "Não";
    var d = daysBetween(surgeryDate, deathDate);
    if (d == null || d < 0) return "Não";
    return d <= days ? "Sim" : "Não";
  }

  function computeReadmission30d(surgeryDate, readmissionDate) {
    if (!surgeryDate || !readmissionDate) return "Não";
    var d = daysBetween(surgeryDate, readmissionDate);
    if (d == null || d < 0) return "Não";
    return d <= 30 ? "Sim" : "Não";
  }

  /**
   * Textbook outcome v2.5:
   * Clavien≥III=Não AND reintervenção≠Sim AND reoperação≠Sim
   * AND readmissão30d=Não AND óbito30d=Não AND óbito60d=Não
   */
  function computeTextbookOutcome(postop) {
    if (!postop || typeof postop !== "object") return null;
    var clavienGte3 = postop.clavienGte3;
    if (clavienGte3 == null && postop.clavienMax) {
      clavienGte3 = computeClavienGte3(postop.clavienMax) ? "Sim" : "Não";
    }
    if (clavienGte3 !== "Não") return "Não";
    if (isYes(postop.reintervention)) return "Não";
    if (isYes(postop.reoperation)) return "Não";
    if (isYes(postop.readmission30d)) return "Não";
    if (isYes(postop.death30d)) return "Não";
    if (isYes(postop.death60d)) return "Não";
    return "Sim";
  }

  function computeFollowupDays(episodeStartDate, lastContact) {
    return daysBetween(episodeStartDate, lastContact);
  }

  function enrichPreop(preop, opts) {
    if (!preop || typeof preop !== "object") return preop;
    opts = opts || {};
    var out = Object.assign({}, preop);
    var classic = computeMeldClassic(
      out.bilirubin,
      out.inr,
      out.creatinine,
      out.dialysis,
    );
    if (classic != null) {
      out.meldClassic = String(classic);
      // legado v1
      out.meld = String(classic);
    }
    var meldNa = computeMeldNa(classic, out.sodium);
    if (meldNa != null) out.meldNa = String(meldNa);
    var meld30 = computeMeld30({
      bilirubin: out.bilirubin,
      inr: out.inr,
      creatinine: out.creatinine,
      sodium: out.sodium,
      albumin: out.albumin,
      dialysis: out.dialysis,
      sex: opts.sex,
    });
    if (meld30 != null) out.meld30 = String(meld30);
    return out;
  }

  function enrichPostop(postop, surgeryDate) {
    if (!postop || typeof postop !== "object") return postop;
    var out = Object.assign({}, postop);
    if (out.dischargeDate && surgeryDate) {
      var los = computeLengthOfStayDays(out.dischargeDate, surgeryDate);
      if (los != null) out.lengthOfStayDays = String(los);
    }
    if (out.clavienMax) {
      out.clavienGte3 = computeClavienGte3(out.clavienMax) ? "Sim" : "Não";
    }
    out.readmission30d = computeReadmission30d(
      surgeryDate,
      out.readmissionDate,
    );
    out.death30d = computeDeathWithinDays(surgeryDate, out.deathDate, 30);
    out.death60d = computeDeathWithinDays(surgeryDate, out.deathDate, 60);
    out.death90d = computeDeathWithinDays(surgeryDate, out.deathDate, 90);
    out.textbookOutcome = computeTextbookOutcome(out);
    return out;
  }

  function enrichPathology(pathology) {
    if (!pathology || typeof pathology !== "object") return pathology;
    var out = Object.assign({}, pathology);
    var ratio = computeLnRatio(out.lnPositive, out.lnExamined);
    if (ratio != null) out.lnRatio = String(ratio);
    return out;
  }

  function enrichRobotic(robotic) {
    if (!robotic || typeof robotic !== "object") return robotic;
    var out = Object.assign({}, robotic);
    var mins = computeConsoleTimeMin(out.consoleStart, out.consoleEnd);
    if (mins != null) out.consoleTimeMin = String(mins);
    return out;
  }

  function enrichFollowup(followup, surgeryDate, episodeStartDate) {
    if (!followup || typeof followup !== "object") return followup;
    var out = Object.assign({}, followup);
    if (surgeryDate) {
      out.survivalMonths = computeSurvivalMonths(
        surgeryDate,
        out.deathDate,
        out.lastContact,
      );
      if (out.recurrenceDate) {
        out.sldMonths = computeSldMonths(surgeryDate, out.recurrenceDate);
      }
      if (out.adjuvancyStartDate) {
        out.adjuvancyTimeMonths = computeAdjuvancyTimeMonths(
          surgeryDate,
          out.adjuvancyStartDate,
        );
      }
    }
    var start = episodeStartDate || surgeryDate;
    if (start && out.lastContact) {
      var days = computeFollowupDays(start, out.lastContact);
      if (days != null) out.followupDays = String(days);
    }
    return out;
  }

  return {
    MONTHS_DIVISOR: MONTHS_DIVISOR,
    parseDate: parseDate,
    daysBetween: daysBetween,
    monthsBetween: monthsBetween,
    computeLengthOfStayDays: computeLengthOfStayDays,
    computeLnRatio: computeLnRatio,
    computeConsoleTimeMin: computeConsoleTimeMin,
    computeClavienGte3: computeClavienGte3,
    computeSurvivalMonths: computeSurvivalMonths,
    computeSldMonths: computeSldMonths,
    computeAdjuvancyTimeMonths: computeAdjuvancyTimeMonths,
    computeDaysToPathologyReport: computeDaysToPathologyReport,
    computeMeldClassic: computeMeldClassic,
    computeMeldNa: computeMeldNa,
    computeMeld30: computeMeld30,
    computeDeathWithinDays: computeDeathWithinDays,
    computeReadmission30d: computeReadmission30d,
    computeTextbookOutcome: computeTextbookOutcome,
    computeFollowupDays: computeFollowupDays,
    enrichPreop: enrichPreop,
    enrichPostop: enrichPostop,
    enrichPathology: enrichPathology,
    enrichRobotic: enrichRobotic,
    enrichFollowup: enrichFollowup,
  };
});
