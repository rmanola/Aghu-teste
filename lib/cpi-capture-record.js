/**
 * FEAT-143 — Validação e normalização da resposta de captura.
 * Sem I/O. record_client_id nunca é derivado aqui.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCaptureRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var ISO_DATETIME =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
  var TEXT_MAX = 80;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function isBlank(v) {
    return v == null || v === "" || (typeof v === "string" && !v.trim());
  }

  function buildLongitudinalSubjectKey(milestoneKey, windowDays) {
    var key = str(milestoneKey);
    var w = Number(windowDays);
    if (!key || !Number.isFinite(w) || w < 1) return "";
    return key + ":" + String(Math.floor(w));
  }

  function resolveSubjectKey(submitted) {
    var kind = str(submitted && submitted.captureKind);
    if (kind === "longitudinal") {
      var explicit = str(submitted && submitted.subjectKey);
      if (explicit) return explicit;
      return buildLongitudinalSubjectKey(
        submitted && submitted.milestoneKey,
        submitted && submitted.windowDays,
      );
    }
    return str(submitted && (submitted.episodeId || submitted.subjectKey));
  }

  function fail(field, reason) {
    return { ok: false, field: field, reason: reason, errors: [reason] };
  }

  function coerceNumber(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return null;
  }

  function validateFieldValue(field, raw) {
    var type = str(field.type);
    if (type === "enum") {
      var allowed = asArray(field.values).map(String);
      if (allowed.indexOf(String(raw)) === -1) {
        return {
          ok: false,
          reason: "valor inválido para " + field.key,
        };
      }
      return { ok: true, value: String(raw) };
    }
    if (type === "number") {
      var n = coerceNumber(raw);
      if (n == null) {
        return { ok: false, reason: "número inválido para " + field.key };
      }
      return { ok: true, value: n };
    }
    if (type === "boolean") {
      if (raw !== true && raw !== false) {
        return { ok: false, reason: "booleano inválido para " + field.key };
      }
      return { ok: true, value: raw };
    }
    if (type === "date") {
      var d = str(raw);
      if (str(field.unit) === "datetime") {
        if (!ISO_DATETIME.test(d)) {
          return { ok: false, reason: "data/hora inválida para " + field.key };
        }
        return { ok: true, value: d };
      }
      if (!ISO_DATE.test(d)) {
        return { ok: false, reason: "data inválida para " + field.key };
      }
      return { ok: true, value: d };
    }
    if (type === "text") {
      var t = typeof raw === "string" ? raw.trim() : String(raw);
      if (t.length > TEXT_MAX) {
        return { ok: false, reason: "texto demasiado longo em " + field.key };
      }
      return { ok: true, value: t };
    }
    return { ok: false, reason: "tipo não suportado em " + field.key };
  }

  function validateCaptureRecord(schema, submitted) {
    if (!schema || typeof schema !== "object") {
      return fail("schema", "schema em falta");
    }
    var input = submitted && typeof submitted === "object" ? submitted : {};
    var kind = str(schema.captureKind || input.captureKind);
    var episodeId = str(input.episodeId);
    var milestoneKey = str(input.milestoneKey);
    var windowDays =
      input.windowDays != null && Number.isFinite(Number(input.windowDays))
        ? Number(input.windowDays)
        : null;
    var subjectKey = resolveSubjectKey({
      captureKind: kind,
      episodeId: episodeId,
      subjectKey: input.subjectKey,
      milestoneKey: milestoneKey,
      windowDays: windowDays,
    });
    if (kind === "episode" && !episodeId) {
      return fail("episodeId", "episodeId é obrigatório quando captureKind é episode");
    }
    // CPINEF2-AC-07: longitudinal nunca chaveia por episodeId sintético
    if (kind === "longitudinal") {
      if (episodeId && !str(input.subjectKey) && !milestoneKey) {
        return fail(
          "subjectKey",
          "captura longitudinal não pode usar episodeId como chave",
        );
      }
      if (!subjectKey) {
        return fail(
          "subjectKey",
          "subjectKey (milestoneKey:windowDays) é obrigatório para longitudinal",
        );
      }
      if (episodeId && subjectKey === episodeId) {
        return fail(
          "subjectKey",
          "subjectKey longitudinal não pode ser um episodeId",
        );
      }
    }
    if (!subjectKey) {
      return fail("subjectKey", "subjectKey em falta");
    }

    var rawValues =
      input.values && typeof input.values === "object" && !Array.isArray(input.values)
        ? input.values
        : {};
    var fields = asArray(schema.fields);
    var values = {};
    var unanswered = [];

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field || !field.key) continue;
      var key = str(field.key);
      var raw = Object.prototype.hasOwnProperty.call(rawValues, key)
        ? rawValues[key]
        : undefined;
      if (isBlank(raw)) {
        if (field.required) unanswered.push(key);
        continue;
      }
      var checked = validateFieldValue(field, raw);
      if (!checked.ok) {
        return fail(key, checked.reason);
      }
      values[key] = checked.value;
    }

    return {
      ok: true,
      field: null,
      reason: null,
      errors: [],
      record: {
        schemaId: str(schema.schemaId),
        careLineId: str(schema.careLineId),
        captureKind: kind,
        captureVersion: Number(schema.captureVersion) || 1,
        episodeId: kind === "episode" ? episodeId || undefined : undefined,
        subjectKey: subjectKey,
        milestoneKey: kind === "longitudinal" ? milestoneKey || undefined : undefined,
        windowDays: kind === "longitudinal" && windowDays != null ? windowDays : undefined,
        originEpisodeId:
          kind === "longitudinal" && str(input.originEpisodeId)
            ? str(input.originEpisodeId)
            : undefined,
        values: values,
        unanswered: unanswered,
      },
    };
  }

  return {
    validateCaptureRecord: validateCaptureRecord,
    resolveSubjectKey: resolveSubjectKey,
    buildLongitudinalSubjectKey: buildLongitudinalSubjectKey,
  };
});
