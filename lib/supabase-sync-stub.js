/**
 * Stub de sincronização com Supabase (desligado por defeito).
 * Não incluir chaves no código empacotado; ver docs/platform/SUPABASE.md e .env.example.
 *
 * Para ativar no futuro: carregar este script no popup/background, definir
 * AGHU_SUPABASE_SYNC_ENABLED = true e integrar Auth + camada de cifra na borda.
 */
(function () {
  "use strict";

  var AGHU_SUPABASE_SYNC_ENABLED = false;
  /** URL completa da Edge Function `encrypt-and-upsert` (configurar em runtime; não hardcodar keys). */
  var AGHU_EDGE_FUNCTION_URL = "";

  /**
   * @returns {{ enabled: boolean }}
   */
  function getStatus() {
    return { enabled: AGHU_SUPABASE_SYNC_ENABLED };
  }

  /**
   * @param {string} url
   */
  function setEdgeFunctionUrl(url) {
    AGHU_EDGE_FUNCTION_URL = url ? String(url) : "";
  }

  /**
   * Envia JSON claro para a Edge Function (cifra no servidor). Requer sync ativado + URL + token.
   * @param {string} accessToken JWT do Supabase Auth (session access_token)
   * @param {object} payload ver contrato em docs/platform/SUPABASE.md (record_client_id, pii, exams, controles?)
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async function pushPlaintextToEdge(accessToken, payload) {
    if (!AGHU_SUPABASE_SYNC_ENABLED) {
      return { ok: false, reason: "sync_disabled" };
    }
    if (!AGHU_EDGE_FUNCTION_URL) {
      return { ok: false, reason: "edge_url_not_configured" };
    }
    if (!accessToken) {
      return { ok: false, reason: "missing_access_token" };
    }
    try {
      var res = await fetch(AGHU_EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false, reason: "http_" + res.status };
      }
      return { ok: true };
    } catch (_e) {
      return { ok: false, reason: "network_error" };
    }
  }

  /**
   * @param {object} _patientRecord registo local (não enviar sem cifra na borda)
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async function pushEncryptedPatientRecord(_patientRecord) {
    if (!AGHU_SUPABASE_SYNC_ENABLED) {
      return { ok: false, reason: "sync_disabled" };
    }
    return { ok: false, reason: "not_implemented_use_edge_function" };
  }

  window.AghuSupabaseSyncStub = {
    getStatus: getStatus,
    setEdgeFunctionUrl: setEdgeFunctionUrl,
    pushPlaintextToEdge: pushPlaintextToEdge,
    pushEncryptedPatientRecord: pushEncryptedPatientRecord,
  };
})();
