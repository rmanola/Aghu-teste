/** FEAT-209 — revisão humana de research_datum (SEG-AC-07). */
"use strict";

const {
  applyReview,
  isClinicalUseAllowed,
  buildResearchDatumRows,
} = require("./segmentation-pipeline.js");

module.exports = {
  applyReview,
  isClinicalUseAllowed,
  buildResearchDatumRows,
};
