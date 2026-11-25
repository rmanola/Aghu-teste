/**
 * FEAT-211 · PROCOD2-T5 — dual-write resiliente legado ↔ procedure_occurrence.
 *
 * Molde FEAT-205 dual-write: cada lado captura o próprio erro; falha de um não
 * corrompe o outro. Outcomes tipados no retorno para audit/telemetria.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuProcodDualWrite = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SOURCE = "procod";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function okSide(s) {
    return s.status === "written" || s.status === "duplicate";
  }

  function isUniqueViolation(e) {
    var code = e && e.code;
    if (code === "23505") return true;
    var msg = e instanceof Error ? e.message : str(e);
    return /duplicate key|unique constraint|SQLSTATE 23505/i.test(msg);
  }

  /** Mapeia status do motor PROCOD → procedure_cycle_state. */
  function mapCycleState(status) {
    var s = str(status).trim();
    if (s === "needs_user_input") return "needs_user_input";
    if (s === "failed") return "failed";
    if (s === "committed") return "committed";
    return "proposed";
  }

  function buildOccurrenceInput(input) {
    return {
      workspaceId: str(input.workspaceId).trim(),
      personId: str(input.recordClientId).trim(),
      recordClientId: str(input.recordClientId).trim(),
      source: SOURCE,
      sourceRecordId: str(input.runId).trim(),
      visitSourceRecordId: str(input.cirurgiaId).trim(),
      procedureConceptId: str(input.procedureConceptId || input.principalCode || "").trim(),
      sigtapCode: input.sigtapCode != null ? str(input.sigtapCode).trim() || null : null,
      procedureDate: str(input.procedureDate).trim(),
      procedureCycleState: mapCycleState(input.cycleState || input.status),
      modelVersion: input.modelVersion != null ? str(input.modelVersion) : null,
      modelHash: input.modelHash != null ? str(input.modelHash) : null,
      provenance: input.provenance && typeof input.provenance === "object" ? input.provenance : {},
    };
  }

  /**
   * @typedef {{ status: 'written'|'duplicate'|'failed', error?: string, id?: string }} SideOutcome
   * @typedef {{ legacy: SideOutcome, structured: SideOutcome, consistent: boolean }} DualWriteResult
   */

  /**
   * Run: INSERT legado (aghu_procod_proposal) + upsert procedure_occurrence `proposed`.
   * @param {{ legacy: object, structured: object }} deps
   */
  async function dualWriteProcodRun(deps, input) {
    var legacy = { status: "failed", error: "legacy_port_missing" };
    if (deps.legacy && typeof deps.legacy.insertProposal === "function") {
      try {
        var leg = await deps.legacy.insertProposal(input);
        legacy = leg && leg.duplicate ? { status: "duplicate", id: leg.id } : { status: "written", id: leg && leg.id };
      } catch (e) {
        if (isUniqueViolation(e)) {
          legacy = { status: "duplicate" };
        } else {
          legacy = { status: "failed", error: "legacy: " + str(e.message || e) };
        }
      }
    }

    var structured = { status: "failed", error: "structured_port_missing" };
    if (deps.structured && typeof deps.structured.upsertOccurrence === "function") {
      try {
        var row = buildOccurrenceInput(input);
        var id = await deps.structured.upsertOccurrence(row);
        structured = { status: "written", id: id };
      } catch (e) {
        if (isUniqueViolation(e)) {
          structured = { status: "duplicate" };
        } else {
          structured = { status: "failed", error: "structured: " + str(e.message || e) };
        }
      }
    }

    return {
      legacy: legacy,
      structured: structured,
      consistent: okSide(legacy) && okSide(structured),
    };
  }

  /**
   * Commit: UPDATE procedure_occurrence → `committed` com trilha decidedBy/decidedAt.
   * Legado (nova linha committed em aghu_procod_proposal) é responsabilidade do caller
   * ou de legacy.insertCommitted quando fornecido.
   */
  async function dualWriteProcodCommit(deps, input) {
    var legacy = { status: "failed", error: "legacy_port_missing" };
    if (deps.legacy && typeof deps.legacy.insertCommitted === "function") {
      try {
        var leg = await deps.legacy.insertCommitted(input);
        legacy = leg && leg.duplicate ? { status: "duplicate", id: leg.id } : { status: "written", id: leg && leg.id };
      } catch (e) {
        if (isUniqueViolation(e)) {
          legacy = { status: "duplicate" };
        } else {
          legacy = { status: "failed", error: "legacy: " + str(e.message || e) };
        }
      }
    } else if (input.legacyAlreadyWritten) {
      legacy = { status: "written" };
    }

    var structured = { status: "failed", error: "structured_port_missing" };
    if (deps.structured && typeof deps.structured.commitOccurrence === "function") {
      try {
        await deps.structured.commitOccurrence({
          workspaceId: str(input.workspaceId).trim(),
          runId: str(input.runId).trim(),
          sigtapCode: input.principalCode != null ? str(input.principalCode).trim() || null : null,
          procedureConceptId: str(input.procedureConceptId || input.principalCode || "").trim(),
          provenancePatch: {
            decidedBy: str(input.decidedBy).trim(),
            decidedAt: str(input.decidedAt).trim(),
            cpiDecisionId: str(input.cpiDecisionId).trim(),
            aceites: input.aceites || [],
            rejeitados: input.rejeitados || [],
          },
        });
        structured = { status: "written" };
      } catch (e) {
        structured = { status: "failed", error: "structured: " + str(e.message || e) };
      }
    }

    return {
      legacy: legacy,
      structured: structured,
      consistent: okSide(legacy) && okSide(structured),
    };
  }

  /** Falha explícita do pipeline → estado `failed` + errorCode (PROCOD2-AC-14). */
  async function dualWriteProcodFailed(deps, input) {
    var structured = { status: "failed", error: "structured_port_missing" };
    if (deps.structured && typeof deps.structured.markFailed === "function") {
      try {
        await deps.structured.markFailed({
          workspaceId: str(input.workspaceId).trim(),
          runId: str(input.runId).trim(),
          errorCode: str(input.errorCode).trim(),
          provenancePatch: input.provenance || {},
        });
        structured = { status: "written" };
      } catch (e) {
        structured = { status: "failed", error: "structured: " + str(e.message || e) };
      }
    }
    return { structured: structured };
  }

  return {
    SOURCE: SOURCE,
    mapCycleState: mapCycleState,
    buildOccurrenceInput: buildOccurrenceInput,
    dualWriteProcodRun: dualWriteProcodRun,
    dualWriteProcodCommit: dualWriteProcodCommit,
    dualWriteProcodFailed: dualWriteProcodFailed,
  };
});
