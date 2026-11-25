/**
 * Diff de enrollment Research para audit (FEAT-067 / GEN-13).
 * Sem PHI clínico — só IDs opacos + action/status.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchEnrollmentAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VALID_ACTIONS = [
    "screen",
    "eligible",
    "enroll",
    "withdraw",
    "ignore",
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function statusOf(bucket) {
    if (!bucket || !bucket.enrollment) return "";
    return str(bucket.enrollment.status);
  }

  function actionFromTransition(fromStatus, toStatus, reason) {
    if (toStatus === "withdrawn") {
      var r = str(reason).toLowerCase();
      if (r.indexOf("ignorado") !== -1 || r.indexOf("ignore") !== -1) {
        return "ignore";
      }
      return "withdraw";
    }
    if (toStatus === "enrolled") return "enroll";
    if (toStatus === "eligible") return "eligible";
    if (toStatus === "screened") return "screen";
    return "";
  }

  function protocolsMap(registry) {
    if (!registry || typeof registry !== "object") return {};
    var protocols = registry.protocols;
    return protocols && typeof protocols === "object" ? protocols : {};
  }

  /**
   * @returns {Array<{ protocol_id: string, action: string, from_status: string|null, to_status: string, reason: string|null }>}
   */
  function diffEnrollmentAudits(beforeRegistry, afterRegistry) {
    var before = protocolsMap(beforeRegistry);
    var after = protocolsMap(afterRegistry);
    var ids = {};
    var k;
    for (k in before) {
      if (Object.prototype.hasOwnProperty.call(before, k)) ids[k] = true;
    }
    for (k in after) {
      if (Object.prototype.hasOwnProperty.call(after, k)) ids[k] = true;
    }

    var rows = [];
    for (k in ids) {
      if (!Object.prototype.hasOwnProperty.call(ids, k)) continue;
      var fromStatus = statusOf(before[k]) || null;
      var toStatus = statusOf(after[k]);
      if (!toStatus || fromStatus === toStatus) continue;
      // Motivo livre fica só no registry cifrado — audit workspace-readable
      // não persiste texto (LGPD minimização); action já distingue ignore/withdraw.
      var withdrawnReason =
        after[k] && after[k].enrollment
          ? str(after[k].enrollment.withdrawnReason)
          : "";
      var action = actionFromTransition(fromStatus, toStatus, withdrawnReason);
      if (!action || VALID_ACTIONS.indexOf(action) === -1) continue;
      rows.push({
        protocol_id: k,
        action: action,
        from_status: fromStatus,
        to_status: toStatus,
        reason: null,
      });
    }
    return rows;
  }

  return {
    VALID_ACTIONS: VALID_ACTIONS,
    actionFromTransition: actionFromTransition,
    diffEnrollmentAudits: diffEnrollmentAudits,
  };
});
