/**
 * FEAT-128 — Alerta CPI derivado de sinal de causa especial.
 *
 * Entrada ÚNICA: `signals[]` e `stability` de `cpi-trend.js` (FEAT-126). Este
 * módulo não olha para o valor do indicador, não avalia a faixa de
 * interpretação e não tem critério próprio de disparo — é o que torna
 * CPIGOV-AC-01 verificável por asserção estrutural sobre o ficheiro, e não por
 * um teste que enumera casos. Um indicador em faixa vermelha com
 * `stability: "stable"` não produz alerta porque aqui não há por onde o
 * produzir.
 *
 * Quatro portas, todas antes da construção da mensagem:
 *   1. `stability` diferente de `special_cause` — nada a comunicar
 *      (CPIGOV-AC-01/02)
 *   2. linha de cuidado não publicada ou modelo de risco não validado — o sinal
 *      é uma afirmação sobre o denominador, não sobre a prática (CPIGOV-AC-06)
 *   3. estrato de outro profissional sem `view_peer_performance` — a mensagem
 *      nunca chega a existir em memória nem em log (CPIGOV-AC-04)
 *   4. mesma chave já notificada no ciclo anterior com a mesma regra — sinal
 *      persistente notifica uma vez (CPIGOV-AC-03)
 *
 * O texto descreve variação e nunca prescreve conduta: é a fronteira que separa
 * esta FEAT de um motor de recomendação, e a que separa um alerta de processo
 * (accionável numa reunião) de um alerta de doente (FEAT-015, accionável agora).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiAlerts = api;
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

  /**
   * Resolução preguiçosa: no bundle web os módulos vizinhos só existem como
   * global depois de importados, e a ordem de importação não é garantia deste
   * módulo. Resolver na primeira utilização evita um `deriveAlerts` mudo por
   * ter sido carregado cedo demais.
   */
  function lazy(name, globalName) {
    var cached = null;
    return function () {
      if (cached) return cached;
      cached = load(name, globalName);
      return cached;
    };
  }

  var trendApiOf = lazy("cpi-trend.js", "AghuCpiTrend");
  var teamRollupApiOf = lazy("cpi-team-rollup.js", "AghuCpiTeamRollup");
  var validationApiOf = lazy("cpi-model-validation.js", "AghuCpiModelValidation");

  /** Estado que gera alerta — vem da FEAT-126, não é redeclarado aqui. */
  function specialCause() {
    var api = trendApiOf();
    return (api && api.STABILITY && api.STABILITY.SPECIAL_CAUSE) || "special_cause";
  }

  /** Estado de modelo que exclui o alerta (FEAT-127). */
  function notValidated() {
    var api = validationApiOf();
    return (api && api.STATUS && api.STATUS.NOT_VALIDATED) || "not_validated";
  }

  /** Único ciclo de vida que publica indicador (FEAT-124). */
  var PUBLISHED_LIFECYCLE = "active";

  var SCOPE = Object.freeze({ CARE_LINE: "care_line", MEMBER: "member" });

  /** Razões de exclusão — publicadas sem qualquer identificador. */
  var EXCLUSION = Object.freeze({
    NOT_SPECIAL_CAUSE: "not_special_cause",
    CARE_LINE_NOT_PUBLISHED: "care_line_not_published",
    RISK_MODEL_NOT_VALIDATED: "risk_model_not_validated",
    PEER_SCOPE_NOT_PERMITTED: "peer_scope_not_permitted",
  });

  var DIRECTION_TEXT = Object.freeze({
    above: "acima",
    below: "abaixo",
  });

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function plain(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  /** Descrição canónica da regra, tal como declarada na FEAT-126. */
  function ruleDescription(ruleId) {
    var api = trendApiOf();
    var rules = (api && api.RULES) || [];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i] && rules[i].id === ruleId) return str(rules[i].description);
    }
    return "";
  }

  function isKnownRule(ruleId) {
    var api = trendApiOf();
    var ids = (api && api.RULE_IDS) || [];
    return ids.indexOf(ruleId) !== -1;
  }

  /**
   * CPIGOV-AC-06: linha não publicada fica fora. Sem ciclo de vida declarado
   * publica, pela mesma convenção de `cpi-trend.isPublishedCareLine`.
   */
  function lifecycleAllows(lifecycle) {
    var life = str(lifecycle).trim();
    if (!life) return true;
    return life === PUBLISHED_LIFECYCLE;
  }

  /**
   * CPIGOV-AC-06: modelo `not_validated` fica fora. Chave `modelo@linha` tem
   * precedência sobre `modelo`, como em `validationStatusMap` (FEAT-127).
   */
  function modelAllows(riskModel, careLineId, statusMap) {
    var model = str(riskModel).trim();
    if (!model) return true;
    var map = plain(statusMap);
    var scoped = map[model + "@" + str(careLineId)];
    var status = scoped != null ? scoped : map[model];
    if (status == null) return true;
    return str(status) !== notValidated();
  }

  /**
   * CPIGOV-AC-04: delega em `cpi-team-rollup.canViewTeamRollup`, que por sua vez
   * delega em `workspace-access` — a permissão do alerta é a mesma da vista de
   * equipa da FEAT-122, nunca uma segunda tabela de papéis.
   */
  function canReceivePeerScope(recipientRole) {
    var api = teamRollupApiOf();
    return !!(
      api &&
      typeof api.canViewTeamRollup === "function" &&
      api.canViewTeamRollup(str(recipientRole))
    );
  }

  function scopeOf(trend) {
    var scope = plain(trend && trend.scope);
    var kind = str(scope.kind).trim();
    if (kind === SCOPE.MEMBER) {
      return { kind: SCOPE.MEMBER, memberKey: str(scope.memberKey) };
    }
    return { kind: SCOPE.CARE_LINE, memberKey: "" };
  }

  /**
   * Chave de desduplicação: linha, indicador e regra (CPIGOV-AC-03). A regra
   * entra na chave de propósito — um sinal que passa de uma regra para outra é
   * informação nova e volta a notificar; o mesmo sinal com a mesma regra não.
   */
  function alertKeyFor(careLineId, indicatorId, ruleId, scope) {
    var base = str(careLineId) + ":" + str(indicatorId) + ":" + str(ruleId);
    if (scope.kind === SCOPE.MEMBER && scope.memberKey) {
      return base + ":" + scope.memberKey;
    }
    return base;
  }

  /** Estado anterior aceite como mapa por chave ou como lista de entradas. */
  function normalizeLastCycle(lastCycle) {
    var out = {};
    if (Array.isArray(lastCycle)) {
      for (var i = 0; i < lastCycle.length; i++) {
        var entry = plain(lastCycle[i]);
        var key = str(entry.alertKey);
        if (!key) continue;
        out[key] = {
          alertKey: key,
          firstSeenCycle: str(entry.firstSeenCycle) || null,
          lastNotifiedCycle: str(entry.lastNotifiedCycle) || null,
        };
      }
      return out;
    }
    var map = plain(lastCycle);
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      var e = plain(map[keys[k]]);
      out[keys[k]] = {
        alertKey: keys[k],
        firstSeenCycle: str(e.firstSeenCycle) || null,
        lastNotifiedCycle: str(e.lastNotifiedCycle) || null,
      };
    }
    return out;
  }

  /**
   * Texto do alerta (CPIGOV-AC-05/14). Só identificadores de linha, indicador,
   * período e regra: nenhum campo de doente atravessa esta função porque
   * nenhum lhe é passado.
   */
  function composeMessage(careLineLabel, indicatorLabel, periodLabel, direction, description) {
    var side = DIRECTION_TEXT[direction] || null;
    var where = side
      ? side + " da linha central em " + periodLabel
      : "em " + periodLabel;
    return (
      "Sinal estatístico — " +
      indicatorLabel +
      " (" +
      careLineLabel +
      ") " +
      where +
      " (regra: " +
      description +
      "). Indica variação incompatível com ruído amostral; descreve variação e " +
      "não constitui juízo sobre a prática clínica."
    );
  }

  /**
   * Alertas do ciclo a partir das séries já construídas pela FEAT-126.
   *
   * @param {Array<{
   *   indicatorId?: string, careLineId?: string,
   *   indicatorLabel?: string, careLineLabel?: string,
   *   stability?: string,
   *   signals?: Array<{ rule: string, periodLabel: string, direction?: string|null }>,
   *   scope?: { kind?: "care_line"|"member", memberKey?: string },
   *   careLineLifecycle?: string, riskModel?: string|null
   * }>} trends — série da FEAT-126 já construída, uma por indicador/estrato
   * @param {{
   *   cycleId: string,
   *   recipientRole?: string,
   *   recipientMemberKey?: string,
   *   lastCycle?: object|Array<object>,
   *   careLineLifecycles?: Record<string, string>,
   *   riskModelValidation?: Record<string, string>
   * }} options
   * @returns {{ cycleId: string, alerts: object[], repeated: object[],
   *   excluded: object[], state: Record<string, object> }}
   */
  function deriveAlerts(trends, options) {
    var opts = plain(options);
    var cycleId = str(opts.cycleId).trim();
    // Fail-fast: sem ciclo não há desduplicação possível e o mesmo sinal
    // notificaria a cada recomputação (CPIGOV-AC-03).
    if (!cycleId) {
      throw new Error("cpi-alerts: cycleId obrigatório para desduplicar por ciclo");
    }

    var recipientRole = str(opts.recipientRole).trim();
    var recipientMemberKey = str(opts.recipientMemberKey).trim();
    var lifecycles = plain(opts.careLineLifecycles);
    var statusMap = plain(opts.riskModelValidation);
    var previous = normalizeLastCycle(opts.lastCycle);
    var peerAllowed = canReceivePeerScope(recipientRole);
    var special = specialCause();

    var alerts = [];
    var repeated = [];
    var excluded = [];
    var state = {};

    var list = asArray(trends);
    for (var i = 0; i < list.length; i++) {
      var trend = plain(list[i]);
      var careLineId = str(trend.careLineId);
      var indicatorId = str(trend.indicatorId);

      // Porta 1 — só causa especial (CPIGOV-AC-01/02).
      if (str(trend.stability) !== special) {
        excluded.push({
          careLineId: careLineId,
          indicatorId: indicatorId,
          reason: EXCLUSION.NOT_SPECIAL_CAUSE,
        });
        continue;
      }

      // Porta 2 — linha publicada e modelo validado (CPIGOV-AC-06).
      var lifecycle =
        trend.careLineLifecycle != null
          ? trend.careLineLifecycle
          : lifecycles[careLineId];
      if (!lifecycleAllows(lifecycle)) {
        excluded.push({
          careLineId: careLineId,
          indicatorId: indicatorId,
          reason: EXCLUSION.CARE_LINE_NOT_PUBLISHED,
        });
        continue;
      }
      if (!modelAllows(trend.riskModel, careLineId, statusMap)) {
        excluded.push({
          careLineId: careLineId,
          indicatorId: indicatorId,
          reason: EXCLUSION.RISK_MODEL_NOT_VALIDATED,
        });
        continue;
      }

      // Porta 3 — estrato alheio sem permissão. A exclusão é registada sem a
      // chave nem o rótulo do estrato: publicar «não podes ver X» já diria X
      // (CPIGOV-AC-04).
      var scope = scopeOf(trend);
      if (
        scope.kind === SCOPE.MEMBER &&
        scope.memberKey !== recipientMemberKey &&
        !peerAllowed
      ) {
        excluded.push({
          careLineId: careLineId,
          indicatorId: indicatorId,
          reason: EXCLUSION.PEER_SCOPE_NOT_PERMITTED,
        });
        continue;
      }

      var careLineLabel = str(trend.careLineLabel) || careLineId;
      var indicatorLabel = str(trend.indicatorLabel) || indicatorId;
      var signals = asArray(trend.signals);

      for (var s = 0; s < signals.length; s++) {
        var signal = plain(signals[s]);
        var ruleId = str(signal.rule);
        if (!isKnownRule(ruleId)) continue;

        var periodLabel = str(signal.periodLabel);
        var direction = signal.direction == null ? null : str(signal.direction);
        var key = alertKeyFor(careLineId, indicatorId, ruleId, scope);
        var before = previous[key] || null;

        // Porta 4 — persistente com a mesma regra: uma notificação por sinal,
        // não uma por recomputação (CPIGOV-AC-03).
        if (before && before.lastNotifiedCycle) {
          state[key] = {
            alertKey: key,
            firstSeenCycle: before.firstSeenCycle || before.lastNotifiedCycle,
            lastNotifiedCycle: before.lastNotifiedCycle,
          };
          repeated.push({
            alertKey: key,
            firstSeenCycle: state[key].firstSeenCycle,
            lastNotifiedCycle: state[key].lastNotifiedCycle,
          });
          continue;
        }

        state[key] = {
          alertKey: key,
          firstSeenCycle: cycleId,
          lastNotifiedCycle: cycleId,
        };

        alerts.push({
          alertKey: key,
          cycleId: cycleId,
          firstSeenCycle: cycleId,
          careLineId: careLineId,
          careLineLabel: careLineLabel,
          indicatorId: indicatorId,
          indicatorLabel: indicatorLabel,
          rule: ruleId,
          ruleDescription: ruleDescription(ruleId),
          periodLabel: periodLabel,
          direction: direction,
          scope: scope.kind,
          message: composeMessage(
            careLineLabel,
            indicatorLabel,
            periodLabel,
            direction,
            ruleDescription(ruleId),
          ),
        });
      }
    }

    return {
      cycleId: cycleId,
      alerts: alerts,
      repeated: repeated,
      excluded: excluded,
      state: state,
    };
  }

  return {
    SCOPE: SCOPE,
    EXCLUSION: EXCLUSION,
    specialCause: specialCause,
    PUBLISHED_LIFECYCLE: PUBLISHED_LIFECYCLE,
    alertKeyFor: alertKeyFor,
    canReceivePeerScope: canReceivePeerScope,
    deriveAlerts: deriveAlerts,
  };
});
