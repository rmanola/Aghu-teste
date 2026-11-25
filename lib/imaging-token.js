/**
 * FEAT-208 — emissão e validação de token DICOMweb (StudyUID + prazo).
 * Audit action: imaging_token_issue (IMG-AC-03/04/05/07).
 *
 * Puro: sem I/O. A rota AUTHPAR assina o JWT e grava audit; o callback
 * Orthanc chama validateImagingTokenScope.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuImagingToken = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Prazo por defeito (C-03): 30 minutos — configurável via opts.ttlSec. */
  var DEFAULT_TTL_SEC = 30 * 60;
  var AUDIT_ACTION = "imaging_token_issue";

  function resolveTtlSec(opts) {
    var raw = opts && opts.ttlSec != null ? Number(opts.ttlSec) : DEFAULT_TTL_SEC;
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new Error(
        "[AGHU imaging] ttlSec inválido — use segundos > 0 (defeito 1800).",
      );
    }
    return Math.floor(raw);
  }

  /**
   * Monta claims do token de visualização (antes de assinar).
   * @returns {{ claims: object, audit: object, expiresAt: string }}
   */
  function buildImagingTokenClaims(input) {
    var studyUid = String((input && input.studyUid) || "").trim();
    var recordClientId = String((input && input.recordClientId) || "").trim();
    var userId = String((input && input.userId) || "").trim();
    var workspaceId = String((input && input.workspaceId) || "").trim();
    if (!studyUid) throw new Error("[AGHU imaging] studyUid obrigatório.");
    if (!recordClientId) {
      throw new Error("[AGHU imaging] recordClientId obrigatório.");
    }
    if (!userId) throw new Error("[AGHU imaging] userId obrigatório.");
    if (!workspaceId) throw new Error("[AGHU imaging] workspaceId obrigatório.");

    var ttlSec = resolveTtlSec(input);
    var nowSec = Math.floor(
      (input && typeof input.nowMs === "number" ? input.nowMs : Date.now()) / 1000,
    );
    var exp = nowSec + ttlSec;
    var expiresAt = new Date(exp * 1000).toISOString();

    var claims = {
      typ: "imaging_study",
      study_uid: studyUid,
      record_client_id: recordClientId,
      workspace_id: workspaceId,
      sub: userId,
      role: (input && input.role) || "clinician",
      plan: (input && input.plan) || "staff",
      iat: nowSec,
      exp: exp,
    };

    var audit = {
      action: AUDIT_ACTION,
      user_id: userId,
      record_client_id: recordClientId,
      study_uid: studyUid,
      expires_at: expiresAt,
      workspace_id: workspaceId,
      outcome: "success",
    };

    return { claims: claims, audit: audit, expiresAt: expiresAt, ttlSec: ttlSec };
  }

  /**
   * Valida escopo/prazo de um payload já verificado (assinatura fora).
   * @returns {{ ok: true } | { ok: false, code: string, message: string }}
   */
  function validateImagingTokenScope(payload, requiredStudyUid, nowMs) {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "invalid",
        message: "Token ausente ou inválido.",
      };
    }
    var now = Math.floor(
      (typeof nowMs === "number" ? nowMs : Date.now()) / 1000,
    );
    if (payload.typ !== "imaging_study") {
      return {
        ok: false,
        code: "invalid",
        message: "Token não é de sessão de imagem.",
      };
    }
    var exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp <= now) {
      return {
        ok: false,
        code: "expired",
        message: "Sessão de visualização expirada — reabrir estudo.",
      };
    }
    var scoped = String(payload.study_uid || "").trim();
    var required = String(requiredStudyUid || "").trim();
    if (!required) {
      return {
        ok: false,
        code: "invalid",
        message: "StudyUID do pedido ausente.",
      };
    }
    if (scoped !== required) {
      return {
        ok: false,
        code: "wrong_scope",
        message: "Token escopado a outro estudo.",
      };
    }
    return { ok: true };
  }

  /** Recusa de emissão (IMG-AC-04) — sem audit de sucesso. */
  function refuseIssue(reason) {
    return {
      ok: false,
      token: null,
      audit: null,
      error: {
        code: "forbidden",
        message: reason || "Emissão de token recusada pela política.",
      },
    };
  }

  return {
    DEFAULT_TTL_SEC: DEFAULT_TTL_SEC,
    AUDIT_ACTION: AUDIT_ACTION,
    buildImagingTokenClaims: buildImagingTokenClaims,
    validateImagingTokenScope: validateImagingTokenScope,
    refuseIssue: refuseIssue,
  };
});
