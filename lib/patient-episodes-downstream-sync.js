/**
 * Orquestra sincronização clínico → HPB + Research no save de patient_episodes.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuPatientEpisodesDownstreamSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var hpbBridgeApi = null;
  var researchClinicalApi = null;
  var patientEpisodesApi = null;

  try {
    if (typeof require === "function") {
      hpbBridgeApi = require("./patient-episodes-hpb-bridge.js");
      researchClinicalApi = require("./research-clinical-sync.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
    }
  } catch (_e) {}

  function applyClinicalDownstreamSync(opts) {
    opts = opts || {};
    var snap = opts.patientEpisodesSnap;
    if (patientEpisodesApi && snap) {
      snap = patientEpisodesApi.normalizeSnapshot(snap);
    }
    var hpbRegistry = opts.hpbRegistry || null;
    var researchRegistry = opts.researchRegistry || null;
    var protocols = opts.protocols || [];
    var overwrite = opts.overwrite !== false;

    var hpbChanged = false;
    var researchChanged = false;

    if (hpbBridgeApi && hpbRegistry != null) {
      var hpbOut = hpbBridgeApi.applyClinicalSyncToHpbRegistry(snap, hpbRegistry, {
        editedEpisodeId: opts.editedEpisodeId,
        overwrite: overwrite,
      });
      hpbRegistry = hpbOut.hpbRegistry;
      hpbChanged = !!hpbOut.changed;
    }

    if (researchClinicalApi && researchRegistry != null && protocols.length) {
      var resOut = researchClinicalApi.applyClinicalSyncToResearchRegistry(
        snap,
        researchRegistry,
        protocols,
        {
          editedEpisodeId: opts.editedEpisodeId,
          overwrite: overwrite,
        },
      );
      researchRegistry = resOut.registry;
      researchChanged = !!resOut.changed;
    }

    return {
      patientEpisodesSnap: snap,
      hpbRegistry: hpbRegistry,
      researchRegistry: researchRegistry,
      hpbChanged: hpbChanged,
      researchChanged: researchChanged,
    };
  }

  return {
    applyClinicalDownstreamSync: applyClinicalDownstreamSync,
  };
});
