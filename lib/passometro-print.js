/**
 * Impressão do Passômetro (HTML + diálogo nativo do browser).
 * Testável em Node via buildPrintHtml / escapeHtml; browser: AghuPassometroPrint.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAYS_PER_PRINT_PAGE = 8;
  var EXAMS_PRINT_MAX_COLUMNS = 6;
  var PRINT_CHARS_PER_LINE = 80;
  var PRINT_DAY_STRIP_OVERHEAD = 1;
  /** Estimativa px/bloco para repaginação offline (preview Node). */
  var PRINT_EST_GRID_ROW_PX = 10;
  var PRINT_EST_BLOCK_MARGIN_PX = 6;
  var PRINT_EST_PX_PER_WEIGHT = 11;
  var PRINT_EST_INST_HEADER_PX = 48;
  var PRINT_EST_PAT_ROW_PX = 22;
  /** Soft-cap do peso total do cabeçalho na estimativa (HDA+cirurgias+…). */
  var PRINT_EST_HEADER_WEIGHT_CAP = 10;
  var PRINT_EST_DAY_STRIP_PX = 28;
  var PRINT_PAGE_WIDTH_MM = 210;
  var PRINT_PAGE_HEIGHT_MM = 297;
  /** Margens reais via @page (aplicam-se a toda folha). Não simular com padding do body. */
  var PRINT_PAGE_TOP_MM = 6;
  /** Sem margem inferior — aproveita altura útil no packing / impressão. */
  var PRINT_PAGE_BOTTOM_MM = 0;
  var PRINT_PAGE_SIDE_MM = 8;
  var PRINT_PAGE_CONTENT_WIDTH_MM =
    PRINT_PAGE_WIDTH_MM - 2 * PRINT_PAGE_SIDE_MM;
  /** margin-bottom de `.day-block` — offsetHeight não inclui; somar na medição. */
  var PRINT_DAY_BLOCK_MARGIN_PX = 2;
  /** Reserva para `.footer` anexado após o packing (última folha de dias). */
  var PRINT_FOOTER_RESERVE_PX = 24;
  /** Folga mm→px / wrapping tela vs papel no orçamento de packing. */
  var PRINT_PAGE_SAFETY_MM = 2;
  var MM_PER_INCH = 25.4;
  var CSS_PX_PER_INCH = 96;
  /** Preview em ecrã: mesma geometria que @page (topo/laterais/base). */
  var PRINT_SCREEN_PADDING =
    PRINT_PAGE_TOP_MM +
    "mm " +
    PRINT_PAGE_SIDE_MM +
    "mm " +
    PRINT_PAGE_BOTTOM_MM +
    "mm " +
    PRINT_PAGE_SIDE_MM +
    "mm";
  /** @page: top | right | bottom | left */
  var PRINT_PAGE_MARGIN_CSS =
    PRINT_PAGE_TOP_MM +
    "mm " +
    PRINT_PAGE_SIDE_MM +
    "mm " +
    PRINT_PAGE_BOTTOM_MM +
    "mm " +
    PRINT_PAGE_SIDE_MM +
    "mm";
  /** Mesmo padrão de lib/receita-print.js — funciona no Gecko no painel web. */
  var PRINT_IFRAME_STYLE =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  /** @deprecated alias — estilo unificado em PRINT_IFRAME_STYLE */
  var PRINT_IFRAME_STYLE_CHROME = PRINT_IFRAME_STYLE;
  /** @deprecated alias — estilo unificado em PRINT_IFRAME_STYLE */
  var PRINT_IFRAME_STYLE_FIREFOX = PRINT_IFRAME_STYLE;
  var PRINT_DELAY_MS_CHROME = 100;
  var PRINT_DELAY_MS_FIREFOX = 500;

  /**
   * @param {string} [ua]
   * @returns {boolean}
   */
  function isFirefox(ua) {
    var s = ua;
    if (s == null) {
      if (typeof navigator === "undefined") return false;
      s = navigator.userAgent || "";
    }
    return /Firefox\//i.test(String(s)) && !/Seamonkey\//i.test(String(s));
  }

  /**
   * @param {{ firefox?: boolean }} [options]
   * @returns {string}
   */
  function resolvePrintIframeStyle(options) {
    void options;
    return PRINT_IFRAME_STYLE;
  }

  /**
   * @param {{ firefox?: boolean, iframe?: boolean }} [options]
   * @returns {number}
   */
  function getPrintDelayMs(options) {
    var opts = options || {};
    var firefox = opts.firefox != null ? opts.firefox : isFirefox();
    if (opts.iframe) {
      return PRINT_DELAY_MS_CHROME;
    }
    return firefox ? PRINT_DELAY_MS_FIREFOX : PRINT_DELAY_MS_CHROME;
  }

  /**
   * @param {{ title?: string, documentTitle?: string }} [options]
   * @returns {string}
   */
  function resolvePrintTitle(options) {
    var opts = options || {};
    if (opts.documentTitle != null) return String(opts.documentTitle);
    if (opts.title != null) return String(opts.title);
    return "Impressão";
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroSchema) {
      return globalThis.AghuPassometroSchema;
    }
    throw new Error("AghuPassometroSchema não disponível");
  }

  function getTemplate() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-template.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroTemplate) {
      return globalThis.AghuPassometroTemplate;
    }
    throw new Error("AghuPassometroTemplate não disponível");
  }

  function getFieldLimits() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-field-limits.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroFieldLimits
    ) {
      return globalThis.AghuPassometroFieldLimits;
    }
    return null;
  }

  function clampPrintValue(fieldKeyOrDef, value) {
    var limits = getFieldLimits();
    if (!limits || typeof limits.clampFieldValue !== "function") {
      return value == null ? "" : String(value);
    }
    return limits.clampFieldValue(fieldKeyOrDef, value);
  }

  function getPoModule() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-po.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroPo) {
      return globalThis.AghuPassometroPo;
    }
    return null;
  }

  function getLayout() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-layout.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroLayout) {
      return globalThis.AghuPassometroLayout;
    }
    throw new Error("AghuPassometroLayout não disponível");
  }

  function getBranding() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-print-branding.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroPrintBranding
    ) {
      return globalThis.AghuPassometroPrintBranding;
    }
    throw new Error("AghuPassometroPrintBranding não disponível");
  }

  function getExamsTable() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-exams-table.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroExamsTable
    ) {
      return globalThis.AghuPassometroExamsTable;
    }
    return null;
  }

  /**
   * @param {unknown} s
   * @returns {string}
   */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPrintDateTime() {
    try {
      return new Date().toLocaleString("pt-BR");
    } catch (_e) {
      return String(new Date());
    }
  }

  /**
   * @param {unknown[]} arr
   * @param {number} size
   * @returns {unknown[][]}
   */
  function chunkArray(arr, size) {
    var chunks = [];
    for (var i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * @param {unknown} v
   * @returns {string}
   */
  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * @param {number} mm
   * @param {Window} win
   * @returns {number}
   */
  function mmToPx(mm, win) {
    if (!win) return (mm * CSS_PX_PER_INCH) / MM_PER_INCH;
    return (mm * CSS_PX_PER_INCH) / MM_PER_INCH;
  }

  /**
   * @param {Document} doc
   * @returns {number}
   */
  function getPageUsableHeightPx(doc) {
    var win = doc && doc.defaultView;
    if (!win) return 0;
    return mmToPx(
      PRINT_PAGE_HEIGHT_MM - PRINT_PAGE_TOP_MM - PRINT_PAGE_BOTTOM_MM,
      win,
    );
  }

  /**
   * Orçamento conservador para packing: altura útil − safety − (opcional) rodapé.
   * @param {{ usablePx?: number, hasFooter?: boolean }} [opts]
   * @returns {number}
   */
  function resolveDaysPageBudgetPx(opts) {
    var o = opts || {};
    var usablePx = Number(o.usablePx);
    if (!(usablePx > 0)) return 0;
    var budget = usablePx - mmToPx(PRINT_PAGE_SAFETY_MM, null);
    if (o.hasFooter) {
      budget -= PRINT_FOOTER_RESERVE_PX;
    }
    if (budget < 1) {
      return Math.max(1, usablePx * 0.5);
    }
    return budget;
  }

  /**
   * Quantos blocos finais mover para caber em usablePx.
   * Nunca esvazia a página (deixa ≥1 bloco).
   * @param {number} sectionHeightPx
   * @param {number[]} blockHeightsTail alturas dos blocos na section (ordem DOM)
   * @param {number} usablePx
   * @returns {number}
   */
  function countBlocksToMoveOut(sectionHeightPx, blockHeightsTail, usablePx) {
    var heights = blockHeightsTail || [];
    var n = heights.length;
    if (!n || !(sectionHeightPx > usablePx)) return 0;
    var overflow = sectionHeightPx - usablePx;
    if (!(overflow > 0)) return 0;
    var freed = 0;
    var move = 0;
    for (var i = n - 1; i >= 1; i--) {
      var h = heights[i] > 0 ? heights[i] : 0;
      freed += h;
      move++;
      if (freed >= overflow) break;
    }
    return move;
  }

  /**
   * Guarda fail-fast: medição de largura só é fiável se ≈ área útil A4.
   * Evita fit-repair com offsetHeight inflado (iframe width:0 + só max-width).
   * @param {{ measuredWidthPx?: number, expectedWidthPx?: number, tolerance?: number }} [opts]
   * @returns {boolean}
   */
  function isPrintMeasurementTrustworthy(opts) {
    var o = opts || {};
    var measured = Number(o.measuredWidthPx);
    var expected = Number(o.expectedWidthPx);
    var tolerance = o.tolerance != null ? Number(o.tolerance) : 0.1;
    if (!(measured > 0) || !(expected > 0)) return false;
    if (!(tolerance >= 0) || Number.isNaN(tolerance)) tolerance = 0.1;
    var ratio = Math.abs(measured - expected) / expected;
    return ratio <= tolerance;
  }

  /**
   * Largura de conteúdo usada na medição pós-montagem (section ou body − padding).
   * @param {Document} doc
   * @returns {number}
   */
  function measurePrintContentWidthPx(doc) {
    var body = doc && doc.body;
    if (!body) return 0;
    var section = body.querySelector("section.print-page");
    if (section && section.clientWidth > 0) {
      return section.clientWidth;
    }
    var padL = 0;
    var padR = 0;
    var win = doc.defaultView;
    if (win && typeof win.getComputedStyle === "function") {
      try {
        var cs = win.getComputedStyle(body);
        padL = parseFloat(cs.paddingLeft) || 0;
        padR = parseFloat(cs.paddingRight) || 0;
      } catch (_e) {
        /* ignore */
      }
    }
    return Math.max(0, (body.clientWidth || 0) - padL - padR);
  }

  /**
   * Rede de segurança pós-montagem: se alguma `.days-page` excede usablePx,
   * move blocos finais para nova section com cabeçalho de continuação.
   * @param {Document} doc
   * @param {number} usablePx
   * @param {Element} contHeaderEl
   * @param {string} printedAt
   */
  function enforceDaysPagesFit(doc, usablePx, contHeaderEl, printedAt) {
    var body = doc && doc.body;
    if (!body || !contHeaderEl || !(usablePx > 0)) return;

    function daySections() {
      return body.querySelectorAll("section.print-page.days-page");
    }

    function repositionDaysFooter() {
      var sections = daySections();
      if (!sections.length) return;
      var i;
      for (i = 0; i < sections.length; i++) {
        var foot = sections[i].querySelector(":scope > .footer");
        if (foot && foot.parentNode) {
          foot.parentNode.removeChild(foot);
        }
      }
      var hasExamsPage = !!body.querySelector("section.print-page.exams-page");
      if (!hasExamsPage && printedAt) {
        sections = daySections();
        if (sections.length) {
          sections[sections.length - 1].appendChild(
            buildFooterEl(doc, printedAt),
          );
        }
      }
    }

    var expectedWidthPx = mmToPx(PRINT_PAGE_CONTENT_WIDTH_MM, null);
    var measuredWidthPx = measurePrintContentWidthPx(doc);
    if (
      !isPrintMeasurementTrustworthy({
        measuredWidthPx: measuredWidthPx,
        expectedWidthPx: expectedWidthPx,
        tolerance: 0.1,
      })
    ) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[AGHU] print fit repair skipped");
      }
      repositionDaysFooter();
      return;
    }

    var totalBlocks = body.querySelectorAll(
      "section.print-page.days-page .day-block",
    ).length;
    var budget = Math.max(1, totalBlocks);
    var pass = 0;

    while (pass < budget) {
      pass++;
      var sections = daySections();
      var overflowSection = null;
      var si;
      for (si = 0; si < sections.length; si++) {
        if ((sections[si].offsetHeight || 0) > usablePx) {
          overflowSection = sections[si];
          break;
        }
      }
      if (!overflowSection) {
        repositionDaysFooter();
        return;
      }

      var group = overflowSection.querySelector(".days-group");
      if (!group) {
        repositionDaysFooter();
        return;
      }

      var blockEls = group.querySelectorAll(".day-block");
      if (blockEls.length < 2) {
        repositionDaysFooter();
        return;
      }

      var heights = [];
      var bi;
      for (bi = 0; bi < blockEls.length; bi++) {
        heights.push(
          (blockEls[bi].offsetHeight || 0) + PRINT_DAY_BLOCK_MARGIN_PX,
        );
      }

      var toMove = countBlocksToMoveOut(
        overflowSection.offsetHeight || 0,
        heights,
        usablePx,
      );
      if (toMove < 1) {
        repositionDaysFooter();
        return;
      }

      var nodesToMove = [];
      var start = blockEls.length - toMove;
      var mi;
      for (mi = start; mi < blockEls.length; mi++) {
        nodesToMove.push(blockEls[mi]);
      }

      var newSection = doc.createElement("section");
      newSection.className = "print-page days-page";
      appendClonedChildren(newSection, contHeaderEl);
      var newGroup = doc.createElement("div");
      newGroup.className = "days-group";
      for (mi = 0; mi < nodesToMove.length; mi++) {
        newGroup.appendChild(nodesToMove[mi]);
      }
      newSection.appendChild(newGroup);

      var insertBefore = overflowSection.nextSibling;
      body.insertBefore(newSection, insertBefore);
    }

    if (typeof console !== "undefined" && console.warn) {
      console.warn("[AGHU] print fit repair budget");
    }
    repositionDaysFooter();
  }

  /**
   * Empacota índices de day-blocks por altura disponível em cada folha A4.
   * @param {number[]} blockHeights
   * @param {number} firstOverheadPx
   * @param {number} contOverheadPx
   * @param {number} pageUsablePx
   * @returns {number[][]}
   */
  function packDayBlocksByHeight(
    blockHeights,
    firstOverheadPx,
    contOverheadPx,
    pageUsablePx,
  ) {
    var n = blockHeights.length;
    if (!n) return [];

    var pages = [];
    var idx = 0;
    var pageIndex = 0;

    while (idx < n) {
      var overhead = pageIndex === 0 ? firstOverheadPx : contOverheadPx;
      var remaining = pageUsablePx - overhead;
      if (remaining < 1) remaining = Math.max(1, pageUsablePx * 0.5);

      var group = [];
      var used = 0;

      while (idx < n) {
        var h = blockHeights[idx] > 0 ? blockHeights[idx] : 1;
        if (group.length > 0 && used + h > remaining) break;
        if (group.length === 0 && h > remaining) {
          group.push(idx);
          idx++;
          break;
        }
        group.push(idx);
        used += h;
        idx++;
      }

      if (!group.length && idx < n) {
        group.push(idx);
        idx++;
      }
      pages.push(group);
      pageIndex++;
    }

    return pages;
  }

  /**
   * @param {unknown} text
   * @returns {number}
   */
  function estimateTextWeight(text, maxLines) {
    var limits = getFieldLimits();
    if (limits && typeof limits.estimateTextWeightCapped === "function") {
      return limits.estimateTextWeightCapped(text, maxLines);
    }
    var s = String(text == null ? "" : text);
    if (!s) return 0;
    var lines = s.split("\n");
    var weight =
      Math.ceil(s.length / PRINT_CHARS_PER_LINE) + Math.max(0, lines.length - 1);
    if (typeof maxLines === "number" && maxLines > 0) {
      return Math.min(weight, maxLines);
    }
    return weight;
  }

  /**
   * @param {object | null | undefined} fieldDef
   * @returns {boolean}
   */
  function isMultilineFieldDef(fieldDef) {
    if (!fieldDef) return false;
    if (fieldDef.widget === "textarea") return true;
    var key = fieldDef.key;
    return key === "cd" || key === "pendencias" || key === "hdaHpp" || key === "cirurgias" || key === "diagnosticos";
  }

  /**
   * @param {object} entry
   * @param {object} fieldDef
   * @returns {string}
   */
  function getEntryFieldRawValue(entry, fieldDef) {
    if (!entry || !fieldDef) return "";
    if (fieldDef.kind === "custom") {
      return entry.custom && entry.custom[fieldDef.key] != null
        ? String(entry.custom[fieldDef.key])
        : "";
    }
    return entry[fieldDef.key] != null ? String(entry[fieldDef.key]) : "";
  }

  /**
   * @param {object} entry
   * @param {object} template
   * @returns {number}
   */
  function estimateEntryWeight(entry, template) {
    var weight = 1;
    var limits = getFieldLimits();
    if (
      limits &&
      typeof limits.estimateCdPendenciasWeight === "function"
    ) {
      weight += limits.estimateCdPendenciasWeight(
        entry && entry.cd,
        entry && entry.pendencias,
      );
    }
    var seen = Object.create(null);
    seen.cd = true;
    seen.pendencias = true;
    var entryRows = template.entryRows || [];
    for (var ri = 0; ri < entryRows.length; ri++) {
      var row = entryRows[ri];
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell || !cell.key || seen[cell.key]) continue;
        seen[cell.key] = true;
        var fieldDef = fieldDefByKey(template, cell.key);
        if (!isMultilineFieldDef(fieldDef)) continue;
        var lim =
          limits && limits.resolveFieldLimit
            ? limits.resolveFieldLimit(fieldDef)
            : null;
        if (lim && !(lim.maxLines > 0)) continue;
        weight += estimateTextWeight(
          getEntryFieldRawValue(entry, fieldDef),
          lim ? lim.maxLines : undefined,
        );
      }
    }
    return weight;
  }

  /**
   * @param {object} header
   * @param {object} template
   * @returns {number}
   */
  function estimateHeaderWeight(header, template) {
    var limits = getFieldLimits();
    var weight = 0;
    if (
      limits &&
      typeof limits.estimateHeaderNarrativeWeight === "function"
    ) {
      weight += limits.estimateHeaderNarrativeWeight(header);
    }
    var tplMod = getTemplate();
    var seen = Object.create(null);
    var headerRows = template.headerRows || [];
    for (var ri = 0; ri < headerRows.length; ri++) {
      var row = headerRows[ri];
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell || !cell.key || seen[cell.key]) continue;
        seen[cell.key] = true;
        // Narrativa partilhada já contada acima.
        if (
          cell.key === "hdaHpp" ||
          cell.key === "cirurgias" ||
          cell.key === "diagnosticos"
        ) {
          continue;
        }
        var fieldDef = fieldDefByKey(template, cell.key);
        if (!isMultilineFieldDef(fieldDef) && !cell.wide) continue;
        var mergedDef = Object.assign({}, fieldDef, {
          key: cell.key,
          label: cell.label,
          section: "header",
        });
        var lim =
          limits && limits.resolveFieldLimit
            ? limits.resolveFieldLimit(mergedDef)
            : null;
        if (lim && !(lim.maxChars > 0)) continue;
        var value = tplMod.getFieldValue({ header: header || {} }, mergedDef);
        var maxLines = lim && lim.maxLines > 0 ? lim.maxLines : undefined;
        weight += estimateTextWeight(value, maxLines);
      }
    }
    if (weight > PRINT_EST_HEADER_WEIGHT_CAP) {
      return PRINT_EST_HEADER_WEIGHT_CAP;
    }
    return weight;
  }

  function isCustomEntryCell(template, cell) {
    if (!cell || !cell.key) return false;
    var def = fieldDefByKey(template, cell.key);
    if (def && def.kind === "custom") return true;
    return String(cell.key).indexOf("custom_") === 0;
  }

  /**
   * Altura estimada de um bloco diário (px) — paridade com offsetHeight no iframe.
   * Packing: no máximo +1 linha custom no base (customs extra não incham a estimativa).
   * @param {object} entry
   * @param {object} template
   * @returns {number}
   */
  function estimateDayBlockHeightPx(entry, template) {
    var entryRows = template.entryRows || [];
    var canonicalRows = 0;
    var customRows = 0;
    for (var ri = 0; ri < entryRows.length; ri++) {
      var row = entryRows[ri];
      var hasCustom = false;
      if (Array.isArray(row)) {
        for (var ci = 0; ci < row.length; ci++) {
          if (isCustomEntryCell(template, row[ci])) {
            hasCustom = true;
            break;
          }
        }
      }
      if (hasCustom) customRows += 1;
      else canonicalRows += 1;
    }
    var rowCountEff = Math.max(
      1,
      canonicalRows + Math.min(customRows, 1),
    );
    var base =
      rowCountEff * PRINT_EST_GRID_ROW_PX + PRINT_EST_BLOCK_MARGIN_PX;
    var weight = estimateEntryWeight(entry, template);
    return base + Math.max(0, weight - 1) * PRINT_EST_PX_PER_WEIGHT;
  }

  /**
   * @param {object} template
   * @returns {number}
   */
  function estimatePatTableBasePx(template) {
    var headerRows = template.headerRows || [];
    return Math.max(1, headerRows.length) * PRINT_EST_PAT_ROW_PX + 8;
  }

  /**
   * @param {object} header
   * @param {object} template
   * @param {object} branding
   * @returns {number}
   */
  function estimateFirstHeaderHeightPx(header, template, branding) {
    void branding;
    var showInst =
      !template.print || template.print.showInstitutionHeader !== false;
    var h = showInst ? PRINT_EST_INST_HEADER_PX : 0;
    h += estimatePatTableBasePx(template);
    h += estimateHeaderWeight(header, template) * PRINT_EST_PX_PER_WEIGHT;
    return h;
  }

  /**
   * @param {object} template
   * @param {object} branding
   * @returns {number}
   */
  function estimateContHeaderHeightPx(template, branding) {
    void branding;
    var showInst =
      !template.print || template.print.showInstitutionHeader !== false;
    var h = showInst ? PRINT_EST_INST_HEADER_PX : 0;
    h += PRINT_EST_DAY_STRIP_PX;
    return h;
  }

  /**
   * Agrupa entradas por peso de conteúdo para caber em páginas A4.
   * @param {object[]} entries
   * @param {object} template
   * @param {object} snap
   * @param {{ daysPerPage?: number }} [options]
   * @returns {object[][]}
   */
  function chunkEntriesForPrint(entries, template, snap, options) {
    var opts = options || {};
    var maxBudget =
      opts.daysPerPage != null
        ? opts.daysPerPage
        : template.print && template.print.daysPerPage
          ? template.print.daysPerPage
          : DAYS_PER_PRINT_PAGE;
    var list = entries || [];
    if (!list.length) return [[]];

    var header = (snap && snap.header) || {};
    var headerWeight = estimateHeaderWeight(header, template);
    var chunks = [];
    var current = [];
    var used = 0;
    var isFirstChunk = true;

    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var entryWeight = estimateEntryWeight(entry, template);
      var pageOverhead = isFirstChunk ? headerWeight : PRINT_DAY_STRIP_OVERHEAD;
      var budget = Math.max(1, maxBudget - pageOverhead);

      if (current.length > 0 && used + entryWeight > budget) {
        chunks.push(current);
        current = [];
        used = 0;
        isFirstChunk = false;
        pageOverhead = PRINT_DAY_STRIP_OVERHEAD;
        budget = Math.max(1, maxBudget - pageOverhead);
      }

      if (current.length === 0 && entryWeight > budget) {
        chunks.push([entry]);
        isFirstChunk = false;
        continue;
      }

      current.push(entry);
      used += entryWeight;
    }

    if (current.length) chunks.push(current);
    return chunks.length ? chunks : [[]];
  }

  /**
   * @param {object} branding
   * @returns {string}
   */
  function buildInstitutionHeader(branding) {
    var alt = branding.LOGO_ALT || "HUCAM";
    var line1 = branding.INSTITUTION_LINE_1 || "";
    var line2 = branding.INSTITUTION_LINE_2 || "";
    return (
      '<header class="inst-header">' +
      '<img class="inst-logo" src="' +
      branding.LOGO_DATA_URI +
      '" alt="' +
      escapeHtml(alt) +
      '">' +
      '<div class="inst-text">' +
      '<div class="inst-line">' +
      escapeHtml(line1) +
      "</div>" +
      '<div class="inst-line">' +
      escapeHtml(line2) +
      "</div>" +
      "</div></header>"
    );
  }

  /**
   * @param {string} label
   * @param {string} value
   * @param {number} colspan
   * @returns {string}
   */
  function buildPatientCell(label, value, colspan, multiline, fieldKey, section) {
    var colspanAttr = colspan > 1 ? ' colspan="' + colspan + '"' : "";
    var valueCls =
      "pat-value" + (multiline ? " pat-value-multiline" : "");
    var lim = getFieldLimits();
    var fieldLim =
      lim && fieldKey && lim.resolveFieldLimit
        ? lim.resolveFieldLimit(fieldKey)
        : null;
    var uncapped = fieldLim && !(fieldLim.maxChars > 0);
    var softHeaderJoin =
      fieldKey === "cirurgias" ||
      fieldKey === "diagnosticos" ||
      fieldKey === "hdaHpp";
    if (multiline && softHeaderJoin) {
      var softLines =
        lim && lim.LIMIT_HEADER_SHARED && lim.LIMIT_HEADER_SHARED.maxLines > 0
          ? lim.LIMIT_HEADER_SHARED.maxLines
          : lim && lim.LIMIT_LONG_HEADER && lim.LIMIT_LONG_HEADER.maxLines > 0
            ? lim.LIMIT_LONG_HEADER.maxLines
            : 8;
      valueCls += " pat-value-lines-" + softLines;
    } else if (multiline && !uncapped) {
      var lines =
        fieldLim && fieldLim.maxLines > 0
          ? fieldLim.maxLines
          : lim
            ? lim.LIMIT_LONG_HEADER.maxLines
            : 8;
      valueCls += " pat-value-lines-" + lines;
    }
    var clamped =
      fieldKey && !uncapped
        ? clampPrintValue(fieldKey, value)
        : value == null
          ? ""
          : String(value);
    var dataAttrs = "";
    if (fieldKey) {
      dataAttrs =
        ' data-pm-field="' +
        escapeHtml(fieldKey) +
        '" data-pm-section="' +
        escapeHtml(section || "header") +
        '"';
    }
    return (
      "<td" +
      colspanAttr +
      '><span class="pat-label">' +
      escapeHtml(label) +
      '</span><span class="' +
      valueCls +
      '"' +
      dataAttrs +
      ">" +
      escapeHtml(clamped) +
      "</span></td>"
    );
  }

  function resolvePrintTemplate(snap, opts) {
    var tplMod = getTemplate();
    var tpl;
    if (opts.template) {
      tpl = tplMod.sanitizeTemplate(opts.template);
    } else if (snap && snap.layout) {
      tpl = tplMod.resolveEffectiveTemplate(null, snap.layout);
    } else {
      tpl = tplMod.resolveEffectiveTemplate(null, null);
    }
    if (tplMod.alignEntryRowsForPrint) {
      return Object.assign({}, tpl, {
        entryRows: tplMod.alignEntryRowsForPrint(tpl.entryRows, tpl.fields),
      });
    }
    return tpl;
  }

  function fieldDefByKey(template, key) {
    var fields = template.fields || [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].key === key) return fields[i];
    }
    return { key: key, kind: "builtin", section: "entry", label: key };
  }

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return typeof globalThis !== "undefined" ? globalThis.AghuDateBr : null;
  }

  function entryPreferIso(entry) {
    var d = getDateBr();
    if (!entry || entry.data == null || !d || !d.brToIso) return null;
    return d.brToIso(String(entry.data).trim());
  }

  function cellDisplayValue(snap, entry, fieldDef, printContext) {
    if (
      fieldDef &&
      fieldDef.kind === "score" &&
      printContext &&
      typeof printContext.scoreResolver === "function"
    ) {
      var fromResolver = printContext.scoreResolver(fieldDef, entry);
      return fromResolver != null ? String(fromResolver) : "";
    }
    var tplMod = getTemplate();
    var preferDataISO =
      fieldDef && fieldDef.section === "entry" ? entryPreferIso(entry) : null;
    var display = tplMod.resolveFieldDisplay(
      { header: snap.header, entry: entry },
      fieldDef,
      {
        entry: entry,
        section: fieldDef && fieldDef.section,
        preferDataISO: preferDataISO,
        exams: printContext.exams,
        pii: printContext.pii,
        controles: printContext.controles,
        precomputed: preferDataISO ? null : printContext.precomputed,
        passometro: printContext.passometro,
      },
    );
    return display && display.display != null ? String(display.display) : "";
  }

  /**
   * @param {object} header
   * @param {object[]} headerRows
   * @param {object} snap
   * @param {object} printContext
   */
  var HEADER_LOGICAL_COLS = 4;

  function buildPatientHeaderTable(header, headerRows, template, printContext) {
    var lim = getFieldLimits();
    var h = header || {};
    if (lim && typeof lim.clampHeaderNarrative === "function") {
      h = lim.clampHeaderNarrative(h, null, null);
    }
    var rowsHtml = "";
    var tplMod = getTemplate();
    for (var ri = 0; ri < headerRows.length; ri++) {
      var row = headerRows[ri];
      var rowCells = [];
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell) continue;
        var fieldDef = fieldDefByKey(template, cell.key);
        var mergedDef = Object.assign({}, fieldDef, {
          key: cell.key,
          label: cell.label,
          section: "header",
        });
        var value = "";
        if (mergedDef.kind === "score") {
          value = cellDisplayValue(
            { header: h },
            null,
            mergedDef,
            printContext,
          );
        } else {
          value = tplMod.getFieldValue({ header: h }, mergedDef);
        }
        var colspan = cell.wide ? 4 : 2;
        rowCells.push({
          label: cell.label,
          value: value,
          colspan: colspan,
          multiline: isMultilineFieldDef(mergedDef) || !!cell.wide,
          fieldKey: cell.key,
        });
      }
      var used = 0;
      for (var ui = 0; ui < rowCells.length; ui++) {
        used += rowCells[ui].colspan;
      }
      while (used < HEADER_LOGICAL_COLS) {
        var pad = HEADER_LOGICAL_COLS - used;
        rowCells.push({ label: "", value: "", colspan: pad });
        used += pad;
      }
      rowsHtml += "<tr>";
      for (var bi = 0; bi < rowCells.length; bi++) {
        var rc = rowCells[bi];
        rowsHtml += buildPatientCell(
          rc.label,
          rc.value,
          rc.colspan,
          rc.multiline,
          rc.fieldKey,
          "header",
        );
      }
      rowsHtml += "</tr>";
    }
    return (
      '<table class="pat-table" cellspacing="0" cellpadding="0"><tbody>' +
      rowsHtml +
      "</tbody></table>"
    );
  }

  /**
   * @param {object} header
   * @returns {string}
   */
  function buildPatientHeaderTableLegacy(header) {
    var lim = getFieldLimits();
    var h = header || {};
    if (lim && typeof lim.clampHeaderNarrative === "function") {
      h = lim.clampHeaderNarrative(h, null, null);
    }
    var poMod = getPoModule();
    var schemaMod = getSchema();
    var diagnosticosText =
      schemaMod && schemaMod.formatDiagnosticosDisplay
        ? schemaMod.formatDiagnosticosDisplay(h)
        : str(h.diagnostico);
    var cirurgiasText =
      poMod && poMod.formatCirurgiasDisplay
        ? poMod.formatCirurgiasDisplay(h)
        : "";
    if (!cirurgiasText && (h.dataCirurgia || h.cirurgia)) {
      var legacyLine = str(h.dataCirurgia).trim();
      var legacyDesc = str(h.cirurgia).trim();
      cirurgiasText = legacyDesc
        ? legacyLine + " — " + legacyDesc
        : legacyLine;
    }
    return (
      '<table class="pat-table" cellspacing="0" cellpadding="0">' +
      "<tbody>" +
      "<tr>" +
      buildPatientCell("Nome", h.nome || "", 3, false, "nome", "header") +
      buildPatientCell("Idade", h.idade || "", 1, false, "idade", "header") +
      "</tr>" +
      "<tr>" +
      buildPatientCell("Prontuário", h.prontuario || "", 2, false, "prontuario", "header") +
      buildPatientCell("Peso", h.peso || "", 2, false, "peso", "header") +
      "</tr>" +
      "<tr>" +
      buildPatientCell("Staff", h.staff || "", 2, false, "staff", "header") +
      buildPatientCell("DIH", h.dih || "", 2, false, "dih", "header") +
      "</tr>" +
      "<tr>" +
      buildPatientCell("Diagnóstico", diagnosticosText || "", 4, true, "diagnosticos", "header") +
      "</tr>" +
      "<tr>" +
      buildPatientCell("Cirurgias", cirurgiasText, 4, true, "cirurgias", "header") +
      "</tr>" +
      "<tr>" +
      buildPatientCell("HDA / HPP", h.hdaHpp || "", 4, true, "hdaHpp", "header") +
      "</tr>" +
      "</tbody></table>"
    );
  }

  /**
   * Faixa compacta repetida nas folhas de dias 2+.
   * @param {object} header
   * @returns {string}
   */
  function buildDayStrip(header) {
    var h = header || {};
    return (
      '<div class="day-strip">' +
      '<span class="day-strip-item"><span class="day-strip-label">Nome</span> ' +
      '<span class="day-strip-value">' +
      escapeHtml(h.nome || "") +
      "</span></span>" +
      '<span class="day-strip-item"><span class="day-strip-label">Prontuário</span> ' +
      '<span class="day-strip-value">' +
      escapeHtml(h.prontuario || "") +
      "</span></span>" +
      '<span class="day-strip-item"><span class="day-strip-label">Staff</span> ' +
      '<span class="day-strip-value">' +
      escapeHtml(h.staff || "") +
      "</span></span>" +
      "</div>"
    );
  }

  /**
   * @param {object} entry
   * @param {object[]} entryRows
   * @param {object} snap
   * @param {object} printContext
   */
  function buildEntrySection(
    entry,
    entryRows,
    template,
    snapHeader,
    printContext,
    entryIdx,
  ) {
    var rowsHtml = "";
    var tplMod = getTemplate();

    for (var ri = 0; ri < entryRows.length; ri++) {
      var row = entryRows[ri];
      rowsHtml += "<tr>";
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell) {
          rowsHtml += '<td class="cell cell-empty"></td>';
          continue;
        }
        var fieldDef = fieldDefByKey(template, cell.key);
        var mergedDef = Object.assign({}, fieldDef, {
          key: cell.key,
          label: cell.label,
          section: "entry",
        });
        var value = "";
        if (mergedDef.kind === "score") {
          value = cellDisplayValue(
            { header: snapHeader, entry: entry },
            entry,
            mergedDef,
            printContext,
          );
        } else {
          value = tplMod.getFieldValue(
            { entry: entry, header: snapHeader },
            mergedDef,
          );
        }
        var multiline =
          mergedDef.widget === "textarea" ||
          cell.key === "cd" ||
          cell.key === "pendencias";
        var cls =
          "cell" +
          (multiline ? " cell-multiline" : "") +
          (cell.key === "data" ? " cell-date" : "");
        var colspan =
          cell.span && cell.span > 1 ? ' colspan="' + cell.span + '"' : "";
        var printValue = value;
        var lim = getFieldLimits();
        if (
          (cell.key === "cd" || cell.key === "pendencias") &&
          lim &&
          typeof lim.clampCdPendenciasPair === "function"
        ) {
          var pair = lim.clampCdPendenciasPair(
            entry && entry.cd,
            entry && entry.pendencias,
            null,
          );
          printValue = cell.key === "cd" ? pair.cd : pair.pendencias;
        } else {
          printValue = clampPrintValue(mergedDef, value);
        }
        var lineClass = "";
        if (multiline && lim) {
          var fl = lim.resolveFieldLimit(mergedDef);
          var printLines = 0;
          if (
            (cell.key === "cd" || cell.key === "pendencias") &&
            lim.LIMIT_ENTRY_SHARED &&
            lim.LIMIT_ENTRY_SHARED.maxLines > 0
          ) {
            // Pool partilhado: cada célula leva metade das linhas (não 8+8).
            printLines = Math.max(
              1,
              Math.ceil(lim.LIMIT_ENTRY_SHARED.maxLines / 2),
            );
          } else if (fl && fl.maxLines > 0) {
            printLines = fl.maxLines;
          }
          if (printLines > 0) {
            lineClass = " cell-value-lines-" + printLines;
          }
        }
        var entryIdxAttr =
          entryIdx != null
            ? ' data-pm-entry-idx="' + entryIdx + '"'
            : "";
        rowsHtml +=
          "<td" +
          colspan +
          ' class="' +
          cls +
          '"><div class="cell-label">' +
          escapeHtml(cell.label) +
          '</div><div class="cell-value' +
          lineClass +
          '" data-pm-field="' +
          escapeHtml(cell.key) +
          '" data-pm-section="entry"' +
          entryIdxAttr +
          ">" +
          escapeHtml(printValue) +
          "</div></td>";
      }
      rowsHtml += "</tr>";
    }

    return (
      '<section class="day-block"' +
      (entryIdx != null ? ' data-pm-entry-idx="' + entryIdx + '"' : "") +
      '><div class="day-grid-wrap"><table class="day-grid" cellspacing="0" cellpadding="0">' +
      "<tbody>" +
      rowsHtml +
      "</tbody></table></div></section>"
    );
  }

  /**
   * @param {object} entry
   * @param {([string, string, number?] | null)[][]} gridRows
   * @returns {string}
   */
  function buildEntrySectionLegacy(entry, gridRows) {
    var rowsHtml = "";

    for (var ri = 0; ri < gridRows.length; ri++) {
      var row = gridRows[ri];
      rowsHtml += "<tr>";
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell) {
          rowsHtml += '<td class="cell cell-empty"></td>';
          continue;
        }
        var field = cell[0];
        var label = cell[1];
        var span = cell[2];
        var value = entry[field] || "";
        var multiline = field === "cd" || field === "pendencias";
        var cls =
          "cell" +
          (multiline ? " cell-multiline" : "") +
          (field === "data" ? " cell-date" : "");
        var colspan = span && span > 1 ? ' colspan="' + span + '"' : "";
        rowsHtml +=
          "<td" +
          colspan +
          ' class="' +
          cls +
          '"><div class="cell-label">' +
          escapeHtml(label) +
          '</div><div class="cell-value">' +
          escapeHtml(value) +
          "</div></td>";
      }
      rowsHtml += "</tr>";
    }

    return (
      '<section class="day-block">' +
      '<div class="day-grid-wrap"><table class="day-grid" cellspacing="0" cellpadding="0">' +
      "<tbody>" +
      rowsHtml +
      "</tbody></table></div></section>"
    );
  }

  /**
   * @param {object} header
   * @param {object[]} entries
   * @param {number} groupIndex
   * @param {([string, string, number?] | null)[][]} gridRows
   * @param {object} branding
   * @returns {string}
   */
  function buildDaysPage(
    snap,
    entries,
    groupIndex,
    template,
    branding,
    printedAt,
    isLastDaysPage,
    hasExamsPage,
    printContext,
  ) {
    var showInst =
      !template.print || template.print.showInstitutionHeader !== false;
    var instHtml = showInst ? buildInstitutionHeader(branding) : "";
    var pageHeader =
      groupIndex === 0
        ? instHtml +
          buildPatientHeaderTable(
            snap.header,
            template.headerRows,
            template,
            printContext,
          )
        : instHtml + buildDayStrip(snap.header);

    var daysHtml = "";
    for (var i = 0; i < entries.length; i++) {
      daysHtml += buildEntrySection(
        entries[i],
        template.entryRows,
        template,
        snap.header,
        printContext,
      );
    }
    if (!daysHtml && groupIndex === 0) {
      daysHtml =
        '<p class="days-empty">Nenhum dia registado — adicione dias no editor antes de imprimir.</p>';
    }

    var footer =
      isLastDaysPage && !hasExamsPage ? buildFooter(printedAt) : "";

    return (
      '<section class="print-page days-page">' +
      pageHeader +
      '<div class="days-group">' +
      daysHtml +
      "</div>" +
      footer +
      "</section>"
    );
  }

  /**
   * @param {string} printedAt
   * @returns {string}
   */
  function buildFooter(printedAt) {
    return (
      '<div class="footer">AGHU Passômetro — impresso em ' +
      escapeHtml(printedAt) +
      "</div>"
    );
  }

  /**
   * Footer como elemento DOM (repaginação sem insertAdjacentHTML / innerHTML).
   * @param {Document} doc
   * @param {string} printedAt
   * @returns {HTMLElement}
   */
  function buildFooterEl(doc, printedAt) {
    var el = doc.createElement("div");
    el.className = "footer";
    el.textContent = "AGHU Passômetro — impresso em " + String(printedAt || "");
    return el;
  }

  /**
   * @param {Element} target
   * @param {Element} source
   */
  function appendClonedChildren(target, source) {
    if (!target || !source) return;
    var nodes = source.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      target.appendChild(nodes[i].cloneNode(true));
    }
  }

  /**
   * @param {string} printedAt
   * @returns {string}
   */
  function buildExamsFooter(printedAt) {
    return (
      '<div class="footer">AGHU Exames — impresso em ' +
      escapeHtml(printedAt) +
      "</div>"
    );
  }

  var PRINT_CSS =
    "@page { size: A4 portrait; margin: " +
    PRINT_PAGE_MARGIN_CSS +
    "; }" +
    "* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
    "html { background: #e8e8e8; }" +
    "body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; margin: 0; padding: 0; background: #fff; }" +
    "@media screen { body { width: " +
    PRINT_PAGE_WIDTH_MM +
    "mm; max-width: none; margin: 16px auto; padding: " +
    PRINT_SCREEN_PADDING +
    "; box-shadow: 0 2px 10px rgba(0,0,0,.12); } " +
    ".print-page.exams-page { margin-top: 20px; padding-top: 8mm; border-top: 2px dashed #ccc; } }" +
    "@media print { html { background: #fff; } body { padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } " +
    ".print-page + .print-page { break-before: page !important; page-break-before: always !important; } }" +
    ".print-page + .print-page { break-before: page; page-break-before: always; }" +
    ".days-page { break-inside: auto; page-break-inside: auto; }" +
    ".inst-header { display: flex; align-items: center; gap: 8px; padding-bottom: 3px; margin-bottom: 4px; border-bottom: 1px solid #000; break-inside: avoid; page-break-inside: avoid; }" +
    ".inst-logo { height: 40px; width: auto; flex-shrink: 0; }" +
    ".inst-text { flex: 1; min-width: 0; }" +
    ".inst-line { font-size: 8pt; font-weight: 700; text-transform: uppercase; line-height: 1.2; }" +
    ".pat-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; break-inside: auto; page-break-inside: auto; }" +
    ".pat-table tr { break-inside: avoid; page-break-inside: avoid; }" +
    ".pat-table td { border: 0.5px solid #000; vertical-align: top; padding: 1px 3px; }" +
    ".pat-label { display: block; font-size: 6pt; font-weight: 700; text-transform: uppercase; }" +
    ".pat-value { display: block; font-size: 7pt; white-space: pre-wrap; word-break: break-word; min-height: 0.9em; }" +
    ".pat-value-multiline { line-height: 1.15; overflow: hidden; }" +
    ".pat-value-lines-1 { max-height: 1.15em; }" +
    ".pat-value-lines-2 { max-height: 2.30em; }" +
    ".pat-value-lines-3 { max-height: 3.45em; }" +
    ".pat-value-lines-6 { max-height: 6.90em; }" +
    ".pat-value-lines-8 { max-height: 9.20em; }" +
    ".day-strip { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 7pt; padding: 2px 0 4px; margin-bottom: 3px; border-bottom: 0.5px solid #000; break-inside: avoid; page-break-inside: avoid; }" +
    ".day-strip-label { font-weight: 700; text-transform: uppercase; font-size: 6pt; }" +
    ".day-strip-value { font-weight: 400; }" +
    ".days-group { margin: 0; }" +
    ".days-empty { font-size: 7pt; font-style: italic; margin: 4px 0 0; }" +
    ".day-block { margin-bottom: " +
    PRINT_DAY_BLOCK_MARGIN_PX +
    "px; break-inside: auto; page-break-inside: auto; }" +
    ".day-grid-wrap { border: 1.5px solid #000; break-inside: avoid; page-break-inside: avoid; }" +
    ".day-grid { width: 100%; border-collapse: collapse; table-layout: fixed; border: 0; }" +
    ".day-grid tr { break-inside: avoid; page-break-inside: avoid; }" +
    ".day-grid td { border: 0.5px solid #000; vertical-align: top; padding: 1px 2px; }" +
    ".cell-empty { background: #fff; }" +
    ".cell-label { font-size: 5.5pt; font-weight: 700; text-transform: uppercase; margin-bottom: 0; line-height: 1.1; }" +
    ".cell-value { font-size: 7pt; white-space: pre-wrap; word-break: break-word; min-height: 0.9em; line-height: 1.15; }" +
    ".cell-multiline .cell-value { overflow: hidden; }" +
    ".cell-value-lines-1 { max-height: 1.15em; }" +
    ".cell-value-lines-2 { max-height: 2.30em; }" +
    ".cell-value-lines-3 { max-height: 3.45em; }" +
    ".cell-value-lines-6 { max-height: 6.90em; }" +
    ".cell-value-lines-8 { max-height: 9.20em; }" +
    ".cell-date .cell-value { font-weight: 700; }" +
    ".exams-page { break-inside: auto; page-break-inside: auto; }" +
    ".exams-block { margin-top: 0; margin-bottom: 4px; break-inside: auto; }" +
    ".exams-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }" +
    ".exams-table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 6.5pt; }" +
    ".exams-table th, .exams-table td { border: 0.5px solid #000; vertical-align: top; padding: 1px 2px; word-break: break-word; }" +
    ".exams-th-name, .exams-row-name { text-align: left; font-weight: 700; min-width: 4rem; }" +
    ".exams-category-header th.exams-category-title { text-align: left; font-weight: 700; font-size: 6.5pt; background: #eee; }" +
    ".exams-th-date { text-align: center; font-weight: 700; white-space: nowrap; }" +
    ".exams-th-parent { font-weight: 700; }" +
    ".exams-th-subitem { font-weight: 400; padding-left: 10px; font-size: 6pt; color: #333; }" +
    ".exams-cell-value { font-size: 6.5pt; white-space: nowrap; line-height: 1.15; }" +
    ".exams-cell-empty { font-size: 6.5pt; color: #666; text-align: center; }" +
    ".exams-cell, .exams-cell-multiline { font-size: 6.5pt; white-space: pre-wrap; max-height: 4.5em; overflow: hidden; line-height: 1.15; }" +
    ".exams-table thead { display: table-header-group; }" +
    ".footer { margin-top: 6px; font-size: 6pt; color: #333; text-align: right; border-top: 0.5px solid #000; padding-top: 2px; break-inside: avoid; page-break-inside: avoid; }" +
    ".pm-measure { position: absolute; left: 0; width: " +
    PRINT_PAGE_CONTENT_WIDTH_MM +
    "mm; opacity: 0; overflow: hidden; pointer-events: none; height: auto; }" +
    ".pm-staging { width: " +
    PRINT_PAGE_CONTENT_WIDTH_MM +
    "mm; }";

  /**
   * @param {object | null | undefined} snap
   * @param {object} opts
   * @returns {{ normalized: object, opts: object, template: object, branding: object, printedAt: string, printContext: object, snapForPrint: object, title: string, daysPerPage: number }}
   */
  function preparePrintBuild(snap, opts) {
    var schema = getSchema();
    var branding = getBranding();
    var normalized = schema.normalizeSnap(snap);
    var options = opts || {};
    var template = resolvePrintTemplate(normalized, options);
    var daysPerPage =
      template.print && template.print.daysPerPage
        ? template.print.daysPerPage
        : DAYS_PER_PRINT_PAGE;
    var title = options.title ? String(options.title) : "Passômetro";
    var printedAt = formatPrintDateTime();
    var printContext = {
      exams: options.exams,
      pii: options.pii,
      controles: options.controles,
      precomputed: options.precomputed,
      scoreResolver:
        typeof options.scoreResolver === "function"
          ? options.scoreResolver
          : null,
      passometro: {
        header: normalized.header,
        entries: normalized.entries,
      },
    };
    var snapForPrint = Object.assign({}, normalized, { layout: template });
    return {
      normalized: normalized,
      opts: options,
      template: template,
      branding: branding,
      printedAt: printedAt,
      printContext: printContext,
      snapForPrint: snapForPrint,
      title: title,
      daysPerPage: daysPerPage,
    };
  }

  /**
   * @param {string} title
   * @param {string} bodyHtml
   * @param {{ repaginate?: boolean, printedAt?: string, hasExams?: boolean }} [meta]
   * @returns {string}
   */
  function wrapPrintDocument(title, bodyHtml, meta) {
    var m = meta || {};
    var bodyAttrs = "";
    if (m.repaginate) {
      bodyAttrs +=
        ' data-pm-repaginate="1" data-pm-printed-at="' +
        escapeHtml(m.printedAt || "") +
        '" data-pm-has-exams="' +
        (m.hasExams ? "1" : "0") +
        '"';
    }
    return (
      "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"UTF-8\">" +
      "<title>" +
      escapeHtml(title) +
      "</title>" +
      "<style>" +
      PRINT_CSS +
      "</style></head><body" +
      bodyAttrs +
      ">" +
      bodyHtml +
      "</body></html>"
    );
  }

  /**
   * @param {object | null | undefined} snap
   * @param {object} [options]
   * @returns {string}
   */
  function buildExamsInnerHtml(opts) {
    if (!opts.exams) return "";
    var examsTable = getExamsTable();
    if (!examsTable || !examsTable.buildExamsTableHtml) return "";
    return examsTable.buildExamsTableHtml(opts.exams, {
      title: "Exames",
      maxColumns: EXAMS_PRINT_MAX_COLUMNS,
      selectedRowKeys: opts.selectedRowKeys,
    });
  }

  /**
   * HTML staging para repaginação no browser (openPrintDialog).
   * @param {object | null | undefined} snap
   * @param {object} [options]
   * @returns {string}
   */
  function buildPrintStagingHtml(snap, options) {
    var prep = preparePrintBuild(snap, options || {});
    var normalized = prep.normalized;
    var template = prep.template;
    var branding = prep.branding;
    var printContext = prep.printContext;
    var snapForPrint = prep.snapForPrint;
    var showInst =
      !template.print || template.print.showInstitutionHeader !== false;
    var instHtml = showInst ? buildInstitutionHeader(branding) : "";
    var firstHeaderHtml =
      instHtml +
      buildPatientHeaderTable(
        snapForPrint.header,
        template.headerRows,
        template,
        printContext,
      );
    var contHeaderHtml = instHtml + buildDayStrip(snapForPrint.header);

    var daysHtml = "";
    var entries = normalized.entries || [];
    for (var i = 0; i < entries.length; i++) {
      daysHtml += buildEntrySection(
        entries[i],
        template.entryRows,
        template,
        snapForPrint.header,
        printContext,
        i,
      );
    }

    var examsInnerHtml = buildExamsInnerHtml(prep.opts);
    var examsDeferred = "";
    if (examsInnerHtml) {
      var instExams = showInst ? buildInstitutionHeader(branding) : "";
      examsDeferred =
        '<template id="pm-exams-deferred">' +
        instExams +
        examsInnerHtml +
        "</template>";
    }

    var bodyHtml =
      '<div id="pm-staging" class="pm-staging">' +
      '<div id="pm-measure-first-header" class="pm-measure">' +
      firstHeaderHtml +
      "</div>" +
      '<div id="pm-measure-cont-header" class="pm-measure">' +
      contHeaderHtml +
      "</div>" +
      '<div id="pm-day-blocks">' +
      daysHtml +
      "</div>" +
      examsDeferred +
      "</div>";

    return wrapPrintDocument(prep.title, bodyHtml, {
      repaginate: true,
      printedAt: prep.printedAt,
      hasExams: !!examsInnerHtml,
    });
  }

  /**
   * Fallback: uma única print-page com todos os dias.
   * @param {Document} doc
   * @returns {boolean}
   */
  function repaginateFallbackSinglePage(doc) {
    var body = doc.body;
    var staging = doc.getElementById("pm-staging");
    var firstHeaderEl = doc.getElementById("pm-measure-first-header");
    var dayBlocksRoot = doc.getElementById("pm-day-blocks");
    if (!body || !staging || !firstHeaderEl || !dayBlocksRoot) return false;

    var printedAt = body.getAttribute("data-pm-printed-at") || "";
    var hasExams = body.getAttribute("data-pm-has-exams") === "1";
    var blockNodes = [];
    var blockEls = dayBlocksRoot.querySelectorAll(".day-block");
    for (var i = 0; i < blockEls.length; i++) {
      blockNodes.push(blockEls[i]);
    }

    var frag = doc.createDocumentFragment();
    var section = doc.createElement("section");
    section.className = "print-page days-page";
    appendClonedChildren(section, firstHeaderEl);
    var group = doc.createElement("div");
    group.className = "days-group";
    if (!blockNodes.length) {
      var empty = doc.createElement("p");
      empty.className = "days-empty";
      empty.textContent =
        "Nenhum dia registado — adicione dias no editor antes de imprimir.";
      group.appendChild(empty);
    } else {
      for (var j = 0; j < blockNodes.length; j++) {
        group.appendChild(blockNodes[j]);
      }
    }
    section.appendChild(group);
    if (!hasExams && printedAt) {
      section.appendChild(buildFooterEl(doc, printedAt));
    }
    frag.appendChild(section);

    var examsTpl = doc.getElementById("pm-exams-deferred");
    if (examsTpl && hasExams) {
      var examsSection = doc.createElement("section");
      examsSection.className = "print-page exams-page";
      appendClonedChildren(examsSection, examsTpl);
      if (printedAt) {
        examsSection.appendChild(buildFooterEl(doc, printedAt));
      }
      frag.appendChild(examsSection);
    }

    body.removeAttribute("data-pm-repaginate");
    body.replaceChildren(frag);
    return true;
  }

  /**
   * Repagina dias por altura medida no DOM (browser).
   * @param {Document} doc
   * @returns {boolean}
   */
  function repaginateDaysInDocument(doc) {
    var body = doc.body;
    if (!body || body.getAttribute("data-pm-repaginate") !== "1") return false;

    var firstHeaderEl = doc.getElementById("pm-measure-first-header");
    var contHeaderEl = doc.getElementById("pm-measure-cont-header");
    var dayBlocksRoot = doc.getElementById("pm-day-blocks");
    if (!firstHeaderEl || !contHeaderEl || !dayBlocksRoot) {
      return repaginateFallbackSinglePage(doc);
    }

    var blockNodes = [];
    var blockEls = dayBlocksRoot.querySelectorAll(".day-block");
    for (var i = 0; i < blockEls.length; i++) {
      blockNodes.push(blockEls[i]);
    }

    if (!blockNodes.length) {
      return repaginateFallbackSinglePage(doc);
    }

    var blockHeights = [];
    for (var hi = 0; hi < blockNodes.length; hi++) {
      blockHeights.push(
        (blockNodes[hi].offsetHeight || 0) + PRINT_DAY_BLOCK_MARGIN_PX,
      );
    }

    var firstOverhead = firstHeaderEl.offsetHeight || 0;
    var contOverhead = contHeaderEl.offsetHeight || 0;
    var pageUsable = getPageUsableHeightPx(doc);

    var allZero = true;
    for (var zi = 0; zi < blockHeights.length; zi++) {
      if (blockHeights[zi] > PRINT_DAY_BLOCK_MARGIN_PX) {
        allZero = false;
        break;
      }
    }

    if (!pageUsable || allZero) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[AGHU] print repaginate fallback");
      }
      return repaginateFallbackSinglePage(doc);
    }

    var printedAt = body.getAttribute("data-pm-printed-at") || "";
    var hasExams = body.getAttribute("data-pm-has-exams") === "1";
    var packBudget = resolveDaysPageBudgetPx({
      usablePx: pageUsable,
      hasFooter: !hasExams && !!printedAt,
    });

    var pageGroups = packDayBlocksByHeight(
      blockHeights,
      firstOverhead,
      contOverhead,
      packBudget,
    );

    if (!pageGroups.length) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[AGHU] print repaginate fallback");
      }
      return repaginateFallbackSinglePage(doc);
    }

    var frag = doc.createDocumentFragment();

    for (var pi = 0; pi < pageGroups.length; pi++) {
      var section = doc.createElement("section");
      section.className = "print-page days-page";
      appendClonedChildren(
        section,
        pi === 0 ? firstHeaderEl : contHeaderEl,
      );
      var group = doc.createElement("div");
      group.className = "days-group";
      var indices = pageGroups[pi];
      for (var gj = 0; gj < indices.length; gj++) {
        group.appendChild(blockNodes[indices[gj]]);
      }
      section.appendChild(group);
      var isLastDaysPage = pi === pageGroups.length - 1;
      if (isLastDaysPage && !hasExams && printedAt) {
        section.appendChild(buildFooterEl(doc, printedAt));
      }
      frag.appendChild(section);
    }

    var examsTpl = doc.getElementById("pm-exams-deferred");
    if (examsTpl && hasExams) {
      var examsSection = doc.createElement("section");
      examsSection.className = "print-page exams-page";
      appendClonedChildren(examsSection, examsTpl);
      if (printedAt) {
        examsSection.appendChild(buildFooterEl(doc, printedAt));
      }
      frag.appendChild(examsSection);
    }

    body.removeAttribute("data-pm-repaginate");
    body.replaceChildren(frag);
    enforceDaysPagesFit(doc, pageUsable, contHeaderEl, printedAt);
    return true;
  }

  /**
   * Aguarda layout no iframe de impressão.
   * Gecko: após doc.write/doc.close o readyState pode ficar "interactive" e o evento
   * load no document não dispara — timeout garante que o callback corre.
   * @param {Document} doc
   * @param {function(): void} cb
   */
  function waitForPrintLayout(doc, cb) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      var raf =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : function (fn) {
              setTimeout(fn, 0);
            };
      raf(function () {
        raf(function () {
          cb();
        });
      });
    }
    if (!doc) {
      run();
      return;
    }
    if (doc.readyState === "complete") {
      run();
      return;
    }
    var win = doc.defaultView;
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("load", run, { once: true });
    }
    setTimeout(run, 300);
  }

  /**
   * Monta body final a partir de grupos de índices (paridade repaginateDaysInDocument).
   * @param {ReturnType<typeof preparePrintBuild>} prep
   * @param {number[][]} pageGroups
   * @param {string} examsInnerHtml
   * @returns {string}
   */
  function buildPrintBodyFromPageGroups(prep, pageGroups, examsInnerHtml) {
    var entries = prep.normalized.entries || [];
    var bodyHtml = "";
    var lastPageIndex = pageGroups.length - 1;

    for (var pi = 0; pi < pageGroups.length; pi++) {
      var pageEntries = [];
      var indices = pageGroups[pi];
      for (var j = 0; j < indices.length; j++) {
        pageEntries.push(entries[indices[j]]);
      }
      bodyHtml += buildDaysPage(
        prep.snapForPrint,
        pageEntries,
        pi,
        prep.template,
        prep.branding,
        prep.printedAt,
        pi === lastPageIndex,
        !!examsInnerHtml,
        prep.printContext,
      );
    }

    if (examsInnerHtml) {
      var instExams =
        !prep.template.print ||
        prep.template.print.showInstitutionHeader !== false
          ? buildInstitutionHeader(prep.branding)
          : "";
      bodyHtml +=
        '<section class="print-page exams-page">' +
        instExams +
        examsInnerHtml +
        buildFooter(prep.printedAt) +
        "</section>";
    }

    return bodyHtml;
  }

  /**
   * HTML final com repaginação por altura estimada (paridade openPrintDialog no Node).
   * @param {object | null | undefined} snap
   * @param {object} [options]
   * @returns {string}
   */
  function buildPrintHtmlRepaginated(snap, options) {
    var prep = preparePrintBuild(snap, options || {});
    var entries = prep.normalized.entries || [];
    var examsInnerHtml = buildExamsInnerHtml(prep.opts);
    var pageGroups;

    if (!entries.length) {
      pageGroups = [[]];
    } else {
      var blockHeights = [];
      for (var i = 0; i < entries.length; i++) {
        blockHeights.push(
          estimateDayBlockHeightPx(entries[i], prep.template),
        );
      }
      var firstOverhead = estimateFirstHeaderHeightPx(
        prep.snapForPrint.header,
        prep.template,
        prep.branding,
      );
      var contOverhead = estimateContHeaderHeightPx(
        prep.template,
        prep.branding,
      );
      var pageUsable = mmToPx(
        PRINT_PAGE_HEIGHT_MM - PRINT_PAGE_TOP_MM - PRINT_PAGE_BOTTOM_MM,
        null,
      );
      var packBudget = resolveDaysPageBudgetPx({
        usablePx: pageUsable,
        hasFooter: !examsInnerHtml && !!prep.printedAt,
      });
      pageGroups = packDayBlocksByHeight(
        blockHeights,
        firstOverhead,
        contOverhead,
        packBudget,
      );
      if (!pageGroups.length) {
        pageGroups = [[]];
      }
    }

    return wrapPrintDocument(
      prep.title,
      buildPrintBodyFromPageGroups(prep, pageGroups, examsInnerHtml),
    );
  }

  /**
   * @param {object | null | undefined} snap
   * @param {{ title?: string, exams?: unknown }} [options]
   * @returns {string}
   */
  function buildPrintHtml(snap, options) {
    var prep = preparePrintBuild(snap, options || {});
    var entryChunks = chunkArray(prep.normalized.entries || [], prep.daysPerPage);
    if (!entryChunks.length) {
      entryChunks.push([]);
    }

    var examsInnerHtml = buildExamsInnerHtml(prep.opts);
    var pageGroups = [];
    var offset = 0;
    for (var gi = 0; gi < entryChunks.length; gi++) {
      var chunk = entryChunks[gi];
      var indices = [];
      for (var ci = 0; ci < chunk.length; ci++) {
        indices.push(offset + ci);
      }
      offset += chunk.length;
      pageGroups.push(indices);
    }

    return wrapPrintDocument(
      prep.title,
      buildPrintBodyFromPageGroups(prep, pageGroups, examsInnerHtml),
    );
  }

  /**
   * @param {string} html
   * @param {{ autoPrint?: boolean }} [options]
   * @param {number} [delayMs]
   * @returns {{ ok: boolean, error?: string }}
   */
  function openPrintHtmlInWindow(html, options, delayMs) {
    if (typeof window === "undefined") {
      return { ok: false, error: "browser_only" };
    }
    var opts = options || {};
    var autoPrint = opts.autoPrint !== false;
    var delay = delayMs != null ? delayMs : getPrintDelayMs({ firefox: true });
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, "_blank");
    if (!win) {
      URL.revokeObjectURL(url);
      return { ok: false, error: "popup_blocked" };
    }
    schedulePrint(win, url, autoPrint, delay);
    return { ok: true };
  }

  /**
   * @param {Window} targetWin
   * @param {string | null | undefined} url
   * @param {boolean} autoPrint
   * @param {number} [delayMs]
   */
  function schedulePrint(targetWin, url, autoPrint, delayMs) {
    var delay = delayMs != null ? delayMs : PRINT_DELAY_MS_CHROME;
    var started = false;

    function runPrint() {
      if (autoPrint) {
        var raf =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : function (fn) {
                setTimeout(fn, 0);
              };
        raf(function () {
          setTimeout(function () {
            try {
              targetWin.focus();
              targetWin.print();
            } catch (_e) {
              if (typeof console !== "undefined" && console.warn) {
                console.warn("[AGHU] print failed");
              }
            }
          }, delay);
        });
      }
      if (url) {
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 60000);
      }
    }

    function start() {
      if (started) return;
      started = true;
      runPrint();
    }

    if (targetWin.document && targetWin.document.readyState === "complete") {
      start();
    } else if (typeof targetWin.addEventListener === "function") {
      targetWin.addEventListener("load", start, { once: true });
    }
    setTimeout(start, 300);
  }

  /**
   * @param {HTMLIFrameElement} iframe
   */
  function removePrintIframe(iframe) {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }

  /**
   * @param {object | null | undefined} snap
   * @param {{ title?: string, autoPrint?: boolean, exams?: object | null }} [options]
   * @returns {{ ok: boolean, error?: string }}
   */
  function openPrintDialog(snap, options) {
    if (typeof window === "undefined") {
      throw new Error("openPrintDialog só disponível no browser");
    }
    var opts = options || {};
    var html = buildPrintStagingHtml(snap, opts);
    return openPrintHtml(html, opts);
  }

  /**
   * @param {unknown} examsRaw
   * @param {{ title?: string, documentTitle?: string, selectedRowKeys?: string[], showInstitutionHeader?: boolean }} [options]
   * @returns {string}
   */
  function buildExamsPrintHtml(examsRaw, options) {
    var opts = options || {};
    var branding = getBranding();
    var examsTable = getExamsTable();
    if (!examsTable || !examsTable.buildExamsTableHtml) {
      throw new Error("AghuPassometroExamsTable não disponível");
    }

    var tableOpts = {
      title: opts.title != null ? String(opts.title) : "Exames",
      selectedRowKeys: opts.selectedRowKeys,
    };
    var examsInnerHtml = examsTable.buildExamsTableHtml(examsRaw, tableOpts);
    if (!examsInnerHtml) {
      return "";
    }

    var printedAt = formatPrintDateTime();
    var showInst = opts.showInstitutionHeader !== false;
    var instHtml = showInst ? buildInstitutionHeader(branding) : "";
    var documentTitle =
      opts.documentTitle != null
        ? String(opts.documentTitle)
        : opts.title != null
          ? String(opts.title)
          : "Exames";

    var bodyHtml =
      '<section class="print-page exams-page">' +
      instHtml +
      examsInnerHtml +
      buildExamsFooter(printedAt) +
      "</section>";

    return (
      wrapPrintDocument(documentTitle, bodyHtml)
    );
  }

  /**
   * Impressão via iframe oculto (paridade lib/receita-print.js).
   * @param {string} html
   * @param {{ autoPrint?: boolean, title?: string, documentTitle?: string }} [options]
   * @returns {{ ok: boolean, error?: string }}
   */
  function openPrintHtml(html, options) {
    if (typeof window === "undefined") {
      return { ok: false, error: "browser_only" };
    }
    return openPrintHtmlInIframe(html, options || {});
  }

  /**
   * @param {string} html
   * @param {{ autoPrint?: boolean, title?: string, documentTitle?: string }} [options]
   * @returns {{ ok: boolean, error?: string }}
   */
  function openPrintHtmlInIframe(html, options) {
    if (typeof window === "undefined") {
      return { ok: false, error: "browser_only" };
    }
    var opts = options || {};
    var autoPrint = opts.autoPrint !== false;
    var printDelay = getPrintDelayMs({ iframe: true });
    var title = resolvePrintTitle(opts);

    try {
      var iframe = document.createElement("iframe");
      iframe.setAttribute("style", PRINT_IFRAME_STYLE);
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);
      var iframeWin = iframe.contentWindow;
      if (!iframeWin) {
        removePrintIframe(iframe);
        return { ok: false, error: "print_failed" };
      }

      var doc = iframeWin.document;
      doc.open();
      doc.write(html);
      doc.close();
      iframeWin.document.title = title;

      var needsRepaginate =
        doc.body && doc.body.getAttribute("data-pm-repaginate") === "1";

      function triggerPrint() {
        schedulePrint(iframeWin, null, autoPrint, printDelay);
      }

      if (!needsRepaginate) {
        schedulePrint(iframeWin, null, autoPrint, printDelay);
      } else {
        waitForPrintLayout(doc, function () {
          repaginateDaysInDocument(doc);
          waitForPrintLayout(doc, triggerPrint);
        });
      }

      if (typeof iframeWin.addEventListener === "function") {
        iframeWin.addEventListener(
          "afterprint",
          function () {
            removePrintIframe(iframe);
          },
          { once: true },
        );
      }
      setTimeout(function () {
        removePrintIframe(iframe);
      }, 120000);

      return { ok: true };
    } catch (_e) {
      return { ok: false, error: "print_failed" };
    }
  }

  /**
   * @param {unknown} examsRaw
   * @param {{ title?: string, documentTitle?: string, autoPrint?: boolean, selectedRowKeys?: string[], showInstitutionHeader?: boolean }} [options]
   * @returns {{ ok: boolean, error?: string }}
   */
  function openExamsPrintDialog(examsRaw, options) {
    if (typeof window === "undefined") {
      throw new Error("openExamsPrintDialog só disponível no browser");
    }
    var opts = options || {};
    var html = buildExamsPrintHtml(examsRaw, opts);
    if (!html) {
      return { ok: false, error: "empty_exams" };
    }
    return openPrintHtml(html, opts);
  }

  return {
    DAYS_PER_PRINT_PAGE: DAYS_PER_PRINT_PAGE,
    EXAMS_PRINT_MAX_COLUMNS: EXAMS_PRINT_MAX_COLUMNS,
    PRINT_PAGE_WIDTH_MM: PRINT_PAGE_WIDTH_MM,
    PRINT_PAGE_HEIGHT_MM: PRINT_PAGE_HEIGHT_MM,
    PRINT_PAGE_TOP_MM: PRINT_PAGE_TOP_MM,
    PRINT_PAGE_BOTTOM_MM: PRINT_PAGE_BOTTOM_MM,
    PRINT_PAGE_SIDE_MM: PRINT_PAGE_SIDE_MM,
    PRINT_PAGE_CONTENT_WIDTH_MM: PRINT_PAGE_CONTENT_WIDTH_MM,
    PRINT_DAY_BLOCK_MARGIN_PX: PRINT_DAY_BLOCK_MARGIN_PX,
    PRINT_FOOTER_RESERVE_PX: PRINT_FOOTER_RESERVE_PX,
    PRINT_PAGE_SAFETY_MM: PRINT_PAGE_SAFETY_MM,
    PRINT_IFRAME_STYLE: PRINT_IFRAME_STYLE,
    PRINT_IFRAME_STYLE_CHROME: PRINT_IFRAME_STYLE_CHROME,
    PRINT_IFRAME_STYLE_FIREFOX: PRINT_IFRAME_STYLE_FIREFOX,
    isFirefox: isFirefox,
    resolvePrintIframeStyle: resolvePrintIframeStyle,
    getPrintDelayMs: getPrintDelayMs,
    escapeHtml: escapeHtml,
    chunkArray: chunkArray,
    chunkEntriesForPrint: chunkEntriesForPrint,
    packDayBlocksByHeight: packDayBlocksByHeight,
    resolveDaysPageBudgetPx: resolveDaysPageBudgetPx,
    countBlocksToMoveOut: countBlocksToMoveOut,
    enforceDaysPagesFit: enforceDaysPagesFit,
    isPrintMeasurementTrustworthy: isPrintMeasurementTrustworthy,
    measurePrintContentWidthPx: measurePrintContentWidthPx,
    mmToPx: mmToPx,
    getPageUsableHeightPx: getPageUsableHeightPx,
    estimateEntryWeight: estimateEntryWeight,
    estimateHeaderWeight: estimateHeaderWeight,
    estimateTextWeight: estimateTextWeight,
    estimateDayBlockHeightPx: estimateDayBlockHeightPx,
    estimateFirstHeaderHeightPx: estimateFirstHeaderHeightPx,
    estimateContHeaderHeightPx: estimateContHeaderHeightPx,
    buildPrintHtml: buildPrintHtml,
    buildPrintHtmlRepaginated: buildPrintHtmlRepaginated,
    buildPrintStagingHtml: buildPrintStagingHtml,
    buildExamsPrintHtml: buildExamsPrintHtml,
    repaginateDaysInDocument: repaginateDaysInDocument,
    openPrintDialog: openPrintDialog,
    openExamsPrintDialog: openExamsPrintDialog,
  };
});
