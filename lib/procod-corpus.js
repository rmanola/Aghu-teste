/**
 * FEAT-157 — destilação de padrões de descrição cirúrgica → perfil agregado.
 *
 * Só agregados (secções, n-gramas técnicos, buckets de comprimento).
 * Heurística anti-PHI estendida a partir de scripts/run-agent-golden.mjs.
 * Corpus versionado = sintético; caminho com ciphertext exige flag + JWT + gate.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodCorpus = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Base (T2-AC-06) + identificadores com valor (evita falso positivo em docs
   * que apenas citam as palavras CPF / prontuário / nome completo).
   */
  var PHI_HEURISTIC =
    /\b(paciente\s+real|prontu[aá]rio\s*[:=]?\s*\d{5,}|cpf\s*[:=]?\s*[\d.]{3,}|rg\s*[:=]?\s*\d{3,}|cns\s*[:=]?\s*\d{3,}|nome\s+completo\s+real|nome\s+completo\s*[:=]|data\s*(de\s*)?nasc(imento)?\s*[:=]|dob\s*[:=]|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i;

  var SECTION_KEYS = Object.freeze({
    ACHADOS_OPERATORIOS: "ACHADOS_OPERATORIOS",
    DESCRICAO: "DESCRICAO",
    CIRURGIAS_REALIZADAS: "CIRURGIAS_REALIZADAS",
  });

  var SECTION_HEADER_RE =
    /^(\d+\.?\s*)?(ACHADOS\s+OPERAT\S*|DESCRI[CÇ][AÃ]O|CIRURGIAS?\s+REALIZAD\S*)\s*:?\s*$/i;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function formatShaPrefix(hex) {
    var h = str(hex)
      .toLowerCase()
      .replace(/[^0-9a-f]/g, "")
      .slice(0, 12);
    while (h.length < 12) h += "0";
    // Underscores quebram o padrão de CPF (\d{11}) — o prefixo do hash
    // do perfil sintético não é identificador de paciente.
    return h.slice(0, 4) + "_" + h.slice(4, 8) + "_" + h.slice(8, 12);
  }

  function fold(s) {
    return str(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {string} blob
   * @returns {{ ok: true } | { ok: false, match: string }}
   */
  function checkAntiPhi(blob) {
    var text = str(blob);
    var m = text.match(PHI_HEURISTIC);
    if (m) return { ok: false, match: m[0] };
    return { ok: true };
  }

  function assertNoPhi(blob, label) {
    var r = checkAntiPhi(blob);
    if (!r.ok) {
      throw new Error(
        "possível PHI" +
          (label ? " em " + label : "") +
          " (match=" +
          JSON.stringify(r.match) +
          ")",
      );
    }
  }

  /**
   * @param {string} text
   * @returns {Record<string, string>}
   */
  function splitSyntheticSections(text) {
    var lines = str(text).split(/\r?\n/);
    var out = {
      ACHADOS_OPERATORIOS: [],
      DESCRICAO: [],
      CIRURGIAS_REALIZADAS: [],
    };
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var hdr = raw.match(SECTION_HEADER_RE);
      if (hdr) {
        var name = fold(hdr[2] || hdr[1] || "");
        if (name.indexOf("achados") === 0) current = "ACHADOS_OPERATORIOS";
        else if (name.indexOf("cirurgias") === 0) current = "CIRURGIAS_REALIZADAS";
        else if (name.indexOf("descricao") === 0 || name.indexOf("descri") === 0)
          current = "DESCRICAO";
        else current = null;
        continue;
      }
      if (current) out[current].push(raw);
    }
    return {
      ACHADOS_OPERATORIOS: out.ACHADOS_OPERATORIOS.join("\n").trim(),
      DESCRICAO: out.DESCRICAO.join("\n").trim(),
      CIRURGIAS_REALIZADAS: out.CIRURGIAS_REALIZADAS.join("\n").trim(),
    };
  }

  /**
   * Tokens técnicos (sem stopwords curtas). Unigramas + bigramas.
   * @param {string} text
   * @returns {string[]}
   */
  function technicalNgrams(text) {
    var tokens = fold(text)
      .split(" ")
      .filter(function (t) {
        return t.length >= 4 && !/^\d+$/.test(t);
      });
    var grams = [];
    for (var i = 0; i < tokens.length; i++) {
      grams.push(tokens[i]);
      if (i + 1 < tokens.length) grams.push(tokens[i] + " " + tokens[i + 1]);
    }
    return grams;
  }

  function lengthBucket(n) {
    if (n < 500) return "lt_500";
    if (n <= 1500) return "500_1500";
    return "gt_1500";
  }

  /**
   * Agrega documentos sintéticos (já sem PHI) num perfil.
   * @param {Array<{ id?: string, text: string }>} docs
   * @param {{ source?: string, note?: string }} [opts]
   */
  function aggregateProfile(docs, opts) {
    opts = opts || {};
    if (!Array.isArray(docs) || docs.length === 0) {
      throw new Error("aggregateProfile: docs vazio");
    }

    var sectionChars = {
      ACHADOS_OPERATORIOS: [],
      DESCRICAO: [],
      CIRURGIAS_REALIZADAS: [],
    };
    var ngramCounts = Object.create(null);
    var buckets = { lt_500: 0, "500_1500": 0, gt_1500: 0 };
    var totalLen = 0;

    for (var i = 0; i < docs.length; i++) {
      var text = str(docs[i] && docs[i].text);
      assertNoPhi(text, docs[i] && docs[i].id ? String(docs[i].id) : "doc#" + i);
      var sections = splitSyntheticSections(text);
      var len = text.length;
      totalLen += len;
      buckets[lengthBucket(len)]++;

      Object.keys(sectionChars).forEach(function (k) {
        var body = sections[k] || "";
        sectionChars[k].push(body.length);
        technicalNgrams(body).forEach(function (g) {
          ngramCounts[g] = (ngramCounts[g] || 0) + 1;
        });
      });
    }

    function median(arr) {
      if (!arr.length) return 0;
      var s = arr.slice().sort(function (a, b) {
        return a - b;
      });
      var mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    }

    var n = docs.length;
    var sectionsOut = {};
    Object.keys(sectionChars).forEach(function (k) {
      var sum = sectionChars[k].reduce(function (a, b) {
        return a + b;
      }, 0);
      sectionsOut[k] = {
        weight: totalLen > 0 ? Number((sum / totalLen).toFixed(4)) : 0,
        median_chars: median(sectionChars[k]),
      };
    });

    var ngrams = Object.keys(ngramCounts)
      .map(function (term) {
        return { term: term, count: ngramCounts[term] };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.term.localeCompare(b.term);
      })
      .slice(0, 40);

    return {
      schema_version: 1,
      source: opts.source || "synthetic",
      note: opts.note || "Perfil agregado — sem PHI.",
      doc_count: n,
      sections: sectionsOut,
      technical_ngrams: ngrams,
      length_buckets: {
        lt_500: Number((buckets.lt_500 / n).toFixed(4)),
        "500_1500": Number((buckets["500_1500"] / n).toFixed(4)),
        gt_1500: Number((buckets.gt_1500 / n).toFixed(4)),
      },
      generated_at: new Date().toISOString(),
    };
  }

  return {
    PHI_HEURISTIC: PHI_HEURISTIC,
    SECTION_KEYS: SECTION_KEYS,
    formatShaPrefix: formatShaPrefix,
    checkAntiPhi: checkAntiPhi,
    assertNoPhi: assertNoPhi,
    fold: fold,
    splitSyntheticSections: splitSyntheticSections,
    technicalNgrams: technicalNgrams,
    aggregateProfile: aggregateProfile,
  };
});
