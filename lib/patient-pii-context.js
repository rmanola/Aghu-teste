/**
 * PII mínimo para calculadoras/scores (sexo + data de nascimento ISO).
 * Testável em Node; extensão: global AghuPatientPiiContext.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuPatientPiiContext = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function ckdApi() {
    if (root.AghuCkdEpiEgfr) return root.AghuCkdEpiEgfr;
    if (typeof require === "function") {
      try {
        return require("./ckd-epi-egfr.js");
      } catch (_e) {}
    }
    return null;
  }

  function normalizeSex(raw) {
    var ckd = ckdApi();
    if (ckd && ckd.normalizeSex) return ckd.normalizeSex(raw);
    if (!raw) return "";
    var t = String(raw).trim().toUpperCase();
    if (t === "M" || t === "MASC" || t === "MASCULINO" || t === "MALE") return "M";
    if (t === "F" || t === "FEM" || t === "FEMININO" || t === "FEMALE") return "F";
    return "";
  }

  function pickIsoDob(source) {
    if (!source || typeof source !== "object") return "";
    var dobApi = null;
    if (typeof require === "function") {
      try {
        dobApi = require("./pii-dob-resolve.js");
      } catch (_e) {}
    }
    if (dobApi && dobApi.pickIsoDobFromPii) {
      return dobApi.pickIsoDobFromPii(source);
    }
    var iso = source.dataNascimentoISO || source.dataNascimento || "";
    iso = String(iso || "").trim();
    if (!ISO_DATE_RE.test(iso)) return "";
    return iso;
  }

  function pickSex(source) {
    if (!source || typeof source !== "object") return "";
    return normalizeSex(source.sexo);
  }

  /**
   * Mescla PII de arquivo local, meta da sessão e nuvem (prioridade: arquivo → meta → cloud).
   * @param {{ record?: object|null, meta?: object|null, cloud?: object|null }} opts
   * @returns {{ sexo: string, dataNascimento?: string, dataNascimentoISO?: string }}
   */
  function mergePatientPii(opts) {
    opts = opts || {};
    var sources = [opts.record, opts.meta, opts.cloud];
    var pii = { sexo: "" };
    var dob = "";

    for (var i = 0; i < sources.length; i++) {
      if (!dob) dob = pickIsoDob(sources[i]);
      if (!pii.sexo) pii.sexo = pickSex(sources[i]);
    }

    if (dob) {
      pii.dataNascimento = dob;
      pii.dataNascimentoISO = dob;
    }
    return pii;
  }

  return {
    mergePatientPii: mergePatientPii,
    pickIsoDob: pickIsoDob,
    pickSex: pickSex,
  };
});
