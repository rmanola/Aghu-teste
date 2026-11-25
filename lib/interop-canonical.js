/**
 * Modelo canónico de eventos hospitalares (FEAT-138).
 * HL7 e FHIR convergem aqui antes do merge para payload sync v8.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  // Sempre espelhar no global — Edge bundle pode ter `module` e ainda assim
  // consumidores UMD (hl7/fhir) leem `globalThis.AghuInteropCanonical`.
  root.AghuInteropCanonical = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var patientIdentityApi = null;

  function tryRequirePatientIdentity() {
    if (patientIdentityApi) return patientIdentityApi;
    if (typeof require === "function") {
      try {
        patientIdentityApi = require("./patient-identity.js");
        return patientIdentityApi;
      } catch (_e) {
        /* browser */
      }
    }
    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : this;
    if (g.AghuPatientIdentity) {
      patientIdentityApi = g.AghuPatientIdentity;
    }
    return patientIdentityApi;
  }

  var ALLOWED_LOG_FIELDS = [
    "workspace_id",
    "connector_id",
    "external_message_id",
    "source",
    "status",
    "domains_touched",
    "record_client_id",
    "error_code",
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  var SAFE_MESSAGE_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;

  /**
   * `external_message_id` é o único campo do log cujo CONTEÚDO vem do conector
   * (MSH-10, header `Idempotency-Key`, `resource.id`). Sem normalização:
   *   (a) um conector podia enfiar nome/prontuário no id → PHI numa tabela que
   *       se declara "sem corpo clínico nem PII" (INTCOR-AC-05);
   *   (b) um id com mais de 200 chars violava o CHECK da coluna, o INSERT
   *       falhava e a tentativa desaparecia do audit trail.
   * Fora do alfabeto seguro, substitui-se por um digest estável — mantém a
   * idempotência (mesmo id de entrada → mesmo digest) sem propagar o texto.
   */
  function normalizeExternalMessageId(raw) {
    var value = str(raw);
    if (!value) return "";
    if (SAFE_MESSAGE_ID_RE.test(value)) return value;
    return "opaque:" + opaqueDigest(value);
  }

  var FNV_PRIME = BigInt("0x100000001b3");
  var FNV_MASK = BigInt("0xffffffffffffffff");
  var FNV_OFFSETS = [BigInt("0xcbf29ce484222325"), BigInt("0x84222325cbf29ce4")];

  /**
   * Digest de 128 bits (dois streams FNV-1a de 64 bits com offsets distintos).
   *
   * Sem dependências de cripto de propósito: tem de produzir EXATAMENTE o mesmo
   * valor em Node, Deno (Edge) e browser, senão o id gravado no log e o usado
   * na consulta de idempotência divergem. Um fallback condicional (SHA-256 se
   * disponível, outra coisa se não) reintroduziria essa divergência.
   *
   * Consome o code point inteiro — `charCodeAt(i) & 0xff` truncava não-ASCII e
   * colapsava ids distintos no mesmo digest.
   */
  function opaqueDigest(input) {
    var out = "";
    for (var s = 0; s < FNV_OFFSETS.length; s++) {
      var hash = FNV_OFFSETS[s];
      for (var i = 0; i < input.length; i++) {
        var cp = input.codePointAt(i);
        if (cp > 0xffff) i++; // par surrogate já consumido
        hash = (hash ^ BigInt(cp)) & FNV_MASK;
        hash = (hash * FNV_PRIME) & FNV_MASK;
      }
      out += hash.toString(16).padStart(16, "0");
    }
    return out;
  }

  /**
   * INTCOR-AC-01 — record_client_id só via patient-identity; prontuário inválido na fronteira.
   * @param {{ prontuario?: unknown, nomeCompleto?: unknown, primeiroNome?: unknown, dataNascimento?: unknown, sexo?: unknown }} patientRef
   */
  function resolvePatientRef(patientRef) {
    var idApi = tryRequirePatientIdentity();
    if (!idApi) {
      return { ok: false, error: "patient_identity_unavailable" };
    }
    if (!patientRef || typeof patientRef !== "object") {
      return { ok: false, error: "invalid_patient_ref" };
    }
    var prontuario = patientRef.prontuario;
    if (!idApi.isValidProntuarioForIdentity(prontuario)) {
      return { ok: false, error: "invalid_prontuario" };
    }
    var recordClientId = idApi.recordClientIdFromProntuarioSync(prontuario);
    var patientKey = idApi.buildPatientKey(prontuario);
    if (!recordClientId || !patientKey) {
      return { ok: false, error: "invalid_prontuario" };
    }
    var nomeCompleto = str(patientRef.nomeCompleto);
    var primeiroNome = str(patientRef.primeiroNome);
    if (!primeiroNome && nomeCompleto) {
      primeiroNome = nomeCompleto.split(/\s+/)[0] || "";
    }
    if (!nomeCompleto && primeiroNome) {
      nomeCompleto = primeiroNome;
    }
    var pii = {
      patientKey: patientKey,
      prontuario: idApi.normalizeProntuario(prontuario),
      primeiroNome: primeiroNome || "Paciente",
      nomeCompleto: nomeCompleto || primeiroNome || "Paciente",
    };
    var dob = str(patientRef.dataNascimento);
    if (dob) pii.dataNascimento = dob;
    var sexo = str(patientRef.sexo);
    if (sexo) pii.sexo = sexo;
    return {
      ok: true,
      recordClientId: recordClientId,
      patientKey: patientKey,
      pii: pii,
    };
  }

  function normalizeCanonicalEvent(raw) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "invalid_event" };
    }
    var externalMessageId = str(raw.externalMessageId);
    if (!externalMessageId) {
      return { ok: false, error: "external_message_id_required" };
    }
    var patientResolved = resolvePatientRef(raw.patientRef);
    if (!patientResolved.ok) {
      return patientResolved;
    }
    var event = {
      externalMessageId: externalMessageId,
      recordClientId: patientResolved.recordClientId,
      patientKey: patientResolved.patientKey,
      pii: patientResolved.pii,
    };
    if (raw.episode && typeof raw.episode === "object") {
      event.episode = raw.episode;
    }
    // Bundles FHIR podem trazer vários Encounter / MedicationRequest; HL7
    // continua a usar a forma singular acima.
    if (Array.isArray(raw.episodes) && raw.episodes.length) {
      event.episodes = raw.episodes.filter(function (e) {
        return e && typeof e === "object";
      });
    }
    if (Array.isArray(raw.examResults) && raw.examResults.length) {
      event.examResults = raw.examResults.filter(function (e) {
        return e && typeof e === "object";
      });
    }
    if (raw.prescription && typeof raw.prescription === "object") {
      event.prescription = raw.prescription;
    }
    if (Array.isArray(raw.prescriptions) && raw.prescriptions.length) {
      event.prescriptions = raw.prescriptions.filter(function (p) {
        return p && typeof p === "object";
      });
    }
    if (raw.vitalEntry && typeof raw.vitalEntry === "object") {
      event.vitalEntry = raw.vitalEntry;
    }
    if (raw.source) event.source = str(raw.source);
    return { ok: true, event: event };
  }

  /**
   * INTCOR-AC-05 — metadados de ingestão sem corpo HL7/FHIR nem PII.
   */
  function buildIngestLogMetadata(input) {
    input = input || {};
    var row = {
      workspace_id: str(input.workspace_id),
      connector_id: str(input.connector_id),
      external_message_id: normalizeExternalMessageId(input.external_message_id),
      source: str(input.source),
      status: str(input.status),
      domains_touched: Array.isArray(input.domains_touched)
        ? input.domains_touched.map(function (d) {
            return str(d);
          }).filter(Boolean)
        : [],
      record_client_id: str(input.record_client_id) || null,
      error_code: input.error_code ? str(input.error_code) : null,
    };
    // PHI primeiro — erro mais específico e acionável que o genérico abaixo.
    var forbiddenKeys = [
      "body",
      "message",
      "hl7",
      "fhir",
      "payload",
      "nome",
      "prontuario",
      "patient_name",
    ];
    for (var i = 0; i < forbiddenKeys.length; i++) {
      if (forbiddenKeys[i] in input) {
        throw new Error("ingest_log_phi_forbidden:" + forbiddenKeys[i]);
      }
    }
    // Allowlist sobre o `input` do chamador — iterar `row` (literal construído
    // acima, sempre conforme) tornava esta verificação um no-op.
    for (var key in input) {
      if (
        Object.prototype.hasOwnProperty.call(input, key) &&
        ALLOWED_LOG_FIELDS.indexOf(key) === -1
      ) {
        throw new Error("ingest_log_forbidden_field:" + key);
      }
    }
    return row;
  }

  function listTouchedDomains(event) {
    if (!event || typeof event !== "object") return [];
    var out = ["pii"];
    if (event.episode || (event.episodes && event.episodes.length)) {
      out.push("patient_episodes");
    }
    if (event.examResults && event.examResults.length) out.push("exams");
    if (event.prescription || (event.prescriptions && event.prescriptions.length)) {
      out.push("prescricoes");
    }
    if (event.vitalEntry) out.push("controles");
    return out;
  }

  return {
    resolvePatientRef: resolvePatientRef,
    normalizeCanonicalEvent: normalizeCanonicalEvent,
    normalizeExternalMessageId: normalizeExternalMessageId,
    buildIngestLogMetadata: buildIngestLogMetadata,
    listTouchedDomains: listTouchedDomains,
    ALLOWED_LOG_FIELDS: ALLOWED_LOG_FIELDS,
  };
});
