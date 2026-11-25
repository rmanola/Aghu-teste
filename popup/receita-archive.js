/**
 * Arquivo local de receituário por paciente (patientKey).
 */
(function () {
  "use strict";

  var PREFIX = "aghu_receita_v1_";
  var LAST_KEY = "aghu_last_receita_patient_key";

  function schemaApi() {
    return window.AghuReceitaSchema;
  }

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  async function loadReceitaSnapshot(patientKey) {
    if (!patientKey) return null;
    var got = await browser.storage.local.get(recordKey(patientKey));
    var rec = got[recordKey(patientKey)];
    if (!rec || !rec.snap) return null;
    return schemaApi() ? schemaApi().normalizeSnap(rec.snap) : rec.snap;
  }

  async function loadReceitaPatientAddress(patientKey) {
    if (!patientKey) return null;
    var got = await browser.storage.local.get(recordKey(patientKey));
    var rec = got[recordKey(patientKey)];
    if (!rec || !rec.patientAddress) return null;
    return schemaApi()
      ? schemaApi().normalizePatientAddress(rec.patientAddress)
      : rec.patientAddress;
  }

  async function saveReceitaSnapshot(meta, snap) {
    if (!meta || !meta.patientKey || !snap) return;
    var norm = schemaApi() ? schemaApi().normalizeSnap(snap) : snap;
    norm.atualizadoEm = Date.now();
    var addr = meta.patientAddress;
    if (addr && schemaApi()) {
      addr = schemaApi().normalizePatientAddress(addr);
    }
    var payload = {};
    payload[recordKey(meta.patientKey)] = {
      version: 1,
      patientKey: meta.patientKey,
      primeiroNome: meta.primeiroNome || "",
      nomeCompleto: meta.nomeCompleto || "",
      prontuario: meta.prontuario || "",
      patientAddress: addr || null,
      snap: norm,
      atualizadoEm: norm.atualizadoEm,
    };
    payload[LAST_KEY] = meta.patientKey;
    await browser.storage.local.set(payload);
  }

  window.AghuReceitaArchive = {
    loadReceitaSnapshot: loadReceitaSnapshot,
    loadReceitaPatientAddress: loadReceitaPatientAddress,
    saveReceitaSnapshot: saveReceitaSnapshot,
  };
})();
