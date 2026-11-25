/**
 * FEAT-208 — metadados imaging_study + fields[] mínimo (IMG-AC-10).
 * record_client_id SOMENTE via lib/patient-identity.js.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./patient-identity.js")
      : root.AghuPatientIdentity,
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuImagingStudyMeta = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (identity) {
  "use strict";

  var MIN_FIELDS = ["modality", "performed_at", "description"];

  function requireIdentity() {
    if (
      !identity ||
      (typeof identity.recordClientIdFromProntuarioSync !== "function" &&
        typeof identity.recordClientIdFromProntuario !== "function")
    ) {
      throw new Error(
        "[AGHU imaging] lib/patient-identity.js obrigatório para record_client_id.",
      );
    }
    return identity;
  }

  /**
   * Regista metadados de estudo sintético — identidade só via patient-identity.
   */
  function registerImagingStudyMeta(input) {
    var idApi = requireIdentity();
    var prontuario = input && input.prontuario;
    var recordClientId =
      typeof idApi.recordClientIdFromProntuarioSync === "function"
        ? idApi.recordClientIdFromProntuarioSync(prontuario)
        : null;
    if (!recordClientId) {
      throw new Error(
        "[AGHU imaging] prontuário inválido — não foi possível derivar record_client_id.",
      );
    }
    var studyUid = String((input && input.studyUid) || "").trim();
    var modality = String((input && input.modality) || "").trim();
    var performedAt = (input && input.performedAt) || null;
    var orthancId = String((input && input.orthancId) || "").trim();
    if (!studyUid || !modality || !performedAt || !orthancId) {
      throw new Error(
        "[AGHU imaging] studyUid, modality, performedAt e orthancId são obrigatórios.",
      );
    }
    return {
      user_id: (input && input.userId) || null,
      person_id: (input && input.personId) || null,
      workspace_id: (input && input.workspaceId) || null,
      record_client_id: recordClientId,
      study_uid: studyUid,
      modality: modality,
      performed_at: performedAt,
      description: (input && input.description) || null,
      orthanc_id: orthancId,
    };
  }

  /** fields[] mínimo para o prontuário (IMG-AC-10). */
  function projectImagingFields(row, fields) {
    var wanted = Array.isArray(fields) && fields.length ? fields : MIN_FIELDS;
    var out = {};
    for (var i = 0; i < wanted.length; i++) {
      var f = wanted[i];
      if (f === "modality") out.modality = row.modality;
      else if (f === "performed_at" || f === "performedAt") {
        out.performed_at = row.performed_at || row.performedAt;
      } else if (f === "description") out.description = row.description || null;
      else if (f === "study_uid" || f === "studyUid") {
        out.study_uid = row.study_uid || row.studyUid;
      }
    }
    return out;
  }

  /** Mensagens de falha explícitas na UI (IMG-AC-13). */
  var UI_FAILURE = {
    orthanc_unavailable: {
      code: "orthanc_unavailable",
      message:
        "Orthanc indisponível — visualização de imagem temporariamente inacessível.",
    },
    session_expired: {
      code: "session_expired",
      message: "Sessão de visualização expirada — reabrir estudo.",
    },
    study_missing: {
      code: "study_missing",
      message: "Estudo não encontrado ou sem permissão.",
    },
  };

  return {
    MIN_FIELDS: MIN_FIELDS,
    registerImagingStudyMeta: registerImagingStudyMeta,
    projectImagingFields: projectImagingFields,
    UI_FAILURE: UI_FAILURE,
  };
});
