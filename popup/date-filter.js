/**
 * Filtro de datas BR na aba Exames (popup) — extraído de popup.js (AUDIT-2026-11).
 */
(function (root) {
  "use strict";

  /**
   * @param {{ dateFromEl: HTMLElement|null, dateToEl: HTMLElement|null, dateBadge: HTMLElement|null, dateBrApi?: () => unknown }} opts
   */
  function createDateFilterHelpers(opts) {
    var dateFromEl = opts.dateFromEl;
    var dateToEl = opts.dateToEl;
    var dateBadge = opts.dateBadge;

    function dateBrApi() {
      if (opts.dateBrApi) return opts.dateBrApi();
      return typeof root.AghuDateBr !== "undefined" ? root.AghuDateBr : null;
    }

    function readDisplayBr(el) {
      var raw = el && el.value ? String(el.value).trim() : "";
      return raw || null;
    }

    function setDateInput(el, value) {
      if (!el) return;
      if (!value) {
        el.value = "";
        return;
      }
      var api = dateBrApi();
      el.value = api ? api.toDisplayBr(value) : String(value);
    }

    function readFilterIso(el) {
      var raw = el && el.value ? String(el.value).trim() : "";
      if (!raw) return null;
      var api = dateBrApi();
      if (api) return api.toFilterIso(raw);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      return null;
    }

    function normalizeDateInputEl(el) {
      var api = dateBrApi();
      if (api && el && el.value) {
        el.value = api.normalizeBrDateDisplay(el.value);
      }
    }

    function updateDateBadge() {
      if (!dateBadge) return;
      var from = readDisplayBr(dateFromEl);
      var to = readDisplayBr(dateToEl);
      if (from || to) {
        var fmtFrom = from || "...";
        var fmtTo = to || "...";
        dateBadge.textContent =
          fmtFrom === fmtTo ? fmtFrom : fmtFrom + " – " + fmtTo;
        dateBadge.classList.remove("hidden");
      } else {
        dateBadge.classList.add("hidden");
      }
    }

    function readExtractDateRange() {
      normalizeDateInputEl(dateFromEl);
      normalizeDateInputEl(dateToEl);
      var fromRaw = readDisplayBr(dateFromEl);
      var toRaw = readDisplayBr(dateToEl);
      var dateFrom = readFilterIso(dateFromEl);
      var dateTo = readFilterIso(dateToEl);

      if (fromRaw && !dateFrom) {
        return { error: "Data inicial inválida. Use o formato dd/mm/aaaa." };
      }
      if (toRaw && !dateTo) {
        return { error: "Data final inválida. Use o formato dd/mm/aaaa." };
      }
      if (dateFrom && dateTo && dateFrom > dateTo) {
        var tmp = dateFrom;
        dateFrom = dateTo;
        dateTo = tmp;
        setDateInput(dateFromEl, dateFrom);
        setDateInput(dateToEl, dateTo);
        updateDateBadge();
      }
      return { dateFrom: dateFrom, dateTo: dateTo };
    }

    function bindExamDateInputs() {
      var api = dateBrApi();
      if (!api || !api.bindBrDateInput) return;
      api.bindBrDateInput(dateFromEl, { onAfter: updateDateBadge });
      api.bindBrDateInput(dateToEl, { onAfter: updateDateBadge });
    }

    return {
      readFilterIso: readFilterIso,
      normalizeDateInputEl: normalizeDateInputEl,
      readExtractDateRange: readExtractDateRange,
      setDateInput: setDateInput,
      readDisplayBr: readDisplayBr,
      updateDateBadge: updateDateBadge,
      bindExamDateInputs: bindExamDateInputs,
    };
  }

  root.AghuPopupDateFilter = {
    createDateFilterHelpers: createDateFilterHelpers,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
