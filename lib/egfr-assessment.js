/**
 * Avaliação de TFG (eGFR) a partir de exames + passômetro + PII.
 * Testável em Node; extensão: global AghuEgfrAssessment.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuEgfrAssessment = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function ckdApi() {
    return root.AghuCkdEpiEgfr || null;
  }

  function latestApi() {
    return root.AghuExamLatestValue || null;
  }

  function buildEgfrSuggested(opts, ckd, latest) {
    var suggested = {};
    var header = opts.passometroHeader || null;

    var cr = latest.getLatestAnalyteValue(opts.exams, "Cr");
    if (cr) {
      try {
        suggested.creatinineMgDl = ckd.normalizeCreatinineMgDl(cr.value, cr.unit);
        if (cr.unit) suggested.creatinineUnit = cr.unit;
        suggested.dataISO = cr.dataISO;
        suggested.dataLabel = cr.dataLabel;
      } catch (_e) {
        /* omit invalid creatinine */
      }
    }

    var ageYears = ckd.resolveAgeYears({
      pii: opts.pii || null,
      passometroHeader: header,
      referenceDateISO: suggested.dataISO || null,
    });
    if (ageYears != null) {
      suggested.ageYears = ageYears;
    }

    var sex = ckd.normalizeSex(opts.pii && opts.pii.sexo);
    if (sex) {
      suggested.sex = sex;
    }

    return suggested;
  }

  /**
   * @param {{ exams?: unknown, passometroHeader?: object|null, pii?: object|null }} opts
   * @returns {{
   *   status: 'ok'|'missing'|'invalid_age',
   *   missing?: string[],
   *   suggested?: object,
   *   egfr?: { egfrMlMin: number, stageId: string, stageLabel: string },
   *   inputs?: {
   *     creatinineMgDl: number,
   *     creatinineUnit?: string,
   *     ageYears: number,
   *     sex: 'M'|'F',
   *     dataISO: string|null,
   *     dataLabel: string|null,
   *   },
   *   reason?: string,
   * }}
   */
  function buildEgfrAssessment(opts) {
    opts = opts || {};
    var ckd = ckdApi();
    var latest = latestApi();
    if (!ckd || !latest) {
      return { status: "missing", missing: ["module"], reason: "modules_unavailable" };
    }

    var missing = [];
    var suggested = buildEgfrSuggested(opts, ckd, latest);

    if (suggested.ageYears == null) missing.push("idade");
    if (!suggested.sex) missing.push("sexo");
    if (suggested.creatinineMgDl == null) missing.push("creatinine");

    if (missing.length) {
      return { status: "missing", missing: missing, suggested: suggested };
    }

    var ageYears = suggested.ageYears;
    var sex = suggested.sex;
    var creatinineMgDl = suggested.creatinineMgDl;

    if (ageYears < ckd.MIN_AGE_YEARS) {
      return {
        status: "invalid_age",
        missing: ["idade"],
        reason: "under_18",
        suggested: suggested,
      };
    }

    var egfr;
    try {
      egfr = ckd.computeCkdEpiEgfr({
        creatinineMgDl: creatinineMgDl,
        ageYears: ageYears,
        sex: sex,
      });
    } catch (_e2) {
      return {
        status: "missing",
        missing: ["creatinine"],
        suggested: suggested,
      };
    }

    var inputs = {
      creatinineMgDl: creatinineMgDl,
      creatinineUnit: suggested.creatinineUnit,
      ageYears: ageYears,
      sex: sex,
      dataISO: suggested.dataISO != null ? suggested.dataISO : null,
      dataLabel: suggested.dataLabel != null ? suggested.dataLabel : null,
    };

    return {
      status: "ok",
      egfr: egfr,
      suggested: suggested,
      inputs: inputs,
    };
  }

  return {
    buildEgfrAssessment: buildEgfrAssessment,
  };
});
