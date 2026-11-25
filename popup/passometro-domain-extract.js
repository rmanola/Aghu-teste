/**
 * Extractores de domínio invocáveis pelo Passômetro one-click (sem click de botão).
 * Reutiliza sendMessage + archives existentes. Fail-soft por domínio.
 */
(function (root) {
  "use strict";

  var NAV_SCRIPT_FILES =
    (root.AghuActiveTab && root.AghuActiveTab.CASCA_NAV_SCRIPT_FILES) || [
      "lib/patient-identity.js",
      "content/aghu-casca-nav.js",
    ];

  async function resolveTabId() {
    var tabApi = root.AghuActiveTab;
    if (tabApi && tabApi.resolveAghuTabIdFromBrowser) {
      return tabApi.resolveAghuTabIdFromBrowser();
    }
    try {
      var stored = await browser.storage.local.get("aghu_source_tab_id");
      if (stored.aghu_source_tab_id) return stored.aghu_source_tab_id;
    } catch (_e) {}
    return null;
  }

  async function persistTab(tabId) {
    var tabApi = root.AghuActiveTab;
    if (tabApi && tabApi.persistAghuTabId && tabId != null) {
      try {
        await tabApi.persistAghuTabId(tabId);
      } catch (_e) {}
    }
  }

  var NAV_TIMEOUT_BY_TARGET = {
    controles: 120000,
    prescricoes: 90000,
  };

  async function send(tabId, message, injectFiles, timeoutMs, forceInjectBeforeSend) {
    var tabApi = root.AghuActiveTab;
    if (tabApi && tabApi.sendTabMessageWithTimeout) {
      return tabApi.sendTabMessageWithTimeout(tabId, message, {
        timeoutMs: timeoutMs || 45000,
        injectFiles: injectFiles || null,
        forceInjectBeforeSend: !!forceInjectBeforeSend,
      });
    }
    return browser.tabs.sendMessage(tabId, message);
  }

  async function ensureTab() {
    var tabId = await resolveTabId();
    if (!tabId) {
      throw new Error(
        "Nenhuma aba AGHU encontrada. Abra o AGHU autenticado e tente de novo."
      );
    }
    await persistTab(tabId);
    return tabId;
  }

  async function nav(target, prontuario, period) {
    var tabId = await ensureTab();
    var navTimeoutMs = NAV_TIMEOUT_BY_TARGET[target] || 60000;
    var res = await send(
      tabId,
      {
        action: "aghuCascaNav",
        target: target,
        prontuario: prontuario,
        period: period || null,
      },
      NAV_SCRIPT_FILES,
      navTimeoutMs,
      false
    );
    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res && res.error) || "Navegação " + target + " falhou.",
      };
    }
    return { ok: true, tabId: tabId };
  }

  function normalizeProntForGate(raw) {
    var identity = root.AghuPatientIdentity;
    if (raw && identity && identity.normalizeProntuario) {
      return identity.normalizeProntuario(raw);
    }
    if (!raw) return "";
    return (
      String(raw).replace(/\D/g, "").replace(/^0+/, "") || String(raw)
    );
  }

  /**
   * DOM com prontuário explícito ≠ item do lote → bloquear merge/save (anti-leak).
   * @returns {{ mismatch: boolean, error?: string, domNorm: string, loteNorm: string }}
   */
  function loteDomProntuarioMismatch(res, loteProntuario) {
    var p = (res && res.patient) || {};
    var loteNorm = normalizeProntForGate(loteProntuario);
    var domNorm = normalizeProntForGate(p.prontuario);
    if (domNorm && loteNorm && domNorm !== loteNorm) {
      return {
        mismatch: true,
        domNorm: domNorm,
        loteNorm: loteNorm,
        error:
          "Paciente no AGHU ≠ prontuário do lote. Confirme a seleção no AGHU e tente de novo.",
      };
    }
    return { mismatch: false, domNorm: domNorm, loteNorm: loteNorm };
  }

  /**
   * Gate estrito (exames one-click): exige domNorm === loteNorm antes do merge.
   * Sem prontuário no DOM ou divergente → bloquear (não grava na chave do lote).
   * @returns {{ mismatch: boolean, error?: string, domNorm: string, loteNorm: string }}
   */
  function requireLoteDomProntuarioMatch(res, loteProntuario) {
    var soft = loteDomProntuarioMismatch(res, loteProntuario);
    if (soft.mismatch) return soft;
    if (!soft.domNorm || !soft.loteNorm || soft.domNorm !== soft.loteNorm) {
      return {
        mismatch: true,
        domNorm: soft.domNorm,
        loteNorm: soft.loteNorm,
        error:
          "Paciente no AGHU ≠ prontuário do lote. Confirme a seleção no AGHU e tente de novo.",
      };
    }
    return soft;
  }

  function patientFromResponse(res, fallbackProntuario) {
    var p = (res && res.patient) || {};
    var identity = root.AghuPatientIdentity;
    var fallbackNorm = normalizeProntForGate(fallbackProntuario);
    var domNorm = normalizeProntForGate(p.prontuario);
    // Chave do lote quando DOM diverge (lista POL acumulativa).
    var prontuario = fallbackNorm || domNorm || "";
    var patientKey =
      (identity && identity.buildPatientKey
        ? identity.buildPatientKey(prontuario)
        : null) ||
      prontuario;
    var prontMatch = !!(fallbackNorm && domNorm && fallbackNorm === domNorm);
    // Nome do DOM só se prontuário DOM == lote; senão evita nome de A na chave de B.
    var nomeCompleto = prontMatch ? p.nomeCompleto || p.nome || "" : "";
    var primeiroNome = prontMatch ? p.primeiroNome || "" : "";
    if (!fallbackNorm && domNorm) {
      nomeCompleto = p.nomeCompleto || p.nome || "";
      primeiroNome = p.primeiroNome || "";
    }
    return {
      prontuario: prontuario,
      patientKey: patientKey,
      primeiroNome: primeiroNome,
      nomeCompleto: nomeCompleto,
      ok: !!(prontuario && patientKey),
    };
  }

  async function extractExames(ctx) {
    var tabId = await ensureTab();
    var period = ctx.period || {};
    var response = await send(
      tabId,
      {
        action: "extractExams",
        dateFrom: period.dateFromIso || null,
        dateTo: period.dateToIso || null,
        expectedProntuario: ctx.prontuario || null,
      },
      null,
      60000
    );

    if (!response || !response.success) {
      var structuralCount =
        (response &&
          response.debug &&
          response.debug.structuralCount != null &&
          response.debug.structuralCount) ||
        0;
      if (response && response.reason === "date_filter" && structuralCount > 0) {
        if (
          (!response.patient || !response.patient.prontuario) &&
          ctx.prontuario
        ) {
          response = Object.assign({}, response, {
            patient: { prontuario: ctx.prontuario },
          });
        }
        var mismatchSoft = requireLoteDomProntuarioMatch(response, ctx.prontuario);
        if (mismatchSoft.mismatch) {
          return { ok: false, error: mismatchSoft.error };
        }
        var patientSoft = patientFromResponse(response, ctx.prontuario);
        if (
          root.AghuPatientArchive &&
          root.AghuPatientArchive.ensureMinimalPatientRecord &&
          patientSoft.patientKey
        ) {
          try {
            await root.AghuPatientArchive.ensureMinimalPatientRecord({
              patientKey: patientSoft.patientKey,
              primeiroNome: patientSoft.primeiroNome,
              nomeCompleto: patientSoft.nomeCompleto,
              prontuario: patientSoft.prontuario,
            });
          } catch (_eSoft) {}
        }
        return {
          ok: true,
          patient: patientSoft,
          examsCount: 0,
          warning:
            response.error ||
            "Nenhum exame no período selecionado (tabela com linhas parseáveis).",
        };
      }
      return {
        ok: false,
        error:
          (response && response.error) ||
          "Falha ao extrair exames. Confirme POL aberto.",
      };
    }

    var mismatchEx = requireLoteDomProntuarioMatch(response, ctx.prontuario);
    if (mismatchEx.mismatch) {
      return { ok: false, error: mismatchEx.error };
    }

    var patient = patientFromResponse(response, ctx.prontuario);
    var exams = (response.exams || []).map(function (e) {
      return Object.assign({}, e);
    });
    var fetchPipeline = root.AghuExamsFetchPipeline;
    if (fetchPipeline && fetchPipeline.initExamFetchFields) {
      exams.forEach(fetchPipeline.initExamFetchFields);
    } else {
      exams.forEach(function (e) {
        if (e.fetchHint === undefined) e.fetchHint = "";
        if (e.fetchReason === undefined) e.fetchReason = "";
        if (e.aiOrganized === undefined) e.aiOrganized = "";
      });
    }

    var patientMeta = {
      patientKey: patient.patientKey,
      primeiroNome: patient.primeiroNome,
      nomeCompleto: patient.nomeCompleto,
      prontuario: patient.prontuario,
    };

    if (
      root.AghuPatientArchive &&
      root.AghuPatientArchive.mergeExamsIntoRecord &&
      patient.patientKey &&
      exams.length
    ) {
      try {
        await root.AghuPatientArchive.mergeExamsIntoRecord(patientMeta, exams, {
          dateFrom: period.dateFromIso || null,
          dateTo: period.dateToIso || null,
          mode: "window_overwrite",
        });
      } catch (_e) {}
    } else if (
      root.AghuPatientArchive &&
      root.AghuPatientArchive.ensureMinimalPatientRecord &&
      patient.patientKey
    ) {
      try {
        await root.AghuPatientArchive.ensureMinimalPatientRecord(patientMeta);
      } catch (_e) {}
    }

    var fetchStats = { pdfsAttempted: 0, pdfsOk: 0 };
    var hadPending =
      fetchPipeline &&
      fetchPipeline.runExamsPdfFetch &&
      patient.patientKey &&
      exams.length &&
      exams.some(function (e) {
        var pendingFetch = root.AghuPdfFetchPartition?.isExamPendingFetch;
        return pendingFetch
          ? pendingFetch(e)
          : !e.fetchedResult &&
              !e.detailText &&
              e.result === "" &&
              (e.hasCheckbox || e.hasAttachment);
      });

    if (hadPending) {
      try {
        fetchStats = await fetchPipeline.runExamsPdfFetch(tabId, exams, {
          patientKey: patient.patientKey,
          period: period,
          onProgress: ctx.onProgress,
        });
      } catch (_fetchErr) {
        fetchStats = {
          pdfsAttempted: 0,
          pdfsOk: 0,
          warning: "Fetch PDF falhou parcialmente.",
        };
      }
    }

    if (
      root.AghuPatientArchive &&
      root.AghuPatientArchive.mergeExamsIntoRecord &&
      patient.patientKey &&
      exams.length &&
      hadPending
    ) {
      try {
        await root.AghuPatientArchive.mergeExamsIntoRecord(patientMeta, exams, {
          dateFrom: period.dateFromIso || null,
          dateTo: period.dateToIso || null,
          mode: "window_overwrite",
        });
      } catch (_e) {}
    }

    var out = {
      ok: true,
      patient: patient,
      examsCount: exams.length,
    };
    if (fetchStats.pdfsAttempted > 0) {
      out.pdfsAttempted = fetchStats.pdfsAttempted;
      out.pdfsOk = fetchStats.pdfsOk;
    }
    if (fetchStats.warning) out.warning = fetchStats.warning;
    return out;
  }

  async function extractCirurgias(ctx) {
    var tabId = await ensureTab();
    var tabApi = root.AghuActiveTab;
    var period = (ctx && ctx.period) || {};
    var resposta = await send(
      tabId,
      {
        action: "extrairCirurgias",
        dateFrom: period.dateFromIso || null,
        dateTo: period.dateToIso || null,
      },
      tabApi && tabApi.CIRURGIAS_SCRIPT_FILES
        ? tabApi.CIRURGIAS_SCRIPT_FILES
        : null,
      90000
    );

    if (!resposta || (!resposta.ok && !(resposta.cirurgias || []).length)) {
      return {
        ok: false,
        error:
          (resposta && resposta.erro) ||
          "Falha ao extrair cirurgias.",
      };
    }

    var mismatchCir = loteDomProntuarioMismatch(resposta, ctx.prontuario);
    if (mismatchCir.mismatch) {
      return { ok: false, error: mismatchCir.error };
    }

    var patient = patientFromResponse(resposta, ctx.prontuario);
    var gate = root.AghuCirurgiasPatientGate;
    var saveGate =
      gate && gate.buildCirurgiasSaveMeta
        ? gate.buildCirurgiasSaveMeta(resposta.patient, patient.patientKey)
        : null;

    if (saveGate && saveGate.ok) {
      var sch = root.AghuPassometroSchema;
      var merge = root.AghuCirurgiasMerge;
      var arch = root.AghuPassometroArchive;
      if (sch && merge && arch) {
        var snap = await arch.loadPassometroSnapshot(patient.patientKey);
        if (!snap) snap = sch.emptySnap();
        var merged = merge.mergeCirurgiasIntoSnap(
          snap,
          resposta.cirurgias || [],
          sch
        );
        await arch.savePassometroSnapshot(saveGate.meta, merged.snap);
      }
    }

    return { ok: true, patient: patient };
  }

  async function extractControles(ctx) {
    var tabId = await ensureTab();
    var tabApi = root.AghuActiveTab;
    var resposta = await send(
      tabId,
      { action: "extrairControles" },
      tabApi && tabApi.CONTROLES_SCRIPT_FILES
        ? tabApi.CONTROLES_SCRIPT_FILES
        : null,
      60000
    );

    if (!resposta || !resposta.ok) {
      return {
        ok: false,
        error: (resposta && resposta.erro) || "Falha ao extrair controles.",
        degraded: !!(resposta && resposta.degraded),
        empty: !!(resposta && resposta.empty),
      };
    }

    var mismatchCtrl = loteDomProntuarioMismatch(resposta, ctx.prontuario);
    if (mismatchCtrl.mismatch) {
      return { ok: false, error: mismatchCtrl.error };
    }

    var patient = patientFromResponse(resposta, ctx.prontuario);
    var entries =
      Array.isArray(resposta.entries) && resposta.entries.length
        ? resposta.entries
        : [
            {
              texto: resposta.texto || "",
              periodo: resposta.periodo || "",
              n: resposta.n || 0,
              extractedAt: Date.now(),
            },
          ];

    if (
      root.AghuControlesArchive &&
      patient.patientKey &&
      root.AghuControlesArchive.saveControlesEntries
    ) {
      await root.AghuControlesArchive.saveControlesEntries(
        {
          patientKey: patient.patientKey,
          primeiroNome: patient.primeiroNome,
          nomeCompleto: patient.nomeCompleto,
          prontuario: patient.prontuario,
        },
        entries
      );
    } else if (
      root.AghuControlesArchive &&
      patient.patientKey &&
      root.AghuControlesArchive.saveControlesSnapshot
    ) {
      await root.AghuControlesArchive.saveControlesSnapshot(
        {
          patientKey: patient.patientKey,
          primeiroNome: patient.primeiroNome,
          nomeCompleto: patient.nomeCompleto,
          prontuario: patient.prontuario,
        },
        { entries: entries, atualizadoEm: Date.now() }
      );
    }

    return { ok: true, patient: patient };
  }

  async function extractPrescricao(ctx) {
    var tabId = await ensureTab();
    var period = ctx.period || {};
    var dateBr = root.AghuDateBr;
    var dateFrom =
      period.dateFromBr ||
      (period.dateFromIso && dateBr && dateBr.toDisplayBr
        ? dateBr.toDisplayBr(period.dateFromIso)
        : period.dateFromIso) ||
      null;
    var dateTo =
      period.dateToBr ||
      (period.dateToIso && dateBr && dateBr.toDisplayBr
        ? dateBr.toDisplayBr(period.dateToIso)
        : period.dateToIso) ||
      null;
    var extractMsg = {
      action: "extrairPrescricao",
      dateFrom: dateFrom,
      dateTo: dateTo,
    };

    var resposta;
    try {
      resposta = await send(tabId, extractMsg, null, 90000);
    } catch (_e) {
      try {
        var tabApi = root.AghuActiveTab;
        var files =
          tabApi && tabApi.PRESCRICAO_SCRIPT_FILES
            ? tabApi.PRESCRICAO_SCRIPT_FILES
            : [
                "lib/date-br.js",
                "lib/prescricao-date-window.js",
                "lib/receita-medication-catalog.js",
                "lib/prescricao-medication-classify.js",
                "content/prescricao_content.js",
              ];
        if (tabApi && typeof tabApi.injectScriptChain === "function") {
          await tabApi.injectScriptChain(tabId, files);
        } else {
          for (var fi = 0; fi < files.length; fi++) {
            await browser.tabs.executeScript(tabId, { file: files[fi] });
          }
        }
        await new Promise(function (r) {
          setTimeout(r, 200);
        });
        resposta = await browser.tabs.sendMessage(tabId, extractMsg);
      } catch (e2) {
        return {
          ok: false,
          error: "Erro ao extrair prescrição: " + (e2 && e2.message),
          entryCount: 0,
        };
      }
    }

    if (!resposta || !resposta.ok) {
      return {
        ok: false,
        error: (resposta && resposta.erro) || "Falha ao extrair prescrição.",
        entryCount: 0,
      };
    }

    var mismatchRx = loteDomProntuarioMismatch(resposta, ctx.prontuario);
    if (mismatchRx.mismatch) {
      return { ok: false, error: mismatchRx.error, entryCount: 0 };
    }

    var patient = patientFromResponse(resposta, ctx.prontuario);
    var batchEntries =
      Array.isArray(resposta.entries) && resposta.entries.length >= 1
        ? resposta.entries.slice()
        : null;

    var win =
      root.AghuPrescricaoDateWindow ||
      (typeof globalThis !== "undefined"
        ? globalThis.AghuPrescricaoDateWindow
        : null);
    if ((dateFrom || dateTo) && win && win.refilterBatchForDates && batchEntries) {
      var ref = win.refilterBatchForDates(batchEntries, dateFrom, dateTo);
      if (!ref.ok) {
        return {
          ok: false,
          error:
            ref.error ||
            "Filtro clínico 16:00→15:59 rejeitou o lote. Recarregue a extensão.",
          entryCount: 0,
        };
      }
      batchEntries = ref.entries;
      if (!batchEntries.length) {
        return {
          ok: false,
          error:
            "Nenhuma validade na janela clínica 16:00→15:59 para o período selecionado.",
          entryCount: 0,
        };
      }
    }

    var entryCount = batchEntries ? batchEntries.length : 1;

    var saveOpts =
      dateFrom || dateTo
        ? { mode: "window_overwrite", dateFrom: dateFrom, dateTo: dateTo }
        : undefined;

    if (root.AghuPrescricaoArchive && patient.patientKey) {
      if (batchEntries && root.AghuPrescricaoArchive.savePrescricaoEntries) {
        await root.AghuPrescricaoArchive.savePrescricaoEntries(
          {
            patientKey: patient.patientKey,
            primeiroNome: patient.primeiroNome,
            nomeCompleto: patient.nomeCompleto,
            prontuario: patient.prontuario,
          },
          batchEntries,
          saveOpts
        );
      } else if (root.AghuPrescricaoArchive.savePrescricaoSnapshot) {
        await root.AghuPrescricaoArchive.savePrescricaoSnapshot(
          {
            patientKey: patient.patientKey,
            primeiroNome: patient.primeiroNome,
            nomeCompleto: patient.nomeCompleto,
            prontuario: patient.prontuario,
          },
          resposta,
          saveOpts
        );
      }
    }

    try {
      document.dispatchEvent(
        new CustomEvent("aghu:prescricao-period-sync", {
          detail: {
            dateFromBr: dateFrom,
            dateToBr: dateTo,
            patientKey: patient && patient.patientKey,
            entryCount: entryCount,
          },
        })
      );
    } catch (_ev) {
      /* ignore */
    }

    return { ok: true, patient: patient, entryCount: entryCount };
  }

  /**
   * FEAT-303 — demografia ampliada + internações (extractPatientCadastro).
   */
  async function extractCadastro(ctx) {
    var tabId = await ensureTab();
    var tabApi = root.AghuActiveTab;
    var injectFiles =
      (tabApi && tabApi.CADASTRO_SCRIPT_FILES) || [
        "lib/patient-identity.js",
        "lib/patient-dom-extract.js",
        "lib/date-br.js",
        "lib/ckd-epi-egfr.js",
        "lib/patient-pol-demographics.js",
        "lib/patient-pol-historico-internacoes.js",
        "content/aghu-casca-nav.js",
        "content/content.js",
      ];
    var response;
    try {
      response = await send(
        tabId,
        { action: "extractPatientCadastro" },
        injectFiles,
        120000
      );
    } catch (e) {
      var msg =
        e && e.message === "timeout_extracao"
          ? "Tempo esgotado na extração de cadastro."
          : (e && e.message) || "Erro ao comunicar com a página.";
      return { ok: false, error: msg };
    }

    if (!response || !response.ok) {
      return {
        ok: false,
        error:
          (response && response.error) ||
          "Falha ao extrair cadastro. Confirme POL aberto.",
      };
    }

    var gatePayload = {
      patient: {
        prontuario: response.prontuario || "",
        nomeCompleto: response.nomeCompleto || "",
        primeiroNome: response.primeiroNome || "",
        patientKey: response.patientKey || "",
      },
    };
    var mismatch = requireLoteDomProntuarioMatch(gatePayload, ctx.prontuario);
    if (mismatch.mismatch) {
      return { ok: false, error: mismatch.error };
    }

    var patient = patientFromResponse(gatePayload, ctx.prontuario);
    if (!patient.patientKey) {
      return {
        ok: false,
        error: "Cadastro lido, mas prontuário não identificado para gravar.",
      };
    }

    var applyApi = root.AghuCadastroApplyArchive;
    if (!applyApi || !applyApi.applyCadastroToArchive) {
      return { ok: false, error: "AghuCadastroApplyArchive indisponível." };
    }
    try {
      await applyApi.applyCadastroToArchive(patient.patientKey, response);
    } catch (applyErr) {
      return {
        ok: false,
        error:
          (applyErr && applyErr.message) ||
          "Falha ao gravar cadastro no archive.",
      };
    }

    return {
      ok: true,
      patient: patient,
      patientKey: patient.patientKey,
      entryCount: Array.isArray(response.internacoes)
        ? response.internacoes.length
        : 0,
    };
  }

  /**
   * Autofill a partir dos archives locais + grava passômetro.
   */
  async function autofillAndSave(ctx) {
    var identity = root.AghuPatientIdentity;
    var autofill = root.AghuPassometroAutofill;
    var schema = root.AghuPassometroSchema;
    var arch = root.AghuPassometroArchive;
    var prontuario = ctx.prontuario;
    var patientKey =
      (ctx.patient && ctx.patient.patientKey) ||
      (identity && identity.buildPatientKey
        ? identity.buildPatientKey(prontuario)
        : prontuario);

    if (!autofill || !schema || !arch || !patientKey) {
      return {
        ok: false,
        error: "Módulos de autofill/archive indisponíveis.",
        patientKey: patientKey,
      };
    }

    var controles = null;
    var prescricoes = null;
    var exams = null;
    var pii = {
      prontuario: prontuario,
      nomeCompleto: (ctx.patient && ctx.patient.nomeCompleto) || "",
      primeiroNome: (ctx.patient && ctx.patient.primeiroNome) || "",
    };

    if (root.AghuControlesArchive && root.AghuControlesArchive.loadControlesSnapshot) {
      controles = await root.AghuControlesArchive.loadControlesSnapshot(patientKey);
    }
    if (root.AghuPrescricaoArchive && root.AghuPrescricaoArchive.loadPrescricaoSnapshot) {
      prescricoes = await root.AghuPrescricaoArchive.loadPrescricaoSnapshot(patientKey);
    }
    if (root.AghuPatientArchive && root.AghuPatientArchive.loadPatientRecord) {
      var rec = await root.AghuPatientArchive.loadPatientRecord(patientKey);
      if (rec) {
        if (rec.pii) {
          pii = Object.assign({}, pii, rec.pii);
        }
        if (!pii.nomeCompleto && rec.nomeCompleto) pii.nomeCompleto = rec.nomeCompleto;
        if (!pii.primeiroNome && rec.primeiroNome) pii.primeiroNome = rec.primeiroNome;
        if (root.AghuPatientArchive.examsRecordToArray) {
          exams = root.AghuPatientArchive.examsRecordToArray(rec);
        }
      }
    }

    var built = autofill.buildPassometroFromSources({
      controles: controles,
      prescricoes: prescricoes,
      exams: exams,
      pii: pii,
    });

    var existing = await arch.loadPassometroSnapshot(patientKey);
    if (!existing) existing = schema.emptySnap();

    var merged = autofill.applyAutofill(existing, built, {
      mode: "append_and_refresh_vitals",
    });

    var meta = {
      patientKey: patientKey,
      primeiroNome: pii.primeiroNome || "",
      nomeCompleto: pii.nomeCompleto || "",
      prontuario: prontuario,
    };

    await arch.savePassometroSnapshot(meta, merged);

    if (
      root.AghuPatientArchive &&
      root.AghuPatientArchive.ensureMinimalPatientRecord
    ) {
      try {
        await root.AghuPatientArchive.ensureMinimalPatientRecord(meta);
      } catch (_e) {}
    }

    return { ok: true, patientKey: patientKey, patient: meta };
  }

  root.AghuPassometroDomainExtract = {
    NAV_SCRIPT_FILES: NAV_SCRIPT_FILES,
    nav: nav,
    patientFromResponse: patientFromResponse,
    loteDomProntuarioMismatch: loteDomProntuarioMismatch,
    requireLoteDomProntuarioMatch: requireLoteDomProntuarioMatch,
    openPol: function (prontuario) {
      return nav("pol", prontuario, null);
    },
    openControles: function (prontuario, period) {
      return nav("controles", prontuario, period);
    },
    openPrescricoes: function (prontuario, period) {
      return nav("prescricoes", prontuario, period);
    },
    closeControlesPrescricoesTabs: function () {
      return nav("closeControlesPrescricoes", null, null);
    },
    extractCadastro: extractCadastro,
    extractExames: extractExames,
    extractCirurgias: extractCirurgias,
    extractControles: extractControles,
    extractPrescricao: extractPrescricao,
    autofillAndSave: autofillAndSave,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.AghuPassometroDomainExtract;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
