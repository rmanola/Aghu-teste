/**
 * UI helpers do popup: mensagens de progresso e logs de timing de sync (PERF2-AC-06 / PERF-SLO-03).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPopupSyncUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @param {string} baseMsg
   * @param {string|null|undefined} syncMsg
   */
  function mergeProgressMessage(baseMsg, syncMsg) {
    if (!syncMsg) return baseMsg;
    if (!baseMsg) return syncMsg;
    return baseMsg + " · " + syncMsg;
  }

  /**
   * Metadados seguros para `[AGHU] sync scheduled` (sem PHI).
   * @param {string} patientKey
   */
  function buildSyncScheduledLog(patientKey) {
    return { patientKeyLen: String(patientKey || "").length };
  }

  /**
   * Metadados seguros para `[AGHU] sync finished` (sem PHI).
   * @param {string} patientKey
   * @param {number} syncStartedAt
   * @param {{ ok?: boolean }|null|undefined} out
   * @param {number} [nowMs]
   */
  function buildSyncFinishedLog(patientKey, syncStartedAt, out, nowMs) {
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    return {
      patientKeyLen: String(patientKey || "").length,
      durationMs: now - syncStartedAt,
      ok: !!(out && out.ok),
    };
  }

  /**
   * Metadados seguros para `[AGHU] extract ui ready` (sem PHI).
   * @param {number} extractStartedAt
   * @param {number} [nowMs]
   */
  function buildExtractUiReadyLog(extractStartedAt, nowMs) {
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    return {
      durationMs: now - extractStartedAt,
    };
  }

  return {
    mergeProgressMessage: mergeProgressMessage,
    buildSyncScheduledLog: buildSyncScheduledLog,
    buildSyncFinishedLog: buildSyncFinishedLog,
    buildExtractUiReadyLog: buildExtractUiReadyLog,
  };
});
