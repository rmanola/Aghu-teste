/**
 * Merge de nome/prontuário em registros locais — evita nome stale quando prontuário muda.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientMetaMerge = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeProntuario(raw) {
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  /**
   * @param {object} rec registro existente (mutado)
   * @param {{ primeiroNome?: string, nomeCompleto?: string, prontuario?: string }} meta
   */
  function applyPatientIdentityToRecord(rec, meta) {
    if (!rec || !meta) return rec;
    var prevPront = normalizeProntuario(rec.prontuario);
    var nextPront = normalizeProntuario(meta.prontuario);
    var prontChanged = !!(prevPront && nextPront && prevPront !== nextPront);

    if (meta.prontuario != null && meta.prontuario !== "") {
      rec.prontuario = meta.prontuario;
    }

    if (prontChanged) {
      rec.nomeCompleto = meta.nomeCompleto || "";
      rec.primeiroNome = meta.primeiroNome || "";
    } else {
      if (meta.primeiroNome != null && meta.primeiroNome !== "") {
        rec.primeiroNome = meta.primeiroNome;
      }
      if (meta.nomeCompleto) {
        rec.nomeCompleto = meta.nomeCompleto;
      }
    }
    return rec;
  }

  return {
    normalizeProntuario: normalizeProntuario,
    applyPatientIdentityToRecord: applyPatientIdentityToRecord,
  };
});
