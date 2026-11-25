/**
 * Categorias clínicas de painéis de exame (matriz web, passômetro, popup).
 * Browser/extensão: implementação inline abaixo. Web App Router: ver exam-categories.mjs.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamCategories = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var hemogramMatrixApi = null;
  if (typeof require === "function") {
    try {
      hemogramMatrixApi = require("./hemogram-matrix.js");
    } catch (_e) {
      /* ignore */
    }
  }
  if (
    !hemogramMatrixApi &&
    typeof globalThis !== "undefined" &&
    globalThis.AghuHemogramMatrix
  ) {
    hemogramMatrixApi = globalThis.AghuHemogramMatrix;
  }

  function isPartialHemogramPanel(examName) {
    if (hemogramMatrixApi && hemogramMatrixApi.isPartialHemogramPanel) {
      return hemogramMatrixApi.isPartialHemogramPanel(examName);
    }
    var n = String(examName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (!n || /\bHEMOGRAMA\b/.test(n)) return false;
    return (
      /\bHEMATOCRITO\b/.test(n) &&
      /\bHEMOGLOBINA\b/.test(n) &&
      /\bLEUCOCITOS\b/.test(n) &&
      /\bPLAQUETAS\b/.test(n)
    );
  }

  function hemogramMatrixRowSortIndex(examName) {
    if (hemogramMatrixApi && hemogramMatrixApi.hemogramMatrixRowSortIndex) {
      return hemogramMatrixApi.hemogramMatrixRowSortIndex(examName);
    }
    if (/\bHEMOGRAMA\b/.test(String(examName || "").toUpperCase())) return 0;
    if (isPartialHemogramPanel(examName)) return 1;
    return 9000;
  }

  var resolveSigla = function (label) {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuExamSiglas &&
      typeof globalThis.AghuExamSiglas.resolveSigla === "function"
    ) {
      return globalThis.AghuExamSiglas.resolveSigla(label);
    }
    return String(label || "").trim();
  };

  var GASO_CHART_SIGLA_ORDER = [
    "PaO2", "pH", "PaCO2", "StO2", "HCO3", "Lact", "PF", "BE", "Gaso",
    "O2Hb", "COHb", "HHb", "MetHb", "tHb", "ctO2", "P50", "Osm", "nBili", "AG",
  ];
  var GASO_CHART_SIGLAS = new Set(GASO_CHART_SIGLA_ORDER);

  var EXAM_PANEL_CATEGORIES = [
    { id: "gaso_arterial", label: "GASO", subtitle: "arterial" },
    { id: "gaso_venosa", label: "GASO", subtitle: "venosa" },
    { id: "hemograma", label: "HEMO", subtitle: "hemograma" },
    { id: "coagulacao", label: "COAG", subtitle: "coagulação" },
    { id: "funcao_renal", label: "FUNÇÃO RENAL", subtitle: null },
    { id: "eletrolitos", label: "ELETRÓLITOS", subtitle: null },
    { id: "bioquimica", label: "BIOQUÍMICA", subtitle: null },
    { id: "metabolismo", label: "METABOLISMO", subtitle: null },
    { id: "marcadores", label: "MARCADORES", subtitle: null },
    { id: "perfil_nutri", label: "PERFIL NUTRI", subtitle: null },
    { id: "hormonal", label: "HORMONAL", subtitle: null },
    { id: "sorologia", label: "SOROLOGIA", subtitle: null },
    { id: "urina", label: "URINA", subtitle: null },
    { id: "outros", label: "OUTROS", subtitle: null },
  ];

  var PANEL_ORDER_BY_CATEGORY = {
    gaso_arterial: GASO_CHART_SIGLA_ORDER.slice(),
    gaso_venosa: GASO_CHART_SIGLA_ORDER.slice(),
    hemograma: ["Hb", "Ht", "Leuco", "Bast", "Seg", "Linf", "Pqt", "Hemograma", "He", "Eritro", "VCM", "HCM", "CHCM", "RDW", "Mono", "Eos", "Baso"],
    coagulacao: ["TTPa", "TP", "INR", "Fibr", "D-Di"],
    funcao_renal: ["U", "Cr", "CrU"],
    eletrolitos: ["Na", "K", "P", "Cl", "Mg", "Ca", "CaT", "CaI", "HCO3"],
    bioquimica: ["TGO", "TGP", "GGT", "FA", "Amil", "Lip", "BT", "BD", "BI", "LDH"],
    metabolismo: ["Gli", "HbA1c", "CT", "HDL", "LDL", "TG", "AU", "Lact"],
    marcadores: ["PCR", "VHS", "PCT", "Trop", "CK-MB", "CK", "BNP", "proBNP", "CEA", "AFP", "CA19-9"],
    perfil_nutri: ["PreAlb", "PT", "Alb", "Glob", "Fe", "Ferr", "TIBC", "IST", "Transferrina", "B12", "VitD", "Fol", "PTH"],
    hormonal: ["TSH", "T4L", "T3L", "Cort"],
    sorologia: ["ANTIHIV", "ANTIHCV", "HBSAG", "ANTIHBC", "ANTIHBS", "VDRL", "FTA"],
    urina: ["EAS", "Urocult", "Hemocult", "ProtU", "MicroAlb", "RAC", "RPTCr"],
    outros: [],
  };

  var SIGLA_TO_STATIC_GROUP = (function () {
    var map = new Map();
    var groupIds = Object.keys(PANEL_ORDER_BY_CATEGORY);
    for (var g = 0; g < groupIds.length; g++) {
      var groupId = groupIds[g];
      if (groupId === "gaso_arterial" || groupId === "gaso_venosa") continue;
      var siglas = PANEL_ORDER_BY_CATEGORY[groupId];
      for (var s = 0; s < siglas.length; s++) {
        if (!map.has(siglas[s])) map.set(siglas[s], groupId);
      }
    }
    return map;
  })();

  var SEROLOGY_SIGLAS = new Set(["ANTIHIV", "ANTIHBS", "ANTIHCV", "HBSAG", "ANTIHBC", "VDRL", "FTA"]);
  var URINE_SIGLAS = new Set(["EAS", "Urocult", "Hemocult", "ProtU", "MicroAlb", "RAC", "RPTCr"]);
  var BIOQUIMICA_SIGLA_SET = new Set(PANEL_ORDER_BY_CATEGORY.bioquimica);

  var PANEL_SIGLA_SORT_ORDER = (function () {
    var byCat = new Map();
    var catIds = Object.keys(PANEL_ORDER_BY_CATEGORY);
    for (var c = 0; c < catIds.length; c++) {
      var catId = catIds[c];
      var siglas = PANEL_ORDER_BY_CATEGORY[catId];
      var order = new Map();
      for (var s = 0; s < siglas.length; s++) order.set(siglas[s], s);
      byCat.set(catId, order);
    }
    return byCat;
  })();

  var SIGLA_SORT_ORDER = (function () {
    var order = new Map();
    var i = 0;
    for (var c = 0; c < EXAM_PANEL_CATEGORIES.length; c++) {
      var siglas = PANEL_ORDER_BY_CATEGORY[EXAM_PANEL_CATEGORIES[c].id] || [];
      for (var s = 0; s < siglas.length; s++) order.set(siglas[s], i++);
    }
    return order;
  })();

  var CATEGORY_SORT_INDEX = (function () {
    var map = new Map();
    for (var i = 0; i < EXAM_PANEL_CATEGORIES.length; i++) {
      map.set(EXAM_PANEL_CATEGORIES[i].id, i);
    }
    return map;
  })();

  var CATEGORY_BY_ID = (function () {
    var map = new Map();
    for (var i = 0; i < EXAM_PANEL_CATEGORIES.length; i++) {
      var cat = EXAM_PANEL_CATEGORIES[i];
      map.set(cat.id, cat);
    }
    return map;
  })();

  function normalizeForMatch(s) {
    var t = String(s || "").trim();
    try {
      t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      t = t.replace(/[\u0300-\u036f]/g, "");
    }
    return t.toUpperCase();
  }

  function isGasometryContext(examName, sample) {
    var name = normalizeForMatch(examName);
    var sampleNorm = sample ? normalizeForMatch(sample) : "";
    var combined = (name + " " + sampleNorm).trim();
    return (
      /\bGASOS?METRIA\b/.test(combined) ||
      /\bARTERIAL\b/.test(sampleNorm) ||
      /\bVENOSO\b/.test(sampleNorm) ||
      /\bVENOSA\b/.test(sampleNorm)
    );
  }

  function inferGasometryChannel(examName, sample) {
    var examUp = normalizeForMatch(examName);
    var sampleUp = sample ? normalizeForMatch(sample) : "";
    if (
      sampleUp.indexOf("VENOSO") >= 0 ||
      sampleUp.indexOf("VENOSA") >= 0 ||
      examUp.indexOf("VENOSO") >= 0 ||
      examUp.indexOf("VENOSA") >= 0
    ) {
      return "venous";
    }
    if (
      sampleUp.indexOf("ARTERIAL") >= 0 ||
      examUp.indexOf("ARTERIAL") >= 0 ||
      isGasometryContext(examName, sample)
    ) {
      return "arterial";
    }
    return null;
  }

  function gasoGroupForChannel(channel) {
    return channel === "venous" ? "gaso_venosa" : "gaso_arterial";
  }

  function classifyExamPanel(examName, sample) {
    var name = normalizeForMatch(examName);
    var sampleNorm = sample ? normalizeForMatch(sample) : "";
    var combined = (name + " " + sampleNorm).trim();

    if (/\bGASOS?METRIA\b/.test(combined)) {
      return gasoGroupForChannel(inferGasometryChannel(examName, sample) || "arterial");
    }
    if (/\bHEMOGRAMA\b/.test(combined)) return "hemograma";
    if (isPartialHemogramPanel(examName)) return "hemograma";

    if (
      /\bCOAGUL/.test(combined) ||
      /\bPROTROMBIN/.test(combined) ||
      /\bTROMBOPLASTIN/.test(combined) ||
      /\bFIBRINOG/.test(combined) ||
      /\bD-?DIMERO\b/.test(combined) ||
      /\bINR\b/.test(combined) ||
      /\bRNI\b/.test(combined) ||
      /\bTTPA\b/.test(combined) ||
      /\bPTTK\b/.test(combined) ||
      /\bTAP\b/.test(combined)
    ) {
      return "coagulacao";
    }

    if (
      /\bVITAMINA\b/.test(combined) ||
      /\bFERRITINA\b/.test(combined) ||
      /\bFERRO\b/.test(combined) ||
      /\bPTH\b/.test(combined) ||
      /\bPREALBUMINA\b/.test(combined) ||
      /\bPRE-?ALBUMINA\b/.test(combined) ||
      /\bTRANSFERRINA\b/.test(combined) ||
      /\bGLOBULIN/.test(combined) ||
      (/\bALBUMINA\b/.test(combined) && !/\bURIN/.test(combined)) ||
      /\bPROTEINAS TOTAIS\b/.test(combined)
    ) {
      return "perfil_nutri";
    }

    if (
      /\bTSH\b/.test(combined) ||
      /\bT4\s*L/.test(combined) ||
      /\bT3\s*L/.test(combined) ||
      /\bCORTISOL\b/.test(combined) ||
      /\bHORMON/.test(combined)
    ) {
      return "hormonal";
    }

    if (
      /\bCEA\b/.test(combined) ||
      /\b(ALFAFETOPROTEINA|ALFAFETO)\b/.test(combined) ||
      /\bAFP\b/.test(combined) ||
      /\bCA\s*19\s*-?\s*9\b/.test(combined) ||
      /\bPROTEINA C REATIVA\b/.test(combined) ||
      (/\bPCR\b/.test(combined) && !/\bPROCALCITONINA\b/.test(combined)) ||
      /\bVHS\b/.test(combined) ||
      /\bPCT\b/.test(combined) ||
      /\bPROCALCITONINA\b/.test(combined) ||
      /\bTROPONINA\b/.test(combined) ||
      /\bCK-?MB\b/.test(combined) ||
      /\bBNP\b/.test(combined) ||
      /\bPROBNP\b/.test(combined)
    ) {
      return "marcadores";
    }

    if (
      /\bSOROL/.test(combined) ||
      /\bANTI.?HIV\b/.test(combined) ||
      /\bANTI.?HCV\b/.test(combined) ||
      /\bANTI.?HBS\b/.test(combined) ||
      /\bANTI.?HBC\b/.test(combined) ||
      /\bHBSAG\b/.test(combined) ||
      /\bVDRL\b/.test(combined) ||
      /\bFTA\b/.test(combined) ||
      /\bSIFILIS\b/.test(combined) ||
      (/\bHEPATITE\b/.test(combined) && /\b(HBSAG|ANTI.?HBC|ANTI.?HBS)\b/.test(combined))
    ) {
      return "sorologia";
    }

    if (
      /\bEAS\b/.test(combined) ||
      /\bUROCULT/.test(combined) ||
      /\bHEMOCULT/.test(combined) ||
      /\bPROTEINURIA\b/.test(combined) ||
      /\bMICROALBUMIN/.test(combined) ||
      /\bRELA[ÇC][AÃ]O\s+ALBUMINA\s*\/?\s*CREATININA\b/.test(combined) ||
      (/\bURIN/.test(combined) &&
        (/\bCULTURA\b/.test(combined) ||
          /\bELEMENTOS\b/.test(combined) ||
          /\bSEDIMENTO\b/.test(combined) ||
          /\bPARCIAL\b/.test(combined)))
    ) {
      return "urina";
    }

    var sigla = resolveSigla(examName);
    var gasoChannel = inferGasometryChannel(examName, sample);

    if (sigla && GASO_CHART_SIGLAS.has(sigla)) {
      if (sigla === "HCO3" || sigla === "Lact") {
        if (gasoChannel || isGasometryContext(examName, sample)) {
          return gasoGroupForChannel(gasoChannel || "arterial");
        }
      } else if (gasoChannel) {
        return gasoGroupForChannel(gasoChannel);
      } else if (isGasometryContext(examName, sample)) {
        return gasoGroupForChannel(inferGasometryChannel(examName, sample) || "arterial");
      } else if (sigla !== "HCO3" && sigla !== "Lact") {
        return "gaso_arterial";
      }
    }

    if (sigla === "HCO3") return "eletrolitos";
    if (sigla === "Lact") return "metabolismo";

    if (sigla && SIGLA_TO_STATIC_GROUP.has(sigla)) {
      return SIGLA_TO_STATIC_GROUP.get(sigla);
    }
    if (sigla && SEROLOGY_SIGLAS.has(sigla)) return "sorologia";
    if (sigla && URINE_SIGLAS.has(sigla)) return "urina";

    if (/\bCREATININA\b/.test(combined) || /\bUREIA\b/.test(combined) || /\bUR[EÉ]IA\b/.test(combined)) {
      return "funcao_renal";
    }
    if (
      /\bCLORO\b/.test(combined) ||
      /\bSODIO\b/.test(combined) ||
      /\bPOTASSIO\b/.test(combined) ||
      /\bMAGNESIO\b/.test(combined) ||
      /\bFOSFORO\b/.test(combined) ||
      /\bBICARBONATO\b/.test(combined)
    ) {
      return "eletrolitos";
    }
    if (
      /\bGLICOSE\b/.test(combined) ||
      /\bGLICEMIA\b/.test(combined) ||
      /\bCOLESTEROL\b/.test(combined) ||
      /\bTRIGLIC/.test(combined) ||
      /\bACIDO URICO\b/.test(combined) ||
      /\bLACTATO\b/.test(combined)
    ) {
      return "metabolismo";
    }
    if (
      /\bTGO\b/.test(combined) ||
      /\bTGP\b/.test(combined) ||
      /\bGGT\b/.test(combined) ||
      /\bFOSFATASE ALCALINA\b/.test(combined) ||
      /\bBILIRRUBINA\b/.test(combined) ||
      /\bAMILASE\b/.test(combined) ||
      /\bLIPASE\b/.test(combined) ||
      /\bLDH\b/.test(combined) ||
      /\bDHL\b/.test(combined)
    ) {
      return "bioquimica";
    }
    if (/\bACIDO FOLICO\b/.test(combined)) return "perfil_nutri";

    return "outros";
  }

  function categorySortIndex(id) {
    return CATEGORY_SORT_INDEX.has(id) ? CATEGORY_SORT_INDEX.get(id) : 999;
  }

  function categoryById(id) {
    return CATEGORY_BY_ID.get(id);
  }

  function siglaSortIndex(sigla) {
    return SIGLA_SORT_ORDER.has(sigla) ? SIGLA_SORT_ORDER.get(sigla) : 9000;
  }

  function siglaSortIndexForRow(row) {
    var catId = row.rowCategory || classifyExamPanel(String(row.examName || ""), row.sample);
    var sigla = resolveSigla(String(row.examName || ""));
    var catOrder = PANEL_SIGLA_SORT_ORDER.get(catId);
    if (catOrder && catOrder.has(sigla)) return catOrder.get(sigla);
    return 9000;
  }

  function compareExamPanelRows(a, b) {
    var catA = a.rowCategory || classifyExamPanel(String(a.examName || ""), a.sample);
    var catB = b.rowCategory || classifyExamPanel(String(b.examName || ""), b.sample);
    var ia = categorySortIndex(catA);
    var ib = categorySortIndex(catB);
    if (ia !== ib) return ia - ib;
    var ha = hemogramMatrixRowSortIndex(String(a.examName || ""));
    var hb = hemogramMatrixRowSortIndex(String(b.examName || ""));
    if (ha !== hb) return ha - hb;
    var sa = siglaSortIndexForRow(a);
    var sb = siglaSortIndexForRow(b);
    if (sa !== sb) return sa - sb;
    return String(a.examName || "").localeCompare(String(b.examName || ""), "pt-BR", {
      sensitivity: "base",
    });
  }

  function formatCategoryTitle(category) {
    return category.subtitle ? category.label + " (" + category.subtitle + ")" : category.label;
  }

  function groupMatrixRows(rows) {
    var sorted = rows.slice().sort(compareExamPanelRows);
    var byCat = new Map();
    for (var i = 0; i < sorted.length; i++) {
      var row = sorted[i];
      var catId = row.rowCategory || classifyExamPanel(String(row.examName || ""), row.sample);
      if (!byCat.has(catId)) byCat.set(catId, []);
      byCat.get(catId).push(row);
    }
    var out = [];
    for (var c = 0; c < EXAM_PANEL_CATEGORIES.length; c++) {
      var cat = EXAM_PANEL_CATEGORIES[c];
      var rs = byCat.get(cat.id);
      if (rs && rs.length) out.push({ category: cat, rows: rs });
    }
    return out;
  }

  function groupExamList(exams) {
    var sorted = exams.slice().sort(function (a, b) {
      return compareExamPanelRows(
        { examName: String(a.examName || ""), sample: a.sample },
        { examName: String(b.examName || ""), sample: b.sample },
      );
    });
    var byCat = new Map();
    for (var i = 0; i < sorted.length; i++) {
      var exam = sorted[i];
      var catId = classifyExamPanel(String(exam.examName || ""), exam.sample);
      if (!byCat.has(catId)) byCat.set(catId, []);
      byCat.get(catId).push(exam);
    }
    var out = [];
    for (var c = 0; c < EXAM_PANEL_CATEGORIES.length; c++) {
      var cat = EXAM_PANEL_CATEGORIES[c];
      var items = byCat.get(cat.id);
      if (items && items.length) out.push({ category: cat, items: items });
    }
    return out;
  }

  return {
    EXAM_PANEL_CATEGORIES: EXAM_PANEL_CATEGORIES,
    classifyExamPanel: classifyExamPanel,
    categorySortIndex: categorySortIndex,
    categoryById: categoryById,
    compareExamPanelRows: compareExamPanelRows,
    groupMatrixRows: groupMatrixRows,
    groupExamList: groupExamList,
    formatCategoryTitle: formatCategoryTitle,
    categoryDisplayTitle: formatCategoryTitle,
    siglaSortIndex: siglaSortIndex,
    SIGLA_SORT_ORDER: SIGLA_SORT_ORDER,
    BIOQUIMICA_SIGLA_SET: BIOQUIMICA_SIGLA_SET,
  };
});
