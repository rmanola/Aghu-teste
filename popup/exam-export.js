/**
 * Exportação copy/CSV na aba Exames — delega formatação a lib/exam-copy-format.js.
 */
(function (root) {
  "use strict";

  function csvField(val) {
    if (!val) return "";
    if (val.includes(";") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }

  /**
   * @param {object} d
   */
  function wireExamExport(d) {
    const copyFmt = root.AghuExamCopyFormat;
    if (!copyFmt || typeof copyFmt.buildCopyText !== "function") {
      console.error("[AGHU] AghuExamCopyFormat não carregado");
    }

    if (d.btnCopy) {
      d.btnCopy.addEventListener("click", () => {
        if (!copyFmt || typeof copyFmt.buildCopyText !== "function") return;
        const outText = copyFmt.buildCopyText(d.getFilteredExams());
        navigator.clipboard.writeText(outText).then(() => {
          if (d.showCopyDoneFeedback) d.showCopyDoneFeedback();
          setTimeout(() => {
            if (d.restoreCopyButton) d.restoreCopyButton();
          }, 1500);
        });
      });
    }

    if (d.btnCSV) {
      d.btnCSV.addEventListener("click", () => {
        const sep = ";";
        const header = [
          "data_coleta", "Data", "Solicitação", "Exame", "Amostra",
          "Laboratório", "Resultado", "Tem Anexo", "Detalhe", "Sigla",
        ].join(sep);
        const filteredExams = d.getFilteredExams();
        const lines = filteredExams.map((e) => {
          d.ensureColetaFields(e);
          const displayResult = d.getExamDisplayText(e);
          const detail = (e.fetchedResult || e.detailText || "").replace(/[\r\n]+/g, " | ");
          return [
            csvField(e.dataColetaLabel || ""),
            csvField(e.date),
            csvField(e.solicitation),
            csvField(e.examName),
            csvField(e.sample),
            csvField(e.lab),
            csvField(displayResult),
            e.hasAttachment ? "Sim" : "Não",
            csvField(detail),
            csvField(d.resolveExamSigla(e.examName)),
          ].join(sep);
        });
        const csv = "\uFEFF" + [header, ...lines].join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const meta = d.getCurrentPatientMeta();
        const prTag =
          meta && meta.ok && meta.prontuario ? `${meta.prontuario}_` : "";
        a.download = `exames_aghu_${prTag}${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  root.AghuPopupExamExport = { wireExamExport };
})(typeof globalThis !== "undefined" ? globalThis : window);
