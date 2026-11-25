/**

 * Rascunho HPB a partir do passômetro (extensão / web) — delega ao bridge.

 */

(function (root, factory) {

  "use strict";

  var api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;

  else root.AghuHpbPassometroDraft = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  "use strict";



  var bridgeApi = null;

  var schemaApi = null;

  try {

    if (typeof require === "function") {

      bridgeApi = require("./hpb-passometro-bridge.js");

      schemaApi = require("./hpb-registry-schema.js");

    }

  } catch (_e) {}



  function getBridge() {

    if (bridgeApi) return bridgeApi;

    var g = typeof globalThis !== "undefined" ? globalThis : {};

    return g.AghuHpbPassometroBridge;

  }



  function getSchema() {

    if (schemaApi) return schemaApi;

    var g = typeof globalThis !== "undefined" ? globalThis : {};

    return g.AghuHpbRegistrySchema;

  }



  function draftFromPassometro(passometro, existingRegistry) {

    var bridge = getBridge();

    var schema = getSchema();

    if (!bridge || !schema || !passometro || typeof passometro !== "object") {

      return null;

    }

    var reg = schema.normalizeRegistry(existingRegistry || schema.emptyRegistry());

    if (reg.episodes && reg.episodes.length) return reg;

    var out = bridge.syncPassometroHpb(passometro, reg, {});

    return out && out.registry ? out.registry : null;

  }



  return { draftFromPassometro: draftFromPassometro };

});

