/**
 * Formatação de texto exibido em células de exame (matriz web, popup).
 * Testável em Node via module.exports; extensão/web: global AghuExamDisplayFormat.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuExamDisplayFormat = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function normalizeForMatch(s) {
    var t = String(s || "").trim();
    try {
      t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      t = t.replace(/[\u0300-\u036f]/g, "");
    }
    return t.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function resolveSigla(label) {
    if (root.AghuExamSiglas && root.AghuExamSiglas.resolveSigla) {
      return root.AghuExamSiglas.resolveSigla(String(label || "").trim());
    }
    return String(label || "").trim();
  }

  var SEROLOGY_SIGLA_SET = new Set([
    "ANTIHIV",
    "ANTIHBS",
    "ANTIHCV",
    "HBSAG",
    "ANTIHBC",
    "VDRL",
    "FTA",
  ]);

  function isSerologyExamName(examName) {
    var norm = normalizeForMatch(examName);
    if (!norm) return false;
    if (/\bSOROL/.test(norm)) return true;
    if (/\bSORO\b/.test(norm) && /\bHEPATITE\b/.test(norm)) return true;
    if (/\bHEPATITE\s+B\b/.test(norm)) return true;
    if (/\bHEPATITE\b/.test(norm) && /\b(HBSAG|ANTI.?HBC|ANTI.?HBS)\b/.test(norm)) {
      return true;
    }
    if (
      (/\bHIV\b/.test(norm) && !/\bHCV\b/.test(norm)) ||
      /\bANTI.?HIV\b/.test(norm) ||
      /\bANTI.?HCV\b/.test(norm) ||
      /\bANTI.?HBS\b/.test(norm) ||
      /\bANTI.?HBC\b/.test(norm) ||
      /\bHBSAG\b/.test(norm) ||
      /\bVDRL\b/.test(norm) ||
      /\bFTA\b/.test(norm) ||
      /\bSIFILIS\b/.test(norm) ||
      /\bCHAGAS\b/.test(norm)
    ) {
      return true;
    }
    if (/\bEPSTEIN\s*BARR\b/.test(norm) || /\bMONONUCLEOSE\b/.test(norm)) return true;
    if (/\bEBV\b/.test(norm) && /\bIG(G|M)\b/.test(norm)) return true;
    if (/\bVCA\b/.test(norm) && /\bIGG\b/.test(norm)) return true;
    if (/\bELISA\b/.test(norm) && /\b(IGG|IGM)\b/.test(norm)) return true;
    if (/\bANTI\s*LA\b/.test(norm) || /\bANTICORPOS\s+ANTI\s+LA\b/.test(norm)) return true;
    if (/\bANTI\s*SSA\b/.test(norm) || /\bSSA\b/.test(norm) && /\bRO\b/.test(norm)) return true;
    if (/\bSSB\b/.test(norm) || /\bAUTO\s*ANTICORPO/.test(norm)) return true;
    if (/\bANTI\s*RNP\b/.test(norm) || (/\bRNP\b/.test(norm) && /\bANTI\b/.test(norm))) return true;
    var sig = normalizeForMatch(resolveSigla(examName)).replace(/\s+/g, "");
    return SEROLOGY_SIGLA_SET.has(sig);
  }

  function stripGenericResultLabel(line) {
    var t = String(line || "").trim();
    if (!t) return t;
    return t.replace(/^RESULTADO\s*:\s*/i, "").trim();
  }

  function headsMatchExam(head, examName) {
    var h = normalizeForMatch(head);
    var e = normalizeForMatch(examName);
    if (!h || !e) return false;
    if (e.indexOf(h) >= 0 || h.indexOf(e) >= 0) return true;

    var sig = normalizeForMatch(resolveSigla(examName));
    var headSig = normalizeForMatch(resolveSigla(head));
    if (sig && headSig && (sig === headSig || sig.indexOf(headSig) >= 0 || headSig.indexOf(sig) >= 0)) {
      return true;
    }

    if (/\bHIV\b/.test(e) && /\bHIV\b/.test(h)) return true;
    if (/\bHCV\b/.test(e) && /\bHCV\b/.test(h)) return true;
    if (/\bHBSAG\b/.test(e) && /\bHBSAG\b/.test(h)) return true;
    if (/\bHBC\b/.test(e) && /\bHBC\b/.test(h)) return true;
    if (/\bHBS\b/.test(e) && /\bHBS\b/.test(h)) return true;

    return false;
  }

  /** Strip de valor único (ex. TTPA): sigla igual ou nome do exame contém o rótulo — sem h.indexOf(e). */
  function headMatchesExamForValueStrip(head, examName) {
    var h = normalizeForMatch(head);
    var e = normalizeForMatch(examName);
    if (!h || !e) return false;
    if (e.indexOf(h) >= 0) return true;

    var sig = normalizeForMatch(resolveSigla(examName)).replace(/\s+/g, "");
    var headSig = normalizeForMatch(resolveSigla(head)).replace(/\s+/g, "");
    return !!(sig && headSig && sig === headSig);
  }

  function normalizeSerologyResultTail(tail) {
    var t = String(tail || "").trim();
    if (!t) return t;
    t = t.replace(/\bVALOR\s*:\s*/gi, "");
    t = t.replace(/\b(\d+)\.(\d+)\b/g, "$1,$2");
    return t.replace(/\s+/g, " ").trim();
  }

  function stripRedundantAnalyteLabel(line, examName) {
    var t = String(line || "").trim();
    if (!t || !examName) return t;

    var colon = t.match(/^([^:]+):\s*(.+)$/);
    if (!colon) return t;

    var head = colon[1].trim();
    var tail = colon[2].trim();

    if (isSerologyExamName(examName)) {
      if (!headsMatchExam(head, examName)) return t;
      if (/^valor\s*:/i.test(tail)) return normalizeSerologyResultTail(tail);
      return normalizeSerologyResultTail(tail) || t;
    }

    if (!headMatchesExamForValueStrip(head, examName)) return t;
    return tail || t;
  }

  function isUrine24hQuantExamName(examName) {
    var lab = root.AghuPdfLabParse;
    if (lab && lab.isUrine24hQuantExamName) {
      return lab.isUrine24hQuantExamName(examName);
    }
    var sig = resolveSigla(examName);
    return sig === "MicroAlb" || sig === "ProtU";
  }

  /**
   * Painel multi-analito (bilirrubina, TP+INR): preservar rótulos em cada linha.
   * @param {string[]} lines
   * @returns {boolean}
   */
  function hasMultipleLabeledSubitems(lines) {
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || "").trim();
      if (!line || isLegendDisplayLine(line)) continue;
      if (/^[^:]+:\s*.+/.test(line)) {
        count += 1;
        if (count >= 2) return true;
      }
    }
    return false;
  }

  function isLegendDisplayLine(line) {
    var t = String(line || "").trim();
    if (!t) return true;
    var lab = root.AghuPdfLabParse;
    if (lab && lab.isAlbuminuriaClassificationLegendLine && lab.isAlbuminuriaClassificationLegendLine(t)) {
      return true;
    }
    if (lab && lab.isQualitativeVrLegendLine && lab.isQualitativeVrLegendLine(t)) {
      return true;
    }
    if (lab && lab.isNumericVrTierLegendLine && lab.isNumericVrTierLegendLine(t)) {
      return true;
    }
    if (/^-?\s*normoalbumin/i.test(t)) return true;
    if (/^-?\s*microalbumin/i.test(t)) return true;
    if (/^-?\s*macroalbumin/i.test(t)) return true;
    if (/^paciente\.?$/i.test(t)) return true;
    if (/^\*?\s*Para adequada interpreta/i.test(t)) return true;
    return false;
  }

  /**
   * @param {string} text
   * @param {string} [examName]
   * @returns {string}
   */
  function formatExamCellDisplay(text, examName) {
    var raw = String(text || "").trim();
    if (!raw || raw === "—") return raw;

    if (isUrine24hQuantExamName(examName)) {
      var lab = root.AghuPdfLabParse;
      if (lab && lab.filterUrine24hQuantParsedText) {
        var filtered = lab.filterUrine24hQuantParsedText(raw);
        if (filtered) raw = filtered;
      }
    }

    var lines = raw.split(/\r?\n/);
    var preserveSubitemLabels = hasMultipleLabeledSubitems(lines);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (isLegendDisplayLine(line)) continue;
      if (!isUrine24hQuantExamName(examName)) {
        line = stripGenericResultLabel(line);
      }
      if (!preserveSubitemLabels) {
        line = stripRedundantAnalyteLabel(line, examName || "");
      }
      if (line && isSerologyExamName(examName)) {
        line = normalizeSerologyResultTail(line);
      }
      var pqtFmt = root.AghuExamPlaquetasFormat;
      if (line && pqtFmt && typeof pqtFmt.formatPlaquetasDisplay === "function") {
        var isPqtLine =
          (pqtFmt.isPlaquetasAnalyte && pqtFmt.isPlaquetasAnalyte(line)) ||
          /^[\d.]+\s*\/µL\s*$/i.test(line);
        if (isPqtLine) {
          var formatted = pqtFmt.formatPlaquetasDisplay(line);
          line = /^PLAQUETAS\s*:/i.test(line)
            ? "PLAQUETAS: " + formatted.replace(/^PLAQUETAS\s*:\s*/i, "")
            : "PLAQUETAS: " + formatted;
        }
      }
      if (line) out.push(line);
    }

    if (!out.length) return "";
    if (out.length === 1) return out[0];
    return out.join("\n");
  }

  return {
    isSerologyExamName: isSerologyExamName,
    isUrine24hQuantExamName: isUrine24hQuantExamName,
    stripGenericResultLabel: stripGenericResultLabel,
    stripRedundantAnalyteLabel: stripRedundantAnalyteLabel,
    normalizeSerologyResultTail: normalizeSerologyResultTail,
    isLegendDisplayLine: isLegendDisplayLine,
    hasMultipleLabeledSubitems: hasMultipleLabeledSubitems,
    formatExamCellDisplay: formatExamCellDisplay,
  };
});
