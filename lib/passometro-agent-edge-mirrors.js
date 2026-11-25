/**
 * FEAT-071 — espelho Node das helpers Edge (passometro-agent/lib.ts).
 * Deno não importa IIFE do browser; este módulo permite testar validate/scrub
 * com a mesma regra que a Edge (manter em sync com lib.ts).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentEdgeMirrors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_PRONTUARIOS = 10;
  var PERIODS = Object.freeze(["hoje", "ontem", "semanal"]);

  var PHI_KEY_RE =
    /^(nome|name|html|innerHTML|outerHTML|laudo|texto|textoClinico|vitals|prescricaoTexto|content|dom|snapshot)$/i;

  /** Espelha Edge KNOWN_PHASES / lib PHASES. */
  var KNOWN_PHASES = Object.freeze([
    "nav",
    "clear",
    "suggest",
    "pesquisar",
    "extract",
    "gate_paciente",
    "liberados_fp",
    "autofill",
    "close_tabs",
  ]);

  function normalizeProntuarioDigits(s) {
    var d = String(s == null ? "" : s).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  function parseProntuarioListMirror(text) {
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
      var n = normalizeProntuarioDigits(token);
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

  /**
   * Espelha Edge validateSkillCallArgs.
   * @param {unknown} args
   */
  function validateSkillCallArgs(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return {
        ok: false,
        error: "Args inválidos: object obrigatório.",
        errorCode: "invalid_args",
      };
    }
    var periodo = String(args.periodo || "")
      .toLowerCase()
      .trim();
    if (PERIODS.indexOf(periodo) === -1) {
      return {
        ok: false,
        error: "Período inválido (use hoje|ontem|semanal).",
        errorCode: "invalid_args",
      };
    }
    var list = args.prontuarios;
    var text;
    if (Array.isArray(list)) {
      text = list.join("\n");
    } else if (typeof list === "string") {
      text = list;
    } else {
      return {
        ok: false,
        error: "prontuarios deve ser array ou string.",
        errorCode: "invalid_args",
      };
    }
    var parsed = parseProntuarioListMirror(text);
    if (!parsed.prontuarios.length) {
      return {
        ok: false,
        error: parsed.errors[0] || "Nenhum prontuário válido.",
        errorCode: "invalid_args",
      };
    }
    if (parsed.prontuarios.length > MAX_PRONTUARIOS) {
      return {
        ok: false,
        error: "Máximo de " + MAX_PRONTUARIOS + " prontuários por skill.",
        errorCode: "invalid_args",
      };
    }
    return {
      ok: true,
      value: { prontuarios: parsed.prontuarios, periodo: periodo },
    };
  }

  function last4Digits(prontuario) {
    var d = String(prontuario == null ? "" : prontuario).replace(/\D/g, "");
    if (!d) return "";
    return d.length <= 4 ? d : d.slice(-4);
  }

  /**
   * Espelha Edge scrubValue (prontuario → prontuarioKey last4).
   * @param {unknown} obj
   * @param {number} depth
   */
  function scrubValue(obj, depth) {
    if (depth > 8) return undefined;
    if (obj == null) return obj;
    if (Array.isArray(obj)) {
      return obj
        .map(function (item) {
          return scrubValue(item, depth + 1);
        })
        .filter(function (x) {
          return x !== undefined;
        });
    }
    if (typeof obj !== "object") {
      if (typeof obj === "string" && /<[^>]+>/.test(obj)) return undefined;
      return obj;
    }
    var out = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = obj[k];
      if (PHI_KEY_RE.test(k)) continue;
      if (/laudo|html|innerHTML|nomePaciente|patientName/i.test(k)) continue;
      if (typeof v === "string" && /<[^>]+>/.test(v)) continue;
      if (k === "prontuario" || k === "prontuarios") {
        if (typeof v === "string") {
          out.prontuarioKey = last4Digits(v);
        } else if (Array.isArray(v)) {
          out.prontuarioKeys = v.map(last4Digits);
        }
        continue;
      }
      var scrubbed = scrubValue(v, depth + 1);
      if (scrubbed !== undefined) out[k] = scrubbed;
    }
    return out;
  }

  return {
    MAX_PRONTUARIOS: MAX_PRONTUARIOS,
    PERIODS: PERIODS,
    KNOWN_PHASES: KNOWN_PHASES,
    validateSkillCallArgs: validateSkillCallArgs,
    last4Digits: last4Digits,
    scrubValue: scrubValue,
  };
});
