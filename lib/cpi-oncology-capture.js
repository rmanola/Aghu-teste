/**
 * FEAT-148 — Schema oncológico sobre o motor da FEAT-143.
 * schemaId: "oncologic", captureKind: "episode".
 * Derivação TNM/ECOG (FEAT-144); precedência captura > HPB (mesma regra da 147).
 * Sem I/O. Sem segunda implementação de fusão genérica HPB.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiOncologyCapture = api;
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
  var tnmApi = load("tnm-stage.js", "AghuTnmStage");
  var ecogApi = load("ecog-status.js", "AghuEcogStatus");

  var SCHEMA_ID = "oncologic";
  var CAPTURE_KIND = "episode";
  var WRITE_PERMISSION = "write_clinical_capture";

  var MARGEM_VALUES = Object.freeze(["r0", "r1", "r2", "nao_avaliavel"]);
  var TNM_BASIS_VALUES = Object.freeze(["clinical", "pathological"]);

  var FORBIDDEN_TOPOGRAPHIES = Object.freeze({
    esofago: true,
    esophagus: true,
    jeg: true,
    gastroesophageal_junction: true,
    gej: true,
    esofago_jeg: true,
  });

  var CARE_LINE_TOPOGRAPHY = Object.freeze({
    cad_cancer_colorretal: "colorretal",
    cad_esofagogastrica: "esofagogastrica",
  });

  var CARE_LINE_IDS = Object.freeze([
    "cad_cancer_colorretal",
    "cad_esofagogastrica",
    "cad_duodenopancreatectomia",
  ]);

  var T_VALUES = Object.freeze([
    "Tis",
    "T1",
    "T1a",
    "T1b",
    "T2",
    "T3",
    "T4",
    "T4a",
    "T4b",
    "TX",
  ]);
  var N_VALUES_CRC = Object.freeze([
    "N0",
    "N1",
    "N1a",
    "N1b",
    "N1c",
    "N2",
    "N2a",
    "N2b",
    "NX",
  ]);
  var N_VALUES_EG = Object.freeze([
    "N0",
    "N1",
    "N2",
    "N3",
    "N3a",
    "N3b",
    "NX",
  ]);
  var M_VALUES = Object.freeze(["M0", "M1", "M1a", "M1b", "M1c", "MX"]);

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function hasYpPrefix(raw) {
    return /^yp/i.test(str(raw));
  }

  function topographyForCareLine(careLineId) {
    var id = str(careLineId);
    return CARE_LINE_TOPOGRAPHY[id] || null;
  }

  function tnmFields(indicatorId, nValues) {
    return [
      {
        key: "tStage",
        label: "Categoria T",
        type: "enum",
        values: T_VALUES.slice(),
        required: true,
        feedsIndicators: [indicatorId],
      },
      {
        key: "nStage",
        label: "Categoria N",
        type: "enum",
        values: nValues.slice(),
        required: true,
        feedsIndicators: [indicatorId],
      },
      {
        key: "mStage",
        label: "Categoria M",
        type: "enum",
        values: M_VALUES.slice(),
        required: true,
        feedsIndicators: [indicatorId],
      },
      {
        key: "tnmBasis",
        label: "Base do estadiamento (cTNM ou pTNM)",
        type: "enum",
        values: TNM_BASIS_VALUES.slice(),
        required: true,
        feedsIndicators: [indicatorId],
      },
      {
        key: "stageGroup",
        label: "Estádio agrupado (calculado)",
        type: "text",
        required: false,
        feedsIndicators: [indicatorId],
      },
      {
        key: "edition",
        label: "Edição do critério TNM (calculada)",
        type: "text",
        required: false,
        feedsIndicators: [indicatorId],
      },
    ];
  }

  function margemField() {
    return {
      key: "margemR0",
      label: "Margem cirúrgica",
      type: "enum",
      values: MARGEM_VALUES.slice(),
      required: true,
      feedsIndicators: ["CAD-VAL-01"],
    };
  }

  function ecogField() {
    return {
      key: "ecogScore",
      label: "ECOG Performance Status",
      type: "number",
      unit: "score",
      required: true,
      feedsIndicators: ["CAD-PRO-03"],
    };
  }

  function schemaDefForLine(careLineId) {
    var line = str(careLineId);
    if (line === "cad_duodenopancreatectomia") {
      return {
        schemaId: SCHEMA_ID,
        careLineId: line,
        captureKind: CAPTURE_KIND,
        captureVersion: 1,
        fields: [margemField()],
      };
    }
    if (line === "cad_esofagogastrica") {
      return {
        schemaId: SCHEMA_ID,
        careLineId: line,
        captureKind: CAPTURE_KIND,
        captureVersion: 1,
        fields: tnmFields("CAD-eso-PRO-01", N_VALUES_EG).concat([ecogField()]),
      };
    }
    // cad_cancer_colorretal
    return {
      schemaId: SCHEMA_ID,
      careLineId: line,
      captureKind: CAPTURE_KIND,
      captureVersion: 1,
      fields: tnmFields("CAD-PRO-04", N_VALUES_CRC).concat([
        ecogField(),
        margemField(),
        {
          key: "mdtDiscussed",
          label: "Discussão em MDT",
          type: "boolean",
          required: true,
          feedsIndicators: ["CAD-PRO-02"],
        },
        {
          key: "mdtDate",
          label: "Data da discussão em MDT",
          type: "date",
          required: false,
          feedsIndicators: ["CAD-PRO-02"],
        },
        {
          key: "mdtDecisionFollowed",
          label: "Decisão do MDT seguida",
          type: "boolean",
          required: false,
          feedsIndicators: ["CAD-PRO-05"],
        },
      ]),
    };
  }

  function registerOncologySchemas() {
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

  /**
   * CPIONC-AC-02/03/05 — deriva estádio via stageTnm (FEAT-144).
   * Recusa esôfago/JEG e ypTNM na captura (residual P1 FEAT-144).
   */
  function deriveOncologyStage(input) {
    var o = input && typeof input === "object" ? input : {};
    var topography = str(o.topography);
    var basis = str(o.tnmBasis || o.basis);

    if (!basis) {
      return { valid: false, invalidComponent: "basis" };
    }
    if (basis !== "clinical" && basis !== "pathological") {
      return { valid: false, invalidComponent: "basis" };
    }
    if (!topography) {
      return { valid: false, invalidComponent: "topography" };
    }
    if (FORBIDDEN_TOPOGRAPHIES[topography.toLowerCase()]) {
      return {
        valid: false,
        invalidComponent: "topography",
        reason:
          "topografia sem tabela de captura: use esofagogastrica (estômago) ou colorretal",
      };
    }
    if (
      hasYpPrefix(o.tStage) ||
      hasYpPrefix(o.nStage) ||
      hasYpPrefix(o.mStage) ||
      /^yp/i.test(basis)
    ) {
      return {
        valid: false,
        invalidComponent: "basis",
        reason: "ypTNM não é aceite na captura oncológica",
      };
    }
    if (!tnmApi || typeof tnmApi.stageTnm !== "function") {
      return { valid: false, invalidComponent: "t" };
    }
    try {
      var result = tnmApi.stageTnm({
        t: o.tStage,
        n: o.nStage,
        m: o.mStage,
        topography: topography,
        basis: basis,
      });
      return {
        valid: true,
        stageGroup: result.stageGroup,
        edition: result.edition,
        basis: basis,
        t: result.t,
        n: result.n,
        m: result.m,
      };
    } catch (e) {
      var msg = String((e && e.message) || e);
      var invalidComponent = "t";
      if (/componente n/i.test(msg)) invalidComponent = "n";
      else if (/componente m/i.test(msg)) invalidComponent = "m";
      else if (/basis/i.test(msg)) invalidComponent = "basis";
      else if (/topografia/i.test(msg)) invalidComponent = "topography";
      return { valid: false, invalidComponent: invalidComponent, reason: msg };
    }
  }

  /** CPIONC-AC-06 — ECOG via assignEcog (FEAT-144); missing ≠ 0. */
  function assessEcogCapture(score) {
    if (score == null || score === "") {
      return { valid: false, missing: true };
    }
    if (!ecogApi || typeof ecogApi.assignEcog !== "function") {
      return { valid: false, missing: false };
    }
    try {
      var r = ecogApi.assignEcog({ score: score });
      return {
        valid: true,
        score: r.score,
        label: r.label,
        edition: r.edition,
      };
    } catch (_e) {
      return { valid: false, missing: false };
    }
  }

  /** CPIONC-AC-10 — MDT condicional. */
  function validateMdtBlock(values, unanswered) {
    var v = values && typeof values === "object" ? values : {};
    var un = Array.isArray(unanswered) ? unanswered : [];
    if (un.indexOf("mdtDiscussed") !== -1) {
      return { ok: true };
    }
    if (!Object.prototype.hasOwnProperty.call(v, "mdtDiscussed")) {
      return { ok: true };
    }
    if (v.mdtDiscussed !== true) {
      return { ok: true };
    }
    var missing = [];
    if (v.mdtDate == null || v.mdtDate === "") missing.push("mdtDate");
    if (
      v.mdtDecisionFollowed == null ||
      (v.mdtDecisionFollowed !== true && v.mdtDecisionFollowed !== false)
    ) {
      missing.push("mdtDecisionFollowed");
    }
    if (missing.length) return { ok: false, missing: missing };
    return { ok: true };
  }

  /** CPIONC-AC-08 — transporte de revisão (retrato completo, só o patch digitado). */
  function buildCarryForwardRevision(latestRecord, patch) {
    var latest =
      latestRecord && typeof latestRecord === "object" ? latestRecord : {};
    var baseValues =
      latest.values && typeof latest.values === "object" ? latest.values : {};
    var p = patch && typeof patch === "object" ? patch : {};
    var values = Object.assign({}, baseValues, p);
    var unanswered = Array.isArray(latest.unanswered)
      ? latest.unanswered.filter(function (k) {
          return !Object.prototype.hasOwnProperty.call(p, k);
        })
      : [];
    return { values: values, unanswered: unanswered };
  }

  /**
   * CPIONC-AC-13 — mesma política da FEAT-147 (captura vence; HPB reserva).
   * Função específica a margem — não é resolvedor genérico HPB.
   */
  function resolveOncologyMargin(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    if (o.captureValue != null && !o.captureUnanswered) {
      return { value: o.captureValue, source: "capture" };
    }
    if (o.hpbCohortValue != null) {
      return { value: o.hpbCohortValue, source: "hpb" };
    }
    return { value: null, source: null };
  }

  /**
   * Monta values prontos para o motor (inclui stageGroup/edition quando TNM completo).
   */
  function buildOncologyCaptureValues(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var careLineId = str(o.careLineId);
    var values =
      o.values && typeof o.values === "object" ? Object.assign({}, o.values) : {};
    var unanswered = Array.isArray(o.unanswered) ? o.unanswered.slice() : [];

    if (careLineId === "cad_duodenopancreatectomia") {
      return { ok: true, values: values, unanswered: unanswered };
    }

    var hasTnm =
      values.tStage != null &&
      values.nStage != null &&
      values.mStage != null &&
      values.tnmBasis != null;
    if (hasTnm) {
      var topo = topographyForCareLine(careLineId);
      var staged = deriveOncologyStage({
        tStage: values.tStage,
        nStage: values.nStage,
        mStage: values.mStage,
        tnmBasis: values.tnmBasis,
        topography: topo,
      });
      if (!staged.valid) {
        return {
          ok: false,
          invalidComponent: staged.invalidComponent,
          reason: staged.reason || "TNM inválido",
          values: values,
          unanswered: unanswered,
        };
      }
      values.stageGroup = staged.stageGroup;
      values.edition = staged.edition;
    }

    if (Object.prototype.hasOwnProperty.call(values, "ecogScore")) {
      var ecog = assessEcogCapture(values.ecogScore);
      if (!ecog.valid) {
        return {
          ok: false,
          invalidComponent: "ecogScore",
          reason: "ECOG fora do domínio 0–4",
          values: values,
          unanswered: unanswered,
        };
      }
      values.ecogScore = ecog.score;
    }

    if (careLineId === "cad_cancer_colorretal") {
      var mdt = validateMdtBlock(values, unanswered);
      if (!mdt.ok) {
        return {
          ok: false,
          missing: mdt.missing,
          reason: "bloco MDT incompleto",
          values: values,
          unanswered: unanswered,
        };
      }
    }

    return { ok: true, values: values, unanswered: unanswered };
  }

  registerOncologySchemas();

  return {
    SCHEMA_ID: SCHEMA_ID,
    CAPTURE_KIND: CAPTURE_KIND,
    WRITE_PERMISSION: WRITE_PERMISSION,
    MARGEM_VALUES: MARGEM_VALUES,
    TNM_BASIS_VALUES: TNM_BASIS_VALUES,
    CARE_LINE_IDS: CARE_LINE_IDS,
    CARE_LINE_TOPOGRAPHY: CARE_LINE_TOPOGRAPHY,
    schemaDefForLine: schemaDefForLine,
    registerOncologySchemas: registerOncologySchemas,
    topographyForCareLine: topographyForCareLine,
    deriveOncologyStage: deriveOncologyStage,
    assessEcogCapture: assessEcogCapture,
    validateMdtBlock: validateMdtBlock,
    buildCarryForwardRevision: buildCarryForwardRevision,
    resolveOncologyMargin: resolveOncologyMargin,
    buildOncologyCaptureValues: buildOncologyCaptureValues,
  };
});
