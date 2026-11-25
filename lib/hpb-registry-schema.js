/**
 * Schema e utilitários HpbRegistry (v2 — Excel MVP v2.5).
 * Migrator additive: blobs v1 normalizam para version 2 sem perda de campos legados.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbRegistrySchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HPB_VERSION = 2;

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
    return "hpb-ep-" + randomSuffix();
  }
  function newSurgeryId() {
    return "hpb-surg-" + randomSuffix();
  }
  function newMdtId() {
    return "hpb-mdt-" + randomSuffix();
  }
  function newLrtId() {
    return "hpb-lrt-" + randomSuffix();
  }
  function newFollowupId() {
    return "hpb-fu-" + randomSuffix();
  }

  function normalizeFieldProvenance(raw) {
    if (!raw || typeof raw !== "object") return {};
    var out = {};
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      var e = raw[k];
      if (!e || typeof e !== "object") continue;
      out[k] = {
        source: e.source ? String(e.source) : "",
        filledAt: e.filledAt ? String(e.filledAt) : "",
        sourceDate: e.sourceDate ? String(e.sourceDate) : "",
        filledBy: e.filledBy ? String(e.filledBy) : "",
      };
    }
    return out;
  }

  function emptyRegistry() {
    return {
      version: HPB_VERSION,
      episodes: [],
      atualizadoEm: null,
      alertResolutions: {},
      dataFreeze: null,
      fieldProvenance: {},
    };
  }

  function normalizeDataFreeze(raw) {
    if (!raw || typeof raw !== "object") return null;
    var frozenAt = raw.frozenAt ? String(raw.frozenAt) : "";
    if (!frozenAt) return null;
    return {
      frozenAt: frozenAt,
      frozenBy: raw.frozenBy ? String(raw.frozenBy) : "",
      note: raw.note ? String(raw.note) : "",
    };
  }

  function normalizeRegistry(raw) {
    if (!raw || typeof raw !== "object") return emptyRegistry();
    var episodes = Array.isArray(raw.episodes) ? raw.episodes : [];
    return {
      version: HPB_VERSION,
      episodes: episodes.map(normalizeEpisode),
      atualizadoEm: raw.atualizadoEm || null,
      alertResolutions:
        raw.alertResolutions && typeof raw.alertResolutions === "object"
          ? raw.alertResolutions
          : {},
      dataFreeze: normalizeDataFreeze(raw.dataFreeze),
      fieldProvenance: normalizeFieldProvenance(raw.fieldProvenance),
    };
  }

  function hasPreopContent(preop) {
    if (!preop || typeof preop !== "object") return false;
    return Object.keys(preop).some(function (k) {
      var v = preop[k];
      return v != null && String(v).trim() !== "";
    });
  }

  function copyTombstoneFields(src, dest) {
    if (!src || typeof src !== "object") return dest;
    if (src.deletedAt) dest.deletedAt = src.deletedAt;
    if (src.deletedBy) dest.deletedBy = src.deletedBy;
    return dest;
  }

  function isDeleted(item) {
    return !!(item && item.deletedAt);
  }

  function filterActive(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (item) {
      return !isDeleted(item);
    });
  }

  function markDeleted(item, opts) {
    opts = opts || {};
    var userId = String(opts.userId || "");
    if (!userId) throw new Error("userId required for markDeleted");
    return Object.assign({}, item, {
      deletedAt: opts.at || nowIso(),
      deletedBy: userId,
    });
  }

  function activeEpisode(ep) {
    if (!ep || isDeleted(ep)) return null;
    return Object.assign({}, ep, {
      surgeries: filterActive(ep.surgeries),
      mdtMeetings: filterActive(ep.mdtMeetings),
      followups: filterActive(ep.followups),
      locoregional: filterActive(ep.locoregional),
    });
  }

  function filterRegistryActive(registry) {
    if (!registry || typeof registry !== "object") return emptyRegistry();
    var episodes = filterActive(registry.episodes || [])
      .map(activeEpisode)
      .filter(Boolean);
    return Object.assign({}, registry, { episodes: episodes });
  }

  function normalizeSurgery(surg) {
    if (!surg || typeof surg !== "object") return null;
    return copyTombstoneFields(surg, {
      id: surg.id || newSurgeryId(),
      passometroCirurgiaId: surg.passometroCirurgiaId || "",
      core: surg.core || {},
      preop: surg.preop || null,
      hepatectomy: surg.hepatectomy ?? null,
      pancreatectomy: surg.pancreatectomy ?? null,
      biliary: surg.biliary ?? null,
      vascular: surg.vascular ?? null,
      robotic: surg.robotic ?? null,
      pathology: surg.pathology ?? null,
      postop: surg.postop ?? null,
    });
  }

  function normalizeChildItem(item, newIdFn) {
    if (!item || typeof item !== "object") return null;
    return copyTombstoneFields(item, Object.assign({ id: item.id || newIdFn() }, item));
  }

  function migrateEpisodePreop(ep) {
    var legacyPreop = ep.preop;
    if (!legacyPreop || typeof legacyPreop !== "object") return ep;
    var surgeries = Array.isArray(ep.surgeries) ? ep.surgeries.slice() : [];
    if (!surgeries.length) return ep;
    var first = surgeries[0];
    if (!first || typeof first !== "object") return ep;
    if (hasPreopContent(first.preop)) return ep;
    surgeries[0] = Object.assign({}, first, { preop: legacyPreop });
    var next = Object.assign({}, ep, { surgeries: surgeries });
    delete next.preop;
    return next;
  }

  /** Aliases / campos novos v2.5 — preserva legado no blob. */
  function migratePreopV2(preop) {
    if (!preop || typeof preop !== "object") return preop;
    var out = Object.assign({}, preop);
    if (!out.meldClassic && out.meld) out.meldClassic = out.meld;
    return out;
  }

  function migrateFollowupV2(item) {
    if (!item || typeof item !== "object") return item;
    var out = Object.assign({}, item);
    if (!out.diseaseStatus && out.oncologicStatus) {
      out.diseaseStatus = out.oncologicStatus;
    }
    return out;
  }

  function migrateSurgeryV2(surg) {
    if (!surg || typeof surg !== "object") return surg;
    var out = Object.assign({}, surg);
    if (out.preop) out.preop = migratePreopV2(out.preop);
    return out;
  }

  function normalizeEpisode(ep) {
    if (!ep || typeof ep !== "object") return null;
    var migrated = migrateEpisodePreop(ep);
    var surgeries = Array.isArray(migrated.surgeries)
      ? migrated.surgeries
          .map(migrateSurgeryV2)
          .map(normalizeSurgery)
          .filter(Boolean)
      : [];
    var followups = Array.isArray(migrated.followups)
      ? migrated.followups
          .map(migrateFollowupV2)
          .map(function (f) {
            return normalizeChildItem(f, newFollowupId);
          })
          .filter(Boolean)
      : [];
    return copyTombstoneFields(migrated, {
      id: migrated.id || newEpisodeId(),
      patientEpisodeId: str(migrated.patientEpisodeId),
      startedAt: migrated.startedAt || "",
      diagnosisGroup: migrated.diagnosisGroup || "",
      primaryDiagnosis: migrated.primaryDiagnosis || "",
      malignant: migrated.malignant ?? "unknown",
      confirmation: migrated.confirmation || "",
      topography: migrated.topography || "",
      status: migrated.status || "ativo",
      therapeuticIntent: migrated.therapeuticIntent || "",
      /** Legado v1 — fora da UI principal v2.5. */
      indexEvent: migrated.indexEvent || "",
      mdtRequired: migrated.mdtRequired ?? "unknown",
      notes: migrated.notes || "",
      createdAt: migrated.createdAt || nowIso(),
      updatedAt: migrated.updatedAt || nowIso(),
      mdtMeetings: Array.isArray(migrated.mdtMeetings)
        ? migrated.mdtMeetings.map(function (m) {
            return normalizeChildItem(m, newMdtId);
          }).filter(Boolean)
        : [],
      surgeries: surgeries,
      locoregional: Array.isArray(migrated.locoregional)
        ? migrated.locoregional.map(function (l) {
            return normalizeChildItem(l, newLrtId);
          }).filter(Boolean)
        : [],
      followups: followups,
    });
  }

  function newEpisode(partial) {
    partial = partial || {};
    return normalizeEpisode(
      Object.assign(
        {
          id: newEpisodeId(),
          startedAt: "",
          diagnosisGroup: "",
          primaryDiagnosis: "",
          malignant: "unknown",
          confirmation: "",
          topography: "",
          status: "ativo",
          therapeuticIntent: "",
          indexEvent: "",
          mdtRequired: "unknown",
          mdtMeetings: [],
          surgeries: [],
          locoregional: [],
          followups: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
        partial,
      ),
    );
  }

  function newSurgery(partial) {
    partial = partial || {};
    return normalizeSurgery(
      Object.assign(
        {
          id: newSurgeryId(),
          core: {},
          preop: null,
          hepatectomy: null,
          pancreatectomy: null,
          biliary: null,
          vascular: null,
          robotic: null,
          pathology: null,
          postop: null,
        },
        partial,
      ),
    );
  }

  function isYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function validateEpisodeM1(ep) {
    var errors = [];
    if (!ep.startedAt) errors.push("startedAt");
    if (!ep.diagnosisGroup) errors.push("diagnosisGroup");
    if (!ep.primaryDiagnosis) errors.push("primaryDiagnosis");
    if (!ep.status) errors.push("status");
    return errors;
  }

  return {
    HPB_VERSION: HPB_VERSION,
    nowIso: nowIso,
    newEpisodeId: newEpisodeId,
    newSurgeryId: newSurgeryId,
    newMdtId: newMdtId,
    newLrtId: newLrtId,
    newFollowupId: newFollowupId,
    emptyRegistry: emptyRegistry,
    normalizeRegistry: normalizeRegistry,
    normalizeEpisode: normalizeEpisode,
    newEpisode: newEpisode,
    newSurgery: newSurgery,
    normalizeSurgery: normalizeSurgery,
    isDeleted: isDeleted,
    filterActive: filterActive,
    markDeleted: markDeleted,
    filterRegistryActive: filterRegistryActive,
    isYes: isYes,
    validateEpisodeM1: validateEpisodeM1,
  };
});
