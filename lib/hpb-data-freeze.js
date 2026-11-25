/**
 * Congelamento de registro HPB para análise (data freeze).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbDataFreeze = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  try {
    if (typeof require === "function") schemaApi = require("./hpb-registry-schema.js");
  } catch (_e) {}

  function getSchemaApi() {
    if (schemaApi) return schemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function nowIso() {
    var schema = getSchemaApi();
    if (schema && schema.nowIso) return schema.nowIso();
    return new Date().toISOString();
  }

  function isRegistryFrozen(registry) {
    return !!(registry && registry.dataFreeze && registry.dataFreeze.frozenAt);
  }

  function applyDataFreeze(registry, opts) {
    opts = opts || {};
    var frozenBy = String(opts.frozenBy || "").trim();
    if (!frozenBy) throw new Error("frozenBy é obrigatório para congelar o registro HPB");
    return Object.assign({}, registry || {}, {
      dataFreeze: {
        frozenAt: nowIso(),
        frozenBy: frozenBy,
        note: opts.note ? String(opts.note) : "",
      },
      atualizadoEm: nowIso(),
    });
  }

  function applyDataUnfreeze(registry) {
    return Object.assign({}, registry || {}, {
      dataFreeze: null,
      atualizadoEm: nowIso(),
    });
  }

  function clinicalSnapshot(registry) {
    var schema = getSchemaApi();
    var normalized = schema
      ? schema.normalizeRegistry(registry || {})
      : registry || { episodes: [] };
    return JSON.stringify({ version: normalized.version, episodes: normalized.episodes });
  }

  function assertRegistryEditable(existing, incoming) {
    if (!isRegistryFrozen(existing)) return;
    if (clinicalSnapshot(existing) === clinicalSnapshot(incoming)) return;
    throw new Error("Registro Research congelado para análise");
  }

  return {
    isRegistryFrozen: isRegistryFrozen,
    applyDataFreeze: applyDataFreeze,
    applyDataUnfreeze: applyDataUnfreeze,
    clinicalSnapshot: clinicalSnapshot,
    assertRegistryEditable: assertRegistryEditable,
  };
});
