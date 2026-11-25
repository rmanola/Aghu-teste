/**
 * Classificação de slots de pacientes (incluído vs extra) — fonte pura para testes e extensão.
 * Os N mais recentes (updated_at DESC) ficam incluídos; restantes são extra.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuPatientSlots = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STAFF_INCLUDED_LIMIT = 20;
  var STAFF_OVERAGE_UNIT_CENTS = 500;

  /** @typedef {'included'|'extra'} PatientSlotKind */
  /** @typedef {'accepted'|'declined'|null} StaffOverageConsent */

  function recentSortKey(patient) {
    var updated = patient.updated_at || patient.created_at;
    return new Date(updated).getTime();
  }

  function classifyPatientSlots(patients, includedLimit) {
    var limit = typeof includedLimit === "number" ? includedLimit : STAFF_INCLUDED_LIMIT;
    var sorted = (patients || []).slice().sort(function (a, b) {
      var diff = recentSortKey(b) - recentSortKey(a);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted.map(function (p, index) {
      return {
        record_client_id: p.record_client_id,
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
        slot: index < limit ? "included" : "extra",
      };
    });
  }

  /**
   * @param {string} recordClientId
   * @param {{ record_client_id: string, slot: PatientSlotKind }[]} slots
   * @returns {PatientSlotKind|null}
   */
  function getPatientSlot(recordClientId, slots) {
    for (var i = 0; i < (slots || []).length; i++) {
      if (slots[i].record_client_id === recordClientId) return slots[i].slot;
    }
    return null;
  }

  /**
   * @param {StaffOverageConsent} consent
   * @param {PatientSlotKind|null} slot
   */
  function isExtraPatientReadable(consent, slot) {
    if (slot !== "extra") return true;
    return consent === "accepted";
  }

  /**
   * @param {string} plan
   * @param {StaffOverageConsent} consent
   * @param {PatientSlotKind|null} slot
   */
  function assertPatientReadable(plan, consent, slot) {
    if (plan === "research") return { ok: true };
    if (slot !== "extra") return { ok: true };
    if (plan === "staff" && consent === "accepted") return { ok: true };
    if (plan === "staff") {
      return {
        ok: false,
        code: "patient_access_locked",
        status: 403,
        reason: "staff_extra",
        message:
          "Paciente extra bloqueado — aceite a cobrança adicional ou remova pacientes até o limite incluído.",
      };
    }
    return {
      ok: false,
      code: "patient_access_locked",
      status: 403,
      reason: "plan_limit",
      message:
        "Limite do plano atingido — faça upgrade ou remova pacientes para aceder a este prontuário.",
    };
  }

  /**
   * @param {string} plan
   * @param {StaffOverageConsent} consent
   * @param {boolean} isNewPatient
   * @param {number} currentCount
   * @param {PatientSlotKind|null} slot
   * @param {{ includedLimit?: number, extraPatientIds?: string[] }} [opts]
   */
  function assertPatientUpsertAllowed(
    plan,
    consent,
    isNewPatient,
    currentCount,
    slot,
    opts,
  ) {
    var includedLimit =
      opts && typeof opts.includedLimit === "number"
        ? opts.includedLimit
        : STAFF_INCLUDED_LIMIT;
    var extraPatientIds =
      opts && Array.isArray(opts.extraPatientIds) ? opts.extraPatientIds : [];

    if (plan === "research") return { ok: true };

    if (plan !== "staff") {
      return { ok: true };
    }

    if (!isNewPatient) return { ok: true };

    if (currentCount < includedLimit) return { ok: true };

    if (consent === "accepted") return { ok: true };

    return {
      ok: false,
      code: "patient_overage_consent_required",
      status: 402,
      message:
        "Limite de pacientes incluídos atingido. Aceite a cobrança de R$ 5/mês por paciente extra para sincronizar.",
      payload: {
        includedLimit: includedLimit,
        patientCount: currentCount,
        overageCents: STAFF_OVERAGE_UNIT_CENTS,
        extraPatients: extraPatientIds,
      },
    };
  }

  /**
   * @param {string} plan
   * @param {StaffOverageConsent} consent
   * @param {number} patientCount
   * @param {number} [includedLimit]
   */
  function buildOverageStatus(plan, consent, patientCount, includedLimit) {
    if (plan !== "staff") return null;
    var limit =
      typeof includedLimit === "number" ? includedLimit : STAFF_INCLUDED_LIMIT;
    var extraCount = Math.max(0, patientCount - limit);
    var lockedCount = consent === "accepted" ? 0 : extraCount;
    var consentOut = consent;
    if (patientCount > limit && consent !== "accepted") {
      consentOut = consent === "declined" ? "declined" : "required";
    }
    var canSyncNewPatient = patientCount < limit || consent === "accepted";
    return {
      consent: consentOut,
      includedLimit: limit,
      patientCount: patientCount,
      extraCount: extraCount,
      lockedCount: lockedCount,
      unitCents: STAFF_OVERAGE_UNIT_CENTS,
      canSyncNewPatient: canSyncNewPatient,
    };
  }

  function extraPatientIdsFromSlots(slots) {
    return (slots || [])
      .filter(function (s) {
        return s.slot === "extra";
      })
      .map(function (s) {
        return s.record_client_id;
      });
  }

  return {
    STAFF_INCLUDED_LIMIT: STAFF_INCLUDED_LIMIT,
    STAFF_OVERAGE_UNIT_CENTS: STAFF_OVERAGE_UNIT_CENTS,
    classifyPatientSlots: classifyPatientSlots,
    getPatientSlot: getPatientSlot,
    isExtraPatientReadable: isExtraPatientReadable,
    assertPatientReadable: assertPatientReadable,
    assertPatientUpsertAllowed: assertPatientUpsertAllowed,
    buildOverageStatus: buildOverageStatus,
    extraPatientIdsFromSlots: extraPatientIdsFromSlots,
  };
});
