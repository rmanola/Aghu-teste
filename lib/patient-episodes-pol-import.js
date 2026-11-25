/**
 * Merge de internações POL → patient_episodes + DIH/staff no passômetro (só se vazios).
 * FEAT-109 — CAD-AC-06..07.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientEpisodesPolImport = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function getPe() {
    if (root.AghuPatientEpisodesSchema) return root.AghuPatientEpisodesSchema;
    if (typeof require === "function") {
      try {
        return require("./patient-episodes-schema.js");
      } catch (_e) {}
    }
    return null;
  }

  function getColl() {
    if (root.AghuPassometroCollection) return root.AghuPassometroCollection;
    if (typeof require === "function") {
      try {
        return require("./passometro-collection.js");
      } catch (_e) {}
    }
    return null;
  }

  function getHist() {
    if (root.AghuPatientPolHistoricoInternacoes) {
      return root.AghuPatientPolHistoricoInternacoes;
    }
    if (typeof require === "function") {
      try {
        return require("./patient-pol-historico-internacoes.js");
      } catch (_e) {}
    }
    return null;
  }

  function getDateBr() {
    if (root.AghuDateBr) return root.AghuDateBr;
    if (typeof require === "function") {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return null;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function findHospitalizationByStartedAt(snap, startedAt) {
    var pe = getPe();
    if (!pe) return null;
    var entries = pe.filterActiveEntries(snap);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.kind === "hospitalization" && e.startedAt === startedAt) return e;
    }
    return null;
  }

  function isoToBr(iso) {
    var db = getDateBr();
    if (iso && db && db.isoToBr) return db.isoToBr(String(iso).slice(0, 10));
    return str(iso);
  }

  /**
   * Preenche header.dih / header.staff só se vazios.
   */
  function fillEmptyPassometroHeader(snap, fields) {
    fields = fields || {};
    var header = Object.assign({}, (snap && snap.header) || {});
    var changed = false;
    if (fields.dih && !str(header.dih)) {
      header.dih = fields.dih;
      changed = true;
    }
    if (fields.staff && !str(header.staff)) {
      header.staff = fields.staff;
      changed = true;
    }
    if (!changed) {
      return { snap: snap, changed: false };
    }
    return {
      snap: Object.assign({}, snap || {}, { header: header }),
      changed: true,
    };
  }

  /**
   * @param {{
   *   episodesSnap?: object|null,
   *   collection?: object|null,
   *   rows?: Array<object>,
   * }} opts
   * @returns {{
   *   episodesSnap: object,
   *   collection: object|null,
   *   activeEpisodeId: string|null,
   *   episodesChanged: boolean,
   *   collectionChanged: boolean,
   *   imported: number,
   * }}
   */
  function importPolInternacoes(opts) {
    opts = opts || {};
    var pe = getPe();
    var hist = getHist();
    var collApi = getColl();
    if (!pe) {
      return {
        episodesSnap: opts.episodesSnap || { version: 1, entries: [], atualizadoEm: null },
        collection: opts.collection || null,
        activeEpisodeId: null,
        episodesChanged: false,
        collectionChanged: false,
        imported: 0,
      };
    }

    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var canon = hist && hist.canonicalizeActiveRows
      ? hist.canonicalizeActiveRows(rows)
      : rows.map(function (r) {
          return Object.assign({}, r, {
            status: r.endedAt ? "closed" : "active",
          });
        });

    var snap = pe.normalizeSnapshot(opts.episodesSnap || pe.emptySnapshot());
    var collection =
      collApi && opts.collection
        ? collApi.normalizeCollection(opts.collection)
        : opts.collection || null;
    var episodesChanged = false;
    var collectionChanged = false;
    var activeEpisodeId = null;
    var imported = 0;

    var closed = [];
    var active = null;
    for (var i = 0; i < canon.length; i++) {
      if (canon[i].status === "active") active = canon[i];
      else closed.push(canon[i]);
    }

    function upsertRow(row) {
      if (!row || !row.startedAt) return null;
      var existing = findHospitalizationByStartedAt(snap, row.startedAt);
      var entry = {
        id: existing ? existing.id : pe.newEpisodeId(),
        kind: "hospitalization",
        status: row.status === "active" ? "active" : "closed",
        startedAt: row.startedAt,
        endedAt: row.endedAt || null,
        label: str(row.label) || ("Internação " + isoToBr(row.startedAt)),
        notes: str(row.notes || row.description),
        diagnoses: existing && existing.diagnoses ? existing.diagnoses : [],
        complications:
          existing && existing.complications ? existing.complications : [],
        death: existing && existing.death ? existing.death : undefined,
        icuAdmissions:
          existing && existing.icuAdmissions ? existing.icuAdmissions : [],
      };
      if (entry.status === "active") {
        snap = pe.upsertEntryWithSingleActiveHospitalization(snap, entry);
      } else {
        snap = pe.upsertEntry(snap, entry);
      }
      episodesChanged = true;
      imported += 1;
      return pe.getEntry(snap, entry.id);
    }

    for (var c = 0; c < closed.length; c++) {
      upsertRow(closed[c]);
    }
    if (active) {
      var activeEntry = upsertRow(active);
      if (activeEntry) {
        activeEpisodeId = activeEntry.id;
        if (collApi) {
          var ensured = collApi.ensureRegistroForEpisode(
            collection || collApi.emptyCollection(),
            activeEntry,
          );
          collection = ensured.collection;
          if (ensured.created) collectionChanged = true;

          var reg = collApi.findRegistro(collection, activeEntry.id);
          if (reg && reg.snap) {
            var dih =
              str(active.startedAtBr) ||
              isoToBr(active.startedAt) ||
              "";
            var filled = fillEmptyPassometroHeader(reg.snap, {
              dih: dih,
              staff: str(active.staff),
            });
            if (filled.changed) {
              var up = collApi.upsertRegistro(
                collection,
                activeEntry.id,
                filled.snap,
              );
              collection = up.collection;
              collectionChanged = true;
            }
          }
        }
      }
    }

    if (episodesChanged) {
      snap = Object.assign({}, snap, { atualizadoEm: pe.nowIso() });
    }

    return {
      episodesSnap: snap,
      collection: collection,
      activeEpisodeId: activeEpisodeId,
      episodesChanged: episodesChanged,
      collectionChanged: collectionChanged,
      imported: imported,
    };
  }

  /**
   * Funde dois snapshots: hospitalization por startedAt (incoming prevalece em campos).
   */
  function mergeHospitalizationSnapshots(base, incoming) {
    var pe = getPe();
    if (!pe) return base || incoming || null;
    var snap = pe.normalizeSnapshot(base || pe.emptySnapshot());
    var other = pe.normalizeSnapshot(incoming || pe.emptySnapshot());
    var rows = [];
    other.entries.forEach(function (e) {
      if (!e || e.deletedAt || e.kind !== "hospitalization" || !e.startedAt) return;
      rows.push({
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        status: e.status,
        label: e.label,
        notes: e.notes,
        staff: "",
        description: e.notes,
      });
    });
    var hist = getHist();
    if (hist && hist.canonicalizeActiveRows) {
      rows = hist.canonicalizeActiveRows(rows);
    }
    return importPolInternacoes({
      episodesSnap: snap,
      rows: rows,
    }).episodesSnap;
  }

  return {
    importPolInternacoes: importPolInternacoes,
    fillEmptyPassometroHeader: fillEmptyPassometroHeader,
    findHospitalizationByStartedAt: findHospitalizationByStartedAt,
    mergeHospitalizationSnapshots: mergeHospitalizationSnapshots,
  };
});
