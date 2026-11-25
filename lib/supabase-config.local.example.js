/**
 * Override local da extensão — NÃO commitar o ficheiro real.
 *
 * Uso:
 *  1. Copiar para `lib/supabase-config.local.js` (já no .gitignore).
 *  2. Ajustar valores abaixo para o ambiente local.
 *  3. Recarregar o Temporary Add-on no Firefox.
 *
 * O default commitado em `supabase-config.js` aponta para produção
 * (`https://aghu.vercel.app`). Este ficheiro só é necessário para
 * apontar o botão «Painel web» (e afins) ao Next local.
 */
(function () {
  "use strict";
  if (!window.AghuSupabaseConfig || typeof window.AghuSupabaseConfig.applyOverrides !== "function") {
    return;
  }
  window.AghuSupabaseConfig.applyOverrides({
    // Painel web local (npm run dev em web/)
    WEB_APP_URL: "http://localhost:3000",
    // Opcional: sobrescrever URL/chave do projeto Supabase
    // SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
    // SUPABASE_ANON_KEY: "sb_publishable_…",
  });
})();
