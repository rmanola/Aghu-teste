/**
 * lib/exam-copy-format.js — formatação filtrada da cópia de exames (popup).
 * Testável em Node via eval + deps injetáveis.
 */
(function (root) {
  "use strict";

  const PANEL_SIGLAS_NO_FALLBACK = new Set(["Gaso", "Hemograma"]);

  /** Painéis cuja cópia emite só a sigla canônica do exame (não subitens). */
  const PANEL_COPY_PRIMARY_ONLY = new Set(["RAC", "RPTCr"]);

  const SANGUE_COPY_ORDER_BY_GROUP = [
    ["Na", "K", "Cl", "Ca", "Mg", "P", "HCO3"],
    ["Gli", "HbA1c", "CT", "HDL", "LDL", "TG"],
    ["Cr", "CrU", "U", "AU"],
    ["TGO", "TGP", "GGT", "FA", "BT", "BD", "BI", "Alb", "PT"],
    ["TP", "INR", "TTPa", "Fibr", "D-Di"],
    ["PCR", "VHS", "PCT"],
    // Hemograma: bloco atômico via HEMOGRAM_COPY_INNER_ORDER (inserido antes de Trop).
    ["Trop", "CK-MB", "CK", "LDH", "Amil", "Lip"],
    ["BNP", "proBNP"],
    ["TSH", "T4L", "T3L"],
    ["VitD", "B12", "Fol", "Fe", "Ferr", "TIBC", "IST", "Transferrina", "Cort", "PTH"],
    ["ANTIHIV", "ANTIHBS", "ANTIHCV", "HBSAG"],
    ["Hemograma", "Gaso", "Lact"],
  ];

  /** Ordem interna do bloco hemograma no clipboard (só estas siglas são emitidas). */
  const HEMOGRAM_COPY_INNER_ORDER = [
    "Hb",
    "Ht",
    "VCM",
    "HCM",
    "CHCM",
    "RDW",
    "Linf",
    "Leuco",
    "Seg",
    "Bast",
    "Eos",
    "Pqt",
  ];

  const HEMOGRAM_COPY_ALLOWLIST = new Set(HEMOGRAM_COPY_INNER_ORDER);

  /** Siglas mapeadas de hemograma que nunca entram na cópia. */
  const HEMOGRAM_COPY_OMIT = new Set(["He", "Eritro", "Baso", "Mono"]);

  /** Rótulos hemo sem sigla no catálogo — zero no clipboard. */
  const HEMOGRAM_COPY_DENY_LABEL_RES = [
    /METAMIEL/i,
    /MIEL[OÓ]CIT/i,
    /PROMIEL/i,
    /BLASTO/i,
    /PLASM[OÓ]CIT/i,
    /\bMPV\b/i,
    /\bPDW\b/i,
  ];

  /** Inserir o bloco allowlist imediatamente antes desta sigla no SANGUE. */
  const HEMOGRAM_BLOCK_ANCHOR_SIGLA = "Trop";

  const SANGUE_COPY_ORDER = (() => {
    const order = new Map();
    let i = 0;
    const seen = new Set();
    for (const grp of SANGUE_COPY_ORDER_BY_GROUP) {
      for (const sigla of grp) {
        if (seen.has(sigla)) {
          throw new Error(`[AGHU] SANGUE_COPY_ORDER_BY_GROUP: sigla duplicada "${sigla}"`);
        }
        seen.add(sigla);
        order.set(sigla, i++);
      }
    }
    return order;
  })();

  function getLab(deps) {
    return (deps && deps.labParse) || root.AghuPdfLabParse;
  }

  function getSiglas(deps) {
    return (deps && deps.siglas) || root.AghuExamSiglas;
  }

  function normalizeLabText(s, deps) {
    const lab = getLab(deps);
    if (lab && lab.normalizeLabText) return lab.normalizeLabText(s);
    const san = getSiglas(deps).sanitizeRawLabel;
    return san ? san(s) : String(s || "").trim();
  }

  function stripLabNoiseFromTextLine(s, deps) {
    const lab = getLab(deps);
    return lab.stripLabNoiseFromTextLine(s);
  }

  function splitLabLineIntoAnalyteChunks(line, deps) {
    return getLab(deps).splitLabLineIntoAnalyteChunks(line);
  }

  function normalizeMultilineLabResult(text, deps) {
    const fn = getLab(deps).normalizeMultilineLabResult;
    return fn ? fn(text) : String(text || "").trim();
  }

  function resolveExamSigla(label, deps) {
    const fn = getSiglas(deps).resolveSigla;
    return fn ? fn(normalizeLabText(label, deps)) : String(label || "").trim();
  }

  function getGasometryWhitelist(deps) {
    const lab = getLab(deps);
    return lab.GASOMETRY_COPY_SIGLAS || new Set();
  }

  function parseBRFloat(valueStr) {
    const t = String(valueStr || "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function hasScaledPerMicroliterSuffix(rest, deps) {
    const r = (rest || "").trim();
    if (!r) return false;
    const re =
      (getLab(deps) && getLab(deps).RE_SCALE_PER_MICROLITER) ||
      /(?:10\^3|10³|x10³)(?:\s*\/\s*[µμu]\s*l|\/\s*[µμ]l)/i;
    return re.test(r);
  }

  function formatScaledCellLine(valueStr, rest, resolvedSigla, deps) {
    const tail = (rest || "").trim();
    if (hasScaledPerMicroliterSuffix(tail, deps)) {
      const n = parseBRFloat(valueStr);
      if (!Number.isFinite(n)) return `${valueStr}${tail ? " " + tail : ""}`;
      const abs = Math.round(n * 1000);
      return `${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} /µL`;
    }
    if (resolvedSigla === "Pqt" && !/%/i.test(tail)) {
      var pqtRoot =
        typeof globalThis !== "undefined" ? globalThis.AghuExamPlaquetasFormat : null;
      if (pqtRoot && typeof pqtRoot.formatPlaquetasDisplay === "function") {
        var rawPqt = `${valueStr}${tail ? " " + tail : ""}`.trim();
        return pqtRoot.formatPlaquetasDisplay(rawPqt);
      }
    }
    return `${valueStr}${tail ? " " + tail : ""}`;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripRepeatedLeftHeading(leftRaw, remainder) {
    let r = String(remainder || "").trim();
    const left = String(leftRaw || "").trim();
    if (!left || !r) return r;
    const re = new RegExp("^" + escapeRegExp(left) + "\\s*([:\\-–])?\\s*", "i");
    const next = r.replace(re, "").trim();
    return next.length < r.length ? next : r;
  }

  function stripAnalyteDuplicateInValue(resolvedSigla, leftRaw, remainder, deps) {
    const synFn = getSiglas(deps).stripLeadingSynonym;
    let r = String(remainder || "").trim();
    r = stripRepeatedLeftHeading(leftRaw, r);
    if (synFn) r = synFn(resolvedSigla, r);
    return r;
  }

  function displaySiglaForCopy(sigla, deps) {
    const lab = getLab(deps);
    if (lab && lab.GASOMETRY_DISPLAY_LABELS && lab.GASOMETRY_DISPLAY_LABELS[sigla]) {
      return lab.GASOMETRY_DISPLAY_LABELS[sigla];
    }
    return sigla;
  }

  function formatEntryWithDisplaySigla(entry, deps) {
    const ix = entry.indexOf(":");
    if (ix <= 0) return entry;
    const sigla = entry.slice(0, ix).trim();
    const value = entry.slice(ix + 1).trim();
    if (!value) return null;
    return `${displaySiglaForCopy(sigla, deps)}: ${value}`;
  }

  function lineToCopyEntry(line, examNameForFallback, useExamFallback, deps) {
    const t = stripLabNoiseFromTextLine(normalizeLabText(line, deps), deps);
    if (!t) return null;
    if (/^atividade\s*:/i.test(t)) return null;

    const lab = getLab(deps);
    if (lab.isCopyExcludedLine && lab.isCopyExcludedLine(t) && !useExamFallback) return null;

    const colonMatch = t.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      const left = colonMatch[1].trim();
      let right = stripLabNoiseFromTextLine(colonMatch[2].trim(), deps);
      if (!right || /^[:\-\s.,;]+$/.test(right)) return null;
      if (/^atividade$/i.test(left)) return null;
      if (left.length >= 2 && left.length <= 100 && !/^\d[\d,\.]*$/.test(left)) {
        const resolved = resolveExamSigla(left, deps);
        right = stripAnalyteDuplicateInValue(resolved, left, right, deps);
        if (!right) return null;
        return `${resolved}: ${right}`;
      }
    }

    const numMatch = t.match(
      /^[\s\-\*•\[\(]*([A-Za-záàâãéêíóôõúçüÁÀÂÃÉÊÍÓÔÕÚÇÜ][^\d:]{0,48}?)[\s:]+(\d[\d,\.]*)\s*(.*)$/i
    );
    if (numMatch) {
      const analyteName = numMatch[1].replace(/\s*:\s*$/, "").trim();
      const resolved = resolveExamSigla(analyteName, deps);
      let rest = (numMatch[3] || "").trim();
      rest = stripLabNoiseFromTextLine(
        stripAnalyteDuplicateInValue(resolved, analyteName, rest, deps),
        deps
      );
      const display = formatScaledCellLine(numMatch[2], rest, resolved, deps);
      return `${resolved}: ${display}`;
    }

    if (useExamFallback && examNameForFallback) {
      const panelSigla = resolveExamSigla(examNameForFallback, deps);
      if (PANEL_SIGLAS_NO_FALLBACK.has(panelSigla)) return null;
      const resolved = panelSigla;
      const body = stripAnalyteDuplicateInValue(resolved, examNameForFallback, t, deps);
      if (!body) return null;
      return `${resolved}: ${body}`;
    }

    return t.replace(/\s{2,}/g, " ");
  }

  function copyEntrySigla(entry) {
    const ix = entry.indexOf(":");
    return ix > 0 ? entry.slice(0, ix).trim() : "";
  }

  function shouldIncludeCopyEntry(entry, panelSigla) {
    if (!entry || !PANEL_COPY_PRIMARY_ONLY.has(panelSigla)) return true;
    return copyEntrySigla(entry) === panelSigla;
  }

  function classifyExam(e) {
    const examUp = (e.examName || "").toUpperCase();
    const sampleUp = (e.sample || "").toUpperCase();
    if (examUp.includes("GASOMETRIA")) return "GASOMETRIA";
    if (sampleUp.includes("URINA")) return "URINA";
    return "SANGUE";
  }

  function inferGasometryKind(exam) {
    const examUp = (exam.examName || "").toUpperCase();
    const sampleUp = (exam.sample || "").toUpperCase();
    const resultText = [
      exam.result,
      exam.fetchedResult,
      exam.detailText,
    ]
      .filter(Boolean)
      .join("\n")
      .toUpperCase();

    if (
      sampleUp.includes("VENOSO") ||
      sampleUp.includes("VENOSA") ||
      examUp.includes("VENOSO") ||
      examUp.includes("VENOSA")
    ) {
      return "venous";
    }
    if (resultText.includes("MATERIAL SANGUE VENOSO")) return "venous";
    if (sampleUp.includes("ARTERIAL") || examUp.includes("ARTERIAL")) return "arterial";
    return "arterial";
  }

  function getGasometryDisplayToCanonical(deps) {
    const lab = getLab(deps);
    const labels = (lab && lab.GASOMETRY_DISPLAY_LABELS) || {};
    const inv = new Map();
    for (const [canonical, display] of Object.entries(labels)) {
      inv.set(display, canonical);
    }
    return inv;
  }

  function isGasometryWhitelisted(entry, deps) {
    const ix = entry.indexOf(":");
    if (ix <= 0) return false;
    const sigla = entry.slice(0, ix).trim();
    const whitelist = getGasometryWhitelist(deps);
    if (whitelist.has(sigla)) return true;
    const canonical = getGasometryDisplayToCanonical(deps).get(sigla);
    return canonical != null && whitelist.has(canonical);
  }

  function fillGroupsFromExams(exams, deps) {
    const groups = {
      SANGUE: [],
      URINA: [],
      GASOMETRIA: { arterial: [], venous: [] },
    };
    const lab = getLab(deps);
    const whitelist = getGasometryWhitelist(deps);

    function pushCopyEntry(entry, group, gasoKind, panelSigla) {
      if (entry == null) return false;
      if (!shouldIncludeCopyEntry(entry, panelSigla)) return false;
      if (group === "GASOMETRIA") {
        if (!isGasometryWhitelisted(entry, deps)) return false;
        const formatted = formatEntryWithDisplaySigla(entry, deps);
        if (!formatted) return false;
        groups.GASOMETRIA[gasoKind].push(formatted);
        return true;
      }
      groups[group].push(entry);
      return true;
    }

    exams.forEach((e) => {
      const resolve = root.AghuExamResultResolve;
      const result = normalizeMultilineLabResult(
        resolve && resolve.resolveExamDisplayText
          ? resolve.resolveExamDisplayText(e)
          : e.result || e.fetchedResult || e.detailText || "",
        deps
      );
      if (!result) return;

      const group = classifyExam(e);
      const gasoKind = group === "GASOMETRIA" ? inferGasometryKind(e) : null;
      const panelSigla = resolveExamSigla(e.examName, deps);
      const resultLines = result
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      let addedFromExam = 0;

      for (const rawLine of resultLines) {
        const cleanedLine = stripLabNoiseFromTextLine(rawLine, deps);
        if (!cleanedLine) continue;

        const pieces = splitLabLineIntoAnalyteChunks(cleanedLine, deps);
        const allowExamFallback =
          pieces.length === 1 && !PANEL_SIGLAS_NO_FALLBACK.has(panelSigla);

        if (
          lab.isCopyExcludedLine &&
          lab.isCopyExcludedLine(cleanedLine) &&
          !allowExamFallback
        ) {
          continue;
        }

        for (const piece of pieces) {
          if (lab.isBeEcfLine && lab.isBeEcfLine(piece)) continue;
          if (lab.isLabResultLine && !lab.isLabResultLine(piece) && !allowExamFallback) {
            continue;
          }
          const entry = lineToCopyEntry(piece, e.examName, allowExamFallback, deps);
          if (pushCopyEntry(entry, group, gasoKind, panelSigla)) addedFromExam++;
        }
      }

      if (addedFromExam === 0 && resultLines.length === 1) {
        const fallbackEntry = lineToCopyEntry(
          stripLabNoiseFromTextLine(resultLines[0], deps),
          e.examName,
          !PANEL_SIGLAS_NO_FALLBACK.has(panelSigla),
          deps
        );
        pushCopyEntry(fallbackEntry, group, gasoKind, panelSigla);
      }
    });

    groups.SANGUE = dedupeEntries(groups.SANGUE, { keepLast: true });
    groups.URINA = dedupeEntries(groups.URINA, { keepLast: true });
    groups.GASOMETRIA.arterial = dedupeEntries(groups.GASOMETRIA.arterial, { keepLast: true });
    groups.GASOMETRIA.venous = dedupeEntries(groups.GASOMETRIA.venous, { keepLast: true });

    return groups;
  }

  function dedupeEntries(entries, opts) {
    const keepLast = opts && opts.keepLast;
    if (!keepLast) {
      return [...new Set(entries)];
    }
    const bySigla = new Map();
    const order = [];
    for (const entry of entries) {
      const ix = entry.indexOf(":");
      const key = ix > 0 ? entry.slice(0, ix).trim() : entry;
      if (!bySigla.has(key)) order.push(key);
      bySigla.set(key, entry);
    }
    return order.map((k) => bySigla.get(k));
  }

  function copyEntryKey(entry) {
    const ix = String(entry || "").indexOf(":");
    return ix > 0 ? entry.slice(0, ix).trim() : String(entry || "").trim();
  }

  function isHemogramCopyDeniedLabel(label) {
    const t = String(label || "");
    if (!t) return false;
    for (let i = 0; i < HEMOGRAM_COPY_DENY_LABEL_RES.length; i++) {
      if (HEMOGRAM_COPY_DENY_LABEL_RES[i].test(t)) return true;
    }
    return false;
  }

  /**
   * Fail-closed: omit siglas mapeadas + denylist (Meta/Miel/…/MPV/PDW).
   * Só a allowlist do hemograma sobrevive para o bloco atômico.
   */
  function shouldDropHemogramCopyEntry(entry) {
    const key = copyEntryKey(entry);
    if (HEMOGRAM_COPY_OMIT.has(key)) return true;
    if (isHemogramCopyDeniedLabel(key)) return true;
    if (isHemogramCopyDeniedLabel(entry)) return true;
    return false;
  }

  function filterSangueCopyEntriesHemogramPolicy(entries) {
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      if (shouldDropHemogramCopyEntry(entries[i])) continue;
      out.push(entries[i]);
    }
    return out;
  }

  function sortBySangueOrderMap(entries) {
    const order = SANGUE_COPY_ORDER;
    return [...entries].sort((a, b) => {
      const ka = copyEntryKey(a);
      const kb = copyEntryKey(b);
      const ia = order.has(ka) ? order.get(ka) : 9000;
      const ib = order.has(kb) ? order.get(kb) : 9000;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "pt-BR");
    });
  }

  function sortHemogramAllowlistEntries(entries) {
    return [...entries].sort((a, b) => {
      const ia = HEMOGRAM_COPY_INNER_ORDER.indexOf(copyEntryKey(a));
      const ib = HEMOGRAM_COPY_INNER_ORDER.indexOf(copyEntryKey(b));
      const sa = ia >= 0 ? ia : 9000;
      const sb = ib >= 0 ? ib : 9000;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b, "pt-BR");
    });
  }

  /**
   * Bloco atômico: allowlist contígua (ordem produto); resto por SANGUE_COPY_ORDER;
   * bloco inserido imediatamente antes de Trop (ou no fim se não houver âncora).
   */
  function sortSangueCopyEntries(entries) {
    const filtered = filterSangueCopyEntriesHemogramPolicy(entries || []);
    const hemo = [];
    const rest = [];
    for (let i = 0; i < filtered.length; i++) {
      const e = filtered[i];
      if (HEMOGRAM_COPY_ALLOWLIST.has(copyEntryKey(e))) hemo.push(e);
      else rest.push(e);
    }

    const hemoSorted = sortHemogramAllowlistEntries(hemo);
    const restSorted = sortBySangueOrderMap(rest);
    if (!hemoSorted.length) return restSorted;

    const anchorIdx = SANGUE_COPY_ORDER.has(HEMOGRAM_BLOCK_ANCHOR_SIGLA)
      ? SANGUE_COPY_ORDER.get(HEMOGRAM_BLOCK_ANCHOR_SIGLA)
      : 9000;
    let insertAt = restSorted.length;
    for (let j = 0; j < restSorted.length; j++) {
      const k = copyEntryKey(restSorted[j]);
      const ix = SANGUE_COPY_ORDER.has(k) ? SANGUE_COPY_ORDER.get(k) : 9000;
      if (ix >= anchorIdx) {
        insertAt = j;
        break;
      }
    }
    return restSorted.slice(0, insertAt).concat(hemoSorted, restSorted.slice(insertAt));
  }

  function injectDerivedBilirubinIndirect(entries) {
    const map = new Map();
    for (const e of entries) {
      const ix = e.indexOf(":");
      if (ix <= 0) continue;
      map.set(e.slice(0, ix).trim(), e.slice(ix + 1).trim());
    }
    if (map.has("BI") || !map.has("BT") || !map.has("BD")) return entries;
    const mBt = map.get("BT").match(/[\d,\.]+/);
    const mBd = map.get("BD").match(/[\d,\.]+/);
    if (!mBt || !mBd) return entries;
    const btN = parseBRFloat(mBt[0]);
    const bdN = parseBRFloat(mBd[0]);
    if (!Number.isFinite(btN) || !Number.isFinite(bdN) || btN <= bdN) return entries;
    const bi = btN - bdN;
    const unit = /\bmg\/dl\b/i.test(map.get("BT") + map.get("BD")) ? " mg/dL" : "";
    const biFmt = bi.toFixed(2).replace(".", ",");
    return [...entries, `BI: ${biFmt}${unit}`];
  }

  function formatGasometrySection(gasometryGroups) {
    const lines = [];
    if (gasometryGroups.arterial && gasometryGroups.arterial.length) {
      lines.push("Arterial:");
      lines.push(...gasometryGroups.arterial);
    }
    if (gasometryGroups.venous && gasometryGroups.venous.length) {
      lines.push("Venosa:");
      lines.push(...gasometryGroups.venous);
    }
    return lines;
  }

  const RE_TRAILING_COPY_UNITS =
    /\s*(?:mmol\/l|mg\/dl|g\/dl|mmhg|ui\/l|u\/l|segundos?|(?<!\d)s\b|\/µl|\/μl|\/ul|mosm\/kg|%)\s*$/i;

  function stripCopyValueUnits(value) {
    let v = String(value || "").trim();
    v = v.replace(/\s+de\s+creatinina\s*\.?\s*$/i, "").trim();
    let prev;
    do {
      prev = v;
      v = v.replace(RE_TRAILING_COPY_UNITS, "").trim();
    } while (v !== prev);
    return v;
  }

  function formatCompactToken(entry, deps) {
    const ix = entry.indexOf(":");
    if (ix <= 0) {
      const flat = String(entry || "").trim();
      return flat || null;
    }
    const sigla = entry.slice(0, ix).trim();
    const value = stripCopyValueUnits(entry.slice(ix + 1).trim());
    if (!value) return null;
    return `${sigla} ${value}`.replace(/\s+/g, " ").trim();
  }

  function joinCompactSectionTokens(entries, deps) {
    return entries
      .map((e) => formatCompactToken(e, deps))
      .filter(Boolean)
      .join(" | ");
  }

  function buildCompactDateLine(groups, dateLabel, deps) {
    const label = String(dateLabel || "sem data").trim();
    const parts = [`${label}:`];

    const sangueSorted = sortSangueCopyEntries(
      injectDerivedBilirubinIndirect(groups.SANGUE)
    );
    const sangueStr = joinCompactSectionTokens(sangueSorted, deps);
    if (sangueStr) parts.push(`SANGUE: ${sangueStr}`);

    const urinaStr = joinCompactSectionTokens(groups.URINA, deps);
    if (urinaStr) parts.push(`URINA: ${urinaStr}`);

    const artStr = joinCompactSectionTokens(groups.GASOMETRIA.arterial, deps);
    if (artStr) parts.push(`GASOMETRIA ARTERIAL ${artStr}`);

    const venStr = joinCompactSectionTokens(groups.GASOMETRIA.venous, deps);
    if (venStr) parts.push(`GASOMETRIA VENOSA ${venStr}`);

    if (parts.length === 1) return "";
    return parts.join(" ").toLocaleUpperCase("pt-BR");
  }

  function groupsToBodyLines(groups) {
    const lines = [];
    if (groups.SANGUE.length) {
      const sangueSorted = sortSangueCopyEntries(
        injectDerivedBilirubinIndirect(groups.SANGUE)
      );
      lines.push("SANGUE:");
      lines.push(...sangueSorted);
    }
    if (groups.URINA.length) {
      lines.push("URINA:");
      lines.push(...groups.URINA);
    }
    const gasoLines = formatGasometrySection(groups.GASOMETRIA);
    if (gasoLines.length) {
      lines.push("GASOMETRIA:");
      lines.push(...gasoLines);
    }
    return lines;
  }

  function parseDataColetaFromRaw(raw) {
    if (!raw || String(raw).trim() === "") return { iso: null, label: "sem data" };
    const token = String(raw).trim().split(/\s+/)[0];
    const m = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return { iso: null, label: "sem data" };
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
      return { iso: null, label: "sem data" };
    }
    const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const label = `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${String(y)}`;
    return { iso, label };
  }

  function ensureColetaFields(exam) {
    const hasIso = Object.prototype.hasOwnProperty.call(exam, "dataColetaISO");
    const hasLbl = Object.prototype.hasOwnProperty.call(exam, "dataColetaLabel");
    if (hasIso && hasLbl) return exam;
    const p = parseDataColetaFromRaw(exam.date || "");
    if (!hasIso) exam.dataColetaISO = p.iso;
    if (!hasLbl) exam.dataColetaLabel = p.label;
    return exam;
  }

  function groupByDataColeta(exams) {
    const NO_DATE = "__nodate__";
    const seen = new Map();
    const keyOrder = [];

    for (const e of exams) {
      ensureColetaFields(e);
      const key = e.dataColetaISO || NO_DATE;
      if (!seen.has(key)) {
        seen.set(key, {
          dataISO: e.dataColetaISO,
          dataLabel: e.dataColetaLabel,
          items: [],
        });
        keyOrder.push(key);
      }
      seen.get(key).items.push(e);
    }

    const sortedKeys = [...keyOrder].sort((a, b) => {
      if (a === NO_DATE) return 1;
      if (b === NO_DATE) return -1;
      return b.localeCompare(a);
    });

    return sortedKeys.map((k) => seen.get(k));
  }

  function distinctColetaKeysCount(exams) {
    const keys = new Set();
    for (const e of exams) {
      ensureColetaFields(e);
      keys.add(e.dataColetaISO || "");
    }
    return keys.size;
  }

  function buildCopyText(exams, opts) {
    const options = opts || {};
    const deps = options.deps;

    const list = Array.isArray(exams) ? exams : [];
    list.forEach((e) => ensureColetaFields(e));

    const multiColeta = distinctColetaKeysCount(list) > 1;
    const lines = [];

    for (const g of groupByDataColeta(list)) {
      const groups = fillGroupsFromExams(g.items, deps);
      const body = buildCompactDateLine(groups, g.dataLabel, deps);
      if (!body) continue;
      lines.push(multiColeta ? `- ${body}` : body);
    }

    return lines.join("\n");
  }

  root.AghuExamCopyFormat = {
    PANEL_SIGLAS_NO_FALLBACK,
    HEMOGRAM_COPY_INNER_ORDER,
    HEMOGRAM_COPY_ALLOWLIST,
    HEMOGRAM_COPY_OMIT,
    inferGasometryKind,
    lineToCopyEntry,
    fillGroupsFromExams,
    formatGasometrySection,
    groupsToBodyLines,
    formatCompactToken,
    buildCompactDateLine,
    stripCopyValueUnits,
    dedupeEntries,
    sortSangueCopyEntries,
    shouldDropHemogramCopyEntry,
    buildCopyText,
    displaySiglaForCopy,
    classifyExam,
    groupByDataColeta,
    distinctColetaKeysCount,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
