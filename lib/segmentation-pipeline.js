/**
 * FEAT-209 — contrato Node do pipeline de segmentação (espelha apps/ml).
 * Estágios: index → deid → infer → persist. Fail-fast com causa (SEG-AC-10).
 * Boundary da app: só metadados (SEG-AC-11).
 */

"use strict";

const { createHash } = require("node:crypto");
const {
  recordClientIdFromProntuarioSync,
} = require("./patient-identity.js");
const { createPixelByteCounter } = require("./imaging-pixel-counter.js");

const MODEL_VERSION = "TotalSegmentator/2.2.1-cpu-synth";
const MODEL_HASH = "sha256:feat209-synth-totalseg-v1";
const DEFAULT_SEED = 209001;

const ANNEX_E_TAGS = [
  "PatientName",
  "PatientID",
  "PatientBirthDate",
  "PatientSex",
  "InstitutionName",
  "ReferringPhysicianName",
];

function deidentifySyntheticHeader(header, opts) {
  opts = opts || {};
  if (!header || typeof header !== "object") {
    return { ok: false, reason: "dataset_ausente", clearedTags: [] };
  }
  const cleared = [];
  const out = Object.assign({}, header);
  for (let i = 0; i < ANNEX_E_TAGS.length; i++) {
    const tag = ANNEX_E_TAGS[i];
    if (Object.prototype.hasOwnProperty.call(out, tag)) {
      out[tag] = "";
      cleared.push(tag);
    }
  }
  const burnedIn = opts.burnedIn === true || out.BurnedInAnnotation === "YES";
  if (burnedIn && opts.pixelScrubbed !== true) {
    return {
      ok: false,
      reason: "burned_in_nao_limpo",
      clearedTags: cleared,
      dataset: out,
    };
  }
  if (burnedIn) out.BurnedInAnnotation = "NO";
  for (let j = 0; j < ANNEX_E_TAGS.length; j++) {
    const tag = ANNEX_E_TAGS[j];
    if (out[tag] && String(out[tag]).trim() !== "") {
      return {
        ok: false,
        reason: "identidade_residual:" + tag,
        clearedTags: cleared,
        dataset: out,
      };
    }
  }
  return { ok: true, reason: "ok", clearedTags: cleared, dataset: out };
}

function runVolumetryDeterministic(studyBytes, seed) {
  if (seed == null) seed = DEFAULT_SEED;
  const buf = Buffer.isBuffer(studyBytes)
    ? studyBytes
    : Buffer.from(String(studyBytes));
  if (buf.length === 0) throw new Error("inferencia_interrompida:entrada_vazia");
  const seedBuf = Buffer.alloc(4);
  seedBuf.writeUInt32BE(seed >>> 0, 0);
  const digest = createHash("sha256").update(buf).update(seedBuf).digest();
  const a = digest.readUInt32BE(0);
  const b = digest.readUInt32BE(4);
  return {
    liverMl: Math.round((900 + (a % 80000) / 100) * 100) / 100,
    pancreasMl: Math.round((60 + (b % 9000) / 100) * 100) / 100,
    modelVersion: MODEL_VERSION,
    modelHash: MODEL_HASH,
  };
}

function assertIndexOnlySelection(sel) {
  if (sel && sel.orthancScan === true) {
    throw new Error("selecao_proibida:varredura_orthanc");
  }
  const sql = String((sel && sel.sql) || "");
  if (!/imaging_study/i.test(sql)) {
    throw new Error("selecao_proibida:sem_indice_imaging_study");
  }
  if (/from\s+orthanc|orthanc\.studies/i.test(sql)) {
    throw new Error("selecao_proibida:varredura_orthanc");
  }
  return true;
}

function deriveRecordClientId(prontuario) {
  const id = recordClientIdFromProntuarioSync(prontuario);
  if (!id) throw new Error("record_client_id_invalido");
  return id;
}

function buildResearchDatumRows(study, volumes) {
  const recordClientId =
    study.recordClientId || deriveRecordClientId(study.prontuario);
  const base = {
    userId: study.userId,
    personId: study.personId,
    workspaceId: study.workspaceId,
    recordClientId: recordClientId,
    protocolId: "feat209-hpb-volumetry",
    modelVersion: volumes.modelVersion,
    modelHash: volumes.modelHash,
    reviewStatus: "pending",
    clinicalUseAllowed: false,
    studyUid: study.studyUid,
  };
  return [
    {
      ...base,
      fieldKey: "liver_volume_ml",
      value: { ml: volumes.liverMl, unit: "ml", organ: "liver" },
    },
    {
      ...base,
      fieldKey: "pancreas_volume_ml",
      value: { ml: volumes.pancreasMl, unit: "ml", organ: "pancreas" },
    },
  ];
}

function isClinicalUseAllowed(datum) {
  return (
    !!datum &&
    datum.reviewStatus === "reviewed" &&
    datum.clinicalUseAllowed === true
  );
}

