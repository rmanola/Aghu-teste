/**
 * Congelamento de research_registry para análise (data freeze).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchDataFreeze = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./research-registry-schema.js");
  } catch (_e) {}

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuResearchRegistrySchema || null;
  }

  function nowIso() {
    var schema = getSchemaApi();
    if (schema && schema.nowIso) return schema.nowIso();
    return new Date().toISOString();
  }

  function isRegistryFrozen(registry) {
    var schema = getSchemaApi();
    if (schema && schema.isRegistryFrozen) return schema.isRegistryFrozen(registry);
    return !!(registry && registry.dataFreeze && registry.dataFreeze.frozenAt);
  }

  function applyDataFreeze(registry, opts) {
    opts = opts || {};
    var frozenBy = String(opts.frozenBy || "").trim();
    if (!frozenBy) throw new Error("frozenBy é obrigatório para congelar o registro Research");
    return Object.assign({}, registry || {}, {
      dataFreeze: {
        frozenAt: nowIso(),
        frozenBy: frozenBy,
        note: opts.note ? String(opts.note) : "",
      },
    });
  }

  function applyDataUnfreeze(registry) {
    return Object.assign({}, registry || {}, {
      dataFreeze: null,
    });
  }

  return {
    isRegistryFrozen: isRegistryFrozen,
    applyDataFreeze: applyDataFreeze,
    applyDataUnfreeze: applyDataUnfreeze,
  };
});
