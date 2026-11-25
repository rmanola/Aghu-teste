/**
 * Derivação parcial do Charlson a partir de diagnoses[].texto (PT-BR).
 * @sync web/lib/patient-records/charlson-from-text.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuCharlsonFromText = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod = loadMod(root, "charlson-score.js", "AghuCharlsonScore");
  var computeCharlson = _mod && _mod.computeCharlson;

  /** Incrementar ao alterar o dicionário (invalida agregados derivados). */
  var TERMS_VERSION = 1;

  var NEGATION_RE =
    /\b(sem|nao|não|nega|negativo|ausencia|ausência|descarta)\b/i;

  /**
   * Termos não ambíguos (ordem: mais específico primeiro dentro da mesma condição).
   * @type {Array<{ condition: string, patterns: RegExp[] }>}
   */
  var TERM_RULES = [
    {
      condition: "diabetes_complicated",
      patterns: [
        /diabetes[^\n]{0,40}(nefropat|retinopat|neuropat|complicad)/i,
        /dm\s*2?[^\n]{0,40}(nefropat|retinopat|neuropat|complicad)/i,
      ],
    },
    {
      condition: "diabetes_uncomplicated",
      patterns: [
        /\bdiabetes mellitus\b/i,
        // exclui "diabetes insipidus" (condição endócrina não relacionada
        // ao Charlson) do termo genérico "diabetes"
        /\bdiabetes\b(?!\s+insipidus)/i,
        /\bdm2\b/i,
        /\bdm\s*2\b/i,
        /\bdm\b/i,
      ],
    },
    {
      condition: "congestive_heart_failure",
      patterns: [
        /\binsufici[eê]ncia card[ií]aca\b/i,
        /\bicc\b/i,
        /\bic\s+congestiva\b/i,
      ],
    },
    {
      condition: "chronic_pulmonary_disease",
      patterns: [/\bdpoc\b/i, /\bdoen[cç]a pulmonar obstrutiva\b/i],
    },
    {
      condition: "myocardial_infarction",
      patterns: [
        /\binfarto\b/i,
        /\biam\b/i,
        /\benfarte\b/i,
        /\binfarto do mioc[aá]rdio\b/i,
      ],
    },
    {
      condition: "cerebrovascular_disease",
      patterns: [/\bavc\b/i, /\bait\b/i, /\bacidente vascular\b/i],
    },
    {
      condition: "dementia",
      patterns: [/\bdem[eê]ncia\b/i, /\balzheimer\b/i],
    },
    {
      condition: "peripheral_vascular_disease",
      patterns: [
        /\bdoen[cç]a vascular perif[eé]rica\b/i,
        /\bclaudica[cç]/i,
      ],
    },
    {
      condition: "rheumatologic_disease",
      patterns: [
        /\bartrite reumat[oó]ide\b/i,
        /\bl[uú]pus\b/i,
        /\breumatol/i,
      ],
    },
    {
      condition: "peptic_ulcer_disease",
      patterns: [/\b[uú]lcera p[eé]ptica\b/i, /\b[uú]lcera g[aá]strica\b/i],
    },
    {
      condition: "liver_severe",
      patterns: [
        /\bcirrose\b[^\n]{0,30}(descompensad|ascite|encefalopat)/i,
        /\bdoen[cç]a hep[aá]tica grave\b/i,
      ],
    },
    {
      condition: "liver_mild",
      patterns: [
        /\bhepatite cr[oô]nica\b/i,
        /\bdoen[cç]a hep[aá]tica leve\b/i,
        /\bcirrose\b/i,
      ],
    },
    {
      condition: "hemiplegia_paraplegia",
      patterns: [/\bhemiplegia\b/i, /\bparaplegia\b/i],
    },
    {
      condition: "chronic_kidney_disease",
      patterns: [
        /\bdoen[cç]a renal cr[oô]nica\b/i,
        /\bdrc\b/i,
        /\binsufici[eê]ncia renal cr[oô]nica\b/i,
      ],
    },
    {
      condition: "metastatic_solid_tumor",
      patterns: [
        /\bmet[aá]stase\b/i,
        /\btumor s[oó]lido metast/i,
        /\bc[aâ]ncer metast/i,
      ],
    },
    {
      condition: "malignancy",
      patterns: [
        /\bneoplasia\b/i,
        /\bc[aâ]ncer\b/i,
        /\bcarcinoma\b/i,
        /\btumor maligno\b/i,
      ],
    },
    {
      condition: "aids_hiv",
      patterns: [/\baids\b/i, /\bhiv\b/i, /\bvih\b/i, /\bsida\b/i],
    },
  ];

  /** Delimitadores de cláusula usados só para escopar a negação (não para
   * dividir o texto antes do match — padrões como liver_severe precisam ver
   * a string inteira para casar comorbidade + qualificador com vírgula). */
  var CLAUSE_BOUNDARY_RE = /[,;]| e | mas /gi;

  /**
   * Início da cláusula que contém `idx` — a posição logo após o delimitador
   * de cláusula mais próximo antes de `idx`, ou 0 se não houver nenhum.
   */
  function findClauseStart(texto, idx) {
    CLAUSE_BOUNDARY_RE.lastIndex = 0;
    var lastBoundaryEnd = 0;
    var m;
    while ((m = CLAUSE_BOUNDARY_RE.exec(texto)) !== null) {
      if (m.index >= idx) break;
      lastBoundaryEnd = m.index + m[0].length;
    }
    return lastBoundaryEnd;
  }

  /**
   * Negação só conta se o termo de negação aparecer na mesma cláusula do
   * match (entre o início da cláusula e o início do match) — evita que
   * "sem X, mas com Y" descarte Y também.
   */
  function isNegatedAt(texto, matchIndex) {
    var clauseStart = findClauseStart(texto, matchIndex);
    return NEGATION_RE.test(texto.slice(clauseStart, matchIndex));
  }

  /**
   * Todas as condições (não-negadas, deduplicadas) que casarem em `texto`.
   * Ao contrário da versão anterior, não para na primeira regra que casar —
   * um único texto livre pode mencionar várias comorbidades.
   */
  function matchConditionsInText(texto) {
    if (!texto || !String(texto).trim()) return [];
    var found = [];
    var seen = Object.create(null);
    for (var i = 0; i < TERM_RULES.length; i++) {
      var rule = TERM_RULES[i];
      for (var j = 0; j < rule.patterns.length; j++) {
        var match = rule.patterns[j].exec(texto);
        if (match && !isNegatedAt(texto, match.index)) {
          if (!seen[rule.condition]) {
            seen[rule.condition] = true;
            found.push(rule.condition);
          }
          break;
        }
      }
    }
    return found;
  }

  /**
   * @param {Array<{ texto?: string }|string>} diagnoses
   */
  function computeCharlsonFromText(diagnoses) {
    var list = Array.isArray(diagnoses) ? diagnoses : [];
    var matched = [];
    var unmatched = [];
    var conditions = [];
    var seenCond = Object.create(null);
    var textCount = 0;

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var texto =
        typeof item === "string"
          ? item
          : item && item.texto != null
            ? String(item.texto)
            : "";
      var trimmed = texto.trim();
      if (!trimmed) continue;
      textCount += 1;
      var itemConditions = matchConditionsInText(trimmed);
      if (itemConditions.length > 0) {
        matched.push({
          texto: trimmed,
          condition: itemConditions[0],
          conditions: itemConditions,
        });
        for (var c = 0; c < itemConditions.length; c++) {
          if (!seenCond[itemConditions[c]]) {
            seenCond[itemConditions[c]] = true;
            conditions.push(itemConditions[c]);
          }
        }
      } else {
        unmatched.push(trimmed);
      }
    }

    if (textCount === 0) {
      return {
        total: null,
        band: null,
        points: {},
        matched: [],
        unmatched: [],
        coverage: null,
        confidence: "none",
        termsVersion: TERMS_VERSION,
      };
    }

    var score = computeCharlson({ conditions: conditions });
    var coverage = matched.length / textCount;
    var confidence = coverage >= 0.5 ? "medium" : "low";

    return {
      total: score.total,
      band: score.band,
      points: score.points,
      matched: matched,
      unmatched: unmatched,
      coverage: coverage,
      confidence: confidence,
      termsVersion: TERMS_VERSION,
    };
  }

  return {
    TERMS_VERSION: TERMS_VERSION,
    computeCharlsonFromText: computeCharlsonFromText,
  };
});
