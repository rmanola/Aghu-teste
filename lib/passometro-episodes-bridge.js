/**
 * Ponte Passômetro ↔ episódios clínicos (diagnósticos sincronizados).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuPassometroEpisodesBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var passometroSchemaApi = null;
  var patientEpisodesApi = null;
  var dateBrApi = null;
  var collectionApi = null;

  try {
    if (typeof require === "function") {
      passometroSchemaApi = require("./passometro-schema.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      dateBrApi = require("./date-br.js");
      collectionApi = require("./passometro-collection.js");
    }
  } catch (_e) {}

  function getPassometroSchema() {
    if (passometroSchemaApi) return passometroSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuPassometroSchema || null;
  }

  function getPatientEpisodesSchema() {
    if (patientEpisodesApi) return patientEpisodesApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuPatientEpisodesSchema || null;
  }

  function getDateBr() {
    if (dateBrApi) return dateBrApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuDateBr || null;
  }

  function getCollectionApi() {
    if (collectionApi) return collectionApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuPassometroCollection || null;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function foldTexto(s) {
    return str(s).toLowerCase();
  }

  function brDateToIso(brDate) {
    var db = getDateBr();
    if (db && db.brToIso) {
      var iso = db.brToIso(brDate);
      if (iso) return iso;
    }
    var raw = str(brDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return "";
  }

  function isoDateToBr(isoDate) {
    var raw = str(isoDate);
    if (!raw) return "";
    var db = getDateBr();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && db && db.isoToBr) {
      return db.isoToBr(raw);
    }
    return raw;
  }

  function diagnosisListSignature(list, dateFn) {
    var rows = [];
    for (var i = 0; i < (list || []).length; i++) {
      var item = list[i];
      if (!item) continue;
      rows.push(foldTexto(item.texto) + "\t" + str(dateFn(item)));
    }
    rows.sort();
    return rows.join("\n");
  }

  function findActiveEpisode(snapshot) {
    var coll = getCollectionApi();
    if (coll && coll.findActiveHospitalizationEpisode) {
      return coll.findActiveHospitalizationEpisode(snapshot);
    }
    var pe = getPatientEpisodesSchema();
    if (!pe) return null;
    var snap = pe.normalizeSnapshot(snapshot || {});
    var active = pe.filterActiveEntries(snap).filter(function (entry) {
      return entry.status === "active";
    });
    if (!active.length) return null;
    return active[0];
  }

  function getEpisodeById(snapshot, episodeId) {
    var pe = getPatientEpisodesSchema();
    if (!pe) return null;
    return pe.getEntry(snapshot, episodeId);
  }

  function passometroDiagnosisToEpisode(d, existingByText) {
    var pe = getPatientEpisodesSchema();
    var key = foldTexto(d.texto);
    var prev = existingByText && existingByText[key];
    return {
      id: prev ? prev.id : pe.newDiagnosisId(),
      data: brDateToIso(d.data),
      texto: str(d.texto),
    };
  }

  function episodeDiagnosisToPassometro(d) {
    var pm = getPassometroSchema();
    return {
      id: str(d.id) || (pm && pm.newEntryId ? pm.newEntryId() : "d-sync"),
      data: isoDateToBr(d.data),
      texto: str(d.texto),
    };
  }

  function emptyEpisodesSnapshot() {
    var pe = getPatientEpisodesSchema();
    return pe && pe.emptySnapshot
      ? pe.emptySnapshot()
      : { version: 1, entries: [], atualizadoEm: null };
  }

  function syncPassometroDiagnosesToEpisode(
    patientEpisodesSnap,
    episodeId,
    passometroHeader,
  ) {
    var pm = getPassometroSchema();
    var pe = getPatientEpisodesSchema();
    if (!pm || !pe) {
      return {
        snapshot: patientEpisodesSnap || emptyEpisodesSnapshot(),
        filled: 0,
        changed: false,
      };
    }

    var snap = pe.normalizeSnapshot(patientEpisodesSnap || pe.emptySnapshot());
    var targetId = str(episodeId);
    var target = targetId
      ? getEpisodeById(snap, targetId)
      : findActiveEpisode(snap);
    if (!target || target.deletedAt) {
      return { snapshot: snap, filled: 0, changed: false };
    }

    var diagnosticos = pm.normalizeDiagnosticosFromHeader(passometroHeader || {});
    var existingByText = Object.create(null);
    for (var i = 0; i < (target.diagnoses || []).length; i++) {
      var ex = target.diagnoses[i];
      existingByText[foldTexto(ex.texto)] = ex;
    }

    // Só sincroniza diagnósticos com data (escrita exige data no episódio).
    var nextDiagnoses = diagnosticos
      .filter(function (d) {
        return str(d.texto) && str(d.data);
      })
      .map(function (d) {
        return passometroDiagnosisToEpisode(d, existingByText);
      });

    if (
      diagnosisListSignature(target.diagnoses, function (d) {
        return d.data;
      }) ===
      diagnosisListSignature(nextDiagnoses, function (d) {
        return d.data;
      })
    ) {
      return { snapshot: snap, filled: 0, changed: false };
    }

    var updated = Object.assign({}, target, { diagnoses: nextDiagnoses });
    return {
      snapshot: pe.upsertEntry(snap, updated),
      filled: nextDiagnoses.length,
      changed: true,
    };
  }

  function syncPassometroDiagnosesToActiveEpisode(
    patientEpisodesSnap,
    passometroHeader,
  ) {
    var active = findActiveEpisode(patientEpisodesSnap);
    return syncPassometroDiagnosesToEpisode(
      patientEpisodesSnap,
      active ? active.id : "",
      passometroHeader,
    );
  }

  function syncEpisodeDiagnosesToPassometroSnap(
    patientEpisodesSnap,
    episodeId,
    passometroSnap,
  ) {
    var pm = getPassometroSchema();
    var pe = getPatientEpisodesSchema();
    if (!pm || !pe || !passometroSnap || typeof passometroSnap !== "object") {
      return { passometro: passometroSnap || null, changed: false };
    }

    var targetId = str(episodeId);
    var target = targetId
      ? getEpisodeById(patientEpisodesSnap, targetId)
      : findActiveEpisode(patientEpisodesSnap);
    if (!target || target.deletedAt) {
      return { passometro: passometroSnap, changed: false };
    }

    var currentDiagnosticos = pm.normalizeDiagnosticosFromHeader(
      passometroSnap.header || {},
    );
    var nextDiagnosticos = (target.diagnoses || [])
      .map(episodeDiagnosisToPassometro)
      .filter(function (d) {
        return !!foldTexto(d.texto);
      });

    if (
      diagnosisListSignature(currentDiagnosticos, function (d) {
        return d.data;
      }) ===
      diagnosisListSignature(nextDiagnosticos, function (d) {
        return d.data;
      })
    ) {
      return { passometro: passometroSnap, changed: false };
    }

    var newHeader = pm.normalizeHeader(
      Object.assign({}, passometroSnap.header || {}, {
        diagnosticos: nextDiagnosticos,
      }),
    );

    return {
      passometro: Object.assign({}, passometroSnap, { header: newHeader }),
      changed: true,
    };
  }

  function syncActiveEpisodeDiagnosesToPassometro(
    patientEpisodesSnap,
    passometroSnap,
  ) {
    var active = findActiveEpisode(patientEpisodesSnap);
    return syncEpisodeDiagnosesToPassometroSnap(
      patientEpisodesSnap,
      active ? active.id : "",
      passometroSnap,
    );
  }

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function episodeLabelFromDih(dih) {
    var br = str(dih);
    return br ? "Internação " + br : "Internação";
  }

  function registroHasClinicalContent(registro) {
    var coll = getCollectionApi();
    if (!coll || !registro) return false;
    return coll.hasPassometroContent({
      version: coll.VERSION,
      registros: [registro],
      atualizadoEm: null,
    });
  }

  function syncPassometroHeaderToEpisode(
    patientEpisodesSnap,
    episodeId,
    passometroHeader,
  ) {
    var diag = syncPassometroDiagnosesToEpisode(
      patientEpisodesSnap,
      episodeId,
      passometroHeader,
    );
    var pe = getPatientEpisodesSchema();
    if (!pe) return diag;

    var snap = diag.snapshot;
    var targetId = str(episodeId);
    var target = targetId ? getEpisodeById(snap, targetId) : null;
    if (!target || target.deletedAt) return diag;

    var dih = str(passometroHeader && passometroHeader.dih);
    var startedAt = brDateToIso(dih) || str(target.startedAt);
    var nextLabel = str(target.label) || (dih ? episodeLabelFromDih(dih) : "");
    var metaChanged = false;
    var updated = Object.assign({}, target);

    if (startedAt && str(target.startedAt) !== startedAt) {
      updated.startedAt = startedAt;
      metaChanged = true;
    }
    if (nextLabel && str(target.label) !== nextLabel) {
      updated.label = nextLabel;
      metaChanged = true;
    }

    if (!metaChanged) return diag;

    return {
      snapshot: pe.upsertEntry(snap, updated),
      filled: diag.filled,
      changed: true,
    };
  }

  function createHospitalizationEpisode(episodesSnap, header) {
    var pe = getPatientEpisodesSchema();
    if (!pe) return { snapshot: episodesSnap, episodeId: null, episodesChanged: false };
    var dih = str(header && header.dih);
    var startedAt = brDateToIso(dih) || todayIsoDate();
    var entry = pe.normalizeEntry({
      id: pe.newEpisodeId(),
      label: episodeLabelFromDih(dih || isoDateToBr(startedAt)),
      startedAt: startedAt,
      endedAt: null,
      status: "active",
      kind: "hospitalization",
      notes: "",
      diagnoses: [],
    });
    var next = pe.upsertEntryWithSingleActiveHospitalization(
      pe.normalizeSnapshot(episodesSnap || pe.emptySnapshot()),
      entry,
    );
    return {
      snapshot: next,
      episodeId: entry.id,
      episodesChanged: true,
    };
  }

  /**
   * @param {{
   *   episodesSnap?: object | null,
   *   collection?: object | null,
   *   header?: object | null,
   *   mode?: "save" | "new_passometro",
   *   patientEpisodeId?: string | null,
   *   forceNewPassometro?: boolean,
   *   confirmedClose?: boolean,
   * }} opts
   */
  function resolvePassometroSaveContext(opts) {
    opts = opts || {};
    var pe = getPatientEpisodesSchema();
    var coll = getCollectionApi();
    var emptyResult = {
      patientEpisodeId: null,
      patientEpisodes: opts.episodesSnap || emptyEpisodesSnapshot(),
      collection: coll ? coll.emptyCollection() : { version: 2, registros: [], atualizadoEm: null },
      episodesChanged: false,
      needsConfirmClose: false,
      closedEpisodeId: null,
    };
    if (!pe || !coll) return emptyResult;

    var episodes = pe.normalizeSnapshot(opts.episodesSnap || pe.emptySnapshot());
    var collection = coll.normalizeCollection(
      opts.collection || coll.emptyCollection(),
    );
    var header = opts.header && typeof opts.header === "object" ? opts.header : {};
    var mode = opts.mode === "new_passometro" ? "new_passometro" : "save";
    var forceNew =
      opts.forceNewPassometro === true || mode === "new_passometro";
    var confirmedClose = opts.confirmedClose === true;
    var episodesChanged = false;
    var closedEpisodeId = null;

    var active = coll.findActiveHospitalizationEpisode(episodes);
    var explicitId = str(opts.patientEpisodeId);

    function ensureRegistro(episodeId) {
      var entry = getEpisodeById(episodes, episodeId);
      if (!entry || entry.deletedAt) return collection;
      var ensured = coll.ensureRegistroForEpisode(collection, entry);
      if (ensured.created) {
        collection = ensured.collection;
      }
      return collection;
    }

    if (explicitId && !forceNew) {
      var explicitEntry = getEpisodeById(episodes, explicitId);
      if (explicitEntry && !explicitEntry.deletedAt) {
        collection = ensureRegistro(explicitId);
        var headerSyncKnown = syncPassometroHeaderToEpisode(
          episodes,
          explicitId,
          header,
        );
        if (headerSyncKnown.changed) {
          episodes = headerSyncKnown.snapshot;
          episodesChanged = true;
        }
        return {
          patientEpisodeId: explicitId,
          patientEpisodes: episodes,
          collection: collection,
          episodesChanged: episodesChanged,
          needsConfirmClose: false,
          closedEpisodeId: null,
        };
      }

      if (coll.findRegistro(collection, explicitId)) {
        var dihOrphan = str(header.dih);
        var startedAtOrphan = brDateToIso(dihOrphan) || todayIsoDate();
        var orphanStub = pe.normalizeEntry({
          id: explicitId,
          label: dihOrphan
            ? episodeLabelFromDih(dihOrphan)
            : episodeLabelFromDih(isoDateToBr(startedAtOrphan)),
          startedAt: startedAtOrphan,
          endedAt: null,
          status: "active",
          kind: "hospitalization",
          notes: "",
          diagnoses: [],
        });
        if (orphanStub) {
          episodes = pe.upsertEntryWithSingleActiveHospitalization(
            episodes,
            orphanStub,
          );
          episodesChanged = true;
          collection = ensureRegistro(explicitId);
          var headerSyncOrphan = syncPassometroHeaderToEpisode(
            episodes,
            explicitId,
            header,
          );
          if (headerSyncOrphan.changed) {
            episodes = headerSyncOrphan.snapshot;
          }
          return {
            patientEpisodeId: explicitId,
            patientEpisodes: episodes,
            collection: collection,
            episodesChanged: episodesChanged,
            needsConfirmClose: false,
            closedEpisodeId: null,
          };
        }
      }
    }

    if (active) {
      var activeReg = coll.findRegistro(collection, active.id);
      var activeHasContent = registroHasClinicalContent(activeReg);

      if (forceNew && activeHasContent && !confirmedClose) {
        return {
          patientEpisodeId: null,
          patientEpisodes: episodes,
          collection: collection,
          episodesChanged: false,
          needsConfirmClose: true,
          closedEpisodeId: active.id,
        };
      }

      if (forceNew && activeHasContent && confirmedClose) {
        closedEpisodeId = active.id;
        var closedEntry = Object.assign({}, active, {
          status: "closed",
          endedAt: active.endedAt || todayIsoDate(),
        });
        episodes = pe.upsertEntry(episodes, closedEntry);
        episodesChanged = true;
        active = null;
      } else if (!forceNew || !activeHasContent) {
        collection = ensureRegistro(active.id);
        var attachSync = syncPassometroHeaderToEpisode(
          episodes,
          active.id,
          header,
        );
        if (attachSync.changed) {
          episodes = attachSync.snapshot;
          episodesChanged = true;
        }
        return {
          patientEpisodeId: active.id,
          patientEpisodes: episodes,
          collection: collection,
          episodesChanged: episodesChanged,
          needsConfirmClose: false,
          closedEpisodeId: closedEpisodeId,
        };
      }
    }

    var created = createHospitalizationEpisode(episodes, header);
    episodes = created.snapshot;
    episodesChanged = true;
    collection = ensureRegistro(created.episodeId);
    var afterCreateSync = syncPassometroHeaderToEpisode(
      episodes,
      created.episodeId,
      header,
    );
    if (afterCreateSync.changed) {
      episodes = afterCreateSync.snapshot;
    }

    return {
      patientEpisodeId: created.episodeId,
      patientEpisodes: episodes,
      collection: collection,
      episodesChanged: episodesChanged,
      needsConfirmClose: false,
      closedEpisodeId: closedEpisodeId,
    };
  }

  /**
   * Decide se patient_episodes deve ir no upsert (baseline cloud, não merge hub).
   */
  function episodePersistFingerprint(entry) {
    if (!entry) return "";
    var diagnoses = (entry.diagnoses || []).map(function (d) {
      return foldTexto(d.texto) + "\t" + str(d.data);
    });
    diagnoses.sort();
    return [str(entry.startedAt), str(entry.label), diagnoses.join("\n")].join(
      "|",
    );
  }

  function shouldPersistPatientEpisodes(opts) {
    if (opts.episodesSyncChanged || opts.saveContextEpisodesChanged) {
      return true;
    }
    var cloudEpisodes = opts.cloudPatientEpisodes;
    var collApi = getCollectionApi();
    var pe = getPatientEpisodesSchema();
    var hasActiveInCloud =
      cloudEpisodes &&
      collApi &&
      collApi.findActiveHospitalizationEpisode(cloudEpisodes);
    if (!hasActiveInCloud) {
      return true;
    }
    var activeId = str(opts.patientEpisodeId);
    if (activeId && pe && cloudEpisodes && !pe.getEntry(cloudEpisodes, activeId)) {
      return true;
    }
    if (opts.episodesSnapshot && pe && activeId) {
      var nextEntry = pe.getEntry(opts.episodesSnapshot, activeId);
      var cloudEntry = cloudEpisodes ? pe.getEntry(cloudEpisodes, activeId) : null;
      if (
        nextEntry &&
        episodePersistFingerprint(nextEntry) !==
          episodePersistFingerprint(cloudEntry)
      ) {
        return true;
      }
    }
    return false;
  }

  return {
    syncPassometroDiagnosesToEpisode: syncPassometroDiagnosesToEpisode,
    syncPassometroDiagnosesToActiveEpisode:
      syncPassometroDiagnosesToActiveEpisode,
    syncEpisodeDiagnosesToPassometroSnap: syncEpisodeDiagnosesToPassometroSnap,
    syncActiveEpisodeDiagnosesToPassometro:
      syncActiveEpisodeDiagnosesToPassometro,
    syncPassometroHeaderToEpisode: syncPassometroHeaderToEpisode,
    resolvePassometroSaveContext: resolvePassometroSaveContext,
    shouldPersistPatientEpisodes: shouldPersistPatientEpisodes,
    createHospitalizationEpisode: createHospitalizationEpisode,
    findActiveEpisode: findActiveEpisode,
    episodeDiagnosisToPassometro: episodeDiagnosisToPassometro,
    passometroDiagnosisToEpisode: passometroDiagnosisToEpisode,
  };
});
