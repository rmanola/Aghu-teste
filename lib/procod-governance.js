/**
 * FEAT-211 · PROCOD2-T5 — gate HITL: commit só após decisão CPI `procod_commit`.
 *
 * Consulta o registo append-only (aghu_cpi_decision_log / get-cpi-governance-log)
 * antes de persistir `committed`. Recusa tipada via procod-error-codes
 * (ILLEGAL_TRANSITION) — vocabulário fechado, sem código novo.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes,
    typeof require !== "undefined"
      ? require("./cpi-governance-log.js")
      : root.AghuCpiGovernanceLog,
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuProcodGovernance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (codes, gov) {
  "use strict";

  var PROCOD_COMMIT_KIND = gov.KIND.PROCOD_COMMIT;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function plain(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }

  /**
   * Última decisão `procod_commit` que autoriza este run (match estrito em evidence).
   * @param {ReadonlyArray<object>} log — entradas CPI (ordem livre; escolhe a mais recente por sequence).
   * @param {{ runId: string, recordClientId: string, cirurgiaId: string }} ctx
   * @returns {object|null}
   */
  function findProcodCommitApproval(log, ctx) {
    var runId = str(ctx.runId).trim();
    var recordClientId = str(ctx.recordClientId).trim();
    var cirurgiaId = str(ctx.cirurgiaId).trim();
    if (!runId || !recordClientId || !cirurgiaId) return null;

    var entries = Array.isArray(log) ? log.slice() : [];
    entries.sort(function (a, b) {
      return (Number(b.sequence) || 0) - (Number(a.sequence) || 0);
    });

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || str(entry.kind) !== PROCOD_COMMIT_KIND) continue;
      var ev = plain(entry.evidence) || {};
      if (
        str(ev.runId).trim() === runId &&
        str(ev.recordClientId).trim() === recordClientId &&
        str(ev.cirurgiaId).trim() === cirurgiaId
      ) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Pré-condição de commit: decisão humana registada via append-cpi-decision.
   * @returns {{ ok: true, approval: object } | { ok: false, errorCode: string, message: string }}
   */
  function assertProcodCommitApproved(log, ctx) {
    var approval = findProcodCommitApproval(log, ctx);
    if (!approval) {
      return {
        ok: false,
        errorCode: codes.ILLEGAL_TRANSITION,
        message:
          "Commit PROCOD exige aprovação humana registrada (append-cpi-decision, kind procod_commit).",
      };
    }
    return { ok: true, approval: approval };
  }

  /** Payload sugerido para append-cpi-decision antes do commit na UI. */
  function buildProcodCommitDecision(input) {
    var runId = str(input.runId).trim();
    var recordClientId = str(input.recordClientId).trim();
    var cirurgiaId = str(input.cirurgiaId).trim();
    return {
      kind: PROCOD_COMMIT_KIND,
      target: runId,
      rationale: str(input.rationale).trim() || "Aprovação humana da codificação SIGTAP proposta.",
      evidence: {
        runId: runId,
        recordClientId: recordClientId,
        cirurgiaId: cirurgiaId,
        aceites: Array.isArray(input.aceites) ? input.aceites.map(String) : [],
        rejeitados: Array.isArray(input.rejeitados) ? input.rejeitados.map(String) : [],
      },
      effectiveFrom: str(input.effectiveFrom).trim() || new Date().toISOString().slice(0, 10),
    };
  }

  return {
    PROCOD_COMMIT_KIND: PROCOD_COMMIT_KIND,
    findProcodCommitApproval: findProcodCommitApproval,
    assertProcodCommitApproved: assertProcodCommitApproved,
    buildProcodCommitDecision: buildProcodCommitDecision,
  };
});
