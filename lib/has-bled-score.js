/**
 * Ported from web/lib/patient-records/has-bled-score.mjs
 * @sync web/lib/patient-records/has-bled-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuHasBledScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod_CkdEpiEgfr = loadMod(root, "ckd-epi-egfr.js", "AghuCkdEpiEgfr");
  var parseIdadeAnos = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.parseIdadeAnos;
  var resolveAgeYears = _mod_CkdEpiEgfr && _mod_CkdEpiEgfr.resolveAgeYears;


function computeHasBled(opts) {
  const age = opts.ageYears;
  if (!Number.isFinite(age) || age < 0) {
    throw new Error("invalid_has_bled_inputs");
  }

  let total = 0;
  const points = {};

  const flags = [
    ["hypertension", opts.hypertension],
    ["renalDisease", opts.renalDisease],
    ["liverDisease", opts.liverDisease],
    ["stroke", opts.stroke],
    ["bleeding", opts.bleeding],
    ["labileInr", opts.labileInr],
    ["drugs", opts.drugs],
    ["alcohol", opts.alcohol],
  ];

  for (const [key, on] of flags) {
    if (on) {
      points[key] = 1;
      total += 1;
    }
  }
  if (age > 65) {
    points.elderly = 1;
    total += 1;
  }

  return {
    total,
    points,
    highRisk: total >= 3,
  };
}

function parseHasBledAge(passometroHeader, pii, referenceDateISO) {
  return resolveAgeYears({
    passometroHeader,
    pii,
    referenceDateISO: ((referenceDateISO) != null && (referenceDateISO) !== undefined ? (referenceDateISO) : (null)),
  });
}


  return {
    computeHasBled: computeHasBled,
    parseHasBledAge: parseHasBledAge,
  };
});
