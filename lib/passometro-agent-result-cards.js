/**
 * FEAT-089 — linhas de card pós-extract do agente (oneclick + domínios).
 * Converte exec.results + calls em formato AghuPassometroOneClick.renderResults.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentResultCards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TOOL_TO_SKILL = Object.freeze({
    openPol: "passometro.nav.pol",
    openControles: "passometro.nav.controles",
    openPrescricoes: "passometro.nav.prescricoes",
    runPassometroOneClick: "passometro.oneclick",
    extractCadastro: "passometro.cadastro",
    extractExames: "passometro.exames",
    extractCirurgias: "passometro.cirurgias",
    extractControles: "passometro.controles",
    extractPrescricoes: "passometro.prescricoes",
  });

  var SKILL_TO_DOMAIN = Object.freeze({
    "passometro.cadastro": "cadastro",
    "passometro.exames": "exames",
    "passometro.cirurgias": "cirurgias",
    "passometro.controles": "controles",
    "passometro.prescricoes": "prescricao",
  });

  function resolveSkillId(call) {
    call = call || {};
    if (call.skillId) return String(call.skillId);
    var tool = call.name || call.toolName || "";
    return TOOL_TO_SKILL[tool] || tool || "";
  }

  function isNavSkill(skillId) {
    return String(skillId || "").indexOf("passometro.nav.") === 0;
  }

  function callArgs(call) {
    call = call || {};
    return call.arguments != null ? call.arguments : call.args || {};
  }

  function domainResultToEntry(domainResult) {
    if (!domainResult || typeof domainResult !== "object") {
      return { status: "error", error: "unknown" };
    }
    if (domainResult.ok) {
      return { status: "ok", error: null };
    }
    return {
      status: "error",
      error: domainResult.errorCode || domainResult.error || "failed",
    };
  }

  function rowsFromOneClick(prontuarios, batch) {
    var rows = [];
    var batchRows =
      batch && Array.isArray(batch.results) ? batch.results : [];
    for (var i = 0; i < prontuarios.length; i++) {
      var pront = prontuarios[i];
      var batchRow = batchRows[i];
      if (!pront || !batchRow) continue;
      rows.push({
        prontuario: String(pront),
        ok: !!batchRow.ok,
        domains: Object.assign({}, batchRow.domains || {}),
      });
    }
    return rows;
  }

  function rowsFromDomainExtract(skillId, prontuarios, result) {
    var domainKey = SKILL_TO_DOMAIN[skillId];
    if (!domainKey) return [];
    var patients =
      result && Array.isArray(result.patients) ? result.patients : [];
    var rows = [];
    for (var i = 0; i < prontuarios.length; i++) {
      var pront = prontuarios[i];
      if (!pront) continue;
      var patient = patients[i] || {};
      var entry = domainResultToEntry(patient.domainResult);
      var domains = Object.create(null);
      domains[domainKey] = entry;
      rows.push({
        prontuario: String(pront),
        ok: entry.status === "ok",
        domains: domains,
      });
    }
    return rows;
  }

  /**
   * @param {Array} calls — skill_calls do round
   * @param {{ results?: Array }} exec — saída de runtime.runSkillCalls
   * @returns {Array<{ prontuario: string, ok: boolean, domains: object }>}
   */
  function buildResultCardRows(calls, exec) {
    var callList = Array.isArray(calls) ? calls : [];
    var results = (exec && exec.results) || [];
    var rows = [];

    for (var i = 0; i < results.length; i++) {
      var call = callList[i] || {};
      var skillId = resolveSkillId(call);
      if (!skillId || isNavSkill(skillId)) continue;

      var args = callArgs(call);
      var prontuarios = Array.isArray(args.prontuarios) ? args.prontuarios : [];
      var raw = results[i] && results[i].result;

      if (skillId === "passometro.oneclick") {
        rows = rows.concat(rowsFromOneClick(prontuarios, raw));
        continue;
      }

      if (SKILL_TO_DOMAIN[skillId]) {
        rows = rows.concat(rowsFromDomainExtract(skillId, prontuarios, raw));
      }
    }

    return mergeCardRows([], rows);
  }

  /**
   * Mescla linhas por prontuário (domínios acumulam entre rounds/skills).
   * @param {Array} accumulated
   * @param {Array} newRows
   * @returns {Array}
   */
  function mergeCardRows(accumulated, newRows) {
    var order = [];
    var map = Object.create(null);
    var sources = []
      .concat(Array.isArray(accumulated) ? accumulated : [])
      .concat(Array.isArray(newRows) ? newRows : []);

    for (var i = 0; i < sources.length; i++) {
      var row = sources[i];
      if (!row || row.prontuario == null) continue;
      var key = String(row.prontuario);
      if (!map[key]) {
        order.push(key);
        map[key] = {
          prontuario: key,
          ok: !!row.ok,
          domains: Object.assign({}, row.domains || {}),
        };
        continue;
      }
      var existing = map[key];
      existing.domains = Object.assign(
        existing.domains,
        row.domains || {}
      );
      existing.ok = existing.ok && !!row.ok;
    }

    return order.map(function (k) {
      return map[k];
    });
  }

  function hasExtractCardResults(exec) {
    if (!exec || !Array.isArray(exec.results) || !exec.results.length) {
      return false;
    }
    for (var i = 0; i < exec.results.length; i++) {
      var skillId = exec.results[i] && exec.results[i].skillId;
      if (!skillId || isNavSkill(skillId)) continue;
      if (skillId === "passometro.oneclick" || SKILL_TO_DOMAIN[skillId]) {
        return true;
      }
    }
    return false;
  }

  return {
    buildResultCardRows: buildResultCardRows,
    mergeCardRows: mergeCardRows,
    hasExtractCardResults: hasExtractCardResults,
    resolveSkillId: resolveSkillId,
    SKILL_TO_DOMAIN: SKILL_TO_DOMAIN,
  };
});
