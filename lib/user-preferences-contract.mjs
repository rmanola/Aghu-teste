/**
 * Contrato user-preferences (espelho de supabase/functions/user-preferences/index.ts).
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const analysisPromptTemplates = require("./patient-analysis-prompt-templates.js");
const studyProtocol = require("./hpb-study-protocol.js");
const clinicalAlerts = require("./clinical-alert-preferences-contract.mjs");

export const USER_PREFERENCE_DOMAINS = new Set([
  "exam_visibility",
  "passometro_template",
  "monitoring_scores",
  "prescriber_profile",
  "receita_templates",
  "alta_text_templates",
  "analise_templates",
  "analysis_prompt_templates",
  "study_protocols",
  "clinical_alerts",
  "extension_settings",
]);

/**
 * @param {unknown} domain
 * @returns {boolean}
 */
export function isUserPreferenceDomain(domain) {
  return typeof domain === "string" && USER_PREFERENCE_DOMAINS.has(domain);
}

/**
 * @param {unknown} payload
 */
export function isValidExtensionSettingsPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const p = /** @type {{ service_line?: unknown; location_line?: unknown; pa_format?: unknown }} */ (
    payload
  );
  if (typeof p.service_line !== "string" || p.service_line.length > 200) {
    return false;
  }
  if (typeof p.location_line !== "string" || p.location_line.length > 200) {
    return false;
  }
  if (p.pa_format !== "minmax" && p.pa_format !== "sequence") return false;
  return true;
}

/**
 * @param {unknown} body
 */
export function isValidWriteBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    /** @type {{ action?: unknown }} */ (body).action !== "write"
  ) {
    return false;
  }
  const { domain, payload } = /** @type {{ domain?: unknown; payload?: unknown }} */ (
    body
  );
  if (!isUserPreferenceDomain(domain)) return false;

  if (domain === "exam_visibility") {
    return Array.isArray(
      /** @type {{ hidden_row_keys?: unknown }} */ (payload)?.hidden_row_keys,
    );
  }
  if (domain === "passometro_template") {
    const template = /** @type {{ template?: unknown }} */ (payload)?.template;
    return !!template && typeof template === "object";
  }
  if (domain === "monitoring_scores") {
    const p = /** @type {{ enabled_calculator_ids?: unknown; calculator_order?: unknown }} */ (
      payload
    );
    return (
      Array.isArray(p?.enabled_calculator_ids) &&
      Array.isArray(p?.calculator_order)
    );
  }
  if (domain === "prescriber_profile") {
    const profile = /** @type {{ profile?: unknown }} */ (payload)?.profile;
    return !!profile && typeof profile === "object";
  }
  if (domain === "receita_templates") {
    const templates = /** @type {{ templates?: unknown }} */ (payload)?.templates;
    return !!templates && typeof templates === "object";
  }
  if (domain === "alta_text_templates") {
    const templates = /** @type {{ templates?: unknown }} */ (payload)?.templates;
    return !!templates && typeof templates === "object";
  }
  if (domain === "analise_templates") {
    const templates = /** @type {{ templates?: unknown }} */ (payload)?.templates;
    return !!templates && typeof templates === "object";
  }
  if (domain === "analysis_prompt_templates") {
    return analysisPromptTemplates.isValidWritePayload(payload);
  }
  if (domain === "study_protocols") {
    return studyProtocol.isValidWritePayload(payload);
  }
  if (domain === "clinical_alerts") {
    return clinicalAlerts.isValidClinicalAlertsWritePayload(payload);
  }
  if (domain === "extension_settings") {
    return isValidExtensionSettingsPayload(payload);
  }
  return false;
}

/**
 * @param {unknown} body
 * @returns {string[]}
 */
export function normalizeReadDomains(body) {
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(/** @type {{ domains?: unknown }} */ (body).domains)
  ) {
    return [...USER_PREFERENCE_DOMAINS];
  }
  return /** @type {{ domains: unknown[] }} */ (body).domains.filter(
    (d) => typeof d === "string" && isUserPreferenceDomain(d),
  );
}

/**
 * @param {unknown} body
 */
export function buildWritePreferenceBody(domain, payload) {
  return { action: "write", domain, payload };
}

/**
 * @param {string[]} domains
 */
export function buildReadPreferenceBody(domains) {
  return { action: "read", domains };
}
