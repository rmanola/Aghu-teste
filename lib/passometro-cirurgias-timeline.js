/**
 * Timeline de cirurgias do passômetro com PO paralelo por procedimento.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroCirurgiasTimeline = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getPoNotasApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-cirurgia-po-notas.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroCirurgiaPoNotas
    ) {
      return globalThis.AghuPassometroCirurgiaPoNotas;
    }
    return null;
  }

  function getPo() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-po.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroPo) {
      return globalThis.AghuPassometroPo;
    }
    return null;
  }

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuDateBr) {
      return globalThis.AghuDateBr;
    }
    return null;
  }

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

  function str(v) {
    return v == null ? "" : String(v);
  }

  function parseDateMs(data) {
    var order = getEntriesOrder();
    if (!order || !order.parseEntryDateMs) return NaN;
    return order.parseEntryDateMs(data);
  }

  function entryOnOrAfterSurgery(entryData, surgeryData) {
    var entryMs = parseDateMs(str(entryData).trim());
    var surgeryMs = parseDateMs(str(surgeryData).trim());
    if (
      !Number.isFinite(entryMs) ||
      !Number.isFinite(surgeryMs) ||
      entryMs === Infinity ||
      surgeryMs === Infinity
    ) {
      return false;
    }
    return entryMs >= surgeryMs;
  }

  /**
   * @param {{ id?: string, data?: string, nome?: string, descricao?: string }[]} cirurgias
   * @param {string} entryData
   * @returns {{ id: string, data: string, nome: string, descricao: string } | null}
   */
  function resolveAnchorCirurgia(cirurgias, entryData) {
    var po = getPo();
    if (!po || !po.resolveAnchorData) return null;
    var anchor = po.resolveAnchorData(cirurgias, entryData);
    if (!anchor) return null;
    var found = null;
    for (var i = 0; i < cirurgias.length; i++) {
      var c = cirurgias[i];
      if (str(c.data).trim() === anchor) found = c;
    }
    return found;
  }

  /**
   * @param {{ header?: object, entries?: object[] }} snap
   * @param {string} [todayBr]
   * @returns {{
   *   cirurgias: { id: string, data: string, nome: string, descricao: string, poToday: string, entries: object[] }[];
   *   unassignedEntries: object[];
   * }}
   */
  function buildCirurgiasTimeline(snap, todayBr) {
    var po = getPo();
    var dateBr = getDateBr();
    if (!po) {
      return { cirurgias: [], unassignedEntries: [] };
    }

    var header = snap && snap.header ? snap.header : {};
    var cirurgias = po.normalizeCirurgias(header);
    var today =
      todayBr ||
      (dateBr && dateBr.localTodayBr ? dateBr.localTodayBr() : "");

    var sortedCirurgias = cirurgias.slice().sort(function (a, b) {
      return parseDateMs(a.data) - parseDateMs(b.data);
    });

    var entries = Array.isArray(snap && snap.entries) ? snap.entries : [];
    var unassigned = [];
    var firstSurgeryMs =
      sortedCirurgias.length > 0
        ? parseDateMs(str(sortedCirurgias[0].data).trim())
        : NaN;

    for (var ei = 0; ei < entries.length; ei++) {
      var entry = entries[ei];
      if (!entry || typeof entry !== "object") continue;
      var entryMs = parseDateMs(str(entry.data).trim());
      if (
        !sortedCirurgias.length ||
        !Number.isFinite(firstSurgeryMs) ||
        !Number.isFinite(entryMs) ||
        entryMs < firstSurgeryMs
      ) {
        unassigned.push(entry);
      }
    }

    var poNotasApi = getPoNotasApi();

    var timeline = sortedCirurgias.map(function (c) {
      var id = str(c.id) || str(c.data);
      var surgeryData = str(c.data).trim();
      var passometroByDate = {};
      var list = entries.filter(function (entry) {
        if (!entry || typeof entry !== "object") return false;
        return entryOnOrAfterSurgery(entry.data, surgeryData);
      });
      for (var pi = 0; pi < list.length; pi++) {
        var pe = list[pi];
        var pDate = str(pe.data).trim();
        if (pDate) passometroByDate[pDate] = pe;
      }

      var poNotas =
        poNotasApi && poNotasApi.normalizePoNotas
          ? poNotasApi.normalizePoNotas(c.poNotas)
          : [];
      var dateKeys = {};
      for (var di = 0; di < list.length; di++) {
        dateKeys[str(list[di].data).trim()] = true;
      }
      for (var ni = 0; ni < poNotas.length; ni++) {
        var note = poNotas[ni];
        if (entryOnOrAfterSurgery(note.data, surgeryData)) {
          dateKeys[note.data] = true;
        }
      }

      var mergedDates = Object.keys(dateKeys).sort(function (a, b) {
        return parseDateMs(a) - parseDateMs(b);
      });

      var poToday = po.computePoDn(surgeryData, today);
      return {
        id: id,
        data: surgeryData,
        nome: str(c.nome),
        descricao: str(c.descricao),
        equipe: str(c.equipe),
        achadosOperatorios: str(c.achadosOperatorios),
        poToday: poToday,
        entries: mergedDates.map(function (day) {
          var passometroEntry = passometroByDate[day] || null;
          var poNota =
            poNotasApi && poNotasApi.getPoNota
              ? poNotasApi.getPoNota(c, day)
              : null;
          return {
            id: passometroEntry
              ? str(passometroEntry.id)
              : "po-nota-" + id + "-" + day.replace(/\//g, ""),
            data: day,
            po: po.computePoDn(surgeryData, day),
            complicacoes: poNota ? str(poNota.complicacoes) : "",
            cd: passometroEntry ? str(passometroEntry.cd).trim() : "",
            pendencias: passometroEntry
              ? str(passometroEntry.pendencias).trim()
              : "",
            fromPassometro: !!passometroEntry,
          };
        }),
      };
    });

    return {
      cirurgias: timeline,
      unassignedEntries: unassigned,
    };
  }

  return {
    resolveAnchorCirurgia: resolveAnchorCirurgia,
    buildCirurgiasTimeline: buildCirurgiasTimeline,
  };
});
