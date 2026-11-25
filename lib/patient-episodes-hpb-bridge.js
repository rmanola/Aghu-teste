/**
 * Liga episódios clínicos (patient_episodes) a fichas HPB (hpb_registry) quando aplicável.
 * Sincronização contínua clínico → HPB (clínico vence nos campos compatíveis).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuPatientEpisodesHpbBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var patientEpisodesApi = null;
  var hpbSchemaApi = null;

  try {
    if (typeof require === "function") {
      patientEpisodesApi = require("./patient-episodes-schema.js");
      hpbSchemaApi = require("./hpb-registry-schema.js");
    }
  } catch (_e) {}

  var VALID_CLINICAL_PATHS = [
    "startedAt",
    "notes",
    "status",
    "label",
    "diagnoses[0].texto",
    "diagnoses[0].data",
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function mapClinicalStatusToHpb(clinicalStatus) {
    if (str(clinicalStatus).toLowerCase() === "closed") return "Encerrado";
    return "Ativo";
  }

  function primaryDiagnosisFromClinical(clinicalEpisode) {
    if (!clinicalEpisode || !Array.isArray(clinicalEpisode.diagnoses)) return "";
    for (var i = 0; i < clinicalEpisode.diagnoses.length; i++) {
      var texto = str(clinicalEpisode.diagnoses[i] && clinicalEpisode.diagnoses[i].texto);
      if (texto) return texto.slice(0, 500);
    }
    return "";
  }

  function extractClinicalValuesForHpb(clinicalEpisode) {
    if (!clinicalEpisode) return {};
    return {
      patientEpisodeId: str(clinicalEpisode.id),
      startedAt: str(clinicalEpisode.startedAt),
      notes: str(clinicalEpisode.notes).slice(0, 2000),
      status: mapClinicalStatusToHpb(clinicalEpisode.status),
      primaryDiagnosis: primaryDiagnosisFromClinical(clinicalEpisode),
    };
  }

  function resolveClinicalPath(clinicalEntry, path) {
    var p = str(path);
    if (!clinicalEntry || !p) return "";
    if (VALID_CLINICAL_PATHS.indexOf(p) === -1) return "";
    if (p === "startedAt") return str(clinicalEntry.startedAt);
    if (p === "notes") return str(clinicalEntry.notes);
    if (p === "label") return str(clinicalEntry.label);
    if (p === "status") return str(clinicalEntry.status);
    if (p === "diagnoses[0].texto") return primaryDiagnosisFromClinical(clinicalEntry);
    if (p === "diagnoses[0].data") {
      var dx = clinicalEntry.diagnoses && clinicalEntry.diagnoses[0];
      return dx ? str(dx.data) : "";
    }
    return "";
  }

  function findHpbEpisodeByPatientEpisodeId(hpbRegistry, patientEpisodeId) {
    var id = str(patientEpisodeId);
    if (!id || !hpbSchemaApi) return null;
    var reg = hpbSchemaApi.normalizeRegistry(hpbRegistry || {});
    var episodes = reg.episodes || [];
    for (var i = 0; i < episodes.length; i++) {
      var ep = episodes[i];
      if (ep && str(ep.patientEpisodeId) === id && !ep.deletedAt) return ep;
    }
    return null;
  }

  function buildHpbStubFromClinical(clinicalEpisode) {
    if (!clinicalEpisode || !hpbSchemaApi) return null;
    var mapped = extractClinicalValuesForHpb(clinicalEpisode);
    return {
      id: hpbSchemaApi.newEpisodeId(),
      patientEpisodeId: mapped.patientEpisodeId,
      startedAt: mapped.startedAt,
      diagnosisGroup: "",
      primaryDiagnosis: mapped.primaryDiagnosis,
      malignant: "unknown",
      status: mapped.status || "Ativo",
      indexEvent: "",
      mdtRequired: "unknown",
      notes: mapped.notes,
      surgeries: [],
      mdtMeetings: [],
      followups: [],
      locoregional: [],
      createdAt: hpbSchemaApi.nowIso ? hpbSchemaApi.nowIso() : new Date().toISOString(),
      updatedAt: hpbSchemaApi.nowIso ? hpbSchemaApi.nowIso() : new Date().toISOString(),
    };
  }

  function syncClinicalEntryToHpbEpisode(clinicalEpisode, hpbEpisode, opts) {
    opts = opts || {};
    var overwrite = opts.overwrite !== false;
    if (!clinicalEpisode || !hpbEpisode) return hpbEpisode;
    var mapped = extractClinicalValuesForHpb(clinicalEpisode);
    var next = Object.assign({}, hpbEpisode);
    var fields = ["patientEpisodeId", "startedAt", "notes", "status", "primaryDiagnosis"];
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      var incoming = mapped[key];
      if (!overwrite && str(next[key]) !== "") continue;
      next[key] = incoming;
    }
    if (hpbSchemaApi && hpbSchemaApi.nowIso) {
      next.updatedAt = hpbSchemaApi.nowIso();
    }
    return hpbSchemaApi
      ? hpbSchemaApi.normalizeEpisode(next)
      : next;
  }

  function replaceHpbEpisodeInRegistry(reg, hpbEpisodeId, nextEpisode) {
    var episodes = (reg.episodes || []).map(function (ep) {
      if (ep && ep.id === hpbEpisodeId) return nextEpisode;
      return ep;
    });
    return Object.assign({}, reg, {
      episodes: episodes,
      atualizadoEm: hpbSchemaApi.nowIso ? hpbSchemaApi.nowIso() : new Date().toISOString(),
    });
  }

  /**
   * Garante episódio HPB ligado a um episódio clínico (stub mínimo se ausente).
   * @returns {{ hpbRegistry: object, hpbEpisodeId: string, created: boolean }}
   */
  function ensureHpbEpisodeLink(patientEpisodesSnap, hpbRegistry, patientEpisodeId) {
    if (!hpbSchemaApi || !patientEpisodesApi) {
      throw new Error("patient_episodes_hpb_bridge_unavailable");
    }
    var clinicalId = str(patientEpisodeId);
    if (!clinicalId) throw new Error("patient_episode_id_required");

    var clinical = patientEpisodesApi.getEntry(patientEpisodesSnap, clinicalId);
    if (!clinical || clinical.deletedAt) {
      throw new Error("patient_episode_not_found");
    }

    var reg = hpbSchemaApi.normalizeRegistry(hpbRegistry || hpbSchemaApi.emptyRegistry());
    var existing = findHpbEpisodeByPatientEpisodeId(reg, clinicalId);
    if (existing) {
      return { hpbRegistry: reg, hpbEpisodeId: existing.id, created: false };
    }

    var stub = buildHpbStubFromClinical(clinical);
    if (!stub) throw new Error("hpb_stub_failed");
    reg = Object.assign({}, reg, {
      episodes: (reg.episodes || []).concat([stub]),
      atualizadoEm: hpbSchemaApi.nowIso ? hpbSchemaApi.nowIso() : new Date().toISOString(),
    });
    return { hpbRegistry: reg, hpbEpisodeId: stub.id, created: true };
  }

  function clinicalEntriesToSync(patientEpisodesSnap, editedEpisodeId) {
    if (!patientEpisodesApi) return [];
    var snap = patientEpisodesApi.normalizeSnapshot(patientEpisodesSnap);
    var edited = str(editedEpisodeId);
    if (edited) {
      var one = patientEpisodesApi.getEntry(snap, edited);
      return one && !one.deletedAt ? [one] : [];
    }
    return patientEpisodesApi.filterActiveEntries(snap);
  }

  /**
   * Sincroniza episódios clínicos activos (ou um editado) para HPB ligado.
   * @returns {{ hpbRegistry: object, changed: boolean }}
   */
  function applyClinicalSyncToHpbRegistry(patientEpisodesSnap, hpbRegistry, opts) {
    opts = opts || {};
    if (!hpbSchemaApi || !patientEpisodesApi) {
      return { hpbRegistry: hpbRegistry || {}, changed: false };
    }
    var reg = hpbSchemaApi.normalizeRegistry(hpbRegistry || hpbSchemaApi.emptyRegistry());
    var entries = clinicalEntriesToSync(patientEpisodesSnap, opts.editedEpisodeId);
    if (!entries.length) return { hpbRegistry: reg, changed: false };

    var changed = false;
    for (var i = 0; i < entries.length; i++) {
      var clinical = entries[i];
      var link = ensureHpbEpisodeLink(patientEpisodesSnap, reg, clinical.id);
      reg = link.hpbRegistry;
      if (link.created) changed = true;
      var hpbEp = findHpbEpisodeByPatientEpisodeId(reg, clinical.id);
      if (!hpbEp) continue;
      var synced = syncClinicalEntryToHpbEpisode(clinical, hpbEp, {
        overwrite: opts.overwrite !== false,
      });
      var before = JSON.stringify(hpbEp);
      var after = JSON.stringify(synced);
      if (before !== after) {
        reg = replaceHpbEpisodeInRegistry(reg, hpbEp.id, synced);
        changed = true;
      }
    }
    return { hpbRegistry: reg, changed: changed };
  }

  return {
    VALID_CLINICAL_PATHS: VALID_CLINICAL_PATHS,
    mapClinicalStatusToHpb: mapClinicalStatusToHpb,
    extractClinicalValuesForHpb: extractClinicalValuesForHpb,
    resolveClinicalPath: resolveClinicalPath,
    findHpbEpisodeByPatientEpisodeId: findHpbEpisodeByPatientEpisodeId,
    ensureHpbEpisodeLink: ensureHpbEpisodeLink,
    buildHpbStubFromClinical: buildHpbStubFromClinical,
    syncClinicalEntryToHpbEpisode: syncClinicalEntryToHpbEpisode,
    applyClinicalSyncToHpbRegistry: applyClinicalSyncToHpbRegistry,
  };
});
