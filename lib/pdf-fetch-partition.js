/**
 * Partição de exames pendentes para fetch de PDF (lote único vs anexo vs ignorar).
 */
(function (root) {
  "use strict";

  function getLabParse() {
    return root.AghuPdfLabParse || null;
  }

  function getFetchErrors() {
    return root.AghuPdfFetchErrors || null;
  }

  function isGasometryExam(exam) {
    const lab = getLabParse();
    if (lab && lab.isGasometryExamName) {
      return lab.isGasometryExamName(exam && exam.examName);
    }
    return String((exam && exam.examName) || "")
      .toUpperCase()
      .includes("GASOMETRIA");
  }

  function tryReparseGasometry(exam) {
    const fe = getFetchErrors();
    if (fe && fe.reparseGasometryExam) {
      return fe.reparseGasometryExam(exam);
    }
    const lab = getLabParse();
    if (lab && lab.reparseGasometryFromDetail) {
      return lab.reparseGasometryFromDetail(exam, lab.parsePdfText);
    }
    return false;
  }

  function isRadiologyLab(exam) {
    return String((exam && exam.lab) || "")
      .trim()
      .toUpperCase() === "RADIOLOGIA";
  }

  function isGasometryIncomplete(exam) {
    const fe = getFetchErrors();
    if (fe && fe.isGasometryFetchedResultIncomplete) {
      return fe.isGasometryFetchedResultIncomplete(exam && exam.fetchedResult);
    }
    const lab = getLabParse();
    if (lab && lab.isGasometryFetchedResultIncomplete) {
      return lab.isGasometryFetchedResultIncomplete(exam && exam.fetchedResult);
    }
    return false;
  }

  function isExamPendingFetch(exam) {
    if (!exam) return false;
    if (!(exam.hasCheckbox || exam.hasAttachment)) return false;
    if (isRadiologyLab(exam)) return false;

    if (isGasometryExam(exam)) {
      if (String(exam.detailText || "").trim()) {
        tryReparseGasometry(exam);
      }
      if (String(exam.fetchedResult || "").trim() && !isGasometryIncomplete(exam)) {
        return false;
      }
      if (isGasometryIncomplete(exam)) {
        return true;
      }
      return true;
    }

    if (String(exam.result || "").trim() !== "") return false;

    if (exam.fetchedResult || exam.detailText) {
      return false;
    }

    return true;
  }

  /**
   * @param {object[]} exams — lista já filtrada (ex.: saída de isExamPendingFetch)
   * @returns {{ clipItems: object[], batchItems: object[], skippedNoCheckbox: object[] }}
   */
  function partitionToFetch(exams) {
    const list = Array.isArray(exams) ? exams : [];
    const clipItems = list.filter((e) => e.hasAttachment);
    const batchItems = list.filter((e) => !e.hasAttachment && e.hasCheckbox);
    const skippedNoCheckbox = list.filter((e) => !e.hasAttachment && !e.hasCheckbox);
    return { clipItems, batchItems, skippedNoCheckbox };
  }

  root.AghuPdfFetchPartition = {
    isRadiologyLab,
    isExamPendingFetch,
    partitionToFetch,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
