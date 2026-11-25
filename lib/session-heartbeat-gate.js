/**
 * Lógica pura do heartbeat web (testável em Node; espelho em web/lib/vendor/).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuSessionHeartbeatGate = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SESSION_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

  /**
   * @param {{ lastRunAt: number | null, nowMs: number, visible: boolean }} opts
   * @returns {boolean}
   */
  function shouldRunSessionHeartbeat(opts) {
    if (!opts.visible) return false;
    if (opts.lastRunAt == null) return true;
    return opts.nowMs - opts.lastRunAt >= SESSION_HEARTBEAT_INTERVAL_MS;
  }

  return {
    SESSION_HEARTBEAT_INTERVAL_MS: SESSION_HEARTBEAT_INTERVAL_MS,
    shouldRunSessionHeartbeat: shouldRunSessionHeartbeat,
  };
});
