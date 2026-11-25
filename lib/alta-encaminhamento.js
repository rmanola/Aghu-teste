/**
 * FEAT-314 — Guia de Referência / Contrarreferência (schema + HTML print/preview).
 * Layout: docs/reference/modelos-impressao/alta/guia-referencia-hucam.pdf
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaEncaminhamento = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function getDefaults() {
    if (typeof require === "function") {
      try {
        return require("./alta-defaults.js");
      } catch (_e) {}
    }
    return (root && root.AghuAltaDefaults) || {};
  }

  function getAgeApi() {
    if (typeof require === "function") {
      try {
        return require("./age-from-dob.js");
      } catch (_e) {}
    }
    return (root && root.AghuAgeFromDob) || null;
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function isoToBr(iso) {
    var s = String(iso || "").trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function str(v) {
    return v != null ? String(v) : "";
  }

  function trimStr(v) {
    return str(v).trim();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function emptyReferencia() {
    var d = getDefaults();
    var now = Date.now();
    return {
      estabelecimentoSaude: d.DEFAULT_GUIA_ESTABELECIMENTO || "",
      cnes: d.DEFAULT_GUIA_CNES || "",
      encaminhadoPara: "",
      especialidadeOrigem: "",
      nomePaciente: "",
      sexo: "",
      nomeMae: "",
      telefone: "",
      cartaoSus: "",
      dataNascimento: "",
      idade: "",
      prontuarioHucam: "",
      cid: "",
      motivoEncaminhamento: "",
      examesTratamento: "",
      hipoteseDiagnostica: "",
      issuedAt: todayIso(),
      updatedAt: now,
    };
  }

  function emptyContrarreferencia() {
    var d = getDefaults();
    var now = Date.now();
    return {
      estabelecimentoSaude: d.DEFAULT_GUIA_ESTABELECIMENTO || "",
      cnes: d.DEFAULT_GUIA_CNES || "",
      retornoPara: "",
      especialidadeAtendimento: "",
      nomePaciente: "",
      sexo: "",
      nomeMae: "",
      telefone: "",
      cartaoSus: "",
      dataNascimento: "",
      idade: "",
      prontuarioHucam: "",
      cid: "",
      parecerConduta: "",
      examesTratamento: "",
      indicacaoRetorno: "",
      issuedAt: todayIso(),
      updatedAt: now,
    };
  }

  function normalizeReferencia(raw) {
    var base = emptyReferencia();
    if (!raw || typeof raw !== "object") return base;
    return {
      estabelecimentoSaude: str(raw.estabelecimentoSaude) || base.estabelecimentoSaude,
      cnes: str(raw.cnes) || base.cnes,
      encaminhadoPara: str(raw.encaminhadoPara),
      especialidadeOrigem: str(raw.especialidadeOrigem),
      nomePaciente: str(raw.nomePaciente),
      sexo: str(raw.sexo),
      nomeMae: str(raw.nomeMae),
      telefone: str(raw.telefone),
      cartaoSus: str(raw.cartaoSus),
      dataNascimento: str(raw.dataNascimento),
      idade: str(raw.idade),
      prontuarioHucam: str(raw.prontuarioHucam),
      cid: trimStr(raw.cid).toUpperCase(),
      motivoEncaminhamento: str(raw.motivoEncaminhamento),
      examesTratamento: str(raw.examesTratamento),
      hipoteseDiagnostica: str(raw.hipoteseDiagnostica),
      issuedAt: raw.issuedAt ? str(raw.issuedAt) : todayIso(),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function normalizeContrarreferencia(raw) {
    var base = emptyContrarreferencia();
    if (!raw || typeof raw !== "object") return base;
    return {
      estabelecimentoSaude: str(raw.estabelecimentoSaude) || base.estabelecimentoSaude,
      cnes: str(raw.cnes) || base.cnes,
      retornoPara: str(raw.retornoPara),
      especialidadeAtendimento: str(raw.especialidadeAtendimento),
      nomePaciente: str(raw.nomePaciente),
      sexo: str(raw.sexo),
      nomeMae: str(raw.nomeMae),
      telefone: str(raw.telefone),
      cartaoSus: str(raw.cartaoSus),
      dataNascimento: str(raw.dataNascimento),
      idade: str(raw.idade),
      prontuarioHucam: str(raw.prontuarioHucam),
      cid: trimStr(raw.cid).toUpperCase(),
      parecerConduta: str(raw.parecerConduta),
      examesTratamento: str(raw.examesTratamento),
      indicacaoRetorno: str(raw.indicacaoRetorno),
      issuedAt: raw.issuedAt ? str(raw.issuedAt) : todayIso(),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function referenciaHasContent(raw) {
    var r = normalizeReferencia(raw);
    return !!(trimStr(r.motivoEncaminhamento) || trimStr(r.encaminhadoPara));
  }

  function contrarreferenciaHasContent(raw) {
    var r = normalizeContrarreferencia(raw);
    return !!(trimStr(r.parecerConduta) || trimStr(r.indicacaoRetorno));
  }

  function patchReferencia(snap, patch) {
    var base = snap && typeof snap === "object" ? snap : {};
    var next = Object.assign({}, normalizeReferencia(base.referencia), patch || {});
    next.updatedAt = Date.now();
    return Object.assign({}, base, { referencia: normalizeReferencia(next) });
  }

  function patchContrarreferencia(snap, patch) {
    var base = snap && typeof snap === "object" ? snap : {};
    var next = Object.assign(
      {},
      normalizeContrarreferencia(base.contrarreferencia),
      patch || {},
    );
    next.updatedAt = Date.now();
    return Object.assign({}, base, {
      contrarreferencia: normalizeContrarreferencia(next),
    });
  }

  function fillEmpty(target, key, value) {
    if (!trimStr(value)) return false;
    if (trimStr(target[key])) return false;
    target[key] = value;
    return true;
  }

  function deriveIdade(dobIso, fallback) {
    var ageApi = getAgeApi();
    if (ageApi && typeof ageApi.ageYearsFromIsoDob === "function" && dobIso) {
      var y = ageApi.ageYearsFromIsoDob(dobIso);
      if (y != null && Number.isFinite(y)) return String(y);
    }
    return fallback || "";
  }

  function applyPiiToEncaminhamento(snap, patientRecord, options) {
    options = options || {};
    var fillEmptyOnly = options.fillEmptyOnly !== false;
    var base = snap && typeof snap === "object" ? snap : {};
    var ref = normalizeReferencia(base.referencia);
    var cr = normalizeContrarreferencia(base.contrarreferencia);
    var pii = patientRecord && typeof patientRecord === "object" ? patientRecord : {};
    var local = pii.demographicsLocal || {};
    var laudo = base.laudo || {};
    var changed = false;

    function applyId(target) {
      var nome = trimStr(pii.nomeCompleto || pii.primeiroNome || "");
      var sexo = trimStr(pii.sexo || "");
      var mae = trimStr(pii.nomeMae || "");
      var cns = trimStr(pii.cartaoSus || "");
      var dob = trimStr(pii.dataNascimentoISO || pii.dataNascimento || "");
      var tel = trimStr(local.telefone || local.celular || pii.telefone || "");
      var pront = trimStr(pii.prontuario || "");
      var idade = deriveIdade(dob, trimStr(pii.idade || ""));
      var cid = trimStr(laudo.cid10 || "");
      var hip = trimStr(laudo.diagnostico || "");
      var pairs = [
        ["nomePaciente", nome],
        ["sexo", sexo],
        ["nomeMae", mae],
        ["cartaoSus", cns],
        ["dataNascimento", dob],
        ["telefone", tel],
        ["prontuarioHucam", pront],
        ["idade", idade],
        ["cid", cid],
      ];
      for (var i = 0; i < pairs.length; i++) {
        if (fillEmptyOnly) {
          if (fillEmpty(target, pairs[i][0], pairs[i][1])) changed = true;
        } else if (pairs[i][1]) {
          target[pairs[i][0]] = pairs[i][1];
          changed = true;
        }
      }
      if (fillEmptyOnly) {
        if (fillEmpty(target, "hipoteseDiagnostica", hip)) changed = true;
      } else if (hip) {
        target.hipoteseDiagnostica = hip;
        changed = true;
      }
    }

    applyId(ref);
    applyId(cr);
    if (changed) {
      ref.updatedAt = Date.now();
      cr.updatedAt = Date.now();
    }
    return Object.assign({}, base, {
      referencia: normalizeReferencia(ref),
      contrarreferencia: normalizeContrarreferencia(cr),
    });
  }

  function guiaCss() {
    return (
      "@page{size:A4 portrait;margin:9mm;}" +
      "html,body{margin:0;padding:0;}" +
      "body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;background:#fff;}" +
      ".guia-page{width:100%;max-width:210mm;box-sizing:border-box;margin:0 auto;background:#fff;}" +
      ".guia-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px;}" +
      ".guia-header-banner{display:block;width:100%;height:auto;max-height:42pt;object-fit:contain;object-position:center;}" +
      ".guia-logo{height:32pt;width:auto;max-width:78pt;object-fit:contain;}" +
      ".guia-logo-right{height:30pt;max-width:56pt;}" +
      ".guia-header-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}" +
      ".guia-header-center{flex:1;text-align:center;font-size:8.5pt;line-height:1.3;font-weight:700;}" +
      ".guia-title{background:#d9d9d9;border:1px solid #000;text-align:center;font-weight:700;" +
      "padding:4px 6px;margin:4px 0 0;font-size:11pt;letter-spacing:0.02em;}" +
      ".guia-grid{border:1px solid #000;border-bottom:0;border-collapse:collapse;}" +
      ".guia-row{display:flex;width:100%;box-sizing:border-box;border-bottom:1px solid #000;}" +
      ".guia-cell{box-sizing:border-box;padding:3px 5px;border-right:1px solid #000;min-height:16pt;" +
      "display:flex;flex-direction:column;justify-content:flex-start;}" +
      ".guia-cell:last-child{border-right:0;}" +
      ".guia-label{font-weight:700;font-size:8pt;line-height:1.2;margin:0 0 1px;}" +
      ".guia-value{font-size:9pt;font-weight:400;text-transform:uppercase;white-space:pre-wrap;" +
      "word-break:break-word;line-height:1.25;min-height:1.1em;}" +
      ".guia-tall{min-height:52pt;}" +
      ".guia-tall .guia-value{min-height:40pt;flex:1;}" +
      ".w70{flex:0 0 70%;max-width:70%;}" +
      ".w30{flex:0 0 30%;max-width:30%;}" +
      ".w40{flex:0 0 40%;max-width:40%;}" +
      ".w60{flex:0 0 60%;max-width:60%;}" +
      ".w33{flex:0 0 33.333%;max-width:33.333%;}" +
      ".w67{flex:0 0 66.667%;max-width:66.667%;}" +
      ".w100{flex:1 1 100%;}" +
      ".guia-footer{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;" +
      "margin-top:12px;font-size:9pt;}" +
      ".guia-footer-date{flex:0 0 auto;}" +
      ".guia-sign{flex:1;text-align:left;}" +
      ".guia-sign-line{border-bottom:1px solid #000;margin-top:2pt;min-width:180pt;}" +
      ".guia-disclaimer{text-align:center;font-size:7.5pt;margin-top:10px;font-style:italic;}" +
      "@media screen{body{background:#dcdcdc;padding:12px;}" +
      ".guia-page{box-shadow:0 2px 10px rgba(0,0,0,.12);padding:8mm;}}"
    );
  }

  function cell(label, value, widthClass, tall) {
    return (
      '<div class="guia-cell ' +
      (widthClass || "w100") +
      (tall ? " guia-tall" : "") +
      '"><div class="guia-label">' +
      escapeHtml(label) +
      '</div><div class="guia-value">' +
      escapeHtml(value || "") +
      "</div></div>"
    );
  }

  function editableCell(label, fieldPath, value, widthClass, tall) {
    return (
      '<div class="guia-cell ' +
      (widthClass || "w100") +
      (tall ? " guia-tall" : "") +
      '"><div class="guia-label">' +
      escapeHtml(label) +
      '</div><div class="guia-value" contenteditable="true" data-alta-field="' +
      escapeHtml(fieldPath) +
      '">' +
      escapeHtml(value || "") +
      "</div></div>"
    );
  }

  function getReceitaBranding() {
    if (root && root.AghuReceitaPrintBranding) return root.AghuReceitaPrintBranding;
    if (typeof require === "function") {
      try {
        return require("./receita-print-branding.js");
      } catch (_e) {
        return {};
      }
    }
    return {};
  }

  function buildGuiaHeaderHtml() {
    var branding = getReceitaBranding();
    var banner = branding.GUIA_HEADER_BANNER_DATA_URI || "";
    if (banner) {
      return (
        '<div class="guia-header">' +
        '<img class="guia-header-banner" src="' +
        banner +
        '" alt="HUCAM — Ministério da Saúde — SUS">' +
        "</div>"
      );
    }
    var logo = branding.LOGO_DATA_URI || "";
    var ms = branding.MS_LOGO_DATA_URI || "";
    var sus = branding.SUS_LOGO_DATA_URI || "";
    var left = logo
      ? '<img class="guia-logo" src="' + logo + '" alt="' +
        escapeHtml(branding.LOGO_ALT || "HUCAM") +
        '">'
      : "<span></span>";
    var rightParts = [];
    if (ms) {
      rightParts.push(
        '<img class="guia-logo guia-logo-right" src="' +
          ms +
          '" alt="' +
          escapeHtml(branding.MS_LOGO_ALT || "Ministério da Saúde") +
          '">',
      );
    }
    if (sus) {
      rightParts.push(
        '<img class="guia-logo guia-logo-right" src="' +
          sus +
          '" alt="' +
          escapeHtml(branding.SUS_LOGO_ALT || "SUS") +
          '">',
      );
    }
    var right =
      rightParts.length > 0
        ? '<div class="guia-header-right">' + rightParts.join("") + "</div>"
        : left;
    return (
      '<div class="guia-header">' +
      left +
      '<div class="guia-header-center">MINISTÉRIO DA SAÚDE<br>SUS — Sistema Único de Saúde</div>' +
      right +
      "</div>"
    );
  }

  function buildGuiaFooterHtml(issuedAt) {
    var d = getDefaults();
    var disclaimer =
      d.DEFAULT_GUIA_DISCLAIMER ||
      '"O Serviço de Saúde prestado por esta Instituição é gratuito, vinculado ao Sistema Único de Saúde (SUS)".';
    var dateBr = isoToBr(issuedAt || todayIso());
    return (
      '<div class="guia-footer">' +
      '<div class="guia-footer-date">Data: ' +
      escapeHtml(dateBr) +
      "</div>" +
      '<div class="guia-sign">Assinatura e carimbo do profissional:<div class="guia-sign-line"></div></div>' +
      "</div>" +
      '<div class="guia-disclaimer">' +
      escapeHtml(disclaimer) +
      "</div>"
    );
  }

  function outCell(editable, prefix, label, field, value, widthClass, tall) {
    if (editable) {
      return editableCell(label, prefix + field, value, widthClass, tall);
    }
    return cell(label, value, widthClass, tall);
  }

  function buildReferenciaBody(r, editable) {
    var p = "referencia.";
    var c = function (label, field, value, width, tall) {
      return outCell(editable, p, label, field, value, width, tall);
    };
    return (
      '<div class="guia-row">' +
      c("1. Estabelecimento de Saúde:", "estabelecimentoSaude", r.estabelecimentoSaude, "w70") +
      c("2. CNES:", "cnes", r.cnes, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("3. Encaminhado Para:", "encaminhadoPara", r.encaminhadoPara, "w100") +
      "</div>" +
      '<div class="guia-row">' +
      c("4. Especialidade de Origem:", "especialidadeOrigem", r.especialidadeOrigem, "w100") +
      "</div>" +
      '<div class="guia-row">' +
      c("5. Nome do Paciente:", "nomePaciente", r.nomePaciente, "w70") +
      c("6. Sexo:", "sexo", r.sexo, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("7. Nome da Mãe:", "nomeMae", r.nomeMae, "w70") +
      c("8. Telefone:", "telefone", r.telefone, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("9. Cartão SUS:", "cartaoSus", r.cartaoSus, "w33") +
      c(
        "10. Data de Nascimento:",
        "dataNascimento",
        isoToBr(r.dataNascimento) || r.dataNascimento,
        "w33",
      ) +
      c("11. Idade:", "idade", r.idade, "w33") +
      "</div>" +
      '<div class="guia-row">' +
      c("12. Pront. HUCAM:", "prontuarioHucam", r.prontuarioHucam, "w40") +
      c("13. CID:", "cid", r.cid, "w60") +
      "</div>" +
      '<div class="guia-row">' +
      c(
        "14. Motivo do Encaminhamento (achados significativos da anamnese, exame físico, diagnóstico atual):",
        "motivoEncaminhamento",
        r.motivoEncaminhamento,
        "w100",
        true,
      ) +
      "</div>" +
      '<div class="guia-row">' +
      c(
        "15. Resultados de exames (com respectivas datas) / Tratamento realizado:",
        "examesTratamento",
        r.examesTratamento,
        "w100",
        true,
      ) +
      "</div>" +
      '<div class="guia-row">' +
      c("16. Hipótese Diagnóstica:", "hipoteseDiagnostica", r.hipoteseDiagnostica, "w100") +
      "</div>"
    );
  }

  function buildContrarreferenciaBody(r, editable) {
    var p = "contrarreferencia.";
    var c = function (label, field, value, width, tall) {
      return outCell(editable, p, label, field, value, width, tall);
    };
    return (
      '<div class="guia-row">' +
      c("1. Estabelecimento de Saúde:", "estabelecimentoSaude", r.estabelecimentoSaude, "w70") +
      c("2. CNES:", "cnes", r.cnes, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("3. Retorno Para:", "retornoPara", r.retornoPara, "w100") +
      "</div>" +
      '<div class="guia-row">' +
      c("4. Especialidade que atendeu:", "especialidadeAtendimento", r.especialidadeAtendimento, "w100") +
      "</div>" +
      '<div class="guia-row">' +
      c("5. Nome do Paciente:", "nomePaciente", r.nomePaciente, "w70") +
      c("6. Sexo:", "sexo", r.sexo, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("7. Nome da Mãe:", "nomeMae", r.nomeMae, "w70") +
      c("8. Telefone:", "telefone", r.telefone, "w30") +
      "</div>" +
      '<div class="guia-row">' +
      c("9. Cartão SUS:", "cartaoSus", r.cartaoSus, "w33") +
      c(
        "10. Data de Nascimento:",
        "dataNascimento",
        isoToBr(r.dataNascimento) || r.dataNascimento,
        "w33",
      ) +
      c("11. Idade:", "idade", r.idade, "w33") +
      "</div>" +
      '<div class="guia-row">' +
      c("12. Pront. HUCAM:", "prontuarioHucam", r.prontuarioHucam, "w40") +
      c("13. CID:", "cid", r.cid, "w60") +
      "</div>" +
      '<div class="guia-row">' +
      c("14. Parecer / Conduta do especialista:", "parecerConduta", r.parecerConduta, "w100", true) +
      "</div>" +
      '<div class="guia-row">' +
      c("15. Exames realizados / Tratamento instituído:", "examesTratamento", r.examesTratamento, "w100", true) +
      "</div>" +
      '<div class="guia-row">' +
      c("16. Indicação de retorno / Continuação do cuidado:", "indicacaoRetorno", r.indicacaoRetorno, "w100") +
      "</div>"
    );
  }

  function wrapGuiaDocument(titleBar, bodyInner, issuedAt) {
    return (
      "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">" +
      "<title>" +
      escapeHtml(titleBar) +
      "</title><style>" +
      guiaCss() +
      "</style></head><body>" +
      '<div class="guia-page">' +
      buildGuiaHeaderHtml() +
      '<div class="guia-title">' +
      escapeHtml(titleBar) +
      "</div>" +
      '<div class="guia-grid">' +
      bodyInner +
      "</div>" +
      buildGuiaFooterHtml(issuedAt) +
      "</div></body></html>"
    );
  }

  function extractBodyInner(html) {
    var m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(String(html || ""));
    return m ? m[1] : String(html || "");
  }

  /**
   * Reembrulha fragmento/HTML da Guia com guiaCss no head (print/iframe).
   * Override do Documento grava só .guia-page sem <style> — sem isto vira lista.
   */
  function wrapGuiaFragment(titleBar, htmlOrFragment) {
    var inner = extractBodyInner(htmlOrFragment);
    if (inner.indexOf("guia-page") === -1) {
      inner = '<div class="guia-page">' + inner + "</div>";
    }
    return (
      "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">" +
      "<title>" +
      escapeHtml(titleBar) +
      "</title><style>" +
      guiaCss() +
      "</style></head><body>" +
      inner +
      "</body></html>"
    );
  }

  function hasGuiaGridMarkup(html) {
    var s = String(html || "");
    return s.indexOf("guia-grid") !== -1 || s.indexOf("guia-page") !== -1;
  }

  function buildReferenciaHtml(ctx) {
    var r = normalizeReferencia(ctx && ctx.referencia);
    var override =
      ctx &&
      ctx.previewHtml &&
      typeof ctx.previewHtml.referencia === "string" &&
      ctx.previewHtml.referencia.trim()
        ? ctx.previewHtml.referencia
        : null;
    if (override && hasGuiaGridMarkup(override)) {
      return wrapGuiaFragment("Guia de Referência", override);
    }
    return wrapGuiaDocument("Guia de Referência", buildReferenciaBody(r, false), r.issuedAt);
  }

  function buildContrarreferenciaHtml(ctx) {
    var r = normalizeContrarreferencia(ctx && ctx.contrarreferencia);
    var override =
      ctx &&
      ctx.previewHtml &&
      typeof ctx.previewHtml.contrarreferencia === "string" &&
      ctx.previewHtml.contrarreferencia.trim()
        ? ctx.previewHtml.contrarreferencia
        : null;
    if (override && hasGuiaGridMarkup(override)) {
      return wrapGuiaFragment("Guia de Contrarreferência", override);
    }
    return wrapGuiaDocument(
      "Guia de Contrarreferência",
      buildContrarreferenciaBody(r, false),
      r.issuedAt,
    );
  }

  function buildReferenciaPreviewHtml(ctx) {
    var r = normalizeReferencia(ctx && ctx.referencia);
    return wrapGuiaDocument("Guia de Referência", buildReferenciaBody(r, true), r.issuedAt);
  }

  function buildContrarreferenciaPreviewHtml(ctx) {
    var r = normalizeContrarreferencia(ctx && ctx.contrarreferencia);
    return wrapGuiaDocument(
      "Guia de Contrarreferência",
      buildContrarreferenciaBody(r, true),
      r.issuedAt,
    );
  }

  return {
    emptyReferencia: emptyReferencia,
    emptyContrarreferencia: emptyContrarreferencia,
    normalizeReferencia: normalizeReferencia,
    normalizeContrarreferencia: normalizeContrarreferencia,
    referenciaHasContent: referenciaHasContent,
    contrarreferenciaHasContent: contrarreferenciaHasContent,
    patchReferencia: patchReferencia,
    patchContrarreferencia: patchContrarreferencia,
    applyPiiToEncaminhamento: applyPiiToEncaminhamento,
    buildReferenciaHtml: buildReferenciaHtml,
    buildContrarreferenciaHtml: buildContrarreferenciaHtml,
    buildReferenciaPreviewHtml: buildReferenciaPreviewHtml,
    buildContrarreferenciaPreviewHtml: buildContrarreferenciaPreviewHtml,
    extractBodyInner: extractBodyInner,
    wrapGuiaFragment: wrapGuiaFragment,
    guiaCss: guiaCss,
    isoToBr: isoToBr,
  };
});
