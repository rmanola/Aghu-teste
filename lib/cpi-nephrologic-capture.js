/**
 * FEAT-149 — Schemas nefrológicos + seguimento longitudinal sobre FEAT-143.
 * schemaId: "nephrologic" (episode) | "longitudinal-followup" (longitudinal).
 * Sem I/O. Sem segunda tabela PHI.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiNephrologicCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var schemaApi = load("cpi-capture-schema.js", "AghuCpiCaptureSchema");
  var followupApi = load(
    "cpi-longitudinal-followup.js",
    "AghuCpiLongitudinalFollowup",
  );

  var NEPHROLOGIC_SCHEMA_ID = "nephrologic";
  var LONGITUDINAL_SCHEMA_ID = "longitudinal-followup";
  var WRITE_PERMISSION = "write_clinical_capture";
  var CAPTURE_VERSION = 1;

  var NEPHROTOXIN_SUSPENDED = Object.freeze([
    "suspended",
    "dose_adjusted",
    "maintained_justified",
    "not_applicable",
  ]);
  var NEPHROTOXIN_CLASS = Object.freeze([
    "aminoglicosideo",
    "aine",
    "ieca_ara2",
    "contraste",
    "vancomicina",
    "outro",
    "nenhum",
  ]);
  var EGFR_STAGES = Object.freeze(["G1", "G2", "G3a", "G3b", "G4", "G5"]);
  var DECOMP_EVENTS = Object.freeze([
    "nenhum",
    "ascite",
    "encefalopatia",
    "hemorragia_varicosa",
    "peritonite_bacteriana",
    "outro",
  ]);

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function episodeSchemaDef() {
    return {
      schemaId: NEPHROLOGIC_SCHEMA_ID,
      careLineId: "nef_lesao_renal_aguda",
      captureKind: "episode",
      captureVersion: CAPTURE_VERSION,
      fields: [
        {
          key: "nephrotoxinSuspended",
          label: "Suspensão ou ajuste de nefrotóxico",
          type: "enum",
          values: NEPHROTOXIN_SUSPENDED.slice(),
          required: true,
          feedsIndicators: ["NEF-PRO-02"],
        },
        {
          key: "nephrotoxinClass",
          label: "Classe do nefrotóxico envolvido",
          type: "enum",
          values: NEPHROTOXIN_CLASS.slice(),
          required: false,
          feedsIndicators: ["NEF-PRO-02"],
        },
        {
          key: "contrastExamAtIso",
          label: "Data do exame com contraste (se aplicável)",
          type: "date",
          required: false,
          feedsIndicators: ["NEF-SAF-02"],
        },
        {
          key: "contrastExamRef",
          label: "Exame com contraste",
          type: "text",
          required: false,
          feedsIndicators: ["NEF-SAF-02"],
        },
      ],
    };
  }

  function tfgSchemaDef() {
    var sched =
      (followupApi && followupApi.MILESTONE_SCHEDULES.nef_doenca_renal_cronica) ||
      {};
    return {
      schemaId: LONGITUDINAL_SCHEMA_ID,
      careLineId: "nef_doenca_renal_cronica",
      captureKind: "longitudinal",
      captureVersion: CAPTURE_VERSION,
      milestones: {
        key: sched.key || "tfg_seguimento",
        anchor: "dischargeAt",
        windowsDays: (sched.windowsDays || [90, 365, 730]).slice(),
        graceDays: sched.graceDays != null ? sched.graceDays : 60,
      },
      fields: [
        {
          key: "egfrAtMilestone",
          label: "TFG-e no marco",
          type: "number",
          unit: "mL/min/1.73m2",
          required: true,
          feedsIndicators: ["NEF-OUT-03"],
        },
        {
          key: "egfrStageAtMilestone",
          label: "Estádio de TFG no marco",
          type: "enum",
          values: EGFR_STAGES.slice(),
          required: true,
          feedsIndicators: ["NEF-OUT-03"],
        },
      ],
    };
  }

  function cirrhosisSchemaDef() {
    var sched =
      (followupApi && followupApi.MILESTONE_SCHEDULES.cad_cirrose_hepatica) || {};
    return {
      schemaId: LONGITUDINAL_SCHEMA_ID,
      careLineId: "cad_cirrose_hepatica",
      captureKind: "longitudinal",
      captureVersion: CAPTURE_VERSION,
      milestones: {
        key: sched.key || "descompensacao_seguimento",
        anchor: "dischargeAt",
        windowsDays: (sched.windowsDays || [365, 730]).slice(),
        graceDays: sched.graceDays != null ? sched.graceDays : 60,
      },
      fields: [
        {
          key: "decompensationEvent",
          label: "Evento de descompensação desde a alta",
          type: "enum",
          values: DECOMP_EVENTS.slice(),
          required: true,
          feedsIndicators: ["CAD-OUT-03"],
        },
        {
          key: "decompensationAtIso",
          label: "Data do evento (se ocorreu)",
          type: "date",
          required: false,
          feedsIndicators: ["CAD-OUT-03"],
        },
      ],
    };
  }

  function registerNephrologicSchemas() {
    if (!schemaApi || typeof schemaApi.registerCaptureSchema !== "function") {
      return { ok: false, errors: ["motor de schema em falta"], schemas: [] };
    }
    var defs = [episodeSchemaDef(), tfgSchemaDef(), cirrhosisSchemaDef()];
    var schemas = [];
    var errors = [];
    for (var i = 0; i < defs.length; i++) {
      var result = schemaApi.registerCaptureSchema(defs[i]);
      if (!result.ok) {
        errors = errors.concat(result.errors || ["registo falhou"]);
      } else if (result.schema) {
        schemas.push(result.schema);
      }
    }
    return { ok: errors.length === 0, errors: errors, schemas: schemas };
  }

  registerNephrologicSchemas();

  return {
    NEPHROLOGIC_SCHEMA_ID: NEPHROLOGIC_SCHEMA_ID,
    LONGITUDINAL_SCHEMA_ID: LONGITUDINAL_SCHEMA_ID,
    WRITE_PERMISSION: WRITE_PERMISSION,
    CAPTURE_VERSION: CAPTURE_VERSION,
    NEPHROTOXIN_SUSPENDED: NEPHROTOXIN_SUSPENDED,
    NEPHROTOXIN_CLASS: NEPHROTOXIN_CLASS,
    EGFR_STAGES: EGFR_STAGES,
    DECOMP_EVENTS: DECOMP_EVENTS,
    episodeSchemaDef: episodeSchemaDef,
    tfgSchemaDef: tfgSchemaDef,
    cirrhosisSchemaDef: cirrhosisSchemaDef,
    registerNephrologicSchemas: registerNephrologicSchemas,
    isNephrologicEpisodeLine: function (careLineId) {
      return str(careLineId) === "nef_lesao_renal_aguda";
    },
    isLongitudinalCareLine: function (careLineId) {
      var id = str(careLineId);
      return id === "nef_doenca_renal_cronica" || id === "cad_cirrose_hepatica";
    },
  };
});
