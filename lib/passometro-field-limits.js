/**
 * Limites de caracteres/linhas do Passômetro (UI + print + packing).
 * Canónico: grupos curto/médio/longo + pools partilhados
 * (CD+pendências; narrativa de cabeçalho HDA/diag/nome/achados).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroFieldLimits = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRINT_CHARS_PER_LINE = 80;

  var LIMIT_SHORT = { maxChars: 40, maxLines: 1, group: "short" };
  var LIMIT_MEDIUM = { maxChars: 160, maxLines: 2, group: "medium" };
  /**
   * Legado: long_header isolado. Narrativa do cabeçalho usa LIMIT_HEADER_SHARED.
   * Mantido para custom header textarea sem kind custom (raro).
   */
  var LIMIT_LONG_HEADER = { maxChars: 640, maxLines: 8, group: "long_header" };
  /**
   * Legado / custom textarea entry isolado — CD/pendências usam LIMIT_ENTRY_SHARED.
   * Mantido para custom span≥7.
   */
  var LIMIT_LONG_ENTRY = { maxChars: 640, maxLines: 8, group: "long_entry" };
  /**
   * Orçamento conjunto CD + pendências (chars e linhas no total).
   */
  var LIMIT_ENTRY_SHARED = {
    maxChars: 240,
    maxLines: 2,
    group: "entry_shared",
  };
  /**
   * Orçamento conjunto do cabeçalho clínico:
   * hdaHpp + diagnosticos[].texto + cirurgias[].nome + cirurgias[].achadosOperatorios.
   */
  var LIMIT_HEADER_SHARED = {
    maxChars: 640,
    maxLines: 8,
    group: "header_shared",
  };
  /** Reservado — widgets sem teto próprio (datas etc.). */
  var LIMIT_UNCAPPED = { maxChars: 0, maxLines: 0, group: "uncapped" };

  var KEY_LIMITS = {
    nome: LIMIT_SHORT,
    idade: LIMIT_SHORT,
    prontuario: LIMIT_SHORT,
    peso: LIMIT_SHORT,
    staff: LIMIT_SHORT,
    dih: LIMIT_SHORT,
    data: LIMIT_SHORT,
    po: LIMIT_SHORT,
    atb: LIMIT_SHORT,
    dieta: LIMIT_SHORT,
    exames: LIMIT_SHORT,
    hv: LIMIT_SHORT,
    sng: LIMIT_SHORT,
    analgesia: LIMIT_SHORT,
    fc: LIMIT_SHORT,
    fr: LIMIT_SHORT,
    sato2: LIMIT_SHORT,
    pa: LIMIT_SHORT,
    diurese: LIMIT_SHORT,
    bh: LIMIT_SHORT,
    drenos: LIMIT_SHORT,
    drenoTl: LIMIT_SHORT,
    drenoJp: LIMIT_SHORT,
    drenoPig: LIMIT_SHORT,
    hgt: LIMIT_SHORT,
    vomitos: LIMIT_SHORT,
    tax: LIMIT_SHORT,
    fezes: LIMIT_SHORT,
    fistulas: LIMIT_SHORT,
    diagnosticos: LIMIT_HEADER_SHARED,
    cirurgias: LIMIT_HEADER_SHARED,
    hdaHpp: LIMIT_HEADER_SHARED,
    cd: LIMIT_ENTRY_SHARED,
    pendencias: LIMIT_ENTRY_SHARED,
  };

  function plainTextFromValue(htmlOrText) {
    var s = String(htmlOrText == null ? "" : htmlOrText);
    if (!s) return "";
    if (s.indexOf("<") === -1) return s;
    return s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function plainTextLength(htmlOrText) {
    return plainTextFromValue(htmlOrText).length;
  }

  function resolveFieldLimit(fieldDefOrKey) {
    var key =
      typeof fieldDefOrKey === "string"
        ? fieldDefOrKey
        : fieldDefOrKey && fieldDefOrKey.key
          ? String(fieldDefOrKey.key)
          : "";
    var def =
      fieldDefOrKey && typeof fieldDefOrKey === "object" ? fieldDefOrKey : null;

    if (key && KEY_LIMITS[key]) {
      return Object.assign({}, KEY_LIMITS[key]);
    }

    if (def) {
      var widget = String(def.widget || "");
      var section = def.section === "header" ? "header" : "entry";
      var span = typeof def.span === "number" ? def.span : 0;
      var wide = def.wide === true;
      var kind = String(def.kind || "");
      var isCustom =
        kind === "custom" || (key && key.indexOf("custom_") === 0);
      if (widget === "diagnosticos" || widget === "cirurgias") {
        return Object.assign({}, LIMIT_HEADER_SHARED);
      }
      if (isCustom && (widget === "textarea" || span >= 7 || wide)) {
        return Object.assign({}, LIMIT_MEDIUM);
      }
      if (widget === "textarea" || span >= 7) {
        return Object.assign(
          {},
          section === "header" ? LIMIT_HEADER_SHARED : LIMIT_LONG_ENTRY,
        );
      }
      if (wide) {
        return Object.assign({}, LIMIT_MEDIUM);
      }
    }

    return Object.assign({}, LIMIT_SHORT);
  }

  function clampPlainText(value, maxChars) {
    var s = String(value == null ? "" : value);
    if (typeof maxChars !== "number" || maxChars < 0) return s;
    if (maxChars === 0) return "";
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars);
  }

  function clampFieldValue(fieldDefOrKey, value) {
    var limit = resolveFieldLimit(fieldDefOrKey);
    var raw = value == null ? "" : String(value);
    if (!raw) return "";
    if (!(limit.maxChars > 0)) return raw;
    // Campos do pool de cabeçalho: não cortar isoladamente (usar clampHeaderNarrative).
    if (limit.group === "header_shared") {
      return raw;
    }
    var plain = plainTextFromValue(raw);
    if (plain.length <= limit.maxChars) {
      return raw;
    }
    return clampPlainText(plain, limit.maxChars);
  }

  /**
   * Partilha o orçamento entre CD e pendências.
   * Preserva HTML TipTap quando a soma plain ≤ pool.
   */
  function clampCdPendenciasPair(cd, pendencias, preferKey) {
    var pool = LIMIT_ENTRY_SHARED;
    var max = pool.maxChars;
    var rawCd = cd == null ? "" : String(cd);
    var rawPend = pendencias == null ? "" : String(pendencias);
    var aPlain = plainTextFromValue(rawCd);
    var bPlain = plainTextFromValue(rawPend);
    if (
      aPlain.length <= max &&
      bPlain.length <= max &&
      aPlain.length + bPlain.length <= max
    ) {
      return { cd: rawCd, pendencias: rawPend };
    }
    var a = aPlain.length > max ? clampPlainText(aPlain, max) : aPlain;
    var b = bPlain.length > max ? clampPlainText(bPlain, max) : bPlain;
    if (a.length + b.length <= max) {
      return { cd: a, pendencias: b };
    }
    var prefer =
      preferKey === "pendencias" || preferKey === "cd"
        ? preferKey
        : a.length >= b.length
          ? "cd"
          : "pendencias";
    if (prefer === "cd") {
      var roomA = Math.max(0, max - b.length);
      return { cd: clampPlainText(a, roomA), pendencias: b };
    }
    var roomB = Math.max(0, max - a.length);
    return { cd: a, pendencias: clampPlainText(b, roomB) };
  }

  function resolveSharedEntryUsage(cd, pendencias) {
    var pool = LIMIT_ENTRY_SHARED;
    var a = plainTextLength(cd);
    var b = plainTextLength(pendencias);
    var used = a + b;
    return {
      usedChars: used,
      maxChars: pool.maxChars,
      remainingChars: Math.max(0, pool.maxChars - used),
      maxLines: pool.maxLines,
      over: used >= pool.maxChars,
    };
  }

  function estimateCdPendenciasWeight(cd, pendencias) {
    var w =
      estimateTextWeightCapped(cd, Infinity) +
      estimateTextWeightCapped(pendencias, Infinity);
    var cap = LIMIT_ENTRY_SHARED.maxLines;
    if (!(cap > 0)) return w;
    return Math.min(w, cap);
  }

  function cloneHeaderShallow(header) {
    var h = header && typeof header === "object" ? header : {};
    var out = Object.assign({}, h);
    out.hdaHpp = h.hdaHpp == null ? "" : String(h.hdaHpp);
    out.diagnosticos = Array.isArray(h.diagnosticos)
      ? h.diagnosticos.map(function (d) {
          return d && typeof d === "object" ? Object.assign({}, d) : d;
        })
      : [];
    out.cirurgias = Array.isArray(h.cirurgias)
      ? h.cirurgias.map(function (c) {
          return c && typeof c === "object" ? Object.assign({}, c) : c;
        })
      : [];
    return out;
  }

  function collectHeaderNarrativeParts(header) {
    var h = header && typeof header === "object" ? header : {};
    var parts = [];
    parts.push({
      kind: "hdaHpp",
      index: -1,
      field: "hdaHpp",
      value: h.hdaHpp == null ? "" : String(h.hdaHpp),
    });
    var diags = Array.isArray(h.diagnosticos) ? h.diagnosticos : [];
    for (var di = 0; di < diags.length; di++) {
      var d = diags[di] || {};
      parts.push({
        kind: "diagnosticoTexto",
        index: di,
        field: "texto",
        value: d.texto == null ? "" : String(d.texto),
      });
    }
    var cirs = Array.isArray(h.cirurgias) ? h.cirurgias : [];
    for (var ci = 0; ci < cirs.length; ci++) {
      var c = cirs[ci] || {};
      parts.push({
        kind: "cirurgiaNome",
        index: ci,
        field: "nome",
        value: c.nome == null ? "" : String(c.nome),
      });
      parts.push({
        kind: "achadosOperatorios",
        index: ci,
        field: "achadosOperatorios",
        value: c.achadosOperatorios == null ? "" : String(c.achadosOperatorios),
      });
    }
    return parts;
  }

  function sumHeaderNarrativeChars(header) {
    var parts = collectHeaderNarrativeParts(header);
    var sum = 0;
    for (var i = 0; i < parts.length; i++) {
      sum += plainTextLength(parts[i].value);
    }
    return sum;
  }

  function resolveHeaderNarrativeUsage(header) {
    var pool = LIMIT_HEADER_SHARED;
    var used = sumHeaderNarrativeChars(header);
    return {
      usedChars: used,
      maxChars: pool.maxChars,
      remainingChars: Math.max(0, pool.maxChars - used),
      maxLines: pool.maxLines,
      over: used >= pool.maxChars,
    };
  }

  function writeNarrativePart(header, part, plainValue) {
    if (part.kind === "hdaHpp") {
      header.hdaHpp = plainValue;
      return;
    }
    if (part.kind === "diagnosticoTexto") {
      if (!header.diagnosticos[part.index]) return;
      header.diagnosticos[part.index].texto = plainValue;
      return;
    }
    if (part.kind === "cirurgiaNome") {
      if (!header.cirurgias[part.index]) return;
      header.cirurgias[part.index].nome = plainValue;
      return;
    }
    if (part.kind === "achadosOperatorios") {
      if (!header.cirurgias[part.index]) return;
      header.cirurgias[part.index].achadosOperatorios = plainValue;
    }
  }

  function partMatchesPrefer(part, preferKey, preferIndex) {
    if (!preferKey) return false;
    if (part.kind !== preferKey) return false;
    if (preferIndex == null || preferIndex < 0) return true;
    return part.index === preferIndex;
  }

  /**
   * @param {object} header
   * @param {string|null} [preferKey] hdaHpp|diagnosticoTexto|cirurgiaNome|achadosOperatorios
   * @param {number|null} [preferIndex] índice do item na lista (diag/cirurgia)
   */
  function clampHeaderNarrative(header, preferKey, preferIndex) {
    var out = cloneHeaderShallow(header);
    var pool = LIMIT_HEADER_SHARED;
    var max = pool.maxChars;
    var used = sumHeaderNarrativeChars(out);
    if (used <= max) return out;

    var parts = collectHeaderNarrativeParts(out);
    var lengths = parts.map(function (p) {
      return plainTextLength(p.value);
    });

    function shrinkAt(idx, room) {
      var plain = plainTextFromValue(parts[idx].value);
      var next = clampPlainText(plain, Math.max(0, room));
      lengths[idx] = next.length;
      writeNarrativePart(out, parts[idx], next);
    }

    var preferIdx = -1;
    for (var i = 0; i < parts.length; i++) {
      if (partMatchesPrefer(parts[i], preferKey, preferIndex)) {
        preferIdx = i;
        break;
      }
    }

    var total = lengths.reduce(function (a, b) {
      return a + b;
    }, 0);
    if (preferIdx >= 0 && total > max) {
      var others = total - lengths[preferIdx];
      shrinkAt(preferIdx, Math.max(0, max - others));
      total = lengths.reduce(function (a, b) {
        return a + b;
      }, 0);
    }

    while (total > max) {
      var longest = -1;
      var longestLen = -1;
      for (var j = 0; j < lengths.length; j++) {
        if (lengths[j] > longestLen) {
          longestLen = lengths[j];
          longest = j;
        }
      }
      if (longest < 0 || longestLen <= 0) break;
      var need = total - max;
      shrinkAt(longest, Math.max(0, longestLen - need));
      total = lengths.reduce(function (a, b) {
        return a + b;
      }, 0);
    }
    return out;
  }

  function estimateHeaderNarrativeWeight(header) {
    var parts = collectHeaderNarrativeParts(header);
    var w = 0;
    for (var i = 0; i < parts.length; i++) {
      w += estimateTextWeightCapped(parts[i].value, Infinity);
    }
    var cap = LIMIT_HEADER_SHARED.maxLines;
    if (!(cap > 0)) return w;
    return Math.min(w, cap);
  }

  /** No-op isolado — use clampHeaderNarrative no header. */
  function clampCirurgiaItem(item) {
    if (!item || typeof item !== "object") return item;
    return Object.assign({}, item);
  }

  function clampDiagnosticoItem(item) {
    if (!item || typeof item !== "object") return item;
    return Object.assign({}, item);
  }

  function estimateTextWeightCapped(text, maxLines) {
    var s = plainTextFromValue(text);
    if (!s) return 0;
    var lines = s.split("\n");
    var weight =
      Math.ceil(s.length / PRINT_CHARS_PER_LINE) + Math.max(0, lines.length - 1);
    if (maxLines === Infinity || maxLines == null) return weight;
    var cap =
      typeof maxLines === "number" && maxLines > 0 ? maxLines : Infinity;
    return Math.min(weight, cap);
  }

  function maxHeightEm(maxLines) {
    var n = typeof maxLines === "number" && maxLines > 0 ? maxLines : 1;
    return (n * 1.15).toFixed(2) + "em";
  }

  function formatLimitHint(maxChars, maxLines) {
    var chars =
      typeof maxChars === "number" && maxChars > 0 ? maxChars : 0;
    var lines =
      typeof maxLines === "number" && maxLines > 0 ? maxLines : 1;
    var lineWord = lines === 1 ? "linha" : "linhas";
    return (
      "Máx. " + chars + " caracteres · " + lines + " " + lineWord + " na impressão"
    );
  }

  function formatCharCounterText(value, maxChars, maxLines) {
    var n = plainTextLength(value);
    var max =
      typeof maxChars === "number" && maxChars > 0 ? maxChars : 0;
    var over = max > 0 && n >= max;
    var head = n + "/" + max + (over ? " — Limite de caracteres" : "");
    return head + "\n" + formatLimitHint(max, maxLines);
  }

  function formatSharedEntryCounterText(cd, pendencias) {
    var u = resolveSharedEntryUsage(cd, pendencias);
    var head =
      u.usedChars +
      "/" +
      u.maxChars +
      (u.over ? " — Limite partilhado CD+pendências" : "");
    return (
      head +
      "\n" +
      formatLimitHint(u.maxChars, u.maxLines) +
      " (CD+pendências)"
    );
  }

  function formatHeaderNarrativeCounterText(header) {
    var u = resolveHeaderNarrativeUsage(header);
    var head =
      u.usedChars +
      "/" +
      u.maxChars +
      (u.over ? " — Limite partilhado cabeçalho" : "");
    return (
      head +
      "\n" +
      formatLimitHint(u.maxChars, u.maxLines) +
      " (HDA+diagnóstico+cirurgia+achados)"
    );
  }

  /** Room for one contributor: own plain length + remaining in pool. */
  function resolveHeaderNarrativeRoom(header, preferKey, preferIndex) {
    var usage = resolveHeaderNarrativeUsage(header);
    var parts = collectHeaderNarrativeParts(header);
    var own = 0;
    for (var i = 0; i < parts.length; i++) {
      if (partMatchesPrefer(parts[i], preferKey, preferIndex)) {
        own = plainTextLength(parts[i].value);
        break;
      }
    }
    return {
      maxChars: own + usage.remainingChars,
      maxLines: usage.maxLines,
      usedChars: usage.usedChars,
      remainingChars: usage.remainingChars,
    };
  }

  return {
    PRINT_CHARS_PER_LINE: PRINT_CHARS_PER_LINE,
    LIMIT_SHORT: LIMIT_SHORT,
    LIMIT_MEDIUM: LIMIT_MEDIUM,
    LIMIT_LONG_HEADER: LIMIT_LONG_HEADER,
    LIMIT_LONG_ENTRY: LIMIT_LONG_ENTRY,
    LIMIT_ENTRY_SHARED: LIMIT_ENTRY_SHARED,
    LIMIT_HEADER_SHARED: LIMIT_HEADER_SHARED,
    LIMIT_UNCAPPED: LIMIT_UNCAPPED,
    KEY_LIMITS: KEY_LIMITS,
    plainTextFromValue: plainTextFromValue,
    plainTextLength: plainTextLength,
    resolveFieldLimit: resolveFieldLimit,
    clampPlainText: clampPlainText,
    clampFieldValue: clampFieldValue,
    clampCdPendenciasPair: clampCdPendenciasPair,
    resolveSharedEntryUsage: resolveSharedEntryUsage,
    estimateCdPendenciasWeight: estimateCdPendenciasWeight,
    sumHeaderNarrativeChars: sumHeaderNarrativeChars,
    resolveHeaderNarrativeUsage: resolveHeaderNarrativeUsage,
    clampHeaderNarrative: clampHeaderNarrative,
    estimateHeaderNarrativeWeight: estimateHeaderNarrativeWeight,
    formatHeaderNarrativeCounterText: formatHeaderNarrativeCounterText,
    resolveHeaderNarrativeRoom: resolveHeaderNarrativeRoom,
    clampCirurgiaItem: clampCirurgiaItem,
    clampDiagnosticoItem: clampDiagnosticoItem,
    estimateTextWeightCapped: estimateTextWeightCapped,
    maxHeightEm: maxHeightEm,
    formatLimitHint: formatLimitHint,
    formatCharCounterText: formatCharCounterText,
    formatSharedEntryCounterText: formatSharedEntryCounterText,
  };
});
