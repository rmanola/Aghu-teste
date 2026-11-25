/**
 * fields[] mínimos por card do dashboard (PERF3-AC-04).
 * Sempre pii; demais domínios só quando has_* === true.
 */

/** @typedef {{ exams?: boolean; controles?: boolean; prescricoes?: boolean; passometro?: boolean }} DashboardDomainFlags */

/**
 * @param {DashboardDomainFlags | null | undefined} flags
 * @returns {string[]}
 */
export function dashboardFieldsForRow(flags) {
  const fields = ["pii"];
  if (flags?.exams) fields.push("exams");
  if (flags?.controles) fields.push("controles");
  if (flags?.prescricoes) fields.push("prescricoes");
  return fields;
}

/**
 * Adapter snake_case (payload Edge) → dashboardFieldsForRow.
 * @param {{ has_exams?: boolean; has_controles?: boolean; has_prescricoes?: boolean }} meta
 * @returns {string[]}
 */
export function dashboardFieldsForPatientMeta(meta) {
  return dashboardFieldsForRow({
    exams: meta.has_exams,
    controles: meta.has_controles,
    prescricoes: meta.has_prescricoes,
  });
}
