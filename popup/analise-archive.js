/**
 * Arquivo local de análise clínica por paciente (extensão).
 */
(function () {
  "use strict";

  var PREFIX = "aghu_analise_v1_";
  /** Rascunho sem paciente activo (persiste na sessão do popup). */
  var NO_PATIENT_ARCHIVE_KEY = "_no_patient";

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  /**
   * @param {string} patientKey
   * @returns {Promise<object | null>}
   */
  async function loadAnaliseSnapshot(patientKey) {
    if (!patientKey) return null;
    var got = await browser.storage.local.get(recordKey(patientKey));
    return got[recordKey(patientKey)] || null;
  }

  /**
   * @param {string} patientKey
   * @param {object} snap
   */
  async function saveAnaliseSnapshot(patientKey, snap) {
    if (!patientKey || !snap) return;
    var obj = {};
    obj[recordKey(patientKey)] = snap;
    await browser.storage.local.set(obj);
  }

  window.AghuAnaliseArchive = {
    NO_PATIENT_ARCHIVE_KEY: NO_PATIENT_ARCHIVE_KEY,
    loadAnaliseSnapshot: loadAnaliseSnapshot,
    saveAnaliseSnapshot: saveAnaliseSnapshot,
  };
})();
