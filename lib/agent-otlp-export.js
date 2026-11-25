/**
 * FEAT-079 B1 — export OTLP/HTTP de traces (metadados).
 * Fail-open: nunca throw para o caller. Sem PHI (messages/proposal/studyPlan).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuAgentOtlpExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SERVICE_NAME = "aghu-study-assistant";

  /** Atributos permitidos em spans (allowlist exacta). */
  var SPAN_ATTR_ALLOWLIST = Object.freeze([
    "run_id",
    "tuple_id",
    "agent",
    "step",
    "model",
    "ok",
    "duration_ms",
    "prompt_tokens",
    "completion_tokens",
    "error_code",
    "status",
    "atos",
    "recusas",
    "candidatos",
    "selecionados",
    "aprovados",
    "confirmados",
    "divergencias",
    "faturaveis",
    "bm25",
    "rag",
    "skipped",
    "tokens",
  ]);

  var FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
    "messages",
    "proposal",
    "studyplan",
    "assistantmessage",
    "prompt",
    "patient",
    "prontuario",
    "pii",
    "laudo",
    "ciphertext",
    "content",
    "body",
  ]);

  /**
   * @param {unknown} url
   * @returns {boolean}
   */
  function isValidOtlpUrl(url) {
    var raw = url == null ? "" : String(url).trim();
    if (!raw) return false;
    try {
      var u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (_e) {
      return false;
    }
  }

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  function hasForbiddenKeyDeep(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        if (hasForbiddenKeyDeep(value[i])) return true;
      }
      return false;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var lower = String(keys[k]).toLowerCase();
      for (var f = 0; f < FORBIDDEN_PAYLOAD_KEYS.length; f++) {
        if (lower === FORBIDDEN_PAYLOAD_KEYS[f]) return true;
      }
      if (hasForbiddenKeyDeep(value[keys[k]])) return true;
    }
    return false;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @returns {{ key: string, value: Record<string, unknown> } | null}
   */
  function toOtlpAttribute(key, value) {
    if (value == null) return null;
    if (typeof value === "boolean") {
      return { key: key, value: { boolValue: value } };
    }
    if (typeof value === "number" && isFinite(value)) {
      if (Number.isInteger(value)) {
        return { key: key, value: { intValue: String(Math.trunc(value)) } };
      }
      return { key: key, value: { doubleValue: value } };
    }
    return { key: key, value: { stringValue: String(value).slice(0, 256) } };
  }

  /**
   * Redige um span input → attrs allowlist.
   * @param {Record<string, unknown>} span
   * @returns {Array<{ key: string, value: Record<string, unknown> }>}
   */
  function sanitizeSpanAttributes(span) {
    var src = span && typeof span === "object" ? span : {};
    var attrs = [];
    for (var i = 0; i < SPAN_ATTR_ALLOWLIST.length; i++) {
      var key = SPAN_ATTR_ALLOWLIST[i];
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      var attr = toOtlpAttribute(key, src[key]);
      if (attr) attrs.push(attr);
    }
    return attrs;
  }

  /**
   * @param {{
   *   runId: string,
   *   tupleId?: string,
   *   agent?: string,
   *   serviceName?: string,
   *   spans?: Array<Record<string, unknown>>,
   * }} opts
   */
  function buildTracePayload(opts) {
    opts = opts || {};
    var runId = String(opts.runId || "").slice(0, 80);
    var tupleId = opts.tupleId != null ? String(opts.tupleId).slice(0, 120) : "";
    var agent = opts.agent ? String(opts.agent).slice(0, 64) : "study_assistant";
    var serviceName = opts.serviceName
      ? String(opts.serviceName).slice(0, 64)
      : SERVICE_NAME;
    var list = Array.isArray(opts.spans) ? opts.spans : [];
    var nowNs = String(Date.now()) + "000000";

    var otlpSpans = [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i] && typeof list[i] === "object" ? list[i] : {};
      var merged = {
        run_id: runId,
        tuple_id: tupleId || undefined,
        agent: agent,
        step: raw.step != null ? raw.step : raw.name,
        model: raw.model,
        ok: raw.ok,
        duration_ms: raw.duration_ms != null ? raw.duration_ms : raw.durationMs,
        prompt_tokens:
          raw.prompt_tokens != null ? raw.prompt_tokens : raw.promptTokens,
        completion_tokens:
          raw.completion_tokens != null
            ? raw.completion_tokens
            : raw.completionTokens,
        error_code: raw.error_code != null ? raw.error_code : raw.errorCode,
        status: raw.status,
        atos: raw.atos,
        recusas: raw.recusas,
        candidatos: raw.candidatos,
        selecionados: raw.selecionados,
        aprovados: raw.aprovados,
        confirmados: raw.confirmados,
        divergencias: raw.divergencias,
        faturaveis: raw.faturaveis,
        bm25: raw.bm25,
        rag: raw.rag,
        skipped: raw.skipped,
        tokens: raw.tokens,
      };
      var name = String(merged.step || "span").slice(0, 64) || "span";
      otlpSpans.push({
        name: name,
        startTimeUnixNano: nowNs,
        endTimeUnixNano: nowNs,
        attributes: sanitizeSpanAttributes(merged),
      });
    }

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: serviceName },
              },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "aghu-agent-otlp", version: "1" },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Deriva spans de step_trace + status do run (só metadados).
   * @param {Array<Record<string, unknown>>|null|undefined} stepTrace
   * @param {{ runId: string, tupleId?: string, agent?: string, status?: string, errorCode?: string|null }} meta
   */
  function spansFromStepTrace(stepTrace, meta) {
    meta = meta || { runId: "" };
    var list = Array.isArray(stepTrace) ? stepTrace : [];
    var spans = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i] && typeof list[i] === "object" ? list[i] : {};
      var COUNT_KEYS = [
        "atos",
        "recusas",
        "candidatos",
        "selecionados",
        "aprovados",
        "confirmados",
        "divergencias",
        "faturaveis",
        "bm25",
        "rag",
        "skipped",
        "tokens",
      ];
      var span = {
        step: e.step,
        ok: e.ok !== false,
        duration_ms: Number(e.durationMs != null ? e.durationMs : e.duration_ms) || 0,
        model: e.model,
        prompt_tokens: e.promptTokens != null ? e.promptTokens : e.prompt_tokens,
        completion_tokens:
          e.completionTokens != null ? e.completionTokens : e.completion_tokens,
        status: meta.status,
        error_code: meta.errorCode || undefined,
      };
      for (var c = 0; c < COUNT_KEYS.length; c++) {
        var ck = COUNT_KEYS[c];
        if (typeof e[ck] === "number") span[ck] = e[ck];
      }
      spans.push(span);
    }
    if (!spans.length) {
      spans.push({
        step: "run",
        ok: !meta.errorCode,
        duration_ms: 0,
        status: meta.status,
        error_code: meta.errorCode || undefined,
      });
    }
    return spans;
  }

  /**
   * @param {unknown} payload
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  function assertPayloadPhiSafe(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "payload_not_object" };
    }
    if (hasForbiddenKeyDeep(payload)) {
      return { ok: false, error: "phi_like_key" };
    }
    return { ok: true };
  }

  /**
   * POST OTLP/HTTP JSON. Sem URL / inválida → no-op. Fail-open (nunca throw).
   * @param {string|null|undefined} url
   * @param {Record<string, unknown>} payload
   * @param {{ headers?: Record<string, string>, fetchImpl?: typeof fetch }} [opts]
   */
  async function exportOtlpTraces(url, payload, opts) {
    opts = opts || {};
    try {
      if (!isValidOtlpUrl(url)) {
        return { exported: false, reason: "url_absent_or_invalid", status: null };
      }
      var safe = assertPayloadPhiSafe(payload);
      if (!safe.ok) {
        return {
          exported: false,
          reason: "payload_rejected:" + safe.error,
          status: null,
        };
      }

      var headers = { "Content-Type": "application/json" };
      var extra =
        opts.headers && typeof opts.headers === "object" ? opts.headers : {};
      var hk = Object.keys(extra);
      for (var i = 0; i < hk.length; i++) {
        var key = hk[i];
        if (typeof extra[key] === "string") headers[key] = extra[key];
      }

      var fetchFn = opts.fetchImpl || fetch;
      var res = await fetchFn(String(url).trim(), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
      });
      var status = res && typeof res.status === "number" ? res.status : null;
      return { exported: true, reason: "posted", status: status };
    } catch (_e) {
      return { exported: false, reason: "fetch_failed", status: null };
    }
  }

  /**
   * Parse opcional de AGHU_OTLP_HEADERS JSON → Record<string,string>.
   * @param {string|null|undefined} raw
   * @returns {Record<string, string>}
   */
  function parseOtlpHeaders(raw) {
    var text = raw == null ? "" : String(raw).trim();
    if (!text) return {};
    try {
      var obj = JSON.parse(text);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
      var out = {};
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (typeof obj[k] === "string") out[k] = obj[k];
      }
      return out;
    } catch (_e) {
      return {};
    }
  }

  return {
    SERVICE_NAME: SERVICE_NAME,
    SPAN_ATTR_ALLOWLIST: SPAN_ATTR_ALLOWLIST,
    FORBIDDEN_PAYLOAD_KEYS: FORBIDDEN_PAYLOAD_KEYS,
    isValidOtlpUrl: isValidOtlpUrl,
    hasForbiddenKeyDeep: hasForbiddenKeyDeep,
    sanitizeSpanAttributes: sanitizeSpanAttributes,
    buildTracePayload: buildTracePayload,
    spansFromStepTrace: spansFromStepTrace,
    assertPayloadPhiSafe: assertPayloadPhiSafe,
    exportOtlpTraces: exportOtlpTraces,
    parseOtlpHeaders: parseOtlpHeaders,
  };
});
