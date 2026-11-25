/**
 * Resolução de prontuário e record_client_id para sync na nuvem.
 * record_client_id = UUID v5 determinístico do prontuário — sem fallback aleatório.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuSyncPatientIdentity = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @param {string} patientKey
   * @param {{
   *   identity: object,
   *   loadPatientRecord?: (key: string) => Promise<object|null>,
   *   loadControlesSnapshot?: (key: string) => Promise<object|null>,
   *   loadPrescricaoSnapshot?: (key: string) => Promise<object|null>,
   *   loadPassometroSnapshot?: (key: string) => Promise<object|null>,
   * }} deps
   * @returns {Promise<string|null>}
   */
  async function resolveProntuarioForPatientKey(patientKey, deps) {
    var id = deps && deps.identity;
    if (!patientKey) return null;

    var sources = [];
    if (deps.loadPatientRecord) sources.push(deps.loadPatientRecord(patientKey));
    if (deps.loadControlesSnapshot) sources.push(deps.loadControlesSnapshot(patientKey));
    if (deps.loadPrescricaoSnapshot) sources.push(deps.loadPrescricaoSnapshot(patientKey));
    if (deps.loadPassometroSnapshot) sources.push(deps.loadPassometroSnapshot(patientKey));

    var recs = await Promise.all(sources);
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r && r.prontuario && id && id.isValidProntuarioForIdentity(r.prontuario)) {
        return id.normalizeProntuario(r.prontuario);
      }
    }

    if (id && id.isValidProntuarioForIdentity(patientKey)) {
      return id.normalizeProntuario(patientKey);
    }
    return null;
  }

  /**
   * @param {string} patientKey
   * @param {{
   *   identity: object,
   *   loadSyncMetaMap: () => Promise<object>,
   *   saveSyncMetaMap: (map: object) => Promise<void>,
   *   recordClientIdFromProntuario: (prontuario: string) => Promise<string|null>,
   *   resolveProntuario?: typeof resolveProntuarioForPatientKey,
   *   loadPatientRecord?: (key: string) => Promise<object|null>,
   *   loadControlesSnapshot?: (key: string) => Promise<object|null>,
   *   loadPrescricaoSnapshot?: (key: string) => Promise<object|null>,
   *   loadPassometroSnapshot?: (key: string) => Promise<object|null>,
   * }} deps
   * @returns {Promise<string|null>}
   */
  async function ensureRecordClientId(patientKey, deps) {
    if (!patientKey) return null;
    var id = deps.identity;
    var resolveFn = deps.resolveProntuario || resolveProntuarioForPatientKey;
    var prontuario = await resolveFn(patientKey, deps);

    if (id && prontuario && id.isValidProntuarioForIdentity(prontuario)) {
      var recordClientId = await deps.recordClientIdFromProntuario(prontuario);
      if (recordClientId) {
        var map = await deps.loadSyncMetaMap();
        map[patientKey] = Object.assign({}, map[patientKey] || {}, {
          patientKey: id.buildPatientKey(prontuario) || patientKey,
          prontuario: prontuario,
          recordClientId: recordClientId,
        });
        var canon = id.buildPatientKey(prontuario);
        if (canon) map[canon] = map[patientKey];
        await deps.saveSyncMetaMap(map);
        return recordClientId;
      }
    }

    var mapLegacy = await deps.loadSyncMetaMap();
    var entry = mapLegacy[patientKey];
    if (
      entry &&
      entry.prontuario &&
      id &&
      id.isValidProntuarioForIdentity(entry.prontuario) &&
      entry.recordClientId
    ) {
      var expectedId = await deps.recordClientIdFromProntuario(
        id.normalizeProntuario(entry.prontuario),
      );
      if (expectedId && expectedId === entry.recordClientId) {
        return entry.recordClientId;
      }
    }

    return null;
  }

  return {
    resolveProntuarioForPatientKey: resolveProntuarioForPatientKey,
    ensureRecordClientId: ensureRecordClientId,
  };
});
