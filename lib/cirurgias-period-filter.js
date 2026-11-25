/**
 * Filtro de período para lista POL de cirurgias (dateFrom/dateTo inclusivo, ISO yyyy-mm-dd).
 * Coluna Data da lista: dd/mm/aaaa via AghuDateBr.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuCirurgiasPeriodFilter = api;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this,
  function (root) {
    "use strict";

    function dateBrApi() {
      if (root && root.AghuDateBr) return root.AghuDateBr;
      if (typeof globalThis !== "undefined" && globalThis.AghuDateBr) {
        return globalThis.AghuDateBr;
      }
      return null;
    }

    /**
     * Data da lista POL (dd/mm/aaaa ou ISO) → ISO yyyy-mm-dd.
     * @param {string|null|undefined} dataBr
     * @returns {string|null}
     */
    function cirurgiaDataToIso(dataBr) {
      if (dataBr == null || String(dataBr).trim() === "") return null;
      var api = dateBrApi();
      if (api && api.toFilterIso) return api.toFilterIso(dataBr) || null;
      if (api && api.brToIso) return api.brToIso(dataBr) || null;
      var raw = String(dataBr).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      var m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (!m) return null;
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      var y = parseInt(m[3], 10);
      if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return (
        String(y).padStart(4, "0") +
        "-" +
        String(mo).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0")
      );
    }

    /**
     * Normaliza bound do request (ISO ou BR) → ISO ou null.
     * @param {string|null|undefined} value
     * @returns {string|null}
     */
    function normalizeBoundIso(value) {
      if (value == null || String(value).trim() === "") return null;
      return cirurgiaDataToIso(value);
    }

    /**
     * @param {object|string|null|undefined} rowOrData row com `.data` ou string BR/ISO
     * @param {string|null|undefined} dateFromIso
     * @param {string|null|undefined} dateToIso
     * @returns {boolean}
     */
    function isCirurgiaInPeriod(rowOrData, dateFromIso, dateToIso) {
      var from = normalizeBoundIso(dateFromIso);
      var to = normalizeBoundIso(dateToIso);
      if (!from && !to) return true;
      var dataBr =
        rowOrData != null && typeof rowOrData === "object"
          ? rowOrData.data
          : rowOrData;
      var iso = cirurgiaDataToIso(dataBr);
      if (!iso) return false;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
      return true;
    }

    /**
     * @param {Array<{index?: number, data?: string}>|null|undefined} rows
     * @param {string|null|undefined} dateFromIso
     * @param {string|null|undefined} dateToIso
     * @returns {{ inPeriod: object[], outOfPeriod: object[] }}
     */
    function filterCirurgiasRowsByPeriod(rows, dateFromIso, dateToIso) {
      var list = Array.isArray(rows) ? rows : [];
      var from = normalizeBoundIso(dateFromIso);
      var to = normalizeBoundIso(dateToIso);
      if (!from && !to) {
        return { inPeriod: list.slice(), outOfPeriod: [] };
      }
      var inPeriod = [];
      var outOfPeriod = [];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (isCirurgiaInPeriod(row, from, to)) {
          inPeriod.push(row);
        } else {
          outOfPeriod.push(row);
        }
      }
      return { inPeriod: inPeriod, outOfPeriod: outOfPeriod };
    }

    return {
      cirurgiaDataToIso: cirurgiaDataToIso,
      isCirurgiaInPeriod: isCirurgiaInPeriod,
      filterCirurgiasRowsByPeriod: filterCirurgiasRowsByPeriod,
      normalizeBoundIso: normalizeBoundIso,
    };
  }
);
