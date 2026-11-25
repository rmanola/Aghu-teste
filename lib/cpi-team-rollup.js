/**
 * FEAT-122 — Desagregação CPI por chefe/profissional. Reusa `memberKeyOf` de
 * `quality-dashboard-aggregate.js` (CPITEAM-AC-01) — nenhuma segunda regra de
 * identidade. Sem modelo de risco aplicável → degrada para volume+cobertura,
 * nunca uma razão comparativa (CPITEAM-AC-03).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiTeamRollup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var qualityAggApi = load(
    "quality-dashboard-aggregate.js",
    "AghuQualityDashboardAggregate",
  );
  var riskAdjustApi = load("cpi-risk-adjust.js", "AghuCpiRiskAdjust");
  var workspaceAccessApi = load("workspace-access.js", "AghuWorkspaceAccess");

  var DEFAULT_MIN_DENOMINATOR_PER_MEMBER = 11;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /** Delega em quality-dashboard-aggregate.js — sem segunda regra (CPITEAM-AC-01). */
  function memberKeyOf(member) {
    return qualityAggApi && typeof qualityAggApi.memberKeyOf === "function"
      ? qualityAggApi.memberKeyOf(member)
      : "";
  }

  function memberLabelOf(member) {
    return qualityAggApi && typeof qualityAggApi.memberLabel === "function"
      ? qualityAggApi.memberLabel(member)
      : "";
  }

  /**
   * Agrega observado/denominador por chefe de cirurgia a partir de
   * `facts[].cirInPeriod[].chefe` (CPITEAM-AC-01/10). `outcomePredicate`
   * decide o numerador — reusa a mesma noção de caso que `cpi-dashboard-aggregate.js`.
   * @param {object[]} cases — facts[] atribuídos à linha
   * @param {(caseFacts: object, cir: object) => boolean} outcomePredicate
   * @returns {Array<{ memberKey: string, memberLabel: string, observed: number, denominator: number, keyCollision: boolean }>}
   */
  function buildMemberCounts(cases, outcomePredicate) {
    var buckets = {};
    var list = asArray(cases);
    for (var i = 0; i < list.length; i++) {
      var caseFacts = list[i];
      var cirList = asArray(caseFacts && caseFacts.cirInPeriod);
      for (var c = 0; c < cirList.length; c++) {
        var cir = cirList[c];
        var chefe = cir && cir.chefe;
        if (!chefe) continue;
        var key = memberKeyOf(chefe);
        if (!key) continue;
        if (!buckets[key]) {
          buckets[key] = {
            memberKey: key,
            memberLabel: memberLabelOf(chefe),
            observed: 0,
            denominator: 0,
            crmSeen: false,
          };
        }
        var bucket = buckets[key];
        bucket.denominator += 1;
        if (chefe.crm) bucket.crmSeen = true;
        if (typeof outcomePredicate === "function" && outcomePredicate(caseFacts, cir)) {
          bucket.observed += 1;
        }
      }
    }

    return Object.keys(buckets)
      .sort()
      .map(function (key) {
        var b = buckets[key];
        return {
          memberKey: b.memberKey,
          memberLabel: b.memberLabel,
          observed: b.observed,
          denominator: b.denominator,
          // CPITEAM-AC-10: sem CRM em nenhuma ocorrência → chave só por nome
          // normalizado, risco real de fundir homónimos; assinalado, nunca fundido.
          keyCollision: !b.crmSeen,
        };
      });
  }

  /** @param {[number,number]|null} a @param {[number,number]|null} b */
  function ci95Overlaps(a, b) {
    if (!a || !b) return false;
    return a[0] <= b[1] && b[0] <= a[1];
  }

  /**
   * CPITEAM-AC-03/04/05/06/07: rollup por membro sobre um indicador de uma
   * linha de cuidado.
   * @param {{ riskModel?: string|null, direction?: string, expectedRateValue?: number|null }} indicator
   * @param {Array<{ memberKey: string, memberLabel: string, observed: number, denominator: number, keyCollision: boolean }>} memberCounts
   * @param {{ minDenominatorPerMember?: number, minDenominatorLine?: number }} [options]
   */
  function rollupByMember(indicator, memberCounts, options) {
    var opts = options && typeof options === "object" ? options : {};
    var minLine =
      opts.minDenominatorLine == null ? 11 : Number(opts.minDenominatorLine);
    var minPerMember =
      opts.minDenominatorPerMember == null
        ? DEFAULT_MIN_DENOMINATOR_PER_MEMBER
        : Number(opts.minDenominatorPerMember);
    // invariante: nunca inferior ao limiar da linha
    if (minPerMember < minLine) minPerMember = minLine;

    var hasRiskModel = !!(indicator && indicator.riskModel);
    var expectedRateValue =
      indicator && indicator.expectedRateValue != null
        ? Number(indicator.expectedRateValue)
        : null;
    var direction = (indicator && indicator.direction) || "lower_is_better";

    var results = asArray(memberCounts).map(function (m) {
      var base = {
        memberKey: m.memberKey,
        memberLabel: m.memberLabel,
        keyCollision: !!m.keyCollision,
      };

      if (m.denominator < minPerMember) {
        return Object.assign({}, base, {
          suppressed: true,
          mode: null,
          n: undefined,
          coverage: null,
          ratio: null,
          ci95: null,
          significant: false,
        });
      }

      if (!hasRiskModel || expectedRateValue == null || !riskAdjustApi) {
        return Object.assign({}, base, {
          suppressed: false,
          mode: "volume_only",
          n: m.denominator,
          coverage: m.denominator > 0 ? 1 : 0,
          ratio: null,
          ci95: null,
          significant: false,
        });
      }

      var oe = riskAdjustApi.computeObservedExpected({
        strata: [
          {
            observed: m.observed,
            denominator: m.denominator,
            expectedRate: expectedRateValue,
          },
        ],
        minDenominator: minPerMember,
        direction: direction,
      });

      return Object.assign({}, base, {
        suppressed: !!oe.suppressed,
        mode: oe.suppressed ? null : "adjusted",
        n: oe.suppressed ? undefined : m.denominator,
        coverage: null,
        ratio: oe.ratio,
        ci95: oe.ci95 ? [oe.ci95.lower, oe.ci95.upper] : null,
        significant: !!oe.significant,
      });
    });

    // CPITEAM-AC-07: IC95% sobrepostos → indistinguíveis entre si
    for (var i = 0; i < results.length; i++) {
      var a = results[i];
      a.indistinguishableFrom = [];
      if (a.mode !== "adjusted" || !a.ci95) continue;
      for (var j = 0; j < results.length; j++) {
        if (i === j) continue;
        var b = results[j];
        if (b.mode !== "adjusted" || !b.ci95) continue;
        if (ci95Overlaps(a.ci95, b.ci95)) a.indistinguishableFrom.push(b.memberKey);
      }
    }

    // CPITEAM-AC-06: todos suprimidos → linha sem desagregação, total intacto
    var visible = results.filter(function (r) {
      return !r.suppressed;
    });
    var allSuppressed = results.length > 0 && visible.length === 0;

    return { members: results, allSuppressed: allSuppressed };
  }

  /**
   * CPITEAM-AC-02/08/09: cliente esconde a comparação — recusa real fica na
   * Edge (verificação repetida no servidor, nunca só aqui).
   * @param {string} role
   */
  function canViewTeamRollup(role) {
    return !!(
      workspaceAccessApi &&
      typeof workspaceAccessApi.canPerformRole === "function" &&
      workspaceAccessApi.canPerformRole(role, "view_peer_performance")
    );
  }

  return {
    DEFAULT_MIN_DENOMINATOR_PER_MEMBER: DEFAULT_MIN_DENOMINATOR_PER_MEMBER,
    memberKeyOf: memberKeyOf,
    memberLabel: memberLabelOf,
    buildMemberCounts: buildMemberCounts,
    rollupByMember: rollupByMember,
    canViewTeamRollup: canViewTeamRollup,
  };
});
