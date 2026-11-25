/**
 * Linha do passômetro de plantão (FEAT-111) — núcleo puro, testável em Node.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroPlantaoRow = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuDateBr) {
      return globalThis.AghuDateBr;
    }
    return null;
  }

  function getContinuity() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-continuity.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroEntriesContinuity
    ) {
      return globalThis.AghuPassometroEntriesContinuity;
    }
    return null;
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroSchema) {
      return globalThis.AghuPassometroSchema;
    }
    return null;
  }

  function getEntriesOrder() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-order.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroEntriesOrder
    ) {
      return globalThis.AghuPassometroEntriesOrder;
    }
    return null;
  }

  /** Overlay plantão (FEAT-114) — não entram no entry grid do hub. */
  var PLANTAO_OVERLAY_KEYS = [
    "plantao_hda",
    "plantao_hpp",
    "plantao_subjetivo",
    "plantao_exameFisico",
    "plantao_exames",
  ];

  var OVERLAY_TO_ROW = {
    plantao_hda: "hda",
    plantao_hpp: "hpp",
    plantao_subjetivo: "subjetivo",
    plantao_exameFisico: "exameFisico",
    plantao_exames: "exames",
  };

  function formatBrFromDate(d) {
    return (
      String(d.getDate()).padStart(2, "0") +
      "/" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "/" +
      d.getFullYear()
    );
  }

  /** PLANT-AC-11 — hoje em BR local; `now` injectável em testes. */
  function getTodayBr(now) {
    if (now instanceof Date && !Number.isNaN(now.getTime())) {
      return formatBrFromDate(now);
    }
    var db = getDateBr();
    if (db && typeof db.localTodayBr === "function") return db.localTodayBr();
    return formatBrFromDate(new Date());
  }

  /** Exibe sempre dd/mm/aaaa quando possível. */
  function toDisplayBr(value) {
    var db = getDateBr();
    if (db && typeof db.toDisplayBr === "function") {
      return str(db.toDisplayBr(value));
    }
    var raw = str(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      var p = raw.slice(0, 10).split("-");
      if (p.length === 3) {
        return p[2].padStart(2, "0") + "/" + p[1].padStart(2, "0") + "/" + p[0];
      }
    }
    return raw;
  }

  /**
   * PLANT-AC-18 — não criar/navegar dias futuros: clamp a hoje local.
   * @param {string} viewBr
   * @param {Date} [now]
   */
  function clampViewDateBr(viewBr, now) {
    var today = getTodayBr(now);
    var want = normalizeBrDateKey(viewBr) || str(viewBr);
    if (!want) return today;
    var db = getDateBr();
    var wantIso =
      db && typeof db.brToIso === "function" ? db.brToIso(want) : null;
    var todayIso =
      db && typeof db.brToIso === "function" ? db.brToIso(today) : null;
    if (wantIso && todayIso && wantIso > todayIso) return today;
    return want;
  }

  /**
   * DIH: header.dih (BR) → episode.startedAt (ISO) → "".
   * @returns {string} dd/mm/aaaa ou ""
   */
  function resolveInternacaoBr(header, activeEpisode) {
    if (header && typeof header === "object") {
      var fromDih = toDisplayBr(header.dih);
      if (fromDih && /^\d{2}\/\d{2}\/\d{4}$/.test(normalizeBrDateKey(fromDih) || fromDih)) {
        return normalizeBrDateKey(fromDih) || fromDih;
      }
      if (fromDih) return fromDih;
    }
    if (activeEpisode && typeof activeEpisode === "object") {
      var fromStart = toDisplayBr(activeEpisode.startedAt);
      if (fromStart) return normalizeBrDateKey(fromStart) || fromStart;
    }
    return "";
  }

  function parseFirstBrDate(data) {
    var order = getEntriesOrder();
    if (order && typeof order.parseFirstBrDate === "function") {
      return order.parseFirstBrDate(data);
    }
    var m = str(data).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    return m ? m[1] : str(data);
  }

  function normalizeBrDateKey(data) {
    var token = parseFirstBrDate(data);
    var db = getDateBr();
    if (db && typeof db.normalizeBrDateDisplay === "function") {
      return db.normalizeBrDateDisplay(token) || token;
    }
    return token;
  }

  function findEntryByBrDate(entries, brDate) {
    var want = normalizeBrDateKey(brDate);
    if (!want || !Array.isArray(entries)) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || typeof e !== "object") continue;
      if (normalizeBrDateKey(e.data) === want) return e;
    }
    return null;
  }

  function getTodayPassometroEntry(entries, opts) {
    opts = opts || {};
    var today = opts.todayBr || getTodayBr(opts.now);
    return findEntryByBrDate(entries, today);
  }

  function overlayFromEntry(entry, overlayKey) {
    if (!entry || typeof entry !== "object") return "";
    var custom = entry.custom;
    if (!custom || typeof custom !== "object") return "";
    return str(custom[overlayKey]);
  }

  /** Overlay não-vazio prevalece; senão sync só se allowLiveSync. */
  function pickOverlayOrSync(entry, overlayKey, syncValue, allowLiveSync) {
    var ov = overlayFromEntry(entry, overlayKey);
    if (ov) return ov;
    if (allowLiveSync === false) return "";
    return str(syncValue);
  }

  function entryHasDayContent(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (str(entry.cd) || str(entry.pendencias)) return true;
    for (var i = 0; i < PLANTAO_OVERLAY_KEYS.length; i++) {
      if (overlayFromEntry(entry, PLANTAO_OVERLAY_KEYS[i])) return true;
    }
    return false;
  }

  /**
   * PLANT-AC-11/12/16 — patch na entry de hoje (CD/pendências + overlays).
   * Não altera header sync, exams nem controles.
   */
  function patchPlantaoTodayFields(snap, fields, opts) {
    fields = fields || {};
    opts = opts || {};
    if (!snap || typeof snap !== "object") return snap;

    var today = clampViewDateBr(
      opts.todayBr || getTodayBr(opts.now),
      opts.now,
    );
    var next = snap;
    var continuity = getContinuity();
    if (continuity && typeof continuity.ensureEntriesFromDihToToday === "function") {
      next = continuity.ensureEntriesFromDihToToday(next, {
        endDate: today,
        controles: opts.controles,
      });
    }

    var entries = Array.isArray(next.entries) ? next.entries.slice() : [];
    var idx = -1;
    var want = normalizeBrDateKey(today);
    for (var i = 0; i < entries.length; i++) {
      if (normalizeBrDateKey(entries[i] && entries[i].data) === want) {
        idx = i;
        break;
      }
    }

    var entry;
    if (idx < 0) {
      var schema = getSchema();
      entry =
        schema && typeof schema.emptyEntry === "function"
          ? schema.emptyEntry()
          : {
              id: "plantao-" + String(Date.now()),
              data: today,
              cd: "",
              pendencias: "",
              custom: {},
            };
      entry.data = today;
      if (!entry.custom || typeof entry.custom !== "object") entry.custom = {};
      entries.push(entry);
      idx = entries.length - 1;
    } else {
      entry = Object.assign({}, entries[idx]);
      entry.custom =
        entry.custom && typeof entry.custom === "object"
          ? Object.assign({}, entry.custom)
          : {};
    }

    if (fields.cd !== undefined) entry.cd = str(fields.cd);
    if (fields.pendencias !== undefined) entry.pendencias = str(fields.pendencias);

    var overlays = fields.overlays;
    if (overlays && typeof overlays === "object") {
      for (var oi = 0; oi < PLANTAO_OVERLAY_KEYS.length; oi++) {
        var ok = PLANTAO_OVERLAY_KEYS[oi];
        if (overlays[ok] !== undefined) {
          entry.custom[ok] = str(overlays[ok]);
        }
      }
    }

    entries[idx] = entry;
    return Object.assign({}, next, {
      entries: entries,
      atualizadoEm:
        typeof opts.atualizadoEm === "number" ? opts.atualizadoEm : Date.now(),
    });
  }

  function getCollection() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-collection.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroCollection) {
      return globalThis.AghuPassometroCollection;
    }
    return null;
  }

  function getAutofill() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-autofill.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroAutofill) {
      return globalThis.AghuPassometroAutofill;
    }
    return null;
  }

  function getAgeFromDob() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./age-from-dob.js");
      } catch (_e) {
        /* fall through */
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuAgeFromDob) {
      return globalThis.AghuAgeFromDob;
    }
    return null;
  }

  /**
   * Início da janela clínica a partir de periodo (espelha
   * parseControlesPeriodoSortMs em web/lib/patient-records/normalize.mjs).
   */
  function parseControlesPeriodoSortMs(periodo) {
    var p = str(periodo);
    if (!p) return null;

    var canon = p.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (canon) {
      return new Date(
        parseInt(canon[3], 10),
        parseInt(canon[2], 10) - 1,
        parseInt(canon[1], 10),
        parseInt(canon[4], 10),
        parseInt(canon[5], 10),
        0,
        0,
      ).getTime();
    }

    var m = p.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return null;
    var y = parseInt(m[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10), 0, 0, 0, 0).getTime();
  }

  /** Comparação clínica ascendente: período → fallback extractedAt. */
  function compareControlesEntriesClinicalAsc(a, b) {
    var wa = parseControlesPeriodoSortMs(a && a.periodo);
    var wb = parseControlesPeriodoSortMs(b && b.periodo);
    if (wa != null && wb != null && wa !== wb) return wa - wb;
    if (wa != null && wb == null) return -1;
    if (wa == null && wb != null) return 1;
    return ((a && a.extractedAt) || 0) - ((b && b.extractedAt) || 0);
  }

  /** Normalização mínima de controles (mais recente primeiro) — evita require dinâmico no bundle web. */
  function normalizeControlesLocal(raw) {
    if (!raw || typeof raw !== "object") return { entries: [] };
    var obj = raw;
    if (!Array.isArray(obj.entries)) {
      if (obj.texto != null || obj.periodo != null) {
        return {
          entries: [
            {
              id: "legacy",
              texto: String(obj.texto || ""),
              periodo: String(obj.periodo || ""),
              n: typeof obj.n === "number" ? obj.n : 0,
              extractedAt:
                typeof obj.extractedAt === "number" ? obj.extractedAt : 0,
              vitals: obj.vitals && typeof obj.vitals === "object" ? obj.vitals : null,
            },
          ],
        };
      }
      return { entries: [] };
    }
    var entries = obj.entries
      .filter(function (e) {
        return e && typeof e === "object";
      })
      .map(function (e) {
        return {
          id: String(e.id || ""),
          texto: String(e.texto || ""),
          periodo: String(e.periodo || ""),
          n: typeof e.n === "number" ? e.n : 0,
          extractedAt: typeof e.extractedAt === "number" ? e.extractedAt : 0,
          vitals: e.vitals && typeof e.vitals === "object" ? e.vitals : null,
        };
      });
    entries.sort(function (a, b) {
      return -compareControlesEntriesClinicalAsc(a, b);
    });
    return { entries: entries };
  }

  var VITAL_LABELS = [
    ["fc", "FC"],
    ["fr", "FR"],
    ["sato2", "SatO₂"],
    ["tax", "TAX"],
    ["pa", "PA"],
    ["hgt", "HGT"],
    ["diurese", "Diurese"],
    ["bh", "BH"],
    ["fezes", "Fezes"],
  ];

  /** Labels para vitais estruturados de controles (fcBpm etc.). */
  var STRUCTURED_VITAL_LABELS = [
    ["fcBpm", "FC"],
    ["frIrpm", "FR"],
    ["spo2Pct", "SatO₂"],
    ["tempC", "TAX"],
    ["hgtMgDl", "HGT"],
    ["diuresisMl", "Diurese"],
    ["balanceMl", "BH"],
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  /** PLANT-AC-02 */
  function formatCirurgiaPlantao(c) {
    if (!c || typeof c !== "object") return "";
    var parts = [];
    var data = str(c.data);
    var nome = str(c.nome);
    var achados = str(c.achadosOperatorios);
    if (data) parts.push(data);
    if (nome) parts.push(nome);
    if (achados) parts.push(achados);
    return parts.join(" — ");
  }

  function findActiveHospitalization(episodesSnap) {
    var collectionApi = getCollection();
    if (!collectionApi || !collectionApi.findActiveHospitalizationEpisode) {
      return null;
    }
    return collectionApi.findActiveHospitalizationEpisode(episodesSnap) || null;
  }

  /** PLANT-AC-01 */
  function hasActiveHospitalization(episodesSnap) {
    return Boolean(findActiveHospitalization(episodesSnap));
  }

  function formatDiagnosesLines(diagnoses) {
    if (!Array.isArray(diagnoses)) return [];
    var out = [];
    for (var i = 0; i < diagnoses.length; i++) {
      var d = diagnoses[i];
      if (!d || typeof d !== "object") continue;
      var texto = str(d.texto);
      if (!texto) continue;
      var data = str(d.data);
      out.push(data ? data + " — " + texto : texto);
    }
    return out;
  }

  function formatCirurgiasLines(cirurgias) {
    if (!Array.isArray(cirurgias)) return [];
    var out = [];
    for (var i = 0; i < cirurgias.length; i++) {
      var line = formatCirurgiaPlantao(cirurgias[i]);
      if (line) out.push(line);
    }
    return out;
  }

  function uniqueNonEmpty(parts) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = str(parts[i]);
      if (!t || seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    return out;
  }

  /** PLANT-AC-03 */
  function splitHdaHppFromSources(opts) {
    opts = opts || {};
    var episodes = opts.episodes;
    var collection = opts.collection;
    var activeEpisodeId = str(opts.activeEpisodeId);
    var entries =
      episodes && Array.isArray(episodes.entries) ? episodes.entries : [];
    var registros =
      collection && Array.isArray(collection.registros)
        ? collection.registros
        : [];

    var hdaParts = [];
    var hppParts = [];

    for (var ei = 0; ei < entries.length; ei++) {
      var ep = entries[ei];
      if (!ep || typeof ep !== "object" || ep.deletedAt) continue;
      var id = str(ep.id);
      var isActiveHosp =
        Boolean(id) &&
        id === activeEpisodeId &&
        ep.kind === "hospitalization" &&
        ep.status === "active";
      var dxLines = formatDiagnosesLines(ep.diagnoses);
      if (isActiveHosp) hdaParts = hdaParts.concat(dxLines);
      else if (ep.kind === "hospitalization") hppParts = hppParts.concat(dxLines);
    }

    var activeHdaHpp = "";
    for (var ri = 0; ri < registros.length; ri++) {
      var reg = registros[ri];
      if (!reg || typeof reg !== "object") continue;
      var epId = str(reg.patientEpisodeId);
      var header =
        reg.snap && typeof reg.snap === "object" && reg.snap.header
          ? reg.snap.header
          : null;
      if (!header) continue;
      var hDx = formatDiagnosesLines(header.diagnosticos);
      var legacyDx = str(header.diagnostico);
      if (!hDx.length && legacyDx) hDx.push(legacyDx);
      var cxLines = formatCirurgiasLines(header.cirurgias);
      if (epId && activeEpisodeId && epId === activeEpisodeId) {
        hdaParts = hdaParts.concat(hDx, cxLines);
        activeHdaHpp = str(header.hdaHpp);
      } else {
        hppParts = hppParts.concat(hDx, cxLines);
      }
    }

    if (activeHdaHpp) hppParts.push(activeHdaHpp);

    return {
      hda: uniqueNonEmpty(hdaParts).join("\n"),
      hpp: uniqueNonEmpty(hppParts).join("\n"),
    };
  }

  function formatEntryVitals(entry) {
    if (!entry || typeof entry !== "object") return "";
    var parts = [];
    for (var i = 0; i < VITAL_LABELS.length; i++) {
      var key = VITAL_LABELS[i][0];
      var label = VITAL_LABELS[i][1];
      var v = str(entry[key]);
      if (v) parts.push(label + " " + v);
    }
    return parts.join(" · ");
  }

  /** Vitais estruturados de controles (fcBpm etc.) → labels clínicos. */
  function formatControlesStructuredVitals(vitals) {
    if (!vitals || typeof vitals !== "object") return "";
    var parts = [];
    for (var i = 0; i < STRUCTURED_VITAL_LABELS.length; i++) {
      var key = STRUCTURED_VITAL_LABELS[i][0];
      var label = STRUCTURED_VITAL_LABELS[i][1];
      var raw = vitals[key];
      if (raw == null || raw === "") continue;
      if (typeof raw === "number" && !Number.isFinite(raw)) continue;
      parts.push(label + " " + String(raw));
    }
    var pas = vitals.pas;
    var pad = vitals.pad;
    if (
      pas != null &&
      Number.isFinite(pas) &&
      pad != null &&
      Number.isFinite(pad)
    ) {
      parts.push("PA " + pas + "x" + pad);
    } else if (pas != null && Number.isFinite(pas)) {
      parts.push("PA " + pas);
    } else if (str(vitals.pa)) {
      parts.push("PA " + str(vitals.pa));
    }
    // Fallback: chaves string estilo passômetro (fc, fr, …)
    if (!parts.length) return formatEntryVitals(vitals);
    return parts.join(" · ");
  }

  function formatControlesPlantaoBlock(controlesArchive) {
    var entries = normalizeControlesLocal(controlesArchive).entries || [];
    var latest = entries[0];
    if (!latest) return "";
    var lines = ["Controles:"];
    if (latest.periodo) lines.push(String(latest.periodo));
    var texto = str(latest.texto);
    if (texto) lines.push(texto);
    else if (latest.vitals && typeof latest.vitals === "object") {
      var vitalsLine = formatControlesStructuredVitals(latest.vitals);
      if (vitalsLine) lines.push(vitalsLine);
    }
    return lines.length > 1 ? lines.join("\n") : "";
  }

  /**
   * PLANT-AC-04 / AC-09 — EXAME FÍSICO = só último controle (período).
   * Ignora vitais stale da entry do passômetro.
   */
  function buildExameFisicoCell(_ignoredEntry, controlesArchive) {
    return formatControlesPlantaoBlock(controlesArchive);
  }

  function entryHasPlantaoContent(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (str(entry.cd) || str(entry.pendencias)) return true;
    return Boolean(formatEntryVitals(entry));
  }

  function getLatestPassometroEntry(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    var sorted = entries.slice();
    var autofill = getAutofill();
    if (autofill && typeof autofill.sortPassometroEntries === "function") {
      sorted = autofill.sortPassometroEntries(sorted);
    }
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (entryHasPlantaoContent(sorted[i])) return sorted[i];
    }
    return null;
  }

  function buildIdCell(pii, header) {
    var nome =
      pii && typeof pii === "object"
        ? str(pii.nomeCompleto || pii.primeiroNome) || "Paciente"
        : "Paciente";
    var idade = "";
    var ageMod = getAgeFromDob();
    if (ageMod && ageMod.resolveAgeYears) {
      var years = ageMod.resolveAgeYears({
        pii: pii,
        passometroHeader: header,
      });
      if (years != null) idade = String(years);
    }
    if (!idade && header) idade = str(header.idade);
    return idade ? nome + ", " + idade + "a" : nome;
  }

  function resolveActiveSnap(passometroRaw, episodesRaw, activeEpisodeId) {
    var collectionApi = getCollection();
    if (!collectionApi) return { collection: null, snap: null };
    try {
      var norm = collectionApi.normalizePassometroDomain(
        passometroRaw,
        episodesRaw,
      );
      var collection = norm && norm.collection ? norm.collection : null;
      if (!collection) return { collection: null, snap: null };
      if (!activeEpisodeId) return { collection: collection, snap: null };
      var snap =
        collectionApi.resolveSnapForEpisode(collection, activeEpisodeId) ||
        null;
      return { collection: collection, snap: snap };
    } catch (_e) {
      return { collection: null, snap: null };
    }
  }

  function buildPlantaoRow(sources) {
    sources = sources || {};
    var recordClientId = str(sources.recordClientId);
    var pii = sources.pii && typeof sources.pii === "object" ? sources.pii : null;
    var episodesRaw = sources.patient_episodes != null ? sources.patient_episodes : null;
    var passometroRaw = sources.passometro != null ? sources.passometro : null;
    var todayBr = clampViewDateBr(
      sources.todayBr || getTodayBr(sources.now),
      sources.now,
    );

    var active = findActiveHospitalization(episodesRaw);
    var activeEpisodeId = active ? str(active.id) : "";

    var resolved = resolveActiveSnap(
      passometroRaw,
      episodesRaw,
      activeEpisodeId,
    );
    var collection = resolved.collection;
    var snap = resolved.snap;

    var header =
      snap && snap.header && typeof snap.header === "object" ? snap.header : null;
    var entries = snap && Array.isArray(snap.entries) ? snap.entries : [];
    var todayEntry = getTodayPassometroEntry(entries, { todayBr: todayBr });
    var internacao = resolveInternacaoBr(header, active) || "—";
    var realToday = getTodayBr(sources.now);
    var allowLiveSync =
      normalizeBrDateKey(todayBr) === normalizeBrDateKey(realToday);

    var split = splitHdaHppFromSources({
      episodes:
        episodesRaw && typeof episodesRaw === "object" ? episodesRaw : null,
      collection: collection,
      activeEpisodeId: activeEpisodeId,
    });

    var prontuario = pii ? str(pii.prontuario) : "";
    var leito = pii ? str(pii.leito) : "";
    var autofill = getAutofill();
    // EXAMES sync: só archive cloud — nunca entry.exames
    var examesSync =
      allowLiveSync &&
      autofill &&
      typeof autofill.formatExamesResumo === "function"
        ? autofill.formatExamesResumo(sources.exams)
        : "";
    var exameFisicoSync = allowLiveSync
      ? buildExameFisicoCell(todayEntry, sources.controles)
      : "";

    var hda = pickOverlayOrSync(
      todayEntry,
      "plantao_hda",
      allowLiveSync ? split.hda : "",
      allowLiveSync,
    );
    var hpp = pickOverlayOrSync(
      todayEntry,
      "plantao_hpp",
      allowLiveSync ? split.hpp : "",
      allowLiveSync,
    );
    var subjetivo = pickOverlayOrSync(
      todayEntry,
      "plantao_subjetivo",
      "",
      allowLiveSync,
    );
    var exameFisico = pickOverlayOrSync(
      todayEntry,
      "plantao_exameFisico",
      exameFisicoSync,
      allowLiveSync,
    );
    var exames = pickOverlayOrSync(
      todayEntry,
      "plantao_exames",
      examesSync || "",
      allowLiveSync,
    );
    var conduta = todayEntry ? str(todayEntry.cd) : "";
    var pendencias = todayEntry ? str(todayEntry.pendencias) : "";
    // Continuity preenche entries vazias DIH→hoje; snapshot = conteúdo real do dia.
    var hasDaySnapshot =
      entryHasDayContent(todayEntry) ||
      Boolean(
        hda || hpp || subjetivo || exameFisico || exames || conduta || pendencias,
      );

    return {
      recordClientId: recordClientId,
      prontuario: prontuario || "—",
      leito: leito || "—",
      internacao: internacao,
      id: buildIdCell(pii, header),
      nomeSort:
        pii && typeof pii === "object"
          ? str(pii.nomeCompleto || pii.primeiroNome) || "Paciente"
          : "Paciente",
      leitoSort: leito || "\uffff",
      hda: hda,
      hpp: hpp,
      subjetivo: subjetivo,
      exameFisico: exameFisico,
      exames: exames,
      conduta: conduta,
      pendencias: pendencias,
      activeEpisodeId: activeEpisodeId || null,
      viewDateBr: todayBr,
      hasDaySnapshot: hasDaySnapshot,
    };
  }

  function sortPlantaoRows(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
      var leitoCmp = String(a.leitoSort || "").localeCompare(
        String(b.leitoSort || ""),
        "pt-BR",
        { sensitivity: "base", numeric: true },
      );
      if (leitoCmp !== 0) return leitoCmp;
      return String(a.nomeSort || "").localeCompare(
        String(b.nomeSort || ""),
        "pt-BR",
        { sensitivity: "base" },
      );
    });
  }

  function matchesPlantaoSearch(row, query) {
    var q = str(query).toLowerCase();
    if (!q) return true;
    return (
      String(row.nomeSort || "")
        .toLowerCase()
        .indexOf(q) !== -1 ||
      String(row.prontuario || "")
        .toLowerCase()
        .indexOf(q) !== -1 ||
      String(row.id || "")
        .toLowerCase()
        .indexOf(q) !== -1
    );
  }

  return {
    PLANTAO_OVERLAY_KEYS: PLANTAO_OVERLAY_KEYS,
    OVERLAY_TO_ROW: OVERLAY_TO_ROW,
    formatCirurgiaPlantao: formatCirurgiaPlantao,
    findActiveHospitalization: findActiveHospitalization,
    hasActiveHospitalization: hasActiveHospitalization,
    splitHdaHppFromSources: splitHdaHppFromSources,
    formatEntryVitals: formatEntryVitals,
    formatControlesPlantaoBlock: formatControlesPlantaoBlock,
    buildExameFisicoCell: buildExameFisicoCell,
    getLatestPassometroEntry: getLatestPassometroEntry,
    getTodayBr: getTodayBr,
    clampViewDateBr: clampViewDateBr,
    resolveInternacaoBr: resolveInternacaoBr,
    toDisplayBr: toDisplayBr,
    findEntryByBrDate: findEntryByBrDate,
    getTodayPassometroEntry: getTodayPassometroEntry,
    pickOverlayOrSync: pickOverlayOrSync,
    patchPlantaoTodayFields: patchPlantaoTodayFields,
    buildIdCell: buildIdCell,
    buildPlantaoRow: buildPlantaoRow,
    sortPlantaoRows: sortPlantaoRows,
    matchesPlantaoSearch: matchesPlantaoSearch,
  };
});
