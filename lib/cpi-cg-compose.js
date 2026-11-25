/**
 * FEAT-117 — Composição pura sobre APIs existentes (Clavien, UTI, LOS, readmissão).
 * Sem extracção nova; reusa hpb-computed / quality-dashboard-aggregate / cpi-indicator-library.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCgCompose = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object") return mod;
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

  var hpb = load("hpb-computed.js", "AghuHpbComputed");
  var agg = load("quality-dashboard-aggregate.js", "AghuQualityDashboardAggregate");
  var indicators = load("cpi-indicator-library.js", "AghuCpiIndicatorLibrary");

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * Delega a `computeClavienGte3` — não regradua.
   * @param {string|null|undefined} clavienMax
   * @returns {boolean}
   */
  function isClavienGte3(clavienMax) {
    if (!hpb || typeof hpb.computeClavienGte3 !== "function") return false;
    return !!hpb.computeClavienGte3(clavienMax);
  }

  /**
   * @param {Array<{ clavienMax?: string }|string>} events
   * @returns {number}
   */
  function countClavienGte3(events) {
    var list = asArray(events);
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      var grade =
        typeof ev === "string"
          ? ev
          : ev && (ev.clavienMax != null ? ev.clavienMax : ev.grade);
      if (isClavienGte3(grade)) n += 1;
    }
    return n;
  }

  /**
   * Reoperação no mesmo internamento: ≥2 procedimentos.
   * @param {object[]} cirInPeriod
   * @returns {boolean}
   */
  function hasReoperationSameAdmission(cirInPeriod) {
    return asArray(cirInPeriod).length >= 2;
  }

  /**
   * Admissões UTI `kind: "unplanned"`; se `surgeryId` dado, filtra pelo vínculo.
   * @param {Array<{ kind?: string, surgeryId?: string }>} icuAdmissions
   * @param {string|null|undefined} surgeryId
   * @returns {number}
   */
  function countUnplannedIcuForSurgery(icuAdmissions, surgeryId) {
    var list = asArray(icuAdmissions);
    var wantSurgery = surgeryId != null && str(surgeryId) !== "";
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      if (str(row.kind) !== "unplanned") continue;
      if (wantSurgery && str(row.surgeryId) !== str(surgeryId)) continue;
      n += 1;
    }
    return n;
  }

  /**
   * LOS pós-operatório via `calendarLosDays`. Sem `endedAt` → null (fora num/den).
   * @param {{ startedAt?: string|null, endedAt?: string|null, surgeryAt?: string|null }} episode
   * @returns {number|null}
   */
  function postOpLosDays(episode) {
    var ep = episode && typeof episode === "object" ? episode : {};
    if (ep.endedAt == null || str(ep.endedAt) === "") return null;
    var start = ep.surgeryAt != null && str(ep.surgeryAt) ? ep.surgeryAt : ep.startedAt;
    if (start == null || str(start) === "") return null;
    if (!agg || typeof agg.calendarLosDays !== "function") return null;
    // calendarLosDays espera YYYY-MM-DD (parte data)
    var startDay = str(start).slice(0, 10);
    var endDay = str(ep.endedAt).slice(0, 10);
    return agg.calendarLosDays(startDay, endDay);
  }

  /**
   * Readmissão 30d: índices com endedAt; candidato com startedAt ∈ (endedAt, +30d].
   * @param {Array<{ id?: string, startedAt?: string|null, endedAt?: string|null }>} hospEpisodes
   * @returns {{ numerator: number, denominator: number }}
   */
  function countIndexReadmissions30d(hospEpisodes) {
    var list = asArray(hospEpisodes);
    var isReadmit =
      indicators && typeof indicators.isReadmissionWithin30Days === "function"
        ? indicators.isReadmissionWithin30Days
        : null;
    if (!isReadmit) {
      return { numerator: 0, denominator: 0 };
    }

    var denominator = 0;
    var numerator = 0;
    for (var i = 0; i < list.length; i++) {
      var index = list[i] || {};
      if (index.endedAt == null || str(index.endedAt) === "") continue;
      denominator += 1;
      var hit = false;
      for (var j = 0; j < list.length; j++) {
        if (i === j) continue;
        var cand = list[j] || {};
        if (isReadmit(index, cand)) {
          hit = true;
          break;
        }
      }
      if (hit) numerator += 1;
    }
    return { numerator: numerator, denominator: denominator };
  }

  return {
    isClavienGte3: isClavienGte3,
    countClavienGte3: countClavienGte3,
    hasReoperationSameAdmission: hasReoperationSameAdmission,
    countUnplannedIcuForSurgery: countUnplannedIcuForSurgery,
    postOpLosDays: postOpLosDays,
    countIndexReadmissions30d: countIndexReadmissions30d,
  };
});
