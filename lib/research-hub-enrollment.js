/**
 * Elegibilidade e resumo para inscrição no hub Research (ENR-AC-01..05).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchHubEnrollment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var hpbEligibilityApi = null;
  var researchEligibilityApi = null;
  var registryApi = null;

  try {
    if (typeof require === "function") {
      hpbEligibilityApi = require("./hpb-protocol-eligibility.js");
      researchEligibilityApi = require("./research-protocol-eligibility.js");
      registryApi = require("./research-registry-schema.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function evaluateProtocolEligibilityForHub(
    protocol,
    registry,
    hpbRegistry,
    patientDomains,
  ) {
    var domains = {
      exams: patientDomains && patientDomains.exams,
      controles: patientDomains && patientDomains.controles,
      prescricoes: patientDomains && patientDomains.prescricoes,
      pii: patientDomains && patientDomains.pii,
      patient_episodes: patientDomains && patientDomains.patient_episodes,
      passometro: patientDomains && patientDomains.passometro,
    };

    if (protocol && protocol.domainType === "hpb_builtin" && hpbEligibilityApi) {
      var hpbResult = hpbEligibilityApi.evaluateProtocolEligibility(
        hpbRegistry,
        protocol,
        domains,
      );
      return {
        eligible: !!(hpbResult && hpbResult.eligible),
        failedRules: (hpbResult && hpbResult.failedRules) || [],
      };
    }

    if (!researchEligibilityApi || !protocol) {
      return { eligible: false, failedRules: [] };
    }

    var customResult =
      typeof researchEligibilityApi.evaluateScreeningEligibility === "function"
        ? researchEligibilityApi.evaluateScreeningEligibility(domains, protocol)
        : researchEligibilityApi.evaluatePatientEligibility(
            registry,
            protocol.id,
            protocol,
            domains,
          );
    return {
      eligible: !!(customResult && customResult.eligible),
      failedRules: (customResult && customResult.failedRules) || [],
    };
  }

  function ruleField(rule) {
    if (!rule) return "critério";
    var field =
      (rule.rule && rule.rule.field) ||
      (rule.criterion && rule.criterion.field) ||
      "";
    return field || "critério";
  }

  function formatFailedRuleMessages(failedRules, max) {
    max = max == null ? 3 : max;
    var rules = Array.isArray(failedRules) ? failedRules : [];
    if (!rules.length) {
      return ["Critérios de inclusão não satisfeitos (sem detalhe disponível)."];
    }
    var messages = [];
    for (var i = 0; i < rules.length && messages.length < max; i++) {
      var rule = rules[i];
      var reason = str(rule.reason);
      if (reason && !rule.criterion && !rule.rule) {
        messages.push(reason);
        continue;
      }
      var field = ruleField(rule);
      if (reason) {
        messages.push(field + ": " + reason);
        continue;
      }
      var op =
        (rule.rule && rule.rule.op) ||
        (rule.criterion && rule.criterion.op) ||
        "";
      messages.push(field + " (" + (op || "regra") + ") não satisfeito");
    }
    if (rules.length > max) {
      messages.push("+" + (rules.length - max) + " critério(s) adicional(is)");
    }
    return messages;
  }

  function isProtocolEnrolled(registry, protocolId) {
    if (!registryApi || !protocolId) return false;
    var bucket = registryApi.getProtocolBucket(registry, protocolId);
    return registryApi.isPatientEnrolled(bucket);
  }

  function isProtocolWithdrawn(registry, protocolId) {
    if (!registryApi || !protocolId) return false;
    var bucket = registryApi.getProtocolBucket(registry, protocolId);
    return registryApi.isEnrollmentWithdrawn(bucket);
  }

  /**
   * Inscreve automaticamente em protocolos elegíveis (não inscritos / não retirados).
   * @returns {{ registry: object, enrolledProtocolIds: string[] }}
   */
  function ensureAutoEnrollmentForEligibleProtocols(
    registry,
    protocols,
    hpbRegistry,
    patientDomains,
    opts,
  ) {
    opts = opts || {};
    var recordClientId = opts.recordClientId ? String(opts.recordClientId) : "";
    var shouldSkip = opts.shouldSkipProtocol;
    var enrolledProtocolIds = [];
    if (!registryApi || !Array.isArray(protocols)) {
      return { registry: registry, enrolledProtocolIds: enrolledProtocolIds };
    }
    var reg = registryApi.normalizeRegistry(registry);
    if (registryApi.isRegistryFrozen(reg)) {
      return { registry: reg, enrolledProtocolIds: enrolledProtocolIds };
    }

    for (var i = 0; i < protocols.length; i++) {
      var protocol = protocols[i];
      if (!protocol || !protocol.id) continue;
      if (shouldSkip && shouldSkip(recordClientId, protocol.id)) continue;
      if (isProtocolEnrolled(reg, protocol.id)) continue;
      if (isProtocolWithdrawn(reg, protocol.id)) continue;

      var ev = evaluateProtocolEligibilityForHub(
        protocol,
        reg,
        hpbRegistry,
        patientDomains,
      );
      if (!ev.eligible) continue;

      reg = registryApi.deriveEnrollmentFromEligibility(
        reg,
        protocol.id,
        protocol,
        patientDomains || {},
      );
      reg = registryApi.setEnrollmentStatus(reg, protocol.id, "enrolled", {
        enrolledBy: "system-eligibility",
      });
      enrolledProtocolIds.push(protocol.id);
    }

    return { registry: reg, enrolledProtocolIds: enrolledProtocolIds };
  }

  return {
    evaluateProtocolEligibilityForHub: evaluateProtocolEligibilityForHub,
    formatFailedRuleMessages: formatFailedRuleMessages,
    isProtocolEnrolled: isProtocolEnrolled,
    isProtocolWithdrawn: isProtocolWithdrawn,
    ensureAutoEnrollmentForEligibleProtocols:
      ensureAutoEnrollmentForEligibleProtocols,
    ruleField: ruleField,
  };
});
