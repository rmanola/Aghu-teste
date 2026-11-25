/**
 * Complicações PO por cirurgia e data (passometro.header.cirurgias[].poNotas).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroCirurgiaPoNotas = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getEntriesOrder() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-order.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroEntriesOrder
    ) {
      return globalThis.AghuPassometroEntriesOrder;
    }
    return null;
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroSchema) {
      return globalThis.AghuPassometroSchema;
    }
    return null;
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function parseDateMs(data) {
    var order = getEntriesOrder();
    if (!order || !order.parseEntryDateMs) return NaN;
    return order.parseEntryDateMs(data);
  }

  function normalizeDateField(value) {
    var schema = getSchema();
    if (schema && schema.normalizeDateField) {
      return schema.normalizeDateField(value);
    }
    return str(value).trim();
  }

  /**
   * @param {unknown} src
   * @returns {{ data: string, complicacoes: string } | null}
   */
  function normalizePoNotaItem(src) {
    if (!src || typeof src !== "object") return null;
    var data = normalizeDateField(str(src.data));
    if (!data) return null;
    return {
      data: data,
      complicacoes: str(src.complicacoes),
    };
  }

  /**
   * @param {unknown} list
   * @returns {{ data: string, complicacoes: string }[]}
   */
  function normalizePoNotas(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var item = normalizePoNotaItem(list[i]);
      if (!item || seen[item.data]) continue;
      seen[item.data] = true;
      out.push(item);
    }
    out.sort(function (a, b) {
      return parseDateMs(a.data) - parseDateMs(b.data);
    });
    return out;
  }

  /**
   * @param {object | null | undefined} cirurgia
   * @param {string} data
   * @returns {{ data: string, complicacoes: string } | null}
   */
  function getPoNota(cirurgia, data) {
    var key = normalizeDateField(data);
    if (!key || !cirurgia || typeof cirurgia !== "object") return null;
    var list = normalizePoNotas(cirurgia.poNotas);
    for (var i = 0; i < list.length; i++) {
      if (list[i].data === key) return list[i];
    }
    return null;
  }

  /**
   * @param {object} cirurgia
   * @param {string} data
   * @param {{ complicacoes?: string }} patch
   * @returns {object}
   */
  function upsertPoNotaOnCirurgia(cirurgia, data, patch) {
    var key = normalizeDateField(data);
    if (!key) return cirurgia;
    var list = normalizePoNotas(cirurgia.poNotas);
    var next = {
      data: key,
      complicacoes: patch.complicacoes != null ? str(patch.complicacoes) : "",
    };
    var found = false;
    var merged = list.map(function (item) {
      if (item.data !== key) return item;
      found = true;
      return {
        data: key,
        complicacoes:
          patch.complicacoes != null
            ? str(patch.complicacoes)
            : item.complicacoes,
      };
    });
    if (!found) merged.push(next);
    merged.sort(function (a, b) {
      return parseDateMs(a.data) - parseDateMs(b.data);
    });
    return Object.assign({}, cirurgia, { poNotas: merged });
  }

  return {
    normalizePoNotaItem: normalizePoNotaItem,
    normalizePoNotas: normalizePoNotas,
    getPoNota: getPoNota,
    upsertPoNotaOnCirurgia: upsertPoNotaOnCirurgia,
  };
});
