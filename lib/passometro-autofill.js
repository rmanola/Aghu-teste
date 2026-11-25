/**
 * Preenchimento automático do passômetro a partir de controles, prescrições, exames e PII.
 * Testável em Node via module.exports; extensão: global AghuPassometroAutofill.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroAutofill = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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
    throw new Error("AghuPassometroSchema não disponível");
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

  function getBhPassometroMap() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./controles-bh-passometro-map.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuControlesBhPassometroMap
    ) {
      return globalThis.AghuControlesBhPassometroMap;
    }
    return null;
  }

  function appendCampoEliminacao(out, campo, valor) {
    if (!campo || !valor) return;
    var v = String(valor).trim();
    if (!v) return;
    var prev = out[campo] ? String(out[campo]).trim() : "";
    out[campo] = prev ? prev + "; " + v : v;
  }

  /**
   * Classifica segmento avulso AGHU (ex. PENROSE_E 280 mL) → campo canônico do passômetro.
   * @returns {boolean} true se consumiu o segmento
   */
  function tryParseEliminacaoAvulsa(seg, out) {
    var mapApi = getBhPassometroMap();
    if (!mapApi || typeof mapApi.campoPassometroParaEliminacao !== "function") {
      return false;
    }

    var mlMatch = seg.match(/^(.+?)\s+([\d.,]+)\s*mL$/i);
    var label;
    var ml;
    var texto;
    if (mlMatch) {
      label = mlMatch[1].trim();
      var mlRaw = mlMatch[2].replace(/\./g, "").replace(",", ".");
      ml = Number(mlRaw);
      if (!Number.isFinite(ml)) ml = null;
      texto = null;
    } else {
      var spaceIdx = seg.search(/\s/);
      if (spaceIdx <= 0) {
        label = seg;
        texto = null;
        ml = null;
      } else {
        label = seg.slice(0, spaceIdx).trim();
        texto = seg.slice(spaceIdx + 1).trim() || null;
        ml = null;
      }
    }
    if (!label) return false;

    var campo = mapApi.campoPassometroParaEliminacao({
      label: label,
      title: "",
      ml: ml,
      texto: texto,
    });
    if (!campo) return false;

    appendCampoEliminacao(out, campo, seg);
    return true;
  }

  function compareControlEntryDates(a, b) {
    var order = getEntriesOrder();
    var parseMs =
      order && order.parseEntryDateMs
        ? order.parseEntryDateMs
        : function (d) {
            return parsePeriodoDate(d) ? 0 : Infinity;
          };
    var da = parseMs(parsePeriodoDate(a.periodo) || str(a.periodo));
    var db = parseMs(parsePeriodoDate(b.periodo) || str(b.periodo));
    if (da !== db) return da - db;
    return (a.extractedAt || 0) - (b.extractedAt || 0);
  }

  function getExtractResponseApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./controles-extract-response.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuControlesExtractResponse
    ) {
      return globalThis.AghuControlesExtractResponse;
    }
    return null;
  }

  function controlesEntryHasVitals(vitals) {
    if (!vitals || typeof vitals !== "object") return false;
    var keys = [
      "fr",
      "sato2",
      "tax",
      "pa",
      "pam",
      "fc",
      "hgt",
      "diurese",
      "bh",
      "fezes",
      "fistulas",
      "vomitos",
      "sng",
      "drenos",
      "drenoJp",
      "drenoTl",
      "drenoPig",
      "noradren",
      "uf",
      "peso",
      "pesoPre",
      "pesoPos",
    ];
    for (var i = 0; i < keys.length; i++) {
      if (str(vitals[keys[i]]).trim()) return true;
    }
    return false;
  }

  function isUsableControlesEntry(ce) {
    if (!ce || typeof ce !== "object") return false;
    var texto = ce.texto || "";
    var extractApi = getExtractResponseApi();
    if (extractApi && extractApi.isControlesTextoPlaceholder(texto)) return false;
    return controlesEntryHasVitals(parseControlesTexto(texto));
  }

  function getVitalsParse() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-vitals-parse.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroVitalsParse
    ) {
      return globalThis.AghuPassometroVitalsParse;
    }
    return null;
  }

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

  var THERAPEUTIC_KEYS = ["atb", "dieta", "hv", "sng", "analgesia", "fistulas"];

  function str(v) {
    return v == null ? "" : String(v);
  }

  function formatEntryPa(paRaw) {
    var vitalsParse = getVitalsParse();
    if (vitalsParse && vitalsParse.formatPaInterval) {
      return vitalsParse.formatPaInterval(paRaw);
    }
    return str(paRaw).trim();
  }

  /**
   * @param {string} texto Saída agregada de formatarSaida (segmentos separados por " | ")
   * @returns {Record<string, string>}
   */
  function parseControlesTexto(texto) {
    var out = {
      fr: "",
      sato2: "",
      tax: "",
      pa: "",
      pam: "",
      fc: "",
      hgt: "",
      diurese: "",
      bh: "",
      fezes: "",
      fistulas: "",
      vomitos: "",
      sng: "",
      drenos: "",
      drenoJp: "",
      drenoTl: "",
      drenoPig: "",
      peso: "",
      noradren: "",
      uf: "",
      pesoPre: "",
      pesoPos: "",
    };
    if (!texto || typeof texto !== "string") return out;

    var segments = texto.split(" | ");
    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si].trim();
      if (!seg) continue;

      var m;

      m = seg.match(/^FR\s+([\d]+(?:-[\d]+)?)\s*irpm/i);
      if (m) {
        out.fr = m[1];
        continue;
      }

      m = seg.match(/^SpO₂\s+([\d]+(?:-[\d]+)?)%/);
      if (m) {
        out.sato2 = m[1];
        continue;
      }

      m = seg.match(/^TAX\s+([\d,]+(?:-[\d,]+)?)\s*ºC/);
      if (m) {
        out.tax = m[1];
        continue;
      }

      m = seg.match(/^PA\s+(.+?)\s*mmHg$/i);
      if (m) {
        out.pa = m[1].trim();
        continue;
      }

      m = seg.match(/^PAM\s+([\d]+(?:-[\d]+)?)\s*mmHg/i);
      if (m) {
        out.pam = m[1];
        continue;
      }

      m = seg.match(/^FC\s+([\d]+(?:-[\d]+)?)\s*bpm/i);
      if (m) {
        out.fc = m[1];
        continue;
      }

      m = seg.match(/^Peso\s+([\d]+(?:-[\d]+)?)\s*>\s*([\d]+(?:-[\d]+)?)\s*kg/i);
      if (m) {
        out.pesoPre = m[1];
        out.pesoPos = m[2];
        out.peso = m[1] + " > " + m[2] + " kg";
        continue;
      }

      m = seg.match(/^Peso\s+pr[eé]\s+([\d]+(?:-[\d]+)?)\s*>\s*p[oó]s\s+([\d]+(?:-[\d]+)?)\s*kg/i);
      if (m) {
        out.pesoPre = m[1];
        out.pesoPos = m[2];
        out.peso = "pré " + m[1] + " > pós " + m[2] + " kg";
        continue;
      }

      m = seg.match(/^Peso\s+pr[eé]\s+([\d]+(?:-[\d]+)?)\s*kg/i);
      if (m) {
        out.pesoPre = m[1];
        out.peso = m[1] + " kg (pré)";
        continue;
      }

      m = seg.match(/^Peso\s+p[oó]s\s+([\d]+(?:-[\d]+)?)\s*kg/i);
      if (m) {
        out.pesoPos = m[1];
        out.peso = m[1] + " kg (pós)";
        continue;
      }

      m = seg.match(/^NORA\s+([\d.,]+)\s*->\s*([\d.,]+)\s*mL\/h/i);
      if (m) {
        out.noradren = m[1] + "-" + m[2];
        continue;
      }

      m = seg.match(/^NORA\s+([\d.,]+)\s*mL\/h/i);
      if (m) {
        out.noradren = m[1];
        continue;
      }

      m = seg.match(/^UF\s+([\d.,]+(?:-[\d.,]+)?)\s*mL/i);
      if (m) {
        out.uf = m[1].replace(/\./g, "");
        continue;
      }

      m = seg.match(/^HGT\s+(.+)$/i);
      if (m) {
        out.hgt = m[1].trim();
        continue;
      }

      m = seg.match(/^DU\s+presente$/i);
      if (m) {
        out.diurese = "presente";
        continue;
      }

      m = seg.match(/^DU\s+([\d.,]+)\s*mL/i);
      if (m) {
        out.diurese = m[1].replace(/\./g, "");
        continue;
      }

      m = seg.match(/^BH\s+([+-]?[\d.,]+)\s*mL/i);
      if (m) {
        out.bh = m[1];
        continue;
      }

      m = seg.match(/^Fezes\s+(.+)$/i);
      if (m) {
        out.fezes = m[1].trim();
        continue;
      }

      m = seg.match(/^F[ií]stulas\s+(.+)$/i);
      if (m) {
        out.fistulas = m[1].trim();
        continue;
      }

      m = seg.match(/^V[oô]mitos\s+(.+)$/i);
      if (m) {
        out.vomitos = m[1].trim();
        continue;
      }

      m = seg.match(/^SNG\s+(.+)$/i);
      if (m) {
        out.sng = m[1].trim();
        continue;
      }

      m = seg.match(/^Dreno\s+JP\s+(.+)$/i);
      if (m) {
        out.drenoJp = m[1].trim();
        continue;
      }

      m = seg.match(/^Dreno\s+TL\s+(.+)$/i);
      if (m) {
        out.drenoTl = m[1].trim();
        continue;
      }

      m = seg.match(/^Dreno\s+PIG\s+(.+)$/i);
      if (m) {
        out.drenoPig = m[1].trim();
        continue;
      }

      m = seg.match(/^Drenos\s+(.+)$/i);
      if (m) {
        out.drenos = m[1].trim();
        continue;
      }

      m = seg.match(/^Evacuações\s+(presente|ausente)/i);
      if (m) {
        out.fezes = m[1].toLowerCase();
        continue;
      }

      // Rótulos AGHU avulsos (copy sem prefixo Fezes/Dreno JP/…) → campos canônicos
      tryParseEliminacaoAvulsa(seg, out);
    }

    return out;
  }

  /**
   * @param {object | null | undefined} examsRaw
   * @param {{ max?: number, lineMax?: number } | undefined} opts
   * @returns {string}
   */
  function formatExamesResumo(examsRaw, opts) {
    var max = (opts && opts.max) || 5;
    var lineMax = (opts && opts.lineMax) || 140;
    if (!examsRaw) return "";

    var byKey =
      examsRaw.examsByKey && typeof examsRaw.examsByKey === "object"
        ? examsRaw.examsByKey
        : typeof examsRaw === "object"
          ? examsRaw
          : null;
    if (!byKey) return "";

    var dateBr = null;
    try {
      dateBr = require("./date-br.js");
    } catch (_e) {
      dateBr =
        typeof globalThis !== "undefined" ? globalThis.AghuDateBr : null;
    }

    function examDateLabel(ex) {
      if (!ex || typeof ex !== "object") return "";
      var iso = ex.dataColetaISO ? String(ex.dataColetaISO).trim() : "";
      if (iso && dateBr && typeof dateBr.isoToBr === "function") {
        var br = dateBr.isoToBr(iso.slice(0, 10));
        if (br && /^\d{2}\/\d{2}\/\d{4}$/.test(br)) return br;
      }
      if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
        var p = iso.slice(0, 10).split("-");
        if (p.length === 3) {
          return (
            p[2].padStart(2, "0") +
            "/" +
            p[1].padStart(2, "0") +
            "/" +
            p[0]
          );
        }
      }
      var raw = ex.dataColeta || ex.data || "";
      if (dateBr && typeof dateBr.toDisplayBr === "function") {
        var disp = dateBr.toDisplayBr(raw);
        if (disp && /^\d{2}\/\d{2}\/\d{4}$/.test(String(disp).trim())) {
          return String(disp).trim();
        }
      }
      return "";
    }

    var list = [];
    for (var k in byKey) {
      if (Object.prototype.hasOwnProperty.call(byKey, k) && byKey[k]) {
        list.push(byKey[k]);
      }
    }
    list.sort(function (a, b) {
      return String(b.dataColetaISO || "").localeCompare(
        String(a.dataColetaISO || ""),
      );
    });

    var lines = [];
    for (var i = 0; i < list.length && i < max; i++) {
      var ex = list[i];
      var name = ex.examName || ex.solicitation || "Exame";
      var body = ex.fetchedResult || ex.result || "";
      var line = (name + ": " + body).trim();
      if (line.charAt(line.length - 1) === ":") line = name;
      var when = examDateLabel(ex);
      if (when) line = when + " · " + line;
      if (line.length > lineMax) line = line.slice(0, lineMax - 1) + "…";
      lines.push(line);
    }
    return lines.join("\n");
  }

  function dateFromExtractedAt(ts) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
    var d = new Date(ts);
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  }

  function todayLocal() {
    return dateFromExtractedAt(Date.now());
  }

  function expandYear(yy) {
    var n = parseInt(yy, 10);
    if (!Number.isFinite(n)) return yy;
    return n >= 100 ? String(n) : String(2000 + n);
  }

  /** Primeira data DD/MM/YYYY em periodo AGHU (ex.: "09/06/26 06:00 → 08/06/26 10:30"). */
  function parsePeriodoDate(periodo) {
    var p = str(periodo).trim();
    if (!p) return "";
    var m = p.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + expandYear(m[3]);
  }

  /** Chave estável para comparar datas de entrada (ignora hora). */
  function normalizeEntryDateKey(data) {
    var parsed = parsePeriodoDate(data) || str(data).trim();
    return parsed;
  }

  function getPrescricoesNormApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./prescricoes-normalize.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPrescricoesNormalize
    ) {
      return globalThis.AghuPrescricoesNormalize;
    }
    return null;
  }

  function extractPrescricaoFields(rx) {
    if (!rx || typeof rx !== "object") {
      return {
        hasAny: false,
        data: "",
        dieta: "",
        hv: "",
        analgesia: "",
        atb: "",
      };
    }
    var norm = getPrescricoesNormApi();
    var snap =
      norm && norm.getLatestPrescricaoSnap
        ? norm.getLatestPrescricaoSnap(rx)
        : rx;
    if (!snap) {
      return {
        hasAny: false,
        data: "",
        dieta: "",
        hv: "",
        analgesia: "",
        atb: "",
      };
    }
    var hv = Array.isArray(snap.hidratacao)
      ? snap.hidratacao.filter(Boolean).join("; ")
      : "";
    var analgesia = Array.isArray(snap.analgesia)
      ? snap.analgesia.filter(Boolean).join("; ")
      : "";
    var atb = Array.isArray(snap.antibiotico)
      ? snap.antibiotico.filter(Boolean).join("; ")
      : "";
    var dieta = str(snap.dieta);
    var data = str(snap.data);
    var hasAny = !!(dieta || hv || analgesia || atb || data);
    return { hasAny: hasAny, data: data, dieta: dieta, hv: hv, analgesia: analgesia, atb: atb };
  }

  function extractPrescricaoFieldsForDate(rx, dateKey) {
    var empty = {
      hasAny: false,
      data: "",
      dieta: "",
      hv: "",
      analgesia: "",
      atb: "",
    };
    if (!rx || typeof rx !== "object" || !dateKey) return empty;
    var norm = getPrescricoesNormApi();
    if (!norm || !norm.getPrescricaoSnapForDate) return empty;
    var snap = norm.getPrescricaoSnapForDate(rx, dateKey);
    if (!snap) return empty;
    var hv = Array.isArray(snap.hidratacao)
      ? snap.hidratacao.filter(Boolean).join("; ")
      : "";
    var analgesia = Array.isArray(snap.analgesia)
      ? snap.analgesia.filter(Boolean).join("; ")
      : "";
    var atb = Array.isArray(snap.antibiotico)
      ? snap.antibiotico.filter(Boolean).join("; ")
      : "";
    var dieta = str(snap.dieta);
    var data = str(snap.data);
    var hasAny = !!(dieta || hv || analgesia || atb || data);
    return { hasAny: hasAny, data: data, dieta: dieta, hv: hv, analgesia: analgesia, atb: atb };
  }

  function applyPrescricaoToEntry(entry, rx, opts) {
    opts = opts || {};
    if (rx.dieta) entry.dieta = rx.dieta;
    if (rx.atb) entry.atb = rx.atb;
    if (rx.hv) entry.hv = rx.hv;
    if (rx.analgesia) entry.analgesia = rx.analgesia;
    if (opts.setData && rx.data) {
      entry.data = parsePeriodoDate(rx.data) || str(rx.data).trim();
    }
  }

  function countEntryVitalsFilled(entry) {
    var n = 0;
    for (var vi = 0; vi < VITAL_KEYS.length; vi++) {
      if (str(entry[VITAL_KEYS[vi]]).trim()) n++;
    }
    return n;
  }

  function resolvePrescricaoTargetEntry(entries, rxFields) {
    if (!entries.length) return null;
    var targetBr = parsePeriodoDate(rxFields.data);
    if (targetBr) {
      for (var ti = 0; ti < entries.length; ti++) {
        if (normalizeEntryDateKey(entries[ti].data) === targetBr) return entries[ti];
      }
    }
    return entries[entries.length - 1];
  }

  function prontuarioApi() {
    if (typeof globalThis !== "undefined" && globalThis.AghuPiiProntuarioResolve) {
      return globalThis.AghuPiiProntuarioResolve;
    }
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./pii-prontuario-resolve.js");
      } catch (_e) {
        /* fall through */
      }
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

  function idadeFromPiiSource(pii) {
    if (!pii || typeof pii !== "object") return "";
    var ageMod = getAgeFromDob();
    if (!ageMod || !ageMod.resolveAgeYears) return "";
    var years = ageMod.resolveAgeYears({ pii: pii });
    return years != null ? String(years) : "";
  }

  function normalizePii(pii, recordClientId) {
    if (!pii || typeof pii !== "object") return null;
    var api = prontuarioApi();
    var pront =
      api && api.resolveCanonicalProntuario
        ? api.resolveCanonicalProntuario(pii, recordClientId || "")
        : str(pii.prontuario || "");
    return {
      nomeCompleto: str(pii.nomeCompleto || pii.primeiroNome || ""),
      prontuario: pront,
    };
  }

  /**
   * @param {{ pii?: object, controles?: object, prescricoes?: object, exams?: object }} sources
   */
  function buildPassometroFromSources(sources) {
    var schema = getSchema();
    sources = sources || {};

    var header = schema.emptyHeader();
    var piiRaw = sources.pii;
    var recordClientId =
      sources.recordClientId != null ? String(sources.recordClientId) : "";
    var pii = normalizePii(piiRaw, recordClientId);
    if (pii) {
      header.nome = pii.nomeCompleto;
      header.prontuario = pii.prontuario;
    }
    var idadeStr = idadeFromPiiSource(piiRaw);
    if (idadeStr) header.idade = idadeStr;

    var entries = [];
    var controlEntries = [];
    if (sources.controles && Array.isArray(sources.controles.entries)) {
      controlEntries = sources.controles.entries.slice().sort(compareControlEntryDates);
    }

    for (var ci = 0; ci < controlEntries.length; ci++) {
      var ce = controlEntries[ci];
      if (!isUsableControlesEntry(ce)) continue;
      var entry = schema.emptyEntry();
      entry.data =
        parsePeriodoDate(ce.periodo) ||
        dateFromExtractedAt(ce.extractedAt) ||
        "";
      var vitals = parseControlesTexto(ce.texto || "");
      for (var vk in vitals) {
        if (vk === "peso") continue;
        if (Object.prototype.hasOwnProperty.call(vitals, vk) && vitals[vk]) {
          entry[vk] = vk === "pa" ? formatEntryPa(vitals[vk]) : vitals[vk];
        }
      }
      if (vitals.peso) header.peso = vitals.peso;
      entries.push(entry);
    }

    if (entries.length > 0) {
      for (var rei = 0; rei < entries.length; rei++) {
        var entryDateKey = normalizeEntryDateKey(entries[rei].data);
        if (!entryDateKey) continue;
        var rxFieldsForDay = extractPrescricaoFieldsForDate(sources.prescricoes, entryDateKey);
        if (rxFieldsForDay.hasAny) applyPrescricaoToEntry(entries[rei], rxFieldsForDay);
      }
    } else {
      var rxFieldsLatest = extractPrescricaoFields(sources.prescricoes);
      if (rxFieldsLatest.hasAny) {
        var solo = schema.emptyEntry();
        solo.data = parsePeriodoDate(rxFieldsLatest.data) || todayLocal();
        applyPrescricaoToEntry(solo, rxFieldsLatest, { setData: true });
        entries.push(solo);
      }
    }

    return schema.normalizeSnap({
      header: header,
      entries: entries,
      atualizadoEm: null,
    });
  }

  function headerHasContent(header) {
    if (!header || typeof header !== "object") return false;
    var keys = [
      "nome",
      "idade",
      "staff",
      "prontuario",
      "dih",
      "diagnostico",
      "dataCirurgia",
      "peso",
      "cirurgia",
      "hdaHpp",
    ];
    for (var hi = 0; hi < keys.length; hi++) {
      if (str(header[keys[hi]]).trim()) return true;
    }
    if (Array.isArray(header.cirurgias) && header.cirurgias.length > 0) return true;
    if (Array.isArray(header.diagnosticos) && header.diagnosticos.length > 0) return true;
    if (header.custom && typeof header.custom === "object") {
      var hck = Object.keys(header.custom);
      for (var hcj = 0; hcj < hck.length; hcj++) {
        if (str(header.custom[hck[hcj]]).trim()) return true;
      }
    }
    return false;
  }

  /**
   * @param {object | null | undefined} snap
   */
  function isPassometroEmpty(snap) {
    var norm = getSchema().normalizeSnap(snap);
    if (norm.entries.length > 0) return false;
    return !headerHasContent(norm.header);
  }

  /**
   * Autofill de passômetro só a partir de controles utilizáveis (não RX isolada).
   * @param {{ controles?: object }} sources
   */
  function hasControlesAutofillSources(sources) {
    if (!sources || !sources.controles || !Array.isArray(sources.controles.entries)) {
      return false;
    }
    for (var ci = 0; ci < sources.controles.entries.length; ci++) {
      if (isUsableControlesEntry(sources.controles.entries[ci])) return true;
    }
    return false;
  }

  /**
   * Funde passômetro local com snapshot cloud antes do sync (local prevalece; cloud preenche lacunas).
   * @param {object | null | undefined} localSnap
   * @param {object | null | undefined} cloudSnap
   */
  function mergePassometroSnapshotsForSync(localSnap, cloudSnap) {
    if (!cloudSnap) return localSnap || null;
    if (!localSnap) return null;
    var schema = getSchema();
    var header = mergeHeaderFillEmpty(
      schema.normalizeHeader(localSnap.header || {}),
      schema.normalizeHeader(cloudSnap.header || {}),
    );
    var localEntries = Array.isArray(localSnap.entries)
      ? localSnap.entries.map(function (e) {
          return schema.normalizeEntry(e);
        })
      : [];
    var cloudEntries = Array.isArray(cloudSnap.entries)
      ? cloudSnap.entries.map(function (e) {
          return schema.normalizeEntry(e);
        })
      : [];

    if (!cloudEntries.length) {
      return {
        header: header,
        entries: localEntries,
        atualizadoEm: localSnap.atualizadoEm || cloudSnap.atualizadoEm || null,
        layout: localSnap.layout || cloudSnap.layout || null,
      };
    }

    var existingDates = {};
    var ei;
    for (ei = 0; ei < localEntries.length; ei++) {
      var dk = normalizeEntryDateKey(localEntries[ei].data);
      if (dk) existingDates[dk] = true;
    }
    var entries = localEntries.slice();
    for (var ci = 0; ci < cloudEntries.length; ci++) {
      var ce = cloudEntries[ci];
      var ck = normalizeEntryDateKey(ce.data);
      if (ck && existingDates[ck]) continue;
      var copy = Object.assign({}, ce);
      if (!copy.id) copy.id = schema.newEntryId();
      entries.push(copy);
      if (ck) existingDates[ck] = true;
    }

    return {
      header: header,
      entries: entries,
      atualizadoEm: localSnap.atualizadoEm || cloudSnap.atualizadoEm || null,
      layout: localSnap.layout || cloudSnap.layout || null,
    };
  }

  /**
   * @param {object | null | undefined} existingSnap
   * @param {object | null | undefined} builtSnap
   * @param {{ mode?: string } | undefined} opts
   */
  function mergeHeaderRecoverable(existingHeader, builtHeader, opts) {
    var header = mergeHeaderFillEmpty(existingHeader, builtHeader);
    var api = prontuarioApi();
    var recordClientId = opts && opts.recordClientId ? str(opts.recordClientId) : "";
    if (
      api &&
      api.isPlaceholderProntuario &&
      api.isPlaceholderProntuario(header.prontuario, { recordClientId }) &&
      str(builtHeader.prontuario).trim()
    ) {
      header.prontuario = builtHeader.prontuario;
    }
    if (!str(header.idade).trim() && str(builtHeader.idade).trim()) {
      header.idade = builtHeader.idade;
    }
    if (!str(header.dih).trim() && str(builtHeader.dih).trim()) {
      header.dih = builtHeader.dih;
    }
    return header;
  }

  function shouldRecoverHeader(existing, opts) {
    if (opts && opts.recoverable === true) return true;
    return isPassometroEmpty(existing);
  }

  function mergeHeaderForAutofill(existingHeader, builtHeader, opts, existingSnap) {
    if (shouldRecoverHeader(existingSnap, opts)) {
      return mergeHeaderRecoverable(existingHeader, builtHeader, opts);
    }
    return mergeHeaderFillEmpty(existingHeader, builtHeader);
  }

  function mergeHeaderFillEmpty(existingHeader, builtHeader) {
    var header = Object.assign({}, existingHeader);
    for (var key in builtHeader) {
      if (!Object.prototype.hasOwnProperty.call(builtHeader, key)) continue;
      var builtVal = str(builtHeader[key]).trim();
      if (!builtVal) continue;
      if (!str(header[key]).trim()) header[key] = builtHeader[key];
    }
    return header;
  }

  function refreshEntryVitalsFromBuilt(existing, built) {
    for (var vi = 0; vi < VITAL_KEYS.length; vi++) {
      var k = VITAL_KEYS[vi];
      if (existing.vitalsTouched && existing.vitalsTouched[k]) continue;
      var builtVal = str(built[k]).trim();
      if (!builtVal) continue;
      existing[k] = k === "pa" ? formatEntryPa(built[k]) : built[k];
    }
    return existing;
  }

  function refreshEntryTherapeuticsFromBuilt(existing, built) {
    for (var ti = 0; ti < THERAPEUTIC_KEYS.length; ti++) {
      var tk = THERAPEUTIC_KEYS[ti];
      if (str(existing[tk]).trim()) continue;
      var builtTher = str(built[tk]).trim();
      if (!builtTher) continue;
      existing[tk] = built[tk];
    }
    return existing;
  }

  function applyAutofillAppendAndRefreshVitals(existing, built, schema, opts) {
    var builtByDate = {};
    for (var bi = 0; bi < built.entries.length; bi++) {
      var be = built.entries[bi];
      var dk = normalizeEntryDateKey(be.data);
      if (!dk) continue;
      var prev = builtByDate[dk];
      if (
        !prev ||
        countEntryVitalsFilled(be) > countEntryVitalsFilled(prev)
      ) {
        builtByDate[dk] = be;
      }
    }

    var existingDates = {};
    var entries = [];
    for (var ei = 0; ei < existing.entries.length; ei++) {
      var ex = schema.normalizeEntry(existing.entries[ei]);
      var dateKey = normalizeEntryDateKey(ex.data);
      if (dateKey) existingDates[dateKey] = true;
      var matchBuilt = dateKey ? builtByDate[dateKey] : null;
      if (matchBuilt) {
        refreshEntryVitalsFromBuilt(ex, matchBuilt);
        refreshEntryTherapeuticsFromBuilt(ex, matchBuilt);
      }
      entries.push(ex);
    }

    for (var bj = 0; bj < built.entries.length; bj++) {
      var builtEntry = built.entries[bj];
      var dateKey2 = normalizeEntryDateKey(builtEntry.data);
      if (dateKey2 && existingDates[dateKey2]) continue;

      var copy = schema.normalizeEntry(builtEntry);
      copy.id = schema.newEntryId();
      entries.push(copy);
      if (dateKey2) existingDates[dateKey2] = true;
    }

    return schema.normalizeSnap({
      header: mergeHeaderForAutofill(existing.header, built.header, opts, existing),
      entries: entries,
      atualizadoEm: existing.atualizadoEm,
      layout: existing.layout,
    });
  }

  function applyAutofillAppendOnly(existing, built, schema, opts) {
    var existingDates = {};
    for (var ei = 0; ei < existing.entries.length; ei++) {
      var ek = normalizeEntryDateKey(existing.entries[ei].data);
      if (ek) existingDates[ek] = true;
    }

    var entries = existing.entries.slice();
    for (var bi = 0; bi < built.entries.length; bi++) {
      var builtEntry = built.entries[bi];
      var dateKey = normalizeEntryDateKey(builtEntry.data);
      if (dateKey && existingDates[dateKey]) continue;

      var copy = schema.normalizeEntry(builtEntry);
      copy.id = schema.newEntryId();
      entries.push(copy);
      if (dateKey) existingDates[dateKey] = true;
    }

    return schema.normalizeSnap({
      header: mergeHeaderForAutofill(existing.header, built.header, opts, existing),
      entries: entries,
      atualizadoEm: existing.atualizadoEm,
    });
  }

  function applyAutofill(existingSnap, builtSnap, opts) {
    var schema = getSchema();
    var mode = (opts && opts.mode) || "overwrite";
    var existing = schema.normalizeSnap(existingSnap);
    var built = schema.normalizeSnap(builtSnap);

    if (mode === "append_only") {
      return applyAutofillAppendOnly(existing, built, schema, opts);
    }

    if (mode === "append_and_refresh_vitals") {
      return applyAutofillAppendAndRefreshVitals(existing, built, schema, opts);
    }

    if (mode !== "overwrite") return existing;

    var header = Object.assign({}, existing.header);
    if (built.header.nome) header.nome = built.header.nome;
    if (built.header.prontuario) header.prontuario = built.header.prontuario;

    return schema.normalizeSnap({
      header: header,
      entries: built.entries,
      atualizadoEm: existing.atualizadoEm,
    });
  }

  function sortPassometroEntries(entries) {
    var order = getEntriesOrder();
    if (order && order.sortPassometroEntries) {
      return order.sortPassometroEntries(entries);
    }
    return Array.isArray(entries) ? entries.slice() : [];
  }

  return {
    parseControlesTexto: parseControlesTexto,
    formatExamesResumo: formatExamesResumo,
    parsePeriodoDate: parsePeriodoDate,
    buildPassometroFromSources: buildPassometroFromSources,
    applyAutofill: applyAutofill,
    isPassometroEmpty: isPassometroEmpty,
    headerHasContent: headerHasContent,
    hasControlesAutofillSources: hasControlesAutofillSources,
    mergePassometroSnapshotsForSync: mergePassometroSnapshotsForSync,
    mergeHeaderFillEmpty: mergeHeaderFillEmpty,
    mergeHeaderRecoverable: mergeHeaderRecoverable,
    isUsableControlesEntry: isUsableControlesEntry,
    sortPassometroEntries: sortPassometroEntries,
    VITAL_KEYS: VITAL_KEYS,
    THERAPEUTIC_KEYS: THERAPEUTIC_KEYS,
    refreshEntryVitalsFromBuilt: refreshEntryVitalsFromBuilt,
    refreshEntryTherapeuticsFromBuilt: refreshEntryTherapeuticsFromBuilt,
    extractPrescricaoFields: extractPrescricaoFields,
    extractPrescricaoFieldsForDate: extractPrescricaoFieldsForDate,
  };
});
