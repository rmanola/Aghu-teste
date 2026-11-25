/**
 * Termos sugeridos por linha de cuidado — superfície de entrada do CPI.
 *
 * Os `match.diagnosis.include` / `match.procedure.include` de
 * `lib/cpi-care-lines.js` são as strings que fazem uma linha disparar, mas estão
 * normalizadas (minúsculas, sem acentos) e são ilegíveis como opção clínica.
 * Aqui vivem os rótulos curados que o clínico vê. Cada rótulo continua a casar
 * porque `normalizeTypeKey` remove acentos antes de comparar — «Hérnia inguinal»
 * casa «hernia inguinal».
 *
 * Invariante, verificada em `tests/cpi-care-line-terms.test.mjs`: todo termo
 * atribui exactamente à linha que declara, via `attributeCareLines`. Nunca
 * assumir — a suite falha se um rótulo deixar de casar ou passar a casar duas
 * linhas.
 *
 * Sugestão não é match: este módulo não altera `MATCH_VERSION` nem o catálogo.
 * Sem I/O.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCareLineTerms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var careLinesApi = load("cpi-care-lines.js", "AghuCpiCareLines");

  var DIAGNOSIS = "diagnosis";
  var PROCEDURE = "procedure";

  /**
   * Linhas sem termo de texto, com a razão. Existe para o teste de cobertura
   * distinguir «não tem sugestões de propósito» de «esqueceram-se».
   */
  var LINES_WITHOUT_TERMS = Object.freeze({
    uti_admissao_nao_planeada:
      "atribuída só por icuAdmission.kind estruturado; nunca por texto",
  });

  /**
   * Termos curados. `aliases` alimenta só a pesquisa do combobox — nunca é
   * gravado no diagnóstico nem comparado com o catálogo de match.
   */
  var TERMS = Object.freeze([
    // ---- Cirurgia geral --------------------------------------------------
    {
      careLineId: "cg_apendicite_aguda",
      kind: DIAGNOSIS,
      label: "Apendicite aguda",
      aliases: ["apendicite"],
    },
    {
      careLineId: "cg_apendicite_aguda",
      kind: PROCEDURE,
      label: "Apendicectomia",
    },
    {
      careLineId: "cg_apendicite_aguda",
      kind: PROCEDURE,
      label: "Apendicectomia videolaparoscópica",
      aliases: ["videolaparoscopia", "laparoscopica"],
    },
    {
      careLineId: "cg_colecistite_aguda",
      kind: DIAGNOSIS,
      label: "Colecistite aguda",
    },
    {
      careLineId: "cg_colecistite_aguda",
      kind: DIAGNOSIS,
      label: "Colangite aguda",
    },
    {
      careLineId: "cg_colecistite_aguda",
      kind: PROCEDURE,
      label: "Colecistectomia",
    },
    {
      careLineId: "cg_colecistite_aguda",
      kind: PROCEDURE,
      label: "Colecistectomia videolaparoscópica",
      aliases: ["videolaparoscopia", "laparoscopica"],
    },
    {
      careLineId: "cg_hernias_abdominais",
      kind: DIAGNOSIS,
      label: "Hérnia inguinal",
      aliases: ["HI"],
    },
    {
      careLineId: "cg_hernias_abdominais",
      kind: DIAGNOSIS,
      label: "Hérnia umbilical",
    },
    {
      careLineId: "cg_hernias_abdominais",
      kind: DIAGNOSIS,
      label: "Hérnia incisional",
    },
    {
      careLineId: "cg_hernias_abdominais",
      kind: PROCEDURE,
      label: "Herniorrafia inguinal",
    },
    {
      careLineId: "cg_hernias_abdominais",
      kind: PROCEDURE,
      label: "Hernioplastia incisional",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: DIAGNOSIS,
      label: "Obstrução intestinal",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: DIAGNOSIS,
      label: "Íleo mecânico",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: DIAGNOSIS,
      label: "Abdome agudo obstrutivo",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: PROCEDURE,
      label: "Laparotomia exploradora",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: PROCEDURE,
      label: "Enterectomia",
    },
    {
      careLineId: "cg_abdome_agudo_obstrucao",
      kind: PROCEDURE,
      label: "Lise de aderências",
      aliases: ["aderiolise"],
    },

    // ---- Aparelho digestivo ----------------------------------------------
    {
      careLineId: "cad_cancer_colorretal",
      kind: DIAGNOSIS,
      label: "Neoplasia de cólon",
      aliases: ["CA de colon", "cancro do colon", "adenocarcinoma"],
    },
    {
      careLineId: "cad_cancer_colorretal",
      kind: DIAGNOSIS,
      label: "Câncer colorretal",
      aliases: ["cancro colorretal", "CCR"],
    },
    {
      careLineId: "cad_cancer_colorretal",
      kind: PROCEDURE,
      label: "Colectomia",
    },
    {
      careLineId: "cad_cancer_colorretal",
      kind: PROCEDURE,
      label: "Retossigmoidectomia",
    },
    {
      careLineId: "cad_cancer_colorretal",
      kind: PROCEDURE,
      label: "Amputação abdominoperineal",
      aliases: ["Miles"],
    },
    {
      careLineId: "cad_duodenopancreatectomia",
      kind: PROCEDURE,
      label: "Duodenopancreatectomia (Whipple)",
      aliases: ["DPT", "Whipple"],
    },
    {
      careLineId: "cad_duodenopancreatectomia",
      kind: PROCEDURE,
      label: "Gastroduodenopancreatectomia",
    },
    {
      careLineId: "cad_esofagogastrica",
      kind: DIAGNOSIS,
      label: "Neoplasia gástrica",
      aliases: ["cancer gastrico", "neoplasia de estomago"],
    },
    {
      careLineId: "cad_esofagogastrica",
      kind: DIAGNOSIS,
      label: "Neoplasia esofágica",
      aliases: ["cancer de esofago"],
    },
    {
      careLineId: "cad_esofagogastrica",
      kind: PROCEDURE,
      label: "Gastrectomia",
    },
    {
      careLineId: "cad_esofagogastrica",
      kind: PROCEDURE,
      label: "Esofagectomia",
    },
    {
      careLineId: "cad_esofagogastrica",
      kind: PROCEDURE,
      label: "Esofagogastrectomia",
    },
    {
      careLineId: "cad_cirrose_hepatica",
      kind: DIAGNOSIS,
      label: "Cirrose hepática",
    },
    {
      careLineId: "cad_cirrose_hepatica",
      kind: DIAGNOSIS,
      label: "Hipertensão portal",
    },
    {
      careLineId: "cad_cirrose_hepatica",
      kind: DIAGNOSIS,
      label: "Varizes esofágicas",
    },
    {
      careLineId: "cad_cirrose_hepatica",
      kind: DIAGNOSIS,
      label: "Encefalopatia hepática",
    },
    {
      careLineId: "cad_cirrose_hepatica",
      kind: DIAGNOSIS,
      label: "Ascite",
    },
    {
      careLineId: "cad_pancreatite_aguda",
      kind: DIAGNOSIS,
      label: "Pancreatite aguda",
    },
    {
      careLineId: "cad_pancreatite_aguda",
      kind: DIAGNOSIS,
      label: "Pancreatite aguda biliar",
      aliases: ["pancreatite litiasica"],
    },
    {
      careLineId: "cad_pancreatite_aguda",
      kind: DIAGNOSIS,
      label: "Pancreatite aguda alcoólica",
    },
    {
      careLineId: "cad_pancreatite_aguda",
      kind: DIAGNOSIS,
      label: "Pancreatite necrosante",
      aliases: ["pancreatite necro-hemorragica"],
    },

    // ---- Nefrologia -------------------------------------------------------
    {
      careLineId: "nef_lesao_renal_aguda",
      kind: DIAGNOSIS,
      label: "Lesão renal aguda",
      aliases: ["LRA", "injuria renal aguda", "insuficiencia renal aguda"],
    },
    {
      careLineId: "nef_lesao_renal_aguda",
      kind: DIAGNOSIS,
      label: "Necrose tubular aguda",
      aliases: ["NTA"],
    },
    {
      careLineId: "nef_doenca_renal_cronica",
      kind: DIAGNOSIS,
      label: "Doença renal crónica",
      aliases: ["DRC", "insuficiencia renal cronica"],
    },
    {
      careLineId: "nef_doenca_renal_cronica",
      kind: DIAGNOSIS,
      label: "Nefropatia diabética",
    },
    {
      careLineId: "nef_doenca_renal_cronica",
      kind: DIAGNOSIS,
      label: "Glomerulonefrite crónica",
    },

    // ---- Clínica médica ---------------------------------------------------
    {
      careLineId: "sep_sepse_choque",
      kind: DIAGNOSIS,
      label: "Sepse",
      aliases: ["septicemia", "sepsis"],
    },
    {
      careLineId: "sep_sepse_choque",
      kind: DIAGNOSIS,
      label: "Choque séptico",
    },
  ]);

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /** Slug estável para `id`. Não participa do match. */
  function slug(label) {
    return str(label)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * @returns {{ list: object[], strict: boolean }} `strict` = há catálogo de
   * facto. Sem catálogo (bundle sem o global registado) degradamos para
   * «sugerir tudo» em vez de «não sugerir nada» — a lista vazia seria um
   * silêncio indistinguível de não haver termos.
   */
  function catalogOf(opts) {
    if (opts && Array.isArray(opts.catalog)) {
      return { list: opts.catalog, strict: true };
    }
    var seed = careLinesApi && careLinesApi.CARE_LINES;
    if (Array.isArray(seed) && seed.length) return { list: seed, strict: true };
    return { list: [], strict: false };
  }

  function lineById(catalog, careLineId) {
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i] && str(catalog[i].id) === careLineId) return catalog[i];
    }
    return null;
  }

  /**
   * Termos sugeridos, prontos para um combobox.
   *
   * @param {{ kind?: "diagnosis"|"procedure", specialty?: string,
   *           catalog?: object[], includeRetired?: boolean }} [options]
   * @returns {{ id: string, label: string, aliases: string[],
   *             careLineId: string, careLineLabel: string,
   *             specialty: string, kind: string }[]}
   */
  function listCareLineTerms(options) {
    var opts = options && typeof options === "object" ? options : {};
    var wantKind = str(opts.kind);
    var wantSpecialty = str(opts.specialty);
    var resolved = catalogOf(opts);
    var out = [];

    for (var i = 0; i < TERMS.length; i++) {
      var term = TERMS[i];
      if (wantKind && term.kind !== wantKind) continue;

      var line = lineById(resolved.list, term.careLineId);
      if (!line) {
        // Com catálogo de facto, linha desconhecida não é sugerível: sugerir o
        // que não casa é pior do que não sugerir.
        if (resolved.strict) continue;
        // Sem catálogo não há como filtrar por lifecycle/specialty.
        if (wantSpecialty) continue;
        out.push({
          id: term.careLineId + ":" + slug(term.label),
          label: term.label,
          aliases: asArray(term.aliases).slice(),
          careLineId: term.careLineId,
          careLineLabel: term.careLineId,
          specialty: "",
          kind: term.kind,
        });
        continue;
      }

      if (str(line.lifecycle) === "retired" && !opts.includeRetired) continue;

      var specialty = str(line.specialty);
      if (wantSpecialty && specialty !== wantSpecialty) continue;

      out.push({
        id: term.careLineId + ":" + slug(term.label),
        label: term.label,
        aliases: asArray(term.aliases).slice(),
        careLineId: term.careLineId,
        careLineLabel: line.label != null ? str(line.label) : term.careLineId,
        specialty: specialty,
        kind: term.kind,
      });
    }

    return out;
  }

  /** Ids de linha que declaram, de propósito, não ter termo de texto. */
  function linesWithoutTerms() {
    var out = {};
    for (var key in LINES_WITHOUT_TERMS) {
      if (Object.prototype.hasOwnProperty.call(LINES_WITHOUT_TERMS, key)) {
        out[key] = LINES_WITHOUT_TERMS[key];
      }
    }
    return out;
  }

  return {
    DIAGNOSIS: DIAGNOSIS,
    PROCEDURE: PROCEDURE,
    TERMS: TERMS,
    listCareLineTerms: listCareLineTerms,
    linesWithoutTerms: linesWithoutTerms,
  };
});
