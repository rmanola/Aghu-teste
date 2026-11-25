/**
 * Resolve o alvo de redirect único no índice Research do hub (sem PHI).
 * // HUB-AC redirect — uma navegação /research → form/entidade
 */

/**
 * @param {object} opts
 * @param {boolean} opts.showPicker
 * @param {Array<{ id: string }>} opts.enrolledProtocols
 * @param {string | null | undefined} opts.activeProtocolId
 * @param {(protocolId: string) => string | undefined} opts.getEnrollmentStatus
 * @returns {{ id: string } | null}
 */
export function resolveResearchHubRedirectTarget(opts) {
  const {
    showPicker,
    enrolledProtocols,
    activeProtocolId,
    getEnrollmentStatus,
  } = opts;
  if (showPicker) return null;
  if (!Array.isArray(enrolledProtocols) || !enrolledProtocols.length) {
    return null;
  }
  const triageOpen = enrolledProtocols.some((p) => {
    const status = typeof getEnrollmentStatus === "function"
      ? getEnrollmentStatus(p.id)
      : undefined;
    return status === "screened" || status === "eligible";
  });
  if (triageOpen) return null;
  const activeEnrolled = enrolledProtocols.find((p) => p.id === activeProtocolId);
  return activeEnrolled ?? enrolledProtocols[0] ?? null;
}
