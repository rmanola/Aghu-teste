/**
 * Envio de feedback de produto via Edge Function submit-product-feedback.
 */
(function () {
  "use strict";

  function payloadApi() {
    return window.AghuProductFeedbackPayload;
  }

  function configApi() {
    return window.AghuSupabaseConfig;
  }

  function authApi() {
    return window.AghuSupabaseAuth;
  }

  /**
   * @param {object} input
   * @param {string} input.kind
   * @param {string} input.description
   * @param {string} [input.title]
   * @param {string} [input.page_path]
   * @param {string} [input.page_url]
   * @param {string | null} [input.record_client_id]
   * @returns {Promise<{ ok: true, id: string } | { ok: false, error: string, httpStatus?: number }>}
   */
  async function submitProductFeedback(input) {
    var cfg = configApi();
    var auth = authApi();
    var validate = payloadApi();
    if (!cfg || !auth || !validate) {
      return { ok: false, error: "modules_missing" };
    }
    if (!cfg.isConfigured || !cfg.isConfigured()) {
      return { ok: false, error: "config_not_configured" };
    }

    var token = await auth.getAccessToken();
    if (!token) {
      return { ok: false, error: "missing_bearer_token" };
    }

    var body = {
      kind: input.kind,
      description: input.description,
      title: input.title || null,
      platform: "extension",
      page_path: input.page_path || null,
      page_url: input.page_url || null,
      record_client_id: input.record_client_id || null,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : null,
      app_version:
        typeof browser !== "undefined" && browser.runtime.getManifest
          ? browser.runtime.getManifest().version
          : null,
    };

    var validated = validate.validateProductFeedbackPayload(body);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    var url =
      typeof cfg.getSubmitProductFeedbackUrl === "function"
        ? cfg.getSubmitProductFeedbackUrl()
        : cfg.getUrl() + "/functions/v1/submit-product-feedback";

    var res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validated.data),
      });
    } catch (_e) {
      return { ok: false, error: "network_error" };
    }

    var json = {};
    try {
      json = await res.json();
    } catch (_e2) {
      json = {};
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "submit_failed",
        httpStatus: res.status,
      };
    }

    return { ok: true, id: String(json.id || "") };
  }

  window.AghuProductFeedbackSubmit = {
    submitProductFeedback: submitProductFeedback,
  };
})();
