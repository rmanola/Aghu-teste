/**
 * Último valor numérico de analitos nos exames + filtros séricos/urinários.
 * @sync web/lib/patient-records/exam-latest-value.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuExamLatestValue = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var URINE_PANEL_SIGLAS = {
    MicroAlb: true,
    ProtU: true,
    RAC: true,
    RPTCr: true,
    CrU: true,
  };

  var RE_UNIT =
    /\s*(mg\/dL|mg\/dl|g\/dL|g\/dl|mmol\/L|µmol\/L|μmol\/L|umol\/L|mEq\/L)\s*$/i;

  function getSiglas() {
    return root.AghuExamSiglas || null;
  }

  function getResultResolve() {
    return root.AghuExamResultResolve || null;
  }

  function parsePtNumber(s) {
    var locale = root.AghuParseLocaleNumber;
    if (locale && locale.parsePtNumber) return locale.parsePtNumber(s);
    if (typeof require === "function") {
      try {
        return require("./parse-locale-number.js").parsePtNumber(s);
      } catch (_e) {}
    }
    return NaN;
  }

  function resolveSigla(label) {
    var sig = getSiglas();
    if (sig && sig.resolveSigla) return sig.resolveSigla(label);
    return String(label || "").trim();
  }

  function examResultText(exam) {
    var resolve = getResultResolve();
    if (resolve && resolve.resolveExamDisplayText) {
      return resolve.resolveExamDisplayText(exam, { mutate: false });
    }
    return String(
      exam.fetchedResult || exam.result || exam.detailText || "",
    ).trim();
  }

  function normalizeForMatch(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function hasUrineMarker(text) {
    var up = normalizeForMatch(text);
    return /\bURIN/.test(up) || /\bMATERIAL\s+URINA\b/.test(up);
  }

  function hasUrine24hMarker(text) {
    var up = normalizeForMatch(text);
    if (/URINA\s+DE\s+24/.test(up)) return true;
    if (/URIN/.test(up) && /\b24\s*H/.test(up)) return true;
    if (/MATERIAL\s+URINA\s+DE\s+24/.test(up)) return true;
    return false;
  }

  function inferSampleSeriesChannel(examName, sample, resultText) {
    var examUp = normalizeForMatch(examName);
    var sampleUp = sample ? normalizeForMatch(sample) : "";
    var resultUp = resultText ? normalizeForMatch(resultText) : "";

    if (
      hasUrine24hMarker(sampleUp) ||
      hasUrine24hMarker(examUp) ||
      hasUrine24hMarker(resultUp) ||
      (/MICROALBUMIN|PROTEINURIA/.test(examUp) &&
        /URIN/.test(examUp) &&
        /24/.test(examUp))
    ) {
      return "urine_24h";
    }
    if (
      hasUrineMarker(sampleUp) ||
      hasUrineMarker(examUp) ||
      /\bMATERIAL\s+URINA\b/.test(resultUp)
    ) {
      return "urine";
    }
    return null;
  }

  function isNonSerumSampleExam(exam) {
    var examName = String(exam.examName || "");
    var sample = String(exam.sample || "");
    var resultText = examResultText(exam);
    var channel = inferSampleSeriesChannel(examName, sample, resultText);
    if (channel === "urine" || channel === "urine_24h") return true;
    var nameSigla = resolveSigla(examName);
    if (URINE_PANEL_SIGLAS[nameSigla]) return true;
    if (/URIN/i.test(examName)) return true;
    return false;
  }

  function parseNumericValue(text) {
    var t = String(text || "").trim();
    if (!t) return null;

    var unitMatch = t.match(RE_UNIT);
    var unit = unitMatch ? unitMatch[1] : undefined;
    var numPart = unitMatch ? t.slice(0, unitMatch.index).trim() : t;

    if (numPart.indexOf(":") >= 0) {
      var pieces = numPart.split(":");
      numPart = pieces[pieces.length - 1].trim();
    }

    numPart = numPart.replace(/\s+VR\s*:.*$/i, "").trim();
    var m = numPart.match(/[-+]?\d[\d.,]*/);
    if (!m) return null;
    var value = parsePtNumber(m[0]);
    if (!Number.isFinite(value)) return null;
    return unit ? { value: value, unit: unit } : { value: value };
  }

  function ensureColetaFields(exam) {
    var row = Object.assign({}, exam);
    if (!row.dataColetaISO && row.dataColetaLabel) {
      var parts = String(row.dataColetaLabel).split("/");
      if (parts.length === 3) {
        row.dataColetaISO =
          parts[2] + "-" + parts[1] + "-" + parts[0];
      }
    }
    return row;
  }

  function listExams(examsRaw) {
    if (!examsRaw) return [];
    if (Array.isArray(examsRaw)) return examsRaw;
    if (typeof examsRaw !== "object") return [];
    var byKey =
      /** @type {{ examsByKey?: Record<string, unknown> }} */ (examsRaw)
        .examsByKey || examsRaw;
    var out = [];
    for (var k in byKey) {
      if (Object.prototype.hasOwnProperty.call(byKey, k)) {
        var v = byKey[k];
        if (v && typeof v === "object") out.push(v);
      }
    }
    return out;
  }

  function parseExamAnalytes(exam) {
    var map = new Map();
    var text = examResultText(exam);
    if (!text) return map;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf(":") < 0) continue;
      var colon = line.indexOf(":");
      var left = line.slice(0, colon).trim();
      var right = line.slice(colon + 1).trim();
      var sig = resolveSigla(left);
      var parsed = parseNumericValue(right) || parseNumericValue(line);
      if (parsed && sig) map.set(sig, parsed);
    }
    return map;
  }

  function parseExamForSigla(exam, targetSigla, opts) {
    opts = opts || {};
    var examName = String(exam.examName || "");
    var nameSigla = resolveSigla(examName);

    if (opts.urineOnly) {
      if (
        nameSigla !== "CrU" &&
        nameSigla !== "NaU" &&
        !isNonSerumSampleExam(exam)
      ) {
        return null;
      }
    } else if (opts.serumOnly && isNonSerumSampleExam(exam)) {
      return null;
    }

    if (!opts.urineOnly && nameSigla === "CrU") return null;

    var text = examResultText(exam);
    if (!text) return null;

    if (nameSigla === targetSigla) {
      return parseNumericValue(text);
    }

    var lines = text.split(/\r?\n/).map(function (l) {
      return l.trim();
    });
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.indexOf(":") < 0) continue;
      if ((line.match(/:/g) || []).length > 1) continue;
      var colon = line.indexOf(":");
      var left = line.slice(0, colon).trim();
      var right = line.slice(colon + 1).trim();
      if (resolveSigla(left) === targetSigla) {
        var fromRightFull = parseNumericValue(right);
        if (fromRightFull) return fromRightFull;
        var segment = right.indexOf(",") >= 0 ? right.split(",")[0].trim() : right;
        var fromRight = parseNumericValue(segment);
        if (fromRight) return fromRight;
        if (!/[:,]/.test(right)) {
          return parseNumericValue(line);
        }
      }
    }

    if (
      targetSigla === "Cr" &&
      /CREATININA/i.test(examName) &&
      !/URIN/i.test(examName)
    ) {
      return parseNumericValue(text);
    }

    if (
      targetSigla === "BT" &&
      /BILIRRUBINA/i.test(examName) &&
      /TOTAL/i.test(examName)
    ) {
      return parseNumericValue(text);
    }

    if (targetSigla === "Amil" && /AMILASE/i.test(examName)) {
      return parseNumericValue(text);
    }

    if (targetSigla === "Alb" && /ALBUMINA/i.test(examName) && !/URIN/i.test(examName)) {
      return parseNumericValue(text);
    }

    if (targetSigla === "INR" && /\bINR\b/i.test(examName)) {
      return parseNumericValue(text);
    }

    if (
      (targetSigla === "Pqt" || targetSigla === "Plt") &&
      /PLAQUET/i.test(examName)
    ) {
      return parseNumericValue(text);
    }

    if (targetSigla === "CA19-9" && /CA\s*19/i.test(examName)) {
      return parseNumericValue(text);
    }

    var fromMap = parseExamAnalytes(exam).get(targetSigla);
    return fromMap || null;
  }

  function collectHits(examsRaw, sigla, opts) {
    var target = String(sigla || "").trim();
    if (!target) return null;
    var hits = [];
    var exams = listExams(examsRaw);
    for (var i = 0; i < exams.length; i++) {
      var exam = ensureColetaFields(exams[i]);
      var parsed = parseExamForSigla(exam, target, opts);
      if (!parsed) continue;
      hits.push({
        value: parsed.value,
        unit: parsed.unit,
        dataISO: exam.dataColetaISO != null ? String(exam.dataColetaISO) : null,
        dataLabel:
          exam.dataColetaLabel != null ? String(exam.dataColetaLabel) : null,
        examName: String(exam.examName || ""),
        sortKey: String(exam.dataColetaISO || "") + "|" + String(i),
      });
    }
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      var ai = a.dataISO || "";
      var bi = b.dataISO || "";
      if (ai && bi && ai !== bi) return bi.localeCompare(ai);
      if (ai && !bi) return -1;
      if (!ai && bi) return 1;
      return b.sortKey.localeCompare(a.sortKey);
    });
    var best = hits[0];
    return {
      value: best.value,
      unit: best.unit,
      dataISO: best.dataISO,
      dataLabel: best.dataLabel,
      examName: best.examName,
    };
  }

  function getLatestAnalyteValueOnDate(examsRaw, sigla, dataISO, opts) {
    opts = opts || {};
    var target = String(sigla || "").trim();
    var iso = String(dataISO || "").trim();
    if (!target || !iso) return null;
    var hits = [];
    var exams = listExams(examsRaw);
    for (var i = 0; i < exams.length; i++) {
      var exam = ensureColetaFields(exams[i]);
      if (String(exam.dataColetaISO || "") !== iso) continue;
      var parsed = parseExamForSigla(exam, target, opts);
      if (!parsed) continue;
      hits.push({
        value: parsed.value,
        unit: parsed.unit,
        dataISO: iso,
        dataLabel:
          exam.dataColetaLabel != null ? String(exam.dataColetaLabel) : null,
        examName: String(exam.examName || ""),
        sortKey: iso + "|" + String(i),
      });
    }
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      return b.sortKey.localeCompare(a.sortKey);
    });
    var best = hits[0];
    return {
      value: best.value,
      unit: best.unit,
      dataISO: best.dataISO,
      dataLabel: best.dataLabel,
      examName: best.examName,
    };
  }

  function getLatestAnalyteValue(examsRaw, sigla) {
    return collectHits(examsRaw, sigla);
  }

  function getLatestSerumAnalyteValue(examsRaw, sigla) {
    return collectHits(examsRaw, sigla, { serumOnly: true });
  }

  function resolveIsolatedElectrolyte(examsRaw, sigla, preferDataISO) {
    var iso = preferDataISO ? String(preferDataISO).trim() : "";
    var sameDay = iso
      ? getLatestAnalyteValueOnDate(examsRaw, sigla, iso, { serumOnly: true })
      : null;
    return sameDay != null ? sameDay : getLatestAnalyteValue(examsRaw, sigla);
  }

  function resolveAnalyteForScore(examsRaw, sigla, preferDataISO, opts) {
    opts = opts || {};
    var iso = preferDataISO ? String(preferDataISO).trim() : "";
    if (iso) {
      return getLatestAnalyteValueOnDate(examsRaw, sigla, iso, opts);
    }
    if (opts.urineOnly) {
      return collectHits(examsRaw, sigla, { urineOnly: true });
    }
    if (opts.serumOnly) {
      return getLatestSerumAnalyteValue(examsRaw, sigla);
    }
    return getLatestAnalyteValue(examsRaw, sigla);
  }

  function loadDaysBetween() {
    if (root.AghuHpbComputed && root.AghuHpbComputed.daysBetween) {
      return root.AghuHpbComputed.daysBetween;
    }
    if (typeof require === "function") {
      try {
        return require("./hpb-computed.js").daysBetween;
      } catch (_e) {}
    }
    return function (a, b) {
      var da = new Date(String(a));
      var db = new Date(String(b));
      if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
      return Math.round((db.getTime() - da.getTime()) / 86400000);
    };
  }

  function collectWindowHits(examsRaw, sigla, anchorISO, opts) {
    opts = opts || {};
    var anchor = String(anchorISO || "").trim();
    if (!anchor) return [];
    var fromDays = opts.fromDays != null ? opts.fromDays : -30;
    var toDays = opts.toDays != null ? opts.toDays : -1;
    var daysBetween = loadDaysBetween();
    var hits = [];
    var exams = listExams(examsRaw);
    for (var i = 0; i < exams.length; i++) {
      var exam = ensureColetaFields(exams[i]);
      var examISO = exam.dataColetaISO != null ? String(exam.dataColetaISO) : "";
      if (!examISO) continue;
      var offset = daysBetween(anchor, examISO);
      if (offset == null || offset < fromDays || offset > toDays) continue;
      var parsed = parseExamForSigla(exam, sigla, {
        serumOnly: !!opts.serumOnly,
        urineOnly: !!opts.urineOnly,
      });
      if (!parsed) continue;
      hits.push({
        value: parsed.value,
        unit: parsed.unit,
        dataISO: examISO,
        dataLabel:
          exam.dataColetaLabel != null ? String(exam.dataColetaLabel) : null,
        examName: String(exam.examName || ""),
        offsetDays: offset,
        sortKey: examISO + "|" + String(i),
        sourceIndex: i,
      });
    }
    return hits;
  }

  /**
   * FEAT-104: ordena hits por collected_at desc (mais recente primeiro).
   * Empate: menor sourceIndex primeiro (ordem estável no array original).
   */
  function orderHitsByCollectedAtDesc(hits) {
    return (hits || []).slice().sort(function (a, b) {
      var cmp = String(b.dataISO || "").localeCompare(String(a.dataISO || ""));
      if (cmp !== 0) return cmp;
      var ia = a.sourceIndex != null ? a.sourceIndex : 0;
      var ib = b.sourceIndex != null ? b.sourceIndex : 0;
      return ia - ib;
    });
  }

  /**
   * FEAT-104: hits da janela ordenados desc, cap 20 (mais recentes).
   * Não usa pickBestWindowHit — a janela só filtra.
   */
  function collectExamSeries(examsRaw, sigla, anchorISO, opts) {
    opts = opts || {};
    var maxLen = opts.maxLength != null ? opts.maxLength : 20;
    var hits = collectWindowHits(examsRaw, sigla, anchorISO, opts);
    var ordered = orderHitsByCollectedAtDesc(hits);
    if (maxLen >= 0 && ordered.length > maxLen) {
      return ordered.slice(0, maxLen);
    }
    return ordered;
  }

  function isKnownExamSigla(sigla) {
    var target = String(sigla || "").trim();
    if (!target) return false;
    var sig = getSiglas();
    var list = sig && Array.isArray(sig.EXAM_SIGLAS) ? sig.EXAM_SIGLAS : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].sigla === target) return true;
    }
    return false;
  }

  /**
   * FEAT-105: hits na janela cujo examName normalizado contém matchText.
   */
  function collectWindowHitsByNameContains(examsRaw, matchText, anchorISO, opts) {
    opts = opts || {};
    var needle = normalizeForMatch(matchText);
    var anchor = String(anchorISO || "").trim();
    if (!needle || !anchor) return [];
    var fromDays = opts.fromDays != null ? opts.fromDays : -365;
    var toDays = opts.toDays != null ? opts.toDays : 0;
    var daysBetween = loadDaysBetween();
    var hits = [];
    var exams = listExams(examsRaw);
    for (var i = 0; i < exams.length; i++) {
      var exam = ensureColetaFields(exams[i]);
      var examISO = exam.dataColetaISO != null ? String(exam.dataColetaISO) : "";
      if (!examISO) continue;
      var examName = String(exam.examName || "");
      if (normalizeForMatch(examName).indexOf(needle) === -1) continue;
      var offset = daysBetween(anchor, examISO);
      if (offset == null || offset < fromDays || offset > toDays) continue;
      if (opts.serumOnly && isNonSerumSampleExam(exam)) continue;
      var parsed = parseNumericValue(examResultText(exam));
      if (!parsed) continue;
      hits.push({
        value: parsed.value,
        unit: parsed.unit,
        dataISO: examISO,
        dataLabel:
          exam.dataColetaLabel != null ? String(exam.dataColetaLabel) : null,
        examName: examName,
        offsetDays: offset,
        sortKey: examISO + "|" + String(i),
        sourceIndex: i,
      });
    }
    return hits;
  }

  /**
   * FEAT-105: série ad-hoc — sigla conhecida via resolveSigla, senão match por nome.
   */
  function collectExamSeriesByMatchText(examsRaw, matchText, anchorISO, opts) {
    opts = opts || {};
    var text = String(matchText || "").trim();
    if (!text) return [];
    var maxLen = opts.maxLength != null ? opts.maxLength : 20;
    var resolved = resolveSigla(text);
    var hits;
    if (resolved && isKnownExamSigla(resolved)) {
      hits = collectWindowHits(examsRaw, resolved, anchorISO, opts);
    } else {
      hits = collectWindowHitsByNameContains(examsRaw, text, anchorISO, opts);
    }
    var ordered = orderHitsByCollectedAtDesc(hits);
    if (maxLen >= 0 && ordered.length > maxLen) {
      return ordered.slice(0, maxLen);
    }
    return ordered;
  }

  /**
   * FEAT-105: hints para lista @ — só nomes/siglas, sem valores.
   * @returns {Array<{ examName: string, sigla: string|null, label: string }>}
   */
  function listExamHintsFromExams(examsRaw) {
    var exams = listExams(examsRaw);
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < exams.length; i++) {
      var exam = exams[i];
      var examName = String(exam.examName || "").trim();
      if (!examName) continue;
      var resolved = resolveSigla(examName);
      var known = isKnownExamSigla(resolved);
      var sigla = known ? resolved : null;
      var dedupeKey = known
        ? "sigla:" + normalizeForMatch(sigla)
        : "name:" + normalizeForMatch(examName);
      if (seen[dedupeKey]) continue;
      seen[dedupeKey] = true;
      out.push({
        examName: examName,
        sigla: sigla,
        label: sigla || examName,
      });
    }
    return out;
  }

  function pickBestWindowHit(hits, opts) {
    if (!hits.length) return null;
    opts = opts || {};
    var toDays = opts.toDays != null ? opts.toDays : -1;
    var preferTargetDay = opts.preferTargetDay;
    var preOp = toDays < 0;
    var sorted = hits.slice();
    if (preOp) {
      sorted.sort(function (a, b) {
        if (a.offsetDays !== b.offsetDays) return b.offsetDays - a.offsetDays;
        return b.dataISO.localeCompare(a.dataISO);
      });
    } else if (preferTargetDay != null) {
      sorted.sort(function (a, b) {
        var da = Math.abs(a.offsetDays - preferTargetDay);
        var db = Math.abs(b.offsetDays - preferTargetDay);
        if (da !== db) return da - db;
        return a.dataISO.localeCompare(b.dataISO);
      });
    } else {
      sorted.sort(function (a, b) {
        var da = Math.abs(a.offsetDays);
        var db = Math.abs(b.offsetDays);
        if (da !== db) return da - db;
        return a.dataISO.localeCompare(b.dataISO);
      });
    }
    var best = sorted[0];
    return {
      value: best.value,
      unit: best.unit,
      dataISO: best.dataISO,
      dataLabel: best.dataLabel,
      examName: best.examName,
    };
  }

  function getAnalyteInWindow(examsRaw, sigla, anchorISO, opts) {
    var hits = collectWindowHits(examsRaw, sigla, anchorISO, opts);
    return pickBestWindowHit(hits, opts);
  }

  /** Exame mais próximo de targetIso dentro de toleranceDays (±). */
  function getClosestAnalyteToDate(examsRaw, sigla, targetIso, opts) {
    opts = opts || {};
    var tolerance = opts.toleranceDays != null ? opts.toleranceDays : 1;
    return getAnalyteInWindow(examsRaw, sigla, targetIso, {
      fromDays: -tolerance,
      toDays: tolerance,
      serumOnly: !!opts.serumOnly,
      urineOnly: !!opts.urineOnly,
      preferTargetDay: 0,
    });
  }

  return {
    parsePtNumber: parsePtNumber,
    parseNumericValue: parseNumericValue,
    listExams: listExams,
    parseExamAnalytes: parseExamAnalytes,
    isNonSerumSampleExam: isNonSerumSampleExam,
    getLatestAnalyteValue: getLatestAnalyteValue,
    getLatestAnalyteValueOnDate: getLatestAnalyteValueOnDate,
    getLatestSerumAnalyteValue: getLatestSerumAnalyteValue,
    resolveIsolatedElectrolyte: resolveIsolatedElectrolyte,
    resolveAnalyteForScore: resolveAnalyteForScore,
    collectWindowHits: collectWindowHits,
    orderHitsByCollectedAtDesc: orderHitsByCollectedAtDesc,
    collectExamSeries: collectExamSeries,
    collectExamSeriesByMatchText: collectExamSeriesByMatchText,
    listExamHintsFromExams: listExamHintsFromExams,
    isKnownExamSigla: isKnownExamSigla,
    getAnalyteInWindow: getAnalyteInWindow,
    getClosestAnalyteToDate: getClosestAnalyteToDate,
  };
});
