/**
 * Elegibilidade de pacientes HPB por protocolo de estudo.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbProtocolEligibility = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var schemaApi = null;
  var pathsApi = null;
  var aghuPathsApi = null;
  var aghuResolveApi = null;
  var patientEpisodesApi = null;
  if (typeof require === "function") {
    try {
      schemaApi = require("./hpb-registry-schema.js");
    } catch (_e) {}
    try {
      pathsApi = require("./hpb-protocol-field-paths.js");
    } catch (_e) {}
    try {
      aghuPathsApi = require("./aghu-protocol-field-paths.js");
    } catch (_e) {}
    try {
      aghuResolveApi = require("./aghu-protocol-field-resolve.js");
    } catch (_e) {}
    try {
      patientEpisodesApi = require("./patient-episodes-schema.js");
    } catch (_e) {}
  }
  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function fold(s) {
    return str(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isYes(v) {
    var s = fold(v);
    return s === "sim" || s === "true" || v === true;
  }

  function isNo(v) {
    var s = fold(v);
    return s === "nao" || s === "não" || s === "false" || v === false;
  }

  function isEmptyValue(v) {
    if (v == null) return true;
    if (typeof v === "boolean") return false;
    return str(v) === "";
  }

  function getNested(obj, pathParts) {
    var cur = obj;
    for (var i = 0; i < pathParts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[pathParts[i]];
    }
    return cur;
  }

  function resolveFieldValue(episode, surgery, fieldPath) {
    if (!fieldPath) return undefined;
    var parts = fieldPath.split(".");
    if (parts[0] === "episode") {
      return getNested(episode, parts.slice(1));
    }
    if (parts[0] === "surgery" && surgery) {
      return getNested(surgery, parts.slice(1));
    }
    return undefined;
  }

  function compareScalar(a, b) {
    var na = Number(a);
    var nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  }

  function evaluateCriterion(value, criterion) {
    var op = str(criterion.op);
    if (op === "isEmpty") return isEmptyValue(value);
    if (op === "isNotEmpty") return !isEmptyValue(value);
    if (op === "isYes") return isYes(value);
    if (op === "isNo") return isNo(value);
    if (op === "eq") return fold(value) === fold(criterion.value);
    if (op === "ne") return fold(value) !== fold(criterion.value);
    if (op === "contains") {
      var needle = fold(criterion.value);
      if (!needle) return false;
      return fold(value).indexOf(needle) !== -1;
    }
    if (op === "in") {
      var values = Array.isArray(criterion.values) ? criterion.values : [];
      var fv = fold(value);
      return values.some(function (v) {
        return fold(v) === fv;
      });
    }
    if (op === "notIn") {
      var values2 = Array.isArray(criterion.values) ? criterion.values : [];
      var fv2 = fold(value);
      return !values2.some(function (v) {
        return fold(v) === fv2;
      });
    }
    if (op === "gte") return compareScalar(value, criterion.value) >= 0;
    if (op === "lte") return compareScalar(value, criterion.value) <= 0;
    return false;
  }

  function activeEpisodes(registry) {
    if (schemaApi && schemaApi.filterRegistryActive) {
      return schemaApi.filterRegistryActive(registry || { episodes: [] }).episodes || [];
    }
    if (!registry || !Array.isArray(registry.episodes)) return [];
    return registry.episodes.filter(function (ep) {
      return ep && !ep.deletedAt;
    });
  }

  function activeClinicalEpisodes(patientDomains) {
    if (!patientEpisodesApi) return [];
    var snap =
      patientDomains && patientDomains.patient_episodes
        ? patientDomains.patient_episodes
        : null;
    return patientEpisodesApi.filterActiveEntries(snap);
  }

  function activeSurgeries(episode) {
    if (!episode || !Array.isArray(episode.surgeries)) return [];
    return episode.surgeries.filter(function (s) {
      return s && !s.deletedAt;
    });
  }

  function grainForPath(fieldPath) {
    if (aghuPathsApi && aghuPathsApi.isAghuFieldPath(fieldPath)) return "patient";
    if (pathsApi && pathsApi.grainForPath) return pathsApi.grainForPath(fieldPath);
    if (str(fieldPath).indexOf("episode.") === 0) return "episode";
    if (str(fieldPath).indexOf("surgery.") === 0) return "surgery";
    return null;
  }

  function resolveCriterionValue(episode, surgery, criterion, patientDomains) {
    var field = str(criterion.field);
    if (aghuPathsApi && aghuPathsApi.isAghuFieldPath(field) && aghuResolveApi) {
      return aghuResolveApi.resolveAghuFieldValue(
        patientDomains || {},
        criterion,
        { episode: episode, surgery: surgery },
      );
    }
    return resolveFieldValue(episode, surgery, field);
  }

  function evaluateUnit(episode, surgery, protocol, patientDomains) {
    var failedRules = [];
    var inclusion = Array.isArray(protocol.inclusion) ? protocol.inclusion : [];
    var exclusion = Array.isArray(protocol.exclusion) ? protocol.exclusion : [];
    var criteria = inclusion.concat(exclusion);
    var inclusionOk = true;
    var exclusionHit = false;

    for (var i = 0; i < inclusion.length; i++) {
      var inc = inclusion[i];
      var grain = grainForPath(inc.field);
      if (grain === "episode" && !episode) {
        inclusionOk = false;
        failedRules.push({ criterion: inc, reason: "episódio ausente" });
        continue;
      }
      if (grain === "surgery" && !surgery) {
        inclusionOk = false;
        failedRules.push({ criterion: inc, reason: "cirurgia ausente" });
        continue;
      }
      var val = resolveCriterionValue(episode, surgery, inc, patientDomains);
      if (!evaluateCriterion(val, inc)) {
        inclusionOk = false;
        failedRules.push({ criterion: inc, reason: "inclusão não satisfeita", value: val });
      }
    }

    for (var j = 0; j < exclusion.length; j++) {
      var exc = exclusion[j];
      var grainEx = grainForPath(exc.field);
      if (grainEx === "episode" && !episode) continue;
      if (grainEx === "surgery" && !surgery) continue;
      var valEx = resolveCriterionValue(episode, surgery, exc, patientDomains);
      if (evaluateCriterion(valEx, exc)) {
        exclusionHit = true;
        failedRules.push({ criterion: exc, reason: "exclusão satisfeita", value: valEx });
      }
    }

    var eligible = inclusionOk && !exclusionHit;
    return {
      eligible: eligible,
      episodeId: episode ? episode.id : undefined,
      surgeryId: surgery ? surgery.id : undefined,
      failedRules: failedRules,
      criteriaChecked: criteria.length,
    };
  }

  function evaluateProtocolEligibility(registry, protocol, patientDomains) {
    if (!protocol) {
      return { eligible: false, matchedUnits: [], failedRules: [] };
    }
    var episodes = activeEpisodes(registry);
    var clinical = activeClinicalEpisodes(patientDomains || {});
    if (!episodes.length && !clinical.length) {
      var inclusion = Array.isArray(protocol.inclusion) ? protocol.inclusion : [];
      if (inclusion.length) {
        for (var ci = 0; ci < inclusion.length; ci++) {
          var crit = inclusion[ci];
          var grain = grainForPath(crit.field);
          if (grain === "episode" || grain === "surgery") {
            return {
              eligible: false,
              matchedUnits: [],
              failedRules: [
                {
                  criterion: crit,
                  reason:
                    grain === "surgery"
                      ? "cirurgia ausente"
                      : "episódio ausente",
                },
              ],
            };
          }
        }
      }
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: [
          {
            reason:
              "nenhum episódio registado — crie um episódio na aba Episódios",
          },
        ],
      };
    }

    if (!episodes.length && clinical.length) {
      var inclusionOnly = Array.isArray(protocol.inclusion) ? protocol.inclusion : [];
      if (!inclusionOnly.length) {
        return {
          eligible: true,
          matchedUnits: clinical.map(function (ce) {
            return { patientEpisodeId: ce.id, clinicalOnly: true };
          }),
          failedRules: [],
        };
      }
      return {
        eligible: false,
        matchedUnits: [],
        failedRules: [
          {
            reason:
              "episódio clínico existe — complete a ficha HPB em Research ou use inscrição manual",
          },
        ],
      };
    }
    var matchedUnits = [];
    var bestFailure = [];

    for (var ei = 0; ei < episodes.length; ei++) {
      var ep = episodes[ei];
      var surgeries = activeSurgeries(ep);
      var units = surgeries.length
        ? surgeries.map(function (surg) {
            return { episode: ep, surgery: surg };
          })
        : [{ episode: ep, surgery: null }];

      for (var ui = 0; ui < units.length; ui++) {
        var unit = units[ui];
        var result = evaluateUnit(unit.episode, unit.surgery, protocol, patientDomains);
        if (result.eligible) {
          matchedUnits.push({
            episodeId: result.episodeId,
            surgeryId: result.surgeryId,
          });
        } else if (!bestFailure.length && result.failedRules.length) {
          bestFailure = result.failedRules;
        }
      }
    }

    return {
      eligible: matchedUnits.length > 0,
      matchedUnits: matchedUnits,
      failedRules: matchedUnits.length ? [] : bestFailure,
    };
  }

  function isOutcomeFilled(registry, protocol, unit) {
    if (!protocol || !protocol.primaryOutcome || !protocol.primaryOutcome.field) {
      return null;
    }
    var ep = null;
    var surg = null;
    var episodes = activeEpisodes(registry);
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].id === unit.episodeId) {
        ep = episodes[i];
        break;
      }
    }
    if (!ep) return false;
    if (unit.surgeryId) {
      var surgeries = activeSurgeries(ep);
      for (var j = 0; j < surgeries.length; j++) {
        if (surgeries[j].id === unit.surgeryId) {
          surg = surgeries[j];
          break;
        }
      }
    }
    var val = resolveFieldValue(ep, surg, protocol.primaryOutcome.field);
    return !isEmptyValue(val);
  }

  function filterPatientsByProtocol(patients, protocol) {
    if (!protocol) return patients || [];
    return (patients || []).filter(function (p) {
      var result = evaluateProtocolEligibility(p.registry, protocol, {
        exams: p.exams,
        controles: p.controles,
      });
      return result.eligible;
    });
  }

  function summarizeCohortEligibility(patients, protocol) {
    var list = patients || [];
    var total = list.length;
    if (!protocol) {
      return {
        totalPatients: total,
        eligiblePatients: total,
        primaryOutcomeFilled: 0,
        primaryOutcomeRate: total ? 1 : 0,
      };
    }
    var eligible = 0;
    var outcomeFilled = 0;
    for (var i = 0; i < list.length; i++) {
      var domains = { exams: list[i].exams, controles: list[i].controles };
      var ev = evaluateProtocolEligibility(list[i].registry, protocol, domains);
      if (!ev.eligible) continue;
      eligible += 1;
      var filled = ev.matchedUnits.some(function (unit) {
        return isOutcomeFilled(list[i].registry, protocol, unit);
      });
      if (filled) outcomeFilled += 1;
    }
    return {
      totalPatients: total,
      eligiblePatients: eligible,
      primaryOutcomeFilled: outcomeFilled,
      primaryOutcomeRate: eligible ? outcomeFilled / eligible : 0,
    };
  }

  return {
    evaluateProtocolEligibility: evaluateProtocolEligibility,
    filterPatientsByProtocol: filterPatientsByProtocol,
    summarizeCohortEligibility: summarizeCohortEligibility,
    resolveFieldValue: resolveFieldValue,
    evaluateCriterion: evaluateCriterion,
  };
});
