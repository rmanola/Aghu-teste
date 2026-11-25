/**
 * Timeout genérico para fetch/auth/billing na extensão.
 */
(function (root) {
  "use strict";

  /**
   * @template T
   * @param {Promise<T>} promise
   * @param {number} ms
   * @returns {Promise<T>}
   */
  function withNetworkTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error("network_timeout"));
        }, ms);
      }),
    ]);
  }

  root.AghuNetworkTimeout = {
    withNetworkTimeout: withNetworkTimeout,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
