/**
 * Escolha de vitais “piores” para NEWS2.
 * @sync web/lib/patient-records/news2-vitals-pick.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuNews2VitalsPick = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function vitalsParse() {
    return root.AghuPassometroVitalsParse || null;
  }

  function news2Score() {
    return root.AghuNews2Score || null;
  }

  function pickWorstByScore(raw, scoreFn) {
    var vp = vitalsParse();
    if (vp && vp.pickWorstByScore) return vp.pickWorstByScore(raw, scoreFn);
    return null;
  }

  function pickWorstPasForNews2(raw) {
    var vp = vitalsParse();
    if (vp && vp.pickWorstPasForNews2) return vp.pickWorstPasForNews2(raw);
    return null;
  }

  function parsePassometroEntryForNews2(entry) {
    var vp = vitalsParse();
    if (vp && vp.parsePassometroEntryForNews2) {
      return vp.parsePassometroEntryForNews2(entry);
    }
    return {
      fcBpm: null,
      frIrpm: null,
      spo2Pct: null,
      pas: null,
      tempC: null,
    };
  }

  return {
    pickWorstByScore: pickWorstByScore,
    pickWorstPasForNews2: pickWorstPasForNews2,
    parsePassometroEntryForNews2: parsePassometroEntryForNews2,
  };
});
