/**
 * Normalização de prescrições (UMD) — espelho de web/lib/patient-records/normalize-prescripcoes.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  // Sempre espelhar no global — o bundle Edge (Deno) tem `module` mas não
  // `require`, e consumidores UMD (interop-merge) leem via globalThis.
  root.AghuPrescricoesNormalize = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-000000000000";
  }

  function strArray(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var s = String(raw[i] == null ? "" : raw[i]).trim();
      if (s) out.push(s);
    }
    return out;
  }

  function normalizeCategoriasMedicamento(raw) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var cleaned = strArray(raw[k]);
      if (cleaned.length) out[k] = cleaned;
    }
    return out;
  }

  function buildValidadeKey(entry) {
    var vi = String((entry && entry.validadeInicial) || "").trim();
    var vf = String((entry && entry.validadeFinal) || "").trim();
    if (vi || vf) return "v:" + vi + "|" + vf;
    return "d:" + String((entry && entry.data) || "").trim();
  }

  function normalizePrescricaoEntry(row) {
    if (!row || typeof row !== "object") return null;
    var id = String(row.id || "");
    return {
      id: UUID_RE.test(id) ? id : newId(),
      validadeInicial: String(row.validadeInicial || ""),
      validadeFinal: String(row.validadeFinal || ""),
      data: String(row.data || ""),
      dieta: String(row.dieta || ""),
      hidratacao: strArray(row.hidratacao),
      analgesia: strArray(row.analgesia),
      antibiotico: strArray(row.antibiotico),
      categoriasMedicamento: normalizeCategoriasMedicamento(row.categoriasMedicamento),
      texto: String(row.texto || ""),
      extractedAt:
        typeof row.extractedAt === "number"
          ? row.extractedAt
          : typeof row.atualizadoEm === "number"
            ? row.atualizadoEm
            : Date.now(),
    };
  }

  function isFlatLegacy(obj) {
    return (
      obj.dieta != null ||
      obj.hidratacao != null ||
      obj.analgesia != null ||
      obj.antibiotico != null ||
      obj.texto != null ||
      obj.data != null ||
      obj.validadeInicial != null ||
      obj.validadeFinal != null
    );
  }

  function normalizePrescricoesInput(snap) {
    if (!snap || typeof snap !== "object") {
      return { entries: [], atualizadoEm: null };
    }
    if (Array.isArray(snap.entries)) {
      var entries = [];
      for (var i = 0; i < snap.entries.length; i++) {
        var e = normalizePrescricaoEntry(snap.entries[i]);
        if (e) entries.push(e);
      }
      return {
        entries: entries,
        atualizadoEm: snap.atualizadoEm || null,
      };
    }
    if (isFlatLegacy(snap)) {
      var legacy = normalizePrescricaoEntry(snap);
      return {
        entries: legacy ? [legacy] : [],
        atualizadoEm: snap.atualizadoEm || null,
      };
    }
    return { entries: [], atualizadoEm: snap.atualizadoEm || null };
  }

  function getLatestPrescricaoEntry(archive) {
    var norm = normalizePrescricoesInput(archive);
    if (!norm.entries.length) return null;
    var sorted = norm.entries.slice().sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
    return sorted[0];
  }

  function prescricaoEntryToSnap(entry) {
    if (!entry) return null;
    return {
      data: entry.data,
      dieta: entry.dieta,
      hidratacao: entry.hidratacao.slice(),
      analgesia: entry.analgesia.slice(),
      antibiotico: entry.antibiotico.slice(),
      categoriasMedicamento: normalizeCategoriasMedicamento(entry.categoriasMedicamento),
      texto: entry.texto,
      validadeInicial: entry.validadeInicial,
      validadeFinal: entry.validadeFinal,
      atualizadoEm: entry.extractedAt,
    };
  }

  function getLatestPrescricaoSnap(archive) {
    return prescricaoEntryToSnap(getLatestPrescricaoEntry(archive));
  }

  /** Primeira data/hora DD/MM/YYYY[ HH:MM] encontrada na string; null se ausente/inválida. */
  function parseBrDateTime(s) {
    var str = String(s || "").trim();
    var m = str.match(/(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return null;
    var dd = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10) - 1;
    var yyyy = parseInt(m[3], 10);
    if (yyyy < 100) yyyy += 2000;
    var hh = m[4] ? parseInt(m[4], 10) : 0;
    var mi = m[5] ? parseInt(m[5], 10) : 0;
    var d = new Date(yyyy, mm, dd, hh, mi, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  }

  /** Entrada de prescrição cobre a data-alvo se validadeInicial <= alvo <= validadeFinal (granularidade de dia). */
  function prescricaoEntryCoversDate(entry, targetDate) {
    var vi = parseBrDateTime(entry && entry.validadeInicial) || parseBrDateTime(entry && entry.data);
    if (!vi) return false;
    var vf = parseBrDateTime(entry && entry.validadeFinal);
    var lo = dayStart(vi);
    var hi = vf ? dayStart(vf) : lo;
    var t = dayStart(targetDate);
    return t >= lo && t <= hi;
  }

  /**
   * Prescrição cuja janela de vigência (validadeInicial → validadeFinal) cobre targetDateBr.
   * Entre vários candidatos, prevalece o extraído mais recentemente.
   * @param {object} archive
   * @param {string} targetDateBr Data no formato DD/MM/YYYY (ou DD/MM/YY)
   */
  function getPrescricaoEntryForDate(archive, targetDateBr) {
    var target = parseBrDateTime(targetDateBr);
    if (!target) return null;
    var norm = normalizePrescricoesInput(archive);
    var matches = [];
    for (var i = 0; i < norm.entries.length; i++) {
      if (prescricaoEntryCoversDate(norm.entries[i], target)) matches.push(norm.entries[i]);
    }
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return (b.extractedAt || 0) - (a.extractedAt || 0);
    });
    return matches[0];
  }

  function getPrescricaoSnapForDate(archive, targetDateBr) {
    return prescricaoEntryToSnap(getPrescricaoEntryForDate(archive, targetDateBr));
  }

  return {
    buildValidadeKey: buildValidadeKey,
    normalizePrescricaoEntry: normalizePrescricaoEntry,
    normalizePrescricoesInput: normalizePrescricoesInput,
    getLatestPrescricaoEntry: getLatestPrescricaoEntry,
    getLatestPrescricaoSnap: getLatestPrescricaoSnap,
    getPrescricaoEntryForDate: getPrescricaoEntryForDate,
    getPrescricaoSnapForDate: getPrescricaoSnapForDate,
    prescricaoEntryToSnap: prescricaoEntryToSnap,
  };
});
