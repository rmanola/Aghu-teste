/**
 * Gate de identidade na extração de cirurgias (FEAT-062 / CIR-EXT-12).
 * Pure — testável sem DOM/popup.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasPatientGate = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function hasValidProntuario(patient) {
    if (!patient || patient.prontuario == null) return false;
    var digits = String(patient.prontuario).replace(/\D/g, "");
    return digits.length >= 5;
  }

  /**
   * Preferir patientKey da página quando há prontuário válido;
   * select só como fallback se a página não identificou.
   * @param {object|null} patient
   * @param {string|null|undefined} selectValue
   * @param {{ buildPatientKey?: function }} [identityApi]
   * @returns {string|null}
   */
  function resolveCirurgiasPatientKey(patient, selectValue, identityApi) {
    if (hasValidProntuario(patient)) {
      if (patient.patientKey) return patient.patientKey;
      if (identityApi && identityApi.buildPatientKey) {
        return identityApi.buildPatientKey(patient.prontuario) || null;
      }
      return String(patient.prontuario).replace(/\D/g, "").replace(/^0+/, "") || null;
    }
    if (selectValue && selectValue !== "__page__") return selectValue;
    if (patient && patient.patientKey) return patient.patientKey;
    return null;
  }

  /**
   * Meta para savePassometro + ensureMinimalPatientRecord.
   * Fail-fast: sem "?" / "Paciente" inventados.
   * @param {object|null} patient
   * @param {string|null} patientKey
   * @returns {{ ok: true, meta: object }|{ ok: false, error: string, missing: string[] }}
   */
  function buildCirurgiasSaveMeta(patient, patientKey) {
    var missing =
      patient && Array.isArray(patient.missing) && patient.missing.length
        ? patient.missing.slice()
        : [];
    if (!patient || !patient.ok || !hasValidProntuario(patient) || !patientKey) {
      if (!missing.length) {
        if (!patient || !patient.nomeCompleto) missing.push("nome do paciente");
        if (!hasValidProntuario(patient)) missing.push("prontuário");
      }
      return {
        ok: false,
        missing: missing,
        error:
          "Identidade incompleta na página — não gravar cirurgias (falta " +
          missing.join(", ") +
          "). Abra o POL do paciente e tente de novo.",
      };
    }
    var primeiroNome = String(
      patient.primeiroNome ||
        (patient.nomeCompleto && String(patient.nomeCompleto).trim().split(/\s+/)[0]) ||
        ""
    ).trim();
    var nomeCompleto = String(patient.nomeCompleto || "").trim();
    if (!primeiroNome || !nomeCompleto) {
      return {
        ok: false,
        missing: ["nome do paciente"],
        error:
          "Identidade incompleta na página — não gravar cirurgias (falta nome do paciente). Abra o POL do paciente e tente de novo.",
      };
    }
    return {
      ok: true,
      missing: [],
      meta: {
        patientKey: patientKey,
        primeiroNome: primeiroNome,
        nomeCompleto: nomeCompleto,
        prontuario: String(patient.prontuario),
      },
    };
  }

  return {
    hasValidProntuario: hasValidProntuario,
    resolveCirurgiasPatientKey: resolveCirurgiasPatientKey,
    buildCirurgiasSaveMeta: buildCirurgiasSaveMeta,
  };
});
