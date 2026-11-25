/**
 * Ingestão FHIR R4 → modelo canónico (FEAT-140).
 * Resources: Patient, Encounter, Observation, MedicationRequest, Bundle.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuFhirR4Ingest = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var canonicalApi = null;

  function getCanonicalApi() {
    if (canonicalApi) return canonicalApi;
    if (typeof require === "function") {
      try {
        canonicalApi = require("./interop-canonical.js");
        return canonicalApi;
      } catch (_e) {
        /* Deno Edge: require relativo falha no bundle — usar global UMD */
      }
    }
    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : root;
    if (g && g.AghuInteropCanonical) {
      canonicalApi = g.AghuInteropCanonical;
    }
    return canonicalApi;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  var RESOURCE_ORDER = {
    Patient: 1,
    Encounter: 2,
    Observation: 3,
    MedicationRequest: 4,
  };

  function sortBundleEntries(entries) {
    return entries.slice().sort(function (a, b) {
      var ra = (a && a.resource && a.resource.resourceType) || "";
      var rb = (b && b.resource && b.resource.resourceType) || "";
      return (RESOURCE_ORDER[ra] || 99) - (RESOURCE_ORDER[rb] || 99);
    });
  }

  /**
   * FHIR identifier-type "MR" (Medical Record Number) —
   * http://terminology.hl7.org/CodeSystem/v2-0203. Um recurso Patient pode
   * trazer vários identifiers (convénio, visita temporária, MRN); sem
   * checar o tipo, o primeiro da lista pode não ser o prontuário e
   * misatribuir PHI ao registo errado.
   */
  function isMrnIdentifier(id) {
    if (!id || typeof id !== "object" || !id.value) return false;
    var codings = id.type && Array.isArray(id.type.coding) ? id.type.coding : [];
    for (var i = 0; i < codings.length; i++) {
      if (str(codings[i].code).toUpperCase() === "MR") return true;
    }
    return false;
  }

  function parsePatient(resource) {
    if (!resource || resource.resourceType !== "Patient") return null;
    var prontuario = "";
    var identifiers = Array.isArray(resource.identifier) ? resource.identifier : [];
    var i;
    for (i = 0; i < identifiers.length; i++) {
      if (isMrnIdentifier(identifiers[i])) {
        prontuario = str(identifiers[i].value);
        break;
      }
    }
    if (!prontuario) {
      // Fallback: nenhum identifier tipado como MR — usa o primeiro
      // identifier.value presente (compat. com Patient sem `type`).
      for (i = 0; i < identifiers.length; i++) {
        var id = identifiers[i];
        if (id && id.value) {
          prontuario = str(id.value);
          break;
        }
      }
    }
    var name = Array.isArray(resource.name) && resource.name[0] ? resource.name[0] : {};
    var given = Array.isArray(name.given) ? name.given.join(" ") : "";
    var family = str(name.family);
    var nomeCompleto = [given, family].filter(Boolean).join(" ").trim();
    var gender = str(resource.gender);
    var sexo = gender === "male" ? "M" : gender === "female" ? "F" : "";
    return {
      prontuario: prontuario,
      nomeCompleto: nomeCompleto || given || family,
      primeiroNome: given || family,
      dataNascimento: str(resource.birthDate),
      sexo: sexo,
    };
  }

  function parseEncounter(resource) {
    if (!resource || resource.resourceType !== "Encounter") return null;
    var id = str(resource.id) || "enc";
    var status = str(resource.status);
    var period = resource.period || {};
    return {
      id: "fhir-" + id,
      externalId: id,
      kind: "hospitalization",
      status: status === "finished" || status === "cancelled" ? "closed" : "active",
      startedAt: str(period.start).slice(0, 10) || new Date().toISOString().slice(0, 10),
      endedAt: period.end ? str(period.end).slice(0, 10) : null,
      label: "Encounter " + id,
    };
  }

  function isLabObservation(resource) {
    var categories = Array.isArray(resource.category) ? resource.category : [];
    for (var i = 0; i < categories.length; i++) {
      var coding = categories[i] && categories[i].coding;
      if (!Array.isArray(coding)) continue;
      for (var j = 0; j < coding.length; j++) {
        var code = str(coding[j].code).toLowerCase();
        if (code === "laboratory" || code === "exam") return true;
      }
    }
    // Fallback textual só quando não há category codificada. `indexOf("lab")`
    // classificava "Labetalol"/"Labilidade" como exame laboratorial — exige
    // "lab" como palavra inteira ou o radical "laborat".
    var codeText = str(resource.code && resource.code.text).toLowerCase();
    return /\blab\b|laborat/.test(codeText);
  }

  function parseObservation(resource) {
    if (!resource || resource.resourceType !== "Observation") return null;
    if (!isLabObservation(resource)) {
      return { unsupported: true, resourceType: "Observation" };
    }
    var code = resource.code || {};
    var coding = Array.isArray(code.coding) && code.coding[0] ? code.coding[0] : {};
    var examName = str(code.text) || str(coding.display) || str(coding.code) || "Observation";
    var value =
      resource.valueQuantity && resource.valueQuantity.value != null
        ? String(resource.valueQuantity.value)
        : str(resource.valueString);
    var unit =
      resource.valueQuantity && resource.valueQuantity.unit
        ? str(resource.valueQuantity.unit)
        : "";
    return {
      examName: examName,
      dataColetaISO: str(resource.effectiveDateTime).slice(0, 10) || new Date().toISOString().slice(0, 10),
      solicitation: str(resource.id),
      resultado: value,
      unidade: unit,
    };
  }

  function parseMedicationRequest(resource) {
    if (!resource || resource.resourceType !== "MedicationRequest") return null;
    var med =
      resource.medicationCodeableConcept &&
      resource.medicationCodeableConcept.coding &&
      resource.medicationCodeableConcept.coding[0];
    var medication = str(med && med.display) || str(med && med.code) || "Medicamento";
    return {
      medication: medication,
      texto: medication,
      data: str(resource.authoredOn).slice(0, 10) || new Date().toISOString().slice(0, 10),
    };
  }

  function accumulateResource(state, resource) {
    if (!resource || !resource.resourceType) return state;
    var type = resource.resourceType;
    if (type === "Patient") {
      // Um Bundle com vários Patient é ambíguo: o evento canónico tem um único
      // sujeito. Avisa em vez de trocar de paciente em silêncio (FHIRIN-AC-07).
      if (state.patientRef) {
        state.warnings = state.warnings || [];
        state.warnings.push("multiple_patient_resources");
      }
      state.patientRef = parsePatient(resource);
    } else if (type === "Encounter") {
      // Acumula: antes, só o último Encounter do Bundle sobrevivia (FHIRIN-AC-05).
      var enc = parseEncounter(resource);
      if (enc) {
        state.episodes = state.episodes || [];
        state.episodes.push(enc);
      }
    } else if (type === "Observation") {
      var obs = parseObservation(resource);
      if (obs && obs.unsupported) {
        state.warnings = state.warnings || [];
        state.warnings.push("unsupported_observation_category");
        return state;
      }
      if (obs) {
        state.examResults = state.examResults || [];
        state.examResults.push(obs);
      }
    } else if (type === "MedicationRequest") {
      // Acumula: um Bundle com N MedicationRequest persistia só a última (FHIRIN-AC-04).
      var mr = parseMedicationRequest(resource);
      if (mr) {
        state.prescriptions = state.prescriptions || [];
        state.prescriptions.push(mr);
      }
    } else {
      state.warnings = state.warnings || [];
      state.warnings.push("unsupported_resource:" + type);
    }
    return state;
  }

  function resourceToCanonical(resource, externalMessageId) {
    var state = accumulateResource(
      { externalMessageId: externalMessageId, source: "fhir" },
      resource,
    );
    return finalizeCanonicalState(state);
  }

  function finalizeCanonicalState(state) {
    var canon = getCanonicalApi();
    if (!canon) return { ok: false, error: "canonical_unavailable" };
    if (!state.patientRef || !state.patientRef.prontuario) {
      return { ok: false, error: "patient_missing" };
    }
    var event = {
      externalMessageId: state.externalMessageId,
      patientRef: state.patientRef,
      source: "fhir",
    };
    if (state.episodes && state.episodes.length) event.episodes = state.episodes;
    if (state.examResults && state.examResults.length) event.examResults = state.examResults;
    if (state.prescriptions && state.prescriptions.length) {
      event.prescriptions = state.prescriptions;
    }
    var normalized = canon.normalizeCanonicalEvent(event);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      event: normalized.event,
      warnings: state.warnings || [],
    };
  }

  function bundleToCanonical(bundle, externalMessageId) {
    if (!bundle || bundle.resourceType !== "Bundle") {
      return { ok: false, error: "not_a_bundle" };
    }
    var entries = Array.isArray(bundle.entry) ? bundle.entry : [];
    var sorted = sortBundleEntries(entries);
    var state = { externalMessageId: externalMessageId, source: "fhir", warnings: [] };
    for (var i = 0; i < sorted.length; i++) {
      var res = sorted[i] && sorted[i].resource;
      if (res) accumulateResource(state, res);
    }
    var result = finalizeCanonicalState(state);
    if (result.ok) result.warnings = state.warnings;
    return result;
  }

  function ingestFhirResource(body, externalMessageId) {
    if (!body || typeof body !== "object") {
      return { ok: false, error: "invalid_body" };
    }
    // Sem Idempotency-Key nem resource.id não há chave de deduplicação: falhar
    // é honesto: o fallback anterior (`"fhir-" + Date.now()`) gerava um id novo
    // a cada POST e desligava a idempotência em silêncio (FHIRIN-AC-06).
    var id = str(externalMessageId) || str(body.id);
    if (!id) {
      return { ok: false, error: "external_message_id_required" };
    }
    if (body.resourceType === "Bundle") {
      return bundleToCanonical(body, id);
    }
    return resourceToCanonical(body, id);
  }

  return {
    RESOURCE_ORDER: RESOURCE_ORDER,
    sortBundleEntries: sortBundleEntries,
    parsePatient: parsePatient,
    parseEncounter: parseEncounter,
    parseObservation: parseObservation,
    parseMedicationRequest: parseMedicationRequest,
    bundleToCanonical: bundleToCanonical,
    ingestFhirResource: ingestFhirResource,
  };
});
