/**
 * HTML de pré-visualização editável dos documentos de alta HUCAM (retrato).
 * Regiões contenteditable mapeadas via data-alta-field → alta-preview-sync.js
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPreviewHtml = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SERIF_STACK = '"Times New Roman",Times,serif';
  var DOTTED_LINE =
    "_________________________________________";

  function getAltaPrint() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-print.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPrint;
  }

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

  function altaPrintApi() {
    return getAltaPrint() || {};
  }

  function escapeHtml(s) {
    var api = altaPrintApi();
    if (typeof api.escapeHtml === "function") return api.escapeHtml(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBrDate(input) {
    var api = altaPrintApi();
    if (typeof api.formatBrDate === "function") return api.formatBrDate(input);
    return String(input || "");
  }

  function numberToWordsPt(n) {
    var api = altaPrintApi();
    if (typeof api.numberToWordsPt === "function") return api.numberToWordsPt(n);
    return String(n);
  }

  function previewScreenCss() {
    return (
      "@media screen{" +
      "html,body{width:100%;background:#fff;}" +
      ".alta-page{width:100%;min-height:297mm;padding:6.06% 9.52%;margin:0;" +
      "box-sizing:border-box;background:#fff;}" +
      "body.alta-kit-preview{padding:0;margin:0;max-width:none;box-shadow:none;}" +
      ".alta-kit-preview .rx-page{height:194mm;min-height:194mm;width:100%;max-width:297mm;" +
      "margin:0 auto 12px;padding:0;box-sizing:border-box;background:#fff;}" +
      ".alta-kit-preview .rx-block,.alta-kit-preview .rx-half{height:100%;}" +
      ".alta-page[contenteditable=\"true\"]{outline:1px dashed rgba(0,80,160,.2);outline-offset:2px;}" +
      ".alta-page[contenteditable=\"true\"]:focus-within{outline:2px solid rgba(0,80,160,.45);}" +
      ".alta-editable[contenteditable=\"true\"],[data-rx-field].alta-editable{outline:1px dashed rgba(0,80,160,.35);outline-offset:2px;border-radius:2px;min-width:1ch;display:inline;}" +
      ".alta-editable[contenteditable=\"true\"]:focus,[data-rx-field].alta-editable:focus{outline:2px solid rgba(0,80,160,.55);background:rgba(0,80,160,.04);}" +
      ".alta-editable-empty,[data-rx-field].alta-editable-empty{color:rgba(0,0,0,.35);font-style:italic;display:inline-block;min-width:2ch;min-height:1.2em;vertical-align:baseline;}" +
      ".alta-editable-list-host{display:block;min-height:1.2em;}" +
      ".alta-orientacoes-list > li.alta-editable{display:list-item;}" +
      ".alta-item-num{user-select:none;}" +
      "}" +
      "@media print{.alta-editable{outline:none;background:transparent;}" +
      ".alta-page,.rx-page{padding:0;margin:0;width:auto;min-height:0;}}"
    );
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
      ".alta-page:last-child{page-break-after:auto;break-after:page;}" +
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
      ".alta-orientacoes-list > li.alta-editable{display:list-item;}" +
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
      previewScreenCss()
    );
  }

  /**
   * Overrides com especificidade #alta-documento-mount para vencer o preview
   * compacto de popup.css (logos ocultos, tipografia 8–12px) na janela standalone.
   * Usar junto com baseCss() — ver ensureDocumentoWindowFidelityCss no host.
   */
  function documentoWindowHostCss() {
    var p = "#alta-documento-mount .alta-preview-wrap";
    return (
      p +
      "{font-family:" +
      SERIF_STACK +
      ";font-size:13pt;line-height:1.65;color:#000;" +
      "padding:16px;background:#e8e8e8;}" +
      p +
      " .inst-logo-alta{display:block;}" +
      p +
      " .inst-line{font-size:10pt;line-height:1.4;}" +
      p +
      " .alta-patient," +
      p +
      " .alta-title{font-size:14pt;line-height:1.5;margin:0 0 16px;}" +
      p +
      " .alta-title{margin:0 0 20px;}" +
      p +
      " .alta-body{margin:0 0 20px;line-height:1.65;}" +
      p +
      " .alta-orientacoes-list{margin:0 0 14px 24px;}" +
      p +
      " .alta-orientacoes-list > li{margin:0 0 8px;}" +
      p +
      " .alta-paragraph{margin:0 0 14px;line-height:1.65;}" +
      p +
      " .alta-cid{margin-top:14px;line-height:1.65;}" +
      p +
      " .alta-sign{margin-top:28px;line-height:1.5;}" +
      p +
      " .alta-dotted{margin:0 0 6px;}" +
      p +
      " .alta-retorno-row{margin:0 0 12px;line-height:1.65;}" +
      p +
      " .alta-retorno-section{margin:18px 0 12px;}" +
      p +
      " .alta-service-footer{margin-top:auto;padding-top:20px;font-size:13pt;line-height:1.55;}" +
      /* Retrato (alta): header alto — NÃO aplicar a .rx-page */
      p +
      " .alta-page .inst-header{min-height:120pt;margin:0 0 10px;padding-bottom:6px;}" +
      p +
      " .alta-page{max-width:210mm;width:100%;margin:0 auto;background:#fff;" +
      "display:flex;flex-direction:column;min-height:calc(297mm - 36mm);" +
      "box-sizing:border-box;}" +
      p +
      " .alta-page-main{flex:1 1 auto;min-height:0;}" +
      /* Receituário (FEAT-312): vias lado a lado + header compacto */
      p +
      ".alta-kit-preview .rx-page{height:194mm;min-height:194mm;width:100%;max-width:297mm;" +
      "margin:0 auto 12px;padding:0;box-sizing:border-box;background:#fff;}" +
      p +
      ".alta-kit-preview .rx-block," +
      p +
      ".alta-kit-preview .rx-half{height:100%;}" +
      p +
      " .rx-page .inst-header{min-height:78pt;height:78pt;overflow:hidden;" +
      "margin:0 0 3px;padding-bottom:0;border-bottom:none;}" +
      /* Posologia/data: chrome editável sem parecer «pílula» */
      p +
      " .rx-posology .alta-editable," +
      p +
      " .rx-posology [data-rx-field]," +
      p +
      " .rx-date .alta-editable," +
      p +
      " .rx-date [data-rx-field]{" +
      "outline:none;border-radius:0;display:inline;min-width:1ch;" +
      "border-bottom:1px dotted rgba(0,0,0,.35);background:transparent;}" +
      p +
      " .rx-posology .alta-editable:focus," +
      p +
      " .rx-posology [data-rx-field]:focus," +
      p +
      " .rx-date .alta-editable:focus," +
      p +
      " .rx-date [data-rx-field]:focus{" +
      "outline:1px solid rgba(0,80,160,.45);background:rgba(0,80,160,.04);}" +
      p +
      " .rx-posology .alta-editable-empty," +
      p +
      " .rx-date .alta-editable-empty{" +
      "color:rgba(0,0,0,.35);font-style:italic;border-radius:0;}"
    );
  }

  /** Host CSS da janela Documento para Guia Referência/Contrarreferência (sans + página branca). */
  function documentoGuiaHostCss() {
    var p = "#alta-documento-mount .alta-preview-wrap";
    return (
      p +
      "{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.25;color:#000;" +
      "padding:12px;background:#dcdcdc;}" +
      p +
      " .guia-page{max-width:210mm;width:100%;margin:0 auto;background:#fff;" +
      "box-sizing:border-box;padding:8mm;box-shadow:0 2px 10px rgba(0,0,0,.12);}" +
      p +
      " .guia-logo,.guia-header-banner{display:block;}" +
      p +
      " .guia-value[contenteditable]," +
      p +
      " [data-alta-field]{outline:1px dashed rgba(0,80,160,.35);outline-offset:1px;min-height:1em;}"
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

  function wrapKitDocumentHtml(title, body) {
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      '</title><style>' +
      kitBaseCss() +
      "</style></head><body class=\"alta-kit-preview\">" +
      body +
      "</body></html>"
    );
  }

  function extractBodyInner(html) {
    return html.replace(/^[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*$/, "");
  }

  function editableSpan(fieldPath, text, className) {
    var cls = "alta-editable";
    if (className) cls += " " + className;
    var display = text == null ? "" : String(text);
    var isEmpty = !display.trim();
    if (isEmpty) cls += " alta-editable-empty";
    return (
      '<span data-alta-field="' +
      escapeHtml(fieldPath) +
      '" class="' +
      cls +
      '">' +
      (isEmpty ? "\u00a0" : escapeHtml(display)) +
      "</span>"
    );
  }

  function editableOrientacaoItem(index, text) {
    var fieldPath = "orientacoes.items." + index;
    var cls = "alta-editable";
    var display = text == null ? "" : String(text);
    var isEmpty = !display.trim();
    if (isEmpty) cls += " alta-editable-empty";
    return (
      '<li data-alta-field="' +
      escapeHtml(fieldPath) +
      '" class="' +
      cls +
      '">' +
      (isEmpty ? "\u00a0" : escapeHtml(display)) +
      "</li>"
    );
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

  function buildSignatureBlock() {
    return (
      '<div class="alta-sign">' +
      '<div class="alta-dotted">' +
      DOTTED_LINE +
      "</div>" +
      "<div>Médico Assistente</div>" +
      "</div>"
    );
  }

  function buildAltaPageOpen(ctx) {
    return (
      '<section class="alta-page" contenteditable="true">' +
      buildAltaInstitutionHeader(getBranding()) +
      buildAltaPatientLine(ctx) +
      '<div class="alta-page-main">'
    );
  }

  function buildAltaPageClose(ctx) {
    return buildSignatureBlock() + buildAltaServiceFooter(ctx) + "</section>";
  }

  function buildRetornoPageOpen(ctx) {
    return (
      '<section class="alta-page" contenteditable="true">' +
      buildAltaInstitutionHeader(getBranding()) +
      '<div class="alta-page-main">'
    );
  }

  function buildRetornoRowPreview(label, fieldPath, value, options) {
    options = options || {};
    var text = value == null ? "" : String(value);
    if (!options.multiline) text = text.trim();
    var valueClass = "alta-retorno-value";
    if (options.multiline) {
      valueClass += " alta-retorno-value-multiline";
    }
    if (options.underlineValue && text.trim()) {
      valueClass += " alta-retorno-value-underline";
    }
    return (
      '<div class="alta-retorno-row">' +
      '<span class="alta-retorno-label">' +
      escapeHtml(label) +
      "</span> " +
      editableSpan(fieldPath, text, valueClass) +
      "</div>"
    );
  }

  function resolveLaudoProcedimentosForPreview(laudo) {
    laudo = laudo || {};
    var ap = getAltaProcedimentos();
    var list =
      ap && typeof ap.resolveProcedimentosFromLaudo === "function"
        ? ap.resolveProcedimentosFromLaudo(laudo)
        : [];
    if (!list.length) {
      list = [
        {
          descricao: laudo.procedimento || "",
          data: laudo.dataProcedimento || "",
        },
      ];
    }
    return list;
  }

  function buildOrientacoesPreviewHtml(ctx) {
    var orientacoes = (ctx && ctx.orientacoes) || {};
    var items = Array.isArray(orientacoes.items) ? orientacoes.items : [];
    if (!items.length) items = [""];
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-body">';
    body += '<ol class="alta-orientacoes-list">';
    for (var i = 0; i < items.length; i++) {
      body += editableOrientacaoItem(i, items[i]);
    }
    body += "</ol>";
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Orientações — pré-visualização", body);
  }

  function buildLaudoPreviewHtml(ctx) {
    var laudo = (ctx && ctx.laudo) || {};
    var procedimentos = resolveLaudoProcedimentosForPreview(laudo);
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">LAUDO MÉDICO</div>';
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph">';
    body +=
      "DECLARO PARA OS DEVIDOS FINS QUE, PACIENTE ACIMA CITADO FORA INTERNADO NO HUCAM NO DIA ";
    body += editableSpan(
      "laudo.dataInternacao",
      laudo.dataInternacao ? formatBrDate(laudo.dataInternacao) : "",
    );
    body += " NO SETOR DE CIRURGIA GERAL COM DIAGNÓSTICO DE ";
    body += editableSpan(
      "laudo.diagnostico",
      laudo.diagnostico ? String(laudo.diagnostico).toUpperCase() : "",
    );
    body += ". ";
    body += "FOI SUBMETIDO(A) A ";
    for (var pi = 0; pi < procedimentos.length; pi++) {
      if (pi > 0) body += " E ";
      body += editableSpan(
        "laudo.procedimentos." + pi + ".descricao",
        procedimentos[pi].descricao
          ? String(procedimentos[pi].descricao).toUpperCase()
          : "",
      );
      body += " EM ";
      body += editableSpan(
        "laudo.procedimentos." + pi + ".data",
        procedimentos[pi].data ? formatBrDate(procedimentos[pi].data) : "",
      );
    }
    if (laudo.semIntercorrencias !== false) {
      body += ", SEM INTERCORRÊNCIAS.";
    } else {
      body += ".";
    }
    body += " ";
    body += editableSpan(
      "laudo.evolucao",
      laudo.evolucao ? String(laudo.evolucao).toUpperCase() : "",
    );
    body += "</div>";
    body +=
      '<div class="alta-cid"><strong>CID-10:</strong> ' +
      editableSpan("laudo.cid10", laudo.cid10 || "") +
      "</div>";
    if (laudo.divulgacaoCidAutorizada) {
      body +=
        '<div class="alta-paragraph">DIVULGAÇÃO DE CID AUTORIZADO PELO PACIENTE</div>';
    }
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Laudo médico — pré-visualização", body);
  }

  function buildAtestadoPreviewHtml(ctx) {
    var atestado = (ctx && ctx.atestado) || {};
    var laudo = (ctx && ctx.laudo) || {};
    var ap = getAltaProcedimentos();
    var dias = atestado.diasAfastamento || 15;
    var procText = atestado.procedimento || "";
    if (ap && typeof ap.resolveProcedimentosFromLaudo === "function") {
      var procs = ap.resolveProcedimentosFromLaudo(laudo);
      if (procs.length && typeof ap.formatAtestadoProcedimentos === "function") {
        procText = ap.formatAtestadoProcedimentos(procs) || procText;
      }
    }
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">ATESTADO MÉDICO</div>';
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph">';
    body += "ATESTO QUE O PACIENTE SUPRACITADO ESTEVE INTERNADO PARA REALIZAÇÃO DE ";
    body +=
      '<span class="alta-retorno-value">' +
      escapeHtml(procText ? String(procText).toUpperCase() : "") +
      "</span>";
    body += " NESTE SERVIÇO E NECESSITA DE ";
    body += editableSpan("atestado.diasAfastamento", String(dias));
    body += " (" + escapeHtml(numberToWordsPt(dias)) + ") DIAS DE AFASTAMENTO DAS SUAS ATIVIDADES";
    body += " A PARTIR DE ";
    body += editableSpan(
      "atestado.dataInicioAfastamento",
      atestado.dataInicioAfastamento
        ? formatBrDate(atestado.dataInicioAfastamento)
        : "",
    );
    body += " (DATA DA INTERNAÇÃO).";
    body += "</div>";
    body +=
      '<div class="alta-cid"><strong>CID-10:</strong> ' +
      editableSpan("atestado.cid10", atestado.cid10 || "") +
      "</div>";
    if (atestado.divulgacaoCidAutorizada) {
      body +=
        '<div class="alta-paragraph">DIVULGAÇÃO DE CID AUTORIZADO PELO PACIENTE.</div>';
    }
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Atestado médico — pré-visualização", body);
  }

  function buildAcompanhantePreviewHtml(ctx) {
    var acompanhante = (ctx && ctx.acompanhante) || {};
    var altaPrint = altaPrintApi();
    var datasInfo =
      altaPrint && typeof altaPrint.formatAcompanhanteDatasClausula === "function"
        ? altaPrint.formatAcompanhanteDatasClausula(acompanhante)
        : { modo: "none", dias: 15, inicioBr: "", terminoBr: "" };
    var dias = datasInfo.dias;
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title">DECLARAÇÃO DE ACOMPANHANTE</div>';
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph">';
    body += "DECLARO, PARA OS DEVIDOS FINS, QUE ";
    body += editableSpan(
      "acompanhante.nomeAcompanhante",
      acompanhante.nomeAcompanhante || "",
    );
    body +=
      " ACOMPANHOU O(A) PACIENTE SUPRACITADO(A) DURANTE SUA INTERNAÇÃO NESTE HOSPITAL";
    if (datasInfo.modo === "unico" && datasInfo.inicioBr) {
      body += ", NO DIA ";
      body += editableSpan(
        "acompanhante.dataInicio",
        datasInfo.inicioBr,
      );
    } else if (datasInfo.modo === "intervalo" && datasInfo.inicioBr && datasInfo.terminoBr) {
      body += ", ENTRE OS DIAS ";
      body += editableSpan(
        "acompanhante.dataInicio",
        datasInfo.inicioBr,
      );
      body += " E ";
      body +=
        '<span class="alta-retorno-value">' +
        escapeHtml(datasInfo.terminoBr) +
        "</span>";
    }
    body += ", TOTALIZANDO ";
    body += editableSpan("acompanhante.diasDeclaracao", String(dias));
    body += " (" + escapeHtml(numberToWordsPt(dias)) + ") ";
    body += dias === 1 ? "DIA" : "DIAS";
    body +=
      ", PARA COMPROVAÇÃO JUNTO AO EMPREGADOR E DEMAIS ÓRGÃOS COMPETENTES.";
    body += "</div>";
    body +=
      '<div class="alta-cid"><strong>CID-10:</strong> ' +
      editableSpan("acompanhante.cid10", acompanhante.cid10 || "Z76.3") +
      "</div>";
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Declaração de acompanhante — pré-visualização", body);
  }

  function buildLaudoPersonalizadoPreviewHtml(ctx) {
    var lp = (ctx && ctx.laudoPersonalizado) || {};
    var body = buildAltaPageOpen(ctx);
    body += '<div class="alta-title alta-title-as-written">';
    body += editableSpan("laudoPersonalizado.titulo", lp.titulo || "");
    body += "</div>";
    body += '<div class="alta-body">';
    body += '<div class="alta-paragraph alta-paragraph-multiline">';
    body += editableSpan(
      "laudoPersonalizado.corpo",
      lp.corpo || "",
      "alta-retorno-value-multiline",
    );
    body += "</div>";
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Laudo personalizado — pré-visualização", body);
  }

  function buildRetornoPreviewHtml(ctx) {
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
    body +=
      '<div class="alta-retorno-row"><span class="alta-retorno-label">NOME:</span> <span class="alta-retorno-value">' +
      escapeHtml(String(nome).toUpperCase()) +
      "</span></div>";
    body +=
      '<div class="alta-retorno-row"><span class="alta-retorno-label">Nº DO PRONTUÁRIO:</span> <span class="alta-retorno-value">' +
      escapeHtml(String(prontuario)) +
      "</span></div>";
    body += buildRetornoRowPreview(
      "DIAGNÓSTICO:",
      "retorno.diagnostico",
      retorno.diagnostico ? String(retorno.diagnostico).toUpperCase() : "",
    );
    for (var a = 0; a < atos.length; a++) {
      var ato = atos[a];
      var dataDisplay = ato.data ? String(ato.data) : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataDisplay)) {
        dataDisplay = formatBrDate(dataDisplay);
      }
      body += '<div class="alta-retorno-ato-block">';
      body += buildRetornoRowPreview(
        "ATO:",
        "retorno.atos." + a + ".descricao",
        ato.descricao ? String(ato.descricao).toUpperCase() : "",
      );
      body += buildRetornoRowPreview(
        "DATA DA CIRURGIA:",
        "retorno.atos." + a + ".data",
        dataDisplay,
      );
      body += buildRetornoRowPreview(
        "STAFF:",
        "retorno.equipes." + a + ".staff",
        ato.staff || "",
        {
          underlineValue: true,
        },
      );
      var auxList = Array.isArray(ato.auxiliares) ? ato.auxiliares : [];
      for (var x = 0; x < auxList.length; x++) {
        var auxName = String(auxList[x] || "").trim();
        if (!auxName) continue;
        var auxLabel =
          ap && typeof ap.formatAuxiliarLabel === "function"
            ? ap.formatAuxiliarLabel(x)
            : String(x + 1) + "º AUXILIAR:";
        body += buildRetornoRowPreview(
          auxLabel,
          "retorno.equipes." + a + ".auxiliares." + x,
          auxName,
        );
      }
      body += "</div>";
    }
    body += '<div class="alta-retorno-section">RETORNO AMBULATORIAL</div>';
    body += buildRetornoRowPreview("LOCAL:", "retorno.localRetorno", retorno.localRetorno || "");
    body += buildRetornoRowPreview(
      "DATA/HORA:",
      "retorno.dataHoraRetorno",
      retorno.dataHoraRetorno || "",
    );
    body += buildRetornoRowPreview("MÉDICO:", "retorno.medicoRetorno", retorno.medicoRetorno || "");
    body += "</div></div>";
    body += buildAltaPageClose(ctx);
    return wrapDocumentHtml("Cartão de retorno — pré-visualização", body);
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
    var altaPrint = getAltaPrint();
    if (altaPrint && typeof altaPrint.validateAltaKitContext === "function") {
      return altaPrint.validateAltaKitContext(ctx);
    }
    return { ok: true };
  }

  var PREVIEW_DOC_TITLES = {
    orientacoes: "Orientações — pré-visualização",
    laudo: "Laudo médico — pré-visualização",
    laudoPersonalizado: "Laudo personalizado — pré-visualização",
    atestado: "Atestado médico — pré-visualização",
    acompanhante: "Declaração de acompanhante — pré-visualização",
    retorno: "Cartão de retorno — pré-visualização",
    referencia: "Guia de Referência — pré-visualização",
    contrarreferencia: "Guia de Contrarreferência — pré-visualização",
  };

  function buildReceituarioDocPreviewBody(ctx, docIndex) {
    var docs = collectKitReceitaDocs(ctx);
    var doc = docs[docIndex];
    if (!doc) {
      return (
        '<div class="alta-receituario-preview" data-receituario-doc-id=""></div>'
      );
    }
    var docId =
      doc.id && String(doc.id).trim() ? String(doc.id).trim() : String(docIndex);
    var parts = [];
    var receitaPrint = getReceitaPrint();
    var docLines = (doc && doc.lines) || [];
    if (receitaPrint && docHasSimpleMedicationLines(docLines)) {
      parts.push(
        extractBodyInner(
          receitaPrint.buildSimplePrescriptionHtml({
            patient: resolveKitPrintPatient(ctx, doc),
            lines: docLines,
            printDate: ctx.printDate,
            previewEditable: true,
            docIndex: docIndex,
          }),
        ),
      );
    }
    if (receitaPrint && docHasAnvisaSpecialMedicationLines(docLines)) {
      parts.push(
        extractBodyInner(
          receitaPrint.buildSpecialPrescriptionHtml({
            patient: resolveKitPrintPatient(ctx, doc),
            lines: docLines,
            patientAddress: resolveKitPatientAddress(ctx, doc),
            printDate: ctx.printDate,
            previewEditable: true,
            docIndex: docIndex,
          }),
        ),
      );
    }
    return (
      '<div class="alta-receituario-preview" data-receituario-doc-id="' +
      escapeHtml(docId) +
      '">' +
      parts.join("") +
      "</div>"
    );
  }

  function buildReceituarioDocPreviewHtml(ctx, docIndex) {
    return wrapKitDocumentHtml(
      "Receituário — pré-visualização",
      buildReceituarioDocPreviewBody(ctx, docIndex),
    );
  }

  function resolveReceituarioDocIndex(ctx, docId) {
    var docs = collectKitReceitaDocs(ctx);
    if (!docId) return docs.length ? 0 : -1;
    for (var i = 0; i < docs.length; i++) {
      if (docs[i] && docs[i].id === docId) return i;
    }
    return docs.length === 1 ? 0 : -1;
  }

  function resolveReceituarioDocPreviewHtml(ctx, docId, overrideBody) {
    var body = overrideBody;
    if (body && String(body).trim()) {
      return wrapKitDocumentHtml(
        "Receituário — pré-visualização",
        String(body).trim(),
      );
    }
    var docIndex = resolveReceituarioDocIndex(ctx, docId);
    if (docIndex >= 0) {
      return buildReceituarioDocPreviewHtml(ctx, docIndex);
    }
    return wrapKitDocumentHtml("Receituário — pré-visualização", "");
  }

  function resolveDocumentPreviewHtml(kind, ctx, overrideBody) {
    var isGuia = kind === "referencia" || kind === "contrarreferencia";
    var enc = null;
    if (isGuia) {
      enc =
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
    }

    var body = overrideBody;
    var schema = getAltaSchema();
    if (body && schema && typeof schema.sanitizePreviewHtmlSection === "function") {
      body = schema.sanitizePreviewHtmlSection(kind, body);
    }

    // Guia: nunca wrapDocumentHtml (Times/.alta-page). Override legado sem grade → regenerar.
    if (isGuia) {
      if (!enc) return "";
      var guiaOverride = body && String(body).trim() ? String(body).trim() : "";
      var hasGrid =
        !!guiaOverride &&
        (guiaOverride.indexOf("guia-grid") !== -1 ||
          guiaOverride.indexOf("guia-page") !== -1);
      if (hasGrid) {
        var titleBar =
          kind === "referencia" ? "Guia de Referência" : "Guia de Contrarreferência";
        var inner = enc.extractBodyInner
          ? enc.extractBodyInner(guiaOverride)
          : guiaOverride;
        // Se o fragmento já é .guia-page completo, não duplicar.
        if (inner.indexOf("guia-page") === -1) {
          inner = '<div class="guia-page">' + inner + "</div>";
        }
        return (
          "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">" +
          "<title>" +
          escapeHtml(titleBar) +
          "</title><style>" +
          (typeof enc.guiaCss === "function" ? enc.guiaCss() : "") +
          "</style></head><body>" +
          inner +
          "</body></html>"
        );
      }
      if (kind === "referencia") return enc.buildReferenciaPreviewHtml(ctx);
      return enc.buildContrarreferenciaPreviewHtml(ctx);
    }

    if (body && String(body).trim()) {
      var title = PREVIEW_DOC_TITLES[kind] || "Documento — pré-visualização";
      return wrapDocumentHtml(title, body);
    }
    if (kind === "orientacoes") return buildOrientacoesPreviewHtml(ctx);
    if (kind === "laudo") return buildLaudoPreviewHtml(ctx);
    if (kind === "laudoPersonalizado") return buildLaudoPersonalizadoPreviewHtml(ctx);
    if (kind === "atestado") return buildAtestadoPreviewHtml(ctx);
    if (kind === "acompanhante") return buildAcompanhantePreviewHtml(ctx);
    if (kind === "retorno") return buildRetornoPreviewHtml(ctx);
    return "";
  }

  function buildAltaKitPreviewHtml(ctx) {
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
                previewEditable: true,
                docIndex: d,
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
                previewEditable: true,
                docIndex: d,
              }),
            ),
          );
        }
      }
    }
    parts.push(extractBodyInner(buildOrientacoesPreviewHtml(ctx)));
    parts.push(extractBodyInner(buildLaudoPreviewHtml(ctx)));
    var schema = getAltaSchema();
    if (schema && typeof schema.laudoPersonalizadoHasContent === "function") {
      if (schema.laudoPersonalizadoHasContent(ctx && ctx.laudoPersonalizado)) {
        parts.push(extractBodyInner(buildLaudoPersonalizadoPreviewHtml(ctx)));
      }
    } else if (
      ctx &&
      ctx.laudoPersonalizado &&
      (ctx.laudoPersonalizado.titulo || ctx.laudoPersonalizado.corpo)
    ) {
      parts.push(extractBodyInner(buildLaudoPersonalizadoPreviewHtml(ctx)));
    }
    parts.push(extractBodyInner(buildAtestadoPreviewHtml(ctx)));
    if (schema && typeof schema.acompanhanteHasContent === "function") {
      if (schema.acompanhanteHasContent(ctx && ctx.acompanhante)) {
        parts.push(extractBodyInner(buildAcompanhantePreviewHtml(ctx)));
      }
    } else if (ctx && ctx.acompanhante && ctx.acompanhante.nomeAcompanhante) {
      parts.push(extractBodyInner(buildAcompanhantePreviewHtml(ctx)));
    }
    if (schema && typeof schema.retornoHasContent === "function") {
      if (schema.retornoHasContent(ctx && ctx.retorno)) {
        parts.push(extractBodyInner(buildRetornoPreviewHtml(ctx)));
      }
    } else if (ctx && ctx.retorno) {
      parts.push(extractBodyInner(buildRetornoPreviewHtml(ctx)));
    }
    var encKit =
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
    if (encKit) {
      if (
        schema && typeof schema.referenciaHasContent === "function"
          ? schema.referenciaHasContent(ctx && ctx.referencia)
          : encKit.referenciaHasContent(ctx && ctx.referencia)
      ) {
        parts.push(extractBodyInner(encKit.buildReferenciaPreviewHtml(ctx)));
      }
      if (
        schema && typeof schema.contrarreferenciaHasContent === "function"
          ? schema.contrarreferenciaHasContent(ctx && ctx.contrarreferencia)
          : encKit.contrarreferenciaHasContent(ctx && ctx.contrarreferencia)
      ) {
        parts.push(
          extractBodyInner(encKit.buildContrarreferenciaPreviewHtml(ctx)),
        );
      }
    }
    return wrapKitDocumentHtml("Kit de alta — pré-visualização", parts.join(""));
  }

  return {
    previewScreenCss: previewScreenCss,
    baseCss: baseCss,
    documentoWindowHostCss: documentoWindowHostCss,
    documentoGuiaHostCss: documentoGuiaHostCss,
    buildOrientacoesPreviewHtml: buildOrientacoesPreviewHtml,
    buildLaudoPreviewHtml: buildLaudoPreviewHtml,
    buildAtestadoPreviewHtml: buildAtestadoPreviewHtml,
    buildAcompanhantePreviewHtml: buildAcompanhantePreviewHtml,
    buildLaudoPersonalizadoPreviewHtml: buildLaudoPersonalizadoPreviewHtml,
    buildRetornoPreviewHtml: buildRetornoPreviewHtml,
    buildAltaKitPreviewHtml: buildAltaKitPreviewHtml,
    buildReceituarioDocPreviewHtml: buildReceituarioDocPreviewHtml,
    resolveReceituarioDocPreviewHtml: resolveReceituarioDocPreviewHtml,
    resolveDocumentPreviewHtml: resolveDocumentPreviewHtml,
    validateAltaKitContext: validateAltaKitContext,
  };
});
