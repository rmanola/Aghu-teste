/**
 * Validates `next` query param for auth callback redirects (open-redirect guard).
 * @param {string | null | undefined} next
 * @returns {string}
 */
function safeRedirectPath(next) {
  var DEFAULT_PATH = "/pacientes";
  if (!next || typeof next !== "string") return DEFAULT_PATH;
  var trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_PATH;
  }
  if (trimmed.indexOf("\\") !== -1 || trimmed.indexOf("\0") !== -1) {
    return DEFAULT_PATH;
  }
  try {
    var parsed = new URL(trimmed, "http://local.test");
    if (parsed.origin !== "http://local.test") return DEFAULT_PATH;
  } catch (_e) {
    return DEFAULT_PATH;
  }
  return trimmed;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { safeRedirectPath: safeRedirectPath };
}
