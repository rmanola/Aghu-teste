/**
 * Sync seguro episódio clínico → diagnósticos no passômetro (coleção v2).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuPatientEpisodesPassometroDiagnosisSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var collectionApi = null;
  var episodesBridgeApi = null;

  try {
    if (typeof require === "function") {
      collectionApi = require("./passometro-collection.js");
      episodesBridgeApi = require("./passometro-episodes-bridge.js");
    }
  } catch (_e) {}

  function snapHasClinicalContent(snap) {
    if (!snap || typeof snap !== "object") return false;
    if (Array.isArray(snap.entries) && snap.entries.length) return true;
    var header = snap.header;
    if (!header || typeof header !== "object") return false;
    return Object.keys(header).some(function (k) {
      var v = header[k];
      return v != null && String(v).trim() !== "";
    });
  }

  /**
   * @returns {{ collection: object, changed: boolean }}
   */
  function applyEpisodeDiagnosisSyncToPassometroCollection(
    collection,
    patientEpisodesSnap,
    episodeId,
  ) {
    if (!collectionApi || !episodesBridgeApi || !episodeId) {
      return { collection: collection || {}, changed: false };
    }
    var registro = collectionApi.findRegistro(collection, episodeId);
    if (!registro) {
      return { collection: collection, changed: false };
    }
    var baseSnap = registro.snap || {
      header: {},
      entries: [],
      atualizadoEm: null,
    };
    var hadContent = snapHasClinicalContent(baseSnap);
    var sync = episodesBridgeApi.syncEpisodeDiagnosesToPassometroSnap(
      patientEpisodesSnap,
      episodeId,
      baseSnap,
    );
    if (!sync.changed || !sync.passometro) {
      return { collection: collection, changed: false };
    }
    if (hadContent && !snapHasClinicalContent(sync.passometro)) {
      return { collection: collection, changed: false };
    }
    var upserted = collectionApi.upsertRegistro(
      collection,
      episodeId,
      sync.passometro,
    );
    return { collection: upserted.collection, changed: true };
  }

  return {
    snapHasClinicalContent: snapHasClinicalContent,
    applyEpisodeDiagnosisSyncToPassometroCollection:
      applyEpisodeDiagnosisSyncToPassometroCollection,
  };
});
