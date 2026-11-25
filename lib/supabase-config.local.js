/**
 * Override local — NÃO commitar (ver .gitignore).
 * Aponta o painel web para o Next local; o default commitado é produção.
 */
(function () {
  "use strict";
  if (!window.AghuSupabaseConfig || typeof window.AghuSupabaseConfig.applyOverrides !== "function") {
    return;
  }
  window.AghuSupabaseConfig.applyOverrides({
    WEB_APP_URL: "http://localhost:3000",
  });
})();
