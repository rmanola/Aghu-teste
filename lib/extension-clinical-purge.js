/**
 * Purge de dados clínicos locais (browser.storage.local) na fronteira de auth.
 * Ao sair ou trocar de user.id, remove caches de extração da extensão.
 */
(function (root) {
  "use strict";

  var OWNER_KEY = "aghu_last_auth_user_id";

  var PRESERVED_EXACT_KEYS = {
    aghu_supabase_session: true,
    aghu_theme: true,
    aghu_extension_settings_v1: true,
    aghu_controles_pa_format: true,
    aghu_billing_status_cache_v1: true,
    aghu_billing_extractions_daily_v1: true,
    aghu_patient_migrate_v3_done: true,
  };

  var CLINICAL_EXACT_KEYS = {
    aghu_patient_index_v1: true,
    aghu_last_patient_key: true,
    aghu_controles_index_v1: true,
    aghu_last_controles_patient_key: true,
    aghu_prescricao_index_v1: true,
    aghu_last_prescricao_patient_key: true,
    aghu_passometro_index_v1: true,
    aghu_last_passometro_patient_key: true,
    aghu_last_receita_patient_key: true,
    aghu_last_session: true,
    aghu_sync_meta_v1: true,
    aghu_source_tab_id: true,
    aghu_pdf_capture_id: true,
    aghu_pdf_result: true,
  };

  var CLINICAL_PREFIXES = [
    "aghu_patient_v1_",
    "aghu_controles_v1_",
    "aghu_prescricao_v1_",
    "aghu_passometro_v1_",
    "aghu_analise_v1_",
    "aghu_receita_v1_",
    "aghu_exams_",
  ];

  function defaultStorage() {
    return root.browser && root.browser.storage && root.browser.storage.local
      ? root.browser.storage.local
      : null;
  }

  function isClinicalKey(key) {
    if (!key || typeof key !== "string") return false;
    if (PRESERVED_EXACT_KEYS[key]) return false;
    if (key === OWNER_KEY) return false;
    if (CLINICAL_EXACT_KEYS[key]) return true;
    for (var i = 0; i < CLINICAL_PREFIXES.length; i++) {
      if (key.indexOf(CLINICAL_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function filterClinicalKeys(allKeys) {
    var out = [];
    if (!allKeys || !allKeys.length) return out;
    for (var i = 0; i < allKeys.length; i++) {
      if (isClinicalKey(allKeys[i])) out.push(allKeys[i]);
    }
    return out;
  }

  async function listClinicalKeys(storage) {
    var st = storage || defaultStorage();
    if (!st) return [];
    var all = await st.get(null);
    return filterClinicalKeys(Object.keys(all || {}));
  }

  async function purgeClinicalStorage(storage) {
    var st = storage || defaultStorage();
    if (!st) return { removedCount: 0, keys: [] };
    var keys = await listClinicalKeys(st);
    if (keys.length) {
      await st.remove(keys);
      console.log("[AGHU clinical-purge] removed", keys.length, "key(s)");
    }
    return { removedCount: keys.length, keys: keys };
  }

  /**
   * @param {string | null | undefined} userId
   * @param {object} [storage]
   * @returns {Promise<{ purged: boolean, removedCount: number }>}
   */
  async function assertStorageOwner(userId, storage) {
    var st = storage || defaultStorage();
    if (!st) return { purged: false, removedCount: 0 };

    var nextId = userId ? String(userId) : null;
    var got = await st.get(OWNER_KEY);
    var prevId = got[OWNER_KEY] ? String(got[OWNER_KEY]) : null;

    async function purgeBillingSwitchCache() {
      await st.remove([
        "aghu_billing_status_cache_v1",
      ]);
    }

    if (!nextId) {
      var purgeOut = await purgeClinicalStorage(st);
      await purgeBillingSwitchCache();
      await st.remove(OWNER_KEY);
      return {
        purged: purgeOut.removedCount > 0 || !!prevId,
        removedCount: purgeOut.removedCount,
      };
    }

    if (prevId === nextId) {
      return { purged: false, removedCount: 0 };
    }

    var purgeSwitch = await purgeClinicalStorage(st);
    await purgeBillingSwitchCache();
    var ownerPayload = {};
    ownerPayload[OWNER_KEY] = nextId;
    await st.set(ownerPayload);
    return {
      purged: true,
      removedCount: purgeSwitch.removedCount,
    };
  }

  var api = {
    OWNER_KEY: OWNER_KEY,
    isClinicalKey: isClinicalKey,
    filterClinicalKeys: filterClinicalKeys,
    listClinicalKeys: listClinicalKeys,
    purgeClinicalStorage: purgeClinicalStorage,
    assertStorageOwner: assertStorageOwner,
  };

  root.AghuExtensionClinicalPurge = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
