/**
 * Cache browser.storage.local para lista de exames (popup).
 */
(function (root) {
  "use strict";

  function buildCacheKey(patientKey, dateFrom, dateTo) {
    var pk = patientKey || "_nopatient";
    return "aghu_exams_" + pk + "_" + (dateFrom || "all") + "_" + (dateTo || "all");
  }

  function cachePatientMatches(cache, patientKey) {
    if (!patientKey) return true;
    if (!cache.__patientKey) {
      console.warn(
        "[AGHU] cache legado sem __patientKey — ignorando restore para evitar cruzamento",
      );
      return false;
    }
    return cache.__patientKey === patientKey;
  }

  async function saveExamListToCache(
    cacheKey,
    exams,
    dateFrom,
    dateTo,
    patientMeta,
  ) {
    try {
      var stored = await browser.storage.local.get(cacheKey);
      var current = stored[cacheKey] || {};
      for (var key of Object.keys(current)) {
        if (/^\d+$/.test(key)) delete current[key];
      }
      current.__examList = exams.map(function (e) {
        return {
          rowIndex: e.rowIndex,
          date: e.date,
          solicitation: e.solicitation,
          examName: e.examName,
          sample: e.sample,
          lab: e.lab,
          result: e.result,
          hasAttachment: e.hasAttachment,
          hasDetail: e.hasDetail,
          hasCheckbox: e.hasCheckbox,
          checkboxId: e.checkboxId || null,
          dataColetaISO: e.dataColetaISO != null ? e.dataColetaISO : null,
          dataColetaLabel: e.dataColetaLabel != null ? e.dataColetaLabel : null,
          aiOrganized: e.aiOrganized || "",
        };
      });
      current.__savedAt = Date.now();
      current.__dateFrom = dateFrom || null;
      current.__dateTo = dateTo || null;
      if (patientMeta && patientMeta.ok && patientMeta.patientKey) {
        current.__patientKey = patientMeta.patientKey;
        current.__patientPrimeiro = patientMeta.primeiroNome || "";
        current.__patientProntuario = patientMeta.prontuario || "";
      } else {
        delete current.__patientKey;
        delete current.__patientPrimeiro;
        delete current.__patientProntuario;
      }
      await browser.storage.local.set({
        [cacheKey]: current,
        aghu_last_session: cacheKey,
      });
    } catch (e) {
      console.warn("saveExamListToCache failed", e);
    }
  }

  async function pruneOldCache() {
    try {
      var all = await browser.storage.local.get(null);
      var cutoff = Date.now() - 24 * 60 * 60 * 1000;
      var toRemove = Object.keys(all).filter(function (k) {
        return (
          k.startsWith("aghu_exams_") &&
          all[k] &&
          all[k].__savedAt &&
          all[k].__savedAt < cutoff
        );
      });
      if (toRemove.length) {
        await browser.storage.local.remove(toRemove);
        var ptr = await browser.storage.local.get("aghu_last_session");
        if (toRemove.includes(ptr.aghu_last_session)) {
          await browser.storage.local.remove("aghu_last_session");
        }
      }
    } catch (e) {
      console.warn("pruneOldCache failed", e);
    }
  }

  /**
   * @param {object} deps — upgradeAllGasometryExams, upgradeAllPdfCachedExams, persistUpgradedFetchExams
   */
  async function restoreResultsFromCache(exams, cacheKey, patientKey, deps) {
    try {
      var stored = await browser.storage.local.get(cacheKey);
      var cache = stored[cacheKey];
      if (!cache) return 0;
      if (!cachePatientMatches(cache, patientKey || null)) return 0;
      var count = 0;
      var withCache = exams.filter(function (e) {
        var hit = cache[e.rowIndex];
        if (
          hit &&
          (hit.fetchedResult ||
            hit.detailText ||
            hit.fetchHint ||
            hit.aiOrganized)
        ) {
          e.fetchedResult = hit.fetchedResult || "";
          e.detailText = hit.detailText || "";
          e.hadPdf = hit.hadPdf || false;
          e.fetchHint = hit.fetchHint || "";
          e.fetchReason = hit.fetchReason || "";
          e.aiOrganized = hit.aiOrganized || "";
          count++;
          return true;
        }
        return false;
      });
      if (deps && deps.upgradeAllGasometryExams) {
        var upgraded = deps.upgradeAllGasometryExams(withCache);
        if (deps.upgradeAllPdfCachedExams) {
          upgraded.push.apply(
            upgraded,
            deps.upgradeAllPdfCachedExams(withCache),
          );
        }
        if (deps.persistUpgradedFetchExams) {
          await deps.persistUpgradedFetchExams(upgraded, cacheKey);
        }
      }
      return count;
    } catch (e) {
      return 0;
    }
  }

  root.AghuPopupExamsCache = {
    buildCacheKey: buildCacheKey,
    cachePatientMatches: cachePatientMatches,
    saveExamListToCache: saveExamListToCache,
    restoreResultsFromCache: restoreResultsFromCache,
    pruneOldCache: pruneOldCache,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
