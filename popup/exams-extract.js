/**
 * Extract DOM + restore de sessão na aba Exames (popup).
 */
(function (root) {
  "use strict";

  /**
   * @param {object} d — estado e callbacks injetados por popup.js
   */
  function createExamsExtract(d) {
    function restoreExtractUiReady(extractStartedAt) {
      if (d.btnExtract) d.btnExtract.disabled = false;
      if (d.setExtractButtonLoading) d.setExtractButtonLoading(false);
      if (typeof extractStartedAt === "number") {
        const syncUi = root.AghuPopupSyncUi;
        console.log(
          "[AGHU] extract ui ready",
          syncUi
            ? syncUi.buildExtractUiReadyLog(extractStartedAt)
            : { durationMs: Date.now() - extractStartedAt },
        );
      }
    }

    async function getAghuTabId() {
      if (root.AghuActiveTab && root.AghuActiveTab.resolveAghuTabIdFromBrowser) {
        return root.AghuActiveTab.resolveAghuTabIdFromBrowser();
      }
      try {
        const res = await browser.storage.local.get("aghu_source_tab_id");
        if (res.aghu_source_tab_id) return res.aghu_source_tab_id;
      } catch (_e) { /* ignore */ }
      try {
        const tabs = await browser.tabs.query({});
        const hit = tabs.find((t) => t.url && /aghu/i.test(t.url));
        if (hit) return hit.id;
      } catch (_e) { /* ignore */ }
      return null;
    }

    async function tryRestoreLastSession() {
      try {
        const authUi = root.AghuAuthUI;
        if (authUi && typeof authUi.requireSession === "function") {
          const token = await authUi.requireSession();
          if (!token) return false;
        }

        const ptr = await browser.storage.local.get("aghu_last_session");
        const cacheKey = ptr["aghu_last_session"];
        if (!cacheKey) return false;

        const stored = await browser.storage.local.get(cacheKey);
        const cache = stored[cacheKey];

        if (!cache || !Array.isArray(cache.__examList) || cache.__examList.length === 0) return false;

        const restoredPatientMeta = cache.__patientKey
          ? {
              ok: true,
              missing: [],
              patientKey: cache.__patientKey,
              primeiroNome: cache.__patientPrimeiro || "",
              nomeCompleto: "",
              prontuario: cache.__patientProntuario || "",
            }
          : null;

        if (!d.cachePatientMatches(cache, restoredPatientMeta?.patientKey || null)) return false;

        const exams = cache.__examList.map((e) => {
          const merged = {
            ...e,
            hasCheckbox: e.hasCheckbox !== undefined ? e.hasCheckbox : !!e.checkboxId,
            fetchedResult: "",
            detailText: "",
            hadPdf: false,
            fetchHint: "",
            fetchReason: "",
            aiOrganized: "",
          };
          d.ensureColetaFields(merged);
          return merged;
        });

        const upgraded = [];
        exams.forEach((e) => {
          const hit = cache[e.rowIndex];
          if (hit && (hit.fetchedResult || hit.detailText || hit.fetchHint || hit.aiOrganized)) {
            e.fetchedResult = hit.fetchedResult || "";
            e.detailText = hit.detailText || "";
            e.hadPdf = hit.hadPdf || false;
            e.fetchHint = hit.fetchHint || "";
            e.fetchReason = hit.fetchReason || "";
            e.aiOrganized = hit.aiOrganized || "";
          }
        });
        upgraded.push(...d.upgradeAllGasometryExams(exams));
        upgraded.push(...d.upgradeAllPdfCachedExams(exams));
        await d.persistUpgradedFetchExams(upgraded, cacheKey);

        d.setAllExams(exams);
        d.setCurrentCacheKey(cacheKey);
        d.setFilteredExams([...exams]);
        d.setSessionFromArchive(false);

        if (restoredPatientMeta) {
          d.setCurrentPatientMeta(restoredPatientMeta);
          d.updatePatientBar(restoredPatientMeta);
        } else {
          d.setCurrentPatientMeta(null);
          d.updatePatientBar(null);
        }

        if (cache.__dateFrom) d.setDateInput(d.dateFromEl, cache.__dateFrom);
        if (cache.__dateTo) d.setDateInput(d.dateToEl, cache.__dateTo);
        d.updateDateBadge();

        d.showResults();

        const withResult = exams.filter((e) => e.result || e.fetchedResult || e.detailText || e.aiOrganized).length;
        const age = cache.__savedAt ? Math.round((Date.now() - cache.__savedAt) / 60000) : null;
        const ageStr = age === null ? "" : age < 60 ? ` · ${age} min atrás` : ` · ${Math.round(age / 60)}h atrás`;
        const oldWarn = age !== null && age > 240 ? " ⚠ dados antigos, considere re-extrair" : "";
        d.setProgress(100, `↩ ${exams.length} exame(s) restaurado(s)${ageStr} · ${withResult} com resultado${oldWarn}`);
        setTimeout(() => d.progressBar.classList.remove("visible"), 4000);
        return true;
      } catch (e) {
        console.warn("tryRestoreLastSession failed", e);
        return false;
      }
    }

    async function startupPopup() {
      await tryRestoreLastSession();
      try {
        const activeApi = root.AghuPopupActivePatient;
        if (activeApi && activeApi.ready) await activeApi.ready;
        let selectKey = "__page__";
        if (d.getAllExams().length > 0 && d.getCurrentCacheKey() && !d.getSessionFromArchive()) {
          selectKey = "__page__";
        } else if (activeApi && activeApi.getActiveKey) {
          selectKey = activeApi.getActiveKey() || "__page__";
        } else {
          const ptr = await browser.storage.local.get("aghu_last_patient_key");
          const lastKey = ptr["aghu_last_patient_key"] || null;
          if (lastKey) selectKey = lastKey;
        }
        await d.refreshPatientSelect(selectKey);
      } catch (_e) {
        await d.refreshPatientSelect(null);
      }
    }

    function formatDemographicsSuccess(demo) {
      if (!demo || !demo.ok) return null;
      const parts = [];
      if (demo.sexo === "M") parts.push("Masc");
      else if (demo.sexo === "F") parts.push("Fem");
      else if (demo.sexo) parts.push(String(demo.sexo));
      const dobIso = demo.dataNascimentoISO || demo.dataNascimento || "";
      if (dobIso) {
        const ageApi = root.AghuAgeFromDob;
        const age =
          ageApi && ageApi.computeAgeYearsFromIso
            ? ageApi.computeAgeYearsFromIso(dobIso)
            : null;
        if (age != null) {
          parts.push(`${age}a`);
        } else {
          parts.push("nasc. ok");
        }
      }
      if (demo.nomeCompleto) parts.push("nome ok");
      return parts.length
        ? `Cadastro lido (${parts.join(", ")})`
        : "Cadastro lido (parcial)";
    }

    function formatDemographicsWarning(demo) {
      if (!demo) {
        return "Não foi possível ler dados do paciente no POL. Scores podem ficar incompletos.";
      }
      if (demo.missing && demo.missing.includes("navigation")) {
        return 'Aba "Dados do Paciente" não encontrada no POL. Scores podem ficar incompletos.';
      }
      if (demo.missing && demo.missing.includes("timeout")) {
        return "Cadastro do paciente não carregou a tempo no POL. Scores podem ficar incompletos.";
      }
      if (
        demo.frameUrl &&
        demo.missing &&
        demo.missing.length >= 3 &&
        !demo.missing.includes("navigation") &&
        !demo.missing.includes("timeout")
      ) {
        return "Cadastro carregou, mas o layout não foi reconhecido. Scores podem ficar incompletos.";
      }
      const miss =
        demo.missing && demo.missing.length
          ? demo.missing.join(", ")
          : demo.error || "sexo/data de nascimento/nome";
      return `Demografia incompleta (${miss}). Scores podem ficar incompletos.`;
    }

    function mergeDemoIntoPatientMeta(patient, demo) {
      const missing = [];
      let prontuario = "";
      let patientKey = null;
      let nomeCompleto = "";
      let primeiroNome = "";

      if (patient) {
        prontuario = patient.prontuario || "";
        patientKey = patient.patientKey || null;
        nomeCompleto = patient.nomeCompleto || "";
        primeiroNome = patient.primeiroNome || "";
        if (Array.isArray(patient.missing)) {
          missing.push(...patient.missing);
        }
      }
      if (demo) {
        if (demo.prontuario) prontuario = demo.prontuario;
        if (demo.patientKey) patientKey = demo.patientKey;
        if (demo.nomeCompleto) {
          nomeCompleto = demo.nomeCompleto;
          primeiroNome =
            root.AghuPatientArchive &&
            root.AghuPatientArchive.primeiroNomeFromFull
              ? root.AghuPatientArchive.primeiroNomeFromFull(demo.nomeCompleto)
              : demo.nomeCompleto.split(/\s+/)[0] || "";
        } else if (demo.primeiroNome) {
          primeiroNome = demo.primeiroNome;
        }
      }

      if (!prontuario && !patientKey && !nomeCompleto) {
        return patient && patient.ok ? patient : null;
      }

      const meta = {
        ok: !!(prontuario && patientKey),
        missing: [...new Set(missing)],
        prontuario,
        patientKey,
        nomeCompleto,
        primeiroNome,
      };
      if (demo && demo.sexo) meta.sexo = demo.sexo;
      if (demo && demo.dataNascimentoISO) {
        meta.dataNascimentoISO = demo.dataNascimentoISO;
        meta.dataNascimento = demo.dataNascimentoISO;
      }
      if (!meta.ok && prontuario === "" && !meta.missing.includes("prontuário")) {
        meta.missing.push("prontuário");
      }
      return meta;
    }

    async function refreshPatientMetaFromArchive(patientKey) {
      if (!patientKey || !root.AghuPatientArchive?.loadPatientRecord) return null;
      const rec = await root.AghuPatientArchive.loadPatientRecord(patientKey);
      if (!rec || !rec.prontuario) return null;
      return {
        ok: true,
        missing: [],
        patientKey: rec.patientKey,
        primeiroNome: rec.primeiroNome || "",
        nomeCompleto: rec.nomeCompleto || "",
        prontuario: rec.prontuario,
        ...(rec.sexo ? { sexo: rec.sexo } : {}),
        ...(rec.dataNascimento || rec.dataNascimentoISO
          ? {
              dataNascimento: rec.dataNascimento || rec.dataNascimentoISO,
              dataNascimentoISO: rec.dataNascimento || rec.dataNascimentoISO,
            }
          : {}),
      };
    }

    function hasPatientDisplayName(meta) {
      return !!(meta && meta.nomeCompleto && String(meta.nomeCompleto).trim());
    }

    async function applyDemographicsToArchive(patientKey, demo) {
      if (
        !demo ||
        !patientKey ||
        !root.AghuPatientArchive ||
        !root.AghuPatientArchive.mergeDemographicsIntoRecord
      ) {
        return;
      }
      await root.AghuPatientArchive.mergeDemographicsIntoRecord(patientKey, {
        sexo: demo.sexo || null,
        dataNascimentoISO: demo.dataNascimentoISO || null,
        nomeCompleto: demo.nomeCompleto || null,
      });
    }

    function wireExtractButton() {
      if (!d.btnExtract) return;
      d.btnExtract.addEventListener("click", async () => {
        if (d.getFetchRunning()) return;

        if (root.AghuBillingStatus && root.AghuBillingStatus.guardExtraction) {
          const extractCheck = await root.AghuBillingStatus.guardExtraction();
          if (!extractCheck.ok) {
            const msg = root.AghuBillingStatus.formatUpgradeMessage(extractCheck);
            d.showWarning(msg || "Limite diário de extrações atingido.");
            return;
          }
        }

        d.btnExtract.disabled = true;
        if (d.setExtractButtonLoading) d.setExtractButtonLoading(true);
        const extractStartedAt = Date.now();

        try {
          const tabId = await getAghuTabId();
          if (!tabId) {
            d.showError("Aba do AGHU não encontrada. Abra o AGHU e clique no ícone da extensão novamente.");
            restoreExtractUiReady(extractStartedAt);
            return;
          }

          const dateRange = d.readExtractDateRange();
          if (dateRange.error) {
            d.showWarning(dateRange.error);
            restoreExtractUiReady(extractStartedAt);
            return;
          }

          d.setProgress(5, "Extraindo exames…");

          const response = await browser.tabs.sendMessage(tabId, {
            action: "extractExams",
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
          });

          if (!response || !response.success) {
            if (response && response.reason === "date_filter") {
              d.showWarning(response.error);
            } else if (response && response.examesRestored === false) {
              d.showWarning(
                response.error ||
                  "Tabela de exames não carregou. Aguarde e tente novamente.",
              );
            } else {
              d.showError(response ? response.error : "Não foi possível se comunicar com a página.");
            }
            restoreExtractUiReady(extractStartedAt);
            return;
          }

          if (root.AghuBillingStatus && root.AghuBillingStatus.recordExtraction) {
            await root.AghuBillingStatus.recordExtraction({ success: true });
          }

          if (response.exams.length === 0) {
            d.setAllExams([]);
            d.setFilteredExams([]);
            d.showResults();
            d.applyFilters();
            d.showWarning(
              "Nenhum exame no intervalo de datas selecionado. Limpe o filtro de data ou ajuste as datas e tente novamente.",
            );
            restoreExtractUiReady(extractStartedAt);
            return;
          }

          d.setSessionFromArchive(false);

          const allExams = response.exams;
          allExams.forEach((e) => {
            if (e.fetchHint === undefined) e.fetchHint = "";
            if (e.fetchReason === undefined) e.fetchReason = "";
            if (e.aiOrganized === undefined) e.aiOrganized = "";
            d.ensureColetaFields(e);
          });

          const patient = response.patient || null;
          let currentPatientMeta = mergeDemoIntoPatientMeta(patient, null);
          d.setCurrentPatientMeta(currentPatientMeta);
          d.updatePatientBar(currentPatientMeta || patient || null);

          const currentCacheKey = d.buildCacheKey(
            currentPatientMeta?.patientKey || null,
            dateRange.dateFrom,
            dateRange.dateTo,
          );
          d.setCurrentCacheKey(currentCacheKey);

          await d.saveExamListToCache(
            currentCacheKey,
            allExams,
            d.readDisplayBr(d.dateFromEl) || dateRange.dateFrom,
            d.readDisplayBr(d.dateToEl) || dateRange.dateTo,
            currentPatientMeta,
          );

          const restored = await d.restoreResultsFromCache(
            allExams,
            currentCacheKey,
            currentPatientMeta?.patientKey || null,
          );
          if (root.AghuExamResultResolve?.clearPartialGridResultForHemogram) {
            for (const e of allExams) {
              root.AghuExamResultResolve.clearPartialGridResultForHemogram(e);
            }
          }
          if (root.AghuExamResultResolve?.clearPartialGridResultForEas) {
            for (const e of allExams) {
              root.AghuExamResultResolve.clearPartialGridResultForEas(e);
            }
          }
          d.setAllExams(allExams);
          d.setFilteredExams([...allExams]);
          d.applyFilters();
          d.showResults();

          if (restored > 0) {
            d.setProgress(100, `✓ ${restored} resultado(s) restaurado(s) do cache.`);
            setTimeout(() => d.progressBar.classList.remove("visible"), 2500);
          }

          if (!patient || !patient.ok) {
            const miss =
              patient && patient.missing && patient.missing.length
                ? patient.missing.join(", ")
                : "nome/prontuário";
            d.setProgress(
              100,
              `⚠ Não lido na página: ${miss}. Arquivo por paciente não atualizado.`,
            );
            setTimeout(() => d.progressBar.classList.remove("visible"), 5200);
          }

          if (root.AghuPatientArchive && currentPatientMeta && currentPatientMeta.ok) {
            await root.AghuPatientArchive.mergeExamsIntoRecord(
              {
                patientKey: currentPatientMeta.patientKey,
                primeiroNome: currentPatientMeta.primeiroNome,
                nomeCompleto: currentPatientMeta.nomeCompleto || "",
                prontuario: currentPatientMeta.prontuario,
              },
              allExams,
              {
                dateFrom: dateRange.dateFrom,
                dateTo: dateRange.dateTo,
                mode: "window_overwrite",
              },
            );
          }

          const pendingFetch = root.AghuPdfFetchPartition?.isExamPendingFetch;
          const toFetch = allExams.filter((e) =>
            pendingFetch
              ? pendingFetch(e)
              : !e.fetchedResult && !e.detailText && e.result === "" && (e.hasCheckbox || e.hasAttachment),
          );
          if (toFetch.length > 0) {
            if (typeof d.runExamsPdfFetch === "function") {
              await d.runExamsPdfFetch(tabId, allExams, {
                patientKey: currentPatientMeta?.patientKey || null,
                period: {
                  dateFromIso: dateRange.dateFrom,
                  dateToIso: dateRange.dateTo,
                },
                onProgress: d.setProgress,
              });
            } else if (typeof d.runFetchLoop === "function") {
              await d.runFetchLoop(tabId, toFetch);
            }
          }

          if (root.AghuPatientArchive && currentPatientMeta && currentPatientMeta.ok) {
            await root.AghuPatientArchive.mergeExamsIntoRecord(
              {
                patientKey: currentPatientMeta.patientKey,
                primeiroNome: currentPatientMeta.primeiroNome,
                nomeCompleto: currentPatientMeta.nomeCompleto || "",
                prontuario: currentPatientMeta.prontuario,
              },
              allExams,
            );
          }

          let demo = null;
          if (currentPatientMeta && currentPatientMeta.ok) {
            d.setProgress(95, "Lendo cadastro do paciente…");
            try {
              demo = await browser.tabs.sendMessage(tabId, {
                action: "extractPatientDemographics",
              });
              await applyDemographicsToArchive(currentPatientMeta.patientKey, demo);
              currentPatientMeta = mergeDemoIntoPatientMeta(currentPatientMeta, demo);
              d.setCurrentPatientMeta(currentPatientMeta);
              d.updatePatientBar(currentPatientMeta);
              if (demo && demo.ok) {
                const okMsg = formatDemographicsSuccess(demo);
                console.log("[AGHU] demographics ok", {
                  hasSexo: !!demo.sexo,
                  hasDob: !!demo.dataNascimentoISO,
                  hasNome: !!demo.nomeCompleto,
                });
                if (okMsg) d.setProgress(98, okMsg);
                if (demo.examesRestored === false) {
                  d.showWarning(
                    "Cadastro lido, mas a tabela de exames pode não ter voltado ao normal no POL.",
                  );
                }
              } else if (demo && !demo.ok) {
                d.showWarning(formatDemographicsWarning(demo));
              }
              if (d.notifyExamsUpdated) d.notifyExamsUpdated();
            } catch (demoErr) {
              console.warn("[AGHU] extractPatientDemographics failed", demoErr);
              d.showWarning(formatDemographicsWarning(null));
            }

            const refreshed = await refreshPatientMetaFromArchive(
              currentPatientMeta.patientKey,
            );
            if (refreshed) {
              currentPatientMeta = refreshed;
              d.setCurrentPatientMeta(currentPatientMeta);
              d.updatePatientBar(currentPatientMeta);
            }
          }

          let finalMsg = null;
          if (root.AghuPatientArchive && currentPatientMeta && currentPatientMeta.ok) {
            const extractPatientKey = currentPatientMeta.patientKey;
            const demoOk = formatDemographicsSuccess(demo);
            const localLabel = demoOk || "Extraído localmente";

            if (!hasPatientDisplayName(currentPatientMeta)) {
              d.showWarning(
                "Nome do paciente não identificado — sync na nuvem omitido. Confira o cadastro no POL ou reextraia.",
              );
              finalMsg = `${localLabel} · sync omitido (nome ausente)`;
            } else {
              finalMsg = `${localLabel}`;
              d.scheduleSyncAfterLocalSave(extractPatientKey, (syncMsg) => {
                d.setProgress(100, d.mergeProgressMessage(localLabel, syncMsg));
                setTimeout(() => {
                  d.progressBar.classList.remove("visible");
                }, 4500);
              });
            }
          }

          if (finalMsg) {
            d.setProgress(100, finalMsg);
            setTimeout(() => d.progressBar.classList.remove("visible"), 4500);
          }

          await d.refreshPatientSelect(currentPatientMeta?.patientKey || null);
          if (
            root.AghuPopupActivePatient &&
            currentPatientMeta &&
            currentPatientMeta.ok &&
            currentPatientMeta.patientKey
          ) {
            await root.AghuPopupActivePatient.setActiveKey(
              currentPatientMeta.patientKey,
              { source: "exams-extract" },
            );
          }
          d.pruneOldCache();
        } catch (err) {
          console.error(err);
          d.showError("Erro ao comunicar com a página. Recarregue o AGHU (F5) e tente novamente.");
        }

        restoreExtractUiReady(extractStartedAt);
      });
    }

    return {
      restoreExtractUiReady,
      getAghuTabId,
      tryRestoreLastSession,
      startupPopup,
      wireExtractButton,
    };
  }

  root.AghuPopupExamsExtract = { createExamsExtract };
})(typeof globalThis !== "undefined" ? globalThis : window);
