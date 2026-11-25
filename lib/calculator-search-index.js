/**
 * Índice de busca das calculadoras clínicas.
 * @sync web/components/calculators/calculator-search.ts
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuCalculatorSearchIndex = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CALCULATOR_SEARCH_INDEX = [
    {
      id: "tfg",
      title: "TFG estimada (CKD-EPI 2021)",
      keywords: ["tfg", "egfr", "creatinina", "renal", "rim", "ckd", "filtração"],
    },
    {
      id: "meld",
      title: "MELD-Na (hepático)",
      keywords: ["meld", "hepático", "fígado", "biliar", "transplante"],
    },
    {
      id: "child-pugh",
      title: "Child-Pugh (hepático)",
      keywords: ["child", "pugh", "hepático", "cirrose"],
    },
    {
      id: "acid-base",
      title: "Equilíbrio acidobásico",
      keywords: [
        "acidobásico",
        "gasometria",
        "ph",
        "pco2",
        "bicarbonato",
        "anion gap",
        "winter",
      ],
    },
    {
      id: "na-corr",
      title: "Sódio corrigido (hiperglicemia)",
      keywords: ["sódio", "hiperglicemia", "glicose", "hillier"],
    },
    {
      id: "cockcroft",
      title: "Clearance Cockcroft-Gault",
      keywords: ["cockcroft", "clearance", "creatinina", "gault"],
    },
    {
      id: "ldl",
      title: "LDL (Friedewald)",
      keywords: ["ldl", "colesterol", "friedewald", "hdl", "triglicerídeos"],
    },
    {
      id: "ca-corr",
      title: "Cálcio corrigido (albumina)",
      keywords: ["cálcio", "albumina", "corrigido"],
    },
    {
      id: "news2",
      title: "NEWS2",
      keywords: ["news", "news2", "vital", "deterioração", "sepse"],
    },
    {
      id: "qsofa",
      title: "qSOFA",
      keywords: ["qsofa", "sepse", "infecção"],
    },
    {
      id: "fena",
      title: "FENa",
      keywords: ["fena", "sódio", "fracionado", "renal", "oligúria"],
    },
    {
      id: "free-water",
      title: "Déficit de água livre",
      keywords: ["água livre", "hiponatremia", "sódio", "hipernatremia"],
    },
    {
      id: "urea-cr",
      title: "Razão ureia/creatinina",
      keywords: ["ureia", "creatinina", "pré-renal", "bun"],
    },
    {
      id: "curb65",
      title: "CURB-65",
      keywords: ["curb", "pneumonia", "infecção respiratória"],
    },
    {
      id: "chads",
      title: "CHA₂DS₂-VASc",
      keywords: ["chads", "fibrilação", "anticoagulação", "avc", "fa"],
    },
    {
      id: "has-bled",
      title: "HAS-BLED",
      keywords: ["has-bled", "sangramento", "anticoagulação", "risco"],
    },
    {
      id: "padua",
      title: "Padua (TEV — clínico)",
      keywords: ["padua", "tev", "tvp", "tep", "trombo", "profilaxia", "clínico"],
    },
    {
      id: "caprini-2005",
      title: "Caprini 2005 (TEV — cirúrgico)",
      keywords: ["caprini", "2005", "tev", "tvp", "tep", "trombo", "profilaxia", "cirurgia"],
    },
    {
      id: "caprini-2013",
      title: "Caprini 2013 (TEV — cirúrgico)",
      keywords: ["caprini", "2013", "tev", "tvp", "tep", "trombo", "profilaxia", "cirurgia"],
    },
    {
      id: "charlson",
      title: "Charlson (comorbidades)",
      keywords: [
        "charlson",
        "comorbidade",
        "cci",
        "risco",
        "quan",
        "ajuste",
      ],
    },
    {
      id: "asa-ps",
      title: "ASA Physical Status",
      keywords: ["asa", "anestesia", "pré-operatório", "physical status", "risco cirúrgico"],
    },
    {
      id: "kdigo",
      title: "KDIGO LRA (AKI)",
      keywords: ["kdigo", "aki", "lra", "creatinina", "renal", "nefrologia", "diálise"],
    },
    {
      id: "tnm",
      title: "TNM (AJCC-8)",
      keywords: ["tnm", "estádio", "estadio", "oncologia", "ajcc", "colorretal", "gástrico"],
    },
    {
      id: "ecog",
      title: "ECOG Performance Status",
      keywords: ["ecog", "performance", "funcional", "oncologia", "oken"],
    },
    {
      id: "bisap",
      title: "BISAP (pancreatite)",
      keywords: ["bisap", "pancreatite", "bun", "sirs", "wu"],
    },
    {
      id: "tokyo",
      title: "Tokyo Guidelines (TG18)",
      keywords: ["tokyo", "tg18", "colecistite", "colangite", "grau"],
    },
    {
      id: "sofa",
      title: "SOFA (Vincent 1996)",
      keywords: ["sofa", "uti", "sepsis", "disfunção", "vincent", "órgão"],
    },
    {
      id: "apache2",
      title: "APACHE II",
      keywords: ["apache", "uti", "knaus", "gravidade", "aps", "mortalidade"],
    },
    {
      id: "nihss",
      title: "NIHSS",
      keywords: ["nihss", "avc", "stroke", "neurologia", "brott"],
    },
  ];

  function normalizeSearchText(value) {
    var text = value == null ? "" : String(value);
    try {
      return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    } catch (_e) {
      return text.toLowerCase().trim();
    }
  }

  function matchesCalculatorSearch(entry, query) {
    var q = normalizeSearchText(query);
    if (!q) return true;
    var haystack = normalizeSearchText(
      entry.title + " " + entry.keywords.join(" "),
    );
    return haystack.indexOf(q) >= 0;
  }

  function isCalculatorVisible(id, query) {
    var q = normalizeSearchText(query);
    if (!q) return true;
    for (var i = 0; i < CALCULATOR_SEARCH_INDEX.length; i++) {
      if (CALCULATOR_SEARCH_INDEX[i].id === id) {
        return matchesCalculatorSearch(CALCULATOR_SEARCH_INDEX[i], query);
      }
    }
    return true;
  }

  return {
    CALCULATOR_SEARCH_INDEX: CALCULATOR_SEARCH_INDEX,
    matchesCalculatorSearch: matchesCalculatorSearch,
    isCalculatorVisible: isCalculatorVisible,
  };
});
