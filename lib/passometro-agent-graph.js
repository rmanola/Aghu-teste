/**
 * FEAT-071/089 — grafo de skills (arestas = skills tipadas).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-agent-skills.js")
      : root.AghuPassometroAgentSkills,
    typeof require !== "undefined"
      ? require("./passometro-agent-run-state.js")
      : root.AghuPassometroAgentRunState
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentGraph = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  skills,
  runStateApi
) {
  "use strict";

  var START = "START";
  var END = "END";
  /** FEAT-089 — nav+extract split + runState prereqs. */
  var GRAPH_REV = "2";

  function listNodes() {
    var ids = (skills && skills.getAllowedSkillIds()) || [];
    return [START].concat(ids).concat([END]);
  }

  function listEdges() {
    var ids = (skills && skills.getAllowedSkillIds()) || [];
    var edges = [];
    for (var i = 0; i < ids.length; i++) {
      edges.push({ from: START, to: ids[i] });
      edges.push({ from: ids[i], to: END });
    }
    return edges;
  }

  function isLegalTransition(from, to) {
    var f = String(from || "");
    var t = String(to || "");
    if (f === START && skills && skills.isSkillAllowed(t)) return true;
    if (skills && skills.isSkillAllowed(f) && t === END) return true;
    if (
      skills &&
      skills.isSkillAllowed(f) &&
      skills.isSkillAllowed(t) &&
      f !== t
    ) {
      if (
        (f === "passometro.oneclick" || t === "passometro.oneclick") &&
        f !== t
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Valida sequência de skillIds num round.
   * @param {string[]} skillIds
   * @param {{ runState?: object, skillCalls?: Array }} [opts]
   */
  function validateSkillSequence(skillIds, opts) {
    opts = opts || {};
    var ids = Array.isArray(skillIds) ? skillIds : [];
    if (!ids.length) {
      return { ok: false, error: "Sequência vazia." };
    }
    var hasOneclick = false;
    var hasOther = false;
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i] || "");
      if (!skills || !skills.isSkillAllowed(id)) {
        return { ok: false, error: "Skill ilegal: " + id };
      }
      if (id === "passometro.oneclick") hasOneclick = true;
      else hasOther = true;
      if (i === 0) {
        if (!isLegalTransition(START, id)) {
          return { ok: false, error: "Transição ilegal desde START." };
        }
      } else if (!isLegalTransition(ids[i - 1], id)) {
        return {
          ok: false,
          error: "Transição ilegal: " + ids[i - 1] + " → " + id,
        };
      }
    }
    if (hasOneclick && hasOther) {
      return {
        ok: false,
        error: "Não combine oneclick com outras skills no mesmo round.",
      };
    }
    if (hasOneclick && ids.length > 1) {
      return {
        ok: false,
        error: "oneclick deve ser o único step do round.",
      };
    }
    var maxSteps = hasOneclick ? 1 : 4;
    if (ids.length > maxSteps) {
      return {
        ok: false,
        error: "maxSteps excedido (" + maxSteps + ").",
      };
    }

    return { ok: true };
  }

  function maxStepsForSkills(skillIds) {
    var ids = Array.isArray(skillIds) ? skillIds : [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] === "passometro.oneclick") return 1;
    }
    return 4;
  }

  function resolveCallSkillId(call) {
    call = call || {};
    if (call.skillId) return String(call.skillId);
    var toolName = call.name || call.toolName || "";
    if (skills && typeof skills.getSkillByToolName === "function") {
      var skill = skills.getSkillByToolName(toolName);
      if (skill && skill.skillId) return skill.skillId;
    }
    return String(toolName || "");
  }

  /**
   * FEAT-089 — gate pré-execução no loop.
   * - Batch multi-skill: open* antes de extract no mesmo round.
   * - nav_retry_exceeded: sempre bloqueia.
   * - Extract isolado sem runState: permitido (fail-fast na execução → tool result).
   * @param {Array<{skillId?: string, name?: string, args?: object, arguments?: object}>} skillCalls
   * @param {object} [runState]
   */
  function validateSkillCallsWithRunState(skillCalls, runState) {
    if (
      !runStateApi ||
      typeof runStateApi.validateBatchPrereqs !== "function"
    ) {
      return { ok: true };
    }
    var calls = Array.isArray(skillCalls) ? skillCalls : [];
    var normalized = calls.map(function (c) {
      return {
        skillId: resolveCallSkillId(c),
        args: c.args != null ? c.args : c.arguments || {},
      };
    });
    if (!normalized.length) {
      return { ok: false, error: "Batch vazio.", errorCode: "invalid_args" };
    }
    if (
      normalized.length === 1 &&
      runStateApi.isNavSkillId(normalized[0].skillId)
    ) {
      var pronts = Array.isArray(normalized[0].args.prontuarios)
        ? normalized[0].args.prontuarios
        : [];
      var redundant = runStateApi.isNavRedundant(
        runState,
        normalized[0].skillId,
        pronts
      );
      if (!redundant.ok && redundant.errorCode === "nav_already_ready") {
        return redundant;
      }
    }
    var gate = runStateApi.validateBatchPrereqs(normalized, runState);
    if (
      !gate.ok &&
      (gate.errorCode === "nav_retry_exceeded" ||
        gate.errorCode === "nav_already_ready")
    ) {
      return gate;
    }
    if (normalized.length > 1 && !gate.ok) {
      return gate;
    }
    return { ok: true };
  }

  return {
    START: START,
    END: END,
    GRAPH_REV: GRAPH_REV,
    listNodes: listNodes,
    listEdges: listEdges,
    isLegalTransition: isLegalTransition,
    validateSkillSequence: validateSkillSequence,
    validateSkillCallsWithRunState: validateSkillCallsWithRunState,
    resolveCallSkillId: resolveCallSkillId,
    maxStepsForSkills: maxStepsForSkills,
  };
});
