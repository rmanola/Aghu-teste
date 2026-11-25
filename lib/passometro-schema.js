/**
 * Schema partilhado do Passômetro (cabeçalho + entradas diárias).
 * Testável em Node via module.exports.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HEADER_KEYS = [
    "nome",
    "idade",
    "prontuario",
    "peso",
    "staff",
    "dih",
    "diagnostico",
    "dataCirurgia",
    "cirurgia",
    "hdaHpp",
  ];

  var VITAL_KEYS = [
    "fc",
    "fr",
    "sato2",
    "tax",
    "pa",
    "hgt",
    "diurese",
    "bh",
    "fezes",
    "drenos",
    "drenoTl",
    "drenoJp",
    "drenoPig",
    "vomitos",
  ];

  var ENTRY_KEYS = [
    "id",
    "data",
    "po",
    "atb",
    "dieta",
    "cd",
    "pendencias",
    "exames",
    "hv",
    "sng",
    "analgesia",
    "fc",
    "fr",
    "sato2",
    "pa",
    "diurese",
    "bh",
    "drenos",
    "drenoTl",
    "drenoJp",
    "drenoPig",
    "hgt",
    "vomitos",
    "tax",
    "fezes",
    "fistulas",
  ];

  var VITAL_TOUCH_KEYS = [
    "fc",
    "fr",
    "sato2",
    "tax",
    "pa",
    "hgt",
    "diurese",
    "bh",
    "fezes",
    "drenos",
    "drenoTl",
    "drenoJp",
    "drenoPig",
    "vomitos",
  ];

  function str(v) {
    return v == null ? "" : String(v);
  }

  function newEntryId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function emptyHeader() {
    var h = {};
    for (var i = 0; i < HEADER_KEYS.length; i++) {
      h[HEADER_KEYS[i]] = "";
    }
    h.cirurgias = [];
    h.diagnosticos = [];
    return h;
  }

  function formatCirurgiaLabel(cirurgia) {
    if (!cirurgia || typeof cirurgia !== "object") return "";
    var nome = str(cirurgia.nome).trim();
    var descricao = str(cirurgia.descricao).trim();
    if (nome && descricao) return nome + " — " + descricao;
    return nome || descricao;
  }

  function getFieldLimits() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-field-limits.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroFieldLimits
    ) {
      return globalThis.AghuPassometroFieldLimits;
    }
    return null;
  }

  function normalizeCirurgiaItem(src) {
    if (!src || typeof src !== "object") return null;
    var data = normalizeDateField(str(src.data));
    var id = str(src.id).trim();
    var nome = str(src.nome).trim();
    var descricao = str(src.descricao).trim();
    var equipe = str(src.equipe).trim();
    var achadosOperatorios = str(src.achadosOperatorios).trim();
    var hasPartial = !!(nome || descricao || equipe || achadosOperatorios);
    // Preserva rascunho com id ou conteúdo parcial mesmo sem data (UI autosave).
    // PO/HPB/espelho episódio já ignoram itens sem data válida.
    if (!data && !id && !hasPartial) return null;
    if (!id) id = newEntryId();
    if (!nome && descricao) {
      nome = descricao;
      descricao = "";
    }
    var out = {
      id: id,
      data: data,
      nome: nome,
      descricao: descricao,
      equipe: equipe,
      achadosOperatorios: achadosOperatorios,
      hpbSurgeryId: str(src.hpbSurgeryId).trim(),
    };
    if (src.listIndex != null && src.listIndex !== "") {
      var li = Number(src.listIndex);
      if (!isNaN(li) && li >= 0) out.listIndex = li;
    }
    if (Array.isArray(src.poNotas) && src.poNotas.length) {
      try {
        var poNotasApi = require("./passometro-cirurgia-po-notas.js");
        if (poNotasApi && poNotasApi.normalizePoNotas) {
          var notes = poNotasApi.normalizePoNotas(src.poNotas);
          if (notes.length) out.poNotas = notes;
        }
      } catch (_e) {
        /* optional dep */
      }
    }
    return out;
  }

  function sortCirurgiasByDate(list) {
    var order = getEntriesOrder();
    var parseMs =
      order && order.parseEntryDateMs
        ? order.parseEntryDateMs
        : function () {
            return 0;
          };
    return list.slice().sort(function (a, b) {
      var da = parseMs(a.data);
      var db = parseMs(b.data);
      if (da !== db) return da - db;
      return 0;
    });
  }

  /**
   * @param {object | null | undefined} header
   * @returns {{ id: string, data: string, nome: string, descricao: string, equipe: string, achadosOperatorios: string }[]}
   */
  function normalizeCirurgiasFromHeader(header) {
    if (!header || typeof header !== "object") return [];
    var list = [];
    if (Array.isArray(header.cirurgias)) {
      for (var i = 0; i < header.cirurgias.length; i++) {
        var item = normalizeCirurgiaItem(header.cirurgias[i]);
        if (item) list.push(item);
      }
    }
    if (!list.length) {
      var legacyData = normalizeDateField(str(header.dataCirurgia));
      if (legacyData) {
        list.push({
          id: newEntryId(),
          data: legacyData,
          nome: str(header.cirurgia),
          descricao: "",
          equipe: "",
          achadosOperatorios: "",
        });
      }
    }
    return sortCirurgiasByDate(list);
  }

  function mirrorLegacyCirurgiaFields(header, cirurgias) {
    if (cirurgias.length) {
      header.dataCirurgia = cirurgias[0].data;
      header.cirurgia = formatCirurgiaLabel(cirurgias[0]);
    } else {
      header.dataCirurgia = "";
      header.cirurgia = "";
    }
    header.cirurgias = cirurgias;
    return header;
  }

  function formatDiagnosticoLabel(item) {
    if (!item || typeof item !== "object") return "";
    return str(item.texto).trim();
  }

  function normalizeDiagnosticoItem(src) {
    if (!src || typeof src !== "object") return null;
    var texto = str(src.texto).trim();
    var id = str(src.id).trim();
    // Preserva rascunho com id mesmo sem texto (UI autosave).
    // Espelho episódio / PO já filtram por texto preenchido.
    if (!texto && !id) return null;
    if (!id) id = newEntryId();
    return {
      id: id,
      data: normalizeDateField(str(src.data)),
      texto: texto,
    };
  }

  /**
   * Fail-fast na escrita (UI/save): diagnóstico com texto exige data.
   * normalizeDiagnosticoItem permanece permissivo para legado undated (QUAL-AC-04).
   */
  function assertDiagnosticosHaveDates(list) {
    var rows = Array.isArray(list) ? list : [];
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i];
      if (!d) continue;
      if (str(d.texto).trim() && !normalizeDateField(str(d.data))) {
        throw new Error("diagnosis_date_required");
      }
    }
  }

  /**
   * Fail-fast na escrita: cirurgia com conteúdo exige data
   * (normalizeCirurgiaItem pode preservar rascunhos sem data — esta assert dá erro explícito).
   */
  function assertCirurgiasHaveDates(list) {
    var rows = Array.isArray(list) ? list : [];
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      if (!c || typeof c !== "object") continue;
      var hasContent =
        str(c.nome).trim() ||
        str(c.descricao).trim() ||
        str(c.equipe).trim() ||
        str(c.achadosOperatorios).trim() ||
        str(c.data).trim();
      if (!hasContent) continue;
      if (!normalizeDateField(str(c.data))) {
        throw new Error("surgery_date_required");
      }
    }
  }

  function sortDiagnosticosByDate(list) {
    var order = getEntriesOrder();
    var parseMs =
      order && order.parseEntryDateMs
        ? order.parseEntryDateMs
        : function () {
            return 0;
          };
    return list.slice().sort(function (a, b) {
      var da = a.data ? parseMs(a.data) : 0;
      var db = b.data ? parseMs(b.data) : 0;
      if (da !== db) return da - db;
      return 0;
    });
  }

  /**
   * @param {object | null | undefined} header
   * @returns {{ id: string, data: string, texto: string }[]}
   */
  function normalizeDiagnosticosFromHeader(header) {
    if (!header || typeof header !== "object") return [];
    var list = [];
    if (Array.isArray(header.diagnosticos)) {
      for (var i = 0; i < header.diagnosticos.length; i++) {
        var item = normalizeDiagnosticoItem(header.diagnosticos[i]);
        if (item) list.push(item);
      }
    }
    if (!list.length) {
      var legacyText = str(header.diagnostico).trim();
      if (legacyText) {
        list.push({
          id: newEntryId(),
          data: "",
          texto: legacyText,
        });
      }
    }
    return sortDiagnosticosByDate(list);
  }

  function mirrorLegacyDiagnosticoFields(header, diagnosticos) {
    if (diagnosticos.length) {
      header.diagnostico = formatDiagnosticoLabel(diagnosticos[0]);
    } else {
      header.diagnostico = "";
    }
    header.diagnosticos = diagnosticos;
    return header;
  }

  function formatDiagnosticosDisplay(header) {
    return normalizeDiagnosticosFromHeader(header)
      .map(function (d) {
        var line = str(d.data).trim();
        var texto = str(d.texto).trim();
        return line && texto ? line + " — " + texto : texto || line;
      })
      .filter(Boolean)
      .join("\n");
  }

  function emptyEntry(id) {
    var e = { id: id || newEntryId() };
    for (var i = 1; i < ENTRY_KEYS.length; i++) {
      e[ENTRY_KEYS[i]] = "";
    }
    return e;
  }

  function emptySnap() {
    return {
      header: emptyHeader(),
      entries: [],
      atualizadoEm: null,
    };
  }

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuDateBr) {
      return globalThis.AghuDateBr;
    }
    return null;
  }

  function normalizeDateField(value) {
    var s = str(value).trim();
    if (!s) return "";
    var db = getDateBr();
    if (db && db.normalizeBrDateDisplay) return db.normalizeBrDateDisplay(s);
    return s;
  }

  /** custom_* (template) + plantao_* (overlay plantão FEAT-114). */
  function isAllowedCustomBagKey(k) {
    var key = str(k);
    return key.indexOf("custom_") === 0 || key.indexOf("plantao_") === 0;
  }

  function normalizeCustomBag(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!isAllowedCustomBagKey(k)) continue;
      out[k] = str(src[k]);
    }
    return out;
  }

  function normalizeHeader(src) {
    var out = emptyHeader();
    if (!src || typeof src !== "object") return out;
    for (var i = 0; i < HEADER_KEYS.length; i++) {
      var k = HEADER_KEYS[i];
      var v = str(src[k]);
      out[k] = k === "dih" || k === "dataCirurgia" ? normalizeDateField(v) : v;
    }
    out.custom = normalizeCustomBag(src.custom);
    out = mirrorLegacyDiagnosticoFields(out, normalizeDiagnosticosFromHeader(src));
    out = mirrorLegacyCirurgiaFields(out, normalizeCirurgiasFromHeader(src));
    var lim = getFieldLimits();
    if (lim && typeof lim.clampHeaderNarrative === "function") {
      out = lim.clampHeaderNarrative(out, null, null);
    }
    return out;
  }

  function legacyPaFromPasPad(src) {
    var pas = str(src.pas).trim();
    var pad = str(src.pad).trim();
    if (!pas && !pad) return "";
    return pad ? pas + "/" + pad : pas;
  }

  function normalizeVitalsTouched(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    for (var i = 0; i < VITAL_TOUCH_KEYS.length; i++) {
      var k = VITAL_TOUCH_KEYS[i];
      if (src[k] === true) out[k] = true;
    }
    return out;
  }

  function normalizeEntry(src) {
    if (!src || typeof src !== "object") return emptyEntry();
    var out = emptyEntry(str(src.id) || newEntryId());
    var pa = str(src.pa).trim() || legacyPaFromPasPad(src);
    for (var i = 1; i < ENTRY_KEYS.length; i++) {
      var k = ENTRY_KEYS[i];
      var v = str(src[k]);
      if (k === "pa") out[k] = pa;
      else if (k === "data") out[k] = normalizeDateField(v);
      else out[k] = v;
    }
    out.custom = normalizeCustomBag(src.custom);
    var touched = normalizeVitalsTouched(src.vitalsTouched);
    if (Object.keys(touched).length) out.vitalsTouched = touched;
    return out;
  }

  function normalizeLayout(raw) {
    if (!raw || typeof raw !== "object") return null;
    try {
      var tpl = getTemplateModule();
      if (tpl && tpl.sanitizeTemplate) return tpl.sanitizeTemplate(raw);
    } catch (_e) {
      /* ignore invalid layout */
    }
    return null;
  }

  function getTemplateModule() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-template.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroTemplate) {
      return globalThis.AghuPassometroTemplate;
    }
    return null;
  }

  function getEntriesOrder() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-order.js");
      } catch (_e) {
        return null;
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

  function sortEntriesChronological(entries) {
    var order = getEntriesOrder();
    if (order && order.sortPassometroEntries) {
      return order.sortPassometroEntries(entries);
    }
    return entries;
  }

  function getPoModule() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-po.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroPo) {
      return globalThis.AghuPassometroPo;
    }
    return null;
  }

  function getContinuityModule() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-entries-continuity.js");
      } catch (_e) {
        return null;
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

  function applyPoToSnap(snap) {
    var po = getPoModule();
    if (po && po.applyPoToSnap) return po.applyPoToSnap(snap);
    return snap;
  }

  /**
   * @param {object | null | undefined} snap
   * @returns {{ header: object, entries: object[], atualizadoEm: number | null }}
   */
  function normalizeSnap(snap) {
    if (!snap || typeof snap !== "object") return emptySnap();
    var header = normalizeHeader(snap.header);
    var entries = Array.isArray(snap.entries)
      ? snap.entries.map(normalizeEntry)
      : [];
    var continuity = getContinuityModule();
    if (continuity && continuity.ensureEntriesFromDihToToday) {
      var ensured = continuity.ensureEntriesFromDihToToday({
        header: header,
        entries: entries,
        layout: snap.layout,
        atualizadoEm: snap.atualizadoEm,
      });
      entries = ensured.entries;
    }
    entries = sortEntriesChronological(entries);
    var atualizadoEm = snap.atualizadoEm;
    if (typeof atualizadoEm !== "number" || !Number.isFinite(atualizadoEm)) {
      atualizadoEm = null;
    }
    return applyPoToSnap({
      header: header,
      entries: entries,
      atualizadoEm: atualizadoEm,
      layout: normalizeLayout(snap.layout),
    });
  }

  return {
    HEADER_KEYS: HEADER_KEYS,
    ENTRY_KEYS: ENTRY_KEYS,
    VITAL_KEYS: VITAL_KEYS,
    VITAL_TOUCH_KEYS: VITAL_TOUCH_KEYS,
    emptyHeader: emptyHeader,
    emptyEntry: emptyEntry,
    emptySnap: emptySnap,
    normalizeHeader: normalizeHeader,
    normalizeEntry: normalizeEntry,
    normalizeSnap: normalizeSnap,
    newEntryId: newEntryId,
    normalizeCustomBag: normalizeCustomBag,
    normalizeCirurgiasFromHeader: normalizeCirurgiasFromHeader,
    normalizeCirurgiaItem: normalizeCirurgiaItem,
    normalizeDiagnosticosFromHeader: normalizeDiagnosticosFromHeader,
    normalizeDiagnosticoItem: normalizeDiagnosticoItem,
    assertDiagnosticosHaveDates: assertDiagnosticosHaveDates,
    assertCirurgiasHaveDates: assertCirurgiasHaveDates,
    formatDiagnosticosDisplay: formatDiagnosticosDisplay,
  };
});
