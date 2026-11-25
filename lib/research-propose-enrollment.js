/**
 * GEN-09 — Propor paciente para estudo (screened/eligible + rowContext).
 * Web-only UX; lógica pura em lib/ para testes auto.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchProposeEnrollment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var registryApi = null;
  var studyProtocolApi = null;
  var hubEnrollmentApi = null;
  var patientEpisodesApi = null;
  var passometroCollectionApi = null;
  var passometroSchemaApi = null;

  try {
    if (typeof require === "function") {
      registryApi = require("./research-registry-schema.js");
      studyProtocolApi = require("./hpb-study-protocol.js");
      hubEnrollmentApi = require("./research-hub-enrollment.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      passometroCollectionApi = require("./passometro-collection.js");
      passometroSchemaApi = require("./passometro-schema.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function getProtocolGrain(protocol) {
    if (studyProtocolApi && studyProtocolApi.getProtocolCohortGrain) {
      return studyProtocolApi.getProtocolCohortGrain(protocol);
    }
    var g =
      protocol &&
      protocol.studyDesign &&
      protocol.studyDesign.cohortGrain
        ? str(protocol.studyDesign.cohortGrain)
        : "patient";
    if (g === "clinical_episode" || g === "surgery") return g;
    return "patient";
  }

  function latestActiveEpisodeId(patientDomains) {
    if (!patientEpisodesApi) return "";
    var snap = patientEpisodesApi.normalizeSnapshot(
      (patientDomains && patientDomains.patient_episodes) ||
        patientEpisodesApi.emptySnapshot(),
    );
    var active = patientEpisodesApi.filterActiveEntries(snap);
    if (!active.length) return "";
    return str(active[active.length - 1].id);
  }

  function defaultSurgeryIndex(patientDomains, episodeId) {
    if (!passometroCollectionApi || !passometroSchemaApi || !episodeId) {
      return 0;
    }
    var norm = passometroCollectionApi.normalizePassometroDomain(
      patientDomains && patientDomains.passometro,
      patientDomains && patientDomains.patient_episodes,
    );
    var snap = passometroCollectionApi.resolveSnapForEpisode(
      norm.collection,
      episodeId,
    );
    if (!snap || !snap.header) return 0;
    var cirurgias = passometroSchemaApi.normalizeCirurgiasFromHeader(
      snap.header,
    );
    if (!cirurgias.length) return 0;
    return cirurgias.length - 1;
  }

  /**
   * Monta rowContext estável a partir do contexto do hub + fallbacks.
   * @returns {{ grain: string, patientEpisodeId?: string, surgeryIndex?: number, entityId?: string }|null}
   */
  function buildRowContextForPropose(grain, hubContext, patientDomains) {
    hubContext = hubContext || {};
    grain = str(grain);
    if (grain === "patient" || !grain) return null;

    var episodeId =
      str(hubContext.patientEpisodeId) || latestActiveEpisodeId(patientDomains);

    if (grain === "clinical_episode") {
      if (!episodeId) return null;
      return registryApi && registryApi.normalizeRowContext
        ? registryApi.normalizeRowContext({
            grain: "clinical_episode",
            patientEpisodeId: episodeId,
          })
        : { grain: "clinical_episode", patientEpisodeId: episodeId };
    }

    if (grain === "surgery") {
      if (!episodeId) return null;
      var surgeryIndex =
        hubContext.surgeryIndex != null && hubContext.surgeryIndex !== ""
          ? Number(hubContext.surgeryIndex)
          : defaultSurgeryIndex(patientDomains, episodeId);
      if (isNaN(surgeryIndex) || surgeryIndex < 0) surgeryIndex = 0;
      return registryApi && registryApi.normalizeRowContext
        ? registryApi.normalizeRowContext({
            grain: "surgery",
            patientEpisodeId: episodeId,
            surgeryIndex: surgeryIndex,
          })
        : {
            grain: "surgery",
            patientEpisodeId: episodeId,
            surgeryIndex: Math.floor(surgeryIndex),
          };
    }

    // FEAT-098: entity:{id} — exige entityId do hub
    if (
      studyProtocolApi &&
      studyProtocolApi.isEntityGrain &&
      studyProtocolApi.isEntityGrain(grain)
    ) {
      var entityId = str(hubContext.entityId);
      if (!entityId) return null;
      return registryApi && registryApi.normalizeRowContext
        ? registryApi.normalizeRowContext({ grain: grain, entityId: entityId })
        : { grain: grain, entityId: entityId };
    }

    return null;
  }

  /**
   * Propõe paciente para o protocolo activo: screened | eligible (+ rowContext).
   * Cria blob research_registry na 1ª escrita (normalizeRegistry + setEnrollmentStatus).
   *
   * @returns {{
   *   ok: boolean,
   *   reason?: string,
   *   registry: object,
   *   status?: string,
   *   rowContext?: object|null,
   *   createdRegistry?: boolean
   * }}
   */
  function proposePatientForStudy(registry, protocol, patientDomains, opts) {
    opts = opts || {};
    if (!registryApi || !protocol || !protocol.id) {
      return {
        ok: false,
        reason: "unavailable",
        registry: registry || (registryApi && registryApi.emptyRegistry()),
      };
    }

    var hadRegistry = !!(registry && typeof registry === "object");
    var reg = registryApi.normalizeRegistry(registry);
    if (registryApi.isRegistryFrozen(reg)) {
      return { ok: false, reason: "frozen", registry: reg };
    }

    var protocolId = str(protocol.id);
    var bucket = registryApi.getProtocolBucket(reg, protocolId);
    var current = bucket.enrollment && bucket.enrollment.status;

    if (current === "withdrawn") {
      return { ok: false, reason: "withdrawn", registry: reg };
    }
    if (current === "enrolled") {
      return { ok: false, reason: "already_enrolled", registry: reg };
    }

    var grain = getProtocolGrain(protocol);
    var rowContext = null;
    if (grain === "clinical_episode" || grain === "surgery") {
      rowContext = buildRowContextForPropose(
        grain,
        opts.hubContext,
        patientDomains,
      );
      if (!rowContext) {
        return {
          ok: false,
          reason: "row_context_required",
          registry: reg,
        };
      }
    }

    var status = "screened";
    if (hubEnrollmentApi && hubEnrollmentApi.evaluateProtocolEligibilityForHub) {
      var ev = hubEnrollmentApi.evaluateProtocolEligibilityForHub(
        protocol,
        reg,
        patientDomains && patientDomains.hpb_registry,
        patientDomains || {},
      );
      if (ev && ev.eligible) status = "eligible";
    }

    var meta = {};
    if (rowContext) meta.rowContext = rowContext;
    else meta.rowContext = null;

    var next = registryApi.setEnrollmentStatus(reg, protocolId, status, meta);
    return {
      ok: true,
      registry: next,
      status: status,
      rowContext: rowContext,
      createdRegistry: !hadRegistry,
    };
  }

  return {
    proposePatientForStudy: proposePatientForStudy,
    buildRowContextForPropose: buildRowContextForPropose,
    getProtocolGrain: getProtocolGrain,
  };
});
