/**
 * FEAT-147 — Schema perioperatório sobre o motor da FEAT-143.
 * schemaId: "perioperative", captureKind: "episode". Sem I/O.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCaptureSchemaPerioperative = api;
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

  var SCHEMA_ID = "perioperative";
  var CAPTURE_KIND = "episode";
  var WRITE_PERMISSION = "write_clinical_capture";

  var CLAVIEN_VALUES = Object.freeze([
    "0",
    "I",
    "II",
    "IIIa",
    "IIIb",
    "IVa",
    "IVb",
    "V",
  ]);

  var CLAVIEN_SAF_BY_LINE = {
    cg_apendicite_aguda: ["CG-ape-SAF-01"],
    cg_colecistite_aguda: ["CG-col-SAF-01"],
    cg_hernias_abdominais: ["CG-her-SAF-01"],
    cad_cancer_colorretal: ["CAD-SAF-01", "CAD-VAL-02"],
    cg_abdome_agudo_obstrucao: ["CG-obs-SAF-02"],
    cad_esofagogastrica: ["CAD-eso-SAF-01"],
  };

  var EXTRA_FIELDS_BY_LINE = {
    cad_cancer_colorretal: [
      {
        key: "unplannedReintervention",
        label: "Reintervenção não planeada até 30 dias",
        type: "boolean",
        required: true,
        feedsIndicators: ["CAD-SAF-02", "CAD-VAL-02"],
      },
      {
        key: "unplannedReinterventionDate",
        label: "Data da reintervenção não planeada",
        type: "date",
        required: false,
        feedsIndicators: ["CAD-SAF-02"],
      },
    ],
    cg_abdome_agudo_obstrucao: [
      {
        key: "doorTimeIso",
        label: "Hora de chegada ao serviço de urgência (marco porta)",
        type: "date",
        unit: "datetime",
        required: true,
        feedsIndicators: ["CG-obs-PRO-01"],
      },
    ],
  };

  var CARE_LINE_IDS = Object.freeze(Object.keys(CLAVIEN_SAF_BY_LINE));

  function clavienField(careLineId) {
    return {
      key: "clavienMax",
      label: "Grau Clavien-Dindo máximo até 30 dias",
      type: "enum",
      values: CLAVIEN_VALUES.slice(),
      required: true,
      feedsIndicators: (CLAVIEN_SAF_BY_LINE[careLineId] || []).slice(),
    };
  }

  function schemaDefForLine(careLineId) {
    var extras = EXTRA_FIELDS_BY_LINE[careLineId] || [];
    return {
      schemaId: SCHEMA_ID,
      careLineId: careLineId,
      captureKind: CAPTURE_KIND,
      captureVersion: 1,
      fields: [clavienField(careLineId)].concat(extras),
    };
  }

  function registerPerioperativeSchemas() {
    if (!schemaApi || typeof schemaApi.registerCaptureSchema !== "function") {
      return { ok: false, errors: ["motor de schema em falta"], schemas: [] };
    }
    var schemas = [];
    var errors = [];
    for (var i = 0; i < CARE_LINE_IDS.length; i++) {
      var def = schemaDefForLine(CARE_LINE_IDS[i]);
      var result = schemaApi.registerCaptureSchema(def);
      if (!result.ok) {
        errors = errors.concat(result.errors || ["registo falhou"]);
      } else if (result.schema) {
        schemas.push(result.schema);
      }
    }
    return { ok: errors.length === 0, errors: errors, schemas: schemas };
  }

  registerPerioperativeSchemas();

  return {
    SCHEMA_ID: SCHEMA_ID,
    CAPTURE_KIND: CAPTURE_KIND,
    WRITE_PERMISSION: WRITE_PERMISSION,
    CLAVIEN_VALUES: CLAVIEN_VALUES,
    CARE_LINE_IDS: CARE_LINE_IDS,
    CLAVIEN_SAF_BY_LINE: CLAVIEN_SAF_BY_LINE,
    schemaDefForLine: schemaDefForLine,
    registerPerioperativeSchemas: registerPerioperativeSchemas,
  };
});
