/**
 * FEAT-078 R1 — webhook de alertas Tier 3 (Slack-compatible / JSON).
 * Só metadados allowlist; zero PHI (proposal/messages/patient/…).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuAgentAlertWebhook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Chaves exactas proibidas no payload (não substring). */
  var FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
    "prompt",
    "proposal",
    "messages",
    "patient",
    "prontuario",
    "pii",
    "laudo",
    "ciphertext",
    "body",
    "content",
  ]);

  /** Campos permitidos por alerta no body. */
  var ALERT_ALLOWLIST = Object.freeze([
    "agent",
    "code",
    "tuple_id",
    "message",
    "n",
    "rates",
    "severity",
  ]);

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
      var key = keys[k];
      var lower = key.toLowerCase();
      for (var f = 0; f < FORBIDDEN_PAYLOAD_KEYS.length; f++) {
        if (lower === FORBIDDEN_PAYLOAD_KEYS[f]) return true;
      }
      if (hasForbiddenKeyDeep(value[key])) return true;
    }
    return false;
  }

  /**
   * @param {Record<string, unknown>} alert
   * @param {string} [agent]
   * @returns {Record<string, unknown>}
   */
  function sanitizeAlert(alert, agent) {
    var src = alert && typeof alert === "object" ? alert : {};
    var out = {};
    if (agent) out.agent = String(agent);
    if (src.code != null) out.code = String(src.code);
    else if (src.severity != null && src.code == null && src.message) {
      /* keep code optional */
    }
    if (src.tuple_id != null) out.tuple_id = String(src.tuple_id);
    if (src.message != null) out.message = String(src.message).slice(0, 280);
    if (src.n != null && isFinite(Number(src.n))) out.n = Number(src.n);
    if (src.rates != null && typeof src.rates === "object" && !Array.isArray(src.rates)) {
      var rates = {};
      if (src.rates.success_rate != null && isFinite(Number(src.rates.success_rate))) {
        rates.success_rate = Number(src.rates.success_rate);
      }
      if (src.rates.error_rate != null && isFinite(Number(src.rates.error_rate))) {
        rates.error_rate = Number(src.rates.error_rate);
      }
      if (Object.keys(rates).length) out.rates = rates;
    }
    if (src.severity != null) out.severity = String(src.severity);
    if (src.agent != null && !out.agent) out.agent = String(src.agent);

    // Strip anything outside allowlist (defense in depth).
    var clean = {};
    for (var i = 0; i < ALERT_ALLOWLIST.length; i++) {
      var ak = ALERT_ALLOWLIST[i];
      if (Object.prototype.hasOwnProperty.call(out, ak)) clean[ak] = out[ak];
    }
    return clean;
  }

  /**
   * @param {Array<Record<string, unknown>>} alerts
   * @param {{ agent?: string }} [opts]
   * @returns {{ text: string, alerts: Array<Record<string, unknown>> }}
   */
  function buildWebhookPayload(alerts, opts) {
    opts = opts || {};
    var agent = opts.agent ? String(opts.agent) : "agent";
    var list = Array.isArray(alerts) ? alerts : [];
    var safe = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].severity !== "fail") continue;
      safe.push(sanitizeAlert(list[i], agent));
    }
    var codes = safe
      .map(function (a) {
        return a.code || "?";
      })
      .slice(0, 12);
    var text =
      "[AGHU tier3] " +
      agent +
      " fail alerts (" +
      safe.length +
      "): " +
      (codes.length ? codes.join(", ") : "none");
    return { text: text, alerts: safe };
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
   * POST webhook; sem URL → notified:false (não falha o cron).
   * @param {string|null|undefined} webhookUrl
   * @param {Array<Record<string, unknown>>} alerts
   * @param {{ agent?: string, fetchImpl?: typeof fetch }} [opts]
   */
  async function postAgentAlertWebhook(webhookUrl, alerts, opts) {
    opts = opts || {};
    var url = webhookUrl == null ? "" : String(webhookUrl).trim();
    if (!url) {
      return { notified: false, reason: "url_absent", status: null };
    }

    var fails = (Array.isArray(alerts) ? alerts : []).filter(function (a) {
      return a && a.severity === "fail";
    });
    if (!fails.length) {
      return { notified: false, reason: "no_fail_alerts", status: null };
    }

    var body = buildWebhookPayload(fails, { agent: opts.agent });
    var safeCheck = assertPayloadPhiSafe(body);
    if (!safeCheck.ok) {
      return {
        notified: false,
        reason: "payload_rejected:" + safeCheck.error,
        status: null,
      };
    }

    var fetchFn = opts.fetchImpl || fetch;
    var res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var status = res && typeof res.status === "number" ? res.status : null;
    return {
      notified: true,
      reason: "posted",
      status: status,
      alertCount: body.alerts.length,
    };
  }

  return {
    FORBIDDEN_PAYLOAD_KEYS: FORBIDDEN_PAYLOAD_KEYS,
    ALERT_ALLOWLIST: ALERT_ALLOWLIST,
    sanitizeAlert: sanitizeAlert,
    buildWebhookPayload: buildWebhookPayload,
    assertPayloadPhiSafe: assertPayloadPhiSafe,
    postAgentAlertWebhook: postAgentAlertWebhook,
    hasForbiddenKeyDeep: hasForbiddenKeyDeep,
  };
});
