/**
 * Parsing de vitals do passômetro (entry-level) — CommonJS para lib/extensão.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroVitalsParse = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parsePtNumber(raw) {
    var t = String(raw == null ? "" : raw).trim().replace(",", ".");
    if (!t) return NaN;
    var n = parseFloat(t.replace(/[^\d.+-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function parseRangeOrNumber(raw) {
    var t = String(raw || "").trim();
    if (!t) return null;
    var range = t.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    if (range) {
      var a = parsePtNumber(range[1]);
      var b = parsePtNumber(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }
    var n = parsePtNumber(t);
    return Number.isFinite(n) ? n : null;
  }

  /** Intervalo AGHU → candidatos [min, max]; escalar → [n]. */
  function parseRangeEndpoints(raw) {
    var t = String(raw || "").trim();
    if (!t) return [];
    var range = t.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    if (range) {
      var a = parsePtNumber(range[1]);
      var b = parsePtNumber(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
      return [];
    }
    var n = parsePtNumber(t);
    return Number.isFinite(n) ? [n] : [];
  }

  /** Intervalo → extremo superior (qSOFA/CURB-65 FR). */
  function parseRangeMax(raw) {
    var ends = parseRangeEndpoints(raw);
    if (!ends.length) return null;
    return Math.max.apply(null, ends);
  }

  /** Pares PAS/PAD num texto PA (sistólica/diastólica). */
  function parsePaPairs(raw) {
    var t = String(raw || "").trim();
    if (!t) return [];
    var pairs = [];
    var re = /(\d+)\s*[xX/]\s*(\d+)/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var pas = parseInt(m[1], 10);
      var pad = parseInt(m[2], 10);
      if (Number.isFinite(pas) && Number.isFinite(pad)) {
        pairs.push({ pas: pas, pad: pad });
      }
    }
    return pairs;
  }

  function formatPaPair(p) {
    return p.pad != null && Number.isFinite(p.pad)
      ? p.pas + "/" + p.pad
      : String(p.pas);
  }

  /** 1 par → `136/70`; 2+ pares → min/max por PAS (ex. `112/50 - 136/70`). */
  function formatPaInterval(raw) {
    var pairs = parsePaPairs(raw);
    if (!pairs.length) return String(raw || "").trim();
    if (pairs.length === 1) return formatPaPair(pairs[0]);
    var pMax = pairs.reduce(function (a, b) {
      return b.pas > a.pas ? b : a;
    });
    var pMin = pairs.reduce(function (a, b) {
      return b.pas < a.pas ? b : a;
    });
    if (pMax.pas === pMin.pas) return formatPaPair(pMax);
    return formatPaPair(pMin) + " - " + formatPaPair(pMax);
  }

  /** Todas as PAS num texto PA (pares sistólica/diastólica). */
  function parsePaAllPairs(raw) {
    return parsePaPairs(raw).map(function (p) {
      return p.pas;
    });
  }

  /** Intervalo AGHU (100/60 - 140/90) → PAS mínima; PAD do mesmo par. */
  function parsePaString(raw) {
    var pairs = parsePaPairs(raw);
    if (!pairs.length) return { pas: null, pad: null };
    var minPair = pairs.reduce(function (a, b) {
      return b.pas < a.pas ? b : a;
    });
    return { pas: minPair.pas, pad: minPair.pad };
  }

  function parsePassometroEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return {
        fcBpm: null,
        frIrpm: null,
        spo2Pct: null,
        pas: null,
        tempC: null,
      };
    }
    var pa = parsePaString(entry.pa);
    return {
      fcBpm: parseRangeOrNumber(entry.fc),
      frIrpm: parseRangeOrNumber(entry.fr),
      spo2Pct: parseRangeOrNumber(entry.sato2),
      pas: pa.pas,
      tempC: parseRangeOrNumber(entry.tax),
    };
  }

  function parsePassometroEntryForQsofa(entry) {
    if (!entry || typeof entry !== "object") {
      return {
        fcBpm: null,
        frIrpm: null,
        spo2Pct: null,
        pas: null,
        tempC: null,
      };
    }
    var pa = parsePaString(entry.pa);
    return {
      fcBpm: parseRangeOrNumber(entry.fc),
      frIrpm: parseRangeMax(entry.fr),
      spo2Pct: parseRangeOrNumber(entry.sato2),
      pas: pa.pas,
      tempC: parseRangeOrNumber(entry.tax),
    };
  }

  function scoreRespiratoryRate(rr) {
    if (rr <= 8) return 3;
    if (rr <= 11) return 1;
    if (rr <= 20) return 0;
    if (rr <= 24) return 2;
    return 3;
  }

  function scoreSpo2Scale1(spo2) {
    if (spo2 <= 91) return 3;
    if (spo2 <= 93) return 2;
    if (spo2 <= 95) return 1;
    return 0;
  }

  function scoreSystolicBp(pas) {
    if (pas <= 90) return 3;
    if (pas <= 100) return 2;
    if (pas <= 110) return 1;
    if (pas <= 219) return 0;
    return 3;
  }

  function scoreHeartRate(fc) {
    if (fc <= 40) return 3;
    if (fc <= 50) return 1;
    if (fc <= 90) return 0;
    if (fc <= 110) return 1;
    if (fc <= 130) return 2;
    return 3;
  }

  function scoreTemperature(tempC) {
    if (tempC <= 35) return 3;
    if (tempC <= 36) return 1;
    if (tempC <= 38) return 0;
    if (tempC <= 39) return 1;
    return 2;
  }

  function pickWorstByScore(raw, scoreFn) {
    var candidates = parseRangeEndpoints(raw);
    if (!candidates.length) return null;
    var best = candidates[0];
    var bestScore = scoreFn(best);
    for (var i = 1; i < candidates.length; i++) {
      var v = candidates[i];
      var s = scoreFn(v);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      } else if (s === bestScore && Math.abs(v) > Math.abs(best)) {
        best = v;
      }
    }
    return best;
  }

  function pickWorstPasForNews2(raw) {
    var pairs = parsePaAllPairs(raw);
    if (!pairs.length) return null;
    var bestPas = pairs[0];
    var bestScore = scoreSystolicBp(bestPas);
    for (var j = 1; j < pairs.length; j++) {
      var pas = pairs[j];
      var sc = scoreSystolicBp(pas);
      if (sc > bestScore) {
        bestScore = sc;
        bestPas = pas;
      } else if (sc === bestScore && pas > bestPas) {
        bestPas = pas;
      }
    }
    return bestPas;
  }

  function parsePassometroEntryForNews2(entry) {
    if (!entry || typeof entry !== "object") {
      return {
        fcBpm: null,
        frIrpm: null,
        spo2Pct: null,
        pas: null,
        tempC: null,
      };
    }
    return {
      fcBpm: pickWorstByScore(entry.fc, scoreHeartRate),
      frIrpm: pickWorstByScore(entry.fr, scoreRespiratoryRate),
      spo2Pct: pickWorstByScore(entry.sato2, scoreSpo2Scale1),
      pas: pickWorstPasForNews2(entry.pa),
      tempC: pickWorstByScore(entry.tax, scoreTemperature),
    };
  }

  return {
    parsePtNumber: parsePtNumber,
    parseRangeOrNumber: parseRangeOrNumber,
    parseRangeEndpoints: parseRangeEndpoints,
    parseRangeMax: parseRangeMax,
    parsePaPairs: parsePaPairs,
    formatPaInterval: formatPaInterval,
    parsePaAllPairs: parsePaAllPairs,
    parsePaString: parsePaString,
    parsePassometroEntry: parsePassometroEntry,
    parsePassometroEntryForQsofa: parsePassometroEntryForQsofa,
    parsePassometroEntryForNews2: parsePassometroEntryForNews2,
    pickWorstByScore: pickWorstByScore,
    pickWorstPasForNews2: pickWorstPasForNews2,
  };
});
