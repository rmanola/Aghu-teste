// content/content.js  v5
// Roda em todas as páginas AGHU.
// A extração de PDF é tratada inteiramente pelo background (webRequest filter).
// Este script apenas gerencia a tabela de exames e aguarda o storage.
"use strict";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function pdfFetchCfg() {
  const c = typeof AghuPdfFetchConfig !== "undefined" ? AghuPdfFetchConfig : null;
  if (c) return c;
  return {
    EXTRACT_PDF_MS: 45000,
    WAIT_PDF_DEFAULT_MS: 60000,
    WAIT_ATTACH_MS: 50000,
    WAIT_BATCH_BASE_MS: 60000,
    WAIT_BATCH_PER_EXAM_MS: 8000,
    GO_BACK_MS: 20000,
    POLL_PDF_MS: 400,
    DELAY_BETWEEN_PDF_MS: 1500,
    batchWaitMs(n) {
      return this.WAIT_BATCH_BASE_MS + Math.max(0, (n || 1) - 1) * this.WAIT_BATCH_PER_EXAM_MS;
    },
  };
}

/** Aguarda entre um PDF e o próximo para o AGHU estabilizar (lista / intercept). */
async function pauseBetweenPdfFetches() {
  const ms = pdfFetchCfg().DELAY_BETWEEN_PDF_MS;
  if (ms > 0) await sleep(ms);
}

// ── Detect which mode we're in ────────────────────────────────────────────────
const PAGE_URL = window.location.href.toLowerCase();
const IS_PDF_TAB = PAGE_URL.includes("dynamiccontent");

// ── MODE A: PDF viewer tab ────────────────────────────────────────────────────
if (IS_PDF_TAB) {
  (async function() {
    try {
      console.log("[AGHU] PDF tab URL detected — background webRequest filter já deve ter capturado.");
    } catch(e) {}
  })();
}

