/**
 * Idade em anos a partir de data de nascimento ISO e data de referência (ex.: coleta).
 * Testável em Node; extensão: global AghuAgeFromDob.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAgeFromDob = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isValidIsoDate(iso) {
    if (!iso || !ISO_DATE_RE.test(String(iso).trim())) return false;
    var p = String(iso).trim().split("-").map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    return (
      dt.getFullYear() === p[0] &&
      dt.getMonth() === p[1] - 1 &&
      dt.getDate() === p[2]
    );
  }

  function ckdApi() {
    if (root.AghuCkdEpiEgfr) return root.AghuCkdEpiEgfr;
    if (typeof require === "function") {
      try {
        return require("./ckd-epi-egfr.js");
      } catch (_e) {}
    }
    return null;
  }

  function dateBrApi() {
    if (root.AghuDateBr) return root.AghuDateBr;
    if (typeof require === "function") {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return null;
  }

  function todayIso() {
    var br = dateBrApi();
    if (br && br.localTodayIso) return br.localTodayIso();
    var t = new Date();
    return (
      String(t.getFullYear()) +
      "-" +
      String(t.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(t.getDate()).padStart(2, "0")
    );
  }

  /**
   * @param {string} dobIso yyyy-mm-dd
   * @param {string|null|undefined} referenceIso yyyy-mm-dd (default: hoje local)
   * @returns {number|null}
   */
  function computeAgeYearsFromIso(dobIso, referenceIso) {
    if (!isValidIsoDate(dobIso)) return null;
    var ref = referenceIso && isValidIsoDate(referenceIso)
      ? String(referenceIso).trim()
      : todayIso();
    var d = String(dobIso).trim().split("-").map(Number);
    var r = ref.split("-").map(Number);
    if (d.length !== 3 || r.length !== 3) return null;
    var age = r[0] - d[0];
    var monthDiff = r[1] - d[1];
    var dayDiff = r[2] - d[2];
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
    return Number.isFinite(age) && age >= 0 ? age : null;
  }

  /**
   * dataNascimento no PII tem prioridade; fallback passômetro.header.idade.
   * @param {{ passometroHeader?: object|null, pii?: object|null, referenceDateISO?: string|null }} opts
   * @returns {number|null}
   */
  function resolveAgeYears(opts) {
    opts = opts || {};
    var pii = opts.pii || {};
    var dobApi = null;
    if (typeof require === "function") {
      try {
        dobApi = require("./pii-dob-resolve.js");
      } catch (_e) {}
    }
    if (!dobApi && root.AghuPiiDobResolve) dobApi = root.AghuPiiDobResolve;
    var dob =
      dobApi && dobApi.pickIsoDobFromPii
        ? dobApi.pickIsoDobFromPii(pii)
        : pii.dataNascimento || pii.dataNascimentoISO || "";
    if (dob) {
      var fromDob = computeAgeYearsFromIso(dob, opts.referenceDateISO || null);
      if (fromDob != null) return fromDob;
    }

    var ckd = ckdApi();
    var header = opts.passometroHeader || null;
    var idadeRaw =
      header && header.idade != null ? String(header.idade).trim() : "";
    if (idadeRaw) {
      if (ckd && ckd.parseIdadeAnos) {
        var fromPass = ckd.parseIdadeAnos(idadeRaw);
        if (fromPass != null) return fromPass;
      }
      var m = idadeRaw.match(/(\d{1,3})/);
      if (m) {
        var n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  }

  return {
    computeAgeYearsFromIso: computeAgeYearsFromIso,
    resolveAgeYears: resolveAgeYears,
  };
});
