/**
 * FEAT-089 — runState por run_id (nav ok → flags; extract exige flag).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentRunState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_NAV_RETRIES = 1;

  function last4Digits(prontuario) {
    var d = String(prontuario == null ? "" : prontuario).replace(/\D/g, "");
    if (!d) return "";
    return d.length <= 4 ? d : d.slice(-4);
  }

  function createRunState() {
    return {
      polReady: Object.create(null),
      controlesReady: Object.create(null),
      prescricoesReady: Object.create(null),
      navRetries: Object.create(null),
    };
  }

  function navFlagForSkillId(skillId) {
    var id = String(skillId || "");
    if (id === "passometro.nav.pol") return "polReady";
    if (id === "passometro.nav.controles") return "controlesReady";
    if (id === "passometro.nav.prescricoes") return "prescricoesReady";
    return null;
  }

  function extractFlagForSkillId(skillId) {
    var id = String(skillId || "");
    if (
      id === "passometro.cadastro" ||
      id === "passometro.exames" ||
      id === "passometro.cirurgias"
    ) {
      return "polReady";
    }
    if (id === "passometro.controles") return "controlesReady";
    if (id === "passometro.prescricoes") return "prescricoesReady";
    return null;
  }

  function isNavSkillId(skillId) {
    return !!navFlagForSkillId(skillId);
  }

  /** Mapa nav → extract (FEAT-089 gate anti re-nav). */
  var NAV_TO_EXTRACT_SKILL = Object.freeze({
    "passometro.nav.pol": "passometro.exames",
    "passometro.nav.controles": "passometro.controles",
    "passometro.nav.prescricoes": "passometro.prescricoes",
  });

  var EXTRACT_TO_TOOL_NAME = Object.freeze({
    "passometro.exames": "extractExames",
    "passometro.cirurgias": "extractCirurgias",
    "passometro.controles": "extractControles",
    "passometro.prescricoes": "extractPrescricoes",
  });

  /**
   * Nav redundante quando todos prontuários já têm flag extract-ready.
   * @returns {{ ok: true } | { ok: false, errorCode: string, suggestExtractSkillId?: string, suggestToolName?: string }}
   */
  function isNavRedundant(runState, skillId, prontuarios) {
    var id = String(skillId || "");
    if (!isNavSkillId(id)) return { ok: true };
    var extractSkillId = NAV_TO_EXTRACT_SKILL[id];
    if (!extractSkillId) return { ok: true };
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    if (!list.length) return { ok: true };
    for (var i = 0; i < list.length; i++) {
      if (!isExtractReady(runState, extractSkillId, list[i])) {
        return { ok: true };
      }
    }
    return {
      ok: false,
      error: "Nav já concluída neste run — use extract* correspondente.",
      errorCode: "nav_already_ready",
      suggestExtractSkillId: extractSkillId,
      suggestToolName: EXTRACT_TO_TOOL_NAME[extractSkillId] || "",
    };
  }

  function retryKey(skillId, prontuario) {
    return String(skillId || "") + ":" + last4Digits(prontuario);
  }

  function getNavRetryCount(runState, skillId, prontuario) {
    if (!runState || !runState.navRetries) return 0;
    return runState.navRetries[retryKey(skillId, prontuario)] || 0;
  }

  /**
   * Após 2ª falha no mesmo target/prontuário no run, bloqueia re-nav cega.
   */
  function isNavRetryBlocked(runState, skillId, prontuarios) {
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    for (var i = 0; i < list.length; i++) {
      if (getNavRetryCount(runState, skillId, list[i]) > MAX_NAV_RETRIES) {
        return {
          ok: false,
          errorCode: "nav_retry_exceeded",
          prontuarioKey: last4Digits(list[i]),
        };
      }
    }
    return { ok: true };
  }

  function incrementNavRetry(runState, skillId, prontuarios) {
    if (!runState) return;
    if (!runState.navRetries) runState.navRetries = Object.create(null);
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    for (var i = 0; i < list.length; i++) {
      var key = retryKey(skillId, list[i]);
      runState.navRetries[key] = (runState.navRetries[key] || 0) + 1;
    }
  }

  function clearNavRetry(runState, skillId, prontuarios) {
    if (!runState || !runState.navRetries) return;
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    for (var i = 0; i < list.length; i++) {
      delete runState.navRetries[retryKey(skillId, list[i])];
    }
  }

  function markNavReady(runState, skillId, prontuarios) {
    var flag = navFlagForSkillId(skillId);
    if (!flag || !runState) return;
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    for (var i = 0; i < list.length; i++) {
      var k = last4Digits(list[i]);
      if (k) runState[flag][k] = true;
    }
    clearNavRetry(runState, skillId, list);
  }

  function markNavFailed(runState, skillId, prontuarios) {
    var flag = navFlagForSkillId(skillId);
    if (!flag || !runState) return;
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    for (var i = 0; i < list.length; i++) {
      var k = last4Digits(list[i]);
      if (k) delete runState[flag][k];
    }
    incrementNavRetry(runState, skillId, list);
  }

  function isExtractReady(runState, skillId, prontuario) {
    var flag = extractFlagForSkillId(skillId);
    if (!flag) return true;
    if (!runState) return false;
    var k = last4Digits(prontuario);
    return !!(k && runState[flag] && runState[flag][k]);
  }

  /**
   * Extract exige runState ou nav precedente no mesmo batch.
   * @param {string} skillId
   * @param {string[]} prontuarios
   * @param {object} runState
   * @param {string[]} priorSkillIds — calls já executadas no batch
   */
  function checkExtractPrereq(skillId, prontuarios, runState, priorSkillIds) {
    var flag = extractFlagForSkillId(skillId);
    if (!flag) return { ok: true };
    var list = Array.isArray(prontuarios) ? prontuarios : [];
    var prior = Array.isArray(priorSkillIds) ? priorSkillIds : [];
    var pending = createRunState();
    if (runState) {
      pending.polReady = Object.assign(Object.create(null), runState.polReady);
      pending.controlesReady = Object.assign(
        Object.create(null),
        runState.controlesReady
      );
      pending.prescricoesReady = Object.assign(
        Object.create(null),
        runState.prescricoesReady
      );
    }
    for (var p = 0; p < prior.length; p++) {
      var navFlag = navFlagForSkillId(prior[p]);
      if (navFlag) {
        /* nav no batch assume todos prontuarios do call — validado na execução */
      }
    }
    for (var i = 0; i < list.length; i++) {
      var pront = list[i];
      var k = last4Digits(pront);
      if (!isExtractReady(pending, skillId, pront)) {
        return {
          ok: false,
          errorCode: "nav_required",
          prontuarioKey: k,
          requiredFlag: flag,
        };
      }
    }
    return { ok: true };
  }

  /**
   * Simula nav ok no batch para validação pré-exec (mesmo turn).
   */
  function applyBatchNavPreview(runState, skillId, prontuarios) {
    if (isNavSkillId(skillId)) {
      markNavReady(runState, skillId, prontuarios);
    }
  }

  function validateBatchPrereqs(skillCalls, runState) {
    var calls = Array.isArray(skillCalls) ? skillCalls : [];
    var preview = createRunState();
    if (runState) {
      preview.polReady = Object.assign(Object.create(null), runState.polReady);
      preview.controlesReady = Object.assign(
        Object.create(null),
        runState.controlesReady
      );
      preview.prescricoesReady = Object.assign(
        Object.create(null),
        runState.prescricoesReady
      );
      preview.navRetries = Object.assign(Object.create(null), runState.navRetries);
    }
    var priorIds = [];
    for (var i = 0; i < calls.length; i++) {
      var call = calls[i] || {};
      var skillId = call.skillId || "";
      var args = call.args || call.arguments || {};
      var prontuarios = Array.isArray(args.prontuarios) ? args.prontuarios : [];
      if (extractFlagForSkillId(skillId)) {
        for (var j = 0; j < prontuarios.length; j++) {
          if (!isExtractReady(preview, skillId, prontuarios[j])) {
            return {
              ok: false,
              error: "Extract exige nav prévia (runState ou open* antes no batch).",
              errorCode: "nav_required",
              skillId: skillId,
              prontuarioKey: last4Digits(prontuarios[j]),
            };
          }
        }
      }
      if (isNavSkillId(skillId)) {
        var redundant = isNavRedundant(preview, skillId, prontuarios);
        if (!redundant.ok && redundant.errorCode === "nav_already_ready") {
          return redundant;
        }
        var blocked = isNavRetryBlocked(preview, skillId, prontuarios);
        if (!blocked.ok) return blocked;
        markNavReady(preview, skillId, prontuarios);
      }
    }
    return { ok: true };
  }

  function applySkillResultToRunState(runState, skillId, args, result) {
    if (!runState) return;
    var prontuarios =
      args && Array.isArray(args.prontuarios) ? args.prontuarios : [];
    if (isNavSkillId(skillId)) {
      if (result && result.ok) {
        markNavReady(runState, skillId, prontuarios);
      } else {
        markNavFailed(runState, skillId, prontuarios);
      }
      return;
    }
    if (extractFlagForSkillId(skillId) && result && result.patients) {
      /* extract não altera flags nav */
    }
  }

  return {
    MAX_NAV_RETRIES: MAX_NAV_RETRIES,
    createRunState: createRunState,
    navFlagForSkillId: navFlagForSkillId,
    extractFlagForSkillId: extractFlagForSkillId,
    isNavSkillId: isNavSkillId,
    isExtractReady: isExtractReady,
    checkExtractPrereq: checkExtractPrereq,
    validateBatchPrereqs: validateBatchPrereqs,
    applySkillResultToRunState: applySkillResultToRunState,
    isNavRetryBlocked: isNavRetryBlocked,
    isNavRedundant: isNavRedundant,
    markNavReady: markNavReady,
    markNavFailed: markNavFailed,
    getNavRetryCount: getNavRetryCount,
    NAV_TO_EXTRACT_SKILL: NAV_TO_EXTRACT_SKILL,
  };
});