// ── MODE B: AGHU casca page ───────────────────────────────────────────────────
if (!IS_PDF_TAB) {
  (function() {

    function examParseApi() {
      return typeof AghuExamTableParse !== "undefined" ? AghuExamTableParse : null;
    }

    function findExamDocument() {
      const api = examParseApi();
      if (api) {
        const hit = api.findExamDocument(document);
        return hit.doc;
      }
      return document;
    }

    function findTableBody(doc) {
      const api = examParseApi();
      if (api) return api.findTableBodyInDoc(doc);
      return null;
    }

    function parseBrDate(str) {
      if (!str) return null;
      const parts = str.trim().split(" ")[0].split("/");
      if (parts.length < 3) return null;
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    }

    /**
     * Normaliza a data de COLETA da tabela (coluna com span :dataColeta).
     * Não usar datas vindas do PDF (ex.: liberação/emissão).
     */
    /**
     * Texto visível na casca AGHU + iframes — usado para nome e prontuário (LGPD: só local).
     */
    function collectDocBodiesForPatient() {
      const bodies = [];
      const seen = new Set();
      function add(doc) {
        if (!doc || !doc.body || seen.has(doc)) return;
        seen.add(doc);
        bodies.push(doc.body);
      }
      add(document);
      document.querySelectorAll("iframe").forEach((fr) => {
        try {
          add(fr.contentDocument);
        } catch (e) {}
      });
      return bodies;
    }

    function normalizeProntuarioDigits(raw) {
      if (raw == null || raw === "") return "";
      const d = String(raw).replace(/\D/g, "");
      return d.replace(/^0+/, "") || d;
    }

    function primeiroNomeFromFull(fullName) {
      if (!fullName || String(fullName).trim() === "") return "";
      const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
      return parts[0] || "";
    }

    function slugPrimeiroNome(s) {
      if (!s) return "unknown";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") || "unknown";
      } catch (e) {
        return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "unknown";
      }
    }

    /**
     * Cabeçalho do POL na casca: "12345678 - NOME SOBRENOME TESTE" ou "12345678-NOME ..." (#pacientePol).
     */
    function parsePolProntuarioNomeLine(raw) {
      if (!raw) return null;
      const t = String(raw).replace(/\s+/g, " ").trim();
      const m = t.match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
      if (!m) return null;
      const nomeCompleto = m[2].trim().replace(/\s{2,}/g, " ");
      if (nomeCompleto.length < 2 || !/[A-Za-zÀ-ÿ]/.test(nomeCompleto)) return null;
      return {
        prontuario: normalizeProntuarioDigits(m[1]),
        nomeCompleto,
      };
    }

    function extractPolPatientFromCascaDom(expectedProntuario) {
      if (
        typeof AghuPatientDomExtract !== "undefined" &&
        AghuPatientDomExtract.extractPolPatientFromCascaDom
      ) {
        return AghuPatientDomExtract.extractPolPatientFromCascaDom(
          document,
          expectedProntuario || undefined
        );
      }
      const polDlg = document.querySelector("#pacientePol .ui-dialog-content");
      if (polDlg) {
        const rawDlg = (polDlg.textContent || polDlg.innerText || "").trim();
        const parsed = parsePolProntuarioNomeLine(rawDlg);
        if (parsed && parsed.prontuario && parsed.nomeCompleto) return parsed;
      }
      const h3 =
        document.querySelector("h3.accordion-tab-pol.ui-state-active") ||
        (document.querySelectorAll("h3.accordion-tab-pol").length === 1
          ? document.querySelector("h3.accordion-tab-pol")
          : null);
      if (h3) {
        const txt = (h3.textContent || h3.innerText || "").replace(/\s+/g, " ").trim();
        let parsed = parsePolProntuarioNomeLine(txt);
        if (!parsed) {
          const title = (h3.getAttribute("title") || "").trim();
          const numMatch = txt.match(/(\d{5,})/);
          if (title && numMatch && /[A-Za-zÀ-ÿ]/.test(title)) {
            parsed = {
              prontuario: normalizeProntuarioDigits(numMatch[1]),
              nomeCompleto: title.replace(/\s{2,}/g, " "),
            };
          }
        }
        if (parsed && parsed.prontuario && parsed.nomeCompleto) return parsed;
      }
      return null;
    }

    /** True quando o acordeão POL visível (evita sobrescrever com POL oculto em outra aba). */
    function isPolPatientHeaderVisible() {
      const h3 =
        (typeof AghuPatientDomExtract !== "undefined" &&
        AghuPatientDomExtract.getActivePolAccordionH3
          ? AghuPatientDomExtract.getActivePolAccordionH3(document)
          : null) ||
        document.querySelector("h3.accordion-tab-pol.ui-state-active") ||
        document.querySelector("h3.accordion-tab-pol");
      if (!h3) return false;
      const s = window.getComputedStyle(h3);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = h3.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function parsePolPatientLooseFromBlob(blob) {
      const m = String(blob).match(/\b(\d{5,})\s*[-–—]\s*([A-Za-zÀ-ÿ][^\n\r]{1,240})/);
      if (!m) return null;
      const nomeCompleto = m[2].trim().replace(/\s{2,}/g, " ");
      if (nomeCompleto.length < 2) return null;
      return {
        prontuario: normalizeProntuarioDigits(m[1]),
        nomeCompleto,
      };
    }

    function mergePatientFromPolAccordion(blob, nomeCompleto, prontRaw, expectedProntuario) {
      const dom = extractPolPatientFromCascaDom(expectedProntuario);
      if (dom && dom.prontuario && dom.nomeCompleto && isPolPatientHeaderVisible()) {
        return { nomeCompleto: dom.nomeCompleto, prontRaw: dom.prontuario };
      }
      if (dom && dom.prontuario && dom.nomeCompleto) {
        return { nomeCompleto: dom.nomeCompleto, prontRaw: dom.prontuario };
      }

      for (const line of String(blob).split(/\n/)) {
        const parsed = parsePolProntuarioNomeLine(line);
        if (parsed && parsed.prontuario && parsed.nomeCompleto) {
          return { nomeCompleto: parsed.nomeCompleto, prontRaw: parsed.prontuario };
        }
      }

      const loose = parsePolPatientLooseFromBlob(blob);
      if (loose && loose.prontuario && loose.nomeCompleto) {
        return { nomeCompleto: loose.nomeCompleto, prontRaw: loose.prontuario };
      }

      const nome = (nomeCompleto || "").trim();
      const pront = (prontRaw || "").trim();
      if (nome && pront) {
        return { nomeCompleto: nome, prontRaw: pront };
      }
      return { nomeCompleto: "", prontRaw: "" };
    }

    /**
     * Paciente / prontuário: seletores DOM primeiro; fallback regex no innerText.
     */
    function extractPatientFromPage(expectedProntuario) {
      const domApi =
        typeof AghuPatientDomExtract !== "undefined" ? AghuPatientDomExtract : null;
      const domHints = domApi
        ? domApi.aggregateDomPatientHints(document)
        : { nomeCompleto: "", prontRaw: "" };
      const blob = domApi
        ? domApi.buildPatientInnerTextBlob(document)
        : (() => {
            let b = "";
            for (const body of collectDocBodiesForPatient()) {
              b += "\n" + (body.innerText || body.textContent || "");
            }
            return b;
          })();

      let nomeCompleto = "";
      let prontRaw = "";
      if (domApi) {
        const parsed = domApi.parsePatientLabelsFromBlob(blob, domHints);
        nomeCompleto = parsed.nomeCompleto;
        prontRaw = parsed.prontRaw;
      } else {
        const mPac = blob.match(/Paciente\s*:\s*([^\n\r]+)/i);
        const mNome = blob.match(/Nome\s*(?:do\s*paciente)?\s*:\s*([^\n\r]+)/i);
        if (mPac) nomeCompleto = mPac[1].trim();
        else if (mNome) nomeCompleto = mNome[1].trim();
        nomeCompleto = nomeCompleto.replace(/\s{2,}/g, " ");
        nomeCompleto = nomeCompleto.replace(/^\d+\s*[-–—]\s*/, "");
        const mPr =
          blob.match(/Prontu[aá]rio\s*:?\s*([\d.\-\s]+)/i) ||
          blob.match(/N[º°]\s*(?:do\s*)?(?:Prontu[aá]rio|Pront\.)\s*:?\s*([\d.\-\s]+)/i);
        if (mPr) prontRaw = mPr[1];
      }

      const polMerged = mergePatientFromPolAccordion(
        blob,
        nomeCompleto,
        prontRaw,
        expectedProntuario
      );
      nomeCompleto = polMerged.nomeCompleto || nomeCompleto;
      prontRaw = polMerged.prontRaw || prontRaw;

      nomeCompleto = (nomeCompleto || "").replace(/\s{2,}/g, " ");
      nomeCompleto = nomeCompleto.replace(/^\d+\s*[-–—]\s*/, "");

      const prontuario = normalizeProntuarioDigits(prontRaw);
      const primeiroNome = primeiroNomeFromFull(nomeCompleto);
      const missing = [];
      if (!nomeCompleto) missing.push("nome do paciente");
      if (!prontuario) missing.push("prontuário");

      const patientKey =
        prontuario && typeof AghuPatientIdentity !== "undefined"
          ? AghuPatientIdentity.buildPatientKey(prontuario)
          : prontuario || null;

      return {
        ok: missing.length === 0,
        missing,
        nomeCompleto,
        primeiroNome,
        prontuario,
        patientKey,
      };
    }

    /** Snapshot para respostas parciais (date_filter, structure, etc.). */
    function patientSnapshot(expectedProntuario) {
      const p = extractPatientFromPage(expectedProntuario);
      return {
        prontuario: p.prontuario || "",
        nomeCompleto: p.nomeCompleto || "",
        primeiroNome: p.primeiroNome || "",
        patientKey: p.patientKey || null,
        ok: p.ok,
      };
    }

    function parseDataColeta(raw) {
      if (typeof AghuDateBr !== "undefined" && AghuDateBr.parseColetaFromRaw) {
        return AghuDateBr.parseColetaFromRaw(raw);
      }
      if (!raw || String(raw).trim() === "") return { iso: null, label: "sem data" };
      return { iso: null, label: "sem data" };
    }

    async function extractExamData(dateFrom, dateTo, expectedProntuario) {
      const frameReady = await ensureExamesFrameReady(12000);
      if (!frameReady.ready) {
        return {
          success: false,
          error:
            "Tabela de exames ainda não carregou após voltar da aba de cadastro. Aguarde e tente novamente.",
          exams: [],
          examesRestored: false,
        };
      }

      const api = examParseApi();
      if (!api) {
        return {
          success: false,
          error: "Módulo de parse de exames não carregado. Recarregue a extensão.",
          exams: [],
        };
      }

      const hit = api.findExamDocument(document);
      const examDoc = hit.doc;
      const tbody = hit.tbody || findTableBody(examDoc);
      if (!tbody) return {
        success: false,
        error: "Tabela de exames não encontrada. Certifique-se de estar na aba 'Exames Liberados' do prontuário.",
        exams: []
      };

      const parsed = api.extractExamsFromTable(
        examDoc,
        tbody,
        dateFrom,
        dateTo,
        parseBrDate,
        parseDataColeta
      );
      const exams = parsed.exams;
      const rowCount = parsed.rowCount;

      if (rowCount === 0) {
        return {
          success: false,
          error: "Nenhum exame encontrado na tabela.",
          exams: [],
          patient: patientSnapshot(expectedProntuario),
        };
      }

      if (rowCount > 0 && exams.length === 0) {
        const structuralCount = parsed.structuralCount != null ? parsed.structuralCount : 0;
        const reason = parsed.reason || (structuralCount === 0 ? "structure" : "date_filter");
        console.warn("[AGHU] extractExamData: linhas visíveis mas nenhuma parseada", {
          rowCount: rowCount,
          structuralCount: structuralCount,
          sampleCellCount: parsed.sampleCellCount,
          reason: reason,
        });

        if (reason === "date_filter" && structuralCount > 0) {
          const fmtIso = (iso) => {
            if (!iso) return "todas as datas";
            if (typeof AghuDateBr !== "undefined" && AghuDateBr.isoToBr) {
              return AghuDateBr.isoToBr(iso) || iso;
            }
            const p = iso.split("-");
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
          };
          const rangeLabel =
            dateFrom && dateTo && dateFrom === dateTo
              ? fmtIso(dateFrom)
              : dateFrom && dateTo
                ? `${fmtIso(dateFrom)} — ${fmtIso(dateTo)}`
                : dateFrom
                  ? `a partir de ${fmtIso(dateFrom)}`
                  : dateTo
                    ? `até ${fmtIso(dateTo)}`
                    : "intervalo selecionado";
          return {
            success: false,
            error:
              "Nenhum exame em " +
              rangeLabel +
              " — " +
              rowCount +
              " linha(s) na tabela. Limpe o filtro ou amplie o intervalo.",
            exams: [],
            reason: "date_filter",
            patient: patientSnapshot(expectedProntuario),
            debug: {
              rowCount: rowCount,
              structuralCount: structuralCount,
              sampleCellCount: parsed.sampleCellCount,
            },
          };
        }

        return {
          success: false,
          error:
            rowCount +
            " linha(s) visível(is) na tabela, mas nenhuma foi interpretada — possível mudança no layout do AGHU.",
          exams: [],
          reason: "structure",
          patient: patientSnapshot(expectedProntuario),
          debug: {
            rowCount: rowCount,
            structuralCount: structuralCount,
            sampleCellCount: parsed.sampleCellCount,
          },
        };
      }

      const structuralCount =
        parsed.structuralCount != null ? parsed.structuralCount : 0;
      const emptyExamNameCount =
        parsed.emptyExamNameCount != null ? parsed.emptyExamNameCount : 0;
      if (
        structuralCount > 0 &&
        emptyExamNameCount / structuralCount > 0.5
      ) {
        console.warn("[AGHU] extractExamData: parse quality gate", {
          rowCount: rowCount,
          structuralCount: structuralCount,
          emptyExamNameCount: emptyExamNameCount,
          examsParsed: exams.length,
          colMap: parsed.colMap,
        });
        return {
          success: false,
          error:
            rowCount +
            " linha(s) na tabela, mas os nomes dos exames não foram lidos — possível desalinhamento de colunas no AGHU.",
          exams: [],
          reason: "parse_quality",
          patient: patientSnapshot(expectedProntuario),
          examesRestored: true,
          debug: {
            rowCount: rowCount,
            structuralCount: structuralCount,
            emptyExamNameCount: emptyExamNameCount,
            colMap: parsed.colMap,
          },
        };
      }

      const patient = extractPatientFromPage(expectedProntuario);

      return { success: true, exams, total: exams.length, patient, examesRestored: true };
    }

    /**
     * Volta para a lista de exames após abrir PDF (mesma aba / histórico).
     */
    async function goBackToExamList(timeoutMs) {
      const cfg = pdfFetchCfg();
      const waitMs = timeoutMs != null ? timeoutMs : cfg.GO_BACK_MS;
      try {
        await browser.runtime.sendMessage({ action: "aghuGoBack" });
      } catch (e) {
        try { window.history.back(); } catch (_) {}
      }
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await sleep(300);
        const examDoc = findExamDocument();
        const tbody   = findTableBody(examDoc);
        if (tbody && tbody.querySelector("tr[data-ri]")) {
          return true;
        }
      }
      console.warn("[AGHU] goBackToExamList: tabela não reapareceu a tempo");
      return false;
    }

    /**
     * Regista id de captura antes de abrir PDF (evita consumir resultado de outro clique).
     */
    async function beginPdfCapture() {
      const captureId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await browser.storage.local.set({ aghu_pdf_capture_id: captureId });
      await browser.storage.local.remove("aghu_pdf_result");
      return captureId;
    }

    /**
     * Aguarda aghu_pdf_result no storage (formato novo com ok/reason ou legado só com text).
     */
    async function waitForPdfResult(timeoutMs, expectedCaptureId) {
      const waitApi = typeof AghuPdfFetchWait !== "undefined" ? AghuPdfFetchWait : null;
      if (waitApi && waitApi.waitForPdfResult) {
        const cfg = pdfFetchCfg();
        const waitMs = timeoutMs != null ? timeoutMs : cfg.WAIT_PDF_DEFAULT_MS;
        return waitApi.waitForPdfResult(browser.storage.local, waitMs, expectedCaptureId);
      }
      const cfg = pdfFetchCfg();
      const waitMs = timeoutMs != null ? timeoutMs : cfg.WAIT_PDF_DEFAULT_MS;
      const pollMs = cfg.POLL_PDF_MS;
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await sleep(pollMs);
        try {
          const stored = await browser.storage.local.get("aghu_pdf_result");
          const r = stored.aghu_pdf_result;
          if (!r) continue;

          if (expectedCaptureId) {
            if (r.captureId && r.captureId !== expectedCaptureId) continue;
            if (!r.captureId && typeof r.ok === "boolean") continue;
          }

          if (typeof r.ok === "boolean") {
            await browser.storage.local.remove("aghu_pdf_result");
            const text  = r.text || "";
            const pages = r.pages || [];
            if (r.ok) {
              const reason = r.reason || (text.length === 0 ? "no_text_extracted" : undefined);
              console.log("[AGHU] PDF result ok, chars:", text.length, "| páginas:", pages.length, reason || "");
              return {
                success: true,
                text,
                pages,
                isPdf: true,
                reason: reason || null,
              };
            }
            console.warn("[AGHU] PDF result ok=false reason=", r.reason);
            return {
              success: false,
              text: "",
              pages: [],
              isPdf: true,
              reason: r.reason || "pdf_result_error",
            };
          }

          if (r.text && r.text.length > 0) {
            await browser.storage.local.remove("aghu_pdf_result");
            console.log("[AGHU] PDF result (legado), chars:", r.text.length, "| páginas:", (r.pages || []).length);
            return { success: true, text: r.text, pages: r.pages || [], isPdf: true, reason: null };
          }
        } catch (e) {}
      }
      console.warn("[AGHU] waitForPdfResult timed out");
      return { success: false, text: "", pages: [], isPdf: false, reason: "wait_timeout" };
    }

    // ── Seleciona múltiplos checkboxes e dispara Resultado uma única vez ───────
    // Usado para exames internos (sem clipe): marca todos, clica no botão,
    // aguarda o PDF consolidado, desmarca todos, retorna o texto.
    async function selectGroupAndGetResult(indices) {
      const cfg = pdfFetchCfg();
      const examDoc = findExamDocument();
      const tbody   = findTableBody(examDoc);
      if (!tbody) return { success: false, text: "", indices, reason: "pdf_result_error" };

      const captureId = await beginPdfCapture();
      const requestedCount = indices.length;

      // Desmarca checkboxes já selecionados (evita PDF com exames extras)
      for (const row of tbody.querySelectorAll("tr[data-ri]")) {
        const cb = row.querySelector("input[type='checkbox']");
        if (cb && cb.checked) {
          cb.click();
        }
      }
      await sleep(200);

      const checked = [];
      for (const idx of indices) {
        const row = tbody.querySelector(`tr[data-ri="${idx}"]`);
        if (!row) continue;
        const cb = row.querySelector("input[type='checkbox']");
        if (!cb) continue;
        if (!cb.checked) cb.click();
        checked.push(cb);
        await sleep(150);
      }

      if (checked.length === 0) {
        return { success: false, text: "", indices, reason: "no_checkbox", isPdf: true };
      }

      console.log(
        "[AGHU] batch:",
        checked.length + "/" + requestedCount,
        "checkboxes marcados"
      );

      await sleep(600);

      const resultBtn = examDoc.querySelector("button[id*='bt_resultadosExamesLiberados']");
      if (!resultBtn || resultBtn.disabled) {
        checked.forEach(cb => { if (cb.checked) cb.click(); });
        console.warn("[AGHU] botão Resultado não disponível após marcar grupo");
        return { success: false, text: "", indices, reason: "result_button_disabled", isPdf: true };
      }

      console.log("[AGHU] clicking Resultado para grupo de", checked.length, "exames");
      resultBtn.click();

      const timeout = cfg.batchWaitMs(indices.length);
      const result = await waitForPdfResult(timeout, captureId);
      result.indices = indices;
      result.requestedCount = requestedCount;
      result.checkedCount = checked.length;
      result.partial_selection = checked.length < requestedCount;

      await goBackToExamList();

      checked.forEach(cb => { try { if (cb.checked) cb.click(); } catch(e) {} });

      await pauseBetweenPdfFetches();
      return result;
    }

    function buildExamKeysFromRequest(request) {
      if (!request) return null;
      const keys = {};
      if (request.solicitation != null) keys.solicitation = request.solicitation;
      if (request.examName != null) keys.examName = request.examName;
      if (request.dataColetaISO != null) keys.dataColetaISO = request.dataColetaISO;
      if (request.sample != null) keys.sample = request.sample;
      return Object.keys(keys).length ? keys : null;
    }

    function resolveRowForExamAction(examDoc, tbody, rowIndex, examKeys) {
      const api = examParseApi();
      if (api && api.resolveExamRow) {
        return api.resolveExamRow(tbody, examDoc, rowIndex, examKeys, parseDataColeta);
      }
      if (rowIndex == null) return null;
      return tbody.querySelector(`tr[data-ri="${rowIndex}"]`);
    }

    async function clickCheckboxAndGetResult(rowIndex, examKeys) {
      const cfg = pdfFetchCfg();
      const examDoc = findExamDocument();
      const tbody   = findTableBody(examDoc);
      if (!tbody) return { success: false, text: "", rowIndex, reason: "pdf_result_error" };

      const row = resolveRowForExamAction(examDoc, tbody, rowIndex, examKeys);
      if (!row) return { success: false, text: "", rowIndex, reason: "pdf_result_error" };

      const resolvedIndex = parseInt(row.getAttribute("data-ri"), 10);
      if (Number.isFinite(resolvedIndex)) rowIndex = resolvedIndex;

      const checkbox = row.querySelector("input[type='checkbox']");
      if (!checkbox) {
        return { success: false, text: "", rowIndex, reason: "no_checkbox", isPdf: true };
      }

      const captureId = await beginPdfCapture();

      checkbox.click();
      await sleep(800);

      const resultBtn = examDoc.querySelector("button[id*='bt_resultadosExamesLiberados']");
      if (!resultBtn || resultBtn.disabled) {
        checkbox.click();
        return { success: false, text: "", rowIndex, reason: "result_button_disabled", isPdf: true };
      }

      console.log("[AGHU] clicking Resultado for rowIndex", rowIndex);
      resultBtn.click();

      const result = await waitForPdfResult(cfg.WAIT_PDF_DEFAULT_MS, captureId);
      result.rowIndex = rowIndex;

      await goBackToExamList();

      try {
        resolveRowForExamAction(examDoc, tbody, rowIndex, examKeys)
          ?.querySelector("input[type='checkbox']:checked")
          ?.click();
      } catch(e) {}
      await pauseBetweenPdfFetches();
      return result;
    }

    async function clickAttachStart(rowIndex, examKeys) {
      const examDoc = findExamDocument();
      const tbody   = findTableBody(examDoc);
      if (!tbody) {
        return { ok: false, rowIndex, reason: "pdf_result_error" };
      }

      const row = resolveRowForExamAction(examDoc, tbody, rowIndex, examKeys);
      if (!row) {
        return { ok: false, rowIndex, reason: "pdf_result_error" };
      }

      const resolvedIndex = parseInt(row.getAttribute("data-ri"), 10);
      if (Number.isFinite(resolvedIndex)) rowIndex = resolvedIndex;

      const attachLink = row.querySelector("a.silk-attach");
      if (!attachLink) {
        return { ok: false, rowIndex, reason: "no_attach_link" };
      }

      const captureId = await beginPdfCapture();

      console.log("[AGHU] clicking attach for rowIndex", rowIndex);
      attachLink.click();

      return { ok: true, rowIndex, captureId };
    }

    async function clickAttachAndCapture(rowIndex, examKeys) {
      const cfg = pdfFetchCfg();
      const started = await clickAttachStart(rowIndex, examKeys);
      if (!started.ok) {
        return {
          success: false,
          text: "",
          rowIndex,
          reason: started.reason || "pdf_result_error",
          isPdf: true,
        };
      }

      const waitMs =
        typeof cfg.attachWaitMs === "function" ? cfg.attachWaitMs() : cfg.WAIT_ATTACH_MS;
      const result = await waitForPdfResult(waitMs, started.captureId);
      result.rowIndex = rowIndex;

      await goBackToExamList();

      const examDoc = findExamDocument();
      closeDialogs(examDoc);
      await pauseBetweenPdfFetches();
      return result;
    }

    function closeDialogs(targetDoc) {
      (targetDoc || document).querySelectorAll(
        ".ui-dialog-titlebar-close, .ui-overlaypanel-close, .ui-icon-closethick"
      ).forEach(btn => { try { (btn.closest("a, button") || btn).click(); } catch(e) {} });
    }

    function normPolTabLabel(raw) {
      return String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function findPolTreeLink(labelText) {
      const target = normPolTabLabel(labelText);
      const links = document.querySelectorAll("a.node-link-pol");
      for (const a of links) {
        const t = normPolTabLabel(a.textContent);
        if (t === target) return a;
      }
      return null;
    }

    function clickPolTab(labelText) {
      const link = findPolTreeLink(labelText);
      if (!link) return false;
      const label = link.closest(".ui-treenode-label") || link;
      try {
        label.click();
        return true;
      } catch (e) {
        try {
          link.click();
          return true;
        } catch (_e2) {
          return false;
        }
      }
    }

    async function waitForPolFrame(predicate, timeoutMs) {
      const waitMs = timeoutMs != null ? timeoutMs : 15000;
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const frame = document.querySelector("#frame_pol, iframe[name='frame_pol']");
        if (frame) {
          let doc = null;
          try {
            doc = frame.contentDocument;
          } catch (e) {}
          if (doc && doc.body) {
            if (!predicate || predicate(doc, frame)) {
              return { frame, doc };
            }
          }
        }
        await sleep(250);
      }
      return null;
    }

    function readPolFrameDoc() {
      const frame = document.querySelector("#frame_pol, iframe[name='frame_pol']");
      if (!frame) return null;
      try {
        return frame.contentDocument || null;
      } catch (_e) {
        return null;
      }
    }

    function examesRestorePlan(frameDoc) {
      const navApi =
        typeof AghuCascaNav !== "undefined" ? AghuCascaNav : null;
      if (navApi && typeof navApi.planExamesRestoreClick === "function") {
        return navApi.planExamesRestoreClick(document, frameDoc);
      }
      return { needsClick: true, link: findPolTreeLink("Exames") };
    }

    /**
     * Grelha já visível → não clica (cadastro desligado).
     * Frame noutro nó POL (p.ex. Histórico após cadastro) → clica o <a> Exames
     * e só então espera a tabela. Não usa clickExamesAndWaitLiberados
     * (fingerprint de sessão recusaria a mesma grelha).
     */
    async function ensureExamesFrameReady(timeoutMs) {
      const waitMs = timeoutMs != null ? timeoutMs : 12000;
      const probeMs = Math.min(500, waitMs);

      let plan = examesRestorePlan(readPolFrameDoc());
      if (plan && plan.needsClick) {
        const probed = await waitForPolFrame(polFrameHasExamesTable, probeMs);
        if (probed && probed.doc) {
          return { ready: true, examesRestored: true };
        }
        plan = examesRestorePlan(readPolFrameDoc());
      }

      if (plan && plan.needsClick && plan.link) {
        try {
          plan.link.click();
        } catch (_eClick) {}
        await sleep(400);
      }

      const hit = await waitForPolFrame(polFrameHasExamesTable, waitMs);
      if (!hit || !hit.doc) {
        return { ready: false, examesRestored: false };
      }
      return { ready: true, examesRestored: true };
    }

    function polFrameHasExamesTable(doc) {
      const demoApi =
        typeof AghuPatientPolDemographics !== "undefined"
          ? AghuPatientPolDemographics
          : null;
      if (demoApi && demoApi.frameLooksLikeExames && demoApi.frameLooksLikeExames(doc)) {
        return true;
      }
      const api = examParseApi();
      if (!api) return false;
      const rootDoc = doc || document;
      const examHit = api.findExamDocument(rootDoc);
      return !!(
        examHit &&
        examHit.tbody &&
        examHit.tbody.querySelector("tr[data-ri]")
      );
    }

    async function extractPatientDemographics() {
      const demoApi =
        typeof AghuPatientPolDemographics !== "undefined"
          ? AghuPatientPolDemographics
          : null;
      if (!demoApi || !demoApi.extractDemographicsFromDoc) {
        return {
          ok: false,
          error: "Módulo de demografia POL não carregado.",
          missing: ["module"],
        };
      }

      const restoreTab = "Exames";
      const dadosTab = "Dados do Paciente";

      const polHeader = extractPolPatientFromCascaDom();
      let prontuario = polHeader ? polHeader.prontuario : "";
      let patientKey = null;
      let primeiroNome = "";
      if (prontuario && typeof AghuPatientIdentity !== "undefined") {
        patientKey = AghuPatientIdentity.buildPatientKey(prontuario);
      }
      if (polHeader && polHeader.nomeCompleto) {
        primeiroNome = primeiroNomeFromFull(polHeader.nomeCompleto);
      }
      if (!prontuario || !patientKey) {
        const pagePatient = extractPatientFromPage();
        if (pagePatient.prontuario) prontuario = pagePatient.prontuario;
        if (pagePatient.patientKey) patientKey = pagePatient.patientKey;
        if (pagePatient.primeiroNome) primeiroNome = pagePatient.primeiroNome;
      }

      if (!clickPolTab(dadosTab)) {
        return {
          ok: false,
          error: 'Aba "' + dadosTab + '" não encontrada na árvore do POL.',
          missing: ["navigation"],
          prontuario: prontuario || null,
          patientKey: patientKey || null,
          primeiroNome: primeiroNome || "",
        };
      }

      await sleep(400 + Math.floor(Math.random() * 200));

      const hit = await waitForPolFrame(
        (doc) => demoApi.frameLooksLikeDadosPaciente(doc),
        18000,
      );
      if (!hit || !hit.doc) {
        clickPolTab(restoreTab);
        return {
          ok: false,
          error: "Dados do paciente não carregaram no frame do POL a tempo.",
          missing: ["timeout"],
          prontuario: prontuario || null,
          patientKey: patientKey || null,
          primeiroNome: primeiroNome || "",
        };
      }

      let frameUrl = "";
      try {
        frameUrl = String(hit.doc.location && hit.doc.location.href ? hit.doc.location.href : "");
      } catch (_e) {}

      const parsed = await (async function pollDemographicsParse(doc) {
        let last = demoApi.extractDemographicsFromDoc(doc);
        for (let attempt = 0; attempt < 3 && !last.dataNascimentoISO; attempt++) {
          await sleep(400);
          last = demoApi.extractDemographicsFromDoc(doc);
        }
        console.log("[AGHU] demographics parse", {
          hasDob: !!last.dataNascimentoISO,
          hasSex: !!last.sexo,
          hasNome: !!last.nomeCompleto,
        });
        return last;
      })(hit.doc);
      const sexo = parsed.sexo || null;
      const dataNascimentoISO = parsed.dataNascimentoISO || null;
      const nomeCompleto = parsed.nomeCompleto || null;
      const result = {
        ok: !!(sexo || dataNascimentoISO || nomeCompleto),
        sexo: sexo,
        dataNascimentoISO: dataNascimentoISO,
        nomeCompleto: nomeCompleto,
        prontuario: prontuario || null,
        patientKey: patientKey || null,
        primeiroNome: primeiroNome || "",
        frameUrl: frameUrl || undefined,
        missing: Array.isArray(parsed.missing) ? parsed.missing.slice() : [],
      };
      if (!result.ok && result.missing.length) {
        result.error =
          "Demografia incompleta: " + result.missing.join(", ");
      }
      if (nomeCompleto) {
        result.primeiroNome = primeiroNomeFromFull(nomeCompleto);
      }

      clickPolTab(restoreTab);
      await sleep(400 + Math.floor(Math.random() * 200));
      const restored = await ensureExamesFrameReady(12000);
      result.examesRestored = restored.examesRestored !== false;

      return result;
    }

    function getActivePolTabLabel() {
      const selected =
        document.querySelector(
          ".ui-treenode-selected a.node-link-pol, a.node-link-pol.ui-state-highlight, .ui-state-highlight a.node-link-pol, .ui-treenode-content.ui-state-highlight a.node-link-pol",
        ) || null;
      if (selected) {
        const t = String(selected.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (t) return t;
      }
      return null;
    }

    async function extractPatientCadastro() {
      const demoApi =
        typeof AghuPatientPolDemographics !== "undefined"
          ? AghuPatientPolDemographics
          : null;
      const histApi =
        typeof AghuPatientPolHistoricoInternacoes !== "undefined"
          ? AghuPatientPolHistoricoInternacoes
          : null;
      if (!demoApi || !demoApi.extractDemographicsFromDoc) {
        return {
          ok: false,
          error: "Módulo de demografia POL não carregado.",
          missing: ["module"],
        };
      }
      if (!histApi || !histApi.extractInternacoesFromDoc) {
        return {
          ok: false,
          error: "Módulo de internações POL não carregado.",
          missing: ["module"],
        };
      }

      const previousTab = getActivePolTabLabel();
      const dadosTab = "Dados do Paciente";
      const histTab = "Histórico do Paciente";

      const polHeader = extractPolPatientFromCascaDom();
      let prontuario = polHeader ? polHeader.prontuario : "";
      let patientKey = null;
      let primeiroNome = "";
      if (prontuario && typeof AghuPatientIdentity !== "undefined") {
        patientKey = AghuPatientIdentity.buildPatientKey(prontuario);
      }
      if (polHeader && polHeader.nomeCompleto) {
        primeiroNome = primeiroNomeFromFull(polHeader.nomeCompleto);
      }
      if (!prontuario || !patientKey) {
        const pagePatient = extractPatientFromPage();
        if (pagePatient.prontuario) prontuario = pagePatient.prontuario;
        if (pagePatient.patientKey) patientKey = pagePatient.patientKey;
        if (pagePatient.primeiroNome) primeiroNome = pagePatient.primeiroNome;
      }

      let demographics = null;
      let demografiaError = null;
      if (!clickPolTab(dadosTab)) {
        demografiaError =
          'Aba "' + dadosTab + '" não encontrada na árvore do POL.';
      } else {
        await sleep(400 + Math.floor(Math.random() * 200));
        const hit = await waitForPolFrame(
          (doc) => demoApi.frameLooksLikeDadosPaciente(doc),
          18000,
        );
        if (!hit || !hit.doc) {
          demografiaError =
            "Dados do paciente não carregaram no frame do POL a tempo.";
        } else {
          let last = demoApi.extractDemographicsFromDoc(hit.doc);
          for (
            let attempt = 0;
            attempt < 3 && !last.dataNascimentoISO;
            attempt++
          ) {
            await sleep(400);
            last = demoApi.extractDemographicsFromDoc(hit.doc);
          }
          demographics = last;
          console.log("[AGHU] cadastro demografia", {
            hasDob: !!last.dataNascimentoISO,
            hasSex: !!last.sexo,
            hasNome: !!last.nomeCompleto,
            hasMae: !!last.nomeMae,
            hasSus: !!last.cartaoSus,
            hasAddr: !!last.patientAddress,
          });
        }
      }

      let internacoes = [];
      let internacoesError = null;
      if (!clickPolTab(histTab)) {
        internacoesError =
          'Aba "' + histTab + '" não encontrada na árvore do POL.';
      } else {
        await sleep(400 + Math.floor(Math.random() * 200));
        const histHit = await waitForPolFrame(
          (doc) =>
            histApi.frameLooksLikeHistoricoInternacoes
              ? histApi.frameLooksLikeHistoricoInternacoes(doc)
              : !!(doc && doc.querySelector && doc.querySelector("#field_internacoes")),
          18000,
        );
        if (!histHit || !histHit.doc) {
          internacoesError =
            "Histórico / Internações não carregaram no frame a tempo.";
        } else {
          internacoes = histApi.extractInternacoesFromDoc(histHit.doc) || [];
          console.log("[AGHU] cadastro internacoes", {
            count: internacoes.length,
          });
        }
      }

      if (previousTab) {
        clickPolTab(previousTab);
        await sleep(300 + Math.floor(Math.random() * 200));
      }

      const hasDemo =
        !!(
          demographics &&
          (demographics.sexo ||
            demographics.dataNascimentoISO ||
            demographics.nomeCompleto ||
            demographics.nomeMae ||
            demographics.cartaoSus ||
            demographics.patientAddress)
        );
      const ok = hasDemo || internacoes.length > 0;
      const result = {
        ok: ok,
        prontuario: prontuario || null,
        patientKey: patientKey || null,
        primeiroNome: primeiroNome || "",
        demographics: demographics,
        internacoes: internacoes,
        restoredTab: previousTab || null,
        missing: [],
      };
      if (demographics && demographics.nomeCompleto) {
        result.primeiroNome = primeiroNomeFromFull(demographics.nomeCompleto);
        result.nomeCompleto = demographics.nomeCompleto;
      }
      if (demografiaError) result.demografiaError = demografiaError;
      if (internacoesError) result.internacoesError = internacoesError;
      if (!ok) {
        result.error =
          demografiaError ||
          internacoesError ||
          "Cadastro incompleto: sem demografia nem internações.";
        result.missing = ["cadastro"];
      }
      return result;
    }

    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "extractExams") {
        if (request.billingDenied) {
          sendResponse({
            success: false,
            error: request.billingMessage || "Extração bloqueada pelo plano actual.",
            reason: "billing",
          });
          return false;
        }
        extractExamData(
          request.dateFrom || null,
          request.dateTo || null,
          request.expectedProntuario || null
        ).then(sendResponse);
        return true;
      }
      if (request.action === "extractPatientDemographics") {
        extractPatientDemographics().then(sendResponse);
        return true;
      }
      if (request.action === "extractPatientCadastro") {
        extractPatientCadastro().then(sendResponse);
        return true;
      }
      if (request.action === "selectGroupAndGetResult") {
        selectGroupAndGetResult(request.indices).then(sendResponse);
        return true;
      }
      if (request.action === "clickCheckboxResult") {
        const examKeys = buildExamKeysFromRequest(request);
        clickCheckboxAndGetResult(request.rowIndex, examKeys).then(sendResponse);
        return true;
      }
      if (request.action === "clickAttachStart") {
        const examKeys = buildExamKeysFromRequest(request);
        clickAttachStart(request.rowIndex, examKeys).then(sendResponse);
        return true;
      }
      if (request.action === "clickAttach") {
        const examKeys = buildExamKeysFromRequest(request);
        clickAttachAndCapture(request.rowIndex, examKeys).then(sendResponse);
        return true;
      }
      return false;
    });

  })(); // end MODE B
}
