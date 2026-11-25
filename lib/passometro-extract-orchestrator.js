/**
 * Orquestrador Passômetro one-click — multi-prontuário em série, fail-soft.
 * Domínios: cadastro → exames → cirurgias → controles → prescrição → autofill/archive.
 * Injetável via deps para testes Node (sem browser).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroExtractOrchestrator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var periodShortcutsApi =
    typeof require !== "undefined"
      ? require("./passometro-period-shortcuts.js")
      : typeof globalThis !== "undefined" &&
          globalThis.AghuPassometroPeriodShortcuts
        ? globalThis.AghuPassometroPeriodShortcuts
        : null;

  var controlesExtractResponseApi =
    typeof require !== "undefined"
      ? require("./controles-extract-response.js")
      : typeof globalThis !== "undefined" &&
          globalThis.AghuControlesExtractResponse
        ? globalThis.AghuControlesExtractResponse
        : null;

  var DOMAINS = [
    "cadastro",
    "exames",
    "cirurgias",
    "controles",
    "prescricao",
    "passometro",
  ];
  var ABORT_MSG = "Lote interrompido (Parar).";

  /**
   * Soft-empty de fatia Controles (nav.empty / degraded / msgs conhecidas).
   * @param {object|null|undefined} res
   * @returns {boolean}
   */
  function isControlesSliceSoftEmpty(res) {
    if (
      controlesExtractResponseApi &&
      typeof controlesExtractResponseApi.isControlesSliceSoftEmpty === "function"
    ) {
      return controlesExtractResponseApi.isControlesSliceSoftEmpty(res);
    }
    if (!res || typeof res !== "object") return false;
    if (res.empty === true || res.degraded === true) return true;
    var msg = String(res.error || res.erro || "").toLowerCase();
    return (
      msg.indexOf("nenhum valor num") !== -1 ||
      msg.indexOf("nenhum registro encontrado na tabela") !== -1 ||
      msg.indexOf("tabela de monitoriza") !== -1
    );
  }

  function emptyDomainStatus() {
    var out = {};
    for (var i = 0; i < DOMAINS.length; i++) {
      out[DOMAINS[i]] = { status: "pending", error: null };
    }
    return out;
  }

  /**
   * Clamp booleans + default todos true (compat: opts.domains omisso).
   * @param {object|null|undefined} input
   * @returns {{ cadastro: boolean, exames: boolean, cirurgias: boolean, controles: boolean, prescricao: boolean }}
   */
  function normalizeBatchDomains(input) {
    var src = input && typeof input === "object" ? input : null;
    function flag(key) {
      if (!src || src[key] === undefined || src[key] === null) return true;
      return !!src[key];
    }
    return {
      cadastro: flag("cadastro"),
      exames: flag("exames"),
      cirurgias: flag("cirurgias"),
      controles: flag("controles"),
      prescricao: flag("prescricao"),
    };
  }

  /** True se pelo menos um domínio clínico está habilitado. */
  function hasAnyClinicalDomain(domains) {
    var d = normalizeBatchDomains(domains);
    return !!(
      d.cadastro ||
      d.exames ||
      d.cirurgias ||
      d.controles ||
      d.prescricao
    );
  }

  /**
   * @deprecated FEAT-110 — chunk Controles substitui o gate de Extrair.
   * Sempre false (no-op). Mantido para compat de callers/testes legados.
   * @param {object} [_domains]
   * @param {object|null} [_period]
   * @returns {boolean}
   */
  function shouldBlockControlesMaxDays(_domains, _period) {
    return false;
  }

  function isAbortRequested(signal) {
    return !!(signal && signal.aborted);
  }

  function markPendingCancelled(domains, errorMsg) {
    for (var i = 0; i < DOMAINS.length; i++) {
      var name = DOMAINS[i];
      var st = domains[name] && domains[name].status;
      if (st === "pending" || st === "running") {
        domains[name].status = "cancelled";
        domains[name].error = errorMsg || ABORT_MSG;
      }
    }
  }

  function markSkipped(domainsStatus, name) {
    domainsStatus[name].status = "skipped";
    domainsStatus[name].error = null;
  }

  /**
   * @param {object} opts
   * @param {string[]} opts.prontuarios
   * @param {object} opts.period — saída de resolvePeriodShortcut
   * @param {{ cadastro?: boolean, exames?: boolean, cirurgias?: boolean, controles?: boolean, prescricao?: boolean }} [opts.domains]
   * @param {{
   *   openPol: (prontuario: string) => Promise<{ok:boolean,error?:string}>,
   *   openControles: (prontuario: string, period: object) => Promise<{ok:boolean,error?:string}>,
   *   openPrescricoes: (prontuario: string, period: object) => Promise<{ok:boolean,error?:string}>,
   *   closeControlesPrescricoesTabs?: () => Promise<{ok:boolean,error?:string}>,
   * }} opts.nav
   * @param {{
   *   extractCadastro?: (ctx) => Promise<{ok:boolean,error?:string,patient?:object}>,
   *   extractExames: (ctx) => Promise<{ok:boolean,error?:string,patient?:object}>,
   *   extractCirurgias: (ctx) => Promise<{ok:boolean,error?:string,patient?:object}>,
   *   extractControles: (ctx) => Promise<{ok:boolean,error?:string,patient?:object}>,
   *   extractPrescricao: (ctx) => Promise<{ok:boolean,error?:string,patient?:object}>,
   * }} opts.extract
   * @param {(ctx) => Promise<{ok:boolean,error?:string,patientKey?:string}>} opts.autofillAndSave
   * @param {(evt: object) => void} [opts.onProgress]
   * @param {(patientKey: string) => Promise<void>} [opts.syncPatient]
   * @param {AbortSignal} [opts.signal] — Parar: interrompe antes do próximo domínio/paciente
   */
  async function runPassometroBatch(opts) {
    opts = opts || {};
    var prontuarios = Array.isArray(opts.prontuarios) ? opts.prontuarios : [];
    var period = opts.period || null;
    var enabled = normalizeBatchDomains(opts.domains);
    var needPol = !!(enabled.cadastro || enabled.exames || enabled.cirurgias);
    var needCtrl = !!enabled.controles;
    var needRx = !!enabled.prescricao;
    var nav = opts.nav || {};
    var extract = opts.extract || {};
    var autofillAndSave = opts.autofillAndSave;
    var onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    var syncPatient = typeof opts.syncPatient === "function" ? opts.syncPatient : null;
    var signal = opts.signal || null;

    if (!prontuarios.length) {
      return {
        ok: false,
        aborted: false,
        error: "Nenhum prontuário para processar.",
        results: [],
      };
    }
    if (!period) {
      return {
        ok: false,
        aborted: false,
        error: "Período não informado.",
        results: [],
      };
    }

    var results = [];
    var batchOk = true;
    var aborted = false;

    function finishAborted(extraResults) {
      aborted = true;
      batchOk = false;
      if (extraResults) results.push(extraResults);
      onProgress({
        type: "aborted",
        total: prontuarios.length,
        done: results.length,
      });
      return {
        ok: false,
        aborted: true,
        error: ABORT_MSG,
        results: results,
      };
    }

    for (var pi = 0; pi < prontuarios.length; pi++) {
      if (isAbortRequested(signal)) {
        return finishAborted(null);
      }

      var prontuario = String(prontuarios[pi]);
      var domains = emptyDomainStatus();
      var identityApi =
        (typeof globalThis !== "undefined" && globalThis.AghuPatientIdentity) ||
        null;
      var initialKey =
        (identityApi &&
          identityApi.buildPatientKey &&
          identityApi.buildPatientKey(prontuario)) ||
        prontuario;
      var patientMeta = { prontuario: prontuario, patientKey: initialKey };
      var row = {
        prontuario: prontuario,
        period: period,
        domains: domains,
        ok: true,
        error: null,
      };

      onProgress({
        type: "patient_start",
        index: pi,
        total: prontuarios.length,
        prontuario: prontuario,
        domains: domains,
      });

      async function runDomain(name, fn) {
        if (isAbortRequested(signal)) {
          return { aborted: true };
        }
        domains[name].status = "running";
        onProgress({
          type: "domain",
          prontuario: prontuario,
          domain: name,
          status: "running",
          domains: domains,
        });
        try {
          var res = await fn();
          if (res && res.ok) {
            domains[name].status = "ok";
            domains[name].error = null;
            if (typeof res.entryCount === "number") {
              domains[name].entryCount = res.entryCount;
            }
            if (res.patient) {
              var keepPront = patientMeta.prontuario;
              var keepKey = patientMeta.patientKey;
              var keepNome = patientMeta.nomeCompleto || "";
              var keepPrimeiro = patientMeta.primeiroNome || "";
              var incomingPront = res.patient.prontuario;
              patientMeta = Object.assign({}, patientMeta, res.patient);
              // Item do lote: nunca sobrescrever prontuario/patientKey com DOM errado
              patientMeta.prontuario = keepPront;
              if (
                incomingPront != null &&
                String(incomingPront) !== String(keepPront)
              ) {
                patientMeta.patientKey = keepKey;
                patientMeta.nomeCompleto = keepNome;
                patientMeta.primeiroNome = keepPrimeiro;
              }
            }
            if (res.patientKey) patientMeta.patientKey = res.patientKey;
          } else {
            domains[name].status = "error";
            domains[name].error =
              (res && res.error) || "Falha na etapa " + name + ".";
            row.ok = false;
            batchOk = false;
          }
        } catch (e) {
          domains[name].status = "error";
          domains[name].error =
            (e && e.message) || "Erro inesperado em " + name + ".";
          row.ok = false;
          batchOk = false;
        }
        onProgress({
          type: "domain",
          prontuario: prontuario,
          domain: name,
          status: domains[name].status,
          error: domains[name].error,
          entryCount: domains[name].entryCount,
          domains: domains,
        });
        return { aborted: false };
      }

      var ctx = {
        prontuario: prontuario,
        period: period,
        patient: patientMeta,
      };

      // POL (compartilhado: cadastro ∨ exames ∨ cirurgias)
      if (isAbortRequested(signal)) {
        markPendingCancelled(domains, ABORT_MSG);
        row.ok = false;
        row.error = ABORT_MSG;
        return finishAborted(row);
      }
      if (!needPol) {
        if (!enabled.cadastro) markSkipped(domains, "cadastro");
        if (!enabled.exames) markSkipped(domains, "exames");
        if (!enabled.cirurgias) markSkipped(domains, "cirurgias");
      } else {
        var polNav = { ok: false, error: "nav.openPol indisponível" };
        if (typeof nav.openPol === "function") {
          try {
            polNav = (await nav.openPol(prontuario)) || polNav;
          } catch (e) {
            polNav = {
              ok: false,
              error: (e && e.message) || "Falha ao abrir POL.",
            };
          }
        }
        if (!polNav.ok) {
          var polErr = polNav.error || "Não foi possível abrir o POL.";
          if (enabled.cadastro) {
            domains.cadastro.status = "error";
            domains.cadastro.error = polErr;
            row.ok = false;
            batchOk = false;
            onProgress({
              type: "domain",
              prontuario: prontuario,
              domain: "cadastro",
              status: "error",
              error: domains.cadastro.error,
              domains: domains,
            });
          } else {
            markSkipped(domains, "cadastro");
          }
          if (enabled.exames) {
            domains.exames.status = "error";
            domains.exames.error = polErr;
            row.ok = false;
            batchOk = false;
            onProgress({
              type: "domain",
              prontuario: prontuario,
              domain: "exames",
              status: "error",
              error: domains.exames.error,
              domains: domains,
            });
          } else {
            markSkipped(domains, "exames");
          }
          if (enabled.cirurgias) {
            domains.cirurgias.status = "error";
            domains.cirurgias.error = polErr;
            row.ok = false;
            batchOk = false;
            onProgress({
              type: "domain",
              prontuario: prontuario,
              domain: "cirurgias",
              status: "error",
              error: domains.cirurgias.error,
              domains: domains,
            });
          } else {
            markSkipped(domains, "cirurgias");
          }
        } else {
          if (enabled.cadastro) {
            if (typeof extract.extractCadastro === "function") {
              var cadAbort = await runDomain("cadastro", function () {
                return extract.extractCadastro(ctx);
              });
              if (cadAbort && cadAbort.aborted) {
                markPendingCancelled(domains, ABORT_MSG);
                row.ok = false;
                row.error = ABORT_MSG;
                return finishAborted(row);
              }
            } else {
              domains.cadastro.status = "error";
              domains.cadastro.error = "Extractor de cadastro indisponível.";
              row.ok = false;
              batchOk = false;
            }
          } else {
            markSkipped(domains, "cadastro");
          }
          if (enabled.exames) {
            if (typeof extract.extractExames === "function") {
              var exAbort = await runDomain("exames", function () {
                return extract.extractExames(ctx);
              });
              if (exAbort && exAbort.aborted) {
                markPendingCancelled(domains, ABORT_MSG);
                row.ok = false;
                row.error = ABORT_MSG;
                return finishAborted(row);
              }
            } else {
              domains.exames.status = "error";
              domains.exames.error = "Extractor de exames indisponível.";
              row.ok = false;
              batchOk = false;
            }
          } else {
            markSkipped(domains, "exames");
          }
          if (enabled.cirurgias) {
            if (typeof extract.extractCirurgias === "function") {
              var cirAbort = await runDomain("cirurgias", function () {
                return extract.extractCirurgias(ctx);
              });
              if (cirAbort && cirAbort.aborted) {
                markPendingCancelled(domains, ABORT_MSG);
                row.ok = false;
                row.error = ABORT_MSG;
                return finishAborted(row);
              }
            } else {
              domains.cirurgias.status = "skipped";
            }
          } else {
            markSkipped(domains, "cirurgias");
          }
        }
      }

      // Controles (FEAT-110: fatias ≤15d; período pai para Exames/Rx/autofill)
      if (isAbortRequested(signal)) {
        markPendingCancelled(domains, ABORT_MSG);
        row.ok = false;
        row.error = ABORT_MSG;
        return finishAborted(row);
      }
      if (!needCtrl) {
        markSkipped(domains, "controles");
      } else if (typeof extract.extractControles !== "function") {
        domains.controles.status = "error";
        domains.controles.error = "Extractor de controles indisponível.";
        row.ok = false;
        batchOk = false;
      } else {
        var ctrlSlices =
          periodShortcutsApi &&
          typeof periodShortcutsApi.chunkControlesPeriods === "function"
            ? periodShortcutsApi.chunkControlesPeriods(period)
            : [period];
        if (!Array.isArray(ctrlSlices) || !ctrlSlices.length) {
          ctrlSlices = [period];
        }
        var sliceTotal = ctrlSlices.length;
        var ctrlEntrySum = 0;
        var ctrlFailed = false;
        var ctrlAborted = false;
        var ctrlSoftWarnings = [];

        domains.controles.status = "running";
        domains.controles.error = null;

        for (var si = 0; si < sliceTotal; si++) {
          if (isAbortRequested(signal)) {
            ctrlAborted = true;
            break;
          }
          var slice = ctrlSlices[si];
          var progressEvt = {
            type: "domain",
            prontuario: prontuario,
            domain: "controles",
            status: "running",
            domains: domains,
          };
          if (sliceTotal > 1) {
            progressEvt.sliceIndex = si + 1;
            progressEvt.sliceTotal = sliceTotal;
          }
          onProgress(progressEvt);

          var ctrlNav = { ok: false, error: "nav.openControles indisponível" };
          if (typeof nav.openControles === "function") {
            try {
              ctrlNav =
                (await nav.openControles(prontuario, slice)) || ctrlNav;
            } catch (e) {
              ctrlNav = {
                ok: false,
                error: (e && e.message) || "Falha ao abrir Controles.",
              };
            }
          }
          if (!ctrlNav.ok) {
            domains.controles.status = "error";
            domains.controles.error =
              ctrlNav.error || "Não foi possível abrir Controles.";
            row.ok = false;
            batchOk = false;
            ctrlFailed = true;
            break;
          }

          // AGHU sem registros nesta fatia — não extract (evita grelha residual).
          if (ctrlNav.empty) {
            ctrlSoftWarnings.push(
              "Fatia " +
                (si + 1) +
                "/" +
                sliceTotal +
                ": sem registros no período."
            );
            continue;
          }

          var ctrlRes;
          try {
            ctrlRes = await extract.extractControles(
              Object.assign({}, ctx, { period: slice })
            );
          } catch (e) {
            ctrlRes = {
              ok: false,
              error: (e && e.message) || "Erro inesperado em controles.",
            };
          }

          if (ctrlRes && ctrlRes.ok) {
            if (typeof ctrlRes.entryCount === "number") {
              ctrlEntrySum += ctrlRes.entryCount;
            }
            if (ctrlRes.patient) {
              var keepProntC = patientMeta.prontuario;
              var keepKeyC = patientMeta.patientKey;
              var keepNomeC = patientMeta.nomeCompleto || "";
              var keepPrimeiroC = patientMeta.primeiroNome || "";
              var incomingProntC = ctrlRes.patient.prontuario;
              patientMeta = Object.assign({}, patientMeta, ctrlRes.patient);
              patientMeta.prontuario = keepProntC;
              if (
                incomingProntC != null &&
                String(incomingProntC) !== String(keepProntC)
              ) {
                patientMeta.patientKey = keepKeyC;
                patientMeta.nomeCompleto = keepNomeC;
                patientMeta.primeiroNome = keepPrimeiroC;
              }
            }
            if (ctrlRes.patientKey) patientMeta.patientKey = ctrlRes.patientKey;
          } else if (isControlesSliceSoftEmpty(ctrlRes)) {
            ctrlSoftWarnings.push(
              "Fatia " +
                (si + 1) +
                "/" +
                sliceTotal +
                ": " +
                ((ctrlRes && (ctrlRes.error || ctrlRes.erro)) ||
                  "sem dados extraíveis.")
            );
            continue;
          } else {
            domains.controles.status = "error";
            domains.controles.error =
              (ctrlRes && ctrlRes.error) || "Falha na etapa controles.";
            row.ok = false;
            batchOk = false;
            ctrlFailed = true;
            break;
          }
        }

        if (ctrlAborted) {
          markPendingCancelled(domains, ABORT_MSG);
          row.ok = false;
          row.error = ABORT_MSG;
          return finishAborted(row);
        }

        if (!ctrlFailed) {
          domains.controles.status = "ok";
          domains.controles.error = null;
          if (ctrlEntrySum > 0) {
            domains.controles.entryCount = ctrlEntrySum;
          }
          if (ctrlSoftWarnings.length) {
            domains.controles.warnings = ctrlSoftWarnings;
          }
        }

        var doneEvt = {
          type: "domain",
          prontuario: prontuario,
          domain: "controles",
          status: domains.controles.status,
          error: domains.controles.error,
          entryCount: domains.controles.entryCount,
          domains: domains,
        };
        if (sliceTotal > 1) {
          doneEvt.sliceIndex = ctrlFailed
            ? Math.min(si + 1, sliceTotal)
            : sliceTotal;
          doneEvt.sliceTotal = sliceTotal;
        }
        onProgress(doneEvt);
      }

      // Prescrições
      if (isAbortRequested(signal)) {
        markPendingCancelled(domains, ABORT_MSG);
        row.ok = false;
        row.error = ABORT_MSG;
        return finishAborted(row);
      }
      if (!needRx) {
        markSkipped(domains, "prescricao");
      } else {
        var rxNav = { ok: false, error: "nav.openPrescricoes indisponível" };
        if (typeof nav.openPrescricoes === "function") {
          try {
            rxNav = (await nav.openPrescricoes(prontuario, period)) || rxNav;
          } catch (e) {
            rxNav = {
              ok: false,
              error: (e && e.message) || "Falha ao abrir Prescrições.",
            };
          }
        }
        if (!rxNav.ok) {
          domains.prescricao.status = "error";
          domains.prescricao.error =
            rxNav.error || "Não foi possível abrir Prescrições.";
          row.ok = false;
          batchOk = false;
        } else if (typeof extract.extractPrescricao === "function") {
          var rxAbort = await runDomain("prescricao", function () {
            return extract.extractPrescricao(ctx);
          });
          if (rxAbort && rxAbort.aborted) {
            markPendingCancelled(domains, ABORT_MSG);
            row.ok = false;
            row.error = ABORT_MSG;
            return finishAborted(row);
          }
        } else {
          domains.prescricao.status = "error";
          domains.prescricao.error = "Extractor de prescrição indisponível.";
          row.ok = false;
          batchOk = false;
        }
      }

      // Autofill + archive (sempre tenta com o que houver)
      if (isAbortRequested(signal)) {
        markPendingCancelled(domains, ABORT_MSG);
        row.ok = false;
        row.error = ABORT_MSG;
        return finishAborted(row);
      }
      if (typeof autofillAndSave === "function") {
        var fillAbort = await runDomain("passometro", function () {
          return autofillAndSave({
            prontuario: prontuario,
            period: period,
            patient: patientMeta,
            domains: domains,
          });
        });
        if (fillAbort && fillAbort.aborted) {
          markPendingCancelled(domains, ABORT_MSG);
          row.ok = false;
          row.error = ABORT_MSG;
          return finishAborted(row);
        }
      } else {
        domains.passometro.status = "skipped";
      }

      if (syncPatient && patientMeta.patientKey) {
        try {
          await syncPatient(patientMeta.patientKey);
        } catch (_e) {
          /* sync falho não aborta — fail-soft */
        }
      }

      // Fecha abas Controles + Prescrições (tabs-close) antes do próximo prontuário.
      if (typeof nav.closeControlesPrescricoesTabs === "function") {
        try {
          await nav.closeControlesPrescricoesTabs();
        } catch (_eClose) {
          /* fail-soft — abas já fechadas / ausentes */
        }
      }

      onProgress({
        type: "patient_done",
        index: pi,
        total: prontuarios.length,
        prontuario: prontuario,
        domains: domains,
        ok: row.ok,
      });

      results.push(row);
    }

    return {
      ok: batchOk,
      aborted: aborted,
      error: batchOk ? null : "Lote concluído com falhas (ver status por domínio).",
      results: results,
    };
  }

  return {
    DOMAINS: DOMAINS,
    ABORT_MSG: ABORT_MSG,
    emptyDomainStatus: emptyDomainStatus,
    isAbortRequested: isAbortRequested,
    normalizeBatchDomains: normalizeBatchDomains,
    hasAnyClinicalDomain: hasAnyClinicalDomain,
    shouldBlockControlesMaxDays: shouldBlockControlesMaxDays,
    isControlesSliceSoftEmpty: isControlesSliceSoftEmpty,
    runPassometroBatch: runPassometroBatch,
  };
});
