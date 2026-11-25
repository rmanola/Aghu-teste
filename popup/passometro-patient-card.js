/**
 * Card de paciente pós-extração (one-click) — dados locais + copiar em CAIXA ALTA por item.
 */
(function () {
  "use strict";

  var COPY_FEEDBACK_MS = 2000;
  var PREVIEW_MAX = 140;

  function truncate(text, max) {
    var s = String(text || "").trim();
    if (!s) return "";
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
  }

  function pushItem(items, label, text) {
    var value = String(text || "").trim();
    if (!value) return;
    items.push({
      label: label,
      text: value,
      preview: truncate(value, PREVIEW_MAX),
    });
  }

  function sortByExtractedAtDesc(entries) {
    return entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
  }

  function buildPrescricaoText(rx) {
    if (!rx || typeof rx !== "object") return "";
    if (rx.texto && String(rx.texto).trim()) return String(rx.texto).trim();
    var lines = [];
    if (rx.validadeInicial || rx.validadeFinal) {
      lines.push(
        "Validade: " +
          (rx.validadeInicial || "?") +
          " → " +
          (rx.validadeFinal || "?")
      );
    }
    if (rx.dieta) lines.push("Dieta: " + rx.dieta);
    if (Array.isArray(rx.antibiotico) && rx.antibiotico.length) {
      lines.push("ATB: " + rx.antibiotico.join("; "));
    }
    if (Array.isArray(rx.hidratacao) && rx.hidratacao.length) {
      lines.push("HV: " + rx.hidratacao.join("; "));
    }
    if (Array.isArray(rx.analgesia) && rx.analgesia.length) {
      lines.push("Analgesia: " + rx.analgesia.join("; "));
    }
    return lines.join("\n").trim();
  }

  function domainSucceeded(domains, name) {
    if (!domains) return true;
    var info = domains[name];
    return !!(info && info.status === "ok");
  }

  function formatDateBrYy(value) {
    var api = window.AghuDateBr;
    if (api && typeof api.toDisplayBrYy === "function") {
      return api.toDisplayBrYy(value);
    }
    return String(value || "").trim();
  }

  function formatAddress(addr) {
    if (!addr || typeof addr !== "object") return "";
    return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state]
      .filter(Boolean)
      .join(", ");
  }

  function resolveCopyPhone(pii) {
    var local = pii && pii.demographicsLocal ? pii.demographicsLocal : {};
    var tel = String(local.telefone || "").trim();
    var cel = String(local.celular || "").trim();
    if (tel && cel && tel !== cel) return tel + " · " + cel;
    return tel || cel;
  }

  function findActiveHospitalization(pii) {
    var snap = pii && pii.patientEpisodes;
    var entries = snap && Array.isArray(snap.entries) ? snap.entries : [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || e.deletedAt) continue;
      if (e.kind === "hospitalization" && e.status === "active") return e;
    }
    return null;
  }

  function resolveDih(header, pii) {
    if (header && header.dih) return String(header.dih).trim();
    var active = findActiveHospitalization(pii);
    if (!active) return "";
    return String(active.startedAtBr || active.startedAt || "").trim();
  }

  /**
   * @param {object[]} exams
   * @param {{ dateFromIso?: string|null, dateToIso?: string|null }|null|undefined} period
   * @returns {object[]}
   */
  function filterExamsByPeriod(exams, period) {
    if (!period || (!period.dateFromIso && !period.dateToIso)) {
      return exams;
    }
    var win = window.AghuExamDateWindow;
    if (!win || !win.isExamInExtractWindow) return exams;
    var from = period.dateFromIso || null;
    var to = period.dateToIso || null;
    return exams.filter(function (ex) {
      return win.isExamInExtractWindow(ex, from, to);
    });
  }

  /**
   * @param {object} data
   * @param {{ domains?: object, period?: object }} [opts]
   * @returns {{ label: string, text: string, preview: string }[]}
   */
  function buildCopyItems(data, opts) {
    data = data || {};
    opts = opts || {};
    var domains = opts.domains || null;
    var period = opts.period || null;
    var items = [];
    var header =
      data.passometro && data.passometro.header ? data.passometro.header : {};
    var pii = data.patientRecord || {};

    var nome =
      header.nome || pii.nomeCompleto || pii.primeiroNome || "";
    pushItem(items, "Nome", nome);
    pushItem(
      items,
      "Prontuário",
      header.prontuario || pii.prontuario || data.prontuario
    );

    var headerBlock =
      domainSucceeded(domains, "passometro") ||
      domainSucceeded(domains, "cirurgias");

    // PM1C-CAD-06 / PM1C-CAD-07 — demografia do domínio Cadastro
    if (domainSucceeded(domains, "cadastro")) {
      pushItem(items, "Sexo", pii.sexo);
      pushItem(
        items,
        "DN",
        formatDateBrYy(pii.dataNascimentoISO || pii.dataNascimento)
      );
      pushItem(items, "Telefone", resolveCopyPhone(pii));
      pushItem(items, "Nome da mãe", pii.nomeMae);
      pushItem(items, "Cartão SUS", pii.cartaoSus);
      pushItem(items, "Endereço", formatAddress(pii.patientAddress));
      pushItem(items, "Leito", pii.leito);

      if (!headerBlock) {
        pushItem(items, "DIH", formatDateBrYy(resolveDih(header, pii)));
        pushItem(items, "Staff", header.staff);
        var activeOnly = findActiveHospitalization(pii);
        if (activeOnly && activeOnly.endedAt) {
          pushItem(items, "Fim internação", formatDateBrYy(activeOnly.endedAt));
        }
        if (activeOnly && activeOnly.staff && !header.staff) {
          pushItem(items, "Staff", activeOnly.staff);
        }
      } else {
        var activeWithEnd = findActiveHospitalization(pii);
        if (activeWithEnd && activeWithEnd.endedAt) {
          pushItem(
            items,
            "Fim internação",
            formatDateBrYy(activeWithEnd.endedAt)
          );
        }
      }
    }

    if (headerBlock) {
      pushItem(items, "Idade", header.idade);
      pushItem(items, "Peso", header.peso);
      pushItem(items, "Staff", header.staff);
      pushItem(items, "DIH", formatDateBrYy(header.dih));

      var schema = window.AghuPassometroSchema;
      if (schema && schema.formatDiagnosticosDisplay) {
        pushItem(items, "Diagnóstico", schema.formatDiagnosticosDisplay(header));
      } else {
        pushItem(items, "Diagnóstico", header.diagnostico);
      }
      pushItem(items, "HDA/HPP", header.hdaHpp);

      var po = window.AghuPassometroPo;
      if (po && po.formatCirurgiasDisplay) {
        pushItem(items, "Cirurgias", po.formatCirurgiasDisplay(header));
      } else {
        pushItem(items, "Cirurgia", header.cirurgia);
        pushItem(items, "Data cirurgia", header.dataCirurgia);
      }
    }

    if (domainSucceeded(domains, "controles")) {
      var ctrlEntries =
        data.controles && Array.isArray(data.controles.entries)
          ? data.controles.entries
          : [];
      sortByExtractedAtDesc(ctrlEntries).forEach(function (entry) {
        if (!entry || !entry.texto) return;
        var label = "Controles";
        if (entry.periodo) label += " (" + entry.periodo + ")";
        var shown = entry.texto;
        var view = window.AghuControlesPaView;
        var fmtApi = window.AghuPaFormatControls;
        if (view && typeof view.applyPaFormatView === "function") {
          var fmt =
            fmtApi && typeof fmtApi.getCachedPaFormat === "function"
              ? fmtApi.getCachedPaFormat()
              : "minmax";
          shown = view.applyPaFormatView(entry.texto, fmt);
        }
        pushItem(items, label, shown);
      });
    }

    if (domainSucceeded(domains, "prescricao")) {
      var rxSnap = data.prescricoes;
      if (rxSnap && Array.isArray(rxSnap.entries) && rxSnap.entries.length) {
        sortByExtractedAtDesc(rxSnap.entries).forEach(function (entry) {
          var rxText = buildPrescricaoText(entry);
          if (!rxText) return;
          var rxLabel = "Prescrição";
          if (entry.validadeInicial || entry.validadeFinal) {
            rxLabel +=
              " (" +
              (entry.validadeInicial || "?") +
              " → " +
              (entry.validadeFinal || "?") +
              ")";
          }
          pushItem(items, rxLabel, rxText);
        });
      } else {
        pushItem(items, "Prescrição", buildPrescricaoText(rxSnap));
      }
    }

    if (domainSucceeded(domains, "exames")) {
      var exams = [];
      if (
        window.AghuPatientArchive &&
        window.AghuPatientArchive.examsRecordToArray &&
        data.patientRecord
      ) {
        exams = window.AghuPatientArchive.examsRecordToArray(data.patientRecord);
      } else if (data.patientRecord && data.patientRecord.examsByKey) {
        exams = Object.keys(data.patientRecord.examsByKey).map(function (k) {
          return data.patientRecord.examsByKey[k];
        });
      }
      exams = filterExamsByPeriod(exams, period);
      if (exams.length) {
        var copyFmt = window.AghuExamCopyFormat;
        if (copyFmt && copyFmt.buildCopyText) {
          pushItem(items, "Exames", copyFmt.buildCopyText(exams));
        } else {
          exams.forEach(function (ex) {
            if (!ex) return;
            var line = [
              ex.examName,
              ex.result || ex.fetchedResult || ex.detailText,
            ]
              .filter(Boolean)
              .join(": ");
            pushItem(items, "Exame", line);
          });
        }
      }
    }

    if (domainSucceeded(domains, "passometro")) {
      var passEntries =
        data.passometro && Array.isArray(data.passometro.entries)
          ? data.passometro.entries
          : [];
      if (passEntries.length) {
        var latest = passEntries[passEntries.length - 1];
        var entryFields = {
          cd: "Evolução (CD)",
          pendencias: "Pendências",
          dieta: "Dieta (PO)",
          atb: "ATB (PO)",
          analgesia: "Analgesia (PO)",
          exames: "Exames (PO)",
          hv: "HV (PO)",
          sng: "SNG (PO)",
          drenos: "Drenos",
          drenoTl: "Dreno TL",
          drenoJp: "Dreno JP",
          drenoPig: "Dreno PIG",
        };
        Object.keys(entryFields).forEach(function (key) {
          pushItem(items, entryFields[key], latest[key]);
        });
        var vitals = [];
        ["fc", "fr", "sato2", "pa", "tax", "hgt", "diurese", "bh", "fezes"].forEach(
          function (key) {
            if (latest[key]) vitals.push(key.toUpperCase() + ": " + latest[key]);
          }
        );
        pushItem(items, "Vitais (passômetro)", vitals.join(" | "));
      }
    }

    return items;
  }

  async function loadPatientCardData(patientKey, prontuario) {
    var identity = window.AghuPatientIdentity;
    var pk =
      patientKey ||
      (identity && identity.buildPatientKey
        ? identity.buildPatientKey(prontuario)
        : prontuario);
    if (!pk) {
      return {
        patientKey: null,
        patientRecord: null,
        controles: null,
        prescricoes: null,
        passometro: null,
      };
    }

    var patientRecord = null;
    var controles = null;
    var prescricoes = null;
    var passometro = null;

    if (window.AghuPatientArchive && window.AghuPatientArchive.loadPatientRecord) {
      try {
        patientRecord = await window.AghuPatientArchive.loadPatientRecord(pk);
      } catch (_e) {}
    }
    if (
      window.AghuControlesArchive &&
      window.AghuControlesArchive.loadControlesSnapshot
    ) {
      try {
        controles = await window.AghuControlesArchive.loadControlesSnapshot(pk);
      } catch (_e2) {}
    }
    if (
      window.AghuPrescricaoArchive &&
      window.AghuPrescricaoArchive.loadPrescricaoSnapshot
    ) {
      try {
        prescricoes = await window.AghuPrescricaoArchive.loadPrescricaoSnapshot(pk);
      } catch (_e3) {}
    }
    if (
      window.AghuPassometroArchive &&
      window.AghuPassometroArchive.loadPassometroSnapshot
    ) {
      try {
        passometro = await window.AghuPassometroArchive.loadPassometroSnapshot(pk);
      } catch (_e4) {}
    }

    return {
      patientKey: pk,
      patientRecord: patientRecord,
      controles: controles,
      prescricoes: prescricoes,
      passometro: passometro,
    };
  }

  function createCopyButton(text) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-sm pm-pc-copy";
    btn.textContent = "Copiar";
    btn.title = "Copiar em CAIXA ALTA";
    btn.addEventListener("click", function () {
      void (async function () {
        var api = window.AghuCopyTextUpperCaseBr;
        try {
          if (api && api.copyTextUpperCaseBr) {
            var ok = await api.copyTextUpperCaseBr(text);
            if (!ok) throw new Error("clipboard_unavailable");
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(
              String(text || "").toLocaleUpperCase("pt-BR")
            );
          } else {
            throw new Error("clipboard_unavailable");
          }
          btn.textContent = "✓ Copiado";
          btn.classList.add("copied");
          btn.disabled = true;
          setTimeout(function () {
            btn.textContent = "Copiar";
            btn.classList.remove("copied");
            btn.disabled = false;
          }, COPY_FEEDBACK_MS);
        } catch (_err) {
          btn.textContent = "Erro";
          setTimeout(function () {
            btn.textContent = "Copiar";
          }, COPY_FEEDBACK_MS);
        }
      })();
    });
    return btn;
  }

  function renderItemsSection(container, items) {
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "pm-pc-empty";
      empty.textContent = "Sem dados extraídos para copiar.";
      container.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "pm-pc-item";

      var label = document.createElement("div");
      label.className = "pm-pc-item-label";
      label.textContent = item.label;

      var preview = document.createElement("div");
      preview.className = "pm-pc-item-preview";
      preview.textContent = item.preview || item.text;

      row.appendChild(label);
      row.appendChild(preview);
      row.appendChild(createCopyButton(item.text));
      container.appendChild(row);
    });
  }

  /**
   * @param {HTMLElement} cardEl
   * @param {{ prontuario?: string, domains?: object, period?: object }} batchRow
   * @returns {Promise<void>}
   */
  async function appendPatientDataCard(cardEl, batchRow) {
    if (!cardEl || !batchRow) return;

    var loaded = await loadPatientCardData(null, batchRow.prontuario);
    var items = buildCopyItems(
      Object.assign({ prontuario: batchRow.prontuario }, loaded),
      {
        domains: batchRow.domains || null,
        period: batchRow.period || null,
      }
    );

    var titleEl = cardEl.querySelector(".pm-oc-row-title");
    if (titleEl) {
      var header =
        loaded.passometro && loaded.passometro.header
          ? loaded.passometro.header
          : {};
      var nome =
        header.nome ||
        (loaded.patientRecord && loaded.patientRecord.nomeCompleto) ||
        (loaded.patientRecord && loaded.patientRecord.primeiroNome) ||
        "";
      titleEl.textContent = nome
        ? nome + " · pront. " + batchRow.prontuario
        : "Prontuário " + batchRow.prontuario;
    }

    var section = document.createElement("div");
    section.className = "pm-pc-data";
    renderItemsSection(section, items);
    cardEl.appendChild(section);
  }

  window.AghuPassometroPatientCard = {
    buildCopyItems: buildCopyItems,
    loadPatientCardData: loadPatientCardData,
    appendPatientDataCard: appendPatientDataCard,
  };
})();
