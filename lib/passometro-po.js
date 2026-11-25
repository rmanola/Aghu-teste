/**
 * PO pós-operatório (Dn) a partir de cirurgias no cabeçalho e data do dia.
 * D0 = dia da cirurgia-âncora; reinicia na cirurgia mais recente <= data da entrada.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroPo = api;
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

  function getFieldLimits() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-field-limits.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroFieldLimits
    ) {
      return globalThis.AghuPassometroFieldLimits;
    }
    return null;
  }

  function parseDateMs(data) {
    var order = getEntriesOrder();
    if (!order || !order.parseEntryDateMs) return NaN;
    return order.parseEntryDateMs(data);
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * @param {object | null | undefined} header
   * @returns {{ id: string, data: string, nome: string, descricao: string, achadosOperatorios: string }[]}
   */
  function normalizeCirurgias(header) {
    var schema = getSchema();
    if (schema && schema.normalizeCirurgiasFromHeader) {
      return schema.normalizeCirurgiasFromHeader(header);
    }
    if (!header || typeof header !== "object") return [];
    if (Array.isArray(header.cirurgias) && header.cirurgias.length) {
      return header.cirurgias
        .filter(function (c) {
          return c && str(c.data).trim();
        })
        .map(function (c) {
          return {
            id: str(c.id),
            data: str(c.data).trim(),
            nome: str(c.nome).trim() || str(c.descricao).trim(),
            descricao: str(c.nome).trim() ? str(c.descricao).trim() : "",
            achadosOperatorios: str(c.achadosOperatorios).trim(),
          };
        });
    }
    var legacy = str(header.dataCirurgia).trim();
    if (!legacy) return [];
    return [
      {
        id: "",
        data: legacy,
        nome: str(header.cirurgia),
        descricao: "",
        achadosOperatorios: "",
      },
    ];
  }

  /**
   * @param {{ data: string }[]} cirurgias ordenadas
   * @param {string} entryData DD/MM/AAAA
   * @returns {string} data da cirurgia-âncora ou ""
   */
  function resolveAnchorData(cirurgias, entryData) {
    if (!Array.isArray(cirurgias) || !cirurgias.length) return "";
    var entryMs = parseDateMs(entryData);
    if (!Number.isFinite(entryMs) || entryMs === Infinity) return "";

    var anchor = "";
    for (var i = 0; i < cirurgias.length; i++) {
      var data = str(cirurgias[i].data).trim();
      if (!data) continue;
      var surgeryMs = parseDateMs(data);
      if (!Number.isFinite(surgeryMs) || surgeryMs === Infinity) continue;
      if (surgeryMs <= entryMs) anchor = data;
    }
    return anchor;
  }

  /**
   * @param {string} dataCirurgia DD/MM/AAAA
   * @param {string} entryData DD/MM/AAAA
   * @returns {string} "Dn" ou "" se inválido ou antes da cirurgia
   */
  function computePoDn(dataCirurgia, entryData) {
    var surgeryMs = parseDateMs(dataCirurgia);
    var entryMs = parseDateMs(entryData);
    if (!Number.isFinite(surgeryMs) || !Number.isFinite(entryMs)) return "";
    if (surgeryMs === Infinity || entryMs === Infinity) return "";
    var diffDays = Math.round((entryMs - surgeryMs) / 86400000);
    if (diffDays < 0) return "";
    return "D" + diffDays;
  }

  /**
   * @param {object | null | undefined} header
   * @param {string} entryData
   * @returns {string}
   */
  function computePoDnForHeader(header, entryData) {
    var cirurgias = normalizeCirurgias(header);
    var anchor = resolveAnchorData(cirurgias, entryData);
    if (!anchor) return "";
    return computePoDn(anchor, entryData);
  }

  /**
   * @param {object | null | undefined} header
   * @returns {string[]}
   */
  function poSurgeryMarkers(header) {
    return normalizeCirurgias(header)
      .map(function (c) {
        return str(c.data).trim();
      })
      .filter(Boolean);
  }

  /**
   * Copy/display (passômetro): data — nome — achados (omite vazios).
   * Sem descrição técnica — essa fica só na aba Cirurgia / schema.
   * Narrativa (nome+achados) partilha LIMIT_HEADER_SHARED com HDA/diagnósticos.
   * @param {object | null | undefined} header
   * @returns {string}
   */
  function formatCirurgiasDisplay(header) {
    var limits = getFieldLimits();
    var h = header;
    if (limits && typeof limits.clampHeaderNarrative === "function" && h) {
      h = limits.clampHeaderNarrative(h, null, null);
    }
    return normalizeCirurgias(h)
      .map(function (c) {
        var parts = [];
        var data = str(c.data).trim();
        var nome = str(c.nome).trim();
        var achados = str(c.achadosOperatorios).trim();
        if (data) parts.push(data);
        if (nome) parts.push(nome);
        if (achados) parts.push(achados);
        return parts.join(" — ");
      })
      .filter(Boolean)
      .join("\n");
  }

  /**
   * @param {{ header?: object, entries?: object[] }} snap
   * @returns {typeof snap}
   */
  function applyPoToSnap(snap) {
    if (!snap || typeof snap !== "object") return snap;
    var header = snap.header;
    if (!header) return snap;
    var cirurgias = normalizeCirurgias(header);
    if (!cirurgias.length) return snap;
    if (!Array.isArray(snap.entries)) return snap;

    var entries = snap.entries.map(function (entry) {
      if (!entry || typeof entry !== "object") return entry;
      var po = computePoDnForHeader(header, entry.data);
      if (entry.po === po) return entry;
      return Object.assign({}, entry, { po: po });
    });

    return Object.assign({}, snap, { entries: entries });
  }

  return {
    computePoDn: computePoDn,
    normalizeCirurgias: normalizeCirurgias,
    resolveAnchorData: resolveAnchorData,
    computePoDnForHeader: computePoDnForHeader,
    poSurgeryMarkers: poSurgeryMarkers,
    formatCirurgiasDisplay: formatCirurgiasDisplay,
    applyPoToSnap: applyPoToSnap,
  };
});