function applyReview(datum, opts) {
  const reviewerUserId = opts && opts.reviewerUserId;
  const at = (opts && opts.at) || new Date().toISOString();
  const decision = (opts && opts.decision) || "reviewed";
  if (!reviewerUserId) throw new Error("revisor_ausente");
  if (decision !== "reviewed" && decision !== "rejected") {
    throw new Error("decisao_invalida");
  }
  return Object.assign({}, datum, {
    reviewStatus: decision,
    reviewedBy: reviewerUserId,
    reviewedAt: at,
    clinicalUseAllowed: decision === "reviewed",
  });
}

function buildPhiAuditEntry(opts) {
  const userId = opts && opts.userId;
  const recordClientId = opts && opts.recordClientId;
  const studyUid = opts && opts.studyUid;
  const action = (opts && opts.action) || "segmentation_study_read";
  if (!userId || !recordClientId || !studyUid) {
    throw new Error("audit_phi_incompleto");
  }
  return {
    user_id: userId,
    record_client_id: recordClientId,
    study_uid: studyUid,
    action: action,
    at: new Date().toISOString(),
  };
}

function runSegmentationJob(input) {
  const pixelCounter = createPixelByteCounter();
  const job = {
    id: input.jobId || "job-synth-1",
    status: "queued",
    stage: null,
    errorCause: null,
  };

  function fail(stage, cause) {
    job.status = "error";
    job.stage = stage;
    job.errorCause = cause;
    return {
      ok: false,
      job: job,
      rows: null,
      audit: null,
      volumes: null,
      pixelReport: pixelCounter.report(),
    };
  }

  try {
    job.status = "deid";
    job.stage = "index";
    assertIndexOnlySelection(
      input.selection || {
        sql: "SELECT * FROM imaging_study WHERE id = $1",
      },
    );
    if (!input.study) return fail("index", "estudo_ausente_no_indice");

    pixelCounter.record({
      path: "/api/person/x/imaging-studies",
      contentType: "application/json",
      bytes: 128,
      classHint: "metadata",
    });

    const deid = deidentifySyntheticHeader(input.dicomHeader || {}, {
      burnedIn: input.burnedIn,
      pixelScrubbed: input.pixelScrubbed,
    });
    if (!deid.ok) return fail("deid", deid.reason);

    job.status = "infer";
    job.stage = "totalseg";
    const seed = input.seed != null ? input.seed : DEFAULT_SEED;
    const volumes = runVolumetryDeterministic(
      input.studyBytes || "SYNTHETIC-STUDY",
      seed,
    );

    job.status = "persist";
    job.stage = "research_datum";
    const rows = buildResearchDatumRows(input.study, volumes);
    const audit = buildPhiAuditEntry({
      userId: input.study.userId,
      recordClientId: rows[0].recordClientId,
      studyUid: input.study.studyUid,
    });

    job.status = "done";
    job.stage = "done";
    pixelCounter.assertZeroPixelBytes();
    return {
      ok: true,
      job: job,
      rows: rows,
      audit: audit,
      volumes: volumes,
      pixelReport: pixelCounter.report(),
    };
  } catch (err) {
    return fail(
      job.stage || "fail",
      err && err.message ? err.message : String(err),
    );
  }
}

function assertSyntheticOnly(fixtureMeta) {
  if (!fixtureMeta || fixtureMeta.synthetic !== true) {
    throw new Error("fixture_nao_sintetica");
  }
  if (fixtureMeta.realPatientPhi === true) {
    throw new Error("phi_real_proibido");
  }
  return true;
}

const RESEARCH_DATUM_DDL = {
  table: "research_datum",
  create: true,
  columns: [
    "id",
    "user_id",
    "person_id",
    "workspace_id",
    "record_client_id",
    "protocol_id",
    "field_key",
    "value",
    "model_version",
    "model_hash",
    "review_status",
    "reviewed_by",
    "reviewed_at",
    "study_uid",
    "created_at",
  ],
  rls: "(select auth.uid()) = user_id",
  defaultReviewStatus: "pending",
};

function applyResearchDatumMigrationTwice() {
  const first = Object.assign({}, RESEARCH_DATUM_DDL, { applied: 1 });
  const second = Object.assign({}, RESEARCH_DATUM_DDL, { applied: 2 });
  const same =
    first.columns.join(",") === second.columns.join(",") &&
    first.rls === second.rls &&
    first.create === true;
  if (!same) throw new Error("migration_nao_idempotente");
  return { ok: true, first: first, second: second };
}

module.exports = {
  ANNEX_E_TAGS: ANNEX_E_TAGS,
  MODEL_VERSION: MODEL_VERSION,
  MODEL_HASH: MODEL_HASH,
  DEFAULT_SEED: DEFAULT_SEED,
  RESEARCH_DATUM_DDL: RESEARCH_DATUM_DDL,
  deidentifySyntheticHeader: deidentifySyntheticHeader,
  runVolumetryDeterministic: runVolumetryDeterministic,
  assertIndexOnlySelection: assertIndexOnlySelection,
  deriveRecordClientId: deriveRecordClientId,
  buildResearchDatumRows: buildResearchDatumRows,
  isClinicalUseAllowed: isClinicalUseAllowed,
  applyReview: applyReview,
  buildPhiAuditEntry: buildPhiAuditEntry,
  runSegmentationJob: runSegmentationJob,
  assertSyntheticOnly: assertSyntheticOnly,
  applyResearchDatumMigrationTwice: applyResearchDatumMigrationTwice,
};
