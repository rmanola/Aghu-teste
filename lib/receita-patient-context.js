/**
 * Contexto de paciente para receituário (avulso vs registrado).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaPatientContext = api;
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

  function getIdentity() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./patient-identity.js");
      } catch (_e) {}
    }
    return globalThis.AghuPatientIdentity;
  }

  function emptyContext(mode) {
    return {
      mode: mode === "registered" ? "registered" : "unregistered",
      recordClientId: "",
      patientKey: "",
      nomeCompleto: "",
      idade: "",
      sexo: "",
      prontuario: "",
      incomplete: mode !== "registered",
    };
  }

  /**
   * @param {{ mode?: string, prontuario?: string, recordClientId?: string, patientKey?: string, nomeCompleto?: string, idade?: string, sexo?: string }} input
   */
  function resolvePatientContext(input) {
    input = input || {};
    var mode =
      input.mode === "registered" ? "registered" : "unregistered";
    var idApi = getIdentity();
    var prontuario = String(input.prontuario || "").trim();
    var recordClientId = String(input.recordClientId || "").trim();
    var patientKey = String(input.patientKey || "").trim();

    if (mode === "registered" && recordClientId) {
      return {
        mode: "registered",
        recordClientId: recordClientId,
        patientKey: patientKey || prontuario || recordClientId,
        nomeCompleto: String(input.nomeCompleto || ""),
        idade: String(input.idade || ""),
        sexo: input.sexo === "M" || input.sexo === "F" ? input.sexo : "",
        prontuario: prontuario,
        incomplete: false,
      };
    }

    if (prontuario && idApi && idApi.isValidProntuarioForIdentity(prontuario)) {
      var rid = idApi.recordClientIdFromProntuarioSync(prontuario);
      var pk = idApi.buildPatientKey(prontuario);
      if (!rid || !pk) {
        return {
          mode: "unregistered",
          recordClientId: "",
          patientKey: "",
          nomeCompleto: String(input.nomeCompleto || ""),
          idade: String(input.idade || ""),
          sexo: input.sexo === "M" || input.sexo === "F" ? input.sexo : "",
          prontuario: "",
          incomplete: true,
        };
      }
      return {
        mode: "unregistered",
        recordClientId: rid,
        patientKey: pk,
        nomeCompleto: String(input.nomeCompleto || ""),
        idade: String(input.idade || ""),
        sexo: input.sexo === "M" || input.sexo === "F" ? input.sexo : "",
        prontuario: prontuario,
        incomplete: false,
      };
    }

    return {
      mode: "unregistered",
      recordClientId: "",
      patientKey: "",
      nomeCompleto: String(input.nomeCompleto || ""),
      idade: String(input.idade || ""),
      sexo: input.sexo === "M" || input.sexo === "F" ? input.sexo : "",
      prontuario: "",
      incomplete: true,
    };
  }

  function formatPatientAddressForPrint(addr) {
    if (!addr || typeof addr !== "object") return "";
    var street = String(addr.street || "").trim();
    var number = String(addr.number || "").trim();
    var neighborhood = String(addr.neighborhood || "").trim();
    var city = String(addr.city || "").trim();
    var state = String(addr.state || "").trim().toUpperCase();
    if (!street && !city) return "";
    var parts = [];
    if (street) {
      var streetPart = street;
      if (number) streetPart += ", Nº " + number;
      parts.push(streetPart);
    }
    if (neighborhood) parts.push(neighborhood);
    if (city) {
      parts.push(state ? city + "-" + state : city);
    } else if (state) {
      parts.push(state);
    }
    return parts.join(", ");
  }

  function contextForPrint(ctx) {
    ctx = ctx || emptyContext("unregistered");
    var out = {
      nome: ctx.nomeCompleto || "—",
      prontuario: ctx.prontuario || "",
    };
    var idade = String(ctx.idade || "").trim();
    if (idade) {
      out.idade = idade;
    }
    if (ctx.sexo === "M") {
      out.sexo = "Masculino";
    } else if (ctx.sexo === "F") {
      out.sexo = "Feminino";
    }
    var endereco = formatPatientAddressForPrint(ctx.patientAddress);
    if (endereco) {
      out.endereco = endereco;
    }
    return out;
  }

  /**
   * @param {{ pii?: object, snap?: object, activeDoc?: object|null }} input
   */
  function resolveDefaultPatientAddress(input) {
    input = input || {};
    var schema = getSchema();
    var empty = schema ? schema.emptyPatientAddress() : {
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "ES",
    };
    var activeDoc = input.activeDoc;
    if (
      activeDoc &&
      activeDoc.patientAddress &&
      schema &&
      schema.hasPatientAddressContent(activeDoc.patientAddress)
    ) {
      return schema.normalizePatientAddress(activeDoc.patientAddress);
    }
    var snap = input.snap;
    if (snap && schema) {
      var fromSnap = schema.resolveBestPatientAddressFromSnap(
        snap,
        activeDoc && activeDoc.id ? activeDoc.id : null,
      );
      if (schema.hasPatientAddressContent(fromSnap)) return fromSnap;
    }
    var pii = input.pii;
    if (
      pii &&
      pii.patientAddress &&
      schema &&
      schema.hasPatientAddressContent(pii.patientAddress)
    ) {
      return schema.normalizePatientAddress(pii.patientAddress);
    }
    return empty;
  }

  return {
    emptyContext: emptyContext,
    resolvePatientContext: resolvePatientContext,
    contextForPrint: contextForPrint,
    formatPatientAddressForPrint: formatPatientAddressForPrint,
    resolveDefaultPatientAddress: resolveDefaultPatientAddress,
  };
});
