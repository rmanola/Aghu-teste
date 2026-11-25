/**
 * Contexto JSON para análise clínica LLM — prontuário colado + dados sync.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisContext = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function deps() {
    var dateBr = null;
    var promptMod = null;
    var poMod = null;
    var pmSchema = null;
    if (typeof require === "function") {
      try {
        dateBr = require("./date-br.js");
      } catch (_e) {}
      try {
        promptMod = require("./patient-analysis-prompt.js");
      } catch (_e2) {}
      try {
        poMod = require("./passometro-po.js");
      } catch (_e3) {}
      try {
        pmSchema = require("./passometro-schema.js");
      } catch (_e4) {}
    }
    dateBr = dateBr || root.AghuDateBr || null;
    promptMod = promptMod || root.AghuPatientAnalysisPrompt || null;
    poMod = poMod || root.AghuPassometroPo || null;
    pmSchema = pmSchema || root.AghuPassometroSchema || null;
    return { dateBr: dateBr, promptMod: promptMod, poMod: poMod, pmSchema: pmSchema };
  }

  function formatDiagnosticosForContext(header) {
    var d = deps();
    if (d.pmSchema && d.pmSchema.formatDiagnosticosDisplay) {
      return d.pmSchema.formatDiagnosticosDisplay(header || {});
    }
    return header && header.diagnostico ? String(header.diagnostico) : "";
  }

  /**
   * @param {unknown} examsRaw
   * @returns {object[]}
   */
  function listExamsFromArchive(examsRaw) {
    if (Array.isArray(examsRaw)) return examsRaw.filter(Boolean);
    if (!examsRaw || typeof examsRaw !== "object") return [];
    var byKey = /** @type {{ examsByKey?: object }} */ (examsRaw).examsByKey;
    if (byKey && typeof byKey === "object") {
      return Object.keys(byKey).map(function (k) {
        return byKey[k];
      });
    }
    return [];
  }

  /**
   * @param {string|null} isoA yyyy-mm-dd
   * @param {string} refIso full ISO
   */
  function hoursAgoFromIso(isoA, refIso) {
    if (!isoA || !refIso) return null;
    var a = new Date(isoA + "T12:00:00").getTime();
    var b = new Date(refIso).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, Math.round(Math.abs(b - a) / 3600000));
  }

  function daysAgoFromIso(isoA, refIso) {
    var h = hoursAgoFromIso(isoA, refIso);
    if (h == null) return null;
    return Math.round(h / 24);
  }

  /**
   * @param {object[]} exams
   * @param {{ iso: string }} referenceNow
   */
  function buildLastLab(exams, referenceNow) {
    var list = Array.isArray(exams) ? exams : [];
    var maxIso = "";
    for (var i = 0; i < list.length; i++) {
      var iso = list[i] && list[i].dataColetaISO ? String(list[i].dataColetaISO) : "";
      if (iso && iso > maxIso) maxIso = iso;
    }
    if (!maxIso) {
      return { dateIso: null, dateBr: null, hoursAgo: null, daysAgo: null, items: [] };
    }
    var d = deps();
    var dateBr = d.dateBr && d.dateBr.isoToBr ? d.dateBr.isoToBr(maxIso) : maxIso;
    var items = [];
    for (var j = 0; j < list.length; j++) {
      var ex = list[j];
      if (!ex || String(ex.dataColetaISO || "") !== maxIso) continue;
      var name = String(ex.examName || ex.solicitation || "Exame").trim();
      var val = String(ex.result || "").trim();
      if (!val && ex.fetchedResult) {
        val = String(ex.fetchedResult).slice(0, 200).trim();
      }
      if (val.length > 120) val = val.slice(0, 117) + "...";
      items.push({
        name: name,
        sigla: name.split(/\s+/)[0],
        valueSummary: val || "—",
        dataColetaISO: maxIso,
      });
    }
    return {
      dateIso: maxIso,
      dateBr: dateBr,
      hoursAgo: hoursAgoFromIso(maxIso, referenceNow.iso),
      daysAgo: daysAgoFromIso(maxIso, referenceNow.iso),
      items: items,
    };
  }

  /**
   * @param {{ passometro?: object, controles?: object, prescricoes?: object, exams?: object, pii?: object }} sync
   * @returns {string}
   */
  function buildProntuarioDraftFromSync(sync) {
    sync = sync || {};
    var lines = [];
    var header = sync.passometro && sync.passometro.header ? sync.passometro.header : {};
    var diagnosticosText = formatDiagnosticosForContext(header);
    if (diagnosticosText) {
      lines.push("Diagnósticos:");
      diagnosticosText.split("\n").forEach(function (line) {
        lines.push("  " + line);
      });
    }
    if (header.hdaHpp) lines.push("HDA/HPP: " + header.hdaHpp);
    if (header.dih) lines.push("DIH: " + header.dih);
    var poMod = typeof AghuPassometroPo !== "undefined" ? AghuPassometroPo : null;
    if (poMod && poMod.formatCirurgiasDisplay) {
      var cirurgiasText = poMod.formatCirurgiasDisplay(header);
      if (cirurgiasText) {
        lines.push("Cirurgias:");
        cirurgiasText.split("\n").forEach(function (line) {
          lines.push("  " + line);
        });
      }
    } else {
      if (header.cirurgia) lines.push("Cirurgia: " + header.cirurgia);
      if (header.dataCirurgia) lines.push("Data cirurgia: " + header.dataCirurgia);
    }

    var entries =
      sync.controles && Array.isArray(sync.controles.entries)
        ? sync.controles.entries
        : [];
    if (entries.length) {
      var last = entries[entries.length - 1];
      if (last && last.texto) {
        lines.push("");
        lines.push("Controles (" + (last.periodo || "—") + "):");
        lines.push(String(last.texto).slice(0, 2000));
      }
    }

    var rx = sync.prescricoes;
    if (rx && typeof rx === "object") {
      lines.push("");
      lines.push("Prescrição (" + (rx.data || "—") + "):");
      if (rx.dieta) lines.push("Dieta: " + rx.dieta);
      if (Array.isArray(rx.antibiotico) && rx.antibiotico.length) {
        lines.push("ATB: " + rx.antibiotico.join("; "));
      }
      if (Array.isArray(rx.hidratacao) && rx.hidratacao.length) {
        lines.push("HV: " + rx.hidratacao.join("; "));
      }
      if (rx.texto) lines.push(String(rx.texto).slice(0, 800));
    }

    var passEntries =
      sync.passometro && Array.isArray(sync.passometro.entries)
        ? sync.passometro.entries
        : [];
    if (passEntries.length) {
      var pe = passEntries[passEntries.length - 1];
      if (pe && pe.pendencias) {
        lines.push("");
        lines.push("Pendências passômetro: " + String(pe.pendencias).slice(0, 500));
      }
      if (pe && pe.cd) {
        lines.push("Evolução (cd): " + String(pe.cd).slice(0, 800));
      }
    }

    var examList = listExamsFromArchive(sync.exams);
    var lastLab = buildLastLab(examList, { iso: new Date().toISOString() });
    if (lastLab.items.length) {
      lines.push("");
      lines.push("Lab " + (lastLab.dateBr || lastLab.dateIso) + " (resumo):");
      for (var li = 0; li < Math.min(lastLab.items.length, 12); li++) {
        var it = lastLab.items[li];
        lines.push("- " + it.name + ": " + it.valueSummary);
      }
    }

    return lines.join("\n").trim();
  }

  function dihDaysAgo(dihBr, referenceNow) {
    if (!dihBr || !String(dihBr).trim()) return null;
    var d = deps();
    var dihIso = d.dateBr && d.dateBr.brToIso ? d.dateBr.brToIso(dihBr) : null;
    if (!dihIso) return null;
    var refDate = referenceNow.localDateBr || "";
    var refIso = d.dateBr && d.dateBr.brToIso ? d.dateBr.brToIso(refDate) : null;
    if (!refIso) return null;
    var a = new Date(dihIso + "T12:00:00").getTime();
    var b = new Date(refIso + "T12:00:00").getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function latestControles(controles) {
    var entries =
      controles && Array.isArray(controles.entries) ? controles.entries : [];
    if (!entries.length) return null;
    var sorted = entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
    var e = sorted[0];
    return {
      periodo: e.periodo || "",
      textoPreview: String(e.texto || "").slice(0, 500),
      extractedAt: e.extractedAt || null,
    };
  }

  function buildTherapeuticSummary(prescricoes, passometro) {
    var rx = prescricoes && typeof prescricoes === "object" ? prescricoes : {};
    var lastEntry =
      passometro && Array.isArray(passometro.entries) && passometro.entries.length
        ? passometro.entries[passometro.entries.length - 1]
        : null;
    return {
      data: rx.data || null,
      dieta: rx.dieta || (lastEntry && lastEntry.dieta) || null,
      antibiotico: Array.isArray(rx.antibiotico) ? rx.antibiotico : [],
      hidratacao: Array.isArray(rx.hidratacao) ? rx.hidratacao : [],
      analgesia: Array.isArray(rx.analgesia) ? rx.analgesia : [],
      pendencias: lastEntry && lastEntry.pendencias ? lastEntry.pendencias : null,
      validadeInicial: rx.validadeInicial || null,
      validadeFinal: rx.validadeFinal || null,
    };
  }

  function buildFlagsSummary(exams) {
    var list = listExamsFromArchive(exams);
    var flags = [];
    for (var i = 0; i < list.length; i++) {
      var ex = list[i];
      var name = String(ex.examName || "").toUpperCase();
      var res = String(ex.result || ex.fetchedResult || "");
      var mK = res.match(/([\d,.]+)/);
      if (name.indexOf("POT") >= 0 || name === "K" || name.indexOf("K+") >= 0) {
        if (mK) {
          var kv = parseFloat(mK[1].replace(",", "."));
          if (kv > 5.5) {
            flags.push({
              id: "K_HIGH",
              label: "Potássio elevado",
              value: kv,
              at: ex.dataColetaISO || ex.date,
            });
          }
        }
      }
    }
    return flags;
  }

  /**
   * @param {string} input
   * @returns {string}
   */
  function stableHash(input) {
    var s = String(input || "");
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = (h * 33) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * @param {object} opts
   */
  function computeSourceFingerprint(opts) {
    opts = opts || {};
    var blob = JSON.stringify({
      prontuarioText: opts.prontuarioText || "",
      sync: opts.syncSnapshot || {},
      refDate: opts.referenceNow && opts.referenceNow.localDateBr,
    });
    return stableHash(blob);
  }

  /**
   * @param {{ prontuarioText: string, sync: object, referenceDate?: Date }} opts
   */
  function buildPatientAnalysisContext(opts) {
    opts = opts || {};
    var d = deps();
    var ref =
      d.promptMod && d.promptMod.buildReferenceNow
        ? d.promptMod.buildReferenceNow(opts.referenceDate || new Date())
        : { iso: new Date().toISOString(), localDateBr: "", timezone: "America/Sao_Paulo" };

    var sync = opts.sync || {};
    var examList = listExamsFromArchive(sync.exams);
    var header = sync.passometro && sync.passometro.header ? sync.passometro.header : {};
    var poMod = d.poMod && d.poMod.normalizeCirurgias ? d.poMod : null;
    var cirurgias = poMod ? poMod.normalizeCirurgias(header) : [];
    var hasCirurgias = cirurgias.length > 0;
    var poLabel = null;
    if (hasCirurgias && sync.passometro && Array.isArray(sync.passometro.entries)) {
      var lastPe = sync.passometro.entries[sync.passometro.entries.length - 1];
      if (lastPe && lastPe.po) poLabel = String(lastPe.po);
    }

    var lastLab = buildLastLab(examList, ref);
    var orphans = examList.filter(function (e) {
      return e && !e.dataColetaISO;
    }).map(function (e) {
      return { name: e.examName || "Exame", note: "sem dataColetaISO" };
    });

    var syncSnapshot = {
      flags: buildFlagsSummary(sync.exams),
      lastLabDateIso: lastLab.dateIso,
      examCount: examList.length,
    };

    return {
      referenceNow: ref,
      prontuarioColado: {
        text: String(opts.prontuarioText || ""),
        updatedAt: opts.prontuarioUpdatedAt || null,
      },
      dadosSincronizados: {
        identificacao: {
          idade: header.idade || sync.pii?.idade || null,
          sexo: sync.pii?.sexo || null,
          prontuario: header.prontuario || sync.pii?.prontuario || null,
        },
        diagnostico: formatDiagnosticosForContext(header) || null,
        diagnosticos: (function () {
          var d = deps();
          if (d.pmSchema && d.pmSchema.normalizeDiagnosticosFromHeader) {
            return d.pmSchema.normalizeDiagnosticosFromHeader(header || {});
          }
          return header && header.diagnostico
            ? [{ id: "legacy", data: "", texto: String(header.diagnostico) }]
            : [];
        })(),
        cirurgias: cirurgias.map(function (c) {
          return { data: c.data, nome: String(c.nome || "").trim() };
        }),
        cirurgia: header.cirurgia || null,
        dataCirurgia: header.dataCirurgia || null,
        poLabel: hasCirurgias ? poLabel : "PO indisponível",
        poAvailable: hasCirurgias,
        dih: header.dih || null,
        dihDaysAgo: dihDaysAgo(header.dih, ref),
        hdaHpp: header.hdaHpp || null,
        controles: { latest: latestControles(sync.controles) },
        passometro: {
          latestEntry:
            sync.passometro &&
            Array.isArray(sync.passometro.entries) &&
            sync.passometro.entries.length
              ? sync.passometro.entries[sync.passometro.entries.length - 1]
              : null,
        },
        terapeutica: buildTherapeuticSummary(sync.prescricoes, sync.passometro),
        lastLab: lastLab,
        flags: syncSnapshot.flags,
        examsOrphans: orphans.slice(0, 5),
      },
      sourceFingerprint: computeSourceFingerprint({
        prontuarioText: opts.prontuarioText,
        syncSnapshot: syncSnapshot,
        referenceNow: ref,
      }),
    };
  }

  /**
   * Exames no contexto não devem incluir fetchedResult integral.
   * @param {object} ctx
   */
  function contextExcludesFullPdfLaudos(ctx) {
    var json = JSON.stringify(ctx || {});
    return json.indexOf('"fetchedResult"') < 0;
  }

  /**
   * @param {object} sync
   * @returns {boolean}
   */
  function syncPayloadHasData(sync) {
    sync = sync || {};
    if (sync.pii && Object.keys(sync.pii).length) return true;
    if (listExamsFromArchive(sync.exams).length) return true;
    if (sync.controles && Array.isArray(sync.controles.entries) && sync.controles.entries.length) {
      return true;
    }
    if (sync.prescricoes && Object.keys(sync.prescricoes).length) return true;
    if (
      sync.passometro &&
      ((sync.passometro.header && Object.keys(sync.passometro.header).length) ||
        (Array.isArray(sync.passometro.entries) && sync.passometro.entries.length))
    ) {
      return true;
    }
    return false;
  }

  return {
    listExamsFromArchive: listExamsFromArchive,
    buildLastLab: buildLastLab,
    buildProntuarioDraftFromSync: buildProntuarioDraftFromSync,
    buildPatientAnalysisContext: buildPatientAnalysisContext,
    computeSourceFingerprint: computeSourceFingerprint,
    contextExcludesFullPdfLaudos: contextExcludesFullPdfLaudos,
    syncPayloadHasData: syncPayloadHasData,
    stableHash: stableHash,
  };
});
