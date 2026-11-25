/**
 * Contrato clinical_alerts para user-preferences (espelho Edge).
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  isValidAlertConfigPayload,
  sanitizeAlertConfig,
  defaultAlertConfig,
} = require("../../web/lib/clinical/clinical-alert-rule-schema.mjs");

export { isValidAlertConfigPayload, sanitizeAlertConfig, defaultAlertConfig };

/**
 * @param {unknown} payload
 */
export function isValidClinicalAlertsWritePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = /** @type {{ scope?: unknown; config?: unknown }} */ (payload);
  if (p.scope !== "user" && p.scope !== "workspace") return false;
  return isValidAlertConfigPayload(p.config);
}

/**
 * @param {"user"|"workspace"} scope
 * @param {unknown} config
 */
export function buildClinicalAlertsWritePayload(scope, config) {
  return { scope, config: sanitizeAlertConfig(config) };
}

// ---------------------------------------------------------------------------
// FEAT-128 — preferência de alertas CPI
// ---------------------------------------------------------------------------

/**
 * As duas categorias são deliberadamente separadas e não partilham schema nem
 * configuração. A FEAT-015 alerta sobre **um doente** e é accionável agora; a
 * FEAT-128 alerta sobre **um processo** e é accionável numa reunião. Misturá-las
 * poria uma questão de gestão da qualidade a competir com um agravamento
 * clínico na mesma caixa — e quem desligasse o ruído de uma desligaria a outra.
 */
export const ALERT_PREFERENCE_CATEGORIES = Object.freeze({
  /** FEAT-015 — monitorização clínica ao nível do doente. */
  CLINICAL_PATIENT: "clinical_patient_alerts",
  /** FEAT-128 — sinal de causa especial ao nível do processo. */
  CPI_PROCESS_SIGNALS: "cpi_process_signals",
});

/** Cadência do alerta de processo: o ciclo do comité, não o turno. */
export const CPI_ALERT_CADENCES = Object.freeze(["monthly", "quarterly", "off"]);

/**
 * Por omissão activo, mensal, sem estratos de pares: mesmo quem tem
 * `view_peer_performance` recebe o alerta de linha antes do de estrato — o
 * estrato é uma escolha explícita, não um default.
 */
export function defaultCpiAlertPreferences() {
  return {
    enabled: true,
    cadence: "monthly",
    careLineIds: [],
    includePeerStrata: false,
  };
}

/** @param {unknown} input */
export function sanitizeCpiAlertPreferences(input) {
  const base = defaultCpiAlertPreferences();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;
  const p = /** @type {Record<string, unknown>} */ (input);
  const cadence =
    typeof p.cadence === "string" && CPI_ALERT_CADENCES.includes(p.cadence)
      ? p.cadence
      : base.cadence;
  const careLineIds = Array.isArray(p.careLineIds)
    ? p.careLineIds
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => /** @type {string} */ (id).trim())
    : base.careLineIds;
  return {
    enabled: p.enabled === undefined ? base.enabled : p.enabled === true,
    cadence,
    careLineIds,
    includePeerStrata: p.includePeerStrata === true,
  };
}

/** @param {unknown} payload */
export function isValidCpiAlertPreferences(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = /** @type {Record<string, unknown>} */ (payload);
  if (typeof p.enabled !== "boolean") return false;
  if (typeof p.cadence !== "string" || !CPI_ALERT_CADENCES.includes(p.cadence)) {
    return false;
  }
  if (!Array.isArray(p.careLineIds)) return false;
  if (p.careLineIds.some((id) => typeof id !== "string")) return false;
  return typeof p.includePeerStrata === "boolean";
}

/**
 * @param {"user"|"workspace"} scope
 * @param {unknown} preferences
 */
export function buildCpiAlertsWritePayload(scope, preferences) {
  return {
    scope,
    category: ALERT_PREFERENCE_CATEGORIES.CPI_PROCESS_SIGNALS,
    preferences: sanitizeCpiAlertPreferences(preferences),
  };
}
