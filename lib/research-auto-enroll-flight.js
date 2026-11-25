/**
 * Coordena auto-inscrição Research — uma execução por paciente (evita loop entre hooks).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchAutoEnrollFlight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var flights = Object.create(null);
  var gaveUpKeys = Object.create(null);

  function flightKey(recordClientId) {
    return String(recordClientId || "").trim();
  }

  function gaveUpKey(recordClientId, protocolId) {
    return flightKey(recordClientId) + ":" + String(protocolId || "").trim();
  }

  function shouldSkipProtocol(recordClientId, protocolId) {
    return !!gaveUpKeys[gaveUpKey(recordClientId, protocolId)];
  }

  function markProtocolGaveUp(recordClientId, protocolId) {
    var key = gaveUpKey(recordClientId, protocolId);
    if (key) gaveUpKeys[key] = true;
  }

  function clearProtocolGaveUp(recordClientId, protocolId) {
    delete gaveUpKeys[gaveUpKey(recordClientId, protocolId)];
  }

  function runOnce(recordClientId, fn) {
    var key = flightKey(recordClientId);
    if (!key) return Promise.resolve();
    if (flights[key]) return flights[key];
    var promise = Promise.resolve()
      .then(fn)
      .finally(function () {
        delete flights[key];
      });
    flights[key] = promise;
    return promise;
  }

  function isRunning(recordClientId) {
    return !!flights[flightKey(recordClientId)];
  }

  return {
    shouldSkipProtocol: shouldSkipProtocol,
    markProtocolGaveUp: markProtocolGaveUp,
    clearProtocolGaveUp: clearProtocolGaveUp,
    runOnce: runOnce,
    isRunning: isRunning,
  };
});
