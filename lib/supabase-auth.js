/**
 * Autenticação — MODO OFFLINE.
 *
 * Não há login nem comunicação com servidor. Existe sempre uma sessão local
 * fixa para que os módulos que exigem "sessão" funcionem normalmente.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aghu_supabase_session";

  var OFFLINE_SESSION = Object.freeze({
    access_token: "offline-local",
    refresh_token: "",
    token_type: "offline",
    expires_at: null,
    user: Object.freeze({ id: "offline-local", email: "Modo offline (local)" }),
  });

  function offlineError() {
    return { ok: false, error: "Modo offline: sem conta na nuvem." };
  }

  async function signInWithPassword() {
    return { ok: true, session: OFFLINE_SESSION, evicted: [] };
  }

  async function signUp() {
    return offlineError();
  }

  async function resetPasswordForEmail() {
    return offlineError();
  }

  async function refreshSession() {
    return OFFLINE_SESSION;
  }

  async function signOut() {
    return { ok: true };
  }

  async function getSession() {
    return OFFLINE_SESSION;
  }

  async function getAccessToken() {
    return OFFLINE_SESSION.access_token;
  }

  function onAuthChange(_cb) {
    return function () {};
  }

  async function readStoredSession() {
    return OFFLINE_SESSION;
  }

  window.AghuSupabaseAuth = {
    OFFLINE: true,
    STORAGE_KEY: STORAGE_KEY,
    signInWithPassword: signInWithPassword,
    signUp: signUp,
    resetPasswordForEmail: resetPasswordForEmail,
    refreshSession: refreshSession,
    signOut: signOut,
    getSession: getSession,
    getAccessToken: getAccessToken,
    onAuthChange: onAuthChange,
    _readStoredSession: readStoredSession,
  };
})();