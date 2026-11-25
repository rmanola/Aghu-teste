/**
 * Período do Passômetro one-click: atalhos (Hoje / Ontem / Semanal) e intervalo custom.
 * Semanal = últimos 7 dias inclusivos (De = hoje−6 … Até = hoje).
 * Controles AGHU: teto 15 dias — Semanal (7) respeita o teto; custom >15d → controlesWithinMax false
 * (flag no período pai; FEAT-110: chunkControlesPeriods fatia para nav/extract).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroPeriodShortcuts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var controlesWindowApi =
    typeof require !== "undefined"
      ? require("./controles-window.js")
      : typeof globalThis !== "undefined" && globalThis.AghuControlesWindow
        ? globalThis.AghuControlesWindow
        : null;

  var CONTROLES_MAX_DAYS = 15;
  var SEMANAL_DAYS = 7;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toBrDate(d) {
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function toIsoDate(d) {
    return (
      String(d.getFullYear()) +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, delta) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setDate(out.getDate() + delta);
    return out;
  }

  /**
   * @param {Date|string} value — Date ou ISO YYYY-MM-DD
   * @returns {Date|null}
   */
  function parseDayInput(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return startOfLocalDay(value);
    }
    var s = String(value == null ? "" : value).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]) - 1;
    var day = Number(m[3]);
    var d = new Date(y, mo, day);
    if (
      d.getFullYear() !== y ||
      d.getMonth() !== mo ||
      d.getDate() !== day
    ) {
      return null;
    }
    return startOfLocalDay(d);
  }

  /**
   * @param {Date} from
   * @param {Date} to
   * @param {string} kind
   * @returns {{
   *   kind: string,
   *   dateFromBr: string,
   *   dateToBr: string,
   *   dateFromIso: string,
   *   dateToIso: string,
   *   dateFromCtrl: string,
   *   dateToCtrl: string,
   *   inclusiveDays: number,
   *   controlesWithinMax: boolean
   * }}
   */
  function buildPeriod(from, to, kind) {
    var inclusiveDays =
      Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

    var ctrlBounds =
      controlesWindowApi && controlesWindowApi.controlesAgHuQueryBounds
        ? controlesWindowApi.controlesAgHuQueryBounds(from, to)
        : {
            dateFromCtrl: toBrDate(from) + " 07:00",
            dateToCtrl: toBrDate(addDays(to, 1)) + " 06:59",
          };

    return {
      kind: kind,
      dateFromBr: toBrDate(from),
      dateToBr: toBrDate(to),
      dateFromIso: toIsoDate(from),
      dateToIso: toIsoDate(to),
      dateFromCtrl: ctrlBounds.dateFromCtrl,
      dateToCtrl: ctrlBounds.dateToCtrl,
      inclusiveDays: inclusiveDays,
      controlesWithinMax: inclusiveDays <= CONTROLES_MAX_DAYS,
    };
  }

  /**
   * @param {"hoje"|"ontem"|"semanal"} kind
   * @param {Date} [now]
   * @returns {{
   *   kind: string,
   *   dateFromBr: string,
   *   dateToBr: string,
   *   dateFromIso: string,
   *   dateToIso: string,
   *   dateFromCtrl: string,
   *   dateToCtrl: string,
   *   inclusiveDays: number,
   *   controlesWithinMax: boolean
   * }}
   */
  function resolvePeriodShortcut(kind, now) {
    var base = startOfLocalDay(now || new Date());
    var from;
    var to;
    var k = String(kind || "").toLowerCase().trim();

    if (k === "ontem") {
      from = addDays(base, -1);
      to = addDays(base, -1);
    } else if (k === "semanal") {
      to = base;
      from = addDays(base, -(SEMANAL_DAYS - 1));
    } else {
      k = "hoje";
      from = base;
      to = base;
    }

    return buildPeriod(from, to, k);
  }

  /**
   * Intervalo custom (Formulário Passômetro). Fail-fast se inválido ou De > Até.
   * @param {Date|string} fromInput — Date ou ISO YYYY-MM-DD
   * @param {Date|string} toInput — Date ou ISO YYYY-MM-DD
   * @returns {{
   *   kind: "custom",
   *   dateFromBr: string,
   *   dateToBr: string,
   *   dateFromIso: string,
   *   dateToIso: string,
   *   dateFromCtrl: string,
   *   dateToCtrl: string,
   *   inclusiveDays: number,
   *   controlesWithinMax: boolean
   * }|{ error: string }}
   */
  function resolvePeriodRange(fromInput, toInput) {
    var from = parseDayInput(fromInput);
    var to = parseDayInput(toInput);
    if (!from) {
      return { error: "Data inicial inválida. Use o formato dd/mm/aaaa." };
    }
    if (!to) {
      return { error: "Data final inválida. Use o formato dd/mm/aaaa." };
    }
    if (from.getTime() > to.getTime()) {
      return {
        error: "Data inicial não pode ser posterior à data final.",
      };
    }
    return buildPeriod(from, to, "custom");
  }

  /**
   * Fatia período Controles em janelas inclusivas ≤ CONTROLES_MAX_DAYS (FEAT-110).
   * Período pai >15d mantém controlesWithinMax false; cada fatia = buildPeriod → true.
   * @param {object|null|undefined} period — saída de resolvePeriod*
   * @returns {object[]} — 1 elemento se ≤15d ou inválido; senão N fatias
   */
  function chunkControlesPeriods(period) {
    if (!period || typeof period !== "object") return [period];
    var days = Number(period.inclusiveDays);
    if (!isFinite(days) || days <= CONTROLES_MAX_DAYS) return [period];

    var from = parseDayInput(period.dateFromIso);
    var to = parseDayInput(period.dateToIso);
    if (!from || !to || from.getTime() > to.getTime()) return [period];

    var slices = [];
    var cursor = from;
    while (cursor.getTime() <= to.getTime()) {
      var sliceEnd = addDays(cursor, CONTROLES_MAX_DAYS - 1);
      if (sliceEnd.getTime() > to.getTime()) sliceEnd = to;
      slices.push(buildPeriod(cursor, sliceEnd, "custom"));
      cursor = addDays(sliceEnd, 1);
    }
    return slices.length ? slices : [period];
  }

  /**
   * Formata dígitos do prontuário para `#prontuarioInput` (priceFormat HUCAM N…N/N).
   * @param {string} raw
   * @returns {string}
   */
  function formatProntuarioPolInput(raw) {
    var digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length < 2) return digits;
    return digits.slice(0, -1) + "/" + digits.slice(-1);
  }

  /**
   * Parse lista de prontuários (linhas, vírgulas ou espaços).
   * @param {string} text
   * @param {{ normalizeProntuario?: (s: string) => string }} [deps]
   * @returns {{ prontuarios: string[], errors: string[] }}
   */
  function parseProntuarioList(text, deps) {
    deps = deps || {};
    var normalize =
      deps.normalizeProntuario ||
      function (s) {
        var d = String(s == null ? "" : s).replace(/\D/g, "");
        return d.replace(/^0+/, "") || d;
      };

    var raw = String(text == null ? "" : text).trim();
    if (!raw) {
      return { prontuarios: [], errors: ["Informe ao menos um prontuário."] };
    }

    var tokens = raw.split(/[\s,;]+/).filter(Boolean);
    var seen = Object.create(null);
    var prontuarios = [];
    var errors = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!/^\d[\d\-]*$/.test(token.replace(/\s/g, ""))) {
        errors.push("Token inválido (use só dígitos): ignorado.");
        continue;
      }
      var n = normalize(token);
      if (!n || n === "0") {
        errors.push("Prontuário inválido ignorado.");
        continue;
      }
      if (seen[n]) continue;
      seen[n] = true;
      prontuarios.push(n);
    }

    if (!prontuarios.length) {
      errors.push("Nenhum prontuário válido na lista.");
    }

    return { prontuarios: prontuarios, errors: errors };
  }

  return {
    CONTROLES_MAX_DAYS: CONTROLES_MAX_DAYS,
    SEMANAL_DAYS: SEMANAL_DAYS,
    resolvePeriodShortcut: resolvePeriodShortcut,
    resolvePeriodRange: resolvePeriodRange,
    chunkControlesPeriods: chunkControlesPeriods,
    formatProntuarioPolInput: formatProntuarioPolInput,
    parseProntuarioList: parseProntuarioList,
  };
});
