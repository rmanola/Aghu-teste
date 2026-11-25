/**
 * Janelas temporais do painel de qualidade (FEAT-092).
 * Datas em YYYY-MM-DD no fuso local do `asOf` / browser.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuQualityPeriodRange = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PERIOD_PRESETS = [
    "7d",
    "30d",
    "3m",
    "6m",
    "12m",
    "week",
    "month",
    "all",
  ];
  var DEFAULT_PERIOD = "30d";

  /** Labels humanas para selects/chips (value interno permanece o preset). */
  var PERIOD_LABELS = {
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
    "3m": "Últimos 3 meses",
    "6m": "Últimos 6 meses",
    "12m": "Últimos 12 meses",
    week: "Esta semana",
    month: "Este mês",
    all: "Todos os períodos",
  };

  /** Janela explícita `{ from, to }` — FEAT-126 (séries de N janelas). */
  var CUSTOM_PERIOD = "custom";

  /**
   * @param {string|{ from?: string, to?: string, label?: string }|null|undefined} period
   * @returns {string}
   */
  function labelForPeriod(period) {
    var custom = readCustomRange(period);
    if (custom) return custom.label || custom.from + " a " + custom.to;
    var p = normalizePreset(period);
    return PERIOD_LABELS[p] || PERIOD_LABELS[DEFAULT_PERIOD];
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** @param {Date} d */
  function formatLocalDate(d) {
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );
  }

  /**
   * @param {string|Date|null|undefined} value
   * @returns {string|null} YYYY-MM-DD
   */
  function toIsoDateLocal(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return formatLocalDate(
        new Date(value.getFullYear(), value.getMonth(), value.getDate()),
      );
    }
    var raw = value == null ? "" : String(value).trim();
    if (!raw) return null;
    // ISO date ou datetime (ex. 2026-07-10T00:00:00.000Z)
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    var br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (br) {
      var d = parseInt(br[1], 10);
      var mo = parseInt(br[2], 10);
      var y = parseInt(br[3], 10);
      if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return (
        String(y).padStart(4, "0") +
        "-" +
        pad2(mo) +
        "-" +
        pad2(d)
      );
    }
    return null;
  }

  /** @param {string|Date|null|undefined} asOf */
  function resolveAsOfDate(asOf) {
    var iso = toIsoDateLocal(asOf);
    if (iso) {
      var p = iso.split("-");
      return new Date(
        parseInt(p[0], 10),
        parseInt(p[1], 10) - 1,
        parseInt(p[2], 10),
      );
    }
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /** @param {Date} d @param {number} days */
  function addDays(d, days) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setDate(out.getDate() + days);
    return out;
  }

  /**
   * @param {string|null|undefined} period
   * @returns {boolean}
   */
  function isValidPeriod(period) {
    var p = period == null ? "" : String(period).trim().toLowerCase();
    return PERIOD_PRESETS.indexOf(p) !== -1;
  }

  /**
   * @param {string|null|undefined} period
   * @returns {string}
   */
  function normalizePreset(period) {
    var p = period == null ? "" : String(period).trim().toLowerCase();
    if (PERIOD_PRESETS.indexOf(p) !== -1) return p;
    return DEFAULT_PERIOD;
  }

  /**
   * Forma de janela explícita: objecto com `from` e `to`. Distingue-se do
   * preset antes de qualquer parse para que uma janela mal formada falhe alto
   * em vez de cair silenciosamente no default de 30 dias.
   * @param {unknown} period
   */
  function isCustomRangeInput(period) {
    if (!period || typeof period !== "object" || Array.isArray(period)) {
      return false;
    }
    return period.from != null && period.to != null;
  }

  /**
   * Objecto com `from` OU `to` — tentativa de janela explícita, completa ou
   * não. Mais permissivo que `isCustomRangeInput`: usado em
   * `resolvePeriodRange` para que uma janela parcial também caia no ramo que
   * falha alto, em vez de ser lida como preset e degradar para o default de
   * 30 dias em silêncio.
   * @param {unknown} period
   */
  function looksLikeRangeAttempt(period) {
    if (!period || typeof period !== "object" || Array.isArray(period)) {
      return false;
    }
    return period.from != null || period.to != null;
  }

  /**
   * @param {unknown} period
   * @returns {{ from: string, to: string, label: string }|null} null se não for
   *   janela explícita ou se as datas não forem legíveis
   */
  function readCustomRange(period) {
    if (!isCustomRangeInput(period)) return null;
    var from = toIsoDateLocal(period.from);
    var to = toIsoDateLocal(period.to);
    if (!from || !to || from > to) return null;
    var label = period.label == null ? "" : String(period.label).trim();
    return { from: from, to: to, label: label };
  }

  /**
   * FEAT-126: `period` pode ser um preset ou uma janela explícita
   * `{ from, to, label? }` — as séries por trimestre não são descritíveis por
   * nenhum preset. Janela explícita inválida lança em vez de degradar para o
   * default: agregar o período errado em silêncio é pior do que falhar.
   * @param {string|{ from?: string, to?: string, label?: string }|null|undefined} period
   * @param {string|Date|null|undefined} [asOf]
   * @returns {{ period: string, from: string|null, to: string|null, label?: string }}
   */
  function resolvePeriodRange(period, asOf) {
    if (looksLikeRangeAttempt(period)) {
      var custom = readCustomRange(period);
      if (!custom) {
        throw new Error(
          "quality-period-range: janela explícita inválida — from/to em YYYY-MM-DD com from <= to",
        );
      }
      var out = {
        period: CUSTOM_PERIOD,
        from: custom.from,
        to: custom.to,
      };
      if (custom.label) out.label = custom.label;
      return out;
    }

    var preset = normalizePreset(period);
    var end = resolveAsOfDate(asOf);
    var to = formatLocalDate(end);

    if (preset === "all") {
      return { period: preset, from: null, to: null };
    }
    if (preset === "7d") {
      return { period: preset, from: formatLocalDate(addDays(end, -6)), to: to };
    }
    if (preset === "30d") {
      return { period: preset, from: formatLocalDate(addDays(end, -29)), to: to };
    }
    if (preset === "3m") {
      return { period: preset, from: formatLocalDate(addDays(end, -89)), to: to };
    }
    if (preset === "6m") {
      return {
        period: preset,
        from: formatLocalDate(addDays(end, -179)),
        to: to,
      };
    }
    if (preset === "12m") {
      return {
        period: preset,
        from: formatLocalDate(addDays(end, -364)),
        to: to,
      };
    }
    if (preset === "week") {
      var day = end.getDay();
      var mondayOffset = day === 0 ? -6 : 1 - day;
      var monday = addDays(end, mondayOffset);
      var sunday = addDays(monday, 6);
      return {
        period: preset,
        from: formatLocalDate(monday),
        to: formatLocalDate(sunday),
      };
    }
    if (preset === "month") {
      var first = new Date(end.getFullYear(), end.getMonth(), 1);
      var last = new Date(end.getFullYear(), end.getMonth() + 1, 0);
      return {
        period: preset,
        from: formatLocalDate(first),
        to: formatLocalDate(last),
      };
    }
    return {
      period: DEFAULT_PERIOD,
      from: formatLocalDate(addDays(end, -29)),
      to: to,
    };
  }

  /**
   * @param {string|null|undefined} isoOrBr
   * @param {{ from: string|null, to: string|null }} range
   * @returns {boolean}
   */
  function isDateInPeriod(isoOrBr, range) {
    if (!range || (range.from == null && range.to == null)) {
      var any = toIsoDateLocal(isoOrBr);
      return !!any;
    }
    var d = toIsoDateLocal(isoOrBr);
    if (!d) return false;
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  }

  return {
    PERIOD_PRESETS: PERIOD_PRESETS,
    PERIOD_LABELS: PERIOD_LABELS,
    CUSTOM_PERIOD: CUSTOM_PERIOD,
    isCustomRangeInput: isCustomRangeInput,
    looksLikeRangeAttempt: looksLikeRangeAttempt,
    readCustomRange: readCustomRange,
    DEFAULT_PERIOD: DEFAULT_PERIOD,
    DEFAULT_PRESET: DEFAULT_PERIOD,
    VALID_PRESETS: PERIOD_PRESETS,
    isValidPeriod: isValidPeriod,
    normalizePreset: normalizePreset,
    labelForPeriod: labelForPeriod,
    resolvePeriodRange: resolvePeriodRange,
    isDateInPeriod: isDateInPeriod,
    isIsoInRange: isDateInPeriod,
    toIsoDateLocal: toIsoDateLocal,
  };
});
