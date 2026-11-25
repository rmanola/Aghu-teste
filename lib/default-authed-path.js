/**
 * Destino pós-login (paridade web/lib/auth/default-authed-path.ts).
 * Allowlist via AGHU_ADMIN_USER_IDS — testável em Node.
 */
"use strict";

function parseAdminUserIds(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isAdminUserId(userId, rawAllowlist) {
  const ids = parseAdminUserIds(
    rawAllowlist !== undefined ? rawAllowlist : process.env.AGHU_ADMIN_USER_IDS,
  );
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

function defaultAuthedPath(userId, rawAllowlist) {
  return isAdminUserId(userId, rawAllowlist) ? "/admin" : "/pacientes";
}

module.exports = {
  parseAdminUserIds,
  isAdminUserId,
  defaultAuthedPath,
};
