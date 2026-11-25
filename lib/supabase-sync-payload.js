/**
 * Montagem do payload HTTP para encrypt-and-upsert (sem dependências de browser).
 * Testável em Node via module.exports.
 */
(function (factory) {
  "use strict";
  var root = typeof globalThis !== "undefined" ? globalThis : this;
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  // Sempre espelhar no global — o bundle Edge (Deno) tem `module` mas não
  // `require`, e consumidores UMD (interop-merge) leem via globalThis.
  root.AghuSupabaseSyncPayload = api;
})(function () {
  "use strict";

  var g =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : this;

  var ARCHIVE_SCHEMA_VERSION = 8;
  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  var controlesVitalsApi = null;
  var bridgeApi = null;
  var hpbSchemaApi = null;

  function tryRequireModule(target, relPath) {
    if (target) return target;
    if (typeof require !== "function") return target;
    try {
      // require() só com string literal — addons-linter UNEXPECTED_GLOBAL_ARG
      switch (relPath) {
        case "./controles-entry-vitals.js":
          return require("./controles-entry-vitals.js");
        case "./hpb-passometro-bridge.js":
          return require("./hpb-passometro-bridge.js");
        case "./hpb-registry-schema.js":
          return require("./hpb-registry-schema.js");
        case "./passometro-episodes-bridge.js":
          return require("./passometro-episodes-bridge.js");
        case "./patient-episodes-downstream-sync.js":
          return require("./patient-episodes-downstream-sync.js");
        case "./patient-episodes-schema.js":
          return require("./patient-episodes-schema.js");
        case "./passometro-collection.js":
          return require("./passometro-collection.js");
        case "./prescricoes-normalize.js":
          return require("./prescricoes-normalize.js");
        default:
          return target;
      }
    } catch (_e) {
      return target;
    }
  }

  controlesVitalsApi = tryRequireModule(
    controlesVitalsApi,
    "./controles-entry-vitals.js",
  );
  bridgeApi = tryRequireModule(bridgeApi, "./hpb-passometro-bridge.js");
  hpbSchemaApi = tryRequireModule(hpbSchemaApi, "./hpb-registry-schema.js");
  var episodesBridgeApi = null;
  episodesBridgeApi = tryRequireModule(
    episodesBridgeApi,
    "./passometro-episodes-bridge.js",
  );
  var downstreamSyncApi = null;
  downstreamSyncApi = tryRequireModule(
    downstreamSyncApi,
    "./patient-episodes-downstream-sync.js",
  );
  var patientEpisodesSchemaApi = null;
  patientEpisodesSchemaApi = tryRequireModule(
    patientEpisodesSchemaApi,
    "./patient-episodes-schema.js",
  );
  var collectionApi = null;
  collectionApi = tryRequireModule(collectionApi, "./passometro-collection.js");

  function getPatientEpisodesSchemaApi() {
    if (patientEpisodesSchemaApi) return patientEpisodesSchemaApi;
    if (g.AghuPatientEpisodesSchema) {
      patientEpisodesSchemaApi = g.AghuPatientEpisodesSchema;
      return patientEpisodesSchemaApi;
    }
    patientEpisodesSchemaApi = tryRequireModule(
      patientEpisodesSchemaApi,
      "./patient-episodes-schema.js",
    );
    return patientEpisodesSchemaApi;
  }

  /**
   * Normaliza snapshot patient_episodes preservando diagnoses/complications/death.
   * @param {object|null|undefined} snap
   * @returns {object|null}
   */
  function slimPatientEpisodes(snap) {
    if (!snap || typeof snap !== "object") return null;
    var api = getPatientEpisodesSchemaApi();
    if (api && api.normalizeSnapshot) {
      return api.normalizeSnapshot(snap);
    }
    return snap;
  }

  function getCollectionApi() {
    if (collectionApi) return collectionApi;
    if (g.AghuPassometroCollection) {
      collectionApi = g.AghuPassometroCollection;
      return collectionApi;
    }
    collectionApi = tryRequireModule(collectionApi, "./passometro-collection.js");
    return collectionApi;
  }

  var prescricoesNormApi = null;
  prescricoesNormApi = tryRequireModule(
    prescricoesNormApi,
    "./prescricoes-normalize.js",
  );

  function getPrescricoesNormApi() {
    if (prescricoesNormApi) return prescricoesNormApi;
    if (g.AghuPrescricoesNormalize) {
      prescricoesNormApi = g.AghuPrescricoesNormalize;
      return prescricoesNormApi;
    }
    prescricoesNormApi = tryRequireModule(
      prescricoesNormApi,
      "./prescricoes-normalize.js",
    );
    return prescricoesNormApi;
  }

  function getControlesVitalsApi() {
    if (controlesVitalsApi) return controlesVitalsApi;
    if (g.AghuControlesEntryVitals) {
      controlesVitalsApi = g.AghuControlesEntryVitals;
      return controlesVitalsApi;
    }
    controlesVitalsApi = tryRequireModule(
      controlesVitalsApi,
      "./controles-entry-vitals.js",
    );
    return controlesVitalsApi;
  }

  function isValidUuid(s) {
    return UUID_RE.test(String(s || ""));
  }

  function getReceitaSchemaApi() {
    if (typeof require !== "undefined") {
      try {
        return require("./receita-schema.js");
      } catch (_e) {}
    }
    return g.AghuReceitaSchema || null;
  }

  function resolvePatientAddressForPii(piiSource, receitaSnap) {
    var addr =
      piiSource && piiSource.patientAddress ? piiSource.patientAddress : null;
    if (addr && typeof addr === "object") return addr;
    if (!receitaSnap) return null;
    var schema = getReceitaSchemaApi();
    if (!schema) return null;
    var fromReceita = schema.resolveBestPatientAddressFromSnap(receitaSnap, null);
    if (schema.hasPatientAddressContent(fromReceita)) return fromReceita;
    return null;
  }

  function newEntryId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-000000000000";
  }

  function parseN(value) {
    return typeof value === "number" ? value : parseInt(value, 10) || 0;
  }

  function loadAgeFromDob() {
    if (g.AghuAgeFromDob) return g.AghuAgeFromDob;
    if (typeof require === "function") {
      try {
        return require("./age-from-dob.js");
      } catch (_e) {}
    }
    return null;
  }

  function passometroIdadeFromPii(pii) {
    if (!pii || typeof pii !== "object") return "";
    var ageMod = loadAgeFromDob();
    if (!ageMod || !ageMod.resolveAgeYears) return "";
    var years = ageMod.resolveAgeYears({ pii: pii });
    return years != null ? String(years) : "";
  }

  function slimPassometroWithPii(snap, piiSource) {
    var slim = slimPassometro(snap);
    if (!slim) return null;
    if (!String(slim.header.idade || "").trim()) {
      var idade = passometroIdadeFromPii(piiSource);
      if (idade) slim.header.idade = idade;
    }
    return slim;
  }

  function slimPassometroDomain(raw, patientEpisodesSnap, piiSource) {
    var collApi = getCollectionApi();
    if (!collApi) {
      return slimPassometroWithPii(raw, piiSource);
    }
    var norm = collApi.normalizePassometroDomain(raw, patientEpisodesSnap);
    var coll = norm.collection;
    var registros = [];
    for (var i = 0; i < coll.registros.length; i++) {
      var r = coll.registros[i];
      var slimSnap = slimPassometroWithPii(r.snap, piiSource);
      if (!slimSnap) continue;
      registros.push({
        patientEpisodeId: r.patientEpisodeId,
        snap: slimSnap,
        atualizadoEm: r.atualizadoEm || slimSnap.atualizadoEm || null,
      });
    }
    if (!registros.length) return null;
    return {
      version: collApi.VERSION,
      registros: registros,
      atualizadoEm: coll.atualizadoEm || Date.now(),
    };
  }

  function preparePassometroForPayload(passometroDomain, patientEpisodesSnap, piiSource) {
    var collApi = getCollectionApi();
    if (!collApi) {
      return {
        passometro: slimPassometroWithPii(passometroDomain, piiSource),
        patientEpisodes: patientEpisodesSnap,
        activeEpisodeId: null,
      };
    }
    var norm = collApi.normalizePassometroDomain(
      passometroDomain,
      patientEpisodesSnap,
    );
    var episodesSnap = norm.patientEpisodes || patientEpisodesSnap;
    var collection = norm.collection;
    var active = collApi.findActiveHospitalizationEpisode(episodesSnap);
    var activeEpisodeId = active ? active.id : null;
    var activeSnap = collApi.resolveActiveSnap(collection, episodesSnap);
    return {
      passometro: collection,
      patientEpisodes: episodesSnap,
      activeEpisodeId: activeEpisodeId,
      activeSnap: activeSnap,
      episodesChanged: norm.episodesChanged,
    };
  }

  function writeActiveSnapToCollection(collection, episodeId, snap) {
    var collApi = getCollectionApi();
    if (!collApi || !episodeId) return collection;
    return collApi.upsertRegistro(collection, episodeId, snap).collection;
  }

  function slimControlesEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var vitalsApi = getControlesVitalsApi();
    if (vitalsApi && vitalsApi.enrichControlesEntry) {
      var enriched = vitalsApi.enrichControlesEntry(raw);
      return {
        id:
          enriched.id && isValidUuid(enriched.id)
            ? enriched.id
            : raw.id && isValidUuid(raw.id)
              ? raw.id
              : newEntryId(),
        texto: enriched.texto,
        periodo: enriched.periodo,
        n: enriched.n,
        extractedAt: enriched.extractedAt,
        vitals: enriched.vitals || null,
      };
    }
    return {
      id: raw.id && isValidUuid(raw.id) ? raw.id : newEntryId(),
      texto: raw.texto || "",
      periodo: raw.periodo || "",
      n: parseN(raw.n),
      extractedAt:
        typeof raw.extractedAt === "number"
          ? raw.extractedAt
          : typeof raw.atualizadoEm === "number"
            ? raw.atualizadoEm
            : Date.now(),
      vitals: null,
    };
  }

  function normalizeControlesInput(snap) {
    if (!snap || typeof snap !== "object") {
      return { entries: [], atualizadoEm: null };
    }
    if (Array.isArray(snap.entries)) {
      var entries = [];
      for (var i = 0; i < snap.entries.length; i++) {
        var e = slimControlesEntry(snap.entries[i]);
        if (e) entries.push(e);
      }
      return {
        entries: entries,
        atualizadoEm: snap.atualizadoEm || null,
      };
    }
    if (snap.texto != null || snap.periodo != null || snap.n != null) {
      var legacy = slimControlesEntry({
        id: snap.id,
        texto: snap.texto || "",
        periodo: snap.periodo || "",
        n: snap.n,
        extractedAt: snap.extractedAt || snap.atualizadoEm || Date.now(),
      });
      return {
        entries: legacy ? [legacy] : [],
        atualizadoEm: snap.atualizadoEm || null,
      };
    }
    return { entries: [], atualizadoEm: snap.atualizadoEm || null };
  }

  /**
   * Funde entradas locais e cloud (local prevalece no mesmo periodo/id).
   * @param {object | null} localSnap
   * @param {object | null} cloudSnap
   * @returns {{ entries: object[], atualizadoEm: number | null }}
   */
  function mergeControlesEntries(localSnap, cloudSnap) {
    var local = normalizeControlesInput(localSnap);
    var cloud = normalizeControlesInput(cloudSnap);
    var merged = [];
    var indexByPeriodo = {};
    var indexById = {};

    function upsert(entry, preferOverwrite) {
      if (!entry) return;
      var pKey = entry.periodo ? "p:" + entry.periodo : null;
      var iKey = entry.id ? "i:" + entry.id : null;
      var idx =
        pKey && indexByPeriodo[pKey] != null
          ? indexByPeriodo[pKey]
          : iKey && indexById[iKey] != null
            ? indexById[iKey]
            : null;

      if (idx != null) {
        var existing = merged[idx];
        if (
          preferOverwrite ||
          (entry.extractedAt || 0) >= (existing.extractedAt || 0)
        ) {
          merged[idx] = entry;
        }
      } else {
        idx = merged.length;
        merged.push(entry);
      }

      if (entry.periodo) indexByPeriodo["p:" + entry.periodo] = idx;
      if (entry.id) indexById["i:" + entry.id] = idx;
    }

    for (var c = 0; c < cloud.entries.length; c++) {
      upsert(cloud.entries[c], false);
    }
    for (var l = 0; l < local.entries.length; l++) {
      upsert(local.entries[l], true);
    }

    var atualizadoEm = local.atualizadoEm || cloud.atualizadoEm || null;
    return { entries: merged, atualizadoEm: atualizadoEm };
  }

  function normalizeExamsArchive(snap) {
    if (!snap || typeof snap !== "object") {
      return { examsByKey: {}, atualizadoEm: null };
    }
    return {
      examsByKey:
        snap.examsByKey && typeof snap.examsByKey === "object"
          ? snap.examsByKey
          : {},
      atualizadoEm: snap.atualizadoEm != null ? snap.atualizadoEm : null,
    };
  }

  function pickLonger(a, b) {
    var sa = a == null ? "" : String(a);
    var sb = b == null ? "" : String(b);
    return sb.length > sa.length ? sb : sa;
  }

  function slimExamRow(exam) {
    if (!exam || typeof exam !== "object") return null;
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
      dataColetaISO: exam.dataColetaISO != null ? exam.dataColetaISO : null,
      dataColetaLabel: exam.dataColetaLabel != null ? exam.dataColetaLabel : null,
      fetchedResult: exam.fetchedResult || "",
      detailText: exam.detailText || "",
      hadPdf: !!exam.hadPdf,
      fetchHint: exam.fetchHint || "",
      fetchReason: exam.fetchReason || "",
      aiOrganized: exam.aiOrganized || "",
    };
    var manual =
      typeof g.AghuExamManualEdit !== "undefined" ? g.AghuExamManualEdit : null;
    if (manual && manual.slimManualEditMeta) {
      Object.assign(base, manual.slimManualEditMeta(exam));
    }
    var paperEntry =
      typeof g.AghuExamManualEntry !== "undefined" ? g.AghuExamManualEntry : null;
    if (paperEntry && paperEntry.slimManualEntryMeta) {
      Object.assign(base, paperEntry.slimManualEntryMeta(exam));
    }
    return base;
  }

  function mergeExamRows(prev, next) {
    var manual =
      typeof g.AghuExamManualEdit !== "undefined" ? g.AghuExamManualEdit : null;
    if (manual && manual.mergeExamRows) {
      return manual.mergeExamRows(prev, next, slimExamRow);
    }
    if (!prev) return slimExamRow(next);
    var a = slimExamRow(prev);
    var b = slimExamRow(next);
    var sampleKey =
      typeof g.AghuExamSampleKey !== "undefined" ? g.AghuExamSampleKey : null;
    if (
      sampleKey &&
      sampleKey.samplesMergeCompatible &&
      !sampleKey.samplesMergeCompatible(a, b)
    ) {
      return slimExamRow(sampleKey.pickExamRowOnSampleConflict(a, b));
    }
    var merged = Object.assign({}, a, b);
    merged.fetchedResult = pickLonger(a.fetchedResult, b.fetchedResult);
    merged.detailText = pickLonger(a.detailText, b.detailText);
    merged.aiOrganized = pickLonger(a.aiOrganized, b.aiOrganized);
    merged.result = pickLonger(a.result, b.result);
    merged.fetchHint = b.fetchHint || a.fetchHint;
    merged.fetchReason = b.fetchReason || a.fetchReason;
    merged.hasAttachment = !!(a.hasAttachment || b.hasAttachment);
    merged.hasDetail = !!(a.hasDetail || b.hasDetail);
    merged.hasCheckbox = !!(a.hasCheckbox || b.hasCheckbox);
    return merged;
  }

  /**
   * Funde exames locais e cloud (local prevalece na mesma chave).
   * @param {object | null} localSnap
   * @param {object | null} cloudSnap
   * @returns {{ examsByKey: object, atualizadoEm: number | null }}
   */
  function mergeExamsArchives(localSnap, cloudSnap) {
    var local = normalizeExamsArchive(localSnap);
    var cloud = normalizeExamsArchive(cloudSnap);
    var mergedByKey = {};
    var keys = Object.keys(cloud.examsByKey);
    for (var c = 0; c < keys.length; c++) {
      var ck = keys[c];
      mergedByKey[ck] = slimExamRow(cloud.examsByKey[ck]);
    }
    keys = Object.keys(local.examsByKey);
    for (var l = 0; l < keys.length; l++) {
      var lk = keys[l];
      mergedByKey[lk] = mergeExamRows(mergedByKey[lk], local.examsByKey[lk]);
    }
    var atualizadoEm =
      Math.max(local.atualizadoEm || 0, cloud.atualizadoEm || 0) || null;
    return { examsByKey: mergedByKey, atualizadoEm: atualizadoEm };
  }

  function slimControles(snap) {
    if (!snap || typeof snap !== "object") return null;
    var normalized = normalizeControlesInput(snap);
    if (!normalized.entries.length) return null;
    return {
      entries: normalized.entries,
      atualizadoEm: normalized.atualizadoEm,
    };
  }

  function slimPrescricaoEntry(raw) {
    var norm = getPrescricoesNormApi();
    if (norm && norm.normalizePrescricaoEntry) {
      return norm.normalizePrescricaoEntry(raw);
    }
    if (!raw || typeof raw !== "object") return null;
    return {
      id: raw.id || newEntryId(),
      validadeInicial: raw.validadeInicial || "",
      validadeFinal: raw.validadeFinal || "",
      data: raw.data || "",
      dieta: raw.dieta || "",
      hidratacao: Array.isArray(raw.hidratacao) ? raw.hidratacao.slice() : [],
      analgesia: Array.isArray(raw.analgesia) ? raw.analgesia.slice() : [],
      antibiotico: Array.isArray(raw.antibiotico) ? raw.antibiotico.slice() : [],
      categoriasMedicamento:
        raw.categoriasMedicamento &&
        typeof raw.categoriasMedicamento === "object" &&
        !Array.isArray(raw.categoriasMedicamento)
          ? raw.categoriasMedicamento
          : {},
      texto: raw.texto || "",
      extractedAt: raw.extractedAt || raw.atualizadoEm || Date.now(),
    };
  }

  function normalizePrescricoesInput(snap) {
    var norm = getPrescricoesNormApi();
    if (norm && norm.normalizePrescricoesInput) {
      return norm.normalizePrescricoesInput(snap);
    }
    if (!snap || typeof snap !== "object") {
      return { entries: [], atualizadoEm: null };
    }
    return { entries: [], atualizadoEm: snap.atualizadoEm || null };
  }

  /**
   * Funde prescrições locais e cloud (local prevalece na mesma validade).
   * @param {object | null} localSnap
   * @param {object | null} cloudSnap
   * @returns {{ entries: object[], atualizadoEm: number | null }}
   */
  function mergePrescricoesEntries(localSnap, cloudSnap) {
    var norm = getPrescricoesNormApi();
    var buildKey =
      norm && norm.buildValidadeKey
        ? norm.buildValidadeKey
        : function (e) {
            return "d:" + String((e && e.data) || "");
          };
    var local = normalizePrescricoesInput(localSnap);
    var cloud = normalizePrescricoesInput(cloudSnap);
    var merged = [];
    var indexByValidade = {};
    var indexById = {};

    function upsert(entry, preferOverwrite) {
      if (!entry) return;
      var vKey = buildKey(entry);
      var iKey = entry.id ? "i:" + entry.id : null;
      var idx =
        vKey && indexByValidade[vKey] != null
          ? indexByValidade[vKey]
          : iKey && indexById[iKey] != null
            ? indexById[iKey]
            : null;

      if (idx != null) {
        var existing = merged[idx];
        if (
          preferOverwrite ||
          (entry.extractedAt || 0) >= (existing.extractedAt || 0)
        ) {
          merged[idx] = entry;
        }
      } else {
        idx = merged.length;
        merged.push(entry);
      }

      if (vKey) indexByValidade[vKey] = idx;
      if (entry.id) indexById["i:" + entry.id] = idx;
    }

    for (var c = 0; c < cloud.entries.length; c++) {
      upsert(cloud.entries[c], false);
    }
    for (var l = 0; l < local.entries.length; l++) {
      upsert(local.entries[l], true);
    }

    var atualizadoEm = local.atualizadoEm || cloud.atualizadoEm || null;
    return { entries: merged, atualizadoEm: atualizadoEm };
  }

  function slimPrescricoes(snap) {
    if (!snap || typeof snap !== "object") return null;
    var normalized = normalizePrescricoesInput(snap);
    if (!normalized.entries.length) return null;
    var entries = [];
    for (var i = 0; i < normalized.entries.length; i++) {
      var e = slimPrescricaoEntry(normalized.entries[i]);
      if (e) entries.push(e);
    }
    if (!entries.length) return null;
    return {
      entries: entries,
      atualizadoEm: normalized.atualizadoEm,
    };
  }

  function slimCustomBag(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf("custom_") !== 0) continue;
      out[k] = raw[k] != null ? String(raw[k]) : "";
    }
    return out;
  }

  function passometroCustomBagHasContent(custom) {
    if (!custom || typeof custom !== "object") return false;
    var keys = Object.keys(custom);
    for (var i = 0; i < keys.length; i++) {
      if (String(custom[keys[i]] || "").trim()) return true;
    }
    return false;
  }

  function passometroEntryHasClinicalContent(entry) {
    if (!entry || typeof entry !== "object") return false;
    var keys = Object.keys(entry);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === "id" || key === "data" || key === "vitalsTouched") continue;
      if (key === "custom") {
        if (passometroCustomBagHasContent(entry.custom)) return true;
        continue;
      }
      if (String(entry[key] || "").trim()) return true;
    }
    return false;
  }

  function passometroSlimHasContent(out) {
    if (!out || typeof out !== "object") return false;
    if (out.layout && typeof out.layout === "object") return true;
    if (out.atualizadoEm) return true;
    var h = out.header || {};
    var headerKeys = Object.keys(h);
    for (var hi = 0; hi < headerKeys.length; hi++) {
      var hk = headerKeys[hi];
      if (hk === "custom") {
        if (passometroCustomBagHasContent(h.custom)) return true;
        continue;
      }
      if (hk === "cirurgias") {
        var cirurgias = Array.isArray(h.cirurgias) ? h.cirurgias : [];
        for (var ci = 0; ci < cirurgias.length; ci++) {
          var c = cirurgias[ci];
          if (
            c &&
            (String(c.data || "").trim() ||
              String(c.nome || "").trim() ||
              String(c.descricao || "").trim() ||
              String(c.equipe || "").trim() ||
              String(c.achadosOperatorios || "").trim())
          ) {
            return true;
          }
        }
        continue;
      }
      if (hk === "diagnosticos") {
        var diagnosticos = Array.isArray(h.diagnosticos) ? h.diagnosticos : [];
        for (var di = 0; di < diagnosticos.length; di++) {
          var dx = diagnosticos[di];
          if (dx && String(dx.texto || "").trim()) return true;
        }
        continue;
      }
      if (String(h[hk] || "").trim()) return true;
    }
    var entries = Array.isArray(out.entries) ? out.entries : [];
    for (var ei = 0; ei < entries.length; ei++) {
      if (passometroEntryHasClinicalContent(entries[ei])) return true;
    }
    return false;
  }

  function slimAnalise(snap) {
    if (!snap || typeof snap !== "object") return null;
    var text = snap.text != null ? String(snap.text) : "";
    var pront =
      snap.prontuarioText != null ? String(snap.prontuarioText) : "";
    if (!text.trim() && !pront.trim()) return null;
    return {
      prontuarioText: pront,
      prontuarioUpdatedAt: snap.prontuarioUpdatedAt || null,
      text: text,
      generatedAt: snap.generatedAt || null,
      model: snap.model || null,
      provider: snap.provider || null,
      sourceFingerprint: snap.sourceFingerprint || "",
      editedByUser: !!snap.editedByUser,
      prontuarioEditedByUser: !!snap.prontuarioEditedByUser,
      evaluation: snap.evaluation || null,
      revision: snap.revision || null,
    };
  }

  function slimPassometro(snap) {
    if (!snap || typeof snap !== "object") return null;
    var header = snap.header && typeof snap.header === "object" ? snap.header : {};
    var entries = Array.isArray(snap.entries) ? snap.entries : [];
    var headerCustom = slimCustomBag(header.custom);
    var cirurgias = Array.isArray(header.cirurgias)
      ? header.cirurgias
          .filter(function (c) {
            return c && String(c.data || "").trim();
          })
          .map(function (c) {
            var row = {
              id: c.id || "",
              data: c.data || "",
              nome: c.nome || "",
              descricao: c.descricao || "",
              // FEAT-062 / CIR-EXT-08: campos do PDF de Descrição Cirúrgica
              equipe: c.equipe || "",
              achadosOperatorios: c.achadosOperatorios || "",
            };
            if (c.hpbSurgeryId) row.hpbSurgeryId = c.hpbSurgeryId;
            if (Array.isArray(c.poNotas) && c.poNotas.length) {
              row.poNotas = c.poNotas.map(function (n) {
                return {
                  data: (n && n.data) || "",
                  complicacoes: (n && n.complicacoes) || "",
                };
              });
            }
            return row;
          })
      : [];
    var diagnosticos = Array.isArray(header.diagnosticos)
      ? header.diagnosticos
          .filter(function (d) {
            return d && String(d.texto || "").trim();
          })
          .map(function (d) {
            return {
              id: d.id || "",
              data: d.data || "",
              texto: d.texto || "",
            };
          })
      : [];
    var out = {
      header: {
        nome: header.nome || "",
        idade: header.idade || "",
        staff: header.staff || "",
        prontuario: header.prontuario || "",
        dih: header.dih || "",
        diagnostico: header.diagnostico || "",
        diagnosticos: diagnosticos,
        cirurgias: cirurgias,
        dataCirurgia: header.dataCirurgia || "",
        peso: header.peso || "",
        cirurgia: header.cirurgia || "",
        hdaHpp: header.hdaHpp || "",
      },
      entries: entries
        .filter(passometroEntryHasClinicalContent)
        .map(function (e) {
          if (!e || typeof e !== "object") return { id: "", data: "" };
          var row = {
            id: e.id || "",
            data: e.data || "",
            po: e.po || "",
            atb: e.atb || "",
            dieta: e.dieta || "",
            cd: e.cd || "",
            pendencias: e.pendencias || "",
            hv: e.hv || "",
            sng: e.sng || "",
            analgesia: e.analgesia || "",
            fc: e.fc || "",
            fr: e.fr || "",
            sato2: e.sato2 || "",
            pa:
              e.pa ||
              (e.pad
                ? String(e.pas || "") + "/" + String(e.pad)
                : String(e.pas || "")) ||
              "",
            diurese: e.diurese || "",
            bh: e.bh || "",
            drenos: e.drenos || "",
            drenoTl: e.drenoTl || "",
            drenoJp: e.drenoJp || "",
            drenoPig: e.drenoPig || "",
            hgt: e.hgt || "",
            vomitos: e.vomitos || "",
            tax: e.tax || "",
            fezes: e.fezes || "",
            fistulas: e.fistulas || "",
          };
          var entryCustom = slimCustomBag(e.custom);
          if (Object.keys(entryCustom).length) row.custom = entryCustom;
          if (e.vitalsTouched && typeof e.vitalsTouched === "object") {
            var touched = {};
            var touchKeys = [
              "fc",
              "fr",
              "sato2",
              "tax",
              "pa",
              "hgt",
              "diurese",
              "bh",
              "fezes",
            ];
            for (var ti = 0; ti < touchKeys.length; ti++) {
              var tk = touchKeys[ti];
              if (e.vitalsTouched[tk] === true) touched[tk] = true;
            }
            if (Object.keys(touched).length) row.vitalsTouched = touched;
          }
          return row;
        })
        .filter(passometroEntryHasClinicalContent),
      atualizadoEm: snap.atualizadoEm || null,
    };
    if (Object.keys(headerCustom).length) out.header.custom = headerCustom;
    if (snap.layout && typeof snap.layout === "object") {
      out.layout = snap.layout;
    }
    return passometroSlimHasContent(out) ? out : null;
  }

  function getAltaSchemaApi() {
    if (typeof require !== "undefined") {
      try {
        return require("./alta-schema.js");
      } catch (_e) {}
    }
    return g.AghuAltaSchema || null;
  }

  /**
   * Slim do domínio `receitas` para o payload de sync (AltaSnapV2).
   *
   * Delega a normalização ao motor canónico `AghuAltaSchema` (mesmo usado na
   * web) para preservar `orientacoes` / `laudo` / `laudoPersonalizado` /
   * `atestado` / `acompanhante` / `retorno` / `previewHtml` — antes desta
   * mudança o slim descartava tudo além de `receitas[].lines` (V1),
   * dessincronizando a aba Alta da extensão do painel web.
   *
   * Fallback V1 (sem `AghuAltaSchema` carregado): serializa só `receitas[]`,
   * igual ao comportamento anterior — não regride quem já sincroniza receitas.
   */
  function slimReceitas(snap) {
    if (!snap || typeof snap !== "object") return null;
    var altaSchema = getAltaSchemaApi();
    if (
      altaSchema &&
      typeof altaSchema.normalizeSnapCore === "function" &&
      typeof altaSchema.snapHasAltaContent === "function"
    ) {
      var normalized = altaSchema.normalizeSnapCore(snap);
      var hasContent = altaSchema.snapHasAltaContent(normalized);
      if (!hasContent && !snap.atualizadoEm) return null;
      return normalized;
    }
    var receitas = [];
    if (Array.isArray(snap.receitas)) {
      for (var i = 0; i < snap.receitas.length; i++) {
        var d = snap.receitas[i];
        if (!d || typeof d !== "object") continue;
        var lines = [];
        if (Array.isArray(d.lines)) {
          for (var j = 0; j < d.lines.length; j++) {
            var ln = d.lines[j];
            if (!ln || typeof ln !== "object") continue;
            if (!ln.drugName) continue;
            lines.push({
              id: ln.id || "",
              drugName: String(ln.drugName || ""),
              catalogKey: ln.catalogKey || null,
              presentation: ln.presentation || "",
              dose: ln.dose || "",
              route: ln.route || "",
              posology: String(ln.posology || ""),
              quantity: ln.quantity || "",
              prescriptionDocumentClass:
                ln.prescriptionDocumentClass || "SIMPLE",
              classSource: ln.classSource || "MANUAL",
              controlListCode: ln.controlListCode || null,
              validityDays:
                typeof ln.validityDays === "number" ? ln.validityDays : null,
            });
          }
        }
        receitas.push({
          id: d.id || "",
          titulo: d.titulo || "",
          createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
          updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
          issuedAt: d.issuedAt || "",
          lines: lines,
          notes: d.notes || "",
          appliedTemplateId: d.appliedTemplateId || null,
          patientAddress: d.patientAddress || null,
        });
      }
    }
    if (!receitas.length && !snap.atualizadoEm) return null;
    return {
      version: 1,
      receitas: receitas,
      atualizadoEm: snap.atualizadoEm || null,
    };
  }

  function getSyncPiiMergeApi() {
    if (typeof require !== "undefined") {
      try {
        return require("./sync-pii-merge.js");
      } catch (_e) {}
    }
    return g.AghuSyncPiiMerge || null;
  }

  function buildLocalPiiFields(piiSource, piiHeader, patientKey, receitaSnap) {
    if (!piiSource) return null;
    var patientAddressForPii = resolvePatientAddressForPii(piiSource, receitaSnap);
    var pii = {
      patientKey: patientKey,
      primeiroNome:
        piiSource.primeiroNome ||
        (piiHeader && piiHeader.nome ? String(piiHeader.nome).split(/\s+/)[0] : "") ||
        "",
      nomeCompleto:
        piiSource.nomeCompleto ||
        (piiHeader && piiHeader.nome) ||
        "",
      prontuario:
        piiSource.prontuario ||
        (piiHeader && piiHeader.prontuario) ||
        "",
      sexo: piiSource.sexo || "",
    };
    var leito = piiSource.leito;
    if (leito && String(leito).trim()) pii.leito = String(leito).trim();
    var dobApi = null;
    if (typeof require === "function") {
      try {
        dobApi = require("./pii-dob-resolve.js");
      } catch (_e) {}
    }
    var dob =
      dobApi && dobApi.pickIsoDobFromPii
        ? dobApi.pickIsoDobFromPii(piiSource)
        : "";
    if (!dob) {
      var dobRaw = piiSource.dataNascimentoISO || piiSource.dataNascimento || "";
      if (dobRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(dobRaw))) {
        dob = String(dobRaw);
      }
    }
    if (dob) pii.dataNascimento = dob;
    var nomeMae = piiSource.nomeMae;
    if (nomeMae && String(nomeMae).trim()) {
      pii.nomeMae = String(nomeMae).trim();
    }
    var cartaoSus = piiSource.cartaoSus;
    if (cartaoSus && String(cartaoSus).trim()) {
      pii.cartaoSus = String(cartaoSus).trim();
    }
    if (patientAddressForPii && typeof patientAddressForPii === "object") {
      var street = String(patientAddressForPii.street || "").trim();
      var number = String(patientAddressForPii.number || "").trim();
      var neighborhood = String(patientAddressForPii.neighborhood || "").trim();
      var city = String(patientAddressForPii.city || "").trim();
      var state = String(patientAddressForPii.state || "ES").trim().toUpperCase().slice(0, 2);
      if (street || number || neighborhood || city) {
        pii.patientAddress = {
          street: street,
          number: number,
          neighborhood: neighborhood,
          city: city,
          state: state || "ES",
        };
      }
    }
    return pii;
  }

  function hasLocalExamsContent(patientRecord) {
    return !!(
      patientRecord &&
      patientRecord.examsByKey &&
      typeof patientRecord.examsByKey === "object" &&
      Object.keys(patientRecord.examsByKey).length > 0
    );
  }

  /**
   * @param {{
   *   patientKey: string,
   *   recordClientId: string,
   *   patientRecord?: object | null,
   *   controlesSnap?: object | null,
   *   prescricaoSnap?: object | null,
   *   passometroSnap?: object | null,
   *   analiseSnap?: object | null,
   *   receitaSnap?: object | null,
   *   hpbRegistrySnap?: object | null,
   *   patientEpisodesSnap?: object | null,
   *   researchRegistrySnap?: object | null,
   *   cloudPii?: object | null,
   * }} opts
   * @returns {object | null}
   */
  var lastBuildPayloadMeta = { needsConfirmClose: false, closedEpisodeId: null };

  function getLastBuildPayloadMeta() {
    return lastBuildPayloadMeta;
  }
  function buildPayloadFromSnapshots(opts) {
    opts = opts || {};
    lastBuildPayloadMeta = { needsConfirmClose: false, closedEpisodeId: null };
    var patientKey = opts.patientKey;
    var recordClientId = opts.recordClientId;
    if (!patientKey || !isValidUuid(recordClientId)) return null;

    var patientRecord = opts.patientRecord || null;
    var controlesSnap = opts.controlesSnap || null;
    var prescricaoSnap = opts.prescricaoSnap || null;
    var passometroSnap = opts.passometroSnap || null;
    var analiseSnap = opts.analiseSnap || null;
    var receitaSnap = opts.receitaSnap || null;
    var hpbRegistrySnap = opts.hpbRegistrySnap || null;
    var patientEpisodesSnap = opts.patientEpisodesSnap || null;
    var researchRegistrySnap = opts.researchRegistrySnap || null;

    var passometroPrepared = preparePassometroForPayload(
      passometroSnap,
      patientEpisodesSnap,
      null,
    );
    if (passometroPrepared.episodesChanged && passometroPrepared.patientEpisodes) {
      patientEpisodesSnap = passometroPrepared.patientEpisodes;
    }
    var passometroCollection = passometroPrepared.passometro;
    var activeEpisodeId = passometroPrepared.activeEpisodeId;
    var activePassometroSnap = passometroPrepared.activeSnap;

    if (
      activePassometroSnap &&
      episodesBridgeApi &&
      episodesBridgeApi.resolvePassometroSaveContext
    ) {
      var saveCtx = episodesBridgeApi.resolvePassometroSaveContext({
        episodesSnap: patientEpisodesSnap,
        collection: passometroCollection,
        header: activePassometroSnap.header || {},
        mode: opts.forceNewPassometro ? "new_passometro" : "save",
        patientEpisodeId: activeEpisodeId,
        forceNewPassometro: opts.forceNewPassometro === true,
        confirmedClose: opts.confirmedClose === true,
      });
      if (saveCtx && saveCtx.needsConfirmClose) {
        lastBuildPayloadMeta = {
          needsConfirmClose: true,
          closedEpisodeId: saveCtx.closedEpisodeId || null,
        };
        return null;
      }
      if (saveCtx && saveCtx.patientEpisodeId) {
        activeEpisodeId = saveCtx.patientEpisodeId;
        passometroCollection = saveCtx.collection;
        if (saveCtx.episodesChanged && saveCtx.patientEpisodes) {
          patientEpisodesSnap = saveCtx.patientEpisodes;
        }
        passometroCollection = writeActiveSnapToCollection(
          passometroCollection,
          activeEpisodeId,
          activePassometroSnap,
        );
      }
    }

    if (
      activePassometroSnap &&
      bridgeApi &&
      bridgeApi.syncPassometroHpb &&
      hpbSchemaApi
    ) {
      var bridgeOut = bridgeApi.syncPassometroHpb(
        activePassometroSnap,
        hpbRegistrySnap || hpbSchemaApi.emptyRegistry(),
        { activeEpisodeId: activeEpisodeId || undefined },
      );
      if (bridgeOut) {
        if (bridgeOut.registry) {
          hpbRegistrySnap = bridgeOut.registry;
        }
        if (bridgeOut.passometroChanged && bridgeOut.passometro && activeEpisodeId) {
          activePassometroSnap = bridgeOut.passometro;
          passometroCollection = writeActiveSnapToCollection(
            passometroCollection,
            activeEpisodeId,
            activePassometroSnap,
          );
        }
      }
    }

    if (
      activePassometroSnap &&
      episodesBridgeApi &&
      episodesBridgeApi.syncPassometroHeaderToEpisode &&
      activeEpisodeId
    ) {
      var headerToEpisode = episodesBridgeApi.syncPassometroHeaderToEpisode(
        patientEpisodesSnap,
        activeEpisodeId,
        activePassometroSnap.header || {},
      );
      if (headerToEpisode.changed) {
        patientEpisodesSnap = headerToEpisode.snapshot;
      }
    } else if (
      activePassometroSnap &&
      episodesBridgeApi &&
      episodesBridgeApi.syncPassometroDiagnosesToEpisode &&
      activeEpisodeId
    ) {
      var diagToEpisode = episodesBridgeApi.syncPassometroDiagnosesToEpisode(
        patientEpisodesSnap,
        activeEpisodeId,
        activePassometroSnap.header || {},
      );
      if (diagToEpisode.changed) {
        patientEpisodesSnap = diagToEpisode.snapshot;
      }
    } else if (
      activePassometroSnap &&
      episodesBridgeApi &&
      episodesBridgeApi.syncPassometroDiagnosesToActiveEpisode
    ) {
      var diagToEpisodeLegacy =
        episodesBridgeApi.syncPassometroDiagnosesToActiveEpisode(
          patientEpisodesSnap,
          activePassometroSnap.header || {},
        );
      if (diagToEpisodeLegacy.changed) {
        patientEpisodesSnap = diagToEpisodeLegacy.snapshot;
      }
    }
    var piiSource =
      patientRecord ||
      controlesSnap ||
      prescricaoSnap ||
      activePassometroSnap ||
      passometroCollection ||
      analiseSnap ||
      receitaSnap;
    if (!piiSource) return null;

    var piiHeader =
      activePassometroSnap && activePassometroSnap.header
        ? activePassometroSnap.header
        : null;

    var localPii = buildLocalPiiFields(piiSource, piiHeader, patientKey, receitaSnap);
    var cloudPii = opts.cloudPii || null;
    var piiMerge = getSyncPiiMergeApi();
    var pii =
      cloudPii && piiMerge && piiMerge.mergePiiForSync
        ? piiMerge.mergePiiForSync(localPii, cloudPii, patientKey)
        : localPii;

  var examsPayload = hasLocalExamsContent(patientRecord)
      ? {
          examsByKey: patientRecord.examsByKey,
          atualizadoEm: patientRecord.atualizadoEm || null,
        }
      : null;

    if (patientEpisodesSnap && downstreamSyncApi) {
      var downstream = downstreamSyncApi.applyClinicalDownstreamSync({
        patientEpisodesSnap: patientEpisodesSnap,
        editedEpisodeId: activeEpisodeId || null,
        hpbRegistry: hpbRegistrySnap,
        researchRegistry: researchRegistrySnap,
        protocols: opts.studyProtocols || [],
        overwrite: true,
      });
      if (downstream.hpbChanged) {
        hpbRegistrySnap = downstream.hpbRegistry;
      }
      if (downstream.researchChanged) {
        researchRegistrySnap = downstream.researchRegistry;
      }
    }

    return {
      record_client_id: recordClientId,
      archive_schema_version: ARCHIVE_SCHEMA_VERSION,
      pii: pii,
      exams: examsPayload,
      controles: slimControles(controlesSnap),
      prescricoes: slimPrescricoes(prescricaoSnap),
      passometro: slimPassometroDomain(
        passometroCollection,
        patientEpisodesSnap,
        piiSource,
      ),
      analise: slimAnalise(analiseSnap),
      receitas: slimReceitas(receitaSnap),
      hpb_registry: hpbRegistrySnap,
      patient_episodes: slimPatientEpisodes(patientEpisodesSnap),
      research_registry: researchRegistrySnap,
    };
  }

  return {
    ARCHIVE_SCHEMA_VERSION: ARCHIVE_SCHEMA_VERSION,
    isValidUuid: isValidUuid,
    buildPayloadFromSnapshots: buildPayloadFromSnapshots,
    getLastBuildPayloadMeta: getLastBuildPayloadMeta,
    buildLocalPiiFields: buildLocalPiiFields,
    hasLocalExamsContent: hasLocalExamsContent,
    slimControles: slimControles,
    slimControlesEntry: slimControlesEntry,
    normalizeControlesInput: normalizeControlesInput,
    mergeControlesEntries: mergeControlesEntries,
    normalizeExamsArchive: normalizeExamsArchive,
    mergeExamRows: mergeExamRows,
    mergeExamsArchives: mergeExamsArchives,
    mergePrescricoesEntries: mergePrescricoesEntries,
    normalizePrescricoesInput: normalizePrescricoesInput,
    slimPrescricaoEntry: slimPrescricaoEntry,
    slimPrescricoes: slimPrescricoes,
    slimPassometro: slimPassometro,
    slimPassometroDomain: slimPassometroDomain,
    preparePassometroForPayload: preparePassometroForPayload,
    slimAnalise: slimAnalise,
    slimReceitas: slimReceitas,
    getAltaSchemaApi: getAltaSchemaApi,
    slimPatientEpisodes: slimPatientEpisodes,
  };
});
