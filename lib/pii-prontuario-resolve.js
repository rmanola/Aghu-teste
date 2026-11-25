/**
 * Resolve prontuário canónico vs placeholders (UUID, web_*, record_client_id).
 * Testável em Node; extensão: global AghuPiiProntuarioResolve.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuPiiProntuarioResolve = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function identityApi() {
    if (typeof globalThis !== "undefined" && globalThis.AghuPatientIdentity) {
      return globalThis.AghuPatientIdentity;
    }
    if (typeof require === "function") {
      try {
        return require("./patient-identity.js");
      } catch (_e) {}
    }
    return null;
  }

  function normalizeProntuario(raw) {
    var id = identityApi();
    if (id && id.normalizeProntuario) return id.normalizeProntuario(raw);
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  function isUuidLike(value) {
    return UUID_RE.test(str(value));
  }

  function isWebSyntheticKey(value) {
    return /^web_[0-9a-f]{8}$/i.test(str(value));
  }

  /**
   * @param {string} value
   * @param {{ recordClientId?: string, patientKey?: string } | undefined} opts
   */
  function isPlaceholderProntuario(value, opts) {
    opts = opts || {};
    var v = str(value);
    if (!v) return true;
    if (isUuidLike(v)) return true;
    if (opts.recordClientId && v === str(opts.recordClientId)) return true;
    if (isWebSyntheticKey(v)) return true;
    var pk = str(opts.patientKey);
    if (pk && v === pk && (isUuidLike(pk) || isWebSyntheticKey(pk))) return true;
    return false;
  }

  /**
   * @param {object | null | undefined} pii
   * @param {string} [recordClientId]
   */
  function resolveCanonicalProntuario(pii, recordClientId) {
    if (!pii || typeof pii !== "object") return "";
    var opts = { recordClientId: recordClientId || "" };
    var candidates = [pii.prontuario, pii.patientKey];
    for (var i = 0; i < candidates.length; i++) {
      var raw = str(candidates[i]);
      if (!raw || isPlaceholderProntuario(raw, opts)) continue;
      var norm = normalizeProntuario(raw);
      if (norm && !isPlaceholderProntuario(norm, opts)) return norm;
    }
    return "";
  }

  /**
   * Chave de paciente para sync/upsert — nunca UUID completo como prontuário.
   * @param {object | null | undefined} pii
   * @param {string} recordClientId
   */
  function resolvePatientKeyForUpsert(pii, recordClientId) {
    var pront = resolveCanonicalProntuario(pii, recordClientId);
    if (pront) {
      var id = identityApi();
      if (id && id.buildPatientKey) {
        var built = id.buildPatientKey(pront);
        if (built) return built;
      }
      return pront;
    }
    var pk = pii && typeof pii === "object" ? str(pii.patientKey) : "";
    if (pk && !isUuidLike(pk) && !isWebSyntheticKey(pk)) return pk;
    if (recordClientId) return "web_" + str(recordClientId).slice(0, 8);
    return pk || "";
  }

  return {
    isPlaceholderProntuario: isPlaceholderProntuario,
    resolveCanonicalProntuario: resolveCanonicalProntuario,
    resolvePatientKeyForUpsert: resolvePatientKeyForUpsert,
    isUuidLike: isUuidLike,
    isWebSyntheticKey: isWebSyntheticKey,
  };
});
