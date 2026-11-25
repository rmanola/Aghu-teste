/**
 * Resumos de card do dashboard (lib/ — testável em Node; espelho em _shared/patient-summaries.ts).
 */

import { normalizeControles } from "../../web/lib/patient-records/normalize.mjs";
import { getLatestPrescricaoSnap } from "../../web/lib/patient-records/normalize-prescripcoes.mjs";

/**
 * @param {unknown} pii
 */
export function patientDisplayName(pii) {
  if (!pii || typeof pii !== "object") return "Paciente";
  const o = /** @type {Record<string, unknown>} */ (pii);
  return String(o.nomeCompleto || o.primeiroNome || "Paciente");
}

/**
 * @param {unknown} pii
 */
export function patientProntuario(pii) {
  if (!pii || typeof pii !== "object") return "—";
  return String(/** @type {Record<string, unknown>} */ (pii).prontuario || "—");
}

/**
 * @param {unknown} examsRaw
 */
export function listExamsFromArchive(examsRaw) {
  if (!examsRaw || typeof examsRaw !== "object") return [];
  const byKey =
    /** @type {Record<string, unknown>} */ (examsRaw).examsByKey || {};
  const rows = Object.values(byKey).filter((e) => e && typeof e === "object");
  return rows.sort((a, b) => {
    const ta = Number(/** @type {Record<string, unknown>} */ (a).extractedAt || 0);
    const tb = Number(/** @type {Record<string, unknown>} */ (b).extractedAt || 0);
    return tb - ta;
  });
}

/**
 * @param {unknown} examsRaw
 */
export function formatLatestExamLabel(examsRaw) {
  const list = listExamsFromArchive(examsRaw);
  const latest = list[0];
  if (!latest || typeof latest !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (latest);
  const label = row.dataColetaLabel ? ` (${row.dataColetaLabel})` : "";
  return `${row.examName || "Exame"}${label}`;
}

/**
 * @param {unknown} controlesRaw
 */
export function getLatestControlesEntry(controlesRaw) {
  const normalized = normalizeControles(controlesRaw);
  return normalized.entries[0] ?? null;
}

/**
 * @param {unknown} controlesRaw
 */
export function formatControlesPreview(controlesRaw) {
  const entry = getLatestControlesEntry(controlesRaw);
  if (!entry) return null;
  const preview = String(entry.texto ?? "").trim();
  const short =
    preview.length > 60 ? `${preview.slice(0, 60)}…` : preview || null;
  const n = typeof entry.n === "number" ? entry.n : 0;
  const meta = [entry.periodo || null, n > 0 ? `${n} reg.` : null]
    .filter(Boolean)
    .join(" · ");
  if (short) return meta ? `${meta} — ${short}` : short;
  return meta || null;
}

/**
 * @param {unknown} rx
 */
export function formatPrescricaoSummary(rx) {
  const snap = getLatestPrescricaoSnap(rx);
  if (!snap) {
    if (rx && typeof rx === "object") return "Prescrição sincronizada";
    return "";
  }
  const parts = [];
  if (snap.data) parts.push(String(snap.data));
  if (snap.dieta) parts.push(`Dieta: ${snap.dieta}`);
  if (Array.isArray(snap.antibiotico) && snap.antibiotico.length) {
    parts.push(`ATB: ${snap.antibiotico.join(", ")}`);
  }
  return parts.join(" · ") || "Prescrição sincronizada";
}

/**
 * @param {{
 *   record_client_id?: string;
 *   pii?: unknown;
 *   exams?: unknown;
 *   controles?: unknown;
 *   prescricoes?: unknown;
 *   hasExams?: boolean;
 *   hasControles?: boolean;
 *   hasPrescricoes?: boolean;
 * }} opts
 */
export function buildDashboardCardSummary(opts) {
  return {
    record_client_id: opts.record_client_id ?? "",
    nome: patientDisplayName(opts.pii),
    prontuario: patientProntuario(opts.pii),
    latestExamLabel: opts.hasExams ? formatLatestExamLabel(opts.exams) : null,
    controlesPreview: opts.hasControles
      ? formatControlesPreview(opts.controles)
      : null,
    prescricaoPreview: opts.hasPrescricoes
      ? formatPrescricaoSummary(opts.prescricoes)
      : null,
    locked: false,
  };
}

export function buildLockedDashboardCard(recordClientId, lockReason = "staff_extra") {
  return {
    record_client_id: recordClientId,
    locked: true,
    lockReason,
    nome: lockReason === "plan_limit" ? "Limite do plano" : "Paciente extra",
    prontuario: "—",
    latestExamLabel: null,
    controlesPreview: null,
    prescricaoPreview: null,
  };
}
