/**
 * Fetch autenticado para Edge Functions (extensão).
 * Retry único em 401 com refresh de sessão — espelha lib/supabase-sync.js.
 */
(function (root) {
  "use strict";

  /**
   * @param {string} code
   * @returns {string}
   */
  function formatEdgeError(code) {
    var c = String(code || "").trim();
    if (!c) return "Erro inesperado.";
    if (c === "offline_mode") {
      return "Indisponível no modo offline (sem comunicação com a nuvem).";
    }
    if (c === "invalid_token" || c === "missing_bearer_token") {
      return "Sessão expirada. Saia e entre novamente no popup.";
    }
    if (c === "ai_consent_required") {
      return "Aceite o consentimento de IA no painel web antes de continuar.";
    }
    if (c === "feature_disabled") {
      return "Funcionalidade temporariamente indisponível.";
    }
    if (c === "subscription_required" || c === "patient_analysis_not_allowed") {
      return "Plano pago necessário para esta função.";
    }
    if (c === "openai_request_failed") {
      return "Falha ao contactar o modelo de IA. Verifique OPENAI_API_KEY / cota OpenAI.";
    }
    if (c === "openai_rate_limited") {
      return "Limite do modelo atingido. Tente mais tarde.";
    }
    if (c === "openai_unauthorized") {
      return "Chave OpenAI inválida ou revogada.";
    }
    if (c === "openai_empty_response") {
      return "O modelo de IA respondeu vazio. Tente de novo.";
    }
    if (c === "llm_failed") {
      return "O agente não conseguiu responder. Tente de novo.";
    }
    if (c === "rate_limit_exceeded") {
      return "Limite diário do agente Passômetro atingido. Use Formulário one-click ou tente amanhã.";
    }
    if (c === "server_misconfigured") {
      return "Agente sem configuração no servidor (OPENAI_API_KEY / flag).";
    }
    if (c === "validation_failed") {
      return "Dados do template inválidos. Recarregue a extensão em about:debugging se persistir.";
    }
    return c;
  }

  /**
   * @param {string} path — ex. "/functions/v1/generate-patient-analysis"
   * @param {RequestInit & { body?: string }} [init]
   * @returns {Promise<{ ok: boolean, status: number, data?: unknown, error?: string, retried?: boolean }>}
   */
  async function authenticatedEdgeFetch(_path, _init) {
    // Modo offline: nenhuma chamada a Edge Functions.
    return { ok: false, status: 0, error: "offline_mode" };
  }

  root.AghuSupabaseEdgeFetch = {
    authenticatedEdgeFetch: authenticatedEdgeFetch,
    formatEdgeError: formatEdgeError,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
