/** FEAT-209 — estado de job de segmentação (fail-fast com causa). */
"use strict";

const {
  runSegmentationJob,
  assertIndexOnlySelection,
} = require("./segmentation-pipeline.js");

function createJob(initial) {
  return {
    id: (initial && initial.id) || "job-synth",
    status: "queued",
    stage: null,
    errorCause: null,
  };
}

function failJob(job, stage, cause) {
  return Object.assign({}, job, {
    status: "error",
    stage: stage,
    errorCause: cause,
  });
}

module.exports = {
  createJob,
  failJob,
  runSegmentationJob,
  assertIndexOnlySelection,
};
