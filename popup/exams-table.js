/**
 * Tabela de exames + filtros na aba Exames (popup).
 */
(function (root) {
  "use strict";

  /**
   * @param {object} d
   */
  function createExamsTable(d) {
    function appendExamRow(exam) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-idx", String(exam.rowIndex));

      const tdIcon = document.createElement("td");
      tdIcon.className = "col-icon";
      if (exam.hasAttachment) {
        const span = document.createElement("span");
        span.className = "icon-attach";
        span.title = "Anexo externo";
        span.textContent = "📎";
        tdIcon.appendChild(span);
      }

      const tdDate = document.createElement("td");
      tdDate.className = "col-date";
      tdDate.textContent = exam.date || "";
      tdDate.title = d.esc(exam.date || "");

      const tdExam = document.createElement("td");
      tdExam.className = "col-exam";
      const fullExamName = exam.examName || "";
      const sigla = d.resolveExamSigla(fullExamName);
      tdExam.textContent = sigla || fullExamName;
      tdExam.title = d.esc(fullExamName);

      const tdSample = document.createElement("td");
      tdSample.className = "col-sample";
      tdSample.textContent = exam.sample || "";
      tdSample.title = d.esc(exam.sample || "");

      const tdResult = document.createElement("td");
      tdResult.className = "col-result";
      const displayKind = d.fillResultCell(tdResult, exam);

      if (
        displayKind === "fetched" ||
        displayKind === "detail" ||
        displayKind === "hint" ||
        exam.fetchedResult ||
        exam.detailText ||
        exam.fetchHint
      ) {
        tr.classList.add("fetched");
      }

      tr.appendChild(tdIcon);
      tr.appendChild(tdDate);
      tr.appendChild(tdExam);
      tr.appendChild(tdSample);
      tr.appendChild(tdResult);
      d.tableBody.appendChild(tr);
    }

    function appendCategoryHeader(title) {
      const hr = document.createElement("tr");
      hr.className = "exam-group-header";
      const th = document.createElement("th");
      th.colSpan = 5;
      th.scope = "colgroup";
      th.className = "exam-group-title";
      th.textContent = title;
      hr.appendChild(th);
      d.tableBody.appendChild(hr);
    }

    function appendExamsGroupedByCategory(exams) {
      const cats = root.AghuExamCategories;
      if (!cats || typeof cats.groupExamList !== "function") {
        exams.forEach((exam) => appendExamRow(exam));
        return;
      }
      for (const section of cats.groupExamList(exams)) {
        appendCategoryHeader(cats.formatCategoryTitle(section.category));
        section.items.forEach((exam) => appendExamRow(exam));
      }
    }

    function renderTable() {
      d.tableBody.replaceChildren();
      const filtered = d.getFilteredExams();
      filtered.forEach((e) => d.ensureColetaFields(e));

      const multiGroup = d.distinctColetaKeysCount(filtered) > 1;
      if (multiGroup) {
        const grupos = d.groupByDataColeta(filtered);
        console.log("[AGHU] agrupamento UI:", grupos.length, "grupo(s),", filtered.length, "exame(s)");
        for (const g of grupos) {
          const hr = document.createElement("tr");
          hr.className = "exam-group-header";
          const th = document.createElement("th");
          th.colSpan = 5;
          th.scope = "colgroup";
          th.className = "exam-group-title";
          const n = g.items.length;
          th.textContent = `${g.dataLabel} (${n} exame${n === 1 ? "" : "s"})`;
          hr.appendChild(th);
          d.tableBody.appendChild(hr);
          appendExamsGroupedByCategory(g.items);
        }
      } else {
        appendExamsGroupedByCategory(filtered);
      }
    }

    function updateRow(exam) {
      const tr = d.tableBody.querySelector(`tr[data-idx="${CSS.escape(String(exam.rowIndex))}"]`);
      if (!tr) return;
      const cell = tr.children[4];
      if (!cell) return;
      const displayKind = d.fillResultCell(cell, exam);
      if (displayKind === "fetched" || displayKind === "detail" || displayKind === "hint") {
        tr.classList.add("fetched");
      } else {
        tr.classList.remove("fetched");
      }
    }

    function applyFilters() {
      const query = d.searchInput.value.toLowerCase().trim();
      const flags = d.getFilterFlags();
      const filtered = d.getAllExams().filter((e) => {
        d.ensureColetaFields(e);
        const siglaLower = d.resolveExamSigla(e.examName).toLowerCase();
        const matchesSearch =
          !query ||
          e.examName.toLowerCase().includes(query) ||
          siglaLower.includes(query) ||
          (e.date && e.date.toLowerCase().includes(query)) ||
          (e.dataColetaLabel && e.dataColetaLabel.toLowerCase().includes(query)) ||
          e.result.toLowerCase().includes(query) ||
          e.lab.toLowerCase().includes(query) ||
          e.sample.toLowerCase().includes(query) ||
          (e.fetchedResult && e.fetchedResult.toLowerCase().includes(query)) ||
          (e.detailText && e.detailText.toLowerCase().includes(query)) ||
          (e.fetchHint && e.fetchHint.toLowerCase().includes(query));
        const hasAnyResult = e.result || e.fetchedResult || e.detailText || e.fetchHint;
        const matchesResult = !flags.onlyWithResult || hasAnyResult;
        const matchesNoResult = !flags.onlyWithoutResult || !hasAnyResult;
        const matchesAttach = !flags.onlyWithAttach || e.hasAttachment;
        return matchesSearch && matchesResult && matchesNoResult && matchesAttach;
      });
      d.setFilteredExams(filtered);
      d.updateStats();
      renderTable();
    }

    function wireFilters() {
      d.searchInput.addEventListener("input", applyFilters);
      d.btnOnlyResults.addEventListener("click", () => {
        const flags = d.getFilterFlags();
        flags.onlyWithResult = !flags.onlyWithResult;
        if (flags.onlyWithResult) {
          flags.onlyWithoutResult = false;
          d.btnOnlyNoResults.classList.remove("active");
        }
        d.btnOnlyResults.classList.toggle("active", flags.onlyWithResult);
        applyFilters();
      });
      d.btnOnlyNoResults.addEventListener("click", () => {
        const flags = d.getFilterFlags();
        flags.onlyWithoutResult = !flags.onlyWithoutResult;
        if (flags.onlyWithoutResult) {
          flags.onlyWithResult = false;
          d.btnOnlyResults.classList.remove("active");
        }
        d.btnOnlyNoResults.classList.toggle("active", flags.onlyWithoutResult);
        applyFilters();
      });
      d.btnOnlyAttach.addEventListener("click", () => {
        const flags = d.getFilterFlags();
        flags.onlyWithAttach = !flags.onlyWithAttach;
        d.btnOnlyAttach.classList.toggle("active", flags.onlyWithAttach);
        applyFilters();
      });
    }

    return { renderTable, updateRow, applyFilters, wireFilters };
  }

  root.AghuPopupExamsTable = { createExamsTable };
})(typeof globalThis !== "undefined" ? globalThis : window);
