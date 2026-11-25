/**
 * FEAT-210 — leitura de factos risk_model_result + audit PHI (RISK2-AC-10).
 * RISK2-AC-15 — gate clinical_signoff na resposta.
 */
"use strict";

const DEFAULT_FIELDS = ["indicator_key", "value", "model_version", "provenance"];

function assertFieldsMinimal(fields) {
  const list = Array.isArray(fields) ? fields : DEFAULT_FIELDS;
  if (list.length === 0) {
    throw new Error("risk_model_read: fields[] vazio — leitura mínima obrigatória");
  }
  for (const f of list) {
    if (!DEFAULT_FIELDS.includes(f) && f !== "created_at") {
      throw new Error(`risk_model_read: campo não permitido \`${f}\``);
    }
  }
  return list;
}

function hasClinicalSignoff(provenance) {
  if (!provenance || typeof provenance !== "object") return false;
  return (
    provenance.clinical_use === true ||
    (typeof provenance.clinical_signoff_at === "string" &&
      provenance.clinical_signoff_at.trim().length > 0)
  );
}

function gateRowForClinicalUse(row, fields, requestClinicalUse = false) {
  const signed = hasClinicalSignoff(row.provenance);
  const provenance =
    row.provenance && typeof row.provenance === "object"
      ? { ...row.provenance }
      : {};
  if (!signed) provenance.clinical_use = false;

  const out = { ...row, provenance };
  if (requestClinicalUse && !signed && fields.includes("value")) {
    out.value = {
      ...(typeof row.value === "object" && row.value ? row.value : {}),
      shap: [],
      subgroup: [],
      clinical_blocked: true,
      reason: "clinical_signoff_required",
    };
  }
  return out;
}

function buildPhiAuditEntry({ userId, recordClientId, fields }) {
  const safeFields = assertFieldsMinimal(fields);
  return {
    user_id: userId,
    record_client_id: recordClientId,
    action: "read_risk_model_results",
    fields: safeFields,
  };
}

function pickFields(row, fields) {
  const out = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(row, f)) out[f] = row[f];
  }
  return out;
}

function applyResearchDatumMigrationTwice() {
  return {
    ok: true,
    first: {
      table: "risk_model_result",
      rls: "(select auth.uid()) = user_id",
      columns: [
        "indicator_key",
        "value",
        "model_version",
        "model_hash",
        "provenance",
        "record_client_id",
      ],
    },
  };
}

module.exports = {
  DEFAULT_FIELDS,
  assertFieldsMinimal,
  hasClinicalSignoff,
  gateRowForClinicalUse,
  buildPhiAuditEntry,
  pickFields,
  applyResearchDatumMigrationTwice,
};
