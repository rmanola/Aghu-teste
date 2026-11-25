/**
 * FEAT-115/117/118/119/124/146 — Catálogo declarativo de linhas de cuidado + atribuição.
 * Seed: CG + CAD + NEF (active) + 4 candidatas FEAT-124 + cad_pancreatite_aguda (FEAT-146).
 * Matcher sobre normalizeTypeKey; UTI por kind estruturado.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCareLines = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  /** Incrementar quando termos de match do catálogo mudarem (invalida cache). */
  var MATCH_VERSION = 5;

  var LIFECYCLE_VALUES = { candidate: true, active: true, retired: true };

  function defaultPromotion() {
    return {
      minAttributedUnits: 30,
      minSampledPrecision: 0.9,
      sampledPrecision: null,
      sampleSize: null,
      reviewedAt: null,
      reviewedBy: null,
    };
  }

  /** Seed FEAT-117/118/119 (active) + FEAT-124 (candidate) + FEAT-146 (candidate). */
  var CARE_LINES = [
    {
      id: "cg_apendicite_aguda",
      label: "Apendicite aguda",
      specialty: "cirurgia_geral",
      grain: "surgery",
      priority: 10,
      lifecycle: "active",
      promotion: defaultPromotion(),
      match: {
        diagnosis: {
          include: ["apendicite"],
          exclude: ["apendicite cronica", "tumor de apendice"],
        },
        procedure: {
          include: [
            "apendicectomia",
            "apendicectomia videolaparoscopica",
          ],
          exclude: ["apendicite cronica", "tumor de apendice"],
        },
      },
    },
    {
      id: "cg_colecistite_aguda",
      label: "Colecistite aguda",
      specialty: "cirurgia_geral",
      grain: "surgery",
      priority: 10,
      lifecycle: "active",
      promotion: defaultPromotion(),
      match: {
        diagnosis: {
          include: ["colecistite", "colangite"],
          exclude: ["colecistectomia eletiva", "neoplasia de vesicula"],
        },
        procedure: {
          include: ["colecistectomia"],
          exclude: ["colecistectomia eletiva", "neoplasia de vesicula"],
        },
      },
    },
    {
      id: "cg_hernias_abdominais",
      label: "Hérnias abdominais",
      specialty: "cirurgia_geral",
      grain: "surgery",
      priority: 10,
      lifecycle: "active",
      promotion: defaultPromotion(),
      match: {
        diagnosis: {
          include: [
            "hernia inguinal",
            "hernia umbilical",
            "hernia incisional",
            "herniorrafia",
            "hernioplastia",
          ],
          exclude: ["hernia de hiato", "hernia diafragmatica"],
        },
        procedure: {
          include: [
            "hernia inguinal",
            "hernia umbilical",
            "hernia incisional",
            "herniorrafia",
            "hernioplastia",
          ],
          exclude: ["hernia de hiato", "hernia diafragmatica"],
        },
      },
    },
    {
      id: "cad_cancer_colorretal",
      label: "Câncer colorretal",
      specialty: "aparelho_digestivo",
      grain: "surgery",
      priority: 20,
      lifecycle: "active",
      promotion: defaultPromotion(),
      match: {
        diagnosis: {
          include: [
            "neoplasia colon",
            "neoplasia de colon",
            "cancer colorretal",
            "cancro colorretal",
          ],
          exclude: ["polipo adenomatoso", "doenca diverticular"],
        },
        procedure: {
          include: [
            "colectomia",
            "retossigmoidectomia",
            "amputacao abdominoperineal",
          ],
          exclude: ["polipo adenomatoso", "doenca diverticular"],
        },
      },
    },
    {
      id: "cad_duodenopancreatectomia",
      label: "Duodenopancreatectomia (Whipple)",
      specialty: "aparelho_digestivo",
      grain: "surgery",
      priority: 30,
      lifecycle: "active",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem registo estruturado de checklist perioperatório Whipple",
        },
      ],
      match: {
        diagnosis: { include: [], exclude: [] },
        procedure: {
          include: [
            "duodenopancreatectomia",
            "whipple",
            "gastroduodenopancreatectomia",
          ],
          exclude: ["pancreatectomia distal"],
        },
      },
    },
    {
      id: "cad_cirrose_hepatica",
      label: "Cirrose hepática",
      specialty: "aparelho_digestivo",
      grain: "clinical_episode",
      priority: 15,
      lifecycle: "active",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "cirrose",
            "hipertensao portal",
            "varizes esofagicas",
            "encefalopatia hepatica",
            "ascite",
          ],
          exclude: ["esteatose hepatica", "hepatite aguda"],
        },
        procedure: { include: [], exclude: [] },
      },
    },
    {
      id: "nef_lesao_renal_aguda",
      label: "Lesão renal aguda",
      specialty: "nefrologia",
      grain: "clinical_episode",
      priority: 20,
      lifecycle: "active",
      promotion: defaultPromotion(),
      match: {
        diagnosis: {
          include: [
            "lesao renal aguda",
            "injuria renal aguda",
            "insuficiencia renal aguda",
            "lra",
            "necrose tubular aguda",
          ],
          exclude: [
            "doenca renal cronica agudizada",
            "drc agudizada",
          ],
        },
        procedure: { include: [], exclude: [] },
      },
    },
    {
      id: "nef_doenca_renal_cronica",
      label: "Doença renal crónica",
      specialty: "nefrologia",
      grain: "clinical_episode",
      priority: 15,
      lifecycle: "active",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem registo estruturado de nefoproteção / plano de DRC",
        },
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "doenca renal cronica",
            "insuficiencia renal cronica",
            "drc",
            "nefropatia diabetica",
            "glomerulonefrite cronica",
          ],
          exclude: [
            "lesao renal aguda",
            "doenca renal cronica agudizada",
            "drc agudizada",
          ],
        },
        procedure: { include: [], exclude: [] },
      },
    },
    {
      id: "cg_abdome_agudo_obstrucao",
      label: "Abdome agudo obstrutivo",
      specialty: "cirurgia_geral",
      grain: "surgery",
      priority: 5,
      lifecycle: "candidate",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem registo de tempo porta-cirurgia",
        },
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "obstrucao intestinal",
            "obstrucao de intestino",
            "ileo mecanico",
            "abdomen agudo obstrutivo",
            "abdome agudo obstrutivo",
          ],
          exclude: ["apendicite", "colecistite", "colangite"],
        },
        procedure: {
          include: [
            "laparotomia",
            "enterectomia",
            "lyse de aderencias",
            "lise de aderencias",
            "aderiolise",
          ],
          exclude: ["apendicectomia", "colecistectomia"],
        },
      },
    },
    {
      id: "cad_esofagogastrica",
      label: "Cirurgia esofagogástrica oncológica",
      specialty: "aparelho_digestivo",
      grain: "surgery",
      priority: 5,
      lifecycle: "candidate",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem estadiamento oncológico estruturado no caminho automático",
        },
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "neoplasia gastrica",
            "neoplasia de estomago",
            "cancer gastrico",
            "neoplasia esofagica",
            "cancer de esofago",
          ],
          exclude: ["hernia de hiato", "bypass gastrico", "sleeve"],
        },
        procedure: {
          include: ["gastrectomia", "esofagectomia", "esofagogastrectomia"],
          exclude: [
            "hernia de hiato",
            "fundoplicatura",
            "bypass gastrico",
            "gastroplastia",
            "sleeve",
          ],
        },
      },
    },
    {
      id: "sep_sepse_choque",
      label: "Sepse e choque séptico",
      specialty: "clinica_medica",
      grain: "episode",
      priority: 5,
      lifecycle: "candidate",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem hora de antibiótico no caminho automático AGHU",
        },
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "sepse",
            "septicemia",
            "choque septico",
            "sepsis",
          ],
          exclude: ["bacteremia assintomatica"],
        },
        procedure: { include: [], exclude: [] },
      },
    },
    {
      id: "uti_admissao_nao_planeada",
      label: "Admissão não planeada em terapia intensiva",
      specialty: "terapia_intensiva",
      grain: "episode",
      priority: 5,
      lifecycle: "candidate",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "process",
          reason: "sem escore de gravidade à admissão no caminho automático",
        },
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: { include: [], exclude: [] },
        procedure: { include: [], exclude: [] },
        icuAdmission: { kind: "unplanned" },
      },
    },
    {
      id: "cad_pancreatite_aguda",
      label: "Pancreatite aguda",
      specialty: "aparelho_digestivo",
      grain: "clinical_episode",
      priority: 5,
      lifecycle: "candidate",
      promotion: defaultPromotion(),
      dimensionGaps: [
        {
          dimension: "value",
          reason: "sem dado de custo hospitalar no repo",
        },
      ],
      match: {
        diagnosis: {
          include: [
            "pancreatite aguda",
            "pancreatite aguda biliar",
            "pancreatite biliar",
            "pancreatite aguda alcoolica",
            "pancreatite alcoolica",
            "pancreatite litiasica",
            "pancreatite necrosante",
            "pancreatite necro-hemorragica",
          ],
          exclude: [
            "pancreatite cronica",
            "pancreatite cronica agudizada",
            "neoplasia de pancreas",
            "neoplasia pancreatica",
            "tumor de pancreas",
            "pancreatectomia eletiva",
          ],
        },
        procedure: { include: [], exclude: [] },
      },
    },
  ];

  function loadNormalizeTypeKey() {
    if (typeof require === "function") {
      try {
        var agg = require("./quality-dashboard-aggregate.js");
        if (agg && typeof agg.normalizeTypeKey === "function") {
          return agg.normalizeTypeKey;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    var g =
      (root && root.AghuQualityDashboardAggregate) ||
      (typeof globalThis !== "undefined" &&
        globalThis.AghuQualityDashboardAggregate) ||
      null;
    if (g && typeof g.normalizeTypeKey === "function") return g.normalizeTypeKey;
    return function (texto) {
      var t = String(texto == null ? "" : texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return t || "(sem nome)";
    };
  }

  var normalizeTypeKey = loadNormalizeTypeKey();

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function isEpisodeGrain(grain) {
    var g = str(grain);
    return g === "episode" || g === "clinical_episode";
  }

  /**
   * Retrocompat:
   * - listCareLines() → seed CARE_LINES
   * - listCareLines(array) → catálogo injectado
   * - listCareLines({ specialty, catalog? }) → filtra por specialty
   */
  function listCareLines(catalogOrOpts) {
    if (Array.isArray(catalogOrOpts)) {
      return catalogOrOpts.slice();
    }
    var opts =
      catalogOrOpts && typeof catalogOrOpts === "object" ? catalogOrOpts : null;
    var list = Array.isArray(opts && opts.catalog) ? opts.catalog : CARE_LINES;
    var specialty =
      opts && opts.specialty != null && str(opts.specialty)
        ? str(opts.specialty)
        : null;
    if (!specialty) return list.slice();
    return list.filter(function (line) {
      return line && str(line.specialty) === specialty;
    });
  }

  /**
   * FEAT-128 (CPIGOV-AC-09) — ciclo de vida vigente numa data, resolvido contra
   * a configuração que `cpi-governance-log.resolveConfigAt` devolve. O catálogo
   * declara o estado inicial; a decisão registada é que o muda, e só a partir do
   * seu `effectiveFrom`. Helper de leitura: não conhece o registo nem o formato
   * da decisão, só a configuração já dobrada.
   *
   * @param {string} careLineId
   * @param {{ careLines?: Record<string, { lifecycle?: string }> }|null} resolvedConfig
   * @param {{ catalog?: object[] }} [options]
   * @returns {string|null}
   */
  function resolveLifecycleAt(careLineId, resolvedConfig, options) {
    var id = str(careLineId);
    if (!id) return null;
    var decided =
      resolvedConfig &&
      typeof resolvedConfig === "object" &&
      resolvedConfig.careLines &&
      typeof resolvedConfig.careLines === "object"
        ? resolvedConfig.careLines[id]
        : null;
    if (decided && str(decided.lifecycle)) return str(decided.lifecycle);

    var opts = options && typeof options === "object" ? options : {};
    var catalog = Array.isArray(opts.catalog) ? opts.catalog : CARE_LINES;
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i] && str(catalog[i].id) === id) {
        return str(catalog[i].lifecycle) || null;
      }
    }
    return null;
  }

  /**
   * Catálogo com o ciclo de vida já resolvido contra o registo de decisão.
   * @param {object|null} resolvedConfig
   * @param {{ catalog?: object[], specialty?: string }} [options]
   */
  function listCareLinesAt(resolvedConfig, options) {
    return listCareLines(options).map(function (line) {
      var lifecycle = resolveLifecycleAt(line && line.id, resolvedConfig, options);
      if (!lifecycle || lifecycle === str(line.lifecycle)) return line;
      return Object.assign({}, line, { lifecycle: lifecycle });
    });
  }

  function anyTermIncludes(haystack, terms) {
    var key = normalizeTypeKey(haystack);
    if (!key || key === "(sem nome)") return false;
    for (var i = 0; i < terms.length; i++) {
      var term = normalizeTypeKey(terms[i]);
      if (!term || term === "(sem nome)") continue;
      if (key.indexOf(term) !== -1) return true;
    }
    return false;
  }

  function matchesRule(text, rule) {
    if (!rule || typeof rule !== "object") return false;
    var include = asArray(rule.include);
    var exclude = asArray(rule.exclude);
    if (exclude.length && anyTermIncludes(text, exclude)) return false;
    if (!include.length) return false;
    return anyTermIncludes(text, include);
  }

  function unitIdOf(item, fallbackPrefix, index) {
    if (item && item.id != null && str(item.id)) return str(item.id);
    var key = item && (item.typeKey || item.texto);
    return fallbackPrefix + ":" + (key ? normalizeTypeKey(key) : String(index));
  }

  function uniqueIds(list) {
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function episodeUnitIds(facts) {
    var eps = asArray(facts && facts.hospEpisodes);
    var ids = [];
    for (var i = 0; i < eps.length; i++) {
      ids.push(unitIdOf(eps[i], "ep", i));
    }
    return ids;
  }

  /**
   * Fingerprint estável dos termos de match (guarda MATCH_VERSION).
   * @param {object[]} [catalog]
   * @returns {string}
   */
  function catalogMatchFingerprint(catalog) {
    var list = asArray(catalog != null ? catalog : CARE_LINES);
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      var line = list[i];
      if (!line || !line.id) continue;
      parts.push(str(line.id) + ":" + JSON.stringify(line.match || null));
    }
    parts.sort();
    var s = parts.join("|");
    var h = 2166136261;
    for (var j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  /**
   * @param {object[]} [catalog]
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateCatalog(catalog) {
    var list = asArray(catalog != null ? catalog : CARE_LINES);
    var errors = [];
    var includeIndex = {};

    for (var i = 0; i < list.length; i++) {
      var line = list[i];
      if (!line || typeof line !== "object") {
        errors.push("careLine[" + i + "]: not an object");
        continue;
      }
      var id = str(line.id) || "careLine[" + i + "]";
      var life = line.lifecycle;
      if (life == null || str(life) === "") {
        errors.push(id + ": missing lifecycle");
      } else if (!LIFECYCLE_VALUES[str(life)]) {
        errors.push(id + ": invalid lifecycle " + str(life));
      }

      var promo =
        line.promotion && typeof line.promotion === "object"
          ? line.promotion
          : null;
      if (promo && promo.sampledPrecision != null) {
        if (promo.sampleSize == null || promo.sampleSize === "") {
          errors.push(id + ": sampledPrecision requires sampleSize");
        }
        if (promo.reviewedAt == null || str(promo.reviewedAt) === "") {
          errors.push(id + ": sampledPrecision requires reviewedAt");
        }
      }

      var match = line.match && typeof line.match === "object" ? line.match : {};
      var rules = [match.diagnosis, match.procedure];
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        if (!rule) continue;
        var includes = asArray(rule.include);
        for (var t = 0; t < includes.length; t++) {
          var term = normalizeTypeKey(includes[t]);
          if (!term || term === "(sem nome)") continue;
          var pri =
            typeof line.priority === "number" ? line.priority : 0;
          var key = term + "@" + pri;
          if (includeIndex[key] && includeIndex[key] !== id) {
            errors.push(
              "overlap include term \"" +
                term +
                "\" priority " +
                pri +
                ": " +
                includeIndex[key] +
                " and " +
                id,
            );
          } else {
            includeIndex[key] = id;
          }
        }
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Resolve rótulo incluindo linhas retired (séries históricas).
   * @param {string} careLineId
   * @param {object[]} [catalog]
   * @returns {string|null}
   */
  function resolveCareLineLabel(careLineId, catalog) {
    var want = str(careLineId);
    if (!want) return null;
    var list = Array.isArray(catalog) ? catalog : CARE_LINES;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && str(list[i].id) === want) {
        return list[i].label != null ? str(list[i].label) : want;
      }
    }
    return null;
  }

  /**
   * @param {object} facts — extractPatientFacts-like
   * @param {{ catalog?: object[] }|null|undefined} options
   */
  function attributeCareLines(facts, options) {
    var opts = options && typeof options === "object" ? options : {};
    var catalog = Array.isArray(opts.catalog) ? opts.catalog : CARE_LINES;
    var dxList = asArray(facts && facts.dxInPeriod);
    var cirList = asArray(facts && facts.cirInPeriod);
    var icuList = asArray(facts && facts.icuAdmissions);

    var hits = [];
    var seenLine = {};

    for (var i = 0; i < catalog.length; i++) {
      var line = catalog[i];
      if (!line || !line.id) continue;
      var lineId = str(line.id);
      if (seenLine[lineId]) continue;

      var lifecycle = str(line.lifecycle);
      if (lifecycle === "retired") continue;

      var match = line.match && typeof line.match === "object" ? line.match : {};
      var dxRule = match.diagnosis;
      var procRule = match.procedure;
      var icuRule =
        match.icuAdmission && typeof match.icuAdmission === "object"
          ? match.icuAdmission
          : null;

      var dxUnitIds = [];
      var dxMatched = false;
      for (var d = 0; d < dxList.length; d++) {
        var dx = dxList[d];
        var dxText = (dx && (dx.typeKey || dx.texto)) || "";
        if (matchesRule(dxText, dxRule)) {
          dxMatched = true;
          dxUnitIds.push(unitIdOf(dx, "dx", d));
        }
      }

      var cirUnitIds = [];
      var procMatched = false;
      for (var c = 0; c < cirList.length; c++) {
        var cir = cirList[c];
        var cirText = (cir && (cir.typeKey || cir.nome || cir.descricao)) || "";
        if (matchesRule(cirText, procRule)) {
          procMatched = true;
          cirUnitIds.push(unitIdOf(cir, "cir", c));
        }
      }

      var icuMatched = false;
      if (icuRule && icuRule.kind != null && str(icuRule.kind) !== "") {
        var wantKind = str(icuRule.kind);
        for (var u = 0; u < icuList.length; u++) {
          var icu = icuList[u];
          // Nunca usar reason (texto livre) — só kind estruturado.
          if (icu && str(icu.kind) === wantKind) {
            icuMatched = true;
            break;
          }
        }
      }

      if (!dxMatched && !procMatched && !icuMatched) continue;

      seenLine[lineId] = true;
      var matchedBy = "diagnosis";
      if (icuMatched && !dxMatched && !procMatched) matchedBy = "icuAdmission";
      else if (dxMatched) matchedBy = "diagnosis";
      else matchedBy = "procedure";

      var unitIds;
      if (isEpisodeGrain(line.grain)) {
        var epIds = episodeUnitIds(facts);
        if (epIds.length) {
          unitIds = epIds;
        } else if (dxMatched) {
          // Fallback legado: grain episode sem hospEpisodes mas com dx.
          unitIds = uniqueIds(dxUnitIds);
        } else {
          // CPIEXP-AC-07: unidade = episódio de internamento.
          // Match só por icuAdmission (ou procedure) sem hospEpisodes =
          // factos incompletos — não atribuir com unitIds vazio
          // (denominador zero silencioso / unattributed=false falso).
          continue;
        }
      } else {
        unitIds = uniqueIds(dxUnitIds.concat(cirUnitIds));
      }

      if (!unitIds.length) continue;

      hits.push({
        careLineId: lineId,
        matchedBy: matchedBy,
        unitIds: unitIds,
        priority: typeof line.priority === "number" ? line.priority : 0,
      });
    }

    hits.sort(function (a, b) {
      return b.priority - a.priority;
    });

    var careLines = hits.map(function (h) {
      return {
        careLineId: h.careLineId,
        matchedBy: h.matchedBy,
        unitIds: h.unitIds,
      };
    });

    return {
      careLines: careLines,
      unattributed: careLines.length === 0,
      matchVersion: MATCH_VERSION,
    };
  }

  /**
   * FEAT-130 — preenche promotion.* a partir de evidência amostrada.
   * Nunca altera lifecycle (CPIPRM-AC-10/11); a promoção continua a ser
   * decisão registada (FEAT-128).
   * @param {object} careLine
   * @param {object} evidence
   */
  function applySampledEvidence(careLine, evidence) {
    var line = careLine && typeof careLine === "object" ? careLine : {};
    var ev = evidence && typeof evidence === "object" ? evidence : {};
    var promo =
      line.promotion && typeof line.promotion === "object"
        ? Object.assign({}, line.promotion)
        : defaultPromotion();
    if (ev.sampledPrecision != null) promo.sampledPrecision = ev.sampledPrecision;
    if (ev.sampleSize != null) promo.sampleSize = ev.sampleSize;
    if (ev.reviewedAt != null) promo.reviewedAt = ev.reviewedAt;
    if (ev.reviewedBy != null) promo.reviewedBy = ev.reviewedBy;
    if (ev.ci95 != null) promo.ci95 = ev.ci95;
    if (ev.sampleId != null) promo.sampleId = ev.sampleId;
    if (ev.status != null) promo.lastReviewStatus = ev.status;
    return Object.assign({}, line, {
      lifecycle: line.lifecycle,
      promotion: promo,
    });
  }

  return {
    MATCH_VERSION: MATCH_VERSION,
    matchVersion: MATCH_VERSION,
    CARE_LINES: CARE_LINES,
    listCareLines: listCareLines,
    resolveLifecycleAt: resolveLifecycleAt,
    listCareLinesAt: listCareLinesAt,
    attributeCareLines: attributeCareLines,
    validateCatalog: validateCatalog,
    resolveCareLineLabel: resolveCareLineLabel,
    catalogMatchFingerprint: catalogMatchFingerprint,
    normalizeTypeKey: normalizeTypeKey,
    applySampledEvidence: applySampledEvidence,
  };
});
