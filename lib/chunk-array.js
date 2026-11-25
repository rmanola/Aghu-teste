/**
 * Particiona array em chunks de tamanho fixo (orquestrador quality dashboard).
 * QUAL-AC-16.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuChunkArray = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @template T
   * @param {readonly T[]} items
   * @param {number} size
   * @returns {T[][]}
   */
  function chunkArray(items, size) {
    var n = items.length;
    if (n === 0) return [];
    var chunkSize = Math.max(1, Math.floor(size) || 1);
    var out = [];
    for (var i = 0; i < n; i += chunkSize) {
      out.push(items.slice(i, i + chunkSize));
    }
    return out;
  }

  return { chunkArray: chunkArray };
});
