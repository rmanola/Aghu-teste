/**
 * FEAT-149 — Estado de marcos longitudinais (puro).
 * cumprido | em_aberto | perdido; LOST_MAX_SHARE = 0,3.
 * Sem I/O. Sem episodeId sintético.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiLongitudinalFollowup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LOST_MAX_SHARE = 0.3;
  var DEFAULT_GRACE_DAYS = 60;
  var CONTRAST_AKI_WINDOW_HOURS = 72;
  var CONTRAST_AKI_REFERENCE_ID = "contrast-aki-window-72h";

  var MILESTONE_SCHEDULES = Object.freeze({
    nef_doenca_renal_cronica: Object.freeze({
      key: "tfg_seguimento",
      windowsDays: Object.freeze([90, 365, 730]),
      graceDays: DEFAULT_GRACE_DAYS,
    }),
    cad_cirrose_hepatica: Object.freeze({
      key: "descompensacao_seguimento",
      windowsDays: Object.freeze([365, 730]),
      graceDays: DEFAULT_GRACE_DAYS,
    }),
  });

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function parseIsoMs(iso) {
    var s = str(iso);
    if (!s) return NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + "T00:00:00.000Z";
    return Date.parse(s);
  }

  function addDaysIso(anchorAtIso, days) {
    var ms = parseIsoMs(anchorAtIso);
    if (!Number.isFinite(ms)) return "";
    var d = new Date(ms);
    d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
  }

  /**
   * subject_key longitudinal = milestoneKey + ':' + windowDays
   * Nunca episodeId.
   */
  function buildLongitudinalSubjectKey(milestoneKey, windowDays) {
    var key = str(milestoneKey);
    var w = Number(windowDays);
    if (!key || !Number.isFinite(w) || w < 1) return "";
    return key + ":" + String(Math.floor(w));
  }

  function parseLongitudinalSubjectKey(subjectKey) {
    var raw = str(subjectKey);
    var idx = raw.lastIndexOf(":");
    if (idx <= 0) return { milestoneKey: "", windowDays: NaN };
    var w = Number(raw.slice(idx + 1));
    return {
      milestoneKey: raw.slice(0, idx),
      windowDays: Number.isFinite(w) ? w : NaN,
    };
  }

  /**
   * @returns {"cumprido"|"em_aberto"|"perdido"}
   */
  function computeMilestoneState(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    if (str(o.respondedAtIso)) return "cumprido";
    var dueMs = parseIsoMs(o.dueAtIso);
    var nowMs = parseIsoMs(o.nowIso);
    var grace = Number(o.graceDays);
    if (!Number.isFinite(grace) || grace < 0) grace = DEFAULT_GRACE_DAYS;
    if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return "em_aberto";
    var deadline = dueMs + grace * 24 * 60 * 60 * 1000;
    if (nowMs < deadline) return "em_aberto";
    return "perdido";
  }

  /**
   * @returns {{
   *   cumprido: number, emAberto: number, perdido: number,
   *   denominator: number, lostShare: number, degrade: boolean,
   *   degradeReason: string|null
   * }}
   */
  function computeMilestoneCohort(records, opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var nowIso = str(o.nowIso) || new Date().toISOString().slice(0, 10);
    var wantWindow =
      o.windowDays != null && Number.isFinite(Number(o.windowDays))
        ? Number(o.windowDays)
        : null;
    var graceDefault =
      o.graceDays != null && Number.isFinite(Number(o.graceDays))
        ? Number(o.graceDays)
        : DEFAULT_GRACE_DAYS;

    var cumprido = 0;
    var emAberto = 0;
    var perdido = 0;
    var list = asArray(records);

    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      if (!rec) continue;
      var w =
        rec.windowDays != null
          ? Number(rec.windowDays)
          : parseLongitudinalSubjectKey(rec.subjectKey).windowDays;
      if (wantWindow != null && w !== wantWindow) continue;
      var due =
        str(rec.dueAtIso) ||
        (str(rec.anchorAtIso) && Number.isFinite(w)
          ? addDaysIso(rec.anchorAtIso, w)
          : "");
      var state = computeMilestoneState({
        dueAtIso: due,
        graceDays:
          rec.graceDays != null && Number.isFinite(Number(rec.graceDays))
            ? Number(rec.graceDays)
            : graceDefault,
        respondedAtIso: rec.respondedAtIso,
        nowIso: nowIso,
      });
      if (state === "cumprido") cumprido += 1;
      else if (state === "perdido") perdido += 1;
      else emAberto += 1;
    }

    var denominator = cumprido + perdido;
    var lostShare = denominator > 0 ? perdido / denominator : 0;
    var degrade = lostShare > LOST_MAX_SHARE;
    return {
      cumprido: cumprido,
      emAberto: emAberto,
      perdido: perdido,
      denominator: denominator,
      lostShare: lostShare,
      degrade: degrade,
      degradeReason: degrade ? "milestone_lost_to_followup" : null,
    };
  }

  /**
   * NEF-SAF-02 — contraste dentro da janela de 72h antes do início da LRA.
   */
  function isContrastAssociatedAki(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var contrastMs = parseIsoMs(o.contrastExamAtIso);
    var akiMs = parseIsoMs(o.akiOnsetAtIso);
    var hours = Number(o.windowHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      hours = CONTRAST_AKI_WINDOW_HOURS;
    }
    if (!Number.isFinite(contrastMs) || !Number.isFinite(akiMs)) return false;
    if (contrastMs > akiMs) return false;
    var deltaH = (akiMs - contrastMs) / (60 * 60 * 1000);
    return deltaH <= hours;
  }

  /**
   * Numerador NEF-PRO-02: suspensão ou ajuste conta; maintained_justified / n/a não.
   */
  function nephrotoxinHeldFromCapture(values) {
    var v =
      values && typeof values === "object" ? str(values.nephrotoxinSuspended) : "";
    return v === "suspended" || v === "dose_adjusted";
  }

  return {
    LOST_MAX_SHARE: LOST_MAX_SHARE,
    DEFAULT_GRACE_DAYS: DEFAULT_GRACE_DAYS,
    CONTRAST_AKI_WINDOW_HOURS: CONTRAST_AKI_WINDOW_HOURS,
    CONTRAST_AKI_REFERENCE_ID: CONTRAST_AKI_REFERENCE_ID,
    MILESTONE_SCHEDULES: MILESTONE_SCHEDULES,
    addDaysIso: addDaysIso,
    buildLongitudinalSubjectKey: buildLongitudinalSubjectKey,
    parseLongitudinalSubjectKey: parseLongitudinalSubjectKey,
    computeMilestoneState: computeMilestoneState,
    computeMilestoneCohort: computeMilestoneCohort,
    isContrastAssociatedAki: isContrastAssociatedAki,
    nephrotoxinHeldFromCapture: nephrotoxinHeldFromCapture,
  };
});
