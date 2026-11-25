/**
 * FEAT-071 — registry de skills tipadas do agente Passômetro.
 * Allowlist = skillIds/toolNames; execução AGHU só no cliente via deps.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-period-shortcuts.js")
      : root.AghuPassometroPeriodShortcuts,
    typeof require !== "undefined"
      ? require("./passometro-agent-error-codes.js")
      : root.AghuPassometroAgentErrorCodes,
    typeof require !== "undefined"
      ? require("./passometro-agent-run-state.js")
      : root.AghuPassometroAgentRunState
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroAgentSkills = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  periodApi,
  errorCodesApi,
  runStateApi
) {
  "use strict";

  var MAX_PRONTUARIOS = 10;
  var PERIODS = Object.freeze(["hoje", "ontem", "semanal"]);

  var PHI_KEY_RE =
    /^(nome|name|html|innerHTML|outerHTML|laudo|texto|textoClinico|vitals|prescricaoTexto|content|dom|snapshot)$/i;

  var FORBIDDEN_TOOL_NAMES = Object.freeze([
    "click",
    "type",
    "snapshot",
    "getDomSnapshot",
    "getDom",
    "querySelector",
    "evaluate",
    "screenshot",
  ]);

  function last4Digits(prontuario) {
    var d = String(prontuario == null ? "" : prontuario).replace(/\D/g, "");
    if (!d) return "";
    return d.length <= 4 ? d : d.slice(-4);
  }

  function navErrorHint(message) {
    var m = String(message || "").trim();
    if (!m) return "";
    return m.length > 120 ? m.slice(0, 120) : m;
  }

  function scrubObject(obj, depth) {
    if (depth > 8) return undefined;
    if (obj == null) return obj;
    if (Array.isArray(obj)) {
      return obj.map(function (item) {
        return scrubObject(item, depth + 1);
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
      if (PHI_KEY_RE.test(k)) continue;
      if (/laudo|html|innerHTML|nomePaciente|patientName/i.test(k)) continue;
      var v = obj[k];
      if (typeof v === "string" && /<[^>]+>/.test(v)) continue;
      if (k === "prontuario" || k === "prontuarios") {
        if (typeof v === "string") {
          out.prontuarioKey = last4Digits(v);
        } else if (Array.isArray(v)) {
          out.prontuarioKeys = v.map(last4Digits);
        }
        continue;
      }
      var scrubbed = scrubObject(v, depth + 1);
      if (scrubbed !== undefined) out[k] = scrubbed;
    }
    return out;
  }

  function validateProntuariosPeriod(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return { ok: false, error: "Args inválidos: object obrigatório." };
    }
    var periodo = String(args.periodo || "")
      .toLowerCase()
      .trim();
    if (PERIODS.indexOf(periodo) === -1) {
      return {
        ok: false,
        error: "Período inválido (use hoje|ontem|semanal).",
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
      };
    }
    if (!periodApi || typeof periodApi.parseProntuarioList !== "function") {
      return { ok: false, error: "period shortcuts indisponível." };
    }
    var parsed = periodApi.parseProntuarioList(text);
    if (!parsed.prontuarios.length) {
      return {
        ok: false,
        error: parsed.errors[0] || "Nenhum prontuário válido.",
      };
    }
    if (parsed.prontuarios.length > MAX_PRONTUARIOS) {
      return {
        ok: false,
        error: "Máximo de " + MAX_PRONTUARIOS + " prontuários por skill.",
      };
    }
    return {
      ok: true,
      value: {
        prontuarios: parsed.prontuarios,
        periodo: periodo,
      },
    };
  }

  function sharedParameters() {
    return {
      type: "object",
      required: ["prontuarios", "periodo"],
      properties: {
        prontuarios: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_PRONTUARIOS,
          description: "Lista de prontuários (só dígitos).",
        },
        periodo: {
          type: "string",
          enum: PERIODS.slice(),
        },
      },
    };
  }

  function navParameters() {
    return {
      type: "object",
      required: ["prontuarios"],
      properties: {
        prontuarios: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_PRONTUARIOS,
          description: "Lista de prontuários (só dígitos). Preferir 1 no multi-round.",
        },
        periodo: {
          type: "string",
          enum: PERIODS.slice(),
          description: "Opcional em openPol; ignorado na nav POL.",
        },
      },
    };
  }

  function validateProntuariosOnly(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return { ok: false, error: "Args inválidos: object obrigatório." };
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
      };
    }
    if (!periodApi || typeof periodApi.parseProntuarioList !== "function") {
      return { ok: false, error: "period shortcuts indisponível." };
    }
    var parsed = periodApi.parseProntuarioList(text);
    if (!parsed.prontuarios.length) {
      return {
        ok: false,
        error: parsed.errors[0] || "Nenhum prontuário válido.",
      };
    }
    if (parsed.prontuarios.length > MAX_PRONTUARIOS) {
      return {
        ok: false,
        error: "Máximo de " + MAX_PRONTUARIOS + " prontuários por skill.",
      };
    }
    var periodo = String(args.periodo || "hoje")
      .toLowerCase()
      .trim();
    if (periodo && PERIODS.indexOf(periodo) === -1) {
      return {
        ok: false,
        error: "Período inválido (use hoje|ontem|semanal).",
      };
    }
    return {
      ok: true,
      value: {
        prontuarios: parsed.prontuarios,
        periodo: PERIODS.indexOf(periodo) !== -1 ? periodo : "hoje",
      },
    };
  }

  /**
   * @type {ReadonlyArray<object>}
   */
  var SKILLS = Object.freeze([
    {
      skillId: "passometro.nav.pol",
      toolName: "openPol",
      kind: "nav",
      domains: Object.freeze(["cadastro", "exames", "cirurgias"]),
      description:
        "Seleciona prontuário e abre POL no AGHU. Use antes de extractCadastro, extractExames ou extractCirurgias.",
      parameters: navParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosOnly,
    },
    {
      skillId: "passometro.nav.controles",
      toolName: "openControles",
      kind: "nav",
      domains: Object.freeze(["controles"]),
      description:
        "Seleciona prontuário e abre Visualizar Controles no AGHU. Obrigatório periodo. Use antes de extractControles.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.nav.prescricoes",
      toolName: "openPrescricoes",
      kind: "nav",
      domains: Object.freeze(["prescricoes"]),
      description:
        "Seleciona prontuário e abre Consultar Prescrições no AGHU. Obrigatório periodo. Use antes de extractPrescricoes.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.oneclick",
      toolName: "runPassometroOneClick",
      kind: "composite",
      domains: Object.freeze([
        "cadastro",
        "exames",
        "cirurgias",
        "controles",
        "prescricoes",
      ]),
      description:
        "Extrai passômetro completo (cadastro+exames+cirurgias+controles+prescrições+autofill) no AGHU já logado. Use para pedidos de lote/tudo/passômetro.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.cadastro",
      toolName: "extractCadastro",
      kind: "domain",
      domains: Object.freeze(["cadastro"]),
      description:
        "Extrai só cadastro POL (demografia + internações) após openPol — não navega. Não use se o pedido for passômetro completo.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.exames",
      toolName: "extractExames",
      kind: "domain",
      domains: Object.freeze(["exames"]),
      description:
        "Extrai só exames (POL Liberados) após openPol — não navega. Não use se o pedido for passômetro completo.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.cirurgias",
      toolName: "extractCirurgias",
      kind: "domain",
      domains: Object.freeze(["cirurgias"]),
      description:
        "Extrai só cirurgias após openPol — não navega. Não use para passômetro completo.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.controles",
      toolName: "extractControles",
      kind: "domain",
      domains: Object.freeze(["controles"]),
      description:
        "Extrai só controles após openControles — não navega. Use quando o pedido restringir a controles/sinais vitais.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
    {
      skillId: "passometro.prescricoes",
      toolName: "extractPrescricoes",
      kind: "domain",
      domains: Object.freeze(["prescricoes"]),
      description:
        "Extrai só prescrições após openPrescricoes — não navega. Não use para passômetro completo.",
      parameters: sharedParameters(),
      maxProntuarios: MAX_PRONTUARIOS,
      requiresAghuSession: true,
      exposedToLlm: true,
      validate: validateProntuariosPeriod,
    },
  ]);

  function listSkills() {
    return SKILLS.slice();
  }

  function getSkillById(skillId) {
    var id = String(skillId || "");
    for (var i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].skillId === id) return SKILLS[i];
    }
    return null;
  }

  function getSkillByToolName(toolName) {
    var name = String(toolName || "");
    for (var i = 0; i < SKILLS.length; i++) {
      if (SKILLS[i].toolName === name) return SKILLS[i];
    }
    return null;
  }

  function getExposedSkills() {
    return SKILLS.filter(function (s) {
      return s.exposedToLlm;
    });
  }

  function getToolSchemas() {
    return getExposedSkills().map(function (s) {
      return {
        name: s.toolName,
        description: s.description,
        parameters: s.parameters,
        skillId: s.skillId,
      };
    });
  }

  function getAllowedToolNames() {
    return getExposedSkills().map(function (s) {
      return s.toolName;
    });
  }

  function getAllowedSkillIds() {
    return SKILLS.map(function (s) {
      return s.skillId;
    });
  }

  function isToolAllowed(name) {
    return getAllowedToolNames().indexOf(String(name || "")) !== -1;
  }

  function isSkillAllowed(skillId) {
    return !!getSkillById(skillId);
  }

  function assertAllowlistFreeze() {
    var schemas = getToolSchemas();
    var names = schemas.map(function (s) {
      return String(s.name || "");
    });
    for (var i = 0; i < names.length; i++) {
      if (FORBIDDEN_TOOL_NAMES.indexOf(names[i]) !== -1) {
        return {
          ok: false,
          error: "Tool proibida no schema: " + names[i],
        };
      }
      if (!isToolAllowed(names[i])) {
        return {
          ok: false,
          error: "Tool fora da allowlist: " + names[i],
        };
      }
    }
    for (var j = 0; j < FORBIDDEN_TOOL_NAMES.length; j++) {
      if (names.indexOf(FORBIDDEN_TOOL_NAMES[j]) !== -1) {
        return {
          ok: false,
          error: "Schema contém tool genérica: " + FORBIDDEN_TOOL_NAMES[j],
        };
      }
    }
    return { ok: true };
  }

  function validateSkillArgs(skillIdOrTool, args) {
    var skill =
      getSkillById(skillIdOrTool) || getSkillByToolName(skillIdOrTool);
    if (!skill) {
      return {
        ok: false,
        error: "Skill desconhecida.",
        errorCode: "unknown_skill",
      };
    }
    var result = skill.validate(args);
    if (!result.ok) {
      result.errorCode = "invalid_args";
    }
    return result;
  }

  function sanitizeSkillResult(raw, skill) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, errorCode: "invalid_result" };
    }
    var scrubbed = scrubObject(raw, 0) || {};
    if (typeof scrubbed.ok !== "boolean") {
      scrubbed.ok = Boolean(raw.ok);
    }
    if (skill && skill.kind === "domain" && skill.domains[0]) {
      scrubbed.domain = skill.domains[0];
    }
    if (skill && skill.kind === "composite" && scrubbed.domain == null) {
      scrubbed.kind = "composite";
    }
    return scrubbed;
  }

  /**
   * Heurística de intent → skill (eval / playbook; PA-AC-13/14).
   * @param {string} text
   * @returns {{ skillId: string|null, reason: string }}
   */
  function preferSkillForIntent(text) {
    var t = String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!t.trim()) {
      return { skillId: null, reason: "vazio" };
    }
    if (
      /\b(clica|click|html|dom|selector|queryselector|devtools|screenshot)\b/.test(
        t
      )
    ) {
      return { skillId: null, reason: "pedido_adversarial" };
    }
    var onlyDomain =
      /\b(so|apenas|somente)\b/.test(t) ||
      /\b(soh)\b/.test(t);
    if (/\bcontrole/.test(t) && (onlyDomain || !/\bpassometr/.test(t))) {
      if (onlyDomain || !/\b(tudo|completo|lote|passometr)\b/.test(t)) {
        return { skillId: "passometro.controles", reason: "dominio_controles" };
      }
    }
    if (/\bcadastro\b/.test(t) && (onlyDomain || !/\b(tudo|completo|passometr)\b/.test(t))) {
      if (onlyDomain || (!/\bpassometr/.test(t) && !/\btudo\b/.test(t))) {
        return { skillId: "passometro.cadastro", reason: "dominio_cadastro" };
      }
    }
    if (/\bexame/.test(t) && (onlyDomain || !/\b(tudo|completo|passometr)\b/.test(t))) {
      if (onlyDomain || (!/\bpassometr/.test(t) && !/\btudo\b/.test(t))) {
        return { skillId: "passometro.exames", reason: "dominio_exames" };
      }
    }
    if (/\bcirurg/.test(t) && (onlyDomain || !/\b(tudo|completo|passometr)\b/.test(t))) {
      return { skillId: "passometro.cirurgias", reason: "dominio_cirurgias" };
    }
    if (
      /\bprescri/.test(t) &&
      (onlyDomain || !/\b(tudo|completo|passometr)\b/.test(t))
    ) {
      return {
        skillId: "passometro.prescricoes",
        reason: "dominio_prescricoes",
      };
    }
    if (/\b(passometr|tudo|completo|lote|one.?click|extrair passometro)\b/.test(t)) {
      return { skillId: "passometro.oneclick", reason: "composite" };
    }
    return { skillId: "passometro.oneclick", reason: "default_composite" };
  }

  var ONECLICK_DOMAIN_SKILL = {
    cadastro: "passometro.cadastro",
    exames: "passometro.exames",
    cirurgias: "passometro.cirurgias",
    controles: "passometro.controles",
    prescricoes: "passometro.prescricoes",
    passometro: "passometro.oneclick",
  };

  /** FEAT-089 — hints para o LLM após nav ok (tool result). */
  var NAV_EXTRACT_HINTS = Object.freeze({
    "passometro.nav.pol": {
      nextSkill: "passometro.exames",
      readyForExtract: "extractExames",
      extractSkillId: "passometro.exames",
    },
    "passometro.nav.controles": {
      nextSkill: "passometro.controles",
      readyForExtract: "extractControles",
      extractSkillId: "passometro.controles",
    },
    "passometro.nav.prescricoes": {
      nextSkill: "passometro.prescricoes",
      readyForExtract: "extractPrescricoes",
      extractSkillId: "passometro.prescricoes",
    },
  });

  function navExtractHints(navSkillId) {
    return NAV_EXTRACT_HINTS[String(navSkillId || "")] || null;
  }

  function emitOneclickDomainEvents(batch, reportEvent) {
    if (!batch || !Array.isArray(batch.results)) return;
    for (var ri = 0; ri < batch.results.length; ri++) {
      var row = batch.results[ri];
      var doms = row && row.domains;
      if (!doms) continue;
      for (var name in doms) {
        if (!Object.prototype.hasOwnProperty.call(doms, name)) continue;
        var st = doms[name];
        var status = st && st.status;
        var domainOk = status === "ok" || status === "skipped";
        var errMsg = (st && st.error) || "";
        reportEvent({
          skillId: ONECLICK_DOMAIN_SKILL[name] || "passometro.oneclick",
          domain: name === "passometro" ? "composite" : name,
          phase: "extract",
          ok: domainOk,
          errorCode: domainOk
            ? undefined
            : (errorCodesApi &&
                errorCodesApi.classifyErrorMessage &&
                errorCodesApi.classifyErrorMessage(errMsg)) ||
              "extract_failed",
        });
      }
    }
  }

  /**
   * Dispatch para deps injetáveis (popup). Edge nunca chama isto.
   * @param {string} skillIdOrTool
   * @param {object} args
   * @param {object} deps
   */
  async function executeSkill(skillIdOrTool, args, deps) {
    deps = deps || {};
    var skill =
      getSkillById(skillIdOrTool) || getSkillByToolName(skillIdOrTool);
    if (!skill) {
      return {
        ok: false,
        error: "Skill desconhecida.",
        errorCode: "unknown_skill",
      };
    }
    var validated = skill.validate(args);
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.error,
        errorCode: "invalid_args",
      };
    }
    var value = validated.value;
    var period =
      periodApi && periodApi.resolvePeriodShortcut
        ? periodApi.resolvePeriodShortcut(value.periodo)
        : { kind: value.periodo };

    var onProgress =
      typeof deps.onProgress === "function" ? deps.onProgress : function () {};
    var reportEvent =
      typeof deps.reportEvent === "function"
        ? deps.reportEvent
        : function () {};
    var runState = deps.runState;

    if (skill.skillId === "passometro.oneclick") {
      if (typeof deps.runOneClick !== "function") {
        return {
          ok: false,
          error: "Executor oneclick indisponível.",
          errorCode: "extract_failed",
        };
      }
      var started = Date.now();
      reportEvent({
        skillId: skill.skillId,
        domain: "composite",
        phase: "extract",
        ok: true,
      });
      var batch = await deps.runOneClick({
        prontuarios: value.prontuarios,
        periodo: value.periodo,
        period: period,
        onProgress: onProgress,
        signal: deps.signal,
      });
      emitOneclickDomainEvents(batch, reportEvent);
      var batchAborted = !!(batch && batch.aborted);
      reportEvent({
        skillId: skill.skillId,
        domain: "composite",
        phase: "extract",
        ok: !!(batch && batch.ok),
        ms: Date.now() - started,
        errorCode:
          batch && batch.ok
            ? undefined
            : batchAborted
              ? "batch_aborted"
              : (errorCodesApi &&
                  errorCodesApi.classifyErrorMessage &&
                  errorCodesApi.classifyErrorMessage(
                    (batch && batch.error) || ""
                  )) ||
                "extract_failed",
      });
      return sanitizeSkillResult(batch, skill);
    }

    if (skill.kind === "nav") {
      var nav = deps.nav || {};
      var navFn;
      if (skill.skillId === "passometro.nav.pol") {
        navFn =
          typeof nav.openPol === "function"
            ? nav.openPol
            : deps.openPol;
      } else if (skill.skillId === "passometro.nav.controles") {
        navFn =
          typeof nav.openControles === "function"
            ? nav.openControles
            : deps.openControles;
      } else if (skill.skillId === "passometro.nav.prescricoes") {
        navFn =
          typeof nav.openPrescricoes === "function"
            ? nav.openPrescricoes
            : deps.openPrescricoes;
      }
      if (typeof navFn !== "function") {
        return {
          ok: false,
          error: "Executor nav indisponível.",
          errorCode: "nav_timeout",
        };
      }
      if (
        runStateApi &&
        typeof runStateApi.isNavRetryBlocked === "function" &&
        runState
      ) {
        var blocked = runStateApi.isNavRetryBlocked(
          runState,
          skill.skillId,
          value.prontuarios
        );
        if (!blocked.ok) {
          return sanitizeSkillResult(
            {
              ok: false,
              error: "Nav falhou repetidamente — peça ajuda humana.",
              errorCode: blocked.errorCode,
              prontuarioKey: blocked.prontuarioKey,
            },
            skill
          );
        }
      }
      var navPatients = [];
      var navAllOk = true;
      var navAborted = false;
      for (var ni = 0; ni < value.prontuarios.length; ni++) {
        if (deps.signal && deps.signal.aborted) {
          navAborted = true;
          navAllOk = false;
          break;
        }
        var nPront = value.prontuarios[ni];
        onProgress({
          type: "patient_start",
          index: ni,
          total: value.prontuarios.length,
          prontuario: nPront,
          skillId: skill.skillId,
        });
        var navHints = navExtractHints(skill.skillId);
        var alreadyReady =
          navHints &&
          runStateApi &&
          typeof runStateApi.isExtractReady === "function" &&
          runState &&
          runStateApi.isExtractReady(runState, navHints.extractSkillId, nPront);
        if (alreadyReady) {
          reportEvent({
            skillId: skill.skillId,
            domain: skill.domains[0],
            phase: "nav",
            ok: true,
            errorCode: "nav_already_ready",
          });
          navPatients.push({
            prontuarioKey: last4Digits(nPront),
            navResult: { ok: true, skipped: true },
          });
          continue;
        }
        var navT0 = Date.now();
        reportEvent({
          skillId: skill.skillId,
          domain: skill.domains[0],
          phase: "nav",
          ok: true,
        });
        var navRes;
        try {
          if (skill.skillId === "passometro.nav.pol") {
            navRes = await navFn(nPront);
          } else {
            navRes = await navFn(nPront, period);
          }
        } catch (navErr) {
          navRes = {
            ok: false,
            error: (navErr && navErr.message) || "nav failed",
          };
        }
        if (!navRes || !navRes.ok) {
          var nErrMsg = (navRes && navRes.error) || "";
          var nCode =
            (errorCodesApi &&
              errorCodesApi.classifyErrorMessage &&
              errorCodesApi.classifyErrorMessage(nErrMsg)) ||
            "nav_timeout";
          var nHint = navErrorHint(nErrMsg);
          reportEvent({
            skillId: skill.skillId,
            domain: skill.domains[0],
            phase: "nav",
            ok: false,
            errorCode: nCode,
            ms: Date.now() - navT0,
          });
          navAllOk = false;
          navPatients.push({
            prontuarioKey: last4Digits(nPront),
            navResult: {
              ok: false,
              errorCode: nCode,
              errorHint: nHint || undefined,
            },
          });
          if (
            runStateApi &&
            typeof runStateApi.markNavFailed === "function" &&
            runState
          ) {
            runStateApi.markNavFailed(runState, skill.skillId, [nPront]);
          }
          continue;
        }
        reportEvent({
          skillId: skill.skillId,
          domain: skill.domains[0],
          phase: "nav",
          ok: true,
          ms: Date.now() - navT0,
        });
        if (
          runStateApi &&
          typeof runStateApi.markNavReady === "function" &&
          runState
        ) {
          runStateApi.markNavReady(runState, skill.skillId, [nPront]);
        }
        navPatients.push({
          prontuarioKey: last4Digits(nPront),
          navResult: { ok: true },
        });
      }
      var hintsMeta = navExtractHints(skill.skillId);
      var navPayload = {
        ok: navAllOk,
        aborted: navAborted,
        kind: "nav",
        phase: "nav",
        periodo: value.periodo,
        patients: navPatients,
        error: navAborted ? "Lote interrompido (Parar)." : undefined,
        errorCode: navAborted ? "batch_aborted" : undefined,
      };
      if (navAllOk && !navAborted && hintsMeta) {
        navPayload.navComplete = true;
        navPayload.nextSkill = hintsMeta.nextSkill;
        navPayload.readyForExtract = hintsMeta.readyForExtract;
      }
      var anySkipped = false;
      var allSkipped =
        navPatients.length > 0 &&
        navPatients.every(function (p) {
          return p.navResult && p.navResult.skipped;
        });
      for (var si = 0; si < navPatients.length; si++) {
        if (navPatients[si].navResult && navPatients[si].navResult.skipped) {
          anySkipped = true;
          break;
        }
      }
      if (anySkipped) {
        navPayload.skipped = true;
      }
      if (allSkipped && navAllOk && !navAborted) {
        navPayload.errorCode = "nav_already_ready";
      }
      if (!navAllOk && !navAborted) {
        for (var nfi = 0; nfi < navPatients.length; nfi++) {
          var navPat = navPatients[nfi];
          if (navPat.navResult && navPat.navResult.ok === false) {
            navPayload.errorCode =
              navPat.navResult.errorCode || "nav_timeout";
            navPayload.error =
              navPat.navResult.errorHint ||
              navPat.navResult.errorCode ||
              "Navegação falhou.";
            break;
          }
        }
      }
      return sanitizeSkillResult(navPayload, skill);
    }

    var domainFnName = {
      "passometro.cadastro": "extractCadastro",
      "passometro.exames": "extractExames",
      "passometro.cirurgias": "extractCirurgias",
      "passometro.controles": "extractControles",
      "passometro.prescricoes": "extractPrescricao",
    }[skill.skillId];

    var extractFn =
      (deps.extract && deps.extract[domainFnName]) || deps[domainFnName];
    if (typeof extractFn !== "function") {
      return {
        ok: false,
        error: "Executor de domínio indisponível.",
        errorCode: "extract_failed",
      };
    }

    var patients = [];
    var allOk = true;
    var aborted = false;
    for (var i = 0; i < value.prontuarios.length; i++) {
      if (deps.signal && deps.signal.aborted) {
        aborted = true;
        allOk = false;
        break;
      }
      var pront = value.prontuarios[i];
      if (
        runStateApi &&
        typeof runStateApi.isExtractReady === "function" &&
        !runStateApi.isExtractReady(runState, skill.skillId, pront)
      ) {
        allOk = false;
        reportEvent({
          skillId: skill.skillId,
          domain: skill.domains[0],
          phase: "extract",
          ok: false,
          errorCode: "nav_required",
        });
        patients.push({
          prontuarioKey: last4Digits(pront),
          domainResult: {
            ok: false,
            errorCode: "nav_required",
          },
        });
        continue;
      }
      onProgress({
        type: "patient_start",
        index: i,
        total: value.prontuarios.length,
        prontuario: pront,
        skillId: skill.skillId,
      });
      var t0 = Date.now();
      reportEvent({
        skillId: skill.skillId,
        domain: skill.domains[0],
        phase: "extract",
        ok: true,
      });

      var res;
      try {
        res = await extractFn({
          prontuario: pront,
          period: period,
          periodo: value.periodo,
        });
      } catch (e) {
        res = {
          ok: false,
          error: (e && e.message) || "extract failed",
        };
      }
      var errCode =
        res && res.ok
          ? res.empty
            ? "empty_ok"
            : undefined
          : (errorCodesApi &&
              errorCodesApi.classifyErrorMessage &&
              errorCodesApi.classifyErrorMessage(
                (res && (res.error || res.errorCode)) || ""
              )) ||
            "extract_failed";
      reportEvent({
        skillId: skill.skillId,
        domain: skill.domains[0],
        phase: "extract",
        ok: !!(res && res.ok),
        empty: !!(res && res.empty),
        errorCode: errCode,
        ms: Date.now() - t0,
      });
      if (!res || !res.ok) allOk = false;
      patients.push({
        prontuarioKey: last4Digits(pront),
        domainResult: {
          ok: !!(res && res.ok),
          empty: !!(res && res.empty),
          errorCode: errCode,
        },
      });
    }

    return sanitizeSkillResult(
      {
        ok: allOk,
        aborted: aborted,
        domain: skill.domains[0],
        periodo: value.periodo,
        patients: patients,
        error: aborted ? "Lote interrompido (Parar)." : undefined,
        errorCode: aborted ? "batch_aborted" : undefined,
      },
      skill
    );
  }

  return {
    MAX_PRONTUARIOS: MAX_PRONTUARIOS,
    PERIODS: PERIODS,
    FORBIDDEN_TOOL_NAMES: FORBIDDEN_TOOL_NAMES,
    SKILLS: SKILLS,
    listSkills: listSkills,
    getSkillById: getSkillById,
    getSkillByToolName: getSkillByToolName,
    getExposedSkills: getExposedSkills,
    getToolSchemas: getToolSchemas,
    getAllowedToolNames: getAllowedToolNames,
    getAllowedSkillIds: getAllowedSkillIds,
    isToolAllowed: isToolAllowed,
    isSkillAllowed: isSkillAllowed,
    assertAllowlistFreeze: assertAllowlistFreeze,
    validateSkillArgs: validateSkillArgs,
    validateProntuariosPeriod: validateProntuariosPeriod,
    sanitizeSkillResult: sanitizeSkillResult,
    preferSkillForIntent: preferSkillForIntent,
    executeSkill: executeSkill,
    last4Digits: last4Digits,
    scrubObject: scrubObject,
  };
});
