/** FEAT-209 — writer de research_datum com procedência (SEG-AC-04/05/13). */
"use strict";

const {
  buildResearchDatumRows,
  deriveRecordClientId,
  applyResearchDatumMigrationTwice,
  RESEARCH_DATUM_DDL,
} = require("./segmentation-pipeline.js");

module.exports = {
  buildResearchDatumRows,
  deriveRecordClientId,
  applyResearchDatumMigrationTwice,
  RESEARCH_DATUM_DDL,
};
