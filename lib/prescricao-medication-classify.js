/**
 * Classificação clínica de medicamentos na extração de prescrição AGHU.
 * Fonte: catálogo de receitas (CATALOG_CATEGORIES) + OTHER_SPLIT + HV legado.
 * UMD: AghuPrescricaoMedicationClassify
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPrescricaoMedicationClassify = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RE_HIDRATACAO =
    /(?:ringer\s*lactato|solu[cç][aã]o\s*ringer|solu[cç][aã]o\s*fisiol|soro\s*fisiol|cloreto\s+de\s+s[oó]dio|sf\s*0[,.]9|[aá]gua\s+destilada|solu[cç][aã]o\s+glicosada|nacl\s*0[,.]9|albumina)/i;
  var RE_NAO_HV =
    /(?:^|\b)(?:bromoprida|metoclopramida|ondansetrona|dimenidrinato|norepinefrina|noradrenalina|dopamina|dobutamina|vasopressina|epinefrina|adrenalina|milrinona|nitroglicerina|nitroprussiato|fenilefrina|levosimendan)(?:\b|$)/i;
  /** Fallback legado quando o fármaco não está no catálogo (EXTR-AC-05/06). */
  var RE_ANTIBIOTICO =
    /(?:^|\b)(?:cef\w*|metronidazol|meropen(?:em)?|piperacilina|vancomicina|azitromicina|ciprofloxacin|ciprofloxacino|ampicilina|amoxicilina|clindamicina|linezolida|ertapenem|imipenem|gentamicina|amicacina|sulfametoxazol|trimethoprim|trimetoprima|cotrimoxazol|levofloxacin|levofloxacino|oxacilina|colistina|polimixina|tazobactam|sulbactam|clavulanato|cilastatina|daptomicina|rifampicina|isoniazida|etambutol|pirazinamida|claritromicina|doxiciclina|nitrofuranto[ií]na|fosfomicina|penicilina|ticarcilina|ceftriaxona|cefepime|cefazolina|cefalexina|cefotaxima|cefoxitina|cefuroxima|ceftazidima|aztreonam|tigeciclina|minociclina|tetraciclina|eritromicina|spiramicina|roxitromicina|bacitracina|teicoplanin|moxifloxacino|norfloxacino)(?:\b|$)/i;
  var RE_ANTIFUNGICO =
    /(?:^|\b)(?:fluconazol|voriconazol|anidulafungina|caspofungina|micafungina|anfotericina|itraconazol|posaconazol|isavuconazol|cetoconazol)(?:\b|$)/i;
  var RE_ANALGESIA =
    /(?:^|\b)(?:dipirona|tramadol|morfina|fentanil|cetoprofeno|paracetamol|oxicodona|code[ií]na|metadona|buprenorfina|nalbufina|petidina|meperidina|hidromorfona|tapentadol|nimesulida|ibuprofeno|diclofenaco|meloxicam|ketorolaco|ketoprofeno)(?:\b|$)/i;
  var RE_ANTIESPASM =
    /(?:^|\b)(?:escopolamina|hioscina|buscopan|dicicloverina|trimebutina|floroglucinol|papaverina|mebeverina|alverina|drotaverina)(?:\b|$)/i;

  var OTHER_SPLIT = {
    ppi: ["OMEPRAZOLE", "PANTOPRAZOLE"],
    antidiabetic: ["METFORMIN", "INSULIN_NPH", "INSULIN_REGULAR", "SEMAGLUTIDE"],
    psychoactive: [
      "MIDAZOLAM",
      "DIAZEPAM",
      "CLONAZEPAM",
      "LORAZEPAM",
      "HALOPERIDOL",
      "AMITRIPTYLINE",
      "SERTRALINE",
      "ZOLPIDEM",
    ],
    statin: ["ATORVASTATIN", "SIMVASTATIN"],
  };

  var LEGACY_ANALGESIA_CATS = {
    analgesic: true,
    opioid: true,
    antiinflammatory: true,
    antispasmodic: true,
  };

  /** Ordem de exibição UI (labels PT-BR). */
  var CATEGORY_LABELS_PT = {
    antimicrobial: "Antimicrobiano",
    analgesic: "Analgésico",
    antiinflammatory: "Anti-inflamatório",
    opioid: "Opioide",
    antiemetic: "Antiemético",
    procinetic: "Procinético / digestivo",
    antispasmodic: "Antiespasmódico",
    laxative: "Laxante",
    corticosteroid: "Corticoide",
    immunobiologic: "Imunobiológico / imunossupressor",
    antihypertensive: "Anti-hipertensivo",
    diuretic: "Diurético",
    antithrombotic: "Antitrombótico",
    ppi: "IBP (omeprazol / pantoprazol)",
    antidiabetic: "Antidiabético",
    psychoactive: "Psicoativo / controlado",
    statin: "Estatina",
    other: "Outros (catálogo)",
    unmatched: "Não catalogado",
  };

  var CATEGORY_DISPLAY_ORDER = [
    "antimicrobial",
    "analgesic",
    "antiinflammatory",
    "opioid",
    "antiemetic",
    "procinetic",
    "antispasmodic",
    "laxative",
    "corticosteroid",
    "immunobiologic",
    "antihypertensive",
    "diuretic",
    "antithrombotic",
    "ppi",
    "antidiabetic",
    "psychoactive",
    "statin",
    "other",
    "unmatched",
  ];

  function getCatalogApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-medication-catalog.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaMedicationCatalog;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\s\xa0]+/g, " ")
      .trim();
  }

  function buildCodeToCategory() {
    var map = Object.create(null);
    var catalog = getCatalogApi();
    var cats = (catalog && catalog.CATALOG_CATEGORIES) || {};
    var catKeys = Object.keys(cats);
    for (var i = 0; i < catKeys.length; i++) {
      var cat = catKeys[i];
      if (cat === "other") continue;
      var codes = cats[cat] || [];
      for (var j = 0; j < codes.length; j++) {
        map[String(codes[j]).toUpperCase()] = cat;
      }
    }
    var splitKeys = Object.keys(OTHER_SPLIT);
    for (var s = 0; s < splitKeys.length; s++) {
      var sk = splitKeys[s];
      var scodes = OTHER_SPLIT[sk];
      for (var t = 0; t < scodes.length; t++) {
        map[String(scodes[t]).toUpperCase()] = sk;
      }
    }
    var otherCodes = cats.other || [];
    for (var o = 0; o < otherCodes.length; o++) {
      var oc = String(otherCodes[o]).toUpperCase();
      if (!map[oc]) map[oc] = "other";
    }
    return map;
  }

  var CODE_TO_CATEGORY = null;

  function codeToCategory() {
    if (!CODE_TO_CATEGORY) CODE_TO_CATEGORY = buildCodeToCategory();
    return CODE_TO_CATEGORY;
  }

  function ehGlicoseHidratacao(texto) {
    var t = norm(texto || "");
    if (!/glicose|solu[cç][aã]o\s+glicosada/.test(t)) return false;
    if (/solu[cç][aã]o\s+glicosada/.test(t)) return true;
    if (/glicose\s*50\s*%/.test(t)) return false;
    if (/glicose/.test(t) && /\bamp\b/.test(t) && !/(?:fr\s*\d+\s*m[lL]|bolsa)/.test(t)) {
      return false;
    }
    if (/glicose\s*(?:5|10)\s*%/.test(t)) {
      if (/(?:fr\s*\d+\s*m[lL]|bolsa)/.test(t)) return true;
      var mVol = t.match(/\b(\d+)\s*m[lL]\b/);
      if (mVol && parseInt(mVol[1], 10) >= 100) return true;
    }
    return false;
  }

  function nomeParaClassificacaoHv(descricao) {
    var t = String(descricao || "").trim();
    var idx = t.search(/\badministrar\b/i);
    if (idx >= 0) t = t.slice(0, idx);
    t = t.replace(/\bdiluir\s+em\b.*$/i, "").trim();
    var primeiro = t.split(/\s*-\s*/)[0].trim();
    return norm(primeiro);
  }

  function isHidratacao(descricao) {
    var hvNome = nomeParaClassificacaoHv(descricao);
    if (!hvNome) return false;
    if (RE_NAO_HV.test(hvNome)) return false;
    return RE_HIDRATACAO.test(hvNome) || ehGlicoseHidratacao(hvNome);
  }

  function nomeParaCatalogo(descricao) {
    var t = String(descricao || "").trim();
    t = t.replace(/^\d+\s*[-–—]\s*/, "");
    var idx = t.search(/\badministrar\b/i);
    if (idx >= 0) t = t.slice(0, idx);
    t = t.replace(/\bdiluir\s+em\b.*$/i, "").trim();
    var primeiro = t.split(/\s*-\s*/)[0].trim();
    return primeiro || t;
  }

  function resolveCategoryForCode(catalogKey) {
    if (!catalogKey) return "unmatched";
    var key = String(catalogKey).toUpperCase();
    return codeToCategory()[key] || "other";
  }

  function legacyBucketFromRegex(descricao) {
    var descNorm = norm(descricao);
    var principal = nomeParaCatalogo(descricao);
    var n = norm(principal);
    if (
      RE_ANTIBIOTICO.test(n) ||
      RE_ANTIBIOTICO.test(descNorm) ||
      RE_ANTIFUNGICO.test(n) ||
      RE_ANTIFUNGICO.test(descNorm)
    ) {
      return "antibiotico";
    }
    if (
      RE_ANALGESIA.test(n) ||
      RE_ANALGESIA.test(descNorm) ||
      RE_ANTIESPASM.test(n) ||
      RE_ANTIESPASM.test(descNorm)
    ) {
      return "analgesia";
    }
    return null;
  }

  function defaultSummarize(item) {
    var d = item && item.descricao != null ? String(item.descricao) : "";
    return d.replace(/^\d+\s*[-–—]\s*/, "").trim();
  }

  function pushSparse(bag, key, value) {
    if (!key || !value) return;
    if (!bag[key]) bag[key] = [];
    bag[key].push(value);
  }

  /**
   * @param {Array<{ descricao?: string, descricaoHtml?: string }>} linhasMed
   * @param {{ summarize?: function }} [options]
   * @returns {{ hidratacao: string[], analgesia: string[], antibiotico: string[], categoriasMedicamento: Record<string, string[]> }}
   */
  function classifyPrescricaoMedicamentos(linhasMed, options) {
    var summarize =
      options && typeof options.summarize === "function"
        ? options.summarize
        : defaultSummarize;
    var hidratacao = [];
    var analgesia = [];
    var antibiotico = [];
    var categoriasMedicamento = Object.create(null);
    var catalog = getCatalogApi();
    var list = Array.isArray(linhasMed) ? linhasMed : [];

    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var descricao = item.descricao != null ? String(item.descricao) : "";
      if (!descricao.trim()) continue;

      if (isHidratacao(descricao)) {
        var resumoHv = summarize(item, { isHidratacao: true });
        if (resumoHv) hidratacao.push(resumoHv);
        continue;
      }

      var nome = nomeParaCatalogo(descricao);
      var resolved =
        catalog && catalog.resolveClassForDrugName
          ? catalog.resolveClassForDrugName(nome)
          : { catalogKey: null };
      var catalogKey = resolved && resolved.catalogKey ? resolved.catalogKey : null;
      var categoryKey = catalogKey
        ? resolveCategoryForCode(catalogKey)
        : "unmatched";

      var legacyBucket = null;
      if (categoryKey === "antimicrobial") {
        legacyBucket = "antibiotico";
      } else if (LEGACY_ANALGESIA_CATS[categoryKey]) {
        legacyBucket = "analgesia";
      } else if (!catalogKey) {
        legacyBucket = legacyBucketFromRegex(descricao);
      }

      var resumo = summarize(item, {
        isHidratacao: false,
      });
      if (!resumo) continue;

      pushSparse(categoriasMedicamento, categoryKey, resumo);

      if (legacyBucket === "antibiotico") antibiotico.push(resumo);
      else if (legacyBucket === "analgesia") analgesia.push(resumo);
    }

    return {
      hidratacao: hidratacao,
      analgesia: analgesia,
      antibiotico: antibiotico,
      categoriasMedicamento: categoriasMedicamento,
    };
  }

  /**
   * @param {Record<string, string[]>|null|undefined} categorias
   * @returns {Array<{ key: string, label: string, items: string[] }>}
   */
  function listNonEmptyCategories(categorias) {
    var out = [];
    if (!categorias || typeof categorias !== "object") return out;
    for (var i = 0; i < CATEGORY_DISPLAY_ORDER.length; i++) {
      var key = CATEGORY_DISPLAY_ORDER[i];
      var items = categorias[key];
      if (!Array.isArray(items) || !items.length) continue;
      out.push({
        key: key,
        label: CATEGORY_LABELS_PT[key] || key,
        items: items.slice(),
      });
    }
    var seen = Object.create(null);
    for (var s = 0; s < CATEGORY_DISPLAY_ORDER.length; s++) {
      seen[CATEGORY_DISPLAY_ORDER[s]] = true;
    }
    var extraKeys = Object.keys(categorias);
    for (var e = 0; e < extraKeys.length; e++) {
      var ek = extraKeys[e];
      if (seen[ek]) continue;
      var eitems = categorias[ek];
      if (!Array.isArray(eitems) || !eitems.length) continue;
      out.push({
        key: ek,
        label: CATEGORY_LABELS_PT[ek] || ek,
        items: eitems.slice(),
      });
    }
    return out;
  }

  /** Normaliza objecto esparso (só chaves com ≥1 string não vazia). */
  function normalizeCategoriasMedicamento(raw) {
    var out = Object.create(null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var arr = raw[k];
      if (!Array.isArray(arr)) continue;
      var cleaned = [];
      for (var j = 0; j < arr.length; j++) {
        var s = String(arr[j] == null ? "" : arr[j]).trim();
        if (s) cleaned.push(s);
      }
      if (cleaned.length) out[k] = cleaned;
    }
    return out;
  }

  return {
    OTHER_SPLIT: OTHER_SPLIT,
    CATEGORY_LABELS_PT: CATEGORY_LABELS_PT,
    CATEGORY_DISPLAY_ORDER: CATEGORY_DISPLAY_ORDER,
    isHidratacao: isHidratacao,
    resolveCategoryForCode: resolveCategoryForCode,
    classifyPrescricaoMedicamentos: classifyPrescricaoMedicamentos,
    listNonEmptyCategories: listNonEmptyCategories,
    normalizeCategoriasMedicamento: normalizeCategoriasMedicamento,
  };
});
