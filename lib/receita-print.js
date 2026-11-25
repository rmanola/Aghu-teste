/**
 * Impressão de receituário (HTML + diálogo nativo) — layout HUCAM/UFES.
 * Paridade visual com docs/reference/modelos-impressao/receitas/receita-*-pdfjs.pdf
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SIMPLE_VIAS = 2;
  var DOTTED_LINE =
    "..................................................................";
  var SERIF_STACK = '"Times New Roman",Times,serif';

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  function getValidation() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-print-validation.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPrintValidation;
  }

  function getBranding() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-print-branding.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPrintBranding;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rxFieldSpan(path, innerHtml) {
    if (!path) return innerHtml;
    var inner = innerHtml == null ? "" : String(innerHtml);
    var plain = inner.replace(/<[^>]*>/g, "").replace(/\u00a0/g, " ").trim();
    var cls = "alta-editable";
    if (!plain) {
      inner = "\u00a0";
      cls += " alta-editable-empty";
    }
    return (
      '<span data-rx-field="' +
      escapeHtml(path) +
      '" class="' +
      cls +
      '" contenteditable="true">' +
      inner +
      "</span>"
    );
  }

  function lineFieldPath(meta, key) {
    if (!meta || !meta.previewEditable) return null;
    if (meta.docIndex == null || meta.lineIndex == null) return null;
    return "receitas." + meta.docIndex + ".lines." + meta.lineIndex + "." + key;
  }

  function lineIndexInArray(lines, ln) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === ln) return i;
    }
    return -1;
  }

  function normalizeRoute(route) {
    var s = String(route == null ? "" : route).trim();
    if (!s) return "USO ORAL";
    var upper = s.toUpperCase();
    if (upper.indexOf("USO") === 0) return upper;
    return "USO " + upper;
  }

  function formatPrescriberLine(prescriber) {
    prescriber = prescriber || {};
    var name = String(prescriber.name || "").trim();
    var crmNum = String(prescriber.crmNumber || "").trim();
    var crmUf = String(prescriber.crmUf || "").trim();
    if (!name && !crmNum) return "";
    var crm =
      crmNum && crmUf
        ? "CRM-" + escapeHtml(crmUf) + " " + escapeHtml(crmNum)
        : crmNum
          ? "CRM " + escapeHtml(crmNum)
          : "";
    var specialty = prescriber.specialty
      ? " · " + escapeHtml(prescriber.specialty)
      : "";
    if (name && crm) return escapeHtml(name) + " — " + crm + specialty;
    if (name) return escapeHtml(name) + specialty;
    return crm + specialty;
  }

  function groupLinesByRoute(lines) {
    var groups = [];
    var map = {};
    var order = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln) continue;
      var route = normalizeRoute(ln.route);
      if (!map[route]) {
        map[route] = [];
        order.push(route);
      }
      map[route].push(ln);
    }
    for (var j = 0; j < order.length; j++) {
      groups.push({ route: order[j], lines: map[order[j]] });
    }
    return groups;
  }

  function formatSimpleDrugLine(ln) {
    var head = escapeHtml(ln.drugName || "");
    if (ln.presentation) {
      head += " - " + escapeHtml(ln.presentation);
    }
    if (ln.dose) {
      head += " (" + escapeHtml(ln.dose) + ")";
    }
    return head;
  }

  function formatSpecialDrugLine(ln) {
    var head = escapeHtml(ln.drugName || "");
    if (ln.presentation) {
      head += " - " + escapeHtml(ln.presentation);
    }
    return head;
  }

  function resolveLineSuffix(ln) {
    var schema = getSchema();
    if (schema && typeof schema.getLineSuffix === "function") {
      return schema.getLineSuffix(ln);
    }
    var q = String((ln && ln.quantity) || "").trim();
    var d = String((ln && ln.duration) || "").trim();
    if (q) return q;
    return d;
  }

  function formatLineSuffixHtml(ln) {
    var s = resolveLineSuffix(ln);
    if (!s) return "";
    return escapeHtml(s);
  }

  function buildMedLineWithSuffix(headInner, ln) {
    var suffix = formatLineSuffixHtml(ln);
    if (!suffix) return "";
    return (
      '<div class="rx-med-line">' +
      '<span class="rx-med-drug">' +
      headInner +
      "</span>" +
      '<span class="rx-med-leader"></span>' +
      '<span class="rx-med-suffix">' +
      suffix +
      "</span>" +
      "</div>"
    );
  }

  function formatSimpleDrugHeadInner(ln, index, drugPath) {
    var drugPart = escapeHtml(ln.drugName || "");
    if (drugPath) drugPart = rxFieldSpan(drugPath, drugPart);
    var inner = "<strong>" + index + ") " + drugPart;
    if (ln.presentation) {
      inner += " - " + escapeHtml(ln.presentation);
    }
    if (ln.dose) {
      inner += " (" + escapeHtml(ln.dose) + ")";
    }
    inner += "</strong>";
    return inner;
  }

  function formatSpecialDrugHeadHtml(ln, drugPath) {
    var drugPart = escapeHtml(ln.drugName || "");
    if (drugPath) drugPart = rxFieldSpan(drugPath, drugPart);
    var head = drugPart;
    if (ln.presentation) {
      head += " - " + escapeHtml(ln.presentation);
    }
    return head;
  }

  function formatSimpleMedicationItemHtml(ln, index, meta) {
    meta = meta || {};
    var head = formatSimpleDrugLine(ln);
    var pos = ln.posology ? escapeHtml(ln.posology) : "";
    var drugPath = lineFieldPath(meta, "drugName");
    var posPath = lineFieldPath(meta, "posology");
    var headInner = drugPath
      ? formatSimpleDrugHeadInner(ln, index, drugPath)
      : "<strong>" + index + ") " + head + "</strong>";
    if (posPath) pos = rxFieldSpan(posPath, pos);
    var posBlock = "";
    if (posPath) {
      posBlock =
        '<div class="rx-med-dotted"></div><div class="rx-posology">' +
        pos +
        "</div>";
    } else if (pos) {
      posBlock =
        '<div class="rx-med-dotted"></div><div class="rx-posology">' +
        pos +
        "</div>";
    }
    var medLine = buildMedLineWithSuffix(headInner, ln);
    if (medLine) {
      return (
        '<div class="rx-med">' +
        '<div class="rx-med-head">' +
        medLine +
        "</div>" +
        posBlock +
        "</div>"
      );
    }
    return (
      '<div class="rx-med">' +
      '<div class="rx-med-head"><strong>' +
      index +
      ") " +
      head +
      "</strong></div>" +
      posBlock +
      "</div>"
    );
  }

  function formatSpecialMedicationItemHtml(ln, meta) {
    meta = meta || {};
    var drugPath = lineFieldPath(meta, "drugName");
    var head = drugPath
      ? formatSpecialDrugHeadHtml(ln, drugPath)
      : formatSpecialDrugLine(ln);
    var pos = ln.posology ? escapeHtml(ln.posology) : "";
    var posPath = lineFieldPath(meta, "posology");
    if (posPath) pos = rxFieldSpan(posPath, pos);
    var posBlock = "";
    if (posPath) {
      posBlock = '<div class="rx-posology">' + pos + "</div>";
    } else if (pos) {
      posBlock = '<div class="rx-posology">' + pos + "</div>";
    }
    var medLine = buildMedLineWithSuffix(head, ln);
    if (medLine) {
      return (
        '<div class="rx-med rx-med-special">' +
        medLine +
        posBlock +
        "</div>"
      );
    }
    return (
      '<div class="rx-med rx-med-special">' +
      '<div class="rx-med-line">' +
      '<span class="rx-med-drug">' +
      head +
      "</span></div>" +
      posBlock +
      "</div>"
    );
  }

  function formatLinesGroupedByRouteHtml(lines, printType, meta) {
    meta = meta || {};
    var groups = groupLinesByRoute(lines);
    var html = "";
    var isSpecial = printType === "special";
    for (var g = 0; g < groups.length; g++) {
      html += '<div class="rx-route-group">';
      html +=
        '<div class="rx-route-label">' + escapeHtml(groups[g].route) + ":</div>";
      for (var i = 0; i < groups[g].lines.length; i++) {
        var ln = groups[g].lines[i];
        var lineIndex = lineIndexInArray(lines, ln);
        var lineMeta = {
          previewEditable: meta.previewEditable,
          docIndex: meta.docIndex,
          lineIndex: lineIndex >= 0 ? lineIndex : i,
        };
        html += isSpecial
          ? formatSpecialMedicationItemHtml(ln, lineMeta)
          : formatSimpleMedicationItemHtml(ln, i + 1, lineMeta);
      }
      html += "</div>";
    }
    return html;
  }

  function buildInstitutionHeader(branding, logoClass) {
    return (
      '<header class="inst-header">' +
      '<img class="' +
      logoClass +
      '" src="' +
      branding.LOGO_DATA_URI +
      '" alt="' +
      escapeHtml(branding.LOGO_ALT || "HUCAM") +
      '">' +
      '<div class="inst-text">' +
      '<div class="inst-line">' +
      escapeHtml(branding.INSTITUTION_LINE_1 || "") +
      "</div>" +
      '<div class="inst-line">' +
      escapeHtml(branding.INSTITUTION_LINE_2 || "") +
      "</div>" +
      "</div></header>"
    );
  }

  function buildFooterContactHtml(branding) {
    var cep = branding.FOOTER_CEP || "29.040-091";
    var tel = branding.FOOTER_TEL || "(27) 3335 - 7100";
    return (
      "<strong>CEP:</strong> " +
      escapeHtml(cep) +
      " | <strong>Tel.:</strong> " +
      escapeHtml(tel)
    );
  }

  function buildInstitutionFooter(branding, meta) {
    meta = meta || {};
    var editable = !!meta.previewEditable;
    var cls = editable ? "inst-footer alta-editable" : "inst-footer";
    var editableAttr = editable ? ' contenteditable="true"' : "";
    return (
      '<footer class="' +
      cls +
      '"' +
      editableAttr +
      ">" +
      '<div class="inst-footer-line">' +
      escapeHtml(branding.FOOTER_ADDRESS_LINE || "") +
      "</div>" +
      '<div class="inst-footer-line">' +
      buildFooterContactHtml(branding) +
      "</div></footer>"
    );
  }

  function buildEmitenteAddressHtml(branding, format) {
    var line1 = escapeHtml("Avenida Marechal Campos, 1355");
    var line2 = escapeHtml("Santa Cecília - Vitória - ES");
    var contact = buildFooterContactHtml(branding);
    if (format === "special") {
      return (
        '<div class="rx-emitente-address">' +
        line1 +
        " / " +
        line2 +
        "<br/>" +
        contact +
        "</div>"
      );
    }
    return (
      '<div class="rx-emitente-address">' +
      line1 +
      "<br/>" +
      line2 +
      "<br/>" +
      contact +
      "</div>"
    );
  }

  function buildDottedLineHtml() {
    return '<div class="rx-dotted">' + DOTTED_LINE + "</div>";
  }

  function buildSolidRuleHtml() {
    return '<div class="rx-rule-solid"></div>';
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** Data no formato do PDF HUCAM: DD / MM / AAAA */
  function parsePrintDateInput(input) {
    if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      var parts = input.split("-");
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    if (input instanceof Date) return input;
    return new Date(input == null ? Date.now() : input);
  }

  function formatPrintDate(date) {
    var d = parsePrintDateInput(date);
    if (isNaN(d.getTime())) d = new Date();
    return pad2(d.getDate()) + " / " + pad2(d.getMonth() + 1) + " / " + d.getFullYear();
  }

  function resolvePrintDateLabel(ctx) {
    ctx = ctx || {};
    if (ctx.printDate) return formatPrintDate(ctx.printDate);
    return formatPrintDate(new Date());
  }

  function buildDottedRuleHtml() {
    return '<div class="rx-rule-dotted"></div>';
  }

  function buildFooterRuleHtml() {
    return '<div class="rx-rule-footer"></div>';
  }

  function buildSimpleSignatureHtml() {
    return (
      '<div class="rx-sign-area">' +
      '<div class="rx-sign-block">' +
      buildDottedLineHtml() +
      '<div class="rx-signature">Carimbo e Assinatura</div>' +
      "</div></div>"
    );
  }

  function buildDateLineHtml(dateLabel, meta) {
    meta = meta || {};
    var label = dateLabel || formatPrintDate(new Date());
    var valueHtml = escapeHtml(label);
    if (meta.previewEditable && meta.docIndex != null) {
      valueHtml = rxFieldSpan(
        "receitas." + meta.docIndex + ".printDate",
        valueHtml,
      );
    }
    return (
      '<div class="rx-date"><strong>Data:</strong> ' + valueHtml + "</div>"
    );
  }

  function baseCss() {
    return (
      "@page{size:A4 landscape;margin:8mm;}" +
      "html,body{margin:0;padding:0;}" +
      "body{font-family:" +
      SERIF_STACK +
      ";font-size:9pt;color:#000;background:#fff;}" +
      ".rx-page{display:flex;flex-direction:row;width:100%;height:194mm;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid;gap:4mm;}" +
      ".rx-block,.rx-half{flex:1 1 0;min-width:0;height:100%;box-sizing:border-box;padding:3mm 4mm;display:flex;flex-direction:column;min-height:0;overflow:hidden;border:1px solid #000;}" +
      ".rx-page-simple .inst-header{min-height:78pt;height:78pt;overflow:hidden;}" +
      ".rx-page-special .inst-header{min-height:82pt;height:82pt;overflow:hidden;}" +
      ".inst-header{position:relative;display:flex;align-items:center;min-height:44pt;margin-bottom:3px;break-inside:avoid;page-break-inside:avoid;}" +
      ".inst-logo-simple{position:absolute;left:0;top:50%;height:72pt;width:auto;max-width:78pt;transform:translateY(-50%);object-fit:contain;}" +
      ".inst-logo-special{position:absolute;left:0;top:50%;height:76pt;width:auto;max-width:82pt;transform:translateY(-50%);object-fit:contain;}" +
      ".inst-text{flex:1;width:100%;text-align:center;padding:0 4pt;}" +
      ".rx-page-simple .inst-text,.rx-page-special .inst-text{position:absolute;left:0;right:0;top:50%;width:100%;transform:translateY(-50%);padding:0 4pt;box-sizing:border-box;}" +
      ".inst-line{font-size:9pt;font-weight:700;text-transform:uppercase;line-height:1.2;}" +
      ".rx-page-special .inst-line{font-size:8pt;}" +
      ".inst-footer{padding-top:4px;text-align:center;font-size:8pt;line-height:1.3;}" +
      ".inst-footer.alta-editable[contenteditable=\"true\"]{outline:1px dashed rgba(0,80,160,.35);outline-offset:2px;border-radius:2px;}" +
      ".inst-footer.alta-editable[contenteditable=\"true\"]:focus{outline:2px solid rgba(0,80,160,.55);background:rgba(0,80,160,.04);}" +
      "@media print{.inst-footer.alta-editable{outline:none;background:transparent;}}" +
      ".inst-footer-line{margin:1px 0;}" +
      ".rx-title-simple{font-size:10pt;font-weight:700;text-align:center;text-transform:uppercase;margin:2px 0 6px;}" +
      ".rx-title-special{font-size:9pt;font-weight:700;text-align:center;text-transform:uppercase;margin:2px 0 4px;}" +
      ".rx-patient{margin:3px 0;font-size:9pt;}" +
      ".rx-page-simple .rx-patient{margin:3px 0 0;}" +
      ".rx-rule-solid{border-top:1px solid #000;margin:4px 0;height:0;}" +
      ".rx-rule-footer{border-top:1px solid #ccc;margin:0;height:0;}" +
      ".rx-page-simple .rx-patient+.rx-rule-footer{margin:0 0 14px;}" +
      ".rx-page-special .rx-patient{margin:2px 0 0;}" +
      ".rx-rule-dotted{border-top:1px dotted #000;margin:4px 0;height:0;}" +
      ".rx-page-simple .rx-body{padding-top:2px;}" +
      ".rx-page-simple .rx-route-group{margin:0;}" +
      ".rx-route-group{margin:3px 0;}" +
      ".rx-page-simple .rx-route-label{font-weight:700;font-size:10pt;margin:0 0 5px;line-height:1.2;}" +
      ".rx-route-label{font-weight:700;font-size:10pt;margin-bottom:2px;}" +
      ".rx-page-special .rx-route-label{font-weight:700;font-size:9pt;margin:0 0 5px;line-height:1.2;}" +
      ".rx-page-simple .rx-med{margin:0;font-size:9pt;line-height:1.2;}" +
      ".rx-page-special .rx-med{margin:0;font-size:9pt;line-height:1.2;}" +
      ".rx-med{margin:2px 0;font-size:9pt;line-height:1.35;}" +
      ".rx-med-head{font-weight:700;}" +
      ".rx-page-simple .rx-med-head{margin:0;line-height:1.2;}" +
      ".rx-page-simple .rx-med-head .rx-med-line{display:flex;align-items:baseline;width:100%;gap:0;}" +
      ".rx-page-simple .rx-med-head .rx-med-drug{flex:0 1 auto;min-width:0;}" +
      ".rx-page-simple .rx-med-head .rx-med-leader{flex:1 1 auto;min-width:8px;border-bottom:0.5pt dotted #000;margin:0 2px 2px;height:0;align-self:flex-end;}" +
      ".rx-page-simple .rx-med-dotted{border-top:0.5pt dotted #ccc;width:100%;height:0;margin:1px 0 0;line-height:0;font-weight:400;}" +
      ".rx-page-simple .rx-posology{font-size:9pt;line-height:1.2;margin:3px 0 0;font-weight:400;}" +
      ".rx-page-special .rx-posology{font-size:9pt;line-height:1.2;margin:3px 0 0;font-weight:400;}" +
      ".rx-page-special .rx-route-group{margin:0;}" +
      ".rx-page-special .rx-med-line{display:flex;align-items:baseline;width:100%;gap:0;}" +
      ".rx-page-special .rx-med-drug{flex:0 1 auto;min-width:0;font-weight:700;}" +
      ".rx-page-special .rx-med-leader{flex:1 1 auto;min-width:8px;border-bottom:0.5pt dotted #000;margin:0 2px 2px;height:0;align-self:flex-end;}" +
      ".rx-med-line{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}" +
      ".rx-med-drug{flex:1 1 auto;min-width:0;}" +
      ".rx-med-suffix{flex:0 0 auto;font-size:9pt;white-space:nowrap;}" +
      ".rx-posology{font-size:9pt;line-height:1.35;}" +
      ".rx-dotted{font-size:9pt;line-height:1;margin:0;overflow:hidden;white-space:nowrap;}" +
      ".rx-page-simple .rx-block{position:relative;padding-bottom:22mm;}" +
      ".rx-page-simple .rx-body{flex:0 0 auto;min-height:0;}" +
      ".rx-page-simple .rx-sign-area{position:absolute;left:4mm;right:4mm;bottom:20mm;text-align:center;}" +
      ".rx-page-simple .rx-block-tail{position:absolute;left:4mm;right:4mm;bottom:3mm;}" +
      ".rx-sign-row{display:flex;flex-direction:row;align-items:flex-end;gap:6px;}" +
      ".rx-sign-block{text-align:center;min-width:0;}" +
      ".rx-page-simple .rx-sign-block{width:100%;}" +
      ".rx-signature{font-size:9pt;margin:0;text-align:center;line-height:1.1;}" +
      ".rx-page-special .rx-signature{font-size:8pt;}" +
      ".rx-date{font-size:9pt;white-space:nowrap;line-height:1.1;}" +
      ".rx-page-simple .rx-date{text-align:left;margin:0 0 1px;}" +
      ".rx-page-special .rx-date{font-size:8pt;}" +
      ".rx-page-simple .inst-footer{padding-top:1px;}" +
      ".rx-section-title{font-weight:700;font-size:8pt;text-transform:uppercase;margin:4px 0 2px;}" +
      ".rx-page-special .rx-emitente-wrap{display:flex;align-items:center;gap:6px;margin-bottom:4px;}" +
      ".rx-page-special .rx-emitente-box{flex:0 1 58%;max-width:58%;min-width:0;min-height:24mm;border:1px solid #000;padding:0 4px 4px;text-align:center;box-sizing:border-box;}" +
      ".rx-page-special .rx-emitente-box-title{font-size:6pt;font-weight:700;text-transform:uppercase;margin:0 -4px 3px;padding:2px 4px;line-height:1.2;border-bottom:1px solid #000;}" +
      ".rx-page-special .rx-emitente-sign-block{min-height:14mm;padding:5px 0 2px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;}" +
      ".rx-page-special .rx-emitente-box .rx-dotted{margin:0 0 2px;}" +
      ".rx-page-special .rx-emitente-box .rx-signature{margin:0 0 3px;}" +
      ".rx-page-special .rx-emitente-box .rx-emitente-address{margin:2px 0 0;text-align:center;font-size:7pt;line-height:1.25;font-style:normal;}" +
      ".rx-page-special .rx-via-stack{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;}" +
      ".rx-page-special .rx-via-stack .rx-via-label{margin:0 0 1px;}" +
      ".rx-emitente-title{font-size:6pt;margin:0;flex:1 1 auto;}" +
      ".rx-emitente-row{display:flex;align-items:baseline;justify-content:space-between;gap:4px;margin:2px 0;}" +
      ".rx-via-label{font-weight:700;font-size:8pt;margin:1px 0;}" +
      ".rx-via-inline{text-align:right;white-space:nowrap;}" +
      ".rx-prescription-title{font-size:11pt;font-weight:700;text-align:center;margin:8px 0 4px;text-transform:none;}" +
      ".rx-page-special .rx-prescription-title{text-decoration:underline;}" +
      ".rx-field-row{font-size:7pt;margin:2px 0;line-height:1.4;}" +
      ".rx-page-special .rx-field-row{font-size:7pt;}" +
      ".rx-emitente-address{font-size:8pt;line-height:1.3;margin:2px 0 4px;}" +
      ".rx-page-special .rx-anvisa-frame{border:1px solid #000;margin-top:auto;width:100%;box-sizing:border-box;flex:0 0 auto;min-height:28mm;display:flex;flex-direction:column;}" +
      ".rx-anvisa-row{display:flex;flex-direction:row;gap:6px;margin-top:6px;align-items:flex-start;}" +
      ".rx-page-special .rx-anvisa-row{display:flex;flex-direction:row;margin-top:0;gap:0;align-items:stretch;flex:1 1 auto;min-height:26mm;}" +
      ".rx-anvisa-col{flex:1 1 50%;min-width:0;}" +
      ".rx-page-special .rx-anvisa-col{flex:1 1 50%;width:50%;min-width:0;padding:0;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;}" +
      ".rx-page-special .rx-anvisa-col-buyer{border-right:1px solid #000;}" +
      ".rx-page-special .rx-anvisa-col .rx-section-title{text-align:center;margin:0;padding:2px 0;border-bottom:1px solid #000;font-size:7pt;flex:0 0 auto;line-height:1.2;}" +
      ".rx-page-special .rx-anvisa-buyer-fields{flex:1 1 auto;padding:2px 4px 2px 4px;}" +
      ".rx-page-special .rx-field-row{margin:1px 0;line-height:1.35;}" +
      ".rx-page-special .rx-field-pair{display:flex;width:100%;gap:0;}" +
      ".rx-page-special .rx-field-cell{flex:1 1 50%;min-width:0;box-sizing:border-box;}" +
      ".rx-page-special .rx-field-cell:first-child{padding-right:6px;}" +
      ".rx-page-special .rx-field-cell:last-child{padding-right:8px;}" +
      ".rx-page-special .rx-field-spaced{margin-bottom:3px;}" +
      ".rx-page-special .rx-supplier-body{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;padding:2px 4px 4px 0;align-items:stretch;justify-content:flex-end;}" +
      ".rx-page-special .rx-supplier-sign-block{flex:0 0 auto;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;width:100%;min-height:10mm;padding:2px 0 4px;}" +
      ".rx-page-special .rx-supplier-sign-block .rx-dotted{width:100%;max-width:100%;text-align:center;margin:0 0 1px;}" +
      ".rx-page-special .rx-supplier-sign-block .rx-signature{margin:0 0 2px;}" +
      ".rx-page-special .rx-date-anvisa{text-align:center;width:100%;margin:0;padding:0 0 2px;white-space:nowrap;}" +
      ".rx-body{flex:1 1 auto;min-height:0;}" +
      ".rx-page-special .rx-body{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;width:100%;}" +
      ".rx-page-special .rx-body-main{flex:1 1 auto;min-height:0;}" +
      ".rx-page-special .rx-sign-row{margin-top:0;padding-top:0;}" +
      "@media print{html,body{margin:0;padding:0;height:100%;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.rx-page{height:100%;page-break-inside:avoid;break-inside:avoid;}body{box-shadow:none;}}" +
      "@media screen{body{max-width:297mm;margin:12px auto;box-shadow:0 2px 10px rgba(0,0,0,.12);padding:8mm;}}"
    );
  }

  function wrapDocumentHtml(title, body) {
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      '</title><style>' +
      baseCss() +
      "</style></head><body>" +
      body +
      "</body></html>"
    );
  }

  function buildSimpleViaBlock(ctx, lines, branding, dateLabel, meta) {
    meta = meta || {};
    var patient = ctx.patient || {};
    var html = '<section class="rx-block">';
    html += buildInstitutionHeader(branding, "inst-logo-simple");
    html += '<div class="rx-title-simple">RECEITUÁRIO MÉDICO</div>';
    html +=
      '<div class="rx-patient"><strong>Paciente:</strong> ' +
      escapeHtml(patient.nome || "—") +
      "</div>";
    html += buildFooterRuleHtml();
    html += '<div class="rx-body">';
    html += formatLinesGroupedByRouteHtml(lines, "simple", meta);
    html += "</div>";
    html += buildSimpleSignatureHtml();
    html += '<div class="rx-block-tail">';
    html += buildDateLineHtml(dateLabel, meta);
    html += buildFooterRuleHtml();
    html += buildInstitutionFooter(branding, meta);
    html += "</div>";
    html += "</section>";
    return html;
  }

  function buildEmitenteBlockHtml(branding) {
    return (
      '<div class="rx-emitente-wrap">' +
      '<div class="rx-emitente-box">' +
      '<div class="rx-emitente-box-title">IDENTIFICAÇÃO DO EMITENTE</div>' +
      '<div class="rx-emitente-sign-block">' +
      buildDottedLineHtml() +
      '<div class="rx-signature">Carimbo e Assinatura</div>' +
      "</div>" +
      buildEmitenteAddressHtml(branding, "special") +
      "</div>" +
      '<div class="rx-via-stack">' +
      '<div class="rx-via-label">1ª via - Farmácia</div>' +
      '<div class="rx-via-label">2ª via - Paciente</div>' +
      "</div></div>"
    );
  }

  function buildBuyerFieldsHtml() {
    return (
      '<div class="rx-section-title">IDENTIFICAÇÃO DO COMPRADOR</div>' +
      '<div class="rx-anvisa-buyer-fields">' +
      '<div class="rx-field-row">Nome:</div>' +
      '<div class="rx-field-row rx-field-pair">' +
      '<div class="rx-field-cell"><span>Ident.:</span></div>' +
      '<div class="rx-field-cell"><span>Órg. Emissor:</span></div>' +
      "</div>" +
      '<div class="rx-field-row rx-field-spaced">End.:</div>' +
      '<div class="rx-field-row rx-field-pair">' +
      '<div class="rx-field-cell"><span>Cidade:</span></div>' +
      '<div class="rx-field-cell"><span>UF:</span></div>' +
      "</div>" +
      '<div class="rx-field-row">Telefone:</div>' +
      "</div>"
    );
  }

  function buildSupplierFieldsHtml() {
    return (
      '<div class="rx-section-title">IDENTIFICAÇÃO DO FORNECEDOR</div>' +
      '<div class="rx-supplier-body">' +
      '<div class="rx-supplier-sign-block">' +
      buildDottedLineHtml() +
      '<div class="rx-signature">Assinatura do Farmacêutico</div>' +
      '<div class="rx-date rx-date-anvisa"><strong>Data:</strong> ___ / ___ / ___</div>' +
      "</div>" +
      "</div>"
    );
  }

  function buildSpecialHalf(ctx, lines, branding, meta) {
    meta = meta || {};
    var patient = ctx.patient || {};
    var html = '<section class="rx-half">';
    html += buildInstitutionHeader(branding, "inst-logo-special");
    html += '<div class="rx-title-special">RECEITUÁRIO CONTROLE ESPECIAL</div>';
    html += buildEmitenteBlockHtml(branding);
    html += '<div class="rx-body">';
    html += '<div class="rx-body-main">';
    html +=
      '<div class="rx-patient"><strong>Paciente:</strong> ' +
      escapeHtml(patient.nome || "—") +
      "</div>";
    html +=
      '<div class="rx-patient"><strong>Endereço:</strong> ' +
      escapeHtml(patient.endereco || "") +
      "</div>";
    html += '<div class="rx-prescription-title">Prescrição</div>';
    html += formatLinesGroupedByRouteHtml(lines, "special", meta);
    html += "</div>";
    html += '<div class="rx-anvisa-frame"><div class="rx-anvisa-row">';
    html += '<div class="rx-anvisa-col rx-anvisa-col-buyer">' + buildBuyerFieldsHtml() + "</div>";
    html += '<div class="rx-anvisa-col rx-anvisa-col-supplier">' + buildSupplierFieldsHtml() + "</div>";
    html += "</div></div>";
    html += "</div>";
    html += "</section>";
    return html;
  }

  function buildSimplePrescriptionBodyHtml(ctx) {
    var schema = getSchema();
    var branding = getBranding();
    var dateLabel = resolvePrintDateLabel(ctx);
    var lines = Array.isArray(ctx.lines) ? ctx.lines : [];
    if (schema) {
      lines = schema.groupLinesByPrintType(lines).simple;
    }
    var meta = {
      previewEditable: !!(ctx && ctx.previewEditable),
      docIndex: ctx && ctx.docIndex != null ? ctx.docIndex : 0,
    };
    var body = '<div class="rx-page rx-page-simple">';
    for (var v = 1; v <= SIMPLE_VIAS; v++) {
      body += buildSimpleViaBlock(ctx, lines, branding, dateLabel, meta);
    }
    body += "</div>";
    return body;
  }

  function extractBodyInner(html) {
    return html.replace(/^[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*$/, "");
  }

  function buildSimplePrescriptionHtml(ctx) {
    return wrapDocumentHtml("RECEITUÁRIO MÉDICO", buildSimplePrescriptionBodyHtml(ctx));
  }

  function buildSpecialPrescriptionHtml(ctx) {
    var schema = getSchema();
    var branding = getBranding();
    var lines = Array.isArray(ctx.lines) ? ctx.lines : [];
    if (schema) {
      lines = schema.groupLinesByPrintType(lines).special;
    }
    var meta = {
      previewEditable: !!(ctx && ctx.previewEditable),
      docIndex: ctx && ctx.docIndex != null ? ctx.docIndex : 0,
    };
    var body = '<div class="rx-page rx-page-special">';
    body += buildSpecialHalf(ctx, lines, branding, meta);
    body += buildSpecialHalf(ctx, lines, branding, meta);
    body += "</div>";
    return wrapDocumentHtml("RECEITUÁRIO CONTROLE ESPECIAL", body);
  }

  function removePrintIframe(iframe) {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }

  function schedulePrint(targetWin, autoPrint) {
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
              /* ignore */
            }
          }, 100);
        });
      }
    }

    if (targetWin.document && targetWin.document.readyState === "complete") {
      runPrint();
    } else {
      targetWin.addEventListener("load", runPrint);
    }
  }

  function openPrintHtmlInIframe(html, titleOrOptions) {
    if (typeof window === "undefined") {
      return { ok: false, error: "browser_only" };
    }
    var opts =
      titleOrOptions && typeof titleOrOptions === "object"
        ? titleOrOptions
        : { title: titleOrOptions };
    var autoPrint = opts.autoPrint !== false;
    var title = opts.title || "Receita";

    try {
      var iframe = document.createElement("iframe");
      iframe.setAttribute(
        "style",
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden",
      );
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

      schedulePrint(iframeWin, autoPrint);

      if (typeof iframeWin.addEventListener === "function") {
        iframeWin.addEventListener(
          "afterprint",
          function () {
            if (typeof opts.onAfterPrint === "function") {
              try {
                opts.onAfterPrint();
              } catch (_e) {}
            }
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

  function printPrescription(ctx, printType) {
    var validation = getValidation();
    var lines = Array.isArray(ctx.lines) ? ctx.lines : [];
    var schema = getSchema();
    var filtered = lines;
    if (schema) {
      var g = schema.groupLinesByPrintType(lines);
      filtered = printType === "special" ? g.special : g.simple;
    }
    if (validation) {
      var result = validation.validatePrintContext({
        patient: ctx.patient,
        prescriber: ctx.prescriber,
        lines: filtered,
        printType: printType === "special" ? "special" : "simple",
        patientAddress: ctx.patientAddress,
      });
      if (!result.ok) {
        return { ok: false, error: result.errors.join(" "), warnings: result.warnings };
      }
    }
    var html =
      printType === "special"
        ? buildSpecialPrescriptionHtml(ctx)
        : buildSimplePrescriptionHtml(ctx);
    if (typeof window === "undefined") {
      return { ok: true, html: html };
    }
    return openPrintHtmlInIframe(html, {
      title: printType === "special" ? "Receita especial" : "Receituário",
    });
  }

  return {
    escapeHtml: escapeHtml,
    normalizeRoute: normalizeRoute,
    groupLinesByRoute: groupLinesByRoute,
    formatPrescriberLine: formatPrescriberLine,
    formatPrintDate: formatPrintDate,
    formatLinesGroupedByRouteHtml: formatLinesGroupedByRouteHtml,
    receitaPrintCss: baseCss,
    buildSimplePrescriptionBodyHtml: buildSimplePrescriptionBodyHtml,
    buildSimplePrescriptionHtml: buildSimplePrescriptionHtml,
    buildSpecialPrescriptionHtml: buildSpecialPrescriptionHtml,
    extractBodyInner: extractBodyInner,
    printPrescription: printPrescription,
    openPrintHtmlInIframe: openPrintHtmlInIframe,
  };
});
