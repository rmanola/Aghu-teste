/**
 * FEAT-071 — facade de tools tipadas sobre o registry de skills.
 * Mantém API PA-AC-02/03/06; schemas e allowlist vêm do registry.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-agent-skills.js")
      : root.AghuPassometroAgentSkills
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (skills) {
  "use strict";

  if (!skills) {
    throw new Error("passometro-agent-skills indisponível.");
  }

  var TOOL_RUN = "runPassometroOneClick";
  var oneclick = skills.getSkillByToolName(TOOL_RUN);
  var ALLOWED_TOOLS = Object.freeze(skills.getAllowedToolNames());

  function getAllowedToolNames() {
    return skills.getAllowedToolNames();
  }

  function isToolAllowed(name) {
    return skills.isToolAllowed(name);
  }

  function getToolSchemas() {
    return skills.getToolSchemas().map(function (s) {
      return {
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      };
    });
  }

  function assertAllowlistFreeze() {
    return skills.assertAllowlistFreeze();
  }

  function validateRunPassometroOneClick(args) {
    return skills.validateSkillArgs(TOOL_RUN, args);
  }

  function sanitizeToolResult(raw) {
    return skills.sanitizeSkillResult(raw, oneclick);
  }

  return {
    TOOL_RUN: TOOL_RUN,
    ALLOWED_TOOLS: ALLOWED_TOOLS,
    FORBIDDEN_TOOL_NAMES: skills.FORBIDDEN_TOOL_NAMES,
    getAllowedToolNames: getAllowedToolNames,
    isToolAllowed: isToolAllowed,
    getToolSchemas: getToolSchemas,
    assertAllowlistFreeze: assertAllowlistFreeze,
    validateRunPassometroOneClick: validateRunPassometroOneClick,
    sanitizeToolResult: sanitizeToolResult,
    last4Digits: skills.last4Digits,
    skills: skills,
  };
});
