/**
 * Extração de cirurgias do POL (lista + PDF Descrição Cirúrgica).
 * Action: extrairCirurgias (FEAT-062).
 */
(function () {
  "use strict";

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function pdfFetchCfg() {
    return typeof AghuPdfFetchConfig !== "undefined" && AghuPdfFetchConfig
      ? AghuPdfFetchConfig
      : {
          WAIT_PDF_DEFAULT_MS: 45000,
          WAIT_ATTACH_MS: 60000,
          POLL_PDF_MS: 200,
        };
  }

  function polParseApi() {
    return typeof AghuCirurgiasPolParse !== "undefined"
      ? AghuCirurgiasPolParse
      : null;
  }

  function pdfParseApi() {
    return typeof AghuCirurgiasDescricaoPdfParse !== "undefined"
      ? AghuCirurgiasDescricaoPdfParse
      : null;
  }

  function outcomeApi() {
    return typeof AghuCirurgiasExtractOutcome !== "undefined"
      ? AghuCirurgiasExtractOutcome
      : null;
  }

  function periodFilterApi() {
    return typeof AghuCirurgiasPeriodFilter !== "undefined"
      ? AghuCirurgiasPeriodFilter
      : null;
  }

  function getPolFrameDoc() {
    var frame = document.querySelector("#frame_pol, iframe[name='frame_pol']");
    if (!frame) return null;
    try {
      return frame.contentDocument || null;
    } catch (_e) {
      return null;
    }
  }

  function normPolTabLabel(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findPolTreeLink(labelText) {
    var target = normPolTabLabel(labelText);
    var links = document.querySelectorAll("a.node-link-pol");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (normPolTabLabel(a.textContent) === target) return a;
    }
    return null;
  }

  function clickPolTab(labelText) {
    var link = findPolTreeLink(labelText);
    if (!link) return false;
    var label = link.closest(".ui-treenode-label") || link;
    try {
      label.click();
      return true;
    } catch (_e) {
      try {
        link.click();
        return true;
      } catch (_e2) {
        return false;
      }
    }
  }

  async function waitForPolFrame(predicate, timeoutMs) {
    var waitMs = timeoutMs != null ? timeoutMs : 15000;
    var deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      var frame = document.querySelector("#frame_pol, iframe[name='frame_pol']");
      if (frame) {
        var doc = null;
        try {
          doc = frame.contentDocument;
        } catch (_e) {}
        if (doc && doc.body) {
          if (!predicate || predicate(doc, frame)) {
            return { frame: frame, doc: doc };
          }
        }
      }
      await sleep(250);
    }
    return null;
  }

  function countSelectableCirurgiaRows(doc) {
    if (!doc) return 0;
    var rows = doc.querySelectorAll(
      "#tabela_resultados\\:resultList_data tr.ui-datatable-selectable"
    );
    if (!rows.length) {
      rows = doc.querySelectorAll("tr.ui-datatable-selectable");
    }
    return rows.length;
  }

  function cirurgiasTableMounted(doc) {
    if (!doc) return false;
    return !!(
      doc.querySelector("#tabela_resultados\\:resultList_data") ||
      doc.querySelector("#tabela_resultados") ||
      doc.querySelector("[id*='tabela_resultados']")
    );
  }

  /**
   * Lista pronta = DataTable montado (linhas ou widget). URL sozinha NÃO basta —
   * evita race pós-click na árvore POL antes do rowSelect estar bound.
   */
  function frameLooksLikeCirurgiasList(doc) {
    if (!doc) return false;
    var href = "";
    try {
      href = (doc.location && doc.location.href) || "";
    } catch (_e) {}
    var onCirurgiasPage =
      /cirurgiasInternacaoListPOL/i.test(href) ||
      /Listar Cirurgias/i.test(
        (doc.title || "") +
          (doc.body && doc.body.innerText ? doc.body.innerText.slice(0, 200) : "")
      );
    if (countSelectableCirurgiaRows(doc) > 0) {
      return onCirurgiasPage || !!doc.querySelector("#tabela_resultados\\:resultList_data");
    }
    // Lista vazia: exige página Cirurgias + tabela montada (não só URL).
    return onCirurgiasPage && cirurgiasTableMounted(doc);
  }

  function frameLooksLikeDescricaoPdf(doc) {
    if (!doc) return false;
    var href = "";
    try {
      href = (doc.location && doc.location.href) || "";
    } catch (_e) {}
    if (/relatorioDescricaoCirurgiaPdf/i.test(href)) return true;
    return !!doc.querySelector('object[type="application/pdf"]');
  }

  async function beginPdfCapture() {
    var captureId =
      Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    await browser.storage.local.set({ aghu_pdf_capture_id: captureId });
    await browser.storage.local.remove("aghu_pdf_result");
    return captureId;
  }

  async function waitForPdfResult(timeoutMs, expectedCaptureId) {
    var waitApi =
      typeof AghuPdfFetchWait !== "undefined" ? AghuPdfFetchWait : null;
    if (waitApi && waitApi.waitForPdfResult) {
      var cfg = pdfFetchCfg();
      var waitMs = timeoutMs != null ? timeoutMs : cfg.WAIT_PDF_DEFAULT_MS;
      return waitApi.waitForPdfResult(
        browser.storage.local,
        waitMs,
        expectedCaptureId
      );
    }
    var cfg2 = pdfFetchCfg();
    var waitMs2 = timeoutMs != null ? timeoutMs : cfg2.WAIT_PDF_DEFAULT_MS;
    var pollMs = cfg2.POLL_PDF_MS || 200;
    var deadline = Date.now() + waitMs2;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      try {
        var stored = await browser.storage.local.get("aghu_pdf_result");
        var r = stored.aghu_pdf_result;
        if (!r) continue;
        if (expectedCaptureId) {
          if (r.captureId && r.captureId !== expectedCaptureId) continue;
          if (!r.captureId && typeof r.ok === "boolean") continue;
        }
        if (typeof r.ok === "boolean") {
          await browser.storage.local.remove("aghu_pdf_result");
          return {
            success: !!r.ok,
            text: r.text || "",
            reason: r.reason || null,
          };
        }
        if (r.text && r.text.length > 0) {
          await browser.storage.local.remove("aghu_pdf_result");
          return { success: true, text: r.text, reason: null };
        }
      } catch (_e) {}
    }
    return { success: false, text: "", reason: "wait_timeout" };
  }

  function isDescricaoControlDisabled(el) {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
    if (/\bui-state-disabled\b/.test(el.className || "")) return true;
    if (el.closest && el.closest(".ui-state-disabled")) return true;
    return false;
  }

  /** Botão Descrição mesmo desabilitado (`bt_descricao` / `bt_descricao_disabled`). */
  function findDescricaoControl(doc) {
    if (!doc) return null;
    var buttons = doc.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var id = b.id || "";
      var text = (b.textContent || "").replace(/\s+/g, " ").trim();
      if (/^bt_descricao/i.test(id) || text === "Descrição") return b;
    }
    return null;
  }

  function findDescricaoButton(doc) {
    var ctrl = findDescricaoControl(doc);
    if (!ctrl || isDescricaoControlDisabled(ctrl)) return null;
    return ctrl;
  }

  function getSelectableRow(doc, index) {
    if (!doc) return null;
    var rows = doc.querySelectorAll(
      "#tabela_resultados\\:resultList_data tr.ui-datatable-selectable"
    );
    if (!rows.length) {
      rows = doc.querySelectorAll("tr.ui-datatable-selectable");
    }
    return rows[index] || null;
  }

  function isRowHighlighted(doc, index) {
    var row = getSelectableRow(doc, index);
    if (!row) return false;
    return /\bui-state-highlight\b/.test(row.className || "");
  }

  function selectListRow(doc, index) {
    var row = getSelectableRow(doc, index);
    if (!row) return false;
    var win = doc.defaultView;
    var cell = row.querySelector("td") || row;
    try {
      if (win && win.$) {
        win.$(cell).trigger("click");
      } else {
        cell.click();
      }
      return true;
    } catch (_e) {
      try {
        row.click();
        return true;
      } catch (_e2) {
        return false;
      }
    }
  }

  /**
   * Select + verify highlight / Descrição habilitado, com retries (race pós-nav POL).
   * Se houver highlight mas Descrição continuar disabled, re-dispara o click 1× —
   * no AGHU o botão pode ficar como `bt_descricao_disabled` até o rowSelect AJAX real.
   */
  async function ensureRowSelected(index, timeoutMs) {
    var totalMs = timeoutMs || 8000;
    var deadline = Date.now() + totalMs;
    var maxAttempts = 3;
    var attempts = 0;
    var reclickAfterHighlight = false;
    var highlightSince = 0;
    var doc = getPolFrameDoc();

    while (Date.now() < deadline) {
      doc = getPolFrameDoc() || doc;
      var enabled = findDescricaoButton(doc);
      var highlighted = isRowHighlighted(doc, index);
      // CIR-EXT-13: Descrição enabled só conta se a linha *deste* índice está highlight —
      // senão reabre o PDF da linha anterior e o merge colapsa N→1.
      if (enabled && highlighted) {
        return {
          ok: true,
          reason: "ok",
          skipped: false,
          btn: enabled,
          doc: doc,
        };
      }

      if (!highlighted) {
        highlightSince = 0;
        if (attempts >= maxAttempts) {
          await sleep(200);
          continue;
        }
        attempts++;
        if (!selectListRow(doc, index)) {
          await sleep(400);
          continue;
        }
        await sleep(500);
        continue;
      }

      if (!highlightSince) highlightSince = Date.now();
      // Re-click uma vez se Descrição não habilitou ~1.5s após highlight.
      if (
        !reclickAfterHighlight &&
        Date.now() - highlightSince >= 1500 &&
        Date.now() < deadline - 1000
      ) {
        reclickAfterHighlight = true;
        selectListRow(doc, index);
        await sleep(500);
        continue;
      }

      await sleep(250);
    }

    doc = getPolFrameDoc() || doc;
    var state = {
      highlighted: isRowHighlighted(doc, index),
      descricaoEnabled: !!findDescricaoButton(doc),
      descricaoPresent: !!findDescricaoControl(doc),
    };
    var outcome = outcomeApi()
      ? outcomeApi().classifySelectOutcome(state)
      : state.descricaoEnabled
        ? { reason: "ok", skipped: false, ok: true }
        : state.highlighted
          ? { reason: "sem_descricao", skipped: true, ok: false }
          : { reason: "select_failed", skipped: false, ok: false };

    return {
      ok: outcome.reason === "ok",
      reason: outcome.reason,
      skipped: !!outcome.skipped,
      btn: findDescricaoButton(doc),
      doc: doc,
    };
  }

  async function handleDescricaoModalIfAny(doc) {
    var modal = doc.getElementById("descricaoCirurgiasModal");
    if (!modal || modal.classList.contains("ui-overlay-hidden")) {
      return false;
    }
    if (modal.getAttribute("aria-hidden") === "true") return false;
    var row = doc.querySelector(
      "#descrCirurgias\\:resultList_data tr.ui-datatable-selectable"
    );
    if (!row) return false;
    var win = doc.defaultView;
    var cell = row.querySelector("td") || row;
    try {
      if (win && win.$) win.$(cell).trigger("click");
      else cell.click();
    } catch (_e) {}
    await sleep(500);
    // Alguns fluxos abrem o PDF ao selecionar; outros têm botão implícito.
    return true;
  }

  function clickVoltar(doc) {
    if (!doc) return false;
    var buttons = doc.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].textContent || "").replace(/\s+/g, " ").trim();
      if (t === "Voltar") {
        try {
          buttons[i].click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function normalizeProntuarioDigits(raw) {
    if (
      typeof AghuPatientIdentity !== "undefined" &&
      AghuPatientIdentity.normalizeProntuario
    ) {
      return AghuPatientIdentity.normalizeProntuario(raw) || "";
    }
    if (
      typeof AghuPatientDomExtract !== "undefined" &&
      AghuPatientDomExtract.normalizeProntuarioDigits
    ) {
      return AghuPatientDomExtract.normalizeProntuarioDigits(raw) || "";
    }
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  function primeiroNomeFromFull(fullName) {
    if (!fullName || String(fullName).trim() === "") return "";
    var parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    return parts[0] || "";
  }

  /**
   * Identidade alinhada a exames/controles: AghuPatientDomExtract + casca POL.
   * @returns {{ ok: boolean, missing: string[], prontuario: string|null, patientKey: string|null, primeiroNome: string, nomeCompleto: string }}
   */
  function extractPatientMeta() {
    var domApi =
      typeof AghuPatientDomExtract !== "undefined" ? AghuPatientDomExtract : null;
    var nomeCompleto = "";
    var prontRaw = "";
    var blob = "";

    if (domApi) {
      var domHints = domApi.aggregateDomPatientHints(document);
      blob = domApi.buildPatientInnerTextBlob(document);
      var parsed = domApi.parsePatientLabelsFromBlob(blob, domHints);
      nomeCompleto = parsed.nomeCompleto || "";
      prontRaw = parsed.prontRaw || "";
      if (domApi.mergePatientFromPolCasca) {
        var polMerged = domApi.mergePatientFromPolCasca(
          document,
          blob,
          nomeCompleto,
          prontRaw
        );
        nomeCompleto = polMerged.nomeCompleto || nomeCompleto;
        prontRaw = polMerged.prontRaw || prontRaw;
      }
    } else {
      var h3 =
        document.querySelector("h3.accordion-tab-pol.ui-state-active") ||
        (document.querySelectorAll("h3.accordion-tab-pol").length === 1
          ? document.querySelector("h3.accordion-tab-pol")
          : null);
      var raw = "";
      if (h3) {
        raw = (h3.textContent || "").replace(/\s+/g, " ").trim();
        var title = (h3.getAttribute("title") || "").trim();
        var mH3 = raw.match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
        if (mH3) {
          prontRaw = mH3[1];
          nomeCompleto = mH3[2].trim();
        } else if (title) {
          var numMatch = raw.match(/(\d{5,})/);
          if (numMatch && /[A-Za-zÀ-ÿ]/.test(title)) {
            prontRaw = numMatch[1];
            nomeCompleto = title;
          }
        }
      }
      if (!prontRaw || !nomeCompleto) {
        var polDlg = document.querySelector("#pacientePol .ui-dialog-content");
        if (polDlg) {
          var dlgRaw = (polDlg.textContent || "").replace(/\s+/g, " ").trim();
          var mDlg = dlgRaw.match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
          if (mDlg) {
            prontRaw = mDlg[1];
            nomeCompleto = mDlg[2].trim();
          }
        }
      }
    }

    nomeCompleto = (nomeCompleto || "").replace(/\s{2,}/g, " ").trim();
    nomeCompleto = nomeCompleto.replace(/^\d+\s*[-–—]\s*/, "");

    var prontuario = normalizeProntuarioDigits(prontRaw);
    var primeiroNome = primeiroNomeFromFull(nomeCompleto);
    var missing = [];
    if (!nomeCompleto) missing.push("nome do paciente");
    if (!prontuario) missing.push("prontuário");

    var patientKey = null;
    if (prontuario && typeof AghuPatientIdentity !== "undefined") {
      patientKey = AghuPatientIdentity.buildPatientKey(prontuario);
    } else if (prontuario) {
      patientKey = prontuario;
    }

    return {
      ok: missing.length === 0,
      missing: missing,
      prontuario: prontuario || null,
      patientKey: patientKey,
      primeiroNome: primeiroNome,
      nomeCompleto: nomeCompleto,
    };
  }

  /**
   * Após a lista aparecer, exige contagem de linhas estável (widget PF bound).
   */
  async function waitForCirurgiasListSettled(timeoutMs) {
    var waitMs = timeoutMs != null ? timeoutMs : 3000;
    var deadline = Date.now() + waitMs;
    var last = -1;
    var stable = 0;
    while (Date.now() < deadline) {
      var doc = getPolFrameDoc();
      if (!doc || !frameLooksLikeCirurgiasList(doc)) {
        await sleep(250);
        continue;
      }
      var n = countSelectableCirurgiaRows(doc);
      if (n === last) {
        stable++;
        if (stable >= 3) {
          return { frame: null, doc: doc };
        }
      } else {
        stable = 0;
        last = n;
      }
      await sleep(250);
    }
    var finalDoc = getPolFrameDoc();
    if (finalDoc && frameLooksLikeCirurgiasList(finalDoc)) {
      return { frame: null, doc: finalDoc };
    }
    return null;
  }

  async function ensureCirurgiasList() {
    var hit = await waitForPolFrame(frameLooksLikeCirurgiasList, 2000);
    if (hit) {
      var settledEarly = await waitForCirurgiasListSettled(2000);
      return settledEarly || hit;
    }
    if (!clickPolTab("Cirurgias")) {
      return null;
    }
    hit = await waitForPolFrame(frameLooksLikeCirurgiasList, 15000);
    if (!hit) return null;
    var settled = await waitForCirurgiasListSettled(3000);
    return settled || hit;
  }

  async function extractOneCirurgia(listMeta, index) {
    var doc = getPolFrameDoc();
    if (!doc) {
      return { ok: false, reason: "no_frame", skipped: false };
    }

    var selected = await ensureRowSelected(index, 8000);
    if (!selected || selected.reason === "select_failed") {
      return { ok: false, reason: "select_failed", skipped: false };
    }
    if (selected.skipped || selected.reason === "sem_descricao") {
      return { ok: false, reason: "sem_descricao", skipped: true };
    }
    var btn = selected.btn || findDescricaoButton(getPolFrameDoc() || doc);
    if (!btn) {
      return { ok: false, reason: "sem_descricao", skipped: true };
    }

    var captureId = await beginPdfCapture();
    try {
      btn.click();
    } catch (_e) {
      return { ok: false, reason: "click_descricao_failed", skipped: false };
    }

    await sleep(600);
    doc = getPolFrameDoc() || doc;
    await handleDescricaoModalIfAny(doc);

    var pdfHit = await waitForPolFrame(frameLooksLikeDescricaoPdf, 20000);
    var cfg = pdfFetchCfg();
    var pdfResult = await waitForPdfResult(
      cfg.WAIT_ATTACH_MS || cfg.WAIT_PDF_DEFAULT_MS,
      captureId
    );

    if (!pdfResult.success || !pdfResult.text) {
      clickVoltar(getPolFrameDoc());
      await waitForPolFrame(frameLooksLikeCirurgiasList, 10000);
      return {
        ok: false,
        reason: pdfResult.reason || "pdf_failed",
        skipped: false,
      };
    }

    var parser = pdfParseApi();
    var parsed = parser
      ? parser.parseDescricaoCirurgiaPdfText(pdfResult.text, {
          data: listMeta.data,
          nome: listMeta.nome,
        })
      : null;

    clickVoltar(getPolFrameDoc());
    await waitForPolFrame(frameLooksLikeCirurgiasList, 12000);

    if (!parsed || !parsed.data || !parser.hasCirurgiaPdfBody(parsed)) {
      return { ok: false, reason: "parse_failed", skipped: false };
    }

    return {
      ok: true,
      cirurgia: {
        data: (listMeta && listMeta.data) || parsed.data,
        nome: parsed.nome || (listMeta && listMeta.nome) || "",
        listIndex: index,
        equipe: parsed.equipe || "",
        achadosOperatorios: parsed.achadosOperatorios || "",
        descricao: parsed.descricao || "",
      },
    };
  }

  async function extrairCirurgias(msg) {
    var patient = extractPatientMeta();
    var listHit = await ensureCirurgiasList();
    if (!listHit || !listHit.doc) {
      return {
        ok: false,
        erro: 'Aba "Cirurgias" não encontrada no POL.',
        patient: patient,
        cirurgias: [],
        skipped: [],
        errors: [],
      };
    }

    var parseList = polParseApi();
    var rows = parseList
      ? parseList.parseCirurgiasListFromDoc(listHit.doc)
      : [];
    if (!rows.length) {
      return {
        ok: false,
        erro: "Nenhuma cirurgia na lista do POL.",
        patient: patient,
        cirurgias: [],
        skipped: [],
        errors: [],
      };
    }

    var dateFrom = msg && msg.dateFrom != null ? msg.dateFrom : null;
    var dateTo = msg && msg.dateTo != null ? msg.dateTo : null;
    var filterApi = periodFilterApi();
    var split = filterApi
      ? filterApi.filterCirurgiasRowsByPeriod(rows, dateFrom, dateTo)
      : { inPeriod: rows, outOfPeriod: [] };
    var inPeriod = split.inPeriod || [];
    var outOfPeriod = split.outOfPeriod || [];

    var skipped = [];
    for (var s = 0; s < outOfPeriod.length; s++) {
      var outRow = outOfPeriod[s];
      skipped.push({
        index: outRow && outRow.index != null ? outRow.index : s,
        reason: "fora_periodo",
        data: outRow && outRow.data,
      });
    }

    console.log("[AGHU] cirurgias list count=", rows.length, {
      inPeriod: inPeriod.length,
      foraPeriodo: outOfPeriod.length,
    });

    // CIR-EXT-18: lista com linhas mas todas fora do período → sucesso vazio (one-click).
    if (inPeriod.length === 0) {
      return {
        ok: true,
        patient: patient,
        cirurgias: [],
        skipped: skipped,
        errors: [],
        listCount: rows.length,
      };
    }

    var cirurgias = [];
    var errors = [];

    for (var i = 0; i < inPeriod.length; i++) {
      var row = inPeriod[i];
      var domIndex = row && row.index != null ? row.index : i;
      // Sempre voltar à lista estável antes do próximo índice.
      var ready = await waitForPolFrame(frameLooksLikeCirurgiasList, 8000);
      if (!ready) {
        errors.push({ index: domIndex, reason: "list_lost" });
        break;
      }
      var one = await extractOneCirurgia(row, domIndex);
      if (one.ok && one.cirurgia) {
        cirurgias.push(one.cirurgia);
      } else if (one.skipped) {
        skipped.push({
          index: domIndex,
          reason: one.reason || "sem_descricao",
          data: row.data,
        });
      } else {
        errors.push({
          index: domIndex,
          reason: one.reason || "unknown",
          data: row.data,
        });
      }
      await sleep(400);
    }

    var batchOk = outcomeApi()
      ? outcomeApi().classifyBatchOk({
          extractedCount: cirurgias.length,
          skipped: skipped,
          errors: errors,
          listCount: rows.length,
        })
      : cirurgias.length > 0 || (skipped.length > 0 && errors.length === 0);

    console.log("[AGHU] cirurgias extract done", {
      ok: cirurgias.length,
      skipped: skipped.length,
      errors: errors.length,
      batchOk: batchOk,
    });

    return {
      ok: batchOk,
      patient: patient,
      cirurgias: cirurgias,
      skipped: skipped,
      errors: errors,
      listCount: rows.length,
      erro:
        !batchOk && cirurgias.length === 0
          ? errors.some(function (e) {
              return e && e.reason === "select_failed";
            })
            ? "Falha ao selecionar cirurgia(s) na lista do POL. Abra a aba Cirurgias e tente de novo."
            : errors.length
              ? "Erro na extração de cirurgias."
              : undefined
          : undefined,
    };
  }

  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
      if (!request || request.action !== "extrairCirurgias") return false;
      extrairCirurgias(request)
        .then(sendResponse)
        .catch(function (e) {
          sendResponse({
            ok: false,
            erro: (e && e.message) || "Erro na extração de cirurgias.",
            cirurgias: [],
            skipped: [],
            errors: [],
          });
        });
      return true;
    });
  }
})();
