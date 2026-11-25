/**
 * Arquivo local do kit de alta (AltaSnapV2) por paciente (patientKey).
 *
 * Chave de storage própria (aghu_alta_v2_*) — deliberadamente distinta de
 * `aghu_receita_v1_*` (receita-archive.js). O host RX embutido
 * (lib/receita-popup-host.js) já persiste a sua própria vista
 * ReceitaSnapV1-shape via AghuReceitaArchive.saveReceitaSnapshot, que corre
 * `AghuReceitaSchema.normalizeSnap` (schema estreito v1) — se o kit completo
 * fosse gravado na MESMA chave, o próximo autosave do host RX reescreveria o
 * registo perdendo orientacoes/laudo/atestado/acompanhante/laudoPersonalizado/
 * retorno/previewHtml. Por isso o AltaSnapV2 completo vive aqui; o Receituário
 * continua a fonte de verdade em AghuReceitaArchive (compat retro).
 */
(function () {
  "use strict";

  var PREFIX = "aghu_alta_v2_";
  var LAST_KEY = "aghu_last_alta_patient_key";

  function schemaApi() {
    return window.AghuAltaSchema;
  }

  function recordKey(patientKey) {
    return PREFIX + patientKey;
  }

  /**
   * @param {string} patientKey
   * @param {{ passometro?: object, patientEpisodes?: object }} [opts]
   * @returns {Promise<object|null>} AltaSnapV2 normalizado ou null se não houver registo
   */
  async function loadAltaSnapshot(patientKey, opts) {
    if (!patientKey) return null;
    var got = await browser.storage.local.get(recordKey(patientKey));
    var rec = got[recordKey(patientKey)];
    if (!rec || !rec.snap) return null;
    return schemaApi() ? schemaApi().normalizeSnap(rec.snap, opts || {}) : rec.snap;
  }

  /** @returns {Promise<string>} fingerprint do seed de passômetro aplicado na última gravação */
  async function loadSeedFingerprint(patientKey) {
    if (!patientKey) return "";
    var got = await browser.storage.local.get(recordKey(patientKey));
    var rec = got[recordKey(patientKey)];
    return (rec && rec.seedFingerprint) || "";
  }

  /**
   * Meta do paciente persistida fora do snap (nome avulso, prontuário).
   * @param {string} patientKey
   * @returns {Promise<{
   *   patientKey: string,
   *   nomeCompleto: string,
   *   primeiroNome: string,
   *   prontuario: string
   * }|null>}
   */
  async function loadAltaRecordMeta(patientKey) {
    if (!patientKey) return null;
    var got = await browser.storage.local.get(recordKey(patientKey));
    var rec = got[recordKey(patientKey)];
    if (!rec) return null;
    return {
      patientKey: rec.patientKey || patientKey,
      nomeCompleto: rec.nomeCompleto || "",
      primeiroNome: rec.primeiroNome || "",
      prontuario: rec.prontuario || "",
    };
  }

  /**
   * @param {object} meta patientKey, primeiroNome, nomeCompleto?, prontuario, patientAddress?
   * @param {object} snap AltaSnapV2
   * @param {{ seedFingerprint?: string }} [opts]
   */
  async function saveAltaSnapshot(meta, snap, opts) {
    if (!meta || !meta.patientKey || !snap) return;
    opts = opts || {};
    var norm = schemaApi() ? schemaApi().normalizeSnap(snap) : snap;
    norm.atualizadoEm = Date.now();
    var existing = await loadSeedFingerprint(meta.patientKey);
    var payload = {};
    payload[recordKey(meta.patientKey)] = {
      version: 2,
      patientKey: meta.patientKey,
      primeiroNome: meta.primeiroNome || "",
      nomeCompleto: meta.nomeCompleto || "",
      prontuario: meta.prontuario || "",
      snap: norm,
      seedFingerprint:
        typeof opts.seedFingerprint === "string" ? opts.seedFingerprint : existing,
      atualizadoEm: norm.atualizadoEm,
    };
    payload[LAST_KEY] = meta.patientKey;
    await browser.storage.local.set(payload);
  }

  window.AghuAltaArchive = {
    PREFIX: PREFIX,
    LAST_KEY: LAST_KEY,
    loadAltaSnapshot: loadAltaSnapshot,
    loadSeedFingerprint: loadSeedFingerprint,
    loadAltaRecordMeta: loadAltaRecordMeta,
    saveAltaSnapshot: saveAltaSnapshot,
  };
})();
