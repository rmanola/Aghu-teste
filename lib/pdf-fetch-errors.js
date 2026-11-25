/**
 * Rótulos de falha e aplicação de resultado de fetch PDF/detalhe.
 * Expõe `window.AghuPdfFetchErrors`.
 */
(function () {
  "use strict";

  var REASON_LABELS = {
    no_text_extracted: "PDF sem texto (escaneado?)",
    extract_timeout: "Timeout na extração do PDF",
    wait_timeout: "Timeout aguardando PDF",
    extract_exception: "Erro ao ler PDF",
    not_pdf_signature: "Resposta não é PDF",
    response_too_small: "Resposta inválida",
    pdf_result_error: "Falha ao extrair PDF",
    network_filter_error: "Erro de rede ao capturar PDF",
    filter_create_error: "Não foi possível interceptar o PDF",
    no_checkbox: "Checkbox indisponível na linha",
    partial_batch_selection: "Seleção parcial no lote (alguns checkboxes não encontrados)",
    result_button_disabled: "Botão Resultado desabilitado",
    batch_no_block: "Bloco não encontrado no PDF em lote",
    send_message_error: "Erro ao comunicar com a página",
    no_attach_link: "Ícone de anexo indisponível na linha",
    gasometry_incomplete: "Laudo incompleto — tente Buscar PDFs novamente",
  };

  function reasonToHint(reason) {
    if (!reason) return "";
    return REASON_LABELS[reason] || reason;
  }

  function isEasExam(exam) {
    var lab = getLabParse();
    return !!(lab && lab.isEasExamName && lab.isEasExamName(exam && exam.examName));
  }

  function isGasometryExam(exam) {
    return String((exam && exam.examName) || "")
      .toUpperCase()
      .includes("GASOMETRIA");
  }

  function getGasometryDeps() {
    var sig =
      (typeof globalThis !== "undefined" && globalThis.AghuExamSiglas) ||
      (typeof window !== "undefined" && window.AghuExamSiglas);
    return sig ? { siglas: sig } : undefined;
  }

  function getLabParse() {
    return (
      (typeof globalThis !== "undefined" && globalThis.AghuPdfLabParse) ||
      (typeof window !== "undefined" && window.AghuPdfLabParse) ||
      null
    );
  }

  function isGasometryFetchedResultIncomplete(text) {
    var lab = getLabParse();
    if (lab && lab.isGasometryFetchedResultIncomplete) {
      return lab.isGasometryFetchedResultIncomplete(text);
    }
    return !String(text || "").trim();
  }

  function hasValidFetchedSubitems(text) {
    var lab = getLabParse();
    if (lab && lab.countPdfSubitems) {
      return lab.countPdfSubitems(text) >= 1;
    }
    return (
      String(text || "")
        .split(/\r?\n/)
        .map(function (l) {
          return l.trim();
        })
        .filter(Boolean).length >= 1
    );
  }

  function isExternalAttachmentExam(exam) {
    if (exam && exam.hasAttachment) return true;
    var lab = getLabParse();
    return !!(lab && lab.isExternalLabExamName && lab.isExternalLabExamName(exam && exam.examName));
  }

  function shouldClearGridResultAfterPdf(exam, fetchedResult) {
    if (!hasValidFetchedSubitems(fetchedResult)) return false;
    if (isGasometryExam(exam)) {
      return !isGasometryFetchedResultIncomplete(fetchedResult);
    }
    if (isExternalAttachmentExam(exam)) {
      var lab = getLabParse();
      if (lab && lab.looksLikeExternalLabBoilerplate) {
        if (lab.looksLikeExternalLabBoilerplate(fetchedResult)) return false;
      }
    }
    return true;
  }

  function reparseGasometryExam(exam, parsers) {
    var lab = getLabParse();
    if (!lab || !lab.reparseGasometryFromDetail) return false;
    var parsePdfText =
      (parsers && parsers.parsePdfText) ||
      lab.parsePdfText ||
      function (t) {
        return t || "";
      };
    return lab.reparseGasometryFromDetail(exam, parsePdfText, getGasometryDeps());
  }

  /**
   * @param {object} exam — linha mutável
   * @param {object|null} result — retorno do content-script
   * @param {{ parsePdfText?: function, parseDetailText?: function }} parsers
   */
  function applyFetchResult(exam, result, parsers) {
    exam.fetchHint = "";
    exam.fetchReason = "";
    if (!result) return;

    var parsePdfText =
      (parsers && parsers.parsePdfText) ||
      function (t) {
        return t || "";
      };
    var parseDetailText =
      (parsers && parsers.parseDetailText) ||
      function (t) {
        return t || "";
      };

    if (result.success) {
      var raw = result.text || "";
      exam.aiOrganized = "";
      exam.detailText = raw;
      exam.hadPdf = !!result.isPdf;
      if (result.isPdf) {
        var lab = getLabParse();
        var parseOpts = isGasometryExam(exam)
          ? { gasometryOnly: true, deps: getGasometryDeps() }
          : {
              deps: getGasometryDeps(),
              externalAttachment: !!(exam && exam.hasAttachment),
            };
        if (lab && lab.parsePdfTextForExam) {
          exam.fetchedResult = lab.parsePdfTextForExam(
            raw,
            exam.examName || "",
            parseOpts
          );
        } else {
          exam.fetchedResult = parsePdfText(raw, parseOpts);
        }
        if (!exam.fetchedResult && raw && raw.trim().length > 0 && !isExternalAttachmentExam(exam)) {
          if (isEasExam(exam)) {
            exam.fetchHint = reasonToHint("no_text_extracted");
            exam.fetchReason = "eas_parse_incomplete";
          } else {
            var minimalParsed = lab && lab.parsePdfText ? lab.parsePdfText(raw.trim()) : "";
            if (minimalParsed) {
              exam.fetchedResult = minimalParsed;
            } else {
              exam.fetchHint = reasonToHint("no_text_extracted");
              exam.fetchReason = "no_text_extracted";
            }
          }
        }
        if (shouldClearGridResultAfterPdf(exam, exam.fetchedResult)) {
          exam.result = "";
        }
      } else {
        exam.fetchedResult = parseDetailText(raw);
      }
      if (result.isPdf && (!raw || !raw.trim())) {
        exam.fetchHint = reasonToHint("no_text_extracted");
        exam.fetchReason = result.reason || "no_text_extracted";
        exam.hadPdf = true;
      }
      return;
    }

    var r = result.reason || "pdf_result_error";
    exam.fetchReason = r;
    exam.fetchHint = reasonToHint(r);
    exam.hadPdf = !!result.isPdf;
  }

  var api = {
    REASON_LABELS: REASON_LABELS,
    reasonToHint: reasonToHint,
    applyFetchResult: applyFetchResult,
    isGasometryFetchedResultIncomplete: isGasometryFetchedResultIncomplete,
    reparseGasometryExam: reparseGasometryExam,
  };

  if (typeof globalThis !== "undefined") {
    globalThis.AghuPdfFetchErrors = api;
  }
  if (typeof window !== "undefined") {
    window.AghuPdfFetchErrors = api;
  }
  if (typeof self !== "undefined") {
    self.AghuPdfFetchErrors = api;
  }
})();
