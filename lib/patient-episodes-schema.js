/**
 * Episódios clínicos do paciente (domínio patient_episodes) — independente de HPB/Research.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  // Sempre espelhar no global — o bundle Edge (Deno) tem `module` mas não
  // `require`, e consumidores UMD (interop-merge) leem via globalThis.
  root.AghuPatientEpisodesSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 1;
  var VALID_KINDS = ["hospitalization", "ambulatory", "other"];
  var VALID_STATUSES = ["active", "closed"];
  var VALID_ICU_KINDS = ["planned", "unplanned"];

  function nowIso() {
    return new Date().toISOString();
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function randomSuffix() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 8);
    }
    return String(Math.random()).slice(2, 10);
  }

  function newEpisodeId() {
    return "pe-" + randomSuffix();
  }

  function newDiagnosisId() {
    return "pd-" + randomSuffix();
  }

  function newComplicationId() {
    return "pc-" + randomSuffix();
  }

  function newIcuAdmissionId() {
    return "icu-" + randomSuffix();
  }

  function emptySnapshot() {
    return {
      version: VERSION,
      entries: [],
      atualizadoEm: null,
    };
  }

  function emptyDeath() {
    return { occurred: false, date: null };
  }

  function normalizeKind(raw) {
    var k = str(raw).toLowerCase();
    if (VALID_KINDS.indexOf(k) !== -1) return k;
    return "other";
  }

  function normalizeStatus(raw) {
    var s = str(raw).toLowerCase();
    if (VALID_STATUSES.indexOf(s) !== -1) return s;
    return "active";
  }

  function normalizeDiagnosisItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var texto = str(raw.texto).slice(0, 500);
    if (!texto) return null;
    return {
      id: str(raw.id) || newDiagnosisId(),
      data: str(raw.data).slice(0, 32),
      texto: texto,
    };
  }

  function normalizeDiagnoses(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var item = normalizeDiagnosisItem(raw[i]);
      if (item) out.push(item);
    }
    return out;
  }

  /**
   * Fail-fast na escrita: diagnóstico com texto exige data (QUAL / dashboard).
   * Leitura via normalizeSnapshot permanece permissiva para legado undated.
   */
  function assertDiagnosesHaveDates(diagnoses) {
    var list = Array.isArray(diagnoses) ? diagnoses : [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d) continue;
      if (str(d.texto) && !str(d.data)) {
        throw new Error("diagnosis_date_required");
      }
    }
  }

  function normalizeComplicationItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var texto = str(raw.texto).slice(0, 500);
    if (!texto) return null;
    return {
      id: str(raw.id) || newComplicationId(),
      data: str(raw.data).slice(0, 32),
      texto: texto,
    };
  }

  function normalizeComplications(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var item = normalizeComplicationItem(raw[i]);
      if (item) out.push(item);
    }
    return out;
  }

  /**
   * death: { occurred, date }. Fail-fast se occurred sem date.
   * @returns {{ occurred: boolean, date: string|null }}
   */
  function normalizeDeath(raw) {
    if (!raw || typeof raw !== "object") {
      return emptyDeath();
    }
    var occurred = !!raw.occurred;
    var date = raw.date == null || raw.date === "" ? null : str(raw.date).slice(0, 32);
    if (occurred && !date) {
      throw new Error("death_date_required");
    }
    if (!occurred) {
      return emptyDeath();
    }
    return { occurred: true, date: date };
  }

  /**
   * Item UTI: { id, kind, startedAt, dischargedAt, reason, surgeryId }.
   * Fail-fast: startedAt/dischargedAt obrigatórios; range; motivo só se unplanned.
   * surgeryId opcional (FEAT-096): ausente/"" → null; não valida existência em cirurgias[].
   * kind inválido / object vazio → null.
   * @param {object} raw
   * @param {string} [fallbackStartedAt] — só migrate-on-read do singular FEAT-093
   * @returns {{ id: string, kind: string, startedAt: string, dischargedAt: string, reason: string, surgeryId: string|null }|null}
   */
  function normalizeIcuAdmissionItem(raw, fallbackStartedAt) {
    if (raw == null || typeof raw !== "object") return null;
    var kind = str(raw.kind).toLowerCase();
    if (VALID_ICU_KINDS.indexOf(kind) === -1) return null;
    var startedAt =
      raw.startedAt == null || raw.startedAt === ""
        ? ""
        : str(raw.startedAt).slice(0, 32);
    if (!startedAt && fallbackStartedAt != null && fallbackStartedAt !== "") {
      startedAt = str(fallbackStartedAt).slice(0, 32);
    }
    if (!startedAt) {
      throw new Error("icu_start_date_required");
    }
    var dischargedAt =
      raw.dischargedAt == null || raw.dischargedAt === ""
        ? ""
        : str(raw.dischargedAt).slice(0, 32);
    if (!dischargedAt) {
      throw new Error("icu_discharge_date_required");
    }
    if (dischargedAt < startedAt) {
      throw new Error("icu_date_range_invalid");
    }
    var reason = str(raw.reason).slice(0, 2000);
    if (kind === "planned") {
      reason = "";
    } else if (!reason) {
      throw new Error("unplanned_reason_required");
    }
    // FEAT-096: vínculo opcional a cirurgias[].id — sem fail-fast de existência
    var surgeryIdRaw = str(raw.surgeryId).slice(0, 80);
    var surgeryId = surgeryIdRaw || null;
    return {
      id: str(raw.id) || newIcuAdmissionId(),
      kind: kind,
      startedAt: startedAt,
      dischargedAt: dischargedAt,
      reason: reason,
      surgeryId: surgeryId,
    };
  }

  /**
   * icuAdmissions[] (FEAT-095 + surgeryId FEAT-096). Sem UTI = [].
   * Array não vazio ganha sobre singular legado; singular + array vazio → migrate-on-read
   * com startedAt = episodeStartedAt.
   * @returns {Array<{ id: string, kind: string, startedAt: string, dischargedAt: string, reason: string, surgeryId: string|null }>}
   */
  function normalizeIcuAdmissions(rawList, legacySingular, episodeStartedAt) {
    if (Array.isArray(rawList) && rawList.length > 0) {
      var out = [];
      for (var i = 0; i < rawList.length; i++) {
        var item = normalizeIcuAdmissionItem(rawList[i]);
        if (item) out.push(item);
      }
      return out;
    }
    if (legacySingular != null && typeof legacySingular === "object") {
      var migrated = normalizeIcuAdmissionItem(legacySingular, episodeStartedAt);
      return migrated ? [migrated] : [];
    }
    return [];
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var death = normalizeDeath(raw.death);
    var endedAt =
      raw.endedAt == null || raw.endedAt === "" ? null : str(raw.endedAt).slice(0, 32);
    // Óbito + alta: se occurred e endedAt vazio → endedAt = death.date (fail-soft)
    if (death.occurred && !endedAt && death.date) {
      endedAt = death.date;
    }
    var kind = normalizeKind(raw.kind);
    var startedAt = str(raw.startedAt).slice(0, 32);
    // UTI só em hospitalization; demais kinds forçam [] (ICU2-AC-07)
    var icuAdmissions =
      kind === "hospitalization"
        ? normalizeIcuAdmissions(raw.icuAdmissions, raw.icuAdmission, startedAt)
        : [];
    var out = {
      id: str(raw.id) || newEpisodeId(),
      label: str(raw.label).slice(0, 200),
      startedAt: startedAt,
      endedAt: endedAt,
      status: normalizeStatus(raw.status),
      kind: kind,
      notes: str(raw.notes).slice(0, 2000),
      diagnoses: normalizeDiagnoses(raw.diagnoses),
      complications: normalizeComplications(raw.complications),
      death: death,
      icuAdmissions: icuAdmissions,
    };
    if (raw.deletedAt) out.deletedAt = str(raw.deletedAt);
    if (raw.deletedBy) out.deletedBy = str(raw.deletedBy).slice(0, 200);
    return out;
  }

  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== "object") return emptySnapshot();
    var entries = Array.isArray(raw.entries) ? raw.entries : [];
    return {
      version: VERSION,
      entries: entries.map(normalizeEntry).filter(Boolean),
      atualizadoEm: raw.atualizadoEm ? str(raw.atualizadoEm) : null,
    };
  }

  function isDeleted(entry) {
    return !!(entry && entry.deletedAt);
  }

  function filterActiveEntries(snapshot) {
    var snap = normalizeSnapshot(snapshot);
    return snap.entries.filter(function (e) {
      return !isDeleted(e);
    });
  }

  function upsertEntry(snapshot, entry) {
    var snap = normalizeSnapshot(snapshot);
    var normalized = normalizeEntry(entry);
    if (!normalized) throw new Error("patient_episode_invalid");
    assertDiagnosesHaveDates(normalized.diagnoses);
    var found = false;
    var entries = snap.entries.map(function (e) {
      if (e.id === normalized.id) {
        found = true;
        return normalized;
      }
      return e;
    });
    if (!found) entries.push(normalized);
    return {
      version: VERSION,
      entries: entries,
      atualizadoEm: nowIso(),
    };
  }

  function softDeleteEntry(snapshot, entryId, opts) {
    opts = opts || {};
    var userId = str(opts.userId);
    if (!userId) throw new Error("userId required for softDeleteEntry");
    var snap = normalizeSnapshot(snapshot);
    var id = str(entryId);
    if (!id) throw new Error("entry_id_required");
    var entries = snap.entries.map(function (e) {
      if (e.id !== id) return e;
      return Object.assign({}, e, {
        deletedAt: opts.at || nowIso(),
        deletedBy: userId,
      });
    });
    return {
      version: VERSION,
      entries: entries,
      atualizadoEm: nowIso(),
    };
  }

  function getEntry(snapshot, entryId) {
    var id = str(entryId);
    if (!id) return null;
    var snap = normalizeSnapshot(snapshot);
    for (var i = 0; i < snap.entries.length; i++) {
      if (snap.entries[i].id === id) return snap.entries[i];
    }
    return null;
  }

  function hasActiveEntries(snapshot) {
    return filterActiveEntries(snapshot).length > 0;
  }

  function findActiveHospitalizationEntries(snapshot) {
    return filterActiveEntries(snapshot).filter(function (entry) {
      return entry.status === "active" && entry.kind === "hospitalization";
    });
  }

  /**
   * Garante no máximo 1 internação activa. Fecha outras ao activar candidateId.
   * @returns {{ snapshot: object, closedIds: string[] }}
   */
  function enforceSingleActiveHospitalization(snapshot, candidateId) {
    var snap = normalizeSnapshot(snapshot);
    var candidate = str(candidateId);
    if (!candidate) return { snapshot: snap, closedIds: [] };
    var closedIds = [];
    var today = nowIso().slice(0, 10);
    var entries = snap.entries.map(function (e) {
      if (isDeleted(e)) return e;
      if (e.kind !== "hospitalization" || e.status !== "active") return e;
      if (e.id === candidate) return e;
      closedIds.push(e.id);
      return Object.assign({}, e, {
        status: "closed",
        endedAt: e.endedAt || today,
      });
    });
    return {
      snapshot: {
        version: VERSION,
        entries: entries,
        atualizadoEm: closedIds.length ? nowIso() : snap.atualizadoEm,
      },
      closedIds: closedIds,
    };
  }

  function upsertEntryWithSingleActiveHospitalization(snapshot, entry) {
    var snap = normalizeSnapshot(snapshot);
    var normalized = normalizeEntry(entry);
    if (!normalized) throw new Error("patient_episode_invalid");
    assertDiagnosesHaveDates(normalized.diagnoses);
    if (normalized.kind === "hospitalization" && normalized.status === "active") {
      var enforced = enforceSingleActiveHospitalization(snap, normalized.id);
      snap = enforced.snapshot;
    }
    return upsertEntry(snap, normalized);
  }

  return {
    VERSION: VERSION,
    VALID_KINDS: VALID_KINDS,
    VALID_STATUSES: VALID_STATUSES,
    emptySnapshot: emptySnapshot,
    normalizeSnapshot: normalizeSnapshot,
    normalizeEntry: normalizeEntry,
    newEpisodeId: newEpisodeId,
    newDiagnosisId: newDiagnosisId,
    newComplicationId: newComplicationId,
    normalizeDiagnosisItem: normalizeDiagnosisItem,
    normalizeDiagnoses: normalizeDiagnoses,
    assertDiagnosesHaveDates: assertDiagnosesHaveDates,
    normalizeComplicationItem: normalizeComplicationItem,
    normalizeComplications: normalizeComplications,
    normalizeDeath: normalizeDeath,
    emptyDeath: emptyDeath,
    newIcuAdmissionId: newIcuAdmissionId,
    normalizeIcuAdmissionItem: normalizeIcuAdmissionItem,
    normalizeIcuAdmissions: normalizeIcuAdmissions,
    VALID_ICU_KINDS: VALID_ICU_KINDS,
    filterActiveEntries: filterActiveEntries,
    upsertEntry: upsertEntry,
    softDeleteEntry: softDeleteEntry,
    getEntry: getEntry,
    hasActiveEntries: hasActiveEntries,
    findActiveHospitalizationEntries: findActiveHospitalizationEntries,
    enforceSingleActiveHospitalization: enforceSingleActiveHospitalization,
    upsertEntryWithSingleActiveHospitalization: upsertEntryWithSingleActiveHospitalization,
    nowIso: nowIso,
  };
});
