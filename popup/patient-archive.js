/**
 * Arquivo local dos exames por paciente (primeiro nome + prontuário).
 * Nome e prontuário vêm do texto da página AGHU (content/content.js — innerText).
 */
(function () {
  "use strict";

  var INDEX_KEY = "aghu_patient_index_v1";
  var LAST_KEY = "aghu_last_patient_key";
  var PREFIX = "aghu_patient_v1_";
  var SCHEMA_VERSION = 1;
  var MAX_INDEX_ENTRIES = 48;
  var MAX_RECORD_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  function normalizeProntuario(raw) {
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  function primeiroNomeFromFull(fullName) {
    if (!fullName || String(fullName).trim() === "") return "";
    var parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    return parts[0] || "";
  }

  function slugPart(s) {
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

  function buildPatientKey(prontuarioDigits) {
    if (window.AghuPatientIdentity && window.AghuPatientIdentity.buildPatientKey) {
      return window.AghuPatientIdentity.buildPatientKey(prontuarioDigits);
    }
    var p = normalizeProntuario(prontuarioDigits);
    return p || null;
  }

  function examMergeKey(exam) {
    if (window.AghuExamMergeKey && window.AghuExamMergeKey.examMergeKey) {
      return window.AghuExamMergeKey.examMergeKey(exam);
    }
    var iso = exam.dataColetaISO || "nodate";
    var sol = String(exam.solicitation || "").trim();
    var name = String(exam.examName || "").trim();
    var sampleApi = window.AghuExamSampleKey;
    var sample =
      sampleApi && sampleApi.normalizeSampleKey
        ? sampleApi.normalizeSampleKey(exam.sample)
        : String(exam.sample || "")
            .trim()
            .toLowerCase();
    return iso + "|" + sol + "|" + name + "|" + sample;
  }

  function slimExam(exam) {
    var base = {
      rowIndex: exam.rowIndex,
      date: exam.date,
      solicitation: exam.solicitation,
      examName: exam.examName,
      sample: exam.sample,
      lab: exam.lab,
      result: exam.result,
      hasAttachment: exam.hasAttachment,
      hasDetail: exam.hasDetail,
      hasCheckbox: exam.hasCheckbox,
      checkboxId: exam.checkboxId || null,
      dataColetaISO: exam.dataColetaISO ?? null,
      dataColetaLabel: exam.dataColetaLabel ?? null,
      fetchedResult: exam.fetchedResult || "",
      detailText: exam.detailText || "",
      hadPdf: !!exam.hadPdf,
      fetchHint: exam.fetchHint || "",
      fetchReason: exam.fetchReason || "",
      aiOrganized: exam.aiOrganized || "",
    };
    if (window.AghuExamManualEdit && window.AghuExamManualEdit.slimManualEditMeta) {
      Object.assign(base, window.AghuExamManualEdit.slimManualEditMeta(exam));
    }
    return base;
  }

  function mergeExamRows(prev, next) {
    if (window.AghuExamManualEdit && window.AghuExamManualEdit.mergeExamRows) {
      return window.AghuExamManualEdit.mergeExamRows(prev, next, slimExam);
    }
    if (!prev) return slimExam(next);
    var a = slimExam(prev);
    var b = slimExam(next);
    var sampleKey = window.AghuExamSampleKey;
    if (
      sampleKey &&
      sampleKey.samplesMergeCompatible &&
      !sampleKey.samplesMergeCompatible(a, b)
    ) {
      return slimExam(sampleKey.pickExamRowOnSampleConflict(a, b));
    }
    var merged = Object.assign({}, a, b);
    function pickLonger(x, y) {
      var sa = x == null ? "" : String(x);
      var sb = y == null ? "" : String(y);
      return sb.length > sa.length ? sb : sa;
    }
    merged.fetchedResult = pickLonger(a.fetchedResult, b.fetchedResult);
    merged.detailText = pickLonger(a.detailText, b.detailText);
    merged.aiOrganized = pickLonger(a.aiOrganized, b.aiOrganized);
    merged.result = pickLonger(a.result, b.result);
    merged.fetchHint = b.fetchHint || a.fetchHint;
    merged.fetchReason = b.fetchReason || a.fetchReason;
    merged.hasAttachment = !!(a.hasAttachment || b.hasAttachment);
    merged.hasDetail = !!(a.hasDetail || b.hasDetail);
    merged.hasCheckbox = !!(a.hasCheckbox || b.hasCheckbox);
    var resolve = window.AghuExamResultResolve;
    if (resolve && resolve.clearPartialGridResultForGasometry) {
      resolve.clearPartialGridResultForGasometry(merged);
    }
    return merged;
  }

  function overwriteExamRows(prev, next) {
    if (window.AghuExamManualEdit && window.AghuExamManualEdit.overwriteExamRow) {
      return window.AghuExamManualEdit.overwriteExamRow(prev, next, slimExam);
    }
    return slimExam(next);
  }

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  async function loadPatientRecord(patientKey) {
    if (!patientKey) return null;
    var k = recordKey(patientKey);
    var got = await browser.storage.local.get(k);
    return got[k] || null;
  }

  async function savePatientRecord(rec) {
    if (!rec || !rec.patientKey) return;
    rec.version = SCHEMA_VERSION;
    rec.atualizadoEm = Date.now();
    var payload = {};
    payload[recordKey(rec.patientKey)] = rec;
    await browser.storage.local.set(payload);
  }

  async function loadIndex() {
    var got = await browser.storage.local.get(INDEX_KEY);
    var idx = got[INDEX_KEY];
    if (!idx || !Array.isArray(idx.entries)) return { entries: [] };
    return idx;
  }

  /**
   * Garante registro mínimo em patient archive (ex.: após extração de prescrição).
   * @param {{ patientKey: string, primeiroNome?: string, nomeCompleto?: string, prontuario?: string }} meta
   */
  function applyMetaIdentity(rec, meta) {
    var mergeApi =
      window.AghuPatientMetaMerge && window.AghuPatientMetaMerge.applyPatientIdentityToRecord;
    if (mergeApi) {
      return mergeApi(rec, meta);
    }
    rec.primeiroNome = meta.primeiroNome;
    rec.nomeCompleto = meta.nomeCompleto || rec.nomeCompleto;
    rec.prontuario = meta.prontuario;
    return rec;
  }

  async function ensureMinimalPatientRecord(meta) {
    if (!meta || !meta.patientKey) return;
    var rec = await loadPatientRecord(meta.patientKey);
    if (!rec) {
      rec = {
        patientKey: meta.patientKey,
        primeiroNome: meta.primeiroNome || "",
        nomeCompleto: meta.nomeCompleto || "",
        prontuario: meta.prontuario || "",
        examsByKey: {},
      };
    } else {
      applyMetaIdentity(rec, meta);
      if (!rec.examsByKey) rec.examsByKey = {};
    }
    await savePatientRecord(rec);
    // ALTAEXT-AC-13: one-click / domínio sem exames deve indexar o select.
    await upsertIndexEntry({
      patientKey: rec.patientKey,
      primeiroNome: rec.primeiroNome || "",
      nomeCompleto: rec.nomeCompleto || "",
      prontuario: rec.prontuario || "",
    });
  }

  async function saveIndex(entries) {
    var obj = {};
    obj[INDEX_KEY] = { entries: entries };
    await browser.storage.local.set(obj);
  }

  function indexMetaFromRecord(rec) {
    if (!rec || !rec.patientKey) return null;
    return {
      patientKey: rec.patientKey,
      primeiroNome:
        rec.primeiroNome || primeiroNomeFromFull(rec.nomeCompleto) || "",
      nomeCompleto: rec.nomeCompleto || "",
      prontuario: rec.prontuario || "",
      atualizadoEm: rec.atualizadoEm || Date.now(),
    };
  }

  async function upsertIndexEntry(meta) {
    var idx = await loadIndex();
    var list = idx.entries.filter(function (e) {
      return e.patientKey !== meta.patientKey;
    });
    list.unshift({
      patientKey: meta.patientKey,
      primeiroNome: meta.primeiroNome,
      nomeCompleto: meta.nomeCompleto || "",
      prontuario: meta.prontuario,
      atualizadoEm: Date.now(),
    });
    list.sort(function (a, b) {
      return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
    });
    if (list.length > MAX_INDEX_ENTRIES) {
      var dropped = list.splice(MAX_INDEX_ENTRIES);
      for (var i = 0; i < dropped.length; i++) {
        await browser.storage.local.remove(recordKey(dropped[i].patientKey));
      }
    }
    await saveIndex(list);
  }

  /**
   * Records `aghu_patient_v1_*` sem entrada no índice (ex.: Cadastro one-click
   * antes deste fix) — redescobertos para o select global.
   * @param {Array<{patientKey: string}>} existingEntries
   * @returns {Promise<Array<{patientKey: string, primeiroNome: string, nomeCompleto: string, prontuario: string, atualizadoEm: number}>>}
   */
  async function findOrphanIndexEntries(existingEntries) {
    var known = {};
    for (var i = 0; i < existingEntries.length; i++) {
      known[existingEntries[i].patientKey] = true;
    }
    var all = await browser.storage.local.get(null);
    var orphans = [];
    var keys = Object.keys(all || {});
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (k.indexOf(PREFIX) !== 0) continue;
      var meta = indexMetaFromRecord(all[k]);
      if (!meta || known[meta.patientKey]) continue;
      orphans.push(meta);
    }
    return orphans;
  }

  async function mergeExamsIntoRecord(patientMeta, exams, opts) {
    opts = opts || {};
    var mode = opts.mode === "window_overwrite" ? "window_overwrite" : "merge";

    var rec =
      (await loadPatientRecord(patientMeta.patientKey)) || {
        patientKey: patientMeta.patientKey,
        primeiroNome: patientMeta.primeiroNome,
        nomeCompleto: patientMeta.nomeCompleto || "",
        prontuario: patientMeta.prontuario,
        examsByKey: {},
      };
    applyMetaIdentity(rec, patientMeta);
    if (!rec.examsByKey) rec.examsByKey = {};

    for (var i = 0; i < exams.length; i++) {
      var e = exams[i];
      var mk = examMergeKey(e);
      if (mode === "window_overwrite") {
        rec.examsByKey[mk] = overwriteExamRows(rec.examsByKey[mk], e);
      } else {
        rec.examsByKey[mk] = mergeExamRows(rec.examsByKey[mk], e);
      }
    }
    await savePatientRecord(rec);
    await upsertIndexEntry(patientMeta);
    var ptr = {};
    ptr[LAST_KEY] = patientMeta.patientKey;
    await browser.storage.local.set(ptr);
  }

  async function upsertSingleExam(patientKey, exam) {
    if (!patientKey || !exam) return;
    var rec = await loadPatientRecord(patientKey);
    if (!rec) return;
    if (!rec.examsByKey) rec.examsByKey = {};
    var mk = examMergeKey(exam);
    rec.examsByKey[mk] = mergeExamRows(rec.examsByKey[mk], exam);
    await savePatientRecord(rec);
  }

  async function replaceExamsByKey(patientKey, examsByKey, atualizadoEm) {
    if (!patientKey || !examsByKey || typeof examsByKey !== "object") return;
    var rec = await loadPatientRecord(patientKey);
    if (!rec) return;
    rec.examsByKey = examsByKey;
    if (typeof atualizadoEm === "number") {
      rec.atualizadoEm = atualizadoEm;
    }
    await savePatientRecord(rec);
  }

  function examsRecordToArray(rec) {
    if (!rec || !rec.examsByKey) return [];
    var keys = Object.keys(rec.examsByKey);
    var out = keys.map(function (k) {
      return rec.examsByKey[k];
    });
    out.sort(function (a, b) {
      var ia = a.dataColetaISO || "";
      var ib = b.dataColetaISO || "";
      return ib.localeCompare(ia);
    });
    return out;
  }

  async function listPatientsForSelect() {
    var idx = await loadIndex();
    var orphans = await findOrphanIndexEntries(idx.entries);
    if (!orphans.length) {
      return idx.entries.slice();
    }
    var byKey = {};
    for (var i = 0; i < idx.entries.length; i++) {
      byKey[idx.entries[i].patientKey] = idx.entries[i];
    }
    for (var j = 0; j < orphans.length; j++) {
      byKey[orphans[j].patientKey] = orphans[j];
    }
    var list = Object.keys(byKey).map(function (k) {
      return byKey[k];
    });
    list.sort(function (a, b) {
      return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
    });
    if (list.length > MAX_INDEX_ENTRIES) {
      list = list.slice(0, MAX_INDEX_ENTRIES);
    }
    await saveIndex(list);
    return list.slice();
  }

  async function pruneStalePatients() {
    var idx = await loadIndex();
    var now = Date.now();
    var kept = [];
    var removedKeys = [];
    for (var i = 0; i < idx.entries.length; i++) {
      var e = idx.entries[i];
      if (e.atualizadoEm && now - e.atualizadoEm > MAX_RECORD_AGE_MS) {
        removedKeys.push(recordKey(e.patientKey));
      } else {
        kept.push(e);
      }
    }
    if (removedKeys.length) {
      await browser.storage.local.remove(removedKeys);
      await saveIndex(kept);
    }
  }

  async function mergeDemographicsIntoRecord(patientKey, fields) {
    if (!patientKey || !fields || typeof fields !== "object") return;
    var rec = await loadPatientRecord(patientKey);
    if (!rec) {
      rec = {
        patientKey: patientKey,
        primeiroNome: "",
        nomeCompleto: "",
        prontuario: fields.prontuario || "",
        examsByKey: {},
      };
    }

    var dob = fields.dataNascimentoISO || fields.dataNascimento || null;

    if (
      fields.sexo &&
      (fields.sexo === "M" || fields.sexo === "F") &&
      rec.sexoSource !== "manual"
    ) {
      rec.sexo = fields.sexo;
      rec.sexoSource = "aghu";
    }
    if (
      dob &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(dob)) &&
      rec.dataNascimentoSource !== "manual"
    ) {
      rec.dataNascimento = String(dob);
      rec.dataNascimentoSource = "aghu";
    }
    if (
      fields.nomeCompleto &&
      String(fields.nomeCompleto).trim() &&
      rec.nomeCompletoSource !== "manual"
    ) {
      rec.nomeCompleto = String(fields.nomeCompleto).trim();
      rec.primeiroNome = primeiroNomeFromFull(rec.nomeCompleto);
      rec.nomeCompletoSource = "aghu";
    }
    if (fields.prontuario && String(fields.prontuario).trim()) {
      rec.prontuario = String(fields.prontuario).trim();
    }
    if (fields.nomeMae != null && String(fields.nomeMae).trim()) {
      rec.nomeMae = String(fields.nomeMae).trim();
    }
    if (fields.cartaoSus != null && String(fields.cartaoSus).trim()) {
      rec.cartaoSus = String(fields.cartaoSus).trim();
    }
    if (fields.patientAddress && typeof fields.patientAddress === "object") {
      rec.patientAddress = fields.patientAddress;
    }
    if (fields.local && typeof fields.local === "object") {
      rec.demographicsLocal = Object.assign(
        {},
        rec.demographicsLocal || {},
        fields.local,
      );
    }
    if (fields.patientEpisodes && typeof fields.patientEpisodes === "object") {
      rec.patientEpisodes = fields.patientEpisodes;
    }
    await savePatientRecord(rec);
    // ALTAEXT-AC-13: Cadastro one-click (sem exames) deve alimentar o select.
    await upsertIndexEntry({
      patientKey: rec.patientKey,
      primeiroNome:
        rec.primeiroNome || primeiroNomeFromFull(rec.nomeCompleto) || "",
      nomeCompleto: rec.nomeCompleto || "",
      prontuario: rec.prontuario || "",
    });
  }

  window.AghuPatientArchive = {
    INDEX_KEY: INDEX_KEY,
    LAST_KEY: LAST_KEY,
    normalizeProntuario: normalizeProntuario,
    primeiroNomeFromFull: primeiroNomeFromFull,
    buildPatientKey: buildPatientKey,
    examMergeKey: examMergeKey,
    slimExam: slimExam,
    mergeExamRows: mergeExamRows,
    overwriteExamRows: overwriteExamRows,
    mergeExamsIntoRecord: mergeExamsIntoRecord,
    mergeDemographicsIntoRecord: mergeDemographicsIntoRecord,
    ensureMinimalPatientRecord: ensureMinimalPatientRecord,
    upsertSingleExam: upsertSingleExam,
    replaceExamsByKey: replaceExamsByKey,
    loadPatientRecord: loadPatientRecord,
    examsRecordToArray: examsRecordToArray,
    listPatientsForSelect: listPatientsForSelect,
    pruneStalePatients: pruneStalePatients,
    slugPart: slugPart,
  };
})();
