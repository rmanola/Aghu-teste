/**
 * Sync na nuvem — orquestração UI (popup).
 */
(function (root) {
  "use strict";

  function resolveSyncPatientKey(getPatientMeta) {
    var meta = typeof getPatientMeta === "function" ? getPatientMeta() : null;
    if (meta && meta.ok && meta.patientKey) return meta.patientKey;
    return null;
  }

  async function syncPatientAfterLocalSave(patientKey) {
    if (!patientKey || !root.AghuSupabaseSync) return null;
    var out = await root.AghuSupabaseSync.syncPatient(patientKey);
    return root.AghuSupabaseSync.formatSyncMessage(out);
  }

  function scheduleSyncAfterLocalSave(patientKey, onDone) {
    if (!patientKey || !root.AghuSupabaseSync) return;
    var syncUi = root.AghuPopupSyncUi;
    var syncStartedAt = Date.now();
    console.log(
      "[AGHU] sync scheduled",
      syncUi
        ? syncUi.buildSyncScheduledLog(patientKey)
        : { patientKeyLen: patientKey.length },
    );
    void root.AghuSupabaseSync.syncPatient(patientKey)
      .then(function (out) {
        var msg = root.AghuSupabaseSync.formatSyncMessage(out);
        console.log(
          "[AGHU] sync finished",
          syncUi
            ? syncUi.buildSyncFinishedLog(patientKey, syncStartedAt, out)
            : {
                patientKeyLen: patientKey.length,
                durationMs: Date.now() - syncStartedAt,
                ok: !!(out && out.ok),
              },
        );
        if (typeof onDone === "function") onDone(msg, out);
      })
      .catch(function (err) {
        console.warn("[AGHU] sync scheduled failed", {
          patientKeyLen: patientKey.length,
          message: err && err.message ? err.message : String(err),
        });
        if (typeof onDone === "function") {
          onDone("Nuvem: falha inesperada na sincronização.", { ok: false });
        }
      });
  }

  function mergeProgressMessage(baseMsg, syncMsg) {
    if (root.AghuPopupSyncUi) {
      return root.AghuPopupSyncUi.mergeProgressMessage(baseMsg, syncMsg);
    }
    if (!syncMsg) return baseMsg;
    if (!baseMsg) return syncMsg;
    return baseMsg + " · " + syncMsg;
  }

  root.AghuPopupSync = {
    resolveSyncPatientKey: resolveSyncPatientKey,
    syncPatientAfterLocalSave: syncPatientAfterLocalSave,
    scheduleSyncAfterLocalSave: scheduleSyncAfterLocalSave,
    mergeProgressMessage: mergeProgressMessage,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
