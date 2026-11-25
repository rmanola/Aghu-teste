/**
 * Contrato get-dashboard-patient-summaries (PERF-AC-09).
 */

import { dashboardFieldsForPatientMeta } from "./dashboard-fields.mjs";

export const MAX_DASHBOARD_PATIENTS = 20;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 */
export function isRecordClientUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * @param {unknown} patients
 * @returns {{ ok: true; patients: Array<{ record_client_id: string; has_exams?: boolean; has_controles?: boolean; has_prescricoes?: boolean }> } | { ok: false }}
 */
export function normalizeDashboardPatientsRequest(patients) {
  if (!Array.isArray(patients) || patients.length === 0) {
    return { ok: false };
  }

  const filtered = patients
    .filter(
      (p) =>
        !!p &&
        typeof p === "object" &&
        isRecordClientUuid(
          /** @type {{ record_client_id?: unknown }} */ (p).record_client_id,
        ),
    )
    .slice(0, MAX_DASHBOARD_PATIENTS)
    .map((p) => {
      const row = /** @type {Record<string, unknown>} */ (p);
      return {
        record_client_id: String(row.record_client_id),
        has_exams: !!row.has_exams,
        has_controles: !!row.has_controles,
        has_prescricoes: !!row.has_prescricoes,
      };
    });

  if (filtered.length === 0) {
    return { ok: false };
  }

  return { ok: true, patients: filtered };
}

/**
 * @param {{ has_exams?: boolean; has_controles?: boolean; has_prescricoes?: boolean }} meta
 * @returns {string[]}
 */
export function fieldsForDashboardPatient(meta) {
  return dashboardFieldsForPatientMeta(meta);
}

/**
 * @param {Array<{ record_client_id: string; hasExams?: boolean; hasControles?: boolean; hasPrescricoes?: boolean }>} rows
 */
export function buildDashboardSummariesRequestBody(rows) {
  return {
    patients: rows.map((row) => ({
      record_client_id: row.record_client_id,
      has_exams: !!row.hasExams,
      has_controles: !!row.hasControles,
      has_prescricoes: !!row.hasPrescricoes,
    })),
  };
}
