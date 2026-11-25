/**
 * Garante purge de storage clínico antes de restores do popup (boot + troca de conta).
 */
(function () {
  "use strict";

  var readyResolve;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  async function boot() {
    // Modo offline: sem troca de conta — nunca apagar dados clínicos locais.
    if (window.AghuSupabaseAuth && window.AghuSupabaseAuth.OFFLINE) {
      if (readyResolve) readyResolve();
      return;
    }
    try {
      var auth = window.AghuSupabaseAuth;
      var purge = window.AghuExtensionClinicalPurge;
      if (!purge) {
        return;
      }
      var session = auth ? await auth.getSession() : null;
      var userId =
        session && session.user && session.user.id ? session.user.id : null;
      var result = await purge.assertStorageOwner(userId);
      if ((result.purged || !userId) && window.AghuClinicalUiReset) {
        window.AghuClinicalUiReset.dispatch();
      }
    } catch (e) {
      console.warn("[AGHU auth-storage-guard]", e && e.message);
    } finally {
      if (readyResolve) readyResolve();
    }
  }

  void boot();

  window.AghuAuthStorageGuard = {
    ready: ready,
  };
})();
