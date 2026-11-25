/**
 * Validação de contexto antes da impressão de receituário.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaPrintValidation = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  /**
   * @param {{ patient?: object, prescriber?: object, lines?: object[], printType?: 'simple'|'special', patientAddress?: object }} ctx
   */
  function validatePrintContext(ctx) {
    ctx = ctx || {};
    var warnings = [];
    var errors = [];
    var patient = ctx.patient || {};
    var allLines = Array.isArray(ctx.lines) ? ctx.lines : [];
    var printType = ctx.printType === "special" ? "special" : "simple";
    var schema = getSchema();

    var lines = allLines;
    if (schema && typeof schema.groupLinesByPrintType === "function") {
      var grouped = schema.groupLinesByPrintType(allLines);
      lines = printType === "special" ? grouped.special : grouped.simple;
    }

    if (!patient.nome || !String(patient.nome).trim() || patient.nome === "—") {
      errors.push("Informe o nome do paciente.");
    }

    if (lines.length === 0) {
      if (printType === "special") {
        errors.push("Nenhum medicamento para receita especial ANVISA.");
      } else {
        errors.push("Nenhum medicamento para receita simples (2 vias).");
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln) continue;
      if (!ln.drugName || !String(ln.drugName).trim()) {
        errors.push("Informe o medicamento na linha " + (i + 1) + ".");
      }
      if (!ln.posology || !String(ln.posology).trim()) {
        errors.push("Informe a posologia na linha " + (i + 1) + ".");
      }
    }

    if (printType === "special") {
      var addrOk = schema
        ? schema.isPatientAddressComplete(ctx.patientAddress)
        : false;
      if (!addrOk) {
        warnings.push(
          "Endereço do paciente incompleto — pode preencher à mão no formulário impresso.",
        );
      }
    }

    if (schema && printType === "special") {
      for (var j = 0; j < lines.length; j++) {
        var specialLine = lines[j];
        if (
          specialLine &&
          specialLine.prescriptionDocumentClass === "SPECIAL_NOTIFICATION"
        ) {
          warnings.push(
            "Medicamento " +
              (specialLine.drugName || "") +
              ": numeração SNCR não disponível nesta versão.",
          );
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
    };
  }

  return {
    validatePrintContext: validatePrintContext,
  };
});
