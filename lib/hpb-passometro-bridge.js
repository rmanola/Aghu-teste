/**
 * Ponte bidirecional Passômetro ↔ HPB (cirurgias / procedimentos).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbPassometroBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var passometroSchemaApi = null;
  var hpbSchemaApi = null;
  var hpbListsApi = null;
  var dateBrApi = null;

  try {
    if (typeof require === "function") {
      passometroSchemaApi = require("./passometro-schema.js");
      hpbSchemaApi = require("./hpb-registry-schema.js");
      hpbListsApi = require("./hpb-lists.js");
      dateBrApi = require("./date-br.js");
    }
  } catch (_e) {}

  var equipeParseApi = null;
  try {
    if (typeof require === "function") {
      equipeParseApi = require("./cirurgias-equipe-parse.js");
    }
  } catch (_e2) {}

  function getEquipeParse() {
    if (equipeParseApi) return equipeParseApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuCirurgiasEquipeParse || null;
  }

  function getPassometroSchema() {
    if (passometroSchemaApi) return passometroSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuPassometroSchema || null;
  }

  function getHpbSchema() {
    if (hpbSchemaApi) return hpbSchemaApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbRegistrySchema || null;
  }

  function getHpbLists() {
    if (hpbListsApi) return hpbListsApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbLists || null;
  }

  function getDateBr() {
    if (dateBrApi) return dateBrApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuDateBr || null;
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function primaryDiagnosisFromHeader(header) {
    if (!header || typeof header !== "object") return "";
    var pm = getPassometroSchema();
    if (pm && pm.normalizeDiagnosticosFromHeader) {
      var list = pm.normalizeDiagnosticosFromHeader(header);
      if (list.length && list[0].texto) return str(list[0].texto).trim();
    }
    return str(header.diagnostico).trim();
  }

  function strEmpty(v) {
    return !str(v).trim();
  }

  function fold(s) {
    return str(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function passometroDateToIso(brDate) {
    var db = getDateBr();
    if (db && db.brToIso) {
      var iso = db.brToIso(brDate);
      if (iso) return iso;
    }
    var raw = str(brDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return "";
  }

  function isoToPassometroDate(iso) {
    var db = getDateBr();
    if (db && db.isoToBr) {
      var br = db.isoToBr(iso);
      if (br) return br;
    }
    return str(iso);
  }

  function getMainProcedureList() {
    var DEFAULT = [
      "Hepatectomia",
      "Duodenopancreatectomia",
      "Pancreatectomia distal",
      "Pancreatectomia total",
      "Cirurgia via biliar",
      "Reconstrução biliar",
      "Ablação/locorregional",
      "Reconstrução vascular",
      "Cirurgia robótica HPB",
      "Outro",
    ];
    var lists = getHpbLists();
    if (!lists || !lists.LISTS) return DEFAULT;
    return (
      lists.LISTS["surgerycore_procedimento_principal"] ||
      lists.LISTS["Procedimento principal"] ||
      DEFAULT
    );
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function resolveMainProcedure(text) {
    var raw = str(text).trim();
    if (!raw) return "Outro";
    var list = getMainProcedureList();
    var folded = fold(raw);
    for (var i = 0; i < list.length; i++) {
      if (fold(list[i]) === folded) return list[i];
    }
    var sorted = list.slice().sort(function (a, b) {
      return b.length - a.length;
    });
    for (var j = 0; j < sorted.length; j++) {
      var item = sorted[j];
      if (item === "Outro") continue;
      var fItem = fold(item);
      if (fItem && folded.indexOf(fItem) !== -1) return item;
      if (fItem && fItem.indexOf(folded) !== -1 && folded.length >= 4) return item;
    }
    return "Outro";
  }

  function displayProcedureFromCore(core) {
    if (!core || typeof core !== "object") return "";
    var main = str(core.mainProcedure).trim();
    if (main && main !== "Outro") return main;
    var notes = str(core.notes).trim();
    if (notes) return notes;
    return main || "";
  }

  /**
   * Surgeon HPB = chefe de cirurgias[].equipe. Nunca header.staff (internação).
   * @param {object} cirurgia
   * @returns {object}
   */
  function cirurgiaToSurgeryCore(cirurgia) {
    var nome = str(cirurgia.nome).trim();
    var desc = str(cirurgia.descricao).trim();
    var label = nome || desc;
    var mainProcedure = resolveMainProcedure(label);
    var surgeon = "";
    var parseApi = getEquipeParse();
    if (parseApi && typeof parseApi.parseCirurgiaEquipe === "function") {
      var parsed = parseApi.parseCirurgiaEquipe(cirurgia);
      if (parsed && parsed.chefe && parsed.chefe.name) {
        surgeon = str(parsed.chefe.name).trim();
      }
    }
    var core = {
      date: passometroDateToIso(cirurgia.data),
      mainProcedure: mainProcedure,
      surgeon: surgeon,
      hospital: "HUCAM/UFES",
    };
    if (mainProcedure === "Outro" && label) {
      core.notes = nome && desc ? nome + " — " + desc : label;
    } else if (desc && desc !== nome) {
      core.notes = desc;
    }
    return core;
  }

  function surgeryCoreToCirurgia(surgery, cirurgiaId) {
    var core = surgery.core || {};
    var iso = str(core.date).trim();
    var data = iso ? isoToPassometroDate(iso) : "";
    var main = str(core.mainProcedure).trim();
    var notes = str(core.notes).trim();
    var nome = main && main !== "Outro" ? main : notes || main || "";
    var descricao = "";
    if (main && main !== "Outro" && notes) descricao = notes;
    if (main === "Outro" && notes) {
      nome = notes;
      descricao = "";
    }
    var pmSchema = getPassometroSchema();
    var id =
      str(surgery.passometroCirurgiaId).trim() ||
      str(cirurgiaId).trim() ||
      (pmSchema && pmSchema.newEntryId ? pmSchema.newEntryId() : "cir-" + Date.now());
    return {
      id: id,
      data: data,
      nome: nome,
      descricao: descricao,
      hpbSurgeryId: str(surgery.id).trim(),
    };
  }

  function isDeleted(item) {
    return !!(item && item.deletedAt);
  }

  function activeSurgeries(episode) {
    if (!episode || !Array.isArray(episode.surgeries)) return [];
    return episode.surgeries.filter(function (s) {
      return s && !isDeleted(s);
    });
  }

  function activeEpisodes(registry) {
    var hpb = getHpbSchema();
    if (hpb && hpb.filterRegistryActive) {
      var filtered = hpb.filterRegistryActive(registry);
      return filtered.episodes || [];
    }
    if (!registry || !Array.isArray(registry.episodes)) return [];
    return registry.episodes.filter(function (ep) {
      return ep && !isDeleted(ep);
    });
  }

  function findEpisode(registry, episodeId) {
    var eps = activeEpisodes(registry);
    if (episodeId) {
      for (var i = 0; i < eps.length; i++) {
        if (eps[i].id === episodeId) return eps[i];
      }
    }
    return eps[0] || null;
  }

  function fillEmptyObject(target, source, keys) {
    var out = Object.assign({}, target || {});
    var filled = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (strEmpty(out[k]) && !strEmpty(source[k])) {
        out[k] = source[k];
        filled++;
      }
    }
    return { value: out, filled: filled };
  }

  function surgeryIdentityKey(surgery) {
    var core = surgery.core || {};
    return (
      passometroDateToIso(core.date) ||
      str(core.date).slice(0, 10) ||
      str(surgery.id)
    );
  }

  /**
   * @param {object[]} cirurgias
   * @param {object[]} surgeries
   * @returns {{ pairs: { cirurgia: object, surgery: object }[], unmatchedCirurgias: object[], unmatchedSurgeries: object[] }}
   */
  function matchPairs(cirurgias, surgeries) {
    var cirList = Array.isArray(cirurgias) ? cirurgias.slice() : [];
    var surgList = Array.isArray(surgeries) ? surgeries.slice() : [];
    var pairs = [];
    var usedC = Object.create(null);
    var usedS = Object.create(null);

    function tryPair(ci, si) {
      if (usedC[ci] || usedS[si]) return false;
      pairs.push({ cirurgia: cirList[ci], surgery: surgList[si] });
      usedC[ci] = true;
      usedS[si] = true;
      return true;
    }

    for (var r = 0; r < cirList.length; r++) {
      var c = cirList[r];
      var hpbId = str(c.hpbSurgeryId).trim();
      if (!hpbId) continue;
      for (var s = 0; s < surgList.length; s++) {
        if (surgList[s].id === hpbId) tryPair(r, s);
      }
    }

    for (var r2 = 0; r2 < surgList.length; r2++) {
      if (usedS[r2]) continue;
      var pmId = str(surgList[r2].passometroCirurgiaId).trim();
      if (!pmId) continue;
      for (var c2 = 0; c2 < cirList.length; c2++) {
        if (cirList[c2].id === pmId) tryPair(c2, r2);
      }
    }

    for (var r3 = 0; r3 < cirList.length; r3++) {
      if (usedC[r3]) continue;
      var cIso = passometroDateToIso(cirList[r3].data);
      if (!cIso) continue;
      for (var s3 = 0; s3 < surgList.length; s3++) {
        if (usedS[s3]) continue;
        if (surgeryIdentityKey(surgList[s3]) === cIso) {
          tryPair(r3, s3);
          break;
        }
      }
    }

    var unmatchedCirurgias = [];
    var unmatchedSurgeries = [];
    for (var i = 0; i < cirList.length; i++) {
      if (!usedC[i]) unmatchedCirurgias.push(cirList[i]);
    }
    for (var j = 0; j < surgList.length; j++) {
      if (!usedS[j]) unmatchedSurgeries.push(surgList[j]);
    }

    return { pairs: pairs, unmatchedCirurgias: unmatchedCirurgias, unmatchedSurgeries: unmatchedSurgeries };
  }

  function headerHasSurgerySignals(header) {
    if (!header || typeof header !== "object") return false;
    var pmSchema = getPassometroSchema();
    var cirurgias =
      pmSchema && pmSchema.normalizeCirurgiasFromHeader
        ? pmSchema.normalizeCirurgiasFromHeader(header)
        : [];
    if (cirurgias.length) return true;
    return !!(
      str(primaryDiagnosisFromHeader(header)) ||
      str(header.dih).trim() ||
      str(header.staff).trim()
    );
  }

  function ensureTargetEpisode(registry, header, opts) {
    var hpb = getHpbSchema();
    if (!hpb) return { registry: registry, episode: null, created: false };
    var reg = hpb.normalizeRegistry(registry || hpb.emptyRegistry());
    var active = activeEpisodes(reg);
    if (active.length > 0) {
      var existing = findEpisode(reg, opts && opts.activeEpisodeId);
      return { registry: reg, episode: existing || active[0], created: false };
    }
    var episode = findEpisode(reg, opts && opts.activeEpisodeId);
    if (episode) return { registry: reg, episode: episode, created: false };
    if (!headerHasSurgerySignals(header)) {
      return { registry: reg, episode: null, created: false };
    }
    var diag = str(primaryDiagnosisFromHeader(header) || header.cirurgia).trim();
    var startedAt =
      passometroDateToIso(header.dih) ||
      passometroDateToIso(header.dataCirurgia) ||
      "";
    var ep = hpb.newEpisode({
      startedAt: startedAt,
      diagnosisGroup: "Outro",
      primaryDiagnosis: diag || "Sincronizado do passômetro",
      malignant: "unknown",
      status: "ativo",
      indexEvent: "Internação",
      mdtRequired: "unknown",
      notes: "Episódio criado pela ponte passômetro ↔ HPB",
    });
    reg.episodes = (reg.episodes || []).concat([ep]);
    reg.atualizadoEm = hpb.nowIso();
    return { registry: reg, episode: ep, created: true };
  }

  function replaceEpisode(registry, episode) {
    var episodes = registry.episodes || [];
    var found = false;
    var next = episodes.map(function (ep) {
      if (ep.id === episode.id) {
        found = true;
        return episode;
      }
      return ep;
    });
    if (!found) next.push(episode);
    return Object.assign({}, registry, { episodes: next });
  }

  function replaceSurgeryInEpisode(episode, surgery) {
    var surgeries = (episode.surgeries || []).map(function (s) {
      return s.id === surgery.id ? surgery : s;
    });
    return Object.assign({}, episode, { surgeries: surgeries });
  }

  function appendSurgery(episode, surgery) {
    return Object.assign({}, episode, {
      surgeries: (episode.surgeries || []).concat([surgery]),
    });
  }

  function findSurgeryForCirurgia(surgeries, cir) {
    if (!Array.isArray(surgeries) || !cir) return null;
    var hpbId = str(cir.hpbSurgeryId).trim();
    if (hpbId) {
      for (var i = 0; i < surgeries.length; i++) {
        if (surgeries[i] && surgeries[i].id === hpbId) return surgeries[i];
      }
    }
    var pmId = str(cir.id).trim();
    if (pmId) {
      for (var j = 0; j < surgeries.length; j++) {
        if (surgeries[j] && surgeries[j].passometroCirurgiaId === pmId) {
          return surgeries[j];
        }
      }
    }
    var cIso = passometroDateToIso(cir.data);
    if (cIso) {
      for (var k = 0; k < surgeries.length; k++) {
        if (surgeries[k] && surgeryIdentityKey(surgeries[k]) === cIso) {
          return surgeries[k];
        }
      }
    }
    return null;
  }

  function coreKeys() {
    return [
      "date",
      "hospital",
      "surgeon",
      "accessRoute",
      "mainProcedure",
      "malignant",
      "converted",
      "conversionReason",
      "durationMin",
      "bloodLossMl",
      "transfusionUnits",
      "complexity",
      "plannedIcu",
      "vascularReconstruction",
      "notes",
    ];
  }

  function normalizeCirurgiaForBridge(item) {
    if (!item || typeof item !== "object") return null;
    var pmSchema = getPassometroSchema();
    if (pmSchema && pmSchema.normalizeCirurgiaItem) {
      var norm = pmSchema.normalizeCirurgiaItem(item);
      if (norm) {
        var hpbId = str(item.hpbSurgeryId).trim();
        if (hpbId) norm.hpbSurgeryId = hpbId;
        return norm;
      }
    }
    var data = str(item.data).trim();
    if (!data) return null;
    return {
      id: str(item.id).trim() || "cir-" + Date.now(),
      data: data,
      nome: str(item.nome).trim() || str(item.descricao).trim(),
      descricao: str(item.nome).trim() ? str(item.descricao).trim() : "",
      hpbSurgeryId: str(item.hpbSurgeryId).trim(),
    };
  }

  function normalizeCirurgiasList(header) {
    var pmSchema = getPassometroSchema();
    if (!pmSchema || !pmSchema.normalizeCirurgiasFromHeader) return [];
    var list = pmSchema.normalizeCirurgiasFromHeader(header || {});
    return list.map(function (c) {
      var hpbId = str(c.hpbSurgeryId).trim();
      if (hpbId) c.hpbSurgeryId = hpbId;
      return c;
    });
  }

  function fingerprintPassometroSurgery(header) {
    var cirurgias = normalizeCirurgiasList(header);
    return JSON.stringify({
      cirurgias: cirurgias,
      diagnostico: str(primaryDiagnosisFromHeader(header)),
      dih: str(header && header.dih),
    });
  }

  function fingerprintHpbSurgeries(episode) {
    var surgeries = activeSurgeries(episode).map(function (s) {
      return {
        id: s.id,
        passometroCirurgiaId: s.passometroCirurgiaId || "",
        core: s.core || {},
      };
    });
    return JSON.stringify({
      primaryDiagnosis: str(episode && episode.primaryDiagnosis),
      startedAt: str(episode && episode.startedAt),
      surgeries: surgeries,
    });
  }

  /**
   * @param {"passometro"|"hpb_registry"} domain
   * @param {object|null|undefined} prev
   * @param {object|null|undefined} next
   * @returns {boolean}
   */
  function shouldRunBridgeSync(domain, prev, next) {
    if (!next || typeof next !== "object") return false;
    if (domain === "passometro") {
      var prevHeader = prev && prev.header ? prev.header : {};
      var nextHeader = next.header || {};
      return (
        fingerprintPassometroSurgery(prevHeader) !==
        fingerprintPassometroSurgery(nextHeader)
      );
    }
    if (domain === "hpb_registry") {
      var hpb = getHpbSchema();
      if (!hpb) return true;
      var prevReg = hpb.normalizeRegistry(prev || hpb.emptyRegistry());
      var nextReg = hpb.normalizeRegistry(next);
      var prevEp = findEpisode(prevReg, null);
      var nextEp = findEpisode(nextReg, null);
      if (!prevEp && !nextEp) return false;
      return fingerprintHpbSurgeries(prevEp) !== fingerprintHpbSurgeries(nextEp);
    }
    return false;
  }

  function emptyReport() {
    return {
      paired: 0,
      addedToHpb: 0,
      addedToPassometro: 0,
      fieldsFilled: 0,
      episodeCreated: false,
    };
  }

  /** Normaliza passômetro para a ponte sem expandir entries (continuity DIH→hoje). */
  function normalizeSnapForBridge(snap, pmSchema) {
    if (!snap || typeof snap !== "object") {
      return pmSchema.emptySnap ? pmSchema.emptySnap() : { header: {}, entries: [] };
    }
    var header = pmSchema.normalizeHeader
      ? pmSchema.normalizeHeader(snap.header)
      : snap.header || {};
    var entries = Array.isArray(snap.entries)
      ? snap.entries.map(function (e) {
          return pmSchema.normalizeEntry ? pmSchema.normalizeEntry(e) : e;
        })
      : [];
    var atualizadoEm = snap.atualizadoEm;
    if (typeof atualizadoEm !== "number" || !Number.isFinite(atualizadoEm)) {
      atualizadoEm = null;
    }
    return {
      header: header,
      entries: entries,
      atualizadoEm: atualizadoEm,
      layout: snap.layout,
    };
  }

  /**
   * @param {object|null|undefined} passometroSnap
   * @param {object|null|undefined} registry
   * @param {{ activeEpisodeId?: string }} [opts]
   * @returns {{ passometro: object|null, registry: object|null, report: object, changed: boolean }}
   */
  function syncPassometroHpb(passometroSnap, registry, opts) {
    opts = opts || {};
    var pmSchema = getPassometroSchema();
    var hpb = getHpbSchema();
    var report = emptyReport();

    if (!pmSchema || !hpb) {
      return {
        passometro: passometroSnap || null,
        registry: registry || null,
        report: report,
        changed: false,
      };
    }

    var passometroBefore =
      passometroSnap && typeof passometroSnap === "object"
        ? normalizeSnapForBridge(passometroSnap, pmSchema)
        : pmSchema.emptySnap
          ? pmSchema.emptySnap()
          : { header: {}, entries: [] };

    var regBefore = hpb.normalizeRegistry(registry || hpb.emptyRegistry());
    var beforeEpisode = findEpisode(regBefore, opts && opts.activeEpisodeId);
    var fpPmBefore = fingerprintPassometroSurgery(passometroBefore.header || {});
    var fpHpbBefore = fingerprintHpbSurgeries(beforeEpisode);

    var passometro = cloneJson(passometroBefore);
    var reg = cloneJson(regBefore);
    var header = passometro.header || {};

    var ensured = ensureTargetEpisode(reg, header, opts);
    reg = ensured.registry;
    var episode = ensured.episode;
    if (ensured.created) report.episodeCreated = true;

    if (!episode) {
      return {
        passometro: passometro,
        registry: reg,
        report: report,
        changed: report.episodeCreated,
      };
    }

    var cirurgias = normalizeCirurgiasList(header);
    var surgeries = activeSurgeries(episode);
    var matched = matchPairs(cirurgias, surgeries);
    var nextCirurgias = cirurgias.slice();
    var nextSurgeries = surgeries.slice();

    function upsertCirurgia(c) {
      for (var i = 0; i < nextCirurgias.length; i++) {
        if (nextCirurgias[i].id === c.id) {
          nextCirurgias[i] = c;
          return;
        }
      }
      nextCirurgias.push(c);
    }

    function upsertSurgery(s) {
      for (var i = 0; i < nextSurgeries.length; i++) {
        if (nextSurgeries[i].id === s.id) {
          nextSurgeries[i] = s;
          return;
        }
      }
      nextSurgeries.push(s);
    }

    var coreFieldKeys = coreKeys();

    for (var p = 0; p < matched.pairs.length; p++) {
      var pair = matched.pairs[p];
      var cir = cloneJson(pair.cirurgia);
      var surg = cloneJson(pair.surgery);
      var fromPm = cirurgiaToSurgeryCore(cir);
      var mergedCore = fillEmptyObject(surg.core || {}, fromPm, coreFieldKeys);
      surg.core = mergedCore.value;
      report.fieldsFilled += mergedCore.filled;

      var fromHpb = surgeryCoreToCirurgia(surg, cir.id);
      var mergedCir = fillEmptyObject(cir, fromHpb, ["data", "nome", "descricao"]);
      report.fieldsFilled += mergedCir.filled;
      mergedCir.value.hpbSurgeryId = surg.id;
      mergedCir.value.id = cir.id || fromHpb.id;
      surg.passometroCirurgiaId = mergedCir.value.id;

      upsertCirurgia(mergedCir.value);
      upsertSurgery(surg);
      report.paired++;
    }

    for (var u = 0; u < matched.unmatchedCirurgias.length; u++) {
      var uc = matched.unmatchedCirurgias[u];
      var existingSurg = findSurgeryForCirurgia(nextSurgeries, uc);
      if (existingSurg) {
        uc.hpbSurgeryId = existingSurg.id;
        upsertCirurgia(uc);
        upsertSurgery(existingSurg);
        report.paired++;
        continue;
      }
      var newSurg = hpb.newSurgery({
        core: cirurgiaToSurgeryCore(uc),
        passometroCirurgiaId: uc.id,
      });
      uc.hpbSurgeryId = newSurg.id;
      upsertCirurgia(uc);
      upsertSurgery(newSurg);
      report.addedToHpb++;
    }

    for (var v = 0; v < matched.unmatchedSurgeries.length; v++) {
      var us = matched.unmatchedSurgeries[v];
      var newCir = normalizeCirurgiaForBridge(surgeryCoreToCirurgia(us));
      if (!newCir) continue;
      us.passometroCirurgiaId = newCir.id;
      upsertCirurgia(newCir);
      upsertSurgery(us);
      report.addedToPassometro++;
    }

    var epPatch = fillEmptyObject(
      episode,
      {
        primaryDiagnosis: str(primaryDiagnosisFromHeader(header)),
        startedAt: passometroDateToIso(header.dih) || "",
      },
      ["primaryDiagnosis", "startedAt"],
    );
    episode = epPatch.value;
    report.fieldsFilled += epPatch.filled;

    var deletedSurgeries = (episode.surgeries || []).filter(function (s) {
      return isDeleted(s);
    });
    episode = Object.assign({}, episode, {
      surgeries: deletedSurgeries.concat(nextSurgeries),
    });

    if (pmSchema.mirrorLegacyCirurgiaFields) {
      passometro.header = pmSchema.mirrorLegacyCirurgiaFields(
        Object.assign({}, header, { cirurgias: nextCirurgias }),
        nextCirurgias,
      );
    } else {
      passometro.header = Object.assign({}, header, { cirurgias: nextCirurgias });
    }

    reg = replaceEpisode(reg, episode);
    reg.atualizadoEm = hpb.nowIso();

    var afterEpisode = findEpisode(reg, opts && opts.activeEpisodeId);
    var fpPmAfter = fingerprintPassometroSurgery(passometro.header || {});
    var fpHpbAfter = fingerprintHpbSurgeries(afterEpisode);
    var changed =
      fpPmBefore !== fpPmAfter ||
      fpHpbBefore !== fpHpbAfter ||
      report.episodeCreated;

    return {
      passometro: passometro,
      registry: reg,
      report: report,
      changed: changed,
      passometroChanged: fpPmBefore !== fpPmAfter,
    };
  }

  function formatBridgeStatus(report) {
    if (!report) return "";
    var parts = [];
    if (report.addedToHpb) parts.push("HPB +" + report.addedToHpb);
    if (report.addedToPassometro) parts.push("passômetro +" + report.addedToPassometro);
    if (report.fieldsFilled) parts.push(report.fieldsFilled + " campo(s)");
    return parts.length ? " · " + parts.join(", ") : "";
  }

  return {
    resolveMainProcedure: resolveMainProcedure,
    passometroDateToIso: passometroDateToIso,
    isoToPassometroDate: isoToPassometroDate,
    cirurgiaToSurgeryCore: cirurgiaToSurgeryCore,
    surgeryCoreToCirurgia: surgeryCoreToCirurgia,
    matchPairs: matchPairs,
    shouldRunBridgeSync: shouldRunBridgeSync,
    syncPassometroHpb: syncPassometroHpb,
    formatBridgeStatus: formatBridgeStatus,
  };
});
