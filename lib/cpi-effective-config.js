/**
 * FEAT-129 — Configuração efectiva do CPI numa data.
 *
 * Dobra o registo de decisão (FEAT-128) sobre o catálogo em memória e devolve
 * a configuração vigente no fim do período (`asOf`). O agregado e o pacote do
 * comité consomem a mesma função — uma resolução, dois consumidores.
 *
 * Efeito estritamente prospectivo: decisões com `effectiveFrom` posterior a
 * `asOf` não entram. `decidedBy` fica de fora da saída publicada (CPICFG-AC-09).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiEffectiveConfig = api;
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

  var governanceApi = load("cpi-governance-log.js", "AghuCpiGovernanceLog");
  var careLinesApi = load("cpi-care-lines.js", "AghuCpiCareLines");
  var referenceRegistryApi = load(
    "cpi-reference-registry.js",
    "AghuCpiReferenceRegistry",
  );

  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function plain(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }

  function isoDate(v) {
    var raw = str(v).trim();
    if (!raw) return null;
    return ISO_DATE.test(raw.slice(0, 10)) ? raw.slice(0, 10) : null;
  }

  function cloneJson(value) {
    if (value == null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Valida cada entrada do registo na fronteira. Decisão inválida explode com
   * mensagem que nomeia o `id` (CPICFG-AC-11/12) — não se calcula com config
   * parcial.
   * @param {ReadonlyArray<object>} log
   */
  function assertLogValid(log) {
    if (!governanceApi || typeof governanceApi.validateDecision !== "function") {
      throw new Error(
        "cpi-effective-config: cpi-governance-log.validateDecision indisponível",
      );
    }
    var entries = asArray(log);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var id = entry && str(entry.id).trim() ? str(entry.id).trim() : "índice " + i;
      var errors = governanceApi.validateDecision(entry);
      if (errors && errors.length) {
        throw new Error(
          "cpi-effective-config: decisão inválida `" +
            id +
            "` — " +
            errors.join("; "),
        );
      }
    }
  }

  /**
   * Remapeia `expectedRate.referenceId` dos indicadores alvo de
   * `reference_change` já dobrados em `resolved.references`.
   * @param {object[]} indicators
   * @param {Record<string, { referenceId?: string }>} refMap
   */
  function applyReferenceOverrides(indicators, refMap) {
    var list = asArray(indicators);
    if (!refMap || typeof refMap !== "object") return list.map(cloneJson);
    return list.map(function (ind) {
      var copy = cloneJson(ind);
      if (!copy || !copy.id) return copy;
      var override = refMap[str(copy.id)];
      if (!override || !str(override.referenceId).trim()) return copy;
      if (!copy.expectedRate || typeof copy.expectedRate !== "object") {
        copy.expectedRate = {};
      }
      copy.expectedRate = Object.assign({}, copy.expectedRate, {
        referenceId: str(override.referenceId).trim(),
      });
      return copy;
    });
  }

  /**
   * Aplica alterações pontuais da biblioteca (`indicator_library_change`).
   * @param {object[]} indicators
   * @param {Record<string, { change?: object }>} indMap
   */
  function applyIndicatorOverrides(indicators, indMap) {
    var list = asArray(indicators);
    if (!indMap || typeof indMap !== "object") return list;
    return list.map(function (ind) {
      if (!ind || !ind.id) return ind;
      var override = indMap[str(ind.id)];
      if (!override || !plain(override.change)) return ind;
      return Object.assign({}, ind, cloneJson(override.change));
    });
  }

  /**
   * Referências vencidas na data `asOf` (CPICFG-AC-04).
   * @param {object} registry
   * @param {string} asOf
   * @param {object[]} indicators
   */
  function collectStaleReferences(registry, asOf, indicators) {
    if (
      !referenceRegistryApi ||
      typeof referenceRegistryApi.isStale !== "function"
    ) {
      return [];
    }
    var entries = asArray(registry && registry.entries);
    var used = {};
    for (var i = 0; i < indicators.length; i++) {
      var er = indicators[i] && indicators[i].expectedRate;
      if (er && er.referenceId) used[str(er.referenceId)] = true;
    }
    var out = [];
    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      if (!entry || !entry.id) continue;
      if (Object.keys(used).length && !used[str(entry.id)]) continue;
      if (!referenceRegistryApi.isStale(entry, asOf)) continue;
      var threshold = Number(entry.staleAfterYears);
      if (!Number.isFinite(threshold)) threshold = 7;
      out.push({
        referenceId: str(entry.id),
        year: entry.year != null ? Number(entry.year) : null,
        staleAfterYears: threshold,
      });
    }
    return out;
  }

  /**
   * Razão legível de degradação por referência vencida (CPICFG-AC-04).
   * @param {{ referenceId: string, year: number|null, staleAfterYears: number }} stale
   */
  function staleDegradeReason(stale) {
    var id = str(stale && stale.referenceId) || "?";
    var year = stale && stale.year != null ? Number(stale.year) : null;
    var threshold =
      stale && Number.isFinite(Number(stale.staleAfterYears))
        ? Number(stale.staleAfterYears)
        : 7;
    var expiredYear =
      year != null && Number.isFinite(year) ? year + threshold : "?";
    return (
      "referência " +
      id +
      " vencida em " +
      expiredYear +
      " (staleAfterYears " +
      threshold +
      ")"
    );
  }

  /**
   * Decisões aplicadas sem `decidedBy` nem evidência identificável (CPICFG-AC-09).
   * @param {ReadonlyArray<object>} log
   * @param {string[]} appliedIds
   */
  function publishAppliedDecisions(log, appliedIds) {
    var want = {};
    for (var i = 0; i < appliedIds.length; i++) want[str(appliedIds[i])] = true;
    var out = [];
    var entries = asArray(log);
    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      if (!entry || !want[str(entry.id)]) continue;
      out.push({
        id: str(entry.id),
        kind: str(entry.kind),
        target: entry.target != null ? str(entry.target) : null,
        effectiveFrom: str(entry.effectiveFrom),
      });
    }
    return out;
  }

  /**
   * @param {{
   *   asOf: string,
   *   governanceLog?: ReadonlyArray<object>|null,
   *   careLines?: object[]|null,
   *   indicatorLibrary?: object[]|null,
   *   referenceRegistry?: object|null,
   * }} input
   * @returns {{
   *   asOf: string,
   *   registryVersion: number,
   *   careLines: object[],
   *   indicatorLibrary: object[],
   *   referenceRegistry: object,
   *   appliedDecisions: Array<{ id: string, kind: string, target: string|null, effectiveFrom: string }>,
   *   staleReferences: Array<{ referenceId: string, year: number|null, staleAfterYears: number }>,
   *   applied: boolean,
   *   resolved: object,
   * }}
   */
  function resolveEffectiveConfig(input) {
    var opts = input && typeof input === "object" ? input : {};
    var asOf = isoDate(opts.asOf);
    if (!asOf) {
      throw new Error(
        "cpi-effective-config: asOf inválido — esperado YYYY-MM-DD (fim do período)",
      );
    }

    var log = asArray(opts.governanceLog);
    assertLogValid(log);

    if (!governanceApi || typeof governanceApi.resolveConfigAt !== "function") {
      throw new Error(
        "cpi-effective-config: cpi-governance-log.resolveConfigAt indisponível",
      );
    }

    var resolved = governanceApi.resolveConfigAt(log, asOf);
    var baseCareLines = asArray(
      opts.careLines != null
        ? opts.careLines
        : careLinesApi && careLinesApi.CARE_LINES,
    );
    var baseIndicators = asArray(opts.indicatorLibrary);
    var baseRegistry =
      opts.referenceRegistry && typeof opts.referenceRegistry === "object"
        ? opts.referenceRegistry
        : referenceRegistryApi && referenceRegistryApi.REGISTRY
          ? referenceRegistryApi.REGISTRY
          : { registryVersion: 0, entries: [], superseded: [] };

    var careLinesResolved =
      careLinesApi && typeof careLinesApi.listCareLinesAt === "function"
        ? careLinesApi.listCareLinesAt(resolved, { catalog: baseCareLines })
        : baseCareLines.map(cloneJson);

    var indicatorsResolved = applyIndicatorOverrides(
      applyReferenceOverrides(baseIndicators, resolved.references),
      resolved.indicators,
    );

    var appliedIds = asArray(resolved.appliedDecisionIds);
    var appliedDecisions = publishAppliedDecisions(log, appliedIds);
    var staleReferences = collectStaleReferences(
      baseRegistry,
      asOf,
      indicatorsResolved,
    );

    return {
      asOf: asOf,
      registryVersion: appliedIds.length,
      careLines: careLinesResolved,
      indicatorLibrary: indicatorsResolved,
      referenceRegistry: baseRegistry,
      appliedDecisions: appliedDecisions,
      staleReferences: staleReferences,
      applied: appliedDecisions.length > 0,
      resolved: resolved,
    };
  }

  /**
   * Publica só a superfície segura da config (sem `resolved` interno, sem catálogo).
   * @param {ReturnType<typeof resolveEffectiveConfig>} effective
   */
  function publishEffectiveConfig(effective) {
    if (!effective || typeof effective !== "object") return null;
    return {
      asOf: effective.asOf,
      registryVersion: effective.registryVersion,
      appliedDecisions: asArray(effective.appliedDecisions).map(function (d) {
        return {
          id: str(d.id),
          kind: str(d.kind),
          target: d.target != null ? str(d.target) : null,
          effectiveFrom: str(d.effectiveFrom),
        };
      }),
      staleReferences: asArray(effective.staleReferences).map(function (s) {
        return {
          referenceId: str(s.referenceId),
          year: s.year != null ? Number(s.year) : null,
          staleAfterYears: Number(s.staleAfterYears),
        };
      }),
      applied: !!effective.applied,
    };
  }

  return {
    resolveEffectiveConfig: resolveEffectiveConfig,
    publishEffectiveConfig: publishEffectiveConfig,
    staleDegradeReason: staleDegradeReason,
  };
});
