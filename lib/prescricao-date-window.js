/**
 * Janela clínica de filtro de prescrições (âncora 16:00 → 15:59).
 * Dia civil D na UI → validadeInicial ∈ [D−1 16:00, D 15:59] (inclusivo).
 * Espelha Controles 07:00→06:59.
 * Testável em Node via module.exports; extensão: global AghuPrescricaoDateWindow.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPrescricaoDateWindow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRESCRIPTION_ANCHOR_HOUR = 16;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function expandYear(yy) {
    var n = parseInt(yy, 10);
    if (!Number.isFinite(n)) return yy;
    if (n >= 100) return n;
    return n < 50 ? 2000 + n : 1900 + n;
  }

  function msFromParts(day, month, year, hour, minute) {
    return new Date(year, month - 1, day, hour, minute || 0, 0, 0).getTime();
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addLocalDays(d, delta) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setDate(out.getDate() + delta);
    return out;
  }

  /**
   * Parse dd/mm/yy|yyyy [HH:MM] → ms local; null se inválido.
   * @param {string} raw
   * @returns {number|null}
   */
  function parseValidadeMs(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var m = s.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/,
    );
    if (!m) return null;
    var y = expandYear(m[3]);
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10);
    var hour = m[4] != null ? parseInt(m[4], 10) : 0;
    var minute = m[5] != null ? parseInt(m[5], 10) : 0;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var ms = msFromParts(day, month, y, hour, minute);
    if (!Number.isFinite(ms)) return null;
    return ms;
  }

  /**
   * Dia civil a partir de Date, ISO yyyy-mm-dd ou BR dd/mm/aa(aa).
   * @param {Date|string} value
   * @returns {Date|null}
   */
  function parseFilterDayInput(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return startOfLocalDay(value);
    }
    var s = String(value == null ? "" : value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split("-");
      return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0);
    }
    var ms = parseValidadeMs(s);
    if (ms == null) return null;
    var d = new Date(ms);
    return startOfLocalDay(d);
  }

  /**
   * UI De/Até (dias civis inclusivos) → intervalo inclusivo em ms.
   * De=D1, Até=D2 → [D1−1 16:00, D2 15:59].
   * @param {Date} fromDate
   * @param {Date} toDate
   * @param {number} [anchorHour]
   * @returns {{ fromMs: number, toInclusiveMs: number }}
   */
  function prescricaoFilterRangeFromDays(fromDate, toDate, anchorHour) {
    var anchor =
      anchorHour != null ? anchorHour : PRESCRIPTION_ANCHOR_HOUR;
    var from = startOfLocalDay(fromDate);
    var to = startOfLocalDay(toDate);
    var fromAnchorDay = addLocalDays(from, -1);
    var fromMs = msFromParts(
      fromAnchorDay.getDate(),
      fromAnchorDay.getMonth() + 1,
      fromAnchorDay.getFullYear(),
      anchor,
      0,
    );
    // Fim inclusivo = D2 @ (anchor − 1 min) → 15:59 quando âncora = 16.
    var toExclusiveMs = msFromParts(
      to.getDate(),
      to.getMonth() + 1,
      to.getFullYear(),
      anchor,
      0,
    );
    var toInclusiveMs = toExclusiveMs - 60 * 1000;
    return { fromMs: fromMs, toInclusiveMs: toInclusiveMs };
  }

  /**
   * Range a partir de strings De/Até (BR ou ISO). Null se ambas vazias; { error } se inválido.
   * @param {string|null|undefined} dateFrom
   * @param {string|null|undefined} dateTo
   * @returns {{ fromMs: number, toInclusiveMs: number } | null | { error: string }}
   */
  function prescricaoFilterRangeFromStrings(dateFrom, dateTo) {
    var fromRaw =
      dateFrom != null && String(dateFrom).trim() !== ""
        ? String(dateFrom).trim()
        : "";
    var toRaw =
      dateTo != null && String(dateTo).trim() !== ""
        ? String(dateTo).trim()
        : "";
    if (!fromRaw && !toRaw) return null;

    var fromDay = null;
    var toDay = null;
    if (fromRaw && !toRaw) {
      fromDay = parseFilterDayInput(fromRaw);
      if (!fromDay) {
        return { error: "Data inicial inválida. Use dd/mm/aaaa ou dd/mm/aa." };
      }
      toDay = fromDay;
    } else if (!fromRaw && toRaw) {
      toDay = parseFilterDayInput(toRaw);
      if (!toDay) {
        return { error: "Data final inválida. Use dd/mm/aaaa ou dd/mm/aa." };
      }
      fromDay = toDay;
    } else {
      fromDay = parseFilterDayInput(fromRaw);
      toDay = parseFilterDayInput(toRaw);
      if (!fromDay) {
        return { error: "Data inicial inválida. Use dd/mm/aaaa ou dd/mm/aa." };
      }
      if (!toDay) {
        return { error: "Data final inválida. Use dd/mm/aaaa ou dd/mm/aa." };
      }
    }
    if (fromDay.getTime() > toDay.getTime()) {
      return { error: "Intervalo inválido: De deve ser ≤ Até." };
    }
    return prescricaoFilterRangeFromDays(fromDay, toDay);
  }

  /**
   * Match por validadeInicial no inclusivo [fromMs, toInclusiveMs].
   * Aceita legado toExclusiveMs (meio-aberto) se toInclusiveMs ausente.
   * Sem início mas com fim: infere início = fim − 24h (validade AGHU típica).
   * @param {string} validadeInicial
   * @param {string} validadeFinal
   * @param {{ fromMs: number, toInclusiveMs?: number, toExclusiveMs?: number }} range
   * @returns {boolean}
   */
  function prescricaoValidadeMatchesFilter(
    validadeInicial,
    validadeFinal,
    range,
  ) {
    if (!range || typeof range.fromMs !== "number") return false;
    var startMs = parseValidadeMs(validadeInicial);
    if (startMs == null) {
      var endMs = parseValidadeMs(validadeFinal);
      if (endMs == null) return false;
      startMs = endMs - MS_PER_DAY;
    }
    if (typeof range.toInclusiveMs === "number") {
      return startMs >= range.fromMs && startMs <= range.toInclusiveMs;
    }
    if (typeof range.toExclusiveMs === "number") {
      return startMs >= range.fromMs && startMs < range.toExclusiveMs;
    }
    return false;
  }

  /**
   * Filtra entries[] pela janela clínica (validadeInicial/Final ou data).
   * @param {Array<object>} entries
   * @param {{ fromMs: number, toInclusiveMs?: number, toExclusiveMs?: number }} range
   * @returns {Array<object>}
   */
  function filterEntriesByClinicalRange(entries, range) {
    if (!range || !Array.isArray(entries)) return [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e) continue;
      var vi = e.validadeInicial || "";
      var vf = e.validadeFinal || "";
      if (!vi && !vf && e.data) {
        var parts = String(e.data).split(/\s*→\s*/);
        vi = parts[0] || "";
        vf = parts[1] || "";
      }
      if (prescricaoValidadeMatchesFilter(vi, vf, range)) {
        out.push(e);
      }
    }
    return out;
  }

  /**
   * Dias civis inclusivos entre De/Até (BR ou ISO). Null se inválido/vazio.
   * @param {string|null|undefined} dateFrom
   * @param {string|null|undefined} dateTo
   * @returns {number|null}
   */
  function inclusiveCivilDaysFromStrings(dateFrom, dateTo) {
    var fromRaw =
      dateFrom != null && String(dateFrom).trim() !== ""
        ? String(dateFrom).trim()
        : "";
    var toRaw =
      dateTo != null && String(dateTo).trim() !== ""
        ? String(dateTo).trim()
        : "";
    if (!fromRaw && !toRaw) return null;
    var fromDay = parseFilterDayInput(fromRaw || toRaw);
    var toDay = parseFilterDayInput(toRaw || fromRaw);
    if (!fromDay || !toDay) return null;
    if (fromDay.getTime() > toDay.getTime()) return null;
    return Math.round((toDay.getTime() - fromDay.getTime()) / MS_PER_DAY) + 1;
  }

  /**
   * Re-filtro defensivo de lote pós-extract (popup / domain-extract).
   * @param {Array<object>} entries
   * @param {string|null|undefined} dateFrom
   * @param {string|null|undefined} dateTo
   * @returns {{
   *   ok: boolean,
   *   entries: Array<object>,
   *   filtered: boolean,
   *   inclusiveDays: number|null,
   *   singleDay: boolean,
   *   range: object|null,
   *   error?: string
   * }}
   */
  function refilterBatchForDates(entries, dateFrom, dateTo) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    if (
      (dateFrom == null || String(dateFrom).trim() === "") &&
      (dateTo == null || String(dateTo).trim() === "")
    ) {
      return {
        ok: true,
        entries: list,
        filtered: false,
        inclusiveDays: null,
        singleDay: false,
        range: null,
      };
    }
    var rangeOrErr = prescricaoFilterRangeFromStrings(dateFrom, dateTo);
    if (rangeOrErr && rangeOrErr.error) {
      return {
        ok: false,
        entries: [],
        filtered: true,
        inclusiveDays: null,
        singleDay: false,
        range: null,
        error: rangeOrErr.error,
      };
    }
    if (!rangeOrErr || typeof rangeOrErr.fromMs !== "number") {
      return {
        ok: true,
        entries: list,
        filtered: false,
        inclusiveDays: null,
        singleDay: false,
        range: null,
      };
    }
    var inclusiveDays = inclusiveCivilDaysFromStrings(dateFrom, dateTo);
    var filtered = filterEntriesByClinicalRange(list, rangeOrErr);
    var singleDay = inclusiveDays === 1;
    if (singleDay && filtered.length > 1) {
      return {
        ok: false,
        entries: filtered,
        filtered: true,
        inclusiveDays: inclusiveDays,
        singleDay: true,
        range: rangeOrErr,
        error:
          "Filtro de 1 dia retornou " +
          filtered.length +
          " validades (esperado ≤1 na janela 16:00→15:59). Recarregue a extensão em about:debugging e tente de novo.",
      };
    }
    return {
      ok: true,
      entries: filtered,
      filtered: true,
      inclusiveDays: inclusiveDays,
      singleDay: singleDay,
      range: rangeOrErr,
    };
  }

  return {
    PRESCRIPTION_ANCHOR_HOUR: PRESCRIPTION_ANCHOR_HOUR,
    parseValidadeMs: parseValidadeMs,
    parseFilterDayInput: parseFilterDayInput,
    prescricaoFilterRangeFromDays: prescricaoFilterRangeFromDays,
    prescricaoFilterRangeFromStrings: prescricaoFilterRangeFromStrings,
    prescricaoValidadeMatchesFilter: prescricaoValidadeMatchesFilter,
    filterEntriesByClinicalRange: filterEntriesByClinicalRange,
    inclusiveCivilDaysFromStrings: inclusiveCivilDaysFromStrings,
    refilterBatchForDates: refilterBatchForDates,
  };
});
