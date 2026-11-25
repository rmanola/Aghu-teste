/**
 * FEAT-071 — scorecard por skill (composite agrega 4 domínios; breakdown nav vs extract).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-agent-error-codes.js")
      : root.AghuPassometroAgentErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentScorecard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  errorCodesApi
) {
  "use strict";

  var DOMAIN_KEYS = ["exames", "cirurgias", "controles", "prescricoes"];

  function normalizeDomainKey(k) {
    var s = String(k || "").toLowerCase();
    if (s === "prescricao" || s === "prescrição") return "prescricoes";
    return s;
  }

  /**
   * @param {object} sanitizedResult — saída sanitize (sem PHI)
   * @param {{ skillId?: string, kind?: string }} [meta]
   */
  function scoreSkillResult(sanitizedResult, meta) {
    meta = meta || {};
    var kind = meta.kind || (meta.skillId === "passometro.oneclick"
      ? "composite"
      : "domain");
    var patients = (sanitizedResult && sanitizedResult.patients) || [];
    var navOk = 0;
    var navFail = 0;
    var extractOk = 0;
    var extractFail = 0;
    var extractEmpty = 0;
    var domainHits = {};

    for (var di = 0; di < DOMAIN_KEYS.length; di++) {
      domainHits[DOMAIN_KEYS[di]] = { ok: 0, fail: 0, empty: 0 };
    }

    for (var i = 0; i < patients.length; i++) {
      var p = patients[i] || {};
      if (kind === "composite" && p.domains) {
        var keys = Object.keys(p.domains);
        for (var j = 0; j < keys.length; j++) {
          var dk = normalizeDomainKey(keys[j]);
          var d = p.domains[keys[j]] || {};
          if (!domainHits[dk]) {
            domainHits[dk] = { ok: 0, fail: 0, empty: 0 };
          }
          if (d.ok === false || d.errorCode) {
            extractFail++;
            domainHits[dk].fail++;
            if (d.errorCode && /nav|timeout|suggestion|clear|list_missing|liberados|gate|tab_missing|dead_object|ajax/.test(String(d.errorCode))) {
              navFail++;
            }
          } else if (d.empty) {
            extractEmpty++;
            domainHits[dk].empty++;
            extractOk++;
            domainHits[dk].ok++;
          } else {
            extractOk++;
            domainHits[dk].ok++;
          }
        }
      } else if (p.domainResult) {
        var dr = p.domainResult;
        var dom = normalizeDomainKey(
          (sanitizedResult && sanitizedResult.domain) || meta.domain || "exames"
        );
        if (!domainHits[dom]) domainHits[dom] = { ok: 0, fail: 0, empty: 0 };
        if (dr.ok === false) {
          extractFail++;
          domainHits[dom].fail++;
          if (
            dr.errorCode &&
            /nav|timeout|suggestion|clear|list_missing|liberados|gate|tab_missing|dead_object|ajax/.test(
              String(dr.errorCode)
            )
          ) {
            navFail++;
          }
        } else if (dr.empty) {
          extractEmpty++;
          domainHits[dom].empty++;
          extractOk++;
          domainHits[dom].ok++;
        } else {
          extractOk++;
          domainHits[dom].ok++;
        }
      }
    }

    var totalExtract = extractOk + extractFail;
    var score =
      totalExtract === 0
        ? sanitizedResult && sanitizedResult.ok
          ? 1
          : 0
        : extractOk / totalExtract;

    return {
      skillId: meta.skillId || null,
      kind: kind,
      score: Math.round(score * 1000) / 1000,
      ok: !!(sanitizedResult && sanitizedResult.ok),
      breakdown: {
        nav: { ok: navOk, fail: navFail },
        extract: { ok: extractOk, fail: extractFail, empty: extractEmpty },
      },
      domains: domainHits,
      patients: patients.length,
    };
  }

  /**
   * Reflect ranking a partir de eventos (PA-AC-16) — sem PHI.
   * @param {Array<{ domain?: string, phase?: string, errorCode?: string, ok?: boolean }>} events
   */
  function rankNavExtractFailures(events) {
    var list = Array.isArray(events) ? events : [];
    var map = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      if (e.ok !== false && !e.errorCode) continue;
      var code = String(e.errorCode || "extract_failed");
      if (errorCodesApi && errorCodesApi.isKnownErrorCode) {
        if (!errorCodesApi.isKnownErrorCode(code) && code !== "empty_ok") {
          code = "extract_failed";
        }
      }
      if (code === "empty_ok") continue;
      var domain = String(e.domain || "composite");
      var phase = String(e.phase || "extract");
      var key = code + "|" + domain + "|" + phase;
      if (!map[key]) {
        map[key] = {
          errorCode: code,
          domain: domain,
          phase: phase,
          count: 0,
        };
      }
      map[key].count++;
    }
    var rows = Object.keys(map).map(function (k) {
      return map[k];
    });
    rows.sort(function (a, b) {
      return b.count - a.count;
    });
    return rows;
  }

  return {
    DOMAIN_KEYS: DOMAIN_KEYS,
    scoreSkillResult: scoreSkillResult,
    rankNavExtractFailures: rankNavExtractFailures,
  };
});
