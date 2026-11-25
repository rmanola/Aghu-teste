/**
 * Validação do payload submit-product-feedback (extensão + testes Node).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProductFeedbackPayload = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FEEDBACK_DESCRIPTION_MIN = 20;
  var FEEDBACK_DESCRIPTION_MAX = 4000;
  var FEEDBACK_TITLE_MAX = 120;
  var FEEDBACK_RATE_LIMIT_PER_HOUR = 10;
  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isValidUuid(s) {
    return UUID_RE.test(String(s || ""));
  }

  function trimOrNull(value, maxLen) {
    if (value == null) return null;
    var s = String(value).trim();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }

  /**
   * @param {Record<string, unknown>} body
   * @returns {{ ok: true, data: object } | { ok: false, error: string }}
   */
  function validateProductFeedbackPayload(body) {
    body = body && typeof body === "object" ? body : {};
    var kind = body.kind;
    if (kind !== "bug" && kind !== "feature") {
      return { ok: false, error: "invalid_kind" };
    }

    var platform = body.platform;
    if (platform !== "web" && platform !== "extension") {
      return { ok: false, error: "invalid_platform" };
    }

    var descriptionRaw =
      typeof body.description === "string" ? body.description.trim() : "";
    if (descriptionRaw.length < FEEDBACK_DESCRIPTION_MIN) {
      return { ok: false, error: "description_too_short" };
    }
    if (descriptionRaw.length > FEEDBACK_DESCRIPTION_MAX) {
      return { ok: false, error: "description_too_long" };
    }

    var recordClientId = null;
    if (body.record_client_id != null && body.record_client_id !== "") {
      var rid = String(body.record_client_id).trim();
      if (!isValidUuid(rid)) {
        return { ok: false, error: "invalid_record_client_id" };
      }
      recordClientId = rid;
    }

    return {
      ok: true,
      data: {
        kind: kind,
        description: descriptionRaw,
        title: trimOrNull(body.title, FEEDBACK_TITLE_MAX),
        platform: platform,
        page_path: trimOrNull(body.page_path, 512),
        page_url: trimOrNull(body.page_url, 2048),
        record_client_id: recordClientId,
        user_agent: trimOrNull(body.user_agent, 512),
        app_version: trimOrNull(body.app_version, 64),
      },
    };
  }

  /**
   * Extrai record_client_id de pathname web (/pacientes/:uuid/...).
   * @param {string} pathname
   * @returns {string | null}
   */
  function recordClientIdFromPathname(pathname) {
    var m = String(pathname || "").match(
      /^\/pacientes\/([0-9a-f-]{36})(?:\/|$)/i,
    );
    if (!m) return null;
    return isValidUuid(m[1]) ? m[1] : null;
  }

  /**
   * URL sem hash (evita tokens SSO no fragmento).
   * @param {string} href
   * @returns {{ page_path: string, page_url: string }}
   */
  function pageContextFromHref(href) {
    try {
      var u = new URL(href, "https://local.invalid");
      return {
        page_path: u.pathname || "/",
        page_url: u.origin + u.pathname + u.search,
      };
    } catch (_e) {
      return { page_path: "/", page_url: "" };
    }
  }

  return {
    FEEDBACK_DESCRIPTION_MIN: FEEDBACK_DESCRIPTION_MIN,
    FEEDBACK_DESCRIPTION_MAX: FEEDBACK_DESCRIPTION_MAX,
    FEEDBACK_TITLE_MAX: FEEDBACK_TITLE_MAX,
    FEEDBACK_RATE_LIMIT_PER_HOUR: FEEDBACK_RATE_LIMIT_PER_HOUR,
    isValidUuid: isValidUuid,
    validateProductFeedbackPayload: validateProductFeedbackPayload,
    recordClientIdFromPathname: recordClientIdFromPathname,
    pageContextFromHref: pageContextFromHref,
  };
});
