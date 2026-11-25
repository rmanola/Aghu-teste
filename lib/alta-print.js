/**
 * Impressão de documentos de alta (orientações, laudo, atestado, receituário kit) — layout HUCAM.
 * Paridade com docs/reference/modelos-impressao/alta/modelos-alta.pdf: cabeçalho institucional (logo) + rodapé de serviço/local/data.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SERIF_STACK = '"Times New Roman",Times,serif';
  var DOTTED_LINE =
    "_________________________________________";
  var DOTTED_LINE_SHORT = "________________________________";

  function getAltaSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaSchema;
  }

  function getAltaProcedimentos() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-procedimentos.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaProcedimentos;
  }

  function getReceitaPrint() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-print.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPrint;
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

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatBrDate(input) {
    if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      var p = input.split("-");
      return pad2(Number(p[2])) + "/" + pad2(Number(p[1])) + "/" + p[0];
    }
    var d = input instanceof Date ? input : new Date(input == null ? Date.now() : input);
    if (isNaN(d.getTime())) d = new Date();
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function resolveServiceLines(ctx) {
    var schema = getAltaSchema();
    return {
      serviceLine:
        (ctx && ctx.serviceLine) ||
        (schema && schema.DEFAULT_SERVICE_LINE) ||
        "SERVIÇO DE CIRURGIA DO APARELHO DIGESTIVO",
      locationLine:
        (ctx && ctx.locationLine) ||
        (schema && schema.DEFAULT_LOCATION_LINE) ||
        "HUCAM - Vitória, Espírito Santo",
      dateLabel: formatBrDate((ctx && ctx.printDate) || new Date()),
    };
  }

  function getReceitaSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaSchema;
  }

  function getReceitaValidation() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-print-validation.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPrintValidation;
  }

  function getReceitaPatientContext() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-patient-context.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPatientContext;
  }

  function baseCss() {
    return (
      "@page alta{size:A4 portrait;margin:18mm 20mm;}" +
      "html,body{margin:0;padding:0;}" +
      "body{font-family:" +
      SERIF_STACK +
      ";font-size:13pt;color:#000;background:#fff;line-height:1.65;}" +
      ".alta-page{page:alta;display:flex;flex-direction:column;min-height:calc(297mm - 36mm);box-sizing:border-box;" +
      "page-break-after:always;break-after:page;}" +
      ".alta-page:last-child{page-break-after:auto;break-after:auto;}" +
      ".alta-page-main{flex:1 1 auto;min-height:0;}" +
      ".inst-header{display:flex;align-items:center;justify-content:space-between;gap:6px;" +
      "min-height:120pt;margin:0 0 10px;padding-bottom:6px;" +
      "border-bottom:1px solid #000;break-inside:avoid;page-break-inside:avoid;}" +
      ".inst-logo-alta{flex:0 0 auto;object-fit:contain;}" +
      ".inst-logo-alta-left{height:116pt;width:auto;max-width:136pt;}" +
      ".inst-logo-alta-right{height:32pt;width:auto;max-width:88pt;}" +
      ".inst-text{flex:1 1 auto;text-align:center;padding:0 4pt;min-width:0;}" +
      ".inst-line{font-size:10pt;font-weight:700;text-transform:uppercase;line-height:1.4;}" +
      ".alta-patient{font-weight:700;text-transform:uppercase;text-align:center;margin:0 0 16px;font-size:14pt;line-height:1.5;}" +
      ".alta-title{font-weight:700;text-align:center;text-transform:uppercase;margin:0 0 20px;font-size:14pt;line-height:1.5;}" +
      ".alta-title-as-written{text-transform:none;}" +
      ".alta-body{margin:0 0 20px;line-height:1.65;}" +
      ".alta-orientacoes-list{margin:0 0 14px 24px;padding:0;list-style:decimal;}" +
      ".alta-orientacoes-list > li{margin:0 0 8px;}" +
      ".alta-item{margin:0 0 14px;line-height:1.65;}" +
      ".alta-paragraph{margin:0 0 14px;text-align:justify;line-height:1.65;}" +
      ".alta-paragraph-multiline{white-space:pre-line;}" +
      ".alta-cid{margin-top:14px;line-height:1.65;}" +
      ".alta-sign{margin-top:28px;text-align:center;line-height:1.5;break-inside:avoid;page-break-inside:avoid;}" +
      ".alta-dotted{margin:0 0 6px;letter-spacing:1px;white-space:nowrap;overflow:hidden;}" +
      ".alta-title-underline{text-decoration:underline;}" +
      ".alta-retorno-row{margin:0 0 12px;line-height:1.65;}" +
      ".alta-retorno-label{font-weight:700;text-transform:uppercase;}" +
      ".alta-retorno-value{display:inline;}" +
      ".alta-retorno-value-multiline{white-space:pre-line;}" +
      ".alta-retorno-value-underline{text-decoration:underline;}" +
      ".alta-retorno-section{margin:18px 0 12px;font-weight:700;text-transform:uppercase;text-decoration:underline;}" +
      ".alta-retorno-ato-block{margin:0 0 16px;}" +
      ".alta-retorno-ato-block:last-of-type{margin-bottom:8px;}" +
      ".alta-service-footer{margin-top:auto;padding-top:20px;text-align:center;font-size:13pt;line-height:1.55;" +
      "break-inside:avoid;page-break-inside:avoid;}" +
      ".alta-service-footer .alta-service-line{margin:4px 0;}" +
      ".alta-page ul,.alta-page ol,.rx-page ul,.rx-page ol{margin:0 0 10px 18px;padding:0;}" +
      ".alta-page li,.rx-page li{margin:0 0 4px;}" +
      ".alta-page u,.rx-page u{text-decoration:underline;}" +
      "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}"
    );
  }

  function kitBaseCss() {
    var receitaPrint = getReceitaPrint();
    var rxCss =
      receitaPrint && typeof receitaPrint.receitaPrintCss === "function"
        ? receitaPrint.receitaPrintCss()
        : "";
    return rxCss + baseCss();
  }

  function guiaCssIfNeeded(body) {
    var s = String(body || "");
    if (s.indexOf("guia-page") === -1 && s.indexOf("guia-grid") === -1) {
      return "";
    }
    var enc = getEncaminhamento();
    return enc && typeof enc.guiaCss === "function" ? enc.guiaCss() : "";
  }

  function wrapDocumentHtml(title, body) {
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      '</title><style>' +
      baseCss() +
      guiaCssIfNeeded(body) +
      "</style></head><body>" +
      body +
      "</body></html>"
    );
  }

  function wrapKitDocumentHtml(title, body) {
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      '</title><style>' +
      kitBaseCss() +
      guiaCssIfNeeded(body) +
      "</style></head><body>" +
      body +
      "</body></html>"
    );
  }

  /** HTML só com CSS RX (paisagem) — helper/testes; print do kit usa buildAltaKitHtml. */
  function wrapReceitasDocumentHtml(title, body) {
    var receitaPrint = getReceitaPrint();
    var rxCss =
      receitaPrint && typeof receitaPrint.receitaPrintCss === "function"
        ? receitaPrint.receitaPrintCss()
        : "";
    // @page sem nome: Gecko aplica size como papel de forma fiável (bug 1874947).
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      '</title><style>' +
      "@page{size:A4 landscape;margin:8mm;}" +
      rxCss +
      "</style></head><body>" +
      body +
      "</body></html>"
    );
  }

  function extractBodyInner(html) {
    return html.replace(/^[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*$/, "");
  }

  /**
   * Parte corpo misto do kit (override previewHtml.kit) em RX vs retrato.
   * Sem DOM — só string. Aceita <section|div class="alta-page">.
   * Se não houver marcadores claros ou RX ainda misturado, ok=false (caller regenera).
   */
  function splitKitBodyByOrientation(bodyHtml) {
    var html = String(bodyHtml == null ? "" : bodyHtml);
    var trimmed = html.trim();
    if (!trimmed) {
      return { ok: true, rxHtml: "", portraitHtml: "" };
    }
    var hasRx = /\brx-page\b/.test(trimmed);
    var altaMatch = trimmed.match(
      /<(?:section|div)\b[^>]*\bclass="[^"]*\balta-page\b[^"]*"[^>]*>/i,
    );
    var altaIdx = altaMatch ? trimmed.indexOf(altaMatch[0]) : -1;
    var result = null;
    if (hasRx && altaIdx > 0) {
      result = {
        ok: true,
        rxHtml: trimmed.slice(0, altaIdx).trim(),
        portraitHtml: trimmed.slice(altaIdx).trim(),
      };
    } else if (hasRx && altaIdx < 0) {
      result = { ok: true, rxHtml: trimmed, portraitHtml: "" };
    } else if (!hasRx && altaIdx >= 0) {
      result = { ok: true, rxHtml: "", portraitHtml: trimmed };
    } else {
      // !hasRx && altaIdx < 0, ou hasRx && altaIdx === 0 (misturado inesperado)
      return { ok: false, rxHtml: "", portraitHtml: "" };
    }
    if (result.rxHtml && /\balta-page\b/.test(result.rxHtml)) {
      return { ok: false, rxHtml: "", portraitHtml: "" };
    }
    return result;
  }

  function buildAltaInstitutionHeader(branding) {
    branding = branding || getBranding() || {};
    var ebserhUri = branding.EBSERH_LOGO_DATA_URI || "";
    var ebserhAlt = branding.EBSERH_LOGO_ALT || "EBSERH";
    return (
      '<header class="inst-header">' +
      '<img class="inst-logo-alta inst-logo-alta-left" src="' +
      (branding.LOGO_DATA_URI || "") +
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
      "</div>" +
      (ebserhUri
        ? '<img class="inst-logo-alta inst-logo-alta-right" src="' +
          ebserhUri +
          '" alt="' +
          escapeHtml(ebserhAlt) +
          '">'
        : '<span class="inst-logo-alta inst-logo-alta-right" aria-hidden="true"></span>') +
      "</header>"
    );
  }

  function buildAltaPatientLine(ctx) {
    var patient = (ctx && ctx.patient) || {};
    var nome = patient.nome || patient.nomeCompleto || "—";
    return (
      '<div class="alta-patient">' + escapeHtml(String(nome).toUpperCase()) + "</div>"
    );
  }

  function buildAltaServiceFooter(ctx) {
    var lines = resolveServiceLines(ctx);
    return (
      '<footer class="alta-service-footer">' +
      '<div class="alta-service-line">' +
      escapeHtml(lines.serviceLine) +
      "</div>" +
      '<div class="alta-service-line">' +
      escapeHtml(lines.locationLine) +
      "</div>" +
      '<div class="alta-service-line">' +
      escapeHtml(lines.dateLabel) +
      "</div></footer>"
    );
  }

  function buildSignatureBlock(shortLine) {
    return (
      '<div class="alta-sign">' +
      '<div class="alta-dotted">' +
      (shortLine ? DOTTED_LINE_SHORT : DOTTED_LINE) +
      "</div>" +
      "<div>Médico Assistente</div>" +
      "</div>"
    );
  }

  function buildAltaPageOpen(ctx) {
    return (
      '<section class="alta-page">' +
      buildAltaInstitutionHeader(getBranding()) +
      buildAltaPatientLine(ctx) +
      '<div class="alta-page-main">'
    );
  }

  function buildAltaPageClose(ctx) {
    return buildSignatureBlock(false) + buildAltaServiceFooter(ctx) + "</section>";
  }

  function buildRetornoPageOpen(ctx) {
    return (
      '<section class="alta-page">' +
      buildAltaInstitutionHeader(getBranding()) +
      '<div class="alta-page-main">'
    );
  }

  function buildRetornoRow(label, value, options) {
    options = options || {};
    var text = value == null ? "" : String(value).trim();
    var valueClass = "alta-retorno-value";
    if (options.multiline) {
      valueClass += " alta-retorno-value-multiline";
    }
    if (options.underlineValue && text) {
      valueClass += " alta-retorno-value-underline";
    }
    return (
      '<div class="alta-retorno-row">' +
      '<span class="alta-retorno-label">' +
      escapeHtml(label) +
      "</span>" +
      (text
        ? " <span class=\"" + valueClass + "\">" + escapeHtml(text) + "</span>"
        : "") +
      "</div>"
    );
  }

  function docHasSimpleMedicationLines(docLines) {
    var lines = Array.isArray(docLines) ? docLines : [];
    var schema = getReceitaSchema();
    var simple = lines;
    if (schema && typeof schema.groupLinesByPrintType === "function") {
      simple = schema.groupLinesByPrintType(lines).simple;
    }
    for (var i = 0; i < simple.length; i++) {
      if (simple[i] && String(simple[i].drugName || "").trim()) {
        return true;
      }
    }
    return false;
  }

  function docHasAnvisaSpecialMedicationLines(docLines) {
    var lines = Array.isArray(docLines) ? docLines : [];
    var schema = getReceitaSchema();
    var special = lines;
    if (schema && typeof schema.groupLinesByPrintType === "function") {
      special = schema.groupLinesByPrintType(lines).special;
    }
    for (var i = 0; i < special.length; i++) {
      if (special[i] && String(special[i].drugName || "").trim()) {
        return true;
      }
    }
    return false;
  }

  function collectKitReceitaDocs(ctx) {
    if (ctx && Array.isArray(ctx.receitas) && ctx.receitas.length) {
      return ctx.receitas;
    }
    if (ctx && Array.isArray(ctx.lines) && ctx.lines.length) {
      return [{ lines: ctx.lines, patientAddress: ctx.patientAddress || null }];
    }
    return [];
  }

  function kitHasAnvisaSpecialLines(ctx) {
    var docs = collectKitReceitaDocs(ctx);
    for (var d = 0; d < docs.length; d++) {
      if (docHasAnvisaSpecialMedicationLines((docs[d] && docs[d].lines) || [])) {
        return true;
      }
    }
    return false;
  }

  function resolveKitPatientAddress(ctx, doc) {
    var schema = getReceitaSchema();
    if (doc && doc.patientAddress && schema && schema.hasPatientAddressContent(doc.patientAddress)) {
      return schema.normalizePatientAddress(doc.patientAddress);
    }
    if (ctx && ctx.patientAddress && schema && schema.hasPatientAddressContent(ctx.patientAddress)) {
      return schema.normalizePatientAddress(ctx.patientAddress);
    }
    if (ctx && ctx.receitas && schema) {
      return schema.resolveBestPatientAddressFromSnap({ receitas: ctx.receitas }, null);
    }
    return schema ? schema.emptyPatientAddress() : null;
  }

  function resolveKitPrintPatient(ctx, doc) {
    var patientCtxApi = getReceitaPatientContext();
    var addr = resolveKitPatientAddress(ctx, doc);
    var nome =
      (ctx && ctx.patient && ctx.patient.nome) ||
      (ctx && ctx.patient && ctx.patient.nomeCompleto) ||
      "";
    if (patientCtxApi && typeof patientCtxApi.contextForPrint === "function") {
      return patientCtxApi.contextForPrint({
        nomeCompleto: nome,
        patientAddress: addr,
      });
    }
    return (ctx && ctx.patient) || { nome: nome || "—" };
  }

  function validateAltaKitContext(ctx) {
    if (!kitHasAnvisaSpecialLines(ctx)) {
      return { ok: true };
    }
    var validation = getReceitaValidation();
    var schema = getReceitaSchema();
    var docs = collectKitReceitaDocs(ctx);
    var allLines = [];
    for (var i = 0; i < docs.length; i++) {
      var docLines = (docs[i] && docs[i].lines) || [];
      for (var j = 0; j < docLines.length; j++) {
        if (docLines[j]) allLines.push(docLines[j]);
      }
    }
    var patientAddress = resolveKitPatientAddress(ctx, docs[0] || null);
    if (validation && typeof validation.validatePrintContext === "function") {
      var result = validation.validatePrintContext({
        patient: (ctx && ctx.patient) || {},
        lines: allLines,
        printType: "special",
        patientAddress: patientAddress,
      });
      if (!result.ok) {
        return { ok: false, error: result.errors.join(" ") };
      }
      return { ok: true };
    }
    if (schema && !schema.isPatientAddressComplete(patientAddress)) {
      return {
        ok: false,
        error: "Informe o endereço completo do paciente para receita especial no kit.",
      };
    }
    return { ok: true };
  }

  function previewHtmlOverride(ctx, key) {
    var previewHtml = ctx && ctx.previewHtml;
    if (!previewHtml || !previewHtml[key]) return null;
    var html = String(previewHtml[key]).trim();
    if (!html) return null;
    var schema = getAltaSchema();
    if (schema && typeof schema.sanitizePreviewHtmlSection === "function") {
      html = schema.sanitizePreviewHtmlSection(key, html);
    }
    return html || null;
  }

  function buildOrientacoesHtml(ctx) {
    var override = previewHtmlOverride(ctx, "orientacoes");
    if (override) return wrapDocumentHtml("Orientações", override);
    var orientacoes = (ctx && ctx.orientacoes) || {};
    var items = Array.isArray(orientacoes.items) ? orientacoes.items : [];
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-body">';
    body += '<ol class="alta-orientacoes-list">';
    for (var i = 0; i < items.length; i++) {
      body += "<li>" + escapeHtml(items[i]) + "</li>";
    }
    body += "</ol>";
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Orientações", body);
  }

  function formatLaudoNarrative(laudo) {
    laudo = laudo || {};
    var ap = getAltaProcedimentos();
    var parts = [];
    parts.push(
      "DECLARO PARA OS DEVIDOS FINS QUE, PACIENTE ACIMA CITADO FORA INTERNADO NO HUCAM NO DIA " +
        formatBrDate(laudo.dataInternacao) +
        " NO SETOR DE CIRURGIA GERAL COM DIAGNÓSTICO DE " +
        String(laudo.diagnostico || "—").toUpperCase() +
        ".",
    );
    var procedimentos =
      ap && typeof ap.resolveProcedimentosFromLaudo === "function"
        ? ap.resolveProcedimentosFromLaudo(laudo)
        : [];
    var procSentence = "";
    if (ap && typeof ap.formatLaudoProcedimentosNarrative === "function") {
      procSentence = ap.formatLaudoProcedimentosNarrative(
        procedimentos,
        laudo.semIntercorrencias,
      );
    } else if (laudo.procedimento) {
      procSentence =
        "FOI SUBMETIDO(A) A " +
        String(laudo.procedimento).toUpperCase() +
        (laudo.dataProcedimento
          ? " EM " + formatBrDate(laudo.dataProcedimento)
          : "") +
        (laudo.semIntercorrencias !== false ? ", SEM INTERCORRÊNCIAS." : ".");
    }
    if (procSentence) parts.push(procSentence);
    if (laudo.evolucao) {
      parts.push(String(laudo.evolucao).toUpperCase());
    }
    return parts.join(" ");
  }

  function buildLaudoHtml(ctx) {
    var override = previewHtmlOverride(ctx, "laudo");
    if (override) return wrapDocumentHtml("Laudo médico", override);
    var laudo = (ctx && ctx.laudo) || {};
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">LAUDO MÉDICO</div>';
    body += '<div class="alta-body">';
    body +=
      '<div class="alta-paragraph">' +
      escapeHtml(formatLaudoNarrative(laudo)) +
      "</div>";
    if (laudo.cid10) {
      body +=
        '<div class="alta-cid"><strong>CID-10:</strong> ' +
        escapeHtml(laudo.cid10) +
        "</div>";
    }
    if (laudo.divulgacaoCidAutorizada) {
      body +=
        '<div class="alta-paragraph">DIVULGAÇÃO DE CID AUTORIZADO PELO PACIENTE</div>';
    }
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Laudo médico", body);
  }

  function addDaysIso(iso, days) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return "";
    var offset = Number(days);
    if (!Number.isFinite(offset)) return "";
    var d = new Date(String(iso) + "T12:00:00.000Z");
    if (!Number.isFinite(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function resolveAcompanhanteDias(acompanhante) {
    var a = acompanhante || {};
    return typeof a.diasDeclaracao === "number" && a.diasDeclaracao > 0
      ? Math.floor(a.diasDeclaracao)
      : 15;
  }

  function resolveAcompanhanteTerminoIso(acompanhante) {
    var a = acompanhante || {};
    var inicio = a.dataInicio ? String(a.dataInicio) : "";
    var dias = resolveAcompanhanteDias(a);
    if (!inicio) return "";
    return addDaysIso(inicio, dias - 1);
  }

  function formatAcompanhanteTotalizadorLabel(dias) {
    var d =
      typeof dias === "number" && dias > 0 ? Math.floor(dias) : 15;
    var palavra = d === 1 ? "DIA" : "DIAS";
    return String(d) + " (" + numberToWordsPt(d) + ") " + palavra;
  }

  function formatAcompanhanteDatasClausula(acompanhante) {
    var a = acompanhante || {};
    var dias = resolveAcompanhanteDias(a);
    var inicioBr = a.dataInicio ? formatBrDate(a.dataInicio) : "";
    if (!inicioBr) {
      return {
        clausula: "",
        modo: "none",
        dias: dias,
        inicioBr: "",
        terminoBr: "",
      };
    }
    if (dias === 1) {
      return {
        clausula: ", NO DIA " + inicioBr,
        modo: "unico",
        dias: dias,
        inicioBr: inicioBr,
        terminoBr: "",
      };
    }
    var terminoIso = resolveAcompanhanteTerminoIso(a);
    var terminoBr = terminoIso ? formatBrDate(terminoIso) : "";
    if (terminoBr) {
      return {
        clausula: ", ENTRE OS DIAS " + inicioBr + " E " + terminoBr,
        modo: "intervalo",
        dias: dias,
        inicioBr: inicioBr,
        terminoBr: terminoBr,
      };
    }
    return {
      clausula: ", NO DIA " + inicioBr,
      modo: "unico",
      dias: dias,
      inicioBr: inicioBr,
      terminoBr: "",
    };
  }

  function buildAcompanhanteDeclaracaoTexto(acompanhante) {
    var a = acompanhante || {};
    var nome = String(a.nomeAcompanhante || "").trim().toUpperCase() || "—";
    var datasInfo = formatAcompanhanteDatasClausula(a);
    var texto =
      "DECLARO, PARA OS DEVIDOS FINS, QUE " +
      nome +
      " ACOMPANHOU O(A) PACIENTE SUPRACITADO(A) DURANTE SUA INTERNAÇÃO NESTE HOSPITAL";
    texto += datasInfo.clausula;
    texto +=
      ", TOTALIZANDO " +
      formatAcompanhanteTotalizadorLabel(datasInfo.dias) +
      ", PARA COMPROVAÇÃO JUNTO AO EMPREGADOR E DEMAIS ÓRGÃOS COMPETENTES.";
    return texto;
  }

  function buildAtestadoHtml(ctx) {
    var override = previewHtmlOverride(ctx, "atestado");
    if (override) return wrapDocumentHtml("Atestado médico", override);
    var atestado = (ctx && ctx.atestado) || {};
    var laudo = (ctx && ctx.laudo) || {};
    var ap = getAltaProcedimentos();
    var dias = atestado.diasAfastamento || 15;
    var procText = atestado.procedimento || "—";
    if (ap && typeof ap.resolveProcedimentosFromLaudo === "function") {
      var procs = ap.resolveProcedimentosFromLaudo(laudo);
      if (procs.length && typeof ap.formatAtestadoProcedimentos === "function") {
        procText = ap.formatAtestadoProcedimentos(procs) || procText;
      }
    }
    var texto =
      "ATESTO QUE O PACIENTE SUPRACITADO ESTEVE INTERNADO PARA REALIZAÇÃO DE " +
      String(procText).toUpperCase() +
      " NESTE SERVIÇO E NECESSITA DE " +
      String(dias) +
      " (" +
      numberToWordsPt(dias) +
      ") DIAS DE AFASTAMENTO DAS SUAS ATIVIDADES" +
      (atestado.dataInicioAfastamento
        ? " A PARTIR DE " + formatBrDate(atestado.dataInicioAfastamento) + " (DATA DA INTERNAÇÃO)"
        : "") +
      ".";
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">ATESTADO MÉDICO</div>';
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph">' + escapeHtml(texto) + "</div>";
    if (atestado.cid10) {
      body +=
        '<div class="alta-cid"><strong>CID-10:</strong> ' +
        escapeHtml(atestado.cid10) +
        "</div>";
    }
    if (atestado.divulgacaoCidAutorizada) {
      body +=
        '<div class="alta-paragraph">DIVULGAÇÃO DE CID AUTORIZADO PELO PACIENTE.</div>';
    }
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Atestado médico", body);
  }

  function buildAcompanhanteHtml(ctx) {
    var override = previewHtmlOverride(ctx, "acompanhante");
    if (override) return wrapDocumentHtml("Declaração de acompanhante", override);
    var acompanhante = (ctx && ctx.acompanhante) || {};
    var texto = buildAcompanhanteDeclaracaoTexto(acompanhante);
    var cid = acompanhante.cid10 ? String(acompanhante.cid10).trim().toUpperCase() : "Z76.3";
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">DECLARAÇÃO DE ACOMPANHANTE</div>';
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph">' + escapeHtml(texto) + "</div>";
    if (cid) {
      body +=
        '<div class="alta-cid"><strong>CID-10:</strong> ' + escapeHtml(cid) + "</div>";
    }
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Declaração de acompanhante", body);
  }

  function buildLaudoPersonalizadoHtml(ctx) {
    var override = previewHtmlOverride(ctx, "laudoPersonalizado");
    if (override) return wrapDocumentHtml("Laudo personalizado", override);
    var lp = (ctx && ctx.laudoPersonalizado) || {};
    var titulo = lp.titulo && String(lp.titulo).trim() ? String(lp.titulo).trim() : "—";
    var corpo = lp.corpo != null ? String(lp.corpo) : "";
    var body = buildAltaPageOpen(ctx);
    body +=
      '<div class="alta-title alta-title-as-written">' + escapeHtml(titulo) + "</div>";
    body += '<div class="alta-body">';
    body +=
      '<div class="alta-paragraph alta-paragraph-multiline">' +
      escapeHtml(corpo) +
      "</div>";
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Laudo personalizado", body);
  }

  function formatRetornoDataCirurgiaDisplay(value) {
    if (value == null || value === "") return "";
    return String(value)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        var trimmed = line.trim();
        if (!trimmed) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return formatBrDate(trimmed);
        return trimmed;
      })
      .join("\n");
  }

  function buildRetornoHtml(ctx) {
    var override = previewHtmlOverride(ctx, "retorno");
    if (override) return wrapDocumentHtml("Cartão de retorno", override);
    var retorno = (ctx && ctx.retorno) || {};
    var patient = (ctx && ctx.patient) || {};
    var nome = patient.nome || patient.nomeCompleto || "—";
    var prontuario = patient.prontuario || "—";
    var ap = getAltaProcedimentos();
    var atos =
      ap && typeof ap.resolveRetornoAtos === "function"
        ? ap.resolveRetornoAtos(retorno)
        : [];
    var body = buildRetornoPageOpen(ctx);
    body += '<div class="alta-title alta-title-underline">CARTÃO DE RETORNO</div>';
    body += '<div class="alta-body">';
    body += buildRetornoRow("NOME:", String(nome).toUpperCase());
    body += buildRetornoRow("Nº DO PRONTUÁRIO:", String(prontuario));
    body += buildRetornoRow(
      "DIAGNÓSTICO:",
      retorno.diagnostico ? String(retorno.diagnostico).toUpperCase() : "",
    );
    for (var a = 0; a < atos.length; a++) {
      var ato = atos[a];
      body += '<div class="alta-retorno-ato-block">';
      body += buildRetornoRow(
        "ATO:",
        ato.descricao ? String(ato.descricao).toUpperCase() : "",
      );
      body += buildRetornoRow(
        "DATA DA CIRURGIA:",
        ato.data ? formatRetornoDataCirurgiaDisplay(ato.data) : "",
      );
      body += buildRetornoRow("STAFF:", ato.staff || "", {
        underlineValue: true,
      });
      var auxList = Array.isArray(ato.auxiliares) ? ato.auxiliares : [];
      var ap = getAltaProcedimentos();
      for (var x = 0; x < auxList.length; x++) {
        var auxName = String(auxList[x] || "").trim();
        if (!auxName) continue;
        var auxLabel =
          ap && typeof ap.formatAuxiliarLabel === "function"
            ? ap.formatAuxiliarLabel(x)
            : String(x + 1) + "º AUXILIAR:";
        body += buildRetornoRow(auxLabel, auxName);
      }
      body += "</div>";
    }
    body += '<div class="alta-retorno-section">RETORNO AMBULATORIAL</div>';
    body += buildRetornoRow("LOCAL:", retorno.localRetorno || "");
    body += buildRetornoRow("DATA/HORA:", retorno.dataHoraRetorno || "");
    body += buildRetornoRow("MÉDICO:", retorno.medicoRetorno || "");
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Cartão de retorno", body);
  }

  function buildAltaKitReceitasBodyFromFields(ctx) {
    var parts = [];
    var receitaPrint = getReceitaPrint();
    var docs = collectKitReceitaDocs(ctx);
    if (receitaPrint && docs.length) {
      for (var d = 0; d < docs.length; d++) {
        var doc = docs[d];
        var docLines = (doc && doc.lines) || [];
        if (docHasSimpleMedicationLines(docLines)) {
          parts.push(
            extractBodyInner(
              receitaPrint.buildSimplePrescriptionHtml({
                patient: resolveKitPrintPatient(ctx, doc),
                lines: docLines,
                printDate: ctx.printDate,
              }),
            ),
          );
        }
        if (docHasAnvisaSpecialMedicationLines(docLines)) {
          var kitAddr = resolveKitPatientAddress(ctx, doc);
          parts.push(
            extractBodyInner(
              receitaPrint.buildSpecialPrescriptionHtml({
                patient: resolveKitPrintPatient(ctx, doc),
                lines: docLines,
                patientAddress: kitAddr,
                printDate: ctx.printDate,
              }),
            ),
          );
        }
      }
    }
    return parts.join("");
  }

  function buildAltaKitPortraitBodyFromFields(ctx) {
    var parts = [];
    parts.push(extractBodyInner(buildOrientacoesHtml(ctx)));
    parts.push(extractBodyInner(buildLaudoHtml(ctx)));
    var schema = getAltaSchema();
    if (schema && typeof schema.laudoPersonalizadoHasContent === "function") {
      if (schema.laudoPersonalizadoHasContent(ctx && ctx.laudoPersonalizado)) {
        parts.push(extractBodyInner(buildLaudoPersonalizadoHtml(ctx)));
      }
    } else if (
      ctx &&
      ctx.laudoPersonalizado &&
      (ctx.laudoPersonalizado.titulo || ctx.laudoPersonalizado.corpo)
    ) {
      parts.push(extractBodyInner(buildLaudoPersonalizadoHtml(ctx)));
    }
    parts.push(extractBodyInner(buildAtestadoHtml(ctx)));
    if (schema && typeof schema.acompanhanteHasContent === "function") {
      if (schema.acompanhanteHasContent(ctx && ctx.acompanhante)) {
        parts.push(extractBodyInner(buildAcompanhanteHtml(ctx)));
      }
    } else if (ctx && ctx.acompanhante && ctx.acompanhante.nomeAcompanhante) {
      parts.push(extractBodyInner(buildAcompanhanteHtml(ctx)));
    }
    if (schema && typeof schema.retornoHasContent === "function") {
      if (schema.retornoHasContent(ctx && ctx.retorno)) {
        parts.push(extractBodyInner(buildRetornoHtml(ctx)));
      }
    } else if (ctx && ctx.retorno) {
      parts.push(extractBodyInner(buildRetornoHtml(ctx)));
    }
    var enc =
      typeof require !== "undefined"
        ? (function () {
            try {
              return require("./alta-encaminhamento.js");
            } catch (_e) {
              return null;
            }
          })()
        : typeof globalThis !== "undefined"
          ? globalThis.AghuAltaEncaminhamento
          : null;
    if (enc) {
      if (
        schema && typeof schema.referenciaHasContent === "function"
          ? schema.referenciaHasContent(ctx && ctx.referencia)
          : enc.referenciaHasContent(ctx && ctx.referencia)
      ) {
        parts.push(extractBodyInner(enc.buildReferenciaHtml(ctx)));
      }
      if (
        schema && typeof schema.contrarreferenciaHasContent === "function"
          ? schema.contrarreferenciaHasContent(ctx && ctx.contrarreferencia)
          : enc.contrarreferenciaHasContent(ctx && ctx.contrarreferencia)
      ) {
        parts.push(extractBodyInner(enc.buildContrarreferenciaHtml(ctx)));
      }
    }
    return parts.join("");
  }

  function resolveKitBodiesByOrientation(ctx) {
    var kitOverride = previewHtmlOverride(ctx, "kit");
    if (kitOverride) {
      var split = splitKitBodyByOrientation(kitOverride);
      if (split.ok) {
        return { rxHtml: split.rxHtml, portraitHtml: split.portraitHtml };
      }
    }
    return {
      rxHtml: buildAltaKitReceitasBodyFromFields(ctx),
      portraitHtml: buildAltaKitPortraitBodyFromFields(ctx),
    };
  }

  /** Só receitas, CSS paisagem (helper/testes e primeiro job do kit). */
  function buildAltaKitReceitasHtml(ctx) {
    var bodies = resolveKitBodiesByOrientation(ctx);
    var body = bodies.rxHtml || "";
    if (!String(body).trim()) return "";
    return wrapReceitasDocumentHtml("Receituário — kit de alta", body);
  }

  /** Só .alta-page, CSS retrato (helper/testes e segundo job do kit). */
  function buildAltaKitPortraitHtml(ctx) {
    var bodies = resolveKitBodiesByOrientation(ctx);
    var body = bodies.portraitHtml || "";
    return wrapDocumentHtml("Kit de alta", body);
  }

  function buildAltaKitHtml(ctx) {
    var kitOverride = previewHtmlOverride(ctx, "kit");
    if (kitOverride) return wrapKitDocumentHtml("Kit de alta", kitOverride);
    var bodies = resolveKitBodiesByOrientation(ctx);
    return wrapKitDocumentHtml(
      "Kit de alta",
      (bodies.rxHtml || "") + (bodies.portraitHtml || ""),
    );
  }

  var PT_ONES = [
    "",
    "UM",
    "DOIS",
    "TRÊS",
    "QUATRO",
    "CINCO",
    "SEIS",
    "SETE",
    "OITO",
    "NOVE",
    "DEZ",
    "ONZE",
    "DOZE",
    "TREZE",
    "QUATORZE",
    "QUINZE",
    "DEZESSEIS",
    "DEZESSETE",
    "DEZOITO",
    "DEZENOVE",
  ];
  var PT_TENS = [
    "",
    "",
    "VINTE",
    "TRINTA",
    "QUARENTA",
    "CINQUENTA",
    "SESSENTA",
    "SETENTA",
    "OITENTA",
    "NOVENTA",
  ];

  function numberToWordsPt(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 0) return String(n);
    if (n < 20) return PT_ONES[n] || String(n);
    if (n < 100) {
      var tens = Math.floor(n / 10);
      var ones = n % 10;
      return PT_TENS[tens] + (ones ? " E " + PT_ONES[ones] : "");
    }
    return String(n);
  }

  function openPrintHtml(html, titleOrOptions) {
    var opts =
      titleOrOptions && typeof titleOrOptions === "object"
        ? titleOrOptions
        : { title: titleOrOptions };
    var receitaPrint = getReceitaPrint();
    if (receitaPrint && typeof receitaPrint.openPrintHtmlInIframe === "function") {
      return receitaPrint.openPrintHtmlInIframe(html, {
        title: opts.title || "Alta",
        autoPrint: opts.autoPrint,
        onAfterPrint: opts.onAfterPrint,
      });
    }
    if (typeof window === "undefined") {
      return { ok: true, html: html };
    }
    return { ok: false, error: "print_unavailable" };
  }

  function printOrientacoes(ctx) {
    var html = buildOrientacoesHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Orientações");
  }

  function printLaudo(ctx) {
    var html = buildLaudoHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Laudo médico");
  }

  function printAtestado(ctx) {
    var html = buildAtestadoHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Atestado médico");
  }

  function printAcompanhante(ctx) {
    var html = buildAcompanhanteHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Declaração de acompanhante");
  }

  function printLaudoPersonalizado(ctx) {
    var html = buildLaudoPersonalizadoHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Laudo personalizado");
  }

  function printRetorno(ctx) {
    var html = buildRetornoHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Cartão de retorno");
  }

  function getEncaminhamento() {
    if (typeof require !== "undefined") {
      try {
        return require("./alta-encaminhamento.js");
      } catch (_e) {}
    }
    return (
      (typeof globalThis !== "undefined" && globalThis.AghuAltaEncaminhamento) ||
      null
    );
  }

  function buildReferenciaHtml(ctx) {
    var enc = getEncaminhamento();
    if (!enc) return "";
    return enc.buildReferenciaHtml(ctx);
  }

  function buildContrarreferenciaHtml(ctx) {
    var enc = getEncaminhamento();
    if (!enc) return "";
    return enc.buildContrarreferenciaHtml(ctx);
  }

  function printReferencia(ctx) {
    var html = buildReferenciaHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Guia de Referência");
  }

  function printContrarreferencia(ctx) {
    var html = buildContrarreferenciaHtml(ctx);
    if (typeof window === "undefined") return { ok: true, html: html };
    return openPrintHtml(html, "Guia de Contrarreferência");
  }

  function printAltaKit(ctx) {
    var check = validateAltaKitContext(ctx);
    if (!check.ok) {
      return { ok: false, error: check.error || "Kit de alta incompleto." };
    }
    var html = buildAltaKitHtml(ctx);
    if (typeof window === "undefined") {
      return { ok: true, html: html };
    }
    var receitasHtml = buildAltaKitReceitasHtml(ctx);
    var portraitHtml = buildAltaKitPortraitHtml(ctx);
    if (!String(receitasHtml).trim()) {
      return openPrintHtml(portraitHtml, { title: "Kit de alta" });
    }
    return openPrintHtml(receitasHtml, {
      title: "Receituário — kit de alta",
      onAfterPrint: function () {
        openPrintHtml(portraitHtml, { title: "Kit de alta" });
      },
    });
  }

  return {
    escapeHtml: escapeHtml,
    formatBrDate: formatBrDate,
    buildOrientacoesHtml: buildOrientacoesHtml,
    buildLaudoHtml: buildLaudoHtml,
    buildAtestadoHtml: buildAtestadoHtml,
    buildAcompanhanteHtml: buildAcompanhanteHtml,
    buildLaudoPersonalizadoHtml: buildLaudoPersonalizadoHtml,
    buildRetornoHtml: buildRetornoHtml,
    buildReferenciaHtml: buildReferenciaHtml,
    buildContrarreferenciaHtml: buildContrarreferenciaHtml,
    addDaysIso: addDaysIso,
    resolveAcompanhanteTerminoIso: resolveAcompanhanteTerminoIso,
    formatAcompanhanteDatasClausula: formatAcompanhanteDatasClausula,
    formatAcompanhanteTotalizadorLabel: formatAcompanhanteTotalizadorLabel,
    validateAltaKitContext: validateAltaKitContext,
    splitKitBodyByOrientation: splitKitBodyByOrientation,
    buildAltaKitReceitasHtml: buildAltaKitReceitasHtml,
    buildAltaKitPortraitHtml: buildAltaKitPortraitHtml,
    buildAltaKitHtml: buildAltaKitHtml,
    printOrientacoes: printOrientacoes,
    printLaudo: printLaudo,
    printAtestado: printAtestado,
    printAcompanhante: printAcompanhante,
    printLaudoPersonalizado: printLaudoPersonalizado,
    printRetorno: printRetorno,
    printReferencia: printReferencia,
    printContrarreferencia: printContrarreferencia,
    printAltaKit: printAltaKit,
    numberToWordsPt: numberToWordsPt,
  };
});
