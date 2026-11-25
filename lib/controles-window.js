/**
 * Janelas clínicas de 24h para controles (âncora 07:00).
 * Testável em Node via module.exports; extensão: global AghuControlesWindow.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesWindow = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CLINICAL_WINDOW_ANCHOR_HOUR = 7;
  var PERIODO_SEM_HORARIO = "sem horário";
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var MS_PER_MIN = 60 * 1000;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function expandYear(yy) {
    var n = parseInt(yy, 10);
    if (!Number.isFinite(n)) return yy;
    if (n >= 100) return n;
    return n < 50 ? 2000 + n : 1900 + n;
  }

  function partsFromMs(ms) {
    var d = new Date(ms);
    return {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }

  function msFromParts(day, month, year, hour, minute) {
    return new Date(year, month - 1, day, hour, minute || 0, 0, 0).getTime();
  }

  /**
   * @param {string} raw
   * @param {{ day: number, month: number, year: number }|null} refDate
   * @returns {number|null}
   */
  function parseHorarioBr(raw, refDate) {
    if (raw == null) return null;
    var t = String(raw).trim();
    if (!t) return null;

    var full = t.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (full) {
      var y = expandYear(full[3]);
      var day = parseInt(full[1], 10);
      var month = parseInt(full[2], 10);
      var hour = parseInt(full[4], 10);
      var minute = parseInt(full[5], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return msFromParts(day, month, y, hour, minute);
    }

    var timeOnly = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnly && refDate) {
      return msFromParts(
        refDate.day,
        refDate.month,
        refDate.year,
        parseInt(timeOnly[1], 10),
        parseInt(timeOnly[2], 10),
      );
    }

    return null;
  }

  /**
   * @param {number} tsMs
   * @param {number} [anchorHour]
   * @returns {number}
   */
  function clinicalWindowStartMs(tsMs, anchorHour) {
    var anchor = anchorHour != null ? anchorHour : CLINICAL_WINDOW_ANCHOR_HOUR;
    var p = partsFromMs(tsMs);
    var startToday = msFromParts(p.day, p.month, p.year, anchor, 0);
    if (tsMs < startToday) {
      return startToday - MS_PER_DAY;
    }
    return startToday;
  }

  /**
   * @param {number} startMs
   * @param {number} [anchorHour]
   * @returns {string}
   */
  function formatWindowPeriodo(startMs, anchorHour) {
    var anchor = anchorHour != null ? anchorHour : CLINICAL_WINDOW_ANCHOR_HOUR;
    var endMs = startMs + MS_PER_DAY - MS_PER_MIN;
    var s = partsFromMs(startMs);
    var e = partsFromMs(endMs);
    return (
      pad2(s.day) +
      "/" +
      pad2(s.month) +
      "/" +
      s.year +
      " " +
      pad2(anchor) +
      ":00 → " +
      pad2(e.day) +
      "/" +
      pad2(e.month) +
      "/" +
      e.year +
      " " +
      pad2(e.hour) +
      ":" +
      pad2(e.minute)
    );
  }

  function horarioHasCalendarDate(raw) {
    return /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(raw || "").trim());
  }

  /**
   * @param {string|undefined} horario
   * @returns {number|null}
   */
  function tsFromRegHorario(horario) {
    if (horarioHasCalendarDate(horario)) {
      return parseHorarioBr(horario, null);
    }
    if (!horario) return null;
    var loose = String(horario).trim();
    var m = loose.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseHorarioBr(
      m[1] + "/" + m[2] + "/" + m[3] + " " + m[4] + ":" + m[5],
      null,
    );
  }

  /**
   * AGHU lista mais recente no topo; inferência sequencial exige ordem cronológica.
   * @param {Array<{ horario?: string }>} regs
   * @returns {Array<object>}
   */
  function orderRegsForTimestampInference(regs) {
    if (!Array.isArray(regs) || regs.length < 2) return regs;
    var firstIdx = -1;
    var firstTs = null;
    var lastIdx = -1;
    var lastTs = null;

    for (var i = 0; i < regs.length; i++) {
      var ts = tsFromRegHorario(regs[i].horario);
      if (ts === null) continue;
      if (firstIdx < 0) {
        firstIdx = i;
        firstTs = ts;
      }
      lastIdx = i;
      lastTs = ts;
    }

    if (firstIdx >= 0 && lastIdx > firstIdx && firstTs > lastTs) {
      return regs.slice().reverse();
    }
    return regs;
  }

  /**
   * @param {{ horario?: string }} reg
   * @param {{ day: number, month: number, year: number }|null} lastDate
   * @returns {{ tsMs: number|null, hasDate: boolean }}
   */
  function parseHorarioFromReg(reg, lastDate) {
    var horario = reg.horario;
    var hasDate = horarioHasCalendarDate(horario);
    var tsMs = parseHorarioBr(horario, hasDate ? null : lastDate);
    if (tsMs === null && horario) {
      var loose = String(horario).trim();
      var m = loose.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
      if (m) {
        tsMs = parseHorarioBr(
          m[1] + "/" + m[2] + "/" + m[3] + " " + m[4] + ":" + m[5],
          null,
        );
        hasDate = true;
      }
    }
    return { tsMs: tsMs, hasDate: hasDate };
  }

  /**
   * Infere timestamps na ordem dos registros (ri / ordem da tabela).
   * @param {Array<{ horario?: string, ri?: number }>} regs
   * @returns {Array<{ reg: object, tsMs: number|null }>}
   */
  function attachTimestamps(regs) {
    if (!Array.isArray(regs)) return [];
    var ordered = orderRegsForTimestampInference(regs);
    var lastDate = null;
    var lastTs = null;
    var out = [];

    for (var i = 0; i < ordered.length; i++) {
      var reg = ordered[i];
      var parsed = parseHorarioFromReg(reg, lastDate);
      var tsMs = parsed.tsMs;
      var hasDate = parsed.hasDate;

      if (tsMs !== null) {
        if (!hasDate && lastTs !== null) {
          if (tsMs < lastTs - 12 * 60 * MS_PER_MIN) {
            tsMs += MS_PER_DAY;
          } else if (tsMs > lastTs + 12 * 60 * MS_PER_MIN) {
            tsMs -= MS_PER_DAY;
          }
        }
        lastDate = partsFromMs(tsMs);
        lastTs = tsMs;
      }
      out.push({ reg: reg, tsMs: tsMs });
    }
    return out;
  }

  /**
   * @param {Array<object>} regs
   * @param {{ anchorHour?: number }} [opts]
   * @returns {Array<{ windowKey: string, periodo: string, windowStartMs: number|null, registros: object[] }>}
   */
  function groupRegistrosByClinicalWindow(regs, opts) {
    opts = opts || {};
    var anchorHour =
      opts.anchorHour != null ? opts.anchorHour : CLINICAL_WINDOW_ANCHOR_HOUR;
    if (!Array.isArray(regs) || !regs.length) return [];

    var withTs = attachTimestamps(regs);
    var buckets = new Map();
    var unknown = [];

    for (var i = 0; i < withTs.length; i++) {
      var item = withTs[i];
      if (item.tsMs === null) {
        unknown.push(item.reg);
        continue;
      }
      var startMs = clinicalWindowStartMs(item.tsMs, anchorHour);
      var key = String(startMs);
      if (!buckets.has(key)) {
        buckets.set(key, {
          windowKey: key,
          windowStartMs: startMs,
          periodo: formatWindowPeriodo(startMs, anchorHour),
          registros: [],
        });
      }
      buckets.get(key).registros.push(item.reg);
    }

    var groups = Array.from(buckets.values()).sort(function (a, b) {
      return (a.windowStartMs || 0) - (b.windowStartMs || 0);
    });

    for (var g = 0; g < groups.length; g++) {
      groups[g].registros.sort(function (a, b) {
        return (a.ri || 0) - (b.ri || 0);
      });
    }

    if (unknown.length) {
      groups.push({
        windowKey: PERIODO_SEM_HORARIO,
        windowStartMs: null,
        periodo: PERIODO_SEM_HORARIO,
        registros: unknown,
      });
    }

    return groups;
  }

  /**
   * Registros cuja timestamp cai na janela clínica [windowStartMs, windowStartMs + 24h - 1min].
   * windowStartMs === null → bucket "sem horário" (linhas sem timestamp parseável).
   * @param {Array<{ horario?: string, ri?: number }>} regs
   * @param {number|null} windowStartMs
   * @param {number} [anchorHour]
   * @returns {Array<object>}
   */
  function filterRegsInClinicalWindow(regs, windowStartMs, anchorHour) {
    if (!Array.isArray(regs) || !regs.length) return [];
    var withTs = attachTimestamps(regs);

    if (windowStartMs === null || windowStartMs === undefined) {
      return withTs
        .filter(function (item) {
          return item.tsMs === null;
        })
        .map(function (item) {
          return item.reg;
        });
    }

    var endMs = windowStartMs + MS_PER_DAY - MS_PER_MIN;
    return withTs
      .filter(function (item) {
        return item.tsMs !== null && item.tsMs >= windowStartMs && item.tsMs <= endMs;
      })
      .map(function (item) {
        return item.reg;
      });
  }

  /**
   * Set de data-ri (string) para filtrar linhas de uma tabela (ex.: BH) numa janela.
   * @param {Array<{ horario?: string, ri?: number }>} regs
   * @param {number|null} windowStartMs
   * @param {number} [anchorHour]
   * @returns {Set<string>}
   */
  function buildRiSetForWindow(regs, windowStartMs, anchorHour) {
    var filtered = filterRegsInClinicalWindow(regs, windowStartMs, anchorHour);
    var out = new Set();
    for (var i = 0; i < filtered.length; i++) {
      var ri = filtered[i].ri;
      if (ri !== null && ri !== undefined) out.add(String(ri));
    }
    return out;
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addLocalDays(d, delta) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setDate(out.getDate() + delta);
    return out;
  }

  function formatBrDateTime(d, hour, minute) {
    var p = partsFromMs(d.getTime());
    return (
      pad2(p.day) +
      "/" +
      pad2(p.month) +
      "/" +
      p.year +
      " " +
      pad2(hour) +
      ":" +
      pad2(minute != null ? minute : 0)
    );
  }

  /**
   * Intervalo AGHU dataInicio/dataFim para pesquisa Controles (janela clínica 07:00→06:59).
   * @param {Date} fromDate — dia civil inclusivo (início)
   * @param {Date} toDate — dia civil inclusivo (fim)
   * @param {number} [anchorHour]
   * @returns {{ dateFromCtrl: string, dateToCtrl: string }}
   */
  function controlesAgHuQueryBounds(fromDate, toDate, anchorHour) {
    var anchor = anchorHour != null ? anchorHour : CLINICAL_WINDOW_ANCHOR_HOUR;
    var from = startOfLocalDay(fromDate);
    var to = startOfLocalDay(toDate);
    var endWindowDay = addLocalDays(to, 1);
    var endMs =
      msFromParts(
        endWindowDay.getDate(),
        endWindowDay.getMonth() + 1,
        endWindowDay.getFullYear(),
        anchor,
        0
      ) - MS_PER_MIN;
    var endParts = partsFromMs(endMs);
    return {
      dateFromCtrl: formatBrDateTime(from, anchor, 0),
      dateToCtrl:
        pad2(endParts.day) +
        "/" +
        pad2(endParts.month) +
        "/" +
        endParts.year +
        " " +
        pad2(endParts.hour) +
        ":" +
        pad2(endParts.minute),
    };
  }

  return {
    CLINICAL_WINDOW_ANCHOR_HOUR: CLINICAL_WINDOW_ANCHOR_HOUR,
    PERIODO_SEM_HORARIO: PERIODO_SEM_HORARIO,
    parseHorarioBr: parseHorarioBr,
    clinicalWindowStartMs: clinicalWindowStartMs,
    formatWindowPeriodo: formatWindowPeriodo,
    horarioHasCalendarDate: horarioHasCalendarDate,
    orderRegsForTimestampInference: orderRegsForTimestampInference,
    attachTimestamps: attachTimestamps,
    groupRegistrosByClinicalWindow: groupRegistrosByClinicalWindow,
    filterRegsInClinicalWindow: filterRegsInClinicalWindow,
    buildRiSetForWindow: buildRiSetForWindow,
    controlesAgHuQueryBounds: controlesAgHuQueryBounds,
  };
});
