/**
 * FEAT-072 — helpers do assistente Research (validate/merge/judge/skills).
 * Sem DOM, sem PHI decrypt.
 */
(function (root, factory) {
  "use strict";
  var pathMod = typeof require !== "undefined" ? require("path") : null;
  var fsMod = typeof require !== "undefined" ? require("fs") : null;
  var protocol =
    typeof require !== "undefined"
      ? require("./hpb-study-protocol.js")
      : root.AghuHpbStudyProtocol;
  var catalog =
    typeof require !== "undefined"
      ? require("./aghu-research-variable-catalog.js")
      : root.AghuResearchVariableCatalog;
  var api = factory(protocol, catalog, pathMod, fsMod);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuResearchStudyAssistant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  protocol,
  catalog,
  pathMod,
  fsMod
) {
  "use strict";

  var MAX_REPAIR_ATTEMPTS = 2;
  var JUDGE_RUBRIC_CODES = [
    "align_request",
    "completeness",
    "screening_ie_sense",
    "parsimony",
    "aghu_pref",
    "safety",
  ];

  var SKILL_IDS = [
    "study_design",
    "crf_schema",
    "screening_vs_ie",
    "aghu_catalog",
    "templates_packs",
    "matrix_cohort",
    "patch_merge",
    "safety_labels",
    "output_judge",
  ];

  /** L1 progressive disclosure — always-on (name + 1 frase); corpos via selectSkills. */
  var SKILL_META = {
    study_design: {
      id: "study_design",
      name: "Study design",
      description:
        "primaryGrain + grains[], população, desfecho e follow-up (multigrain quando justificado).",
    },
    crf_schema: {
      id: "crf_schema",
      name: "CRF schema",
      description:
        "Montar entityTypes/forms/fields dentro dos limites e keys válidas.",
    },
    screening_vs_ie: {
      id: "screening_vs_ie",
      name: "Screening vs I/E",
      description:
        "Separar triagem hub (aghu.*) de critérios I/E formais (formId.fieldKey).",
    },
    aghu_catalog: {
      id: "aghu_catalog",
      name: "Catálogo AGHU",
      description:
        "Preferir aghuSource.catalogKey do subset em labs/vitals/cirurgia/episódio.",
    },
    templates_packs: {
      id: "templates_packs",
      name: "Templates e packs",
      description:
        "Partir de template/pack coerente com especialidade (metadados).",
    },
    matrix_cohort: {
      id: "matrix_cohort",
      name: "Matriz / coorte",
      description:
        "1 matrixView por form; grain ∈ studyDesign.grains (herda primary se omitido).",
    },
    patch_merge: {
      id: "patch_merge",
      name: "Patch merge",
      description:
        "Merge profundo em revise/patch preservando id/code sem destruir o estudo.",
    },
    safety_labels: {
      id: "safety_labels",
      name: "Safety labels",
      description: "Proibir PHI/PII em labels, name, code e options.",
    },
    output_judge: {
      id: "output_judge",
      name: "Output judge",
      description:
        "Rubrica curta do juiz (pass/scores/codes); sem metodologia profunda.",
    },
  };

  var ALLOWED_GRAPH_NODES = [
    "gate_auth",
    "ingest_context",
    "plan_outline",
    "draft_schema",
    "validate",
    "judge_output",
    "repair",
    "clarify",
    "propose",
    "await_human",
    "escalate",
    "applied",
    "discarded",
  ];

  /** Critiques/códigos que tipicamente exigem decisão do utilizador. */
  var NEEDS_USER_TEXT_RE =
    /grain|desfecho|outcome|popula[cç][aã]o|ambig|n[aã]o\s+especif|qual\s+(o|a|grain|desfecho)|hospitaliza|epis[oó]dio|cirurgia|unidade\s+de\s+an[aá]lise|follow.?up|tempo\s+de\s+seguimento|crit[eé]rio\s+de\s+inclus|screening\s+path/i;

  var AUTO_FIX_TEXT_RE =
    /aghuSource|catalogKey|parsimon|campo\s+a\s+mais|remover\s+campo|explod|PHI|PII|label|safety|muitos\s+campos/i;

  function skillsDir() {
    if (!pathMod) return null;
    return pathMod.join(__dirname, "research-study-assistant", "skills");
  }

  function listSkillIds() {
    return SKILL_IDS.slice();
  }

  function listSkillMeta() {
    return SKILL_IDS.map(function (id) {
      return SKILL_META[id];
    }).filter(Boolean);
  }

  function buildSkillMetaPreamble() {
    var lines = ["Skills disponíveis (metadados L1 — corpos injectados só se seleccionados):"];
    var metas = listSkillMeta();
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      lines.push("- " + m.id + " (" + m.name + "): " + m.description);
    }
    return lines.join("\n");
  }

  function loadSkillSheet(skillId) {
    var id = String(skillId || "").replace(/^skill\./, "");
    if (SKILL_IDS.indexOf(id) === -1) return null;
    var dir = skillsDir();
    if (!dir || !fsMod) return null;
    var file = pathMod.join(dir, id + ".md");
    try {
      return fsMod.readFileSync(file, "utf8");
    } catch (_e) {
      return null;
    }
  }

  function selectSkills(mode, hint) {
    var m = String(mode || "draft");
    var h = String(hint || "").toLowerCase();
    if (m === "plan") {
      var planOut = [
        "study_design",
        "screening_vs_ie",
        "safety_labels",
        "templates_packs",
      ];
      if (
        /lab|creatin|hemogl|vital|press|cirurg|surgery|epis[oó]dio|uti|uti\b/.test(
          h
        ) ||
        /cr\.|creatinina|sistol/.test(h)
      ) {
        planOut.push("aghu_catalog");
      }
      return planOut;
    }
    var out = ["crf_schema", "screening_vs_ie", "safety_labels", "study_design"];
    if (m === "patch" || m === "revise") {
      out.push("patch_merge");
    }
    if (
      /lab|creatin|hemogl|vital|press|cirurg|surgery|epis[oó]dio|uti|uti\b/.test(
        h
      ) ||
      /cr\.|creatinina|sistol/.test(h)
    ) {
      out.push("aghu_catalog");
    }
    if (
      /cl[ií]nica m[eé]dica|pronto.?socorro|uti|hpb|especialidade|pack/.test(h) ||
      m === "draft"
    ) {
      out.push("templates_packs");
    }
    out.push("matrix_cohort");
    var uniq = [];
    for (var i = 0; i < out.length; i++) {
      if (uniq.indexOf(out[i]) === -1) uniq.push(out[i]);
    }
    return uniq;
  }

  function buildSkillGrounding(skillIds) {
    var ids = Array.isArray(skillIds) ? skillIds : [];
    var parts = [];
    for (var i = 0; i < ids.length; i++) {
      var sheet = loadSkillSheet(ids[i]);
      if (sheet) parts.push(sheet.trim());
    }
    return parts.join("\n\n---\n\n");
  }

  function catalogGroundingSubset(hint, limit) {
    var q = String(hint || "").trim();
    var defaultLim = q ? 8 : 4;
    var lim =
      typeof limit === "number" && limit > 0 ? limit : defaultLim;
    var rows =
      catalog && typeof catalog.filterCatalog === "function"
        ? catalog.filterCatalog({ query: q || undefined })
        : catalog && typeof catalog.getCatalogVariables === "function"
          ? catalog.getCatalogVariables()
          : [];
    var list = Array.isArray(rows) ? rows.slice(0, lim) : [];
    return list.map(function (e) {
      return {
        catalogKey: e.catalogKey || e.key,
        label: e.label,
        domain: e.domain,
        group: e.group,
      };
    });
  }

  /** FEAT-081b — bump só quando shape de createInitialState muda (≠ GRAPH_REV). */
  var STATE_SCHEMA_VERSION = "1";

  /** FEAT-082 H2 — limiar de contexto (~chars; ≈ tokens×4) antes de compactar. */
  var MAX_MESSAGES = 20;
  var MAX_MESSAGE_CHARS = 8000;
  var COMPACTION_CHARS_THRESHOLD = 24000;
  var COMPACTION_KEEP_MESSAGES = 8;

  /**
   * FEAT-081a / RSA-AC-E2-01 — apply HITL só se status===proposed.
   * @param {unknown} runStatus
   * @returns {{ ok: true } | { ok: false, code: 'run_not_proposed', status: 409 }}
   */
  function assertHitlApplyAllowed(runStatus) {
    if (String(runStatus || "") === "proposed") return { ok: true };
    return { ok: false, code: "run_not_proposed", status: 409 };
  }

  /**
   * FEAT-082 H2 — compacta histórico quando soma de chars excede limiar:
   * mantém só as últimas N msgs; limpa grounding/tool intermediário (assistant
   * antigos truncated a 400 chars excepto os 2 últimos turns).
   * @param {{ role: string, content: string }[]} messages
   * @returns {{ role: string, content: string }[]}
   */
  function compactMessagesForContext(messages) {
    var arr = Array.isArray(messages) ? messages.slice() : [];
    var total = 0;
    for (var i = 0; i < arr.length; i++) {
      total += String((arr[i] && arr[i].content) || "").length;
    }
    if (total <= COMPACTION_CHARS_THRESHOLD && arr.length <= MAX_MESSAGES) {
      return arr;
    }
    var kept = arr.slice(-COMPACTION_KEEP_MESSAGES);
    var cleared = [];
    for (var j = 0; j < kept.length; j++) {
      var m = kept[j];
      var isRecent = j >= kept.length - 2;
      if (m.role === "assistant" && !isRecent && m.content.length > 400) {
        cleared.push({
          role: "assistant",
          content: m.content.slice(0, 400) + "…[compacted]",
        });
      } else {
        cleared.push(m);
      }
    }
    return cleared;
  }

  function sanitizeMessages(messages) {
    var arr = Array.isArray(messages) ? messages : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i] || {};
      var role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
      if (!role) continue;
      var content = String(m.content || "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, MAX_MESSAGE_CHARS);
      if (!content) continue;
      out.push({ role: role, content: content });
    }
    out = out.slice(-MAX_MESSAGES);
    return compactMessagesForContext(out);
  }

  function lastUserContent(messages) {
    var arr = sanitizeMessages(messages);
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i].role === "user") return arr[i].content;
    }
    return "";
  }

  function deepMerge(base, patch) {
    if (patch == null) return base;
    if (Array.isArray(patch)) return patch.slice();
    if (typeof patch !== "object") return patch;
    var out =
      base && typeof base === "object" && !Array.isArray(base)
        ? Object.assign({}, base)
        : {};
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var pv = patch[k];
      var bv = out[k];
      if (
        pv &&
        typeof pv === "object" &&
        !Array.isArray(pv) &&
        bv &&
        typeof bv === "object" &&
        !Array.isArray(bv)
      ) {
        out[k] = deepMerge(bv, pv);
      } else {
        out[k] = Array.isArray(pv) ? pv.slice() : pv;
      }
    }
    return out;
  }

  function mergeProposal(mode, currentProtocol, proposal) {
    var prop = proposal && typeof proposal === "object" ? proposal : {};
    var cur =
      currentProtocol && typeof currentProtocol === "object"
        ? currentProtocol
        : null;
    var m = String(mode || "draft");
    if (m === "patch" || m === "revise") {
      if (!cur) {
        return Object.assign({}, prop, { domainType: "custom" });
      }
      var merged = deepMerge(cur, prop);
      if (cur.id) merged.id = cur.id;
      if (cur.code && !prop.code) merged.code = cur.code;
      merged.domainType = "custom";
      return merged;
    }
    var draft = Object.assign({}, prop, { domainType: "custom" });
    if (cur && cur.id && !draft.id) draft.id = cur.id;
    return draft;
  }

  function preferAghuSourceForLabFields(proposal) {
    if (!proposal || typeof proposal !== "object") return proposal;
    var forms = Array.isArray(proposal.forms) ? proposal.forms : [];
    var changed = false;
    var nextForms = forms.map(function (form) {
      var fields = Array.isArray(form.fields) ? form.fields : [];
      var nextFields = fields.map(function (f) {
        if (!f || typeof f !== "object") return f;
        if (f.aghuSource && f.aghuSource.catalogKey) return f;
        var keyHint = String(f.key || "") + " " + String(f.label || "");
        if (
          !/creat|ureia|hb|hemogl|sistol|diast|fc|spo2|lab|lactat|bilirr|inr|cirurg|surgery|procedimento|admission|discharge|admiss|alta|sexo|sex|idade|age_at|passometro/i.test(
            keyHint
          )
        ) {
          return f;
        }
        var catalogKey = resolveAghuCatalogKeyFromHint(keyHint);
        if (!catalogKey) return f;
        changed = true;
        return Object.assign({}, f, {
          aghuSource: {
            catalogKey: catalogKey,
            mode: "autofill",
          },
        });
      });
      return Object.assign({}, form, { fields: nextFields });
    });
    if (!changed) return proposal;
    return Object.assign({}, proposal, { forms: nextForms });
  }

  var AGHU_FIELD_ALIAS_TO_CATALOG = [
    { re: /creatinine|creatinina|\bcr\b/i, catalogKey: "creatinina", query: "creat" },
    { re: /lactate|lactato/i, catalogKey: "lactato", query: "lactat" },
    { re: /hemoglobin|hemoglobina|\bhb\b/i, catalogKey: "hemoglobina", query: "hemogl" },
    { re: /\bureia\b|\burea\b/i, catalogKey: "ureia", query: "ureia" },
    { re: /bilirrubina|bilirubin/i, catalogKey: "bilirrubina_total", query: "bilirr" },
    { re: /\binr\b/i, catalogKey: "inr", query: "inr" },
    { re: /heart_rate|\bfc\b|freq(?:u[eê]ncia)?\s*card/i, catalogKey: "fc", query: "fc" },
    { re: /systolic_bp|pa_sistolica|sist[oó]lic/i, catalogKey: "pa_sistolica", query: "sistol" },
    { re: /diastolic_bp|pa_diastolica|diast[oó]lic/i, catalogKey: "pa_diastolica", query: "diast" },
    { re: /sat_o2|spo2|satura/i, catalogKey: "sat_o2", query: "spo2" },
    {
      re: /surgery_date|data_cirurgia|passometro_surgery\.date/i,
      catalogKey: "passometro_surgery.date",
      query: "passometro.surgery.date",
    },
    {
      re: /procedimento|surgery_procedure|passometro_surgery\.procedure/i,
      catalogKey: "passometro_surgery.procedure",
      query: "passometro.surgery.procedure",
    },
    {
      re: /admission|admiss[aã]o|clinical_episode\.admission/i,
      catalogKey: "clinical_episode.admission_date",
      query: "clinical_episode.started",
    },
    {
      re: /discharge|alta|clinical_episode\.discharge/i,
      catalogKey: "clinical_episode.discharge_date",
      query: "clinical_episode",
    },
    { re: /\bsex\b|\bsexo\b/i, catalogKey: "sexo", query: "sexo" },
    {
      re: /age_at_event|age_at_surgery|idade/i,
      catalogKey: "age_at_surgery",
      query: "age_at_surgery",
    },
  ];

  var AGHU_EDGE_TO_FULL_CATALOG = {
    creatinina: "hpb.preop.creatinine",
    bilirrubina_total: "hpb.preop.bilirubin",
    inr: "hpb.preop.inr",
    "passometro_surgery.procedure": "passometro.surgery.procedure",
    "passometro_surgery.date": "passometro.surgery.date",
    "clinical_episode.admission_date": "clinical_episode.started_at",
    sexo: "sex",
    age_at_surgery: "age_at_surgery",
  };

  function resolveAghuCatalogKeyFromHint(keyHint) {
    var hint = String(keyHint || "").trim();
    if (!hint) return null;
    var i;
    var row;
    var mapped;
    var hits;
    for (i = 0; i < AGHU_FIELD_ALIAS_TO_CATALOG.length; i++) {
      row = AGHU_FIELD_ALIAS_TO_CATALOG[i];
      if (!row.re.test(hint)) continue;
      if (catalog && catalog.catalogKeyExists && catalog.catalogKeyExists(row.catalogKey)) {
        return row.catalogKey;
      }
      mapped = AGHU_EDGE_TO_FULL_CATALOG[row.catalogKey];
      if (mapped && catalog && catalog.catalogKeyExists && catalog.catalogKeyExists(mapped)) {
        return mapped;
      }
      if (catalog && typeof catalog.filterCatalog === "function") {
        hits = catalog.filterCatalog({ query: row.query || row.catalogKey });
        if (hits && hits.length) return hits[0].catalogKey;
      }
    }
    if (!catalog || typeof catalog.filterCatalog !== "function") return null;
    hits = catalog.filterCatalog({
      query: String(hint).replace(/_/g, " "),
    });
    if ((!hits || !hits.length) && /creat/i.test(hint)) {
      hits = catalog.filterCatalog({ query: "creat" });
    }
    if (!hits || !hits.length) return null;
    return hits[0].catalogKey;
  }

  function studyPlanTextBlob(studyPlan) {
    if (!studyPlan || typeof studyPlan !== "object") return "";
    var planned = Array.isArray(studyPlan.plannedForms)
      ? studyPlan.plannedForms
          .map(function (f) {
            return String((f && f.label) || "") + " " + String((f && f.purpose) || "");
          })
          .join(" ")
      : "";
    return [
      studyPlan.objectives,
      studyPlan.population,
      studyPlan.primaryOutcomeOperational,
      studyPlan.screeningNatural,
      studyPlan.inclusionExclusionNatural,
      planned,
    ]
      .map(function (x) {
        return String(x || "");
      })
      .join(" ")
      .toLowerCase();
  }

  function purposeMentionsLabsOrSurgery(text) {
    return /creat|\bcr\b|lab|lactat|bilirr|hemogl|\bhb\b|\bfc\b|sistol|cirurg|surgery|procedimento|hep[aá]t|hpb|diurese|inr|admiss|epis[oó]d|intern/i.test(
      String(text || "")
    );
  }

  function fieldWithAghuSource(field, preferredKey) {
    var key =
      preferredKey ||
      resolveAghuCatalogKeyFromHint(
        String(field.key || "") + " " + String(field.label || "")
      );
    if (!key) return field;
    if (catalog && catalog.catalogKeyExists && !catalog.catalogKeyExists(key)) {
      var mapped = AGHU_EDGE_TO_FULL_CATALOG[key];
      if (mapped && catalog.catalogKeyExists(mapped)) key = mapped;
      else {
        var hits =
          typeof catalog.filterCatalog === "function"
            ? catalog.filterCatalog({ query: key.replace(/[._]/g, " ") })
            : [];
        if (!hits || !hits.length) return field;
        key = hits[0].catalogKey;
      }
    }
    return Object.assign({}, field, {
      aghuSource: { catalogKey: key, mode: "autofill" },
    });
  }

  function defaultHepaticSurgeryFields() {
    return [
      fieldWithAghuSource(
        {
          key: "procedimento",
          label: "Procedimento cirúrgico",
          type: "text",
          analyticsRole: "indicator",
        },
        "passometro_surgery.procedure"
      ),
      fieldWithAghuSource(
        {
          key: "surgery_date",
          label: "Data da cirurgia",
          type: "date",
          analyticsRole: "indicator",
        },
        "passometro_surgery.date"
      ),
      fieldWithAghuSource(
        {
          key: "creatinina",
          label: "Creatinina",
          type: "number",
          analyticsRole: "indicator",
        },
        "creatinina"
      ),
      fieldWithAghuSource(
        {
          key: "bilirrubina",
          label: "Bilirrubina total",
          type: "number",
          analyticsRole: "indicator",
        },
        "bilirrubina_total"
      ),
      fieldWithAghuSource(
        {
          key: "fc",
          label: "Frequência cardíaca",
          type: "number",
          analyticsRole: "indicator",
        },
        "fc"
      ),
    ];
  }

  function screeningCriteriaFromPlan(studyPlan) {
    var blob = studyPlanTextBlob(studyPlan);
    if (!String(blob || "").trim()) return [];
    var out = [];
    var seen = {};
    function push(field) {
      if (seen[field]) return;
      seen[field] = true;
      out.push({ field: field, op: "isNotEmpty" });
    }
    if (/cirurg|hep[aá]t|procedimento|surgery|hpb/.test(blob)) {
      push("aghu.cirurgia.procedure");
    }
    if (/epis[oó]d|internamento|admission|clinical_episode|intern/.test(blob)) {
      push("aghu.clinical_episode.status");
    }
    if (/creat|\bcr\b/.test(blob)) {
      push("aghu.exam.Cr");
    }
    if (/\bsexo\b|\bsex\b/.test(blob)) {
      push("aghu.pii.sexo");
    }
    return out;
  }

  function mergeScreeningFromPlan(proposal, studyPlan) {
    var fromPlan = screeningCriteriaFromPlan(studyPlan);
    if (!fromPlan.length) return proposal;
    var cur = Array.isArray(proposal.screeningInclusion)
      ? proposal.screeningInclusion
      : [];
    var usable = [];
    for (var i = 0; i < cur.length; i++) {
      var field = String((cur[i] && cur[i].field) || "").trim();
      if (field.indexOf("aghu.") === 0) usable.push(cur[i]);
    }
    if (!usable.length) {
      return Object.assign({}, proposal, { screeningInclusion: fromPlan });
    }
    var seen = {};
    var merged = usable.slice();
    for (var u = 0; u < usable.length; u++) {
      seen[String(usable[u].field)] = true;
    }
    for (var j = 0; j < fromPlan.length; j++) {
      if (seen[fromPlan[j].field]) continue;
      seen[fromPlan[j].field] = true;
      merged.push(fromPlan[j]);
    }
    return Object.assign({}, proposal, { screeningInclusion: merged });
  }

  function isPartialAffirmWithAghuIntent(msg) {
    var t = String(msg || "").toLowerCase();
    if (!/\bsim\b/.test(t)) return false;
    return /aghu|vari[aá]ve(?:l|is)|cat[aá]log|n[aã]o\s+manual/.test(t);
  }

  function applyStudyPlanGrainsToProposal(proposal, studyPlan) {
    if (!proposal || typeof proposal !== "object") return proposal;
    var plan = studyPlan && typeof studyPlan === "object" ? studyPlan : null;
    if (!plan) return proposal;
    var planGrains = Array.isArray(plan.grains) ? plan.grains : [];
    if (planGrains.length < 2) return proposal;
    var primary = String(plan.primaryGrain || plan.grain || planGrains[0] || "")
      .trim();
    var grains = [];
    var seen = {};
    function pushG(g) {
      var s = String(g || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      grains.push(s);
    }
    pushG(primary);
    for (var i = 0; i < planGrains.length; i++) pushG(planGrains[i]);
    if (grains.length < 2) return proposal;
    var sd =
      proposal.studyDesign && typeof proposal.studyDesign === "object"
        ? Object.assign({}, proposal.studyDesign)
        : {};
    sd.primaryGrain = grains[0];
    sd.cohortGrain = grains[0];
    sd.grains = grains;
    sd.cohortGrains = grains;
    return Object.assign({}, proposal, { studyDesign: sd });
  }

  function validateProposal(rawProposal) {
    if (!protocol || typeof protocol.addProtocol !== "function") {
      return { ok: false, errors: ["protocol_module_missing"], protocol: null };
    }
    var input = Object.assign({}, rawProposal || {}, { domainType: "custom" });
    var keepId = input.id ? String(input.id) : "";
    var keepCode = input.code != null ? String(input.code) : null;
    // addProtocol gera id novo; usamos como oráculo de normalize+validate
    var doc = protocol.emptyDocument();
    var result = protocol.addProtocol(doc, input);
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors || [result.error || "invalid_protocol_proposal"],
        protocol: null,
      };
    }
    var normalized = result.protocol;
    if (keepId) normalized.id = keepId;
    if (keepCode != null && keepCode !== "") normalized.code = keepCode;
    if (normalized.domainType !== "custom") {
      normalized.domainType = "custom";
    }
    // Extra: catalogKey known when present
    var forms = Array.isArray(normalized.forms) ? normalized.forms : [];
    for (var i = 0; i < forms.length; i++) {
      var fields = Array.isArray(forms[i].fields) ? forms[i].fields : [];
      for (var j = 0; j < fields.length; j++) {
        var src = fields[j] && fields[j].aghuSource;
        if (src && src.catalogKey && catalog && catalog.catalogKeyExists) {
          if (!catalog.catalogKeyExists(src.catalogKey)) {
            return {
              ok: false,
              errors: ["unknown_catalog_key:" + src.catalogKey],
              protocol: null,
            };
          }
        }
      }
    }
    return { ok: true, errors: [], protocol: normalized };
  }

  function parseJudgeVerdict(raw) {
    var obj = raw;
    if (typeof raw === "string") {
      try {
        obj = JSON.parse(raw);
      } catch (_e) {
        return { ok: false, error: "judge_parse_error" };
      }
    }
    if (!obj || typeof obj !== "object") {
      return { ok: false, error: "judge_parse_error" };
    }
    var scores = {};
    var rawScores = obj.scores && typeof obj.scores === "object" ? obj.scores : {};
    for (var i = 0; i < JUDGE_RUBRIC_CODES.length; i++) {
      var code = JUDGE_RUBRIC_CODES[i];
      var n = Number(rawScores[code]);
      scores[code] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }
    var critiques = Array.isArray(obj.critiques)
      ? obj.critiques
          .map(function (c) {
            return String(c || "")
              .trim()
              .slice(0, 240);
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    var codes = Array.isArray(obj.codes)
      ? obj.codes
          .map(function (c) {
            return String(c || "");
          })
          .filter(function (c) {
            return JUDGE_RUBRIC_CODES.indexOf(c) !== -1;
          })
      : [];
    var pass = obj.pass === true;
    // Veredito inconsistente: scores altos + codes vazio → pass (ignorar pass:false)
    var allHigh = true;
    for (var s = 0; s < JUDGE_RUBRIC_CODES.length; s++) {
      if (scores[JUDGE_RUBRIC_CODES[s]] < 0.8) {
        allHigh = false;
        break;
      }
    }
    if (!pass && allHigh && codes.length === 0) {
      pass = true;
      critiques = [];
    }
    return {
      ok: true,
      verdict: {
        pass: pass,
        scores: scores,
        critiques: critiques,
        codes: codes,
      },
    };
  }

  function critiqueNeedsUser(text, code) {
    var t = String(text || "");
    var c = String(code || "");
    if (AUTO_FIX_TEXT_RE.test(t)) return false;
    if (NEEDS_USER_TEXT_RE.test(t)) return true;
    if (c === "parsimony" || c === "aghu_pref" || c === "safety") return false;
    if (
      c === "align_request" ||
      c === "completeness" ||
      c === "screening_ie_sense"
    ) {
      return true;
    }
    return false;
  }

  /**
   * Classifica critiques do judge: auto_fixable (repair) vs needs_user (clarify).
   * @returns {{ kind: "auto_fixable"|"needs_user", autoFixable: string[], needsUser: string[], codes: string[], clarifyingQuestions: string[] }}
   */
  function classifyJudgeCritiques(critiques, codes) {
    var critArr = Array.isArray(critiques) ? critiques : [];
    var codeArr = Array.isArray(codes)
      ? codes.filter(function (c) {
          return JUDGE_RUBRIC_CODES.indexOf(c) !== -1;
        })
      : [];
    var autoFixable = [];
    var needsUser = [];
    var primaryCode = codeArr[0] || "";

    if (critArr.length === 0 && codeArr.length) {
      for (var i = 0; i < codeArr.length; i++) {
        var code = codeArr[i];
        if (critiqueNeedsUser("", code)) {
          needsUser.push(code);
        } else {
          autoFixable.push(code);
        }
      }
    } else {
      for (var j = 0; j < critArr.length; j++) {
        var text = String(critArr[j] || "").trim();
        if (!text) continue;
        var paired = codeArr[j] || primaryCode;
        if (critiqueNeedsUser(text, paired)) {
          needsUser.push(text);
        } else {
          autoFixable.push(text);
        }
      }
    }

    var kind = needsUser.length > 0 ? "needs_user" : "auto_fixable";
    return {
      kind: kind,
      autoFixable: autoFixable.slice(0, 8),
      needsUser: needsUser.slice(0, 8),
      codes: codeArr.slice(0, 8),
      clarifyingQuestions: buildClarifyingQuestions(needsUser, codeArr),
    };
  }

  /** Lista de perguntas: só strings não vazias; máx 12. */
  function normalizeQuestionList(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var q = String(raw[i] || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!q) continue;
      var key = q.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(q);
      if (out.length >= 12) break;
    }
    return out;
  }

  /** Afirmação vazia / emoji / "ok"/"sim" — não conta como resposta. */
  function isEmptyAffirmation(msg) {
    var t = String(msg || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?…]+$/g, "");
    if (!t) return true;
    if (
      /^(ok|okay|okey|sim|yes|yep|yeah|claro|certo|beleza|blz|valeu|obrigad[oa]?)$/i.test(
        t
      )
    ) {
      return true;
    }
    // sem letra/dígito → só emoji/símbolos
    if (!/[a-zà-ü0-9]/i.test(t)) return true;
    return false;
  }

  function userMessageLooksSubstantive(msg) {
    var t = String(msg || "").trim();
    if (t.length < 12) return false;
    if (isEmptyAffirmation(t)) return false;
    return true;
  }

  function normalizeCompareText(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(s) {
    var parts = normalizeCompareText(s).split(" ");
    var set = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].length >= 2) set[parts[i]] = true;
    }
    return set;
  }

  function jaccardTokenOverlap(a, b) {
    var sa = tokenSet(a);
    var sb = tokenSet(b);
    var keysA = Object.keys(sa);
    var keysB = Object.keys(sb);
    if (!keysA.length || !keysB.length) return 0;
    var inter = 0;
    for (var i = 0; i < keysA.length; i++) {
      if (sb[keysA[i]]) inter++;
    }
    var union = keysA.length + keysB.length - inter;
    return union ? inter / union : 0;
  }

  /**
   * Remove eco de mensagens do user em clarifyingQuestions do LLM (fail-closed).
   * @param {{ fromLlm?: unknown, lastUserMessage?: string, recentUserMessages?: unknown }} opts
   * @returns {string[]}
   */
  function filterAssistantClarifyingQuestions(opts) {
    opts = opts || {};
    var fromLlm = normalizeQuestionList(opts.fromLlm);
    var userTexts = [];
    if (opts.lastUserMessage) userTexts.push(String(opts.lastUserMessage));
    var recent = Array.isArray(opts.recentUserMessages)
      ? opts.recentUserMessages
      : [];
    for (var r = 0; r < recent.length; r++) {
      if (recent[r]) userTexts.push(String(recent[r]));
    }
    if (!userTexts.length) return fromLlm;

    var norms = [];
    for (var u = 0; u < userTexts.length; u++) {
      var n = normalizeCompareText(userTexts[u]);
      if (n) norms.push(n);
    }
    if (!norms.length) return fromLlm;

    var kept = [];
    for (var i = 0; i < fromLlm.length; i++) {
      var q = fromLlm[i];
      var nq = normalizeCompareText(q);
      if (!nq) continue;
      var echo = false;
      for (var j = 0; j < norms.length; j++) {
        var um = norms[j];
        if (um === nq || um.indexOf(nq) !== -1 || nq.indexOf(um) !== -1) {
          echo = true;
          break;
        }
        if (jaccardTokenOverlap(nq, um) >= 0.55) {
          echo = true;
          break;
        }
      }
      if (!echo) kept.push(q);
    }
    return kept;
  }

  function recentUserMessageContents(messages, limit) {
    var arr = sanitizeMessages(messages);
    var lim = typeof limit === "number" && limit > 0 ? limit : 5;
    var out = [];
    for (var i = arr.length - 1; i >= 0 && out.length < lim; i--) {
      if (arr[i].role === "user") out.push(arr[i].content);
    }
    return out;
  }

  var ALLOWED_COHORT_GRAINS = {
    patient: true,
    clinical_episode: true,
    surgery: true,
  };

  function grainMentionedInText(text, grain) {
    var t = normalizeCompareText(text);
    if (!t || !grain) return false;
    if (grain === "patient") {
      return (
        /\bpatient\b/.test(t) ||
        /\bpaciente\b/.test(t) ||
        /por paciente/.test(t) ||
        /unidade de analise paciente/.test(t)
      );
    }
    if (grain === "clinical_episode") {
      return (
        /clinical_episode/.test(t) ||
        /\bepisodio\b/.test(t) ||
        /\bepisode\b/.test(t) ||
        /internacao/.test(t)
      );
    }
    if (grain === "surgery") {
      return /\bsurgery\b/.test(t) || /cirurg/.test(t);
    }
    return false;
  }

  /**
   * Zera primaryGrain/grains inventados pelo LLM sem evidência no plano anterior ou msgs user.
   * @param {{ plan?: object|null, previousPlan?: object|null, messages?: unknown }} opts
   * @returns {object|null}
   */
  function sanitizeStudyPlanGrain(opts) {
    opts = opts || {};
    var plan = opts.plan;
    if (!plan || typeof plan !== "object") return plan || null;
    var out = Object.assign({}, plan);
    var primary = String(out.primaryGrain || out.grain || "").trim();
    if (!primary) {
      out.grain = "";
      out.primaryGrain = "";
      out.grains = [];
      out.complete = false;
      return out;
    }
    if (!ALLOWED_COHORT_GRAINS[primary]) {
      out.grain = "";
      out.primaryGrain = "";
      out.grains = [];
      out.complete = false;
      return out;
    }
    var prev = opts.previousPlan;
    var prevPrimary =
      prev && typeof prev === "object"
        ? String(prev.primaryGrain || prev.grain || "").trim()
        : "";
    var texts = recentUserMessageContents(opts.messages, 8);
    if (prevPrimary !== primary) {
      var evidenced = false;
      for (var i = 0; i < texts.length; i++) {
        if (grainMentionedInText(texts[i], primary)) {
          evidenced = true;
          break;
        }
      }
      if (!evidenced) {
        out.grain = "";
        out.primaryGrain = "";
        out.grains = [];
        out.complete = false;
        return out;
      }
    }
    var prevGrains =
      prev && Array.isArray(prev.grains)
        ? prev.grains
        : prevPrimary
          ? [prevPrimary]
          : [];
    var rawGrains = Array.isArray(out.grains) ? out.grains : [];
    var kept = [];
    var seen = Object.create(null);
    function push(g) {
      if (!ALLOWED_COHORT_GRAINS[g] || seen[g]) return;
      seen[g] = true;
      kept.push(g);
    }
    push(primary);
    for (var j = 0; j < rawGrains.length; j++) {
      var ng = String(rawGrains[j] || "").trim();
      if (!ng || ng === primary) continue;
      if (prevGrains.indexOf(ng) !== -1) {
        push(ng);
        continue;
      }
      for (var t = 0; t < texts.length; t++) {
        if (grainMentionedInText(texts[t], ng)) {
          push(ng);
          break;
        }
      }
    }
    out.primaryGrain = primary;
    out.grain = primary;
    out.grains = kept;
    return out;
  }

  /** FEAT-085 — pergunta de confirmação do pack CRF (FEAT-084). */
  function isPackConfirmQuestion(q) {
    return /confirma\s+o\s+pack\s+crf/i.test(String(q || ""));
  }

  /**
   * FEAT-087 — classifica o *texto da pergunta* → campo do studyPlan.
   * Não classifica a resposta do user.
   * @param {string} question
   * @returns {string|null}
   */
  function questionTopicToPlanField(question) {
    var q = String(question || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!q.trim()) return null;
    if (/confirma\s+o\s+pack\s+crf/.test(q)) return null;
    if (/\bgrain\b|unidade de analise|primarygrain|grains\b/.test(q)) {
      return "grain";
    }
    if (/desfecho|outcome|primaryoutcome/.test(q)) {
      return "primaryOutcomeOperational";
    }
    if (/popula|coorte|quem entra/.test(q)) return "population";
    if (/objetivo|objectives/.test(q)) return "objectives";
    if (/formulari|plannedforms|\bcrf\b|forms planej/.test(q)) {
      return "plannedForms";
    }
    if (/inclus|exclus|i\/e\b/.test(q)) return "inclusionExclusionNatural";
    if (/screening|triagem/.test(q)) return "screeningNatural";
    return null;
  }

  function studyPlanFieldIsFilled(plan, field) {
    if (!plan || typeof plan !== "object") return false;
    if (field === "plannedForms") {
      return Array.isArray(plan.plannedForms) && plan.plannedForms.length > 0;
    }
    if (field === "complete") return plan.complete === true;
    var v = plan[field];
    return typeof v === "string" && v.trim().length > 0;
  }

  /**
   * FEAT-087 — campos string não-vazios em previous sobrevivem a vazio/omit do LLM.
   * @param {object|null|undefined} previous
   * @param {object|null|undefined} fromLlm
   * @returns {object|null}
   */
  function mergeStudyPlanFields(previous, fromLlm) {
    if (!fromLlm && !previous) return null;
    if (!fromLlm) {
      return previous && typeof previous === "object"
        ? Object.assign({}, previous)
        : null;
    }
    if (!previous || typeof previous !== "object") {
      return Object.assign({}, fromLlm);
    }

    function str(next, prev) {
      var n = String(next || "").trim();
      if (n) return n;
      return String(prev || "").trim();
    }

    var plannedForms =
      Array.isArray(fromLlm.plannedForms) && fromLlm.plannedForms.length > 0
        ? fromLlm.plannedForms
        : Array.isArray(previous.plannedForms)
          ? previous.plannedForms
          : [];

    var primary = str(
      fromLlm.primaryGrain || fromLlm.grain,
      previous.primaryGrain || previous.grain
    );
    var grains =
      Array.isArray(fromLlm.grains) && fromLlm.grains.length > 0
        ? fromLlm.grains.map(function (g) {
            return String(g || "").trim();
          }).filter(Boolean)
        : Array.isArray(previous.grains) && previous.grains.length > 0
          ? previous.grains.slice()
          : primary
            ? [primary]
            : [];
    if (primary && grains.indexOf(primary) === -1) {
      grains = [primary].concat(grains);
    }

    return {
      objectives: str(fromLlm.objectives, previous.objectives),
      grain: primary,
      primaryGrain: primary,
      grains: grains,
      population: str(fromLlm.population, previous.population),
      primaryOutcomeOperational: str(
        fromLlm.primaryOutcomeOperational,
        previous.primaryOutcomeOperational
      ),
      screeningNatural: str(fromLlm.screeningNatural, previous.screeningNatural),
      inclusionExclusionNatural: str(
        fromLlm.inclusionExclusionNatural,
        previous.inclusionExclusionNatural
      ),
      plannedForms: plannedForms,
      complete:
        typeof fromLlm.complete === "boolean"
          ? fromLlm.complete
          : previous.complete === true,
    };
  }

  /**
   * Fail-closed: mantém pending até evidência de resposta.
   * Só remove de previous o que está em answeredPending E mensagem user substantiva.
   * Exceção FEAT-085: afirmação curta («sim») dropar confirmação de pack CRF.
   * FEAT-087: não reabre pergunta cujo campo no studyPlan já está preenchido
   * (classifica o tópico da *pergunta*, não da resposta do user).
   * União com fromLlm já filtrado (sem eco da msg user).
   * @param {{ previous?: unknown, fromLlm?: unknown, answeredPending?: unknown, lastUserMessage?: string, recentUserMessages?: unknown, messages?: unknown, studyPlan?: object|null }} opts
   * @returns {string[]}
   */
  function mergePendingQuestions(opts) {
    opts = opts || {};
    var previous = normalizeQuestionList(opts.previous);
    var recent =
      opts.recentUserMessages != null
        ? opts.recentUserMessages
        : opts.messages
          ? recentUserMessageContents(opts.messages, 5)
          : [];
    var fromLlm = filterAssistantClarifyingQuestions({
      fromLlm: opts.fromLlm,
      lastUserMessage: opts.lastUserMessage,
      recentUserMessages: recent,
    });
    var answeredPending = normalizeQuestionList(opts.answeredPending);
    var lastUser = String(opts.lastUserMessage || "");
    var canDrop = userMessageLooksSubstantive(lastUser);
    var canDropPackConfirm = isEmptyAffirmation(lastUser);
    var plan = opts.studyPlan;

    function topicAlreadyFilled(q) {
      var field = questionTopicToPlanField(q);
      if (!field) return false;
      return studyPlanFieldIsFilled(plan, field);
    }

    var still = [];
    for (var i = 0; i < previous.length; i++) {
      var q = previous[i];
      if (canDropPackConfirm && isPackConfirmQuestion(q)) continue;
      if (topicAlreadyFilled(q)) continue;
      var answered =
        canDrop &&
        answeredPending.some(function (a) {
          return a.toLowerCase() === q.toLowerCase();
        });
      if (!answered) still.push(q);
    }

    var seen = {};
    var out = [];
    function pushUnique(list) {
      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        if (canDropPackConfirm && isPackConfirmQuestion(item)) continue;
        if (topicAlreadyFilled(item)) continue;
        var key = item.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        out.push(item);
      }
    }
    pushUnique(still);
    pushUnique(fromLlm);
    return out.slice(0, 12);
  }

  function buildClarifyingQuestions(needsUserCritiques, codes) {
    var questions = [];
    var blob = (Array.isArray(needsUserCritiques) ? needsUserCritiques : [])
      .concat(Array.isArray(codes) ? codes : [])
      .join(" ")
      .toLowerCase();

    if (/grain|epis[oó]dio|cirurgia|unidade/.test(blob) || codes.indexOf("align_request") !== -1) {
      questions.push(
        "Qual a unidade de análise (grain)? paciente, episódio clínico ou cirurgia?"
      );
    }
    if (/desfecho|outcome|hospitaliza|creatin/.test(blob) || codes.indexOf("completeness") !== -1) {
      questions.push(
        "Qual o desfecho operacional? (ex.: hospitalização, creatinina, ambos — e em quanto tempo?)"
      );
    }
    if (/popula|inclus|exclus|screening/.test(blob) || codes.indexOf("screening_ie_sense") !== -1) {
      questions.push(
        "Quem entra na coorte? Indique critérios de inclusão/exclusão ou paths de screening AGHU."
      );
    }
    if (!questions.length) {
      questions.push(
        "Pode esclarecer o que falta no pedido (grain, desfecho, população) para eu completar o rascunho?"
      );
    }
    // dedupe
    var uniq = [];
    for (var i = 0; i < questions.length; i++) {
      if (uniq.indexOf(questions[i]) === -1) uniq.push(questions[i]);
    }
    return uniq.slice(0, 5);
  }

  function slugifyPackFormId(label, index) {
    var s = String(label || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32);
    if (!s || !/^[a-z]/.test(s)) s = "form_" + (index + 1);
    return s;
  }

  function fieldsFromPackPurpose(purpose, studyPlan) {
    var p = String(purpose || "").toLowerCase();
    var planBlob = studyPlanTextBlob(studyPlan);
    var fields = [];
    if (/creat|\bcr\b/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "creatinina",
            label: "Creatinina",
            type: "number",
            analyticsRole: "indicator",
          },
          "creatinina"
        )
      );
    }
    if (/lactat/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "lactato",
            label: "Lactato",
            type: "number",
            analyticsRole: "indicator",
          },
          "lactato"
        )
      );
    }
    if (/hemogl|\bhb\b/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "hemoglobina",
            label: "Hemoglobina",
            type: "number",
            analyticsRole: "indicator",
          },
          "hemoglobina"
        )
      );
    }
    if (/bilirr/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "bilirrubina",
            label: "Bilirrubina total",
            type: "number",
            analyticsRole: "indicator",
          },
          "bilirrubina_total"
        )
      );
    }
    if (/\bfc\b|heart_rate|freq(?:u[eê]ncia)?\s*card/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "fc",
            label: "Frequência cardíaca",
            type: "number",
            analyticsRole: "indicator",
          },
          "fc"
        )
      );
    }
    if (/procedimento|surgery_procedure|cirurg/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "procedimento",
            label: "Procedimento cirúrgico",
            type: "text",
            analyticsRole: "indicator",
          },
          "passometro_surgery.procedure"
        )
      );
    }
    if (/surgery_date|data(?:\s+da)?\s*cirurgia|data_cirurgia/.test(p)) {
      fields.push(
        fieldWithAghuSource(
          {
            key: "surgery_date",
            label: "Data da cirurgia",
            type: "date",
            analyticsRole: "indicator",
          },
          "passometro_surgery.date"
        )
      );
    }
    if (/diurese/.test(p)) {
      fields.push({
        key: "diurese",
        label: "Diurese",
        type: "number",
        analyticsRole: "indicator",
      });
    }
    if (/di[aá]lise/.test(p)) {
      fields.push({
        key: "dialise",
        label: "Diálise",
        type: "boolean",
        analyticsRole: "outcome",
      });
    }
    if (/[oó]bito/.test(p)) {
      fields.push({
        key: "obito_hospitalar",
        label: "Óbito hospitalar",
        type: "boolean",
        analyticsRole: "outcome",
      });
    }
    if (/kdigo|\blra\b/.test(p)) {
      fields.push({
        key: "lra_kdigo",
        label: "LRA KDIGO",
        type: "text",
        analyticsRole: "outcome",
      });
    }
    if (!fields.length) {
      if (
        purposeMentionsLabsOrSurgery(p) ||
        purposeMentionsLabsOrSurgery(planBlob)
      ) {
        return defaultHepaticSurgeryFields();
      }
      fields.push({ key: "notes", label: "Notas", type: "text" });
    }
    return fields;
  }

  /**
   * FEAT-085 — seed determinístico entityTypes/forms/matrixViews a partir do pack.
   * @param {object|null} proposal
   * @param {{ label: string, purpose?: string }[]} pack
   * @param {object|null} studyPlan
   * @returns {object}
   */
  function seedProposalFromCrfPack(proposal, pack, studyPlan) {
    var base =
      proposal && typeof proposal === "object" ? Object.assign({}, proposal) : {};
    var entityId = "subject";
    var entityTypes =
      Array.isArray(base.entityTypes) && base.entityTypes.length
        ? base.entityTypes
        : [{ id: entityId, label: "Sujeito", cardinality: "many" }];
    if (entityTypes[0] && entityTypes[0].id) {
      entityId = String(entityTypes[0].id);
    }
    var forms = [];
    var usedIds = {};
    var list = Array.isArray(pack) ? pack : [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var label = String(item.label || "").trim() || "Formulário " + (i + 1);
      var id = slugifyPackFormId(label, i);
      var n = 2;
      var unique = id;
      while (usedIds[unique]) {
        unique = id + "_" + n;
        n++;
      }
      usedIds[unique] = true;
      forms.push({
        id: unique,
        label: label.slice(0, 120),
        entityTypeId: entityId,
        fields: fieldsFromPackPurpose(item.purpose, studyPlan),
      });
    }
    var planBlobSeed = studyPlanTextBlob(studyPlan);
    if (purposeMentionsLabsOrSurgery(planBlobSeed)) {
      for (var fi = 0; fi < forms.length; fi++) {
        var flds = forms[fi].fields || [];
        var onlyNotes =
          flds.length === 1 && String(flds[0].key || "") === "notes";
        if (onlyNotes) {
          forms[fi] = Object.assign({}, forms[fi], {
            fields: defaultHepaticSurgeryFields(),
          });
        }
      }
    }
    var matrixViews = forms.map(function (f) {
      return {
        id: "mv_" + f.id,
        label: f.label,
        formId: f.id,
        entityTypeId: entityId,
      };
    });
    var out = Object.assign({}, base, {
      domainType: "custom",
      entityTypes: entityTypes,
      forms: forms,
      matrixViews: matrixViews,
    });
    if (!String(out.name || "").trim()) {
      var fromPlan =
        studyPlan && studyPlan.objectives
          ? String(studyPlan.objectives).trim().slice(0, 80)
          : "";
      out.name = fromPlan || "Protocolo CRF sugerido";
    }
    if (!out.studyDesign || typeof out.studyDesign !== "object") {
      var grain =
        studyPlan && (studyPlan.primaryGrain || studyPlan.grain)
          ? String(studyPlan.primaryGrain || studyPlan.grain).trim()
          : "patient";
      var grains =
        studyPlan && Array.isArray(studyPlan.grains) && studyPlan.grains.length
          ? studyPlan.grains
          : [grain || "patient"];
      out.studyDesign = {
        cohortGrain: grain || "patient",
        primaryGrain: grain || "patient",
        grains: grains,
      };
    }
    out = applyStudyPlanGrainsToProposal(out, studyPlan);
    if (protocol && typeof protocol.ensureProposalSchema === "function") {
      out = protocol.ensureProposalSchema(out, { studyPlan: studyPlan || null });
    }
    out = preferAghuSourceForLabFields(out);
    out = mergeScreeningFromPlan(out, studyPlan);
    return out;
  }

  /**
   * FEAT-085/086 — ao afirmar («sim») com pending de pack CRF: reseed sempre + limpa pending.
   * Em edição (forms já existem) o pack substitui entityTypes/forms/matrixViews;
   * preserva só identidade (id/code/name/domainType).
   * @param {{ studyPlan?: object|null, proposal?: object|null, pendingQuestions?: unknown, lastUserMessage?: string, specialtyHint?: string }} opts
   * @returns {{ studyPlan: object|null, proposal: object|null, pendingQuestions: string[], applied: boolean }}
   */
  function applySuggestedPackOnAffirmation(opts) {
    opts = opts || {};
    var last = String(opts.lastUserMessage || "");
    var pending = normalizeQuestionList(opts.pendingQuestions);
    var studyPlan =
      opts.studyPlan && typeof opts.studyPlan === "object"
        ? Object.assign({}, opts.studyPlan)
        : null;
    var proposal =
      opts.proposal && typeof opts.proposal === "object" ? opts.proposal : null;

    var emptyAffirm = isEmptyAffirmation(last);
    var partialAghu = isPartialAffirmWithAghuIntent(last);
    if (!emptyAffirm && !partialAghu) {
      return {
        studyPlan: studyPlan,
        proposal: proposal,
        pendingQuestions: pending,
        applied: false,
      };
    }

    var packQs = pending.filter(isPackConfirmQuestion);
    if (!packQs.length) {
      return {
        studyPlan: studyPlan,
        proposal: proposal,
        pendingQuestions: pending,
        applied: false,
      };
    }

    if (partialAghu && studyPlan) {
      var hintAghu =
        "Preferir variáveis AGHU (aghuSource/catalogKey) em labs, vitais, cirurgia e episódio; evitar campos só manuais quando houver key no subset.";
      var prevScr = String(studyPlan.screeningNatural || "").trim();
      if (!/aghu|vari[aá]vel/i.test(prevScr)) {
        studyPlan.screeningNatural = prevScr
          ? (prevScr + "; " + hintAghu).slice(0, 800)
          : hintAghu.slice(0, 800);
      }
    }

    var pack = buildSuggestedCrfPack(studyPlan, opts.specialtyHint);
    if (studyPlan) {
      var planned = Array.isArray(studyPlan.plannedForms)
        ? studyPlan.plannedForms
        : [];
      if (!planned.length) {
        studyPlan.plannedForms = pack.map(function (p) {
          return p.purpose
            ? { label: p.label, purpose: p.purpose }
            : { label: p.label };
        });
      }
    }

    // FEAT-086: sempre reseed — estudo em edição não preserva forms antigos
    var keepId = proposal && proposal.id != null ? proposal.id : null;
    var keepCode = proposal && proposal.code != null ? proposal.code : null;
    var keepName =
      proposal && String(proposal.name || "").trim()
        ? String(proposal.name).trim()
        : null;
    var keepDomain =
      proposal && proposal.domainType != null ? proposal.domainType : null;
    proposal = seedProposalFromCrfPack(proposal, pack, studyPlan);
    if (keepId != null) proposal.id = keepId;
    if (keepCode != null) proposal.code = keepCode;
    if (keepName) proposal.name = keepName;
    if (keepDomain != null) proposal.domainType = keepDomain;

    var nextPending = pending.filter(function (q) {
      return !isPackConfirmQuestion(q);
    });

    return {
      studyPlan: studyPlan,
      proposal: proposal,
      pendingQuestions: nextPending,
      applied: true,
    };
  }

  /**
   * FEAT-084 — pack CRF sugerido a partir do studyPlan (determinístico, sem LLM).
   * @param {object|null} studyPlan
   * @param {string} [specialtyHint]
   * @returns {{ label: string, purpose?: string }[]}
   */
  function buildSuggestedCrfPack(studyPlan, specialtyHint) {
    var plan = studyPlan && typeof studyPlan === "object" ? studyPlan : null;
    var planned = plan && Array.isArray(plan.plannedForms) ? plan.plannedForms : [];
    var fromPlan = [];
    for (var i = 0; i < planned.length; i++) {
      var f = planned[i];
      if (!f || typeof f !== "object") continue;
      var label = String(f.label || "").trim();
      if (!label) continue;
      var purpose = String(f.purpose || "").trim();
      fromPlan.push(purpose ? { label: label, purpose: purpose } : { label: label });
    }
    if (fromPlan.length) return fromPlan.slice(0, 4);

    var blob = [
      plan && plan.population,
      plan && plan.objectives,
      plan && plan.primaryOutcomeOperational,
      specialtyHint,
    ]
      .map(function (x) {
        return String(x || "");
      })
      .join(" ")
      .toLowerCase();

    if (/uti|\blra\b|renal|kdigo|creatinina|di[aá]lise|\baki\b/.test(blob)) {
      return [
        { label: "Baseline admissão", purpose: "Cr, diurese" },
        { label: "Follow-up 48–72h", purpose: "Cr" },
        {
          label: "Desfecho",
          purpose: "LRA KDIGO / diálise / óbito hospitalar",
        },
      ];
    }

    if (/hep[aá]t|cirurg|hpb|bile|bilirr|pancrea/.test(blob)) {
      return [
        {
          label: "Pré-operatório",
          purpose: "procedimento, data cirurgia, creatinina, bilirrubina, FC",
        },
        {
          label: "Pós-operatório",
          purpose: "creatinina, bilirrubina, FC",
        },
        {
          label: "Desfecho",
          purpose: "óbito hospitalar",
        },
      ];
    }

    var outcome =
      plan && plan.primaryOutcomeOperational
        ? String(plan.primaryOutcomeOperational).trim()
        : "";
    var grain = plan && (plan.primaryGrain || plan.grain)
      ? String(plan.primaryGrain || plan.grain).trim()
      : "patient";
    var purposeBaseline = purposeMentionsLabsOrSurgery(blob)
      ? "procedimento, creatinina, bilirrubina, FC"
      : "Dados na entrada da coorte (" + grain + ")";
    return [
      {
        label: "Baseline",
        purpose: purposeBaseline,
      },
      { label: "Follow-up", purpose: "Acompanhamento conforme desenho" },
      {
        label: "Desfecho",
        purpose: outcome || "Desfecho primário operacional",
      },
    ];
  }

  /**
   * FEAT-086 — forms do proposal desalinhados do studyPlan.plannedForms
   * (ex.: 1 form antigo vs pack Baseline/Follow-up/Desfecho).
   * @param {object|null} proposal
   * @param {object|null} studyPlan
   * @returns {boolean}
   */
  function proposalFormsMisalignedWithPlan(proposal, studyPlan) {
    var planned =
      studyPlan && Array.isArray(studyPlan.plannedForms)
        ? studyPlan.plannedForms
        : [];
    if (planned.length < 2) return false;
    var forms =
      proposal && Array.isArray(proposal.forms) ? proposal.forms : [];
    if (forms.length < planned.length) return true;
    var formBlob = forms
      .map(function (f) {
        return normalizeCompareText(String((f && f.label) || ""));
      })
      .join(" | ");
    var missing = 0;
    for (var i = 0; i < planned.length; i++) {
      var pl = normalizeCompareText(String((planned[i] && planned[i].label) || ""));
      if (!pl) continue;
      if (formBlob.indexOf(pl) === -1) missing++;
    }
    return missing >= Math.ceil(planned.length / 2);
  }

  /**
   * FEAT-084 — coaching PT para E1 (codes → linguagem humana + pack sugerido).
   * @param {object|null} studyPlan
   * @param {string[]} errors
   * @param {object|null} [proposal]
   * @param {string} [specialtyHint]
   * @returns {string}
   */
  function buildSchemaIncompleteGuidance(
    studyPlan,
    errors,
    proposal,
    specialtyHint
  ) {
    var list = Array.isArray(errors)
      ? errors
          .map(function (e) {
            return String(e || "").trim();
          })
          .filter(Boolean)
      : [];
    var blob = list.join(" ").toLowerCase();
    var humanGaps = [];

    if (
      !list.length ||
      /schema_required|formul[aá]rio|entidade|vista\s+de\s+matriz|schema\s+custom/.test(
        blob
      )
    ) {
      humanGaps.push("O rascunho ainda não tem formulários CRF válidos.");
    }
    if (
      /name_required|nome\s+obrigat|invalid_protocol\b/.test(blob) ||
      list.some(function (e) {
        return /^name_required$/i.test(e) || /^invalid_protocol$/i.test(e);
      })
    ) {
      humanGaps.push(
        "Falta um nome curto do estudo (sem dados de paciente)."
      );
    }
    if (
      /screening_requires_aghu_path|triagem\s+exige\s+path\s+aghu/.test(blob)
    ) {
      humanGaps.push("A triagem ainda precisa de paths AGHU concretos.");
    }
    if (
      /formal_rejects_aghu_path|i\/e\s+formal|rejeita\s+path\s+aghu/.test(blob)
    ) {
      humanGaps.push(
        "Os critérios de I/E precisam estar em linguagem clínica (não paths AGHU)."
      );
    }
    if (/phi_in_labels|\bphi\b|prontu[aá]rio|identificad/.test(blob)) {
      humanGaps.push(
        "Há rótulos com risco de identificação — precisam ser reformulados."
      );
    }
    if (!humanGaps.length) {
      humanGaps.push(
        "O rascunho ainda precisa de ajustes estruturais antes de finalizar."
      );
    }

    var pack = buildSuggestedCrfPack(studyPlan, specialtyHint);
    var bits = [];
    if (studyPlan && studyPlan.objectives) {
      bits.push(String(studyPlan.objectives).trim().slice(0, 80));
    }
    if (studyPlan && studyPlan.population) {
      bits.push(String(studyPlan.population).trim().slice(0, 80));
    }
    var studySummary =
      bits.join(" — ") ||
      (proposal && proposal.name ? String(proposal.name) : "este desenho");

    var lines = [];
    lines.push(humanGaps.join(" "));
    lines.push("Para um estudo de " + studySummary + ", sugiro:");
    for (var i = 0; i < pack.length; i++) {
      var p = pack[i];
      lines.push(
        "- " + p.label + (p.purpose ? " (" + p.purpose + ")" : "")
      );
    }
    lines.push(
      "Se fizer sentido, responda **sim** para eu montar assim; senão diga o que mudar."
    );
    return lines.join("\n");
  }

  /**
   * FEAT-083/084 — erros E1 (Edge codes + mensagens PT do oráculo lib) → perguntas acionáveis.
   * Schema: confirmação curta (pack no chat); restantes pedem dado específico.
   * @param {string[]} errors
   * @returns {string[]}
   */
  function buildClarifyingQuestionsFromValidationErrors(errors) {
    var list = Array.isArray(errors)
      ? errors
          .map(function (e) {
            return String(e || "").trim();
          })
          .filter(Boolean)
      : [];
    var blob = list.join(" ").toLowerCase();
    var questions = [];

    if (
      /name_required|nome\s+obrigat|invalid_protocol\b/.test(blob) ||
      list.some(function (e) {
        return /^name_required$/i.test(e) || /^invalid_protocol$/i.test(e);
      })
    ) {
      questions.push(
        "Qual o nome curto do estudo (sem dados de paciente)?"
      );
    }
    if (
      /schema_required|formul[aá]rio|entidade|vista\s+de\s+matriz|schema\s+custom/.test(
        blob
      )
    ) {
      questions.push(
        "Confirma o pack CRF sugerido no chat (ou diga o que mudar)?"
      );
    }
    if (
      /screening_requires_aghu_path|triagem\s+exige\s+path\s+aghu/.test(blob)
    ) {
      questions.push(
        "Quais dados AGHU usam na triagem (ex.: UTI, creatinina)?"
      );
    }
    if (
      /formal_rejects_aghu_path|i\/e\s+formal|rejeita\s+path\s+aghu/.test(blob)
    ) {
      questions.push(
        "Quais critérios de inclusão/exclusão do CRF em linguagem clínica (não paths AGHU)?"
      );
    }
    if (/phi_in_labels|\bphi\b|prontu[aá]rio|identificad/.test(blob)) {
      questions.push(
        "Pode reformular nome/rótulos sem nomes, prontuários ou identificadores?"
      );
    }
    if (/select\s+sem\s+op[cç][oõ]es|select_options_required/.test(blob)) {
      var hit = list.find(function (e) {
        return /select\s+sem\s+op[cç][oõ]es/i.test(e);
      });
      var path = hit
        ? String(hit).replace(/^select\s+sem\s+op[cç][oõ]es:\s*/i, "").trim()
        : "";
      questions.push(
        path
          ? "Quais opções da lista «" + path + "»?"
          : "Quais opções devem aparecer na lista (select) em falta?"
      );
    }
    if (!questions.length) {
      questions.push(
        "O que falta no protocolo (forms, screening ou I/E) para eu corrigir o rascunho?"
      );
    }
    var uniq = [];
    for (var i = 0; i < questions.length; i++) {
      if (uniq.indexOf(questions[i]) === -1) uniq.push(questions[i]);
    }
    return uniq.slice(0, 5);
  }

  /**
   * FEAT-084 — mensagem do chat: lead + guidance opcional; perguntas só no bloco âmbar.
   * @param {object|null} proposal
   * @param {string[]} questions (ignorado no corpo — ficam no âmbar)
   * @param {string[]} critiques (ignorado — sem codes crus em Notas)
   * @param {{ guidance?: string }} [opts]
   * @returns {string}
   */
  function buildClarifyAssistantMessage(proposal, questions, critiques, opts) {
    var parts = [];
    if (proposal && proposal.name) {
      parts.push(
        "Tenho um rascunho parcial «" +
          String(proposal.name) +
          "», mas preciso de esclarecimentos antes de finalizar:"
      );
    } else {
      parts.push(
        "Preciso de esclarecimentos para alinhar o protocolo ao seu pedido:"
      );
    }
    var guidance =
      opts && opts.guidance != null ? String(opts.guidance).trim() : "";
    if (guidance) {
      parts.push(guidance);
    }
    void questions;
    void critiques;
    parts.push("Confirme ou ajuste no chat — continuo a partir daí.");
    return parts.join("\n");
  }

  function summarizeProposal(protocol) {
    if (!protocol) return "Não foi possível gerar um rascunho válido.";
    var name = protocol.name || "Estudo sem nome";
    var grain =
      (protocol.studyDesign &&
        (protocol.studyDesign.primaryGrain || protocol.studyDesign.cohortGrain)) ||
      "patient";
    var nForms = Array.isArray(protocol.forms) ? protocol.forms.length : 0;
    var nEnt = Array.isArray(protocol.entityTypes)
      ? protocol.entityTypes.length
      : 0;
    return (
      "Protocolei «" +
      name +
      "» (grain " +
      grain +
      ", " +
      nEnt +
      " entidades, " +
      nForms +
      " forms). Revise o rascunho e aplique se estiver correto."
    );
  }

  function summarizeDelta(current, proposal) {
    if (!current || !proposal) return [];
    var deltas = [];
    var curGrain =
      (current.studyDesign &&
        (current.studyDesign.primaryGrain || current.studyDesign.cohortGrain)) ||
      "patient";
    var nextGrain =
      (proposal.studyDesign &&
        (proposal.studyDesign.primaryGrain ||
          proposal.studyDesign.cohortGrain)) ||
      curGrain;
    if (curGrain !== nextGrain) {
      deltas.push("grain: " + curGrain + " → " + nextGrain);
    }
    var curForms = Array.isArray(current.forms) ? current.forms.length : 0;
    var nextForms = Array.isArray(proposal.forms) ? proposal.forms.length : 0;
    if (nextForms !== curForms) {
      var sign = nextForms > curForms ? "+" : "";
      deltas.push(sign + (nextForms - curForms) + " form(s)");
    }
    if (current.name !== proposal.name && proposal.name) {
      deltas.push("nome atualizado");
    }
    return deltas;
  }

  function redactStepTrace(trace) {
    var arr = Array.isArray(trace) ? trace : [];
    return arr.map(function (step) {
      var s = step && typeof step === "object" ? step : {};
      var out = {
        step: String(s.step || ""),
        ok: s.ok !== false,
        durationMs: Number(s.durationMs) || 0,
      };
      if (Array.isArray(s.codes)) {
        out.codes = s.codes.map(String).slice(0, 16);
      }
      if (s.scores && typeof s.scores === "object") {
        var sc = {};
        var keys = Object.keys(s.scores).slice(0, 16);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var n = Number(s.scores[k]);
          if (Number.isFinite(n)) sc[k] = n;
        }
        out.scores = sc;
      }
      if (s.model) out.model = String(s.model).slice(0, 64);
      if (typeof s.promptTokens === "number") out.promptTokens = s.promptTokens;
      if (typeof s.completionTokens === "number") {
        out.completionTokens = s.completionTokens;
      }
      return out;
    });
  }

  function assertNoSensitiveInTrace(trace) {
    var json = JSON.stringify(redactStepTrace(trace));
    if (/proposal|messages|critiques|systemPrompt/i.test(json)) {
      // keys like "promptTokens" ok; block body-like keys only if present as string values of long text
    }
    var forbidden = ["proposal", "messages", "critiques"];
    var arr = Array.isArray(trace) ? trace : [];
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i] || {};
      for (var j = 0; j < forbidden.length; j++) {
        if (Object.prototype.hasOwnProperty.call(s, forbidden[j])) {
          return { ok: false, error: "trace_contains_" + forbidden[j] };
        }
      }
    }
    return { ok: true };
  }

  function newRunId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function createInitialState(opts) {
    var o = opts || {};
    var mode =
      o.mode === "revise" || o.mode === "patch" || o.mode === "plan"
        ? o.mode
        : "draft";
    var sessionPhase =
      o.sessionPhase === "plan" || o.sessionPhase === "draft"
        ? o.sessionPhase
        : mode === "plan"
          ? "plan"
          : "draft";
    return {
      stateSchemaVersion: STATE_SCHEMA_VERSION,
      runId: o.runId || newRunId(),
      mode: mode,
      sessionPhase: sessionPhase,
      messages: sanitizeMessages(o.messages),
      currentProtocol: o.currentProtocol || null,
      studyPlan: o.studyPlan || null,
      proposal: null,
      validationErrors: [],
      judgeCritiques: [],
      repairAttempts: 0,
      status: "running",
      warnings: [],
      stepTrace: [],
      skillIds: [],
      specialtyHint: String(o.specialtyHint || ""),
      assistantMessage: "",
      errorCode: null,
      clarifyingQuestions: [],
      pendingQuestions: normalizeQuestionList(o.pendingQuestions),
    };
  }

  /**
   * Resolve modelos assistant vs judge a partir de mapa env (testável sem Deno).
   * Invariante: nunca o mesmo provider+model — coerção do judge.
   */
  function resolveStudyAssistantModels(envMap) {
    var env = envMap && typeof envMap === "object" ? envMap : {};
    function get(k) {
      var v = env[k];
      return v == null || v === "" ? undefined : String(v);
    }
    var provider =
      get("AGHU_STUDY_ASSISTANT_PROVIDER") === "anthropic" ||
      get("AGHU_ANALYSIS_PROVIDER") === "anthropic"
        ? "anthropic"
        : "openai";
    var DEFAULT_OPENAI_ASSISTANT = "gpt-4o-mini";
    var DEFAULT_OPENAI_JUDGE = "gpt-4o";
    var DEFAULT_ANTHROPIC_ASSISTANT = "claude-haiku-4-5";
    var DEFAULT_ANTHROPIC_JUDGE = "claude-sonnet-4-5";
    var assistant;
    var judge;
    if (provider === "anthropic") {
      assistant = {
        provider: provider,
        model:
          get("AGHU_STUDY_ASSISTANT_ANTHROPIC_MODEL") ||
          get("AGHU_ANTHROPIC_ANALYSIS_MODEL") ||
          DEFAULT_ANTHROPIC_ASSISTANT,
      };
      judge = {
        provider: provider,
        model:
          get("AGHU_STUDY_JUDGE_ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_JUDGE,
      };
    } else {
      assistant = {
        provider: provider,
        model:
          get("AGHU_STUDY_ASSISTANT_OPENAI_MODEL") ||
          get("AGHU_OPENAI_ANALYSIS_MODEL") ||
          DEFAULT_OPENAI_ASSISTANT,
      };
      judge = {
        provider: provider,
        model: get("AGHU_STUDY_JUDGE_OPENAI_MODEL") || DEFAULT_OPENAI_JUDGE,
      };
    }
    var coerced = false;
    if (
      assistant.provider === judge.provider &&
      assistant.model === judge.model
    ) {
      var judgeDefault =
        provider === "anthropic"
          ? DEFAULT_ANTHROPIC_JUDGE
          : DEFAULT_OPENAI_JUDGE;
      var assistantDefault =
        provider === "anthropic"
          ? DEFAULT_ANTHROPIC_ASSISTANT
          : DEFAULT_OPENAI_ASSISTANT;
      judge = {
        provider: provider,
        model:
          assistant.model === judgeDefault ? assistantDefault : judgeDefault,
      };
      coerced = true;
    }
    return { assistant: assistant, judge: judge, coerced: coerced };
  }

  function sanitizeProposalCriteria(proposal) {
    if (protocol && typeof protocol.sanitizeProposalCriteria === "function") {
      return protocol.sanitizeProposalCriteria(proposal);
    }
    return proposal;
  }

  /** Exit seguro do while: E1 ok → propose/clarify; E1 fail com erros → clarify; nunca escalate por judge. */
  function resolveLoopExhaustion(state) {
    if (!state || !state.proposal) {
      return {
        status: "failed",
        errorCode: "escalate_validation",
        phase: null,
      };
    }
    if (state.validationErrors && state.validationErrors.length) {
      return {
        status: "needs_user_input",
        errorCode: null,
        phase: "clarify",
        fromValidation: true,
        validationErrors: state.validationErrors.slice(0, 12),
      };
    }
    var classified = classifyJudgeCritiques(
      state.judgeCritiques,
      (state.stepTrace || [])
        .filter(function (s) {
          return s && s.step === "judge_output" && Array.isArray(s.codes);
        })
        .slice(-1)
        .reduce(function (acc, s) {
          return s.codes || [];
        }, [])
    );
    if (classified.kind === "needs_user") {
      return {
        status: "needs_user_input",
        errorCode: null,
        phase: "clarify",
        classification: classified,
      };
    }
    return {
      status: "proposed",
      errorCode: null,
      phase: "propose",
      classification: classified,
    };
  }

  return {
    MAX_REPAIR_ATTEMPTS: MAX_REPAIR_ATTEMPTS,
    JUDGE_RUBRIC_CODES: JUDGE_RUBRIC_CODES,
    SKILL_IDS: SKILL_IDS,
    SKILL_META: SKILL_META,
    ALLOWED_GRAPH_NODES: ALLOWED_GRAPH_NODES,
    STATE_SCHEMA_VERSION: STATE_SCHEMA_VERSION,
    MAX_MESSAGES: MAX_MESSAGES,
    MAX_MESSAGE_CHARS: MAX_MESSAGE_CHARS,
    COMPACTION_CHARS_THRESHOLD: COMPACTION_CHARS_THRESHOLD,
    COMPACTION_KEEP_MESSAGES: COMPACTION_KEEP_MESSAGES,
    listSkillIds: listSkillIds,
    listSkillMeta: listSkillMeta,
    buildSkillMetaPreamble: buildSkillMetaPreamble,
    loadSkillSheet: loadSkillSheet,
    selectSkills: selectSkills,
    buildSkillGrounding: buildSkillGrounding,
    catalogGroundingSubset: catalogGroundingSubset,
    assertHitlApplyAllowed: assertHitlApplyAllowed,
    compactMessagesForContext: compactMessagesForContext,
    sanitizeMessages: sanitizeMessages,
    lastUserContent: lastUserContent,
    deepMerge: deepMerge,
    mergeProposal: mergeProposal,
    preferAghuSourceForLabFields: preferAghuSourceForLabFields,
    screeningCriteriaFromPlan: screeningCriteriaFromPlan,
    mergeScreeningFromPlan: mergeScreeningFromPlan,
    isPartialAffirmWithAghuIntent: isPartialAffirmWithAghuIntent,
    applyStudyPlanGrainsToProposal: applyStudyPlanGrainsToProposal,
    validateProposal: validateProposal,
    parseJudgeVerdict: parseJudgeVerdict,
    classifyJudgeCritiques: classifyJudgeCritiques,
    buildClarifyingQuestions: buildClarifyingQuestions,
    buildClarifyingQuestionsFromValidationErrors:
      buildClarifyingQuestionsFromValidationErrors,
    buildSuggestedCrfPack: buildSuggestedCrfPack,
    buildSchemaIncompleteGuidance: buildSchemaIncompleteGuidance,
    proposalFormsMisalignedWithPlan: proposalFormsMisalignedWithPlan,
    applySuggestedPackOnAffirmation: applySuggestedPackOnAffirmation,
    isPackConfirmQuestion: isPackConfirmQuestion,
    questionTopicToPlanField: questionTopicToPlanField,
    mergeStudyPlanFields: mergeStudyPlanFields,
    mergePendingQuestions: mergePendingQuestions,
    filterAssistantClarifyingQuestions: filterAssistantClarifyingQuestions,
    sanitizeStudyPlanGrain: sanitizeStudyPlanGrain,
    grainMentionedInText: grainMentionedInText,
    recentUserMessageContents: recentUserMessageContents,
    normalizeQuestionList: normalizeQuestionList,
    userMessageLooksSubstantive: userMessageLooksSubstantive,
    buildClarifyAssistantMessage: buildClarifyAssistantMessage,
    resolveLoopExhaustion: resolveLoopExhaustion,
    summarizeProposal: summarizeProposal,
    summarizeDelta: summarizeDelta,
    redactStepTrace: redactStepTrace,
    assertNoSensitiveInTrace: assertNoSensitiveInTrace,
    newRunId: newRunId,
    createInitialState: createInitialState,
    resolveStudyAssistantModels: resolveStudyAssistantModels,
    sanitizeProposalCriteria: sanitizeProposalCriteria,
  };
});
