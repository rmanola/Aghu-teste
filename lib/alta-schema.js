/**
 * Schema de kit de alta (AltaSnapV2) — estende ReceitaSnapV1.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./receita-schema.js")
      : root.AghuReceitaSchema,
    typeof require !== "undefined"
      ? require("./alta-defaults.js")
      : root.AghuAltaDefaults,
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  receitaSchema,
  altaDefaults,
) {
  "use strict";

  if (!receitaSchema) {
    throw new Error("alta-schema: receita-schema required");
  }
  if (!altaDefaults) {
    throw new Error("alta-schema: alta-defaults required");
  }

  var ALTA_SNAP_VERSION = 2;

  var LINKED_LAUDO_TO_ATESTADO = {
    procedimento: "procedimento",
    cid10: "cid10",
    divulgacaoCidAutorizada: "divulgacaoCidAutorizada",
    issuedAt: "issuedAt",
  };

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return globalThis.AghuDateBr || null;
  }

  function getPassometroSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {}
    }
    return globalThis.AghuPassometroSchema || null;
  }

  function getPassometroCollection() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-collection.js");
      } catch (_e) {}
    }
    return globalThis.AghuPassometroCollection || null;
  }

  function getEncaminhamentoApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-encaminhamento.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaEncaminhamento || null;
  }

  function encNormalizeReferencia(raw) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.normalizeReferencia === "function") {
      return api.normalizeReferencia(raw);
    }
    return raw && typeof raw === "object" ? raw : {};
  }

  function encNormalizeContrarreferencia(raw) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.normalizeContrarreferencia === "function") {
      return api.normalizeContrarreferencia(raw);
    }
    return raw && typeof raw === "object" ? raw : {};
  }

  function encEmptyReferencia() {
    var api = getEncaminhamentoApi();
    if (api && typeof api.emptyReferencia === "function") return api.emptyReferencia();
    return {};
  }

  function encEmptyContrarreferencia() {
    var api = getEncaminhamentoApi();
    if (api && typeof api.emptyContrarreferencia === "function") {
      return api.emptyContrarreferencia();
    }
    return {};
  }

  function encReferenciaHasContent(raw) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.referenciaHasContent === "function") {
      return api.referenciaHasContent(raw);
    }
    return false;
  }

  function encContrarreferenciaHasContent(raw) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.contrarreferenciaHasContent === "function") {
      return api.contrarreferenciaHasContent(raw);
    }
    return false;
  }

  function retainEncaminhamento(base, obj) {
    var b = base && typeof base === "object" ? base : {};
    var o = obj && typeof obj === "object" ? obj : {};
    if (o.referencia == null) o.referencia = b.referencia;
    if (o.contrarreferencia == null) o.contrarreferencia = b.contrarreferencia;
    o.referencia = encNormalizeReferencia(o.referencia);
    o.contrarreferencia = encNormalizeContrarreferencia(o.contrarreferencia);
    return o;
  }

  function resolvePassometroSnapInput(passometroRaw, patientEpisodesSnap) {
    var collApi = getPassometroCollection();
    if (
      collApi &&
      typeof collApi.resolveAnySnapFromDomain === "function" &&
      passometroRaw &&
      typeof passometroRaw === "object" &&
      passometroRaw.version === collApi.VERSION &&
      Array.isArray(passometroRaw.registros)
    ) {
      return collApi.resolveAnySnapFromDomain(
        passometroRaw,
        patientEpisodesSnap || null,
      );
    }
    return passometroRaw;
  }

  function getAltaProcedimentos() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-procedimentos.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaProcedimentos || null;
  }

  function getAltaPrintSafe() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-print.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPrint || null;
  }

  function strEmpty(value) {
    if (value === false) return false;
    if (typeof value === "number") return !Number.isFinite(value);
    return !String(value == null ? "" : value).trim();
  }

  function passometroBrDateToIso(brDate) {
    var db = getDateBr();
    if (!db || !db.brToIso) return "";
    var iso = db.brToIso(brDate);
    return iso || "";
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function emptyOrientacoes() {
    return { items: [], updatedAt: Date.now() };
  }

  function emptyLaudo() {
    var now = Date.now();
    return {
      dataInternacao: "",
      diagnostico: "",
      procedimento: "",
      dataProcedimento: "",
      procedimentos: [],
      evolucao: "",
      semIntercorrencias: true,
      cid10: "",
      divulgacaoCidAutorizada: false,
      issuedAt: todayIso(),
      updatedAt: now,
    };
  }

  function emptyAtestado() {
    var now = Date.now();
    return {
      procedimento: "",
      diasAfastamento: 15,
      dataInicioAfastamento: "",
      cid10: "",
      divulgacaoCidAutorizada: false,
      issuedAt: todayIso(),
      updatedAt: now,
    };
  }

  function emptyAcompanhante() {
    var now = Date.now();
    return {
      nomeAcompanhante: "",
      diasDeclaracao: 15,
      dataInicio: "",
      cid10: "Z76.3",
      issuedAt: todayIso(),
      updatedAt: now,
    };
  }

  function emptyLaudoPersonalizado() {
    return {
      titulo: "",
      corpo: "",
      updatedAt: Date.now(),
    };
  }

  function emptyRetorno() {
    var now = Date.now();
    return {
      diagnostico: "",
      descricaoAto: "",
      dataCirurgia: "",
      equipes: [],
      localRetorno: "",
      dataHoraRetorno: "",
      medicoRetorno: "",
      updatedAt: now,
    };
  }

  function resolveRetornoAtoCount(laudo, retorno) {
    var ap = getAltaProcedimentos();
    var procCount = 0;
    if (laudo && ap && typeof ap.resolveProcedimentosFromLaudo === "function") {
      procCount = ap.resolveProcedimentosFromLaudo(laudo).length;
    }
    var descCount = 0;
    if (retorno && ap && typeof ap.countMultilineLines === "function") {
      descCount = ap.countMultilineLines(retorno.descricaoAto);
    }
    return Math.max(procCount, descCount);
  }

  function normalizeRetorno(raw, options) {
    if (!raw || typeof raw !== "object") return emptyRetorno();
    options = options || {};
    var laudo = options.laudo;
    var ap = getAltaProcedimentos();
    var atoCount = resolveRetornoAtoCount(laudo, raw);
    var legacyScalars = {
      staff: raw.staff,
      auxiliar1: raw.auxiliar1,
      auxiliar2: raw.auxiliar2,
    };
    var equipes =
      ap && typeof ap.normalizeEquipes === "function"
        ? ap.normalizeEquipes(raw.equipes, atoCount, legacyScalars)
        : [];
    if (
      scalarsHaveEquipeContent(legacyScalars) &&
      ap &&
      typeof ap.applyMultilineEquipeScalarsToEquipes === "function" &&
      (raw.staff != null || raw.auxiliar1 != null || raw.auxiliar2 != null)
    ) {
      equipes = ap.applyMultilineEquipeScalarsToEquipes(
        equipes,
        {
          staff: raw.staff != null ? raw.staff : undefined,
          auxiliar1: raw.auxiliar1 != null ? raw.auxiliar1 : undefined,
          auxiliar2: raw.auxiliar2 != null ? raw.auxiliar2 : undefined,
        },
        atoCount,
      );
    }
    return {
      // Free-text: sem trim em tempo real (ALTA-AC-97 / AC-86) — trim na impressão.
      diagnostico: raw.diagnostico != null ? String(raw.diagnostico) : "",
      descricaoAto: raw.descricaoAto != null ? String(raw.descricaoAto) : "",
      dataCirurgia: raw.dataCirurgia != null ? String(raw.dataCirurgia) : "",
      equipes: equipes,
      localRetorno: raw.localRetorno != null ? String(raw.localRetorno) : "",
      dataHoraRetorno:
        raw.dataHoraRetorno != null ? String(raw.dataHoraRetorno) : "",
      medicoRetorno: raw.medicoRetorno != null ? String(raw.medicoRetorno) : "",
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function scalarsHaveEquipeContent(scalars) {
    if (!scalars || typeof scalars !== "object") return false;
    return !!(
      (scalars.staff && String(scalars.staff).trim()) ||
      (scalars.auxiliar1 && String(scalars.auxiliar1).trim()) ||
      (scalars.auxiliar2 && String(scalars.auxiliar2).trim())
    );
  }

  function syncRetornoEquipesCount(retorno, atoCount, seedEquipes) {
    var ap = getAltaProcedimentos();
    if (!ap || typeof ap.normalizeEquipes !== "function") return retorno;
    var next = ap.normalizeEquipes(retorno.equipes, atoCount, null);
    if (
      Array.isArray(seedEquipes) &&
      seedEquipes.length &&
      typeof ap.shouldSyncEquipesFromPassometro === "function" &&
      ap.shouldSyncEquipesFromPassometro(retorno, seedEquipes, true)
    ) {
      next = seedEquipes.slice();
    }
    retorno.equipes = next;
    return retorno;
  }

  function emptyPreviewHtml() {
    return {
      orientacoes: null,
      laudo: null,
      atestado: null,
      acompanhante: null,
      laudoPersonalizado: null,
      retorno: null,
      referencia: null,
      contrarreferencia: null,
      kit: null,
      receituarioDocs: null,
    };
  }

  function normalizeReceituarioDocs(raw) {
    if (!raw || typeof raw !== "object") return null;
    var out = {};
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof raw[k] === "string" && raw[k].trim()) {
        out[k] = String(raw[k]).trim();
      }
    }
    return Object.keys(out).length ? out : null;
  }

  function clearReceituarioDocPreview(previewHtml, docId) {
    var next = normalizePreviewHtml(previewHtml);
    if (!next.receituarioDocs || !docId) return next;
    var docs = Object.assign({}, next.receituarioDocs);
    delete docs[String(docId)];
    next.receituarioDocs = Object.keys(docs).length ? docs : null;
    next.kit = null;
    return next;
  }

  function clearAllReceituarioDocPreviews(previewHtml) {
    var next = normalizePreviewHtml(previewHtml);
    next.receituarioDocs = null;
    next.kit = null;
    return next;
  }

  function isLegacyRetornoPreviewHtml(html) {
    var s = String(html || "");
    if (!s.trim()) return false;
    if (s.indexOf("DESCRIÇÃO DO ATO:") >= 0) return true;
    if (s.indexOf("alta-retorno-ato-block") >= 0) return false;
    if (s.indexOf('data-alta-field="retorno.atos.') >= 0) return false;
    if (
      s.indexOf('data-alta-field="retorno.equipes.') >= 0 &&
      s.indexOf("auxiliar1") >= 0 &&
      s.indexOf("auxiliares.") < 0
    ) {
      return true;
    }
    if (s.indexOf('data-alta-field="retorno.descricaoAto"') >= 0) return true;
    if (s.indexOf('data-alta-field="retorno.dataCirurgia"') >= 0) return true;
    if (
      s.indexOf('data-alta-field="retorno.staff"') >= 0 &&
      s.indexOf("retorno.equipes.") < 0
    ) {
      return true;
    }
    return false;
  }

  function sanitizePreviewHtmlSection(section, html) {
    if (!html || !String(html).trim()) return null;
    var s = String(html).trim();
    if (section === "retorno" && isLegacyRetornoPreviewHtml(s)) return null;
    if (section === "kit" && isLegacyRetornoPreviewHtml(s)) return null;
    return s;
  }

  function normalizePreviewHtml(raw) {
    var base = emptyPreviewHtml();
    if (!raw || typeof raw !== "object") return base;
    var keys = [
      "orientacoes",
      "laudo",
      "atestado",
      "acompanhante",
      "laudoPersonalizado",
      "retorno",
      "referencia",
      "contrarreferencia",
      "kit",
    ];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof raw[k] === "string" && raw[k].trim()) {
        var sanitized = sanitizePreviewHtmlSection(k, raw[k]);
        if (sanitized) base[k] = sanitized;
      }
    }
    if (raw.receituarioDocs && typeof raw.receituarioDocs === "object") {
      base.receituarioDocs = normalizeReceituarioDocs(raw.receituarioDocs);
    }
    return base;
  }

  function clearPreviewHtmlSection(previewHtml, section) {
    var next = normalizePreviewHtml(previewHtml);
    if (section === "kit") {
      next.kit = null;
      next.receituarioDocs = null;
      return next;
    }
    if (section === "receituario") {
      next.receituarioDocs = null;
      next.kit = null;
      return next;
    }
    if (section && Object.prototype.hasOwnProperty.call(next, section)) {
      next[section] = null;
    }
    next.kit = null;
    next.receituarioDocs = null;
    return next;
  }

  function emptyAltaSnap() {
    return {
      version: ALTA_SNAP_VERSION,
      receitas: [],
      orientacoes: emptyOrientacoes(),
      laudo: emptyLaudo(),
      atestado: emptyAtestado(),
      acompanhante: emptyAcompanhante(),
      laudoPersonalizado: emptyLaudoPersonalizado(),
      retorno: emptyRetorno(),
      referencia: encEmptyReferencia(),
      contrarreferencia: encEmptyContrarreferencia(),
      previewHtml: emptyPreviewHtml(),
      atualizadoEm: null,
    };
  }

  function normalizeOrientacoes(raw) {
    if (!raw || typeof raw !== "object") return emptyOrientacoes();
    var items = [];
    if (Array.isArray(raw.items)) {
      for (var i = 0; i < raw.items.length; i++) {
        var t = String(raw.items[i] || "").trim();
        if (t) items.push(t);
      }
    }
    return {
      items: items,
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function normalizeLaudo(raw) {
    if (!raw || typeof raw !== "object") return emptyLaudo();
    var ap = getAltaProcedimentos();
    var laudo = {
      dataInternacao: raw.dataInternacao ? String(raw.dataInternacao) : "",
      // Free-text: sem trim em tempo real (ALTA-AC-97 / AC-86) — trim na impressão.
      diagnostico: raw.diagnostico != null ? String(raw.diagnostico) : "",
      procedimento: raw.procedimento != null ? String(raw.procedimento) : "",
      dataProcedimento: raw.dataProcedimento
        ? String(raw.dataProcedimento)
        : "",
      procedimentos: Array.isArray(raw.procedimentos) ? raw.procedimentos : [],
      evolucao: raw.evolucao != null ? String(raw.evolucao) : "",
      semIntercorrencias: raw.semIntercorrencias !== false,
      cid10: raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "",
      divulgacaoCidAutorizada: !!raw.divulgacaoCidAutorizada,
      issuedAt: raw.issuedAt ? String(raw.issuedAt) : todayIso(),
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
    if (ap && typeof ap.mirrorLaudoLegacyFields === "function") {
      return ap.mirrorLaudoLegacyFields(laudo);
    }
    return laudo;
  }

  function normalizeAtestado(raw) {
    if (!raw || typeof raw !== "object") return emptyAtestado();
    var dias = raw.diasAfastamento;
    var diasNum =
      typeof dias === "number" && Number.isFinite(dias) && dias > 0
        ? Math.floor(dias)
        : 15;
    return {
      // Free-text: sem trim em tempo real (ALTA-AC-97 / AC-86) — trim na impressão.
      procedimento: raw.procedimento != null ? String(raw.procedimento) : "",
      diasAfastamento: diasNum,
      dataInicioAfastamento: raw.dataInicioAfastamento
        ? String(raw.dataInicioAfastamento)
        : "",
      cid10: raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "",
      divulgacaoCidAutorizada: !!raw.divulgacaoCidAutorizada,
      issuedAt: raw.issuedAt ? String(raw.issuedAt) : todayIso(),
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function normalizeAcompanhante(raw) {
    if (!raw || typeof raw !== "object") return emptyAcompanhante();
    var dias = raw.diasDeclaracao;
    var diasNum =
      typeof dias === "number" && Number.isFinite(dias) && dias > 0
        ? Math.floor(dias)
        : 15;
    var cid = raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "Z76.3";
    return {
      nomeAcompanhante:
        raw.nomeAcompanhante != null ? String(raw.nomeAcompanhante) : "",
      diasDeclaracao: diasNum,
      dataInicio: raw.dataInicio ? String(raw.dataInicio) : "",
      cid10: cid || "Z76.3",
      issuedAt: raw.issuedAt ? String(raw.issuedAt) : todayIso(),
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function normalizeLaudoPersonalizado(raw) {
    if (!raw || typeof raw !== "object") return emptyLaudoPersonalizado();
    return {
      // Free-text: sem trim em tempo real (ALTA-AC-97 / AC-86) — trim na impressão.
      titulo: raw.titulo != null ? String(raw.titulo) : "",
      corpo:
        raw.corpo != null
          ? String(raw.corpo).replace(/\r\n/g, "\n").replace(/\n+$/, "")
          : "",
      updatedAt:
        typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
  }

  function snapShell(fields, sourceForRetain) {
    var b = fields && typeof fields === "object" ? fields : emptyAltaSnap();
    var src =
      sourceForRetain && typeof sourceForRetain === "object"
        ? sourceForRetain
        : b;
    var laudo = b.laudo;
    return retainEncaminhamento(src, {
      version: b.version || ALTA_SNAP_VERSION,
      receitas: b.receitas,
      orientacoes: b.orientacoes,
      laudo: laudo,
      atestado: b.atestado,
      acompanhante: normalizeAcompanhante(b.acompanhante),
      laudoPersonalizado: normalizeLaudoPersonalizado(b.laudoPersonalizado),
      retorno: normalizeRetorno(b.retorno, { laudo: laudo }),
      previewHtml: normalizePreviewHtml(b.previewHtml),
      atualizadoEm: b.atualizadoEm,
    });
  }

  function copyLinkedLaudoToAtestado(laudo, atestado) {
    var next = normalizeAtestado(atestado);
    var l = normalizeLaudo(laudo);
    next.procedimento = l.procedimento;
    next.cid10 = l.cid10;
    next.divulgacaoCidAutorizada = l.divulgacaoCidAutorizada;
    next.issuedAt = l.issuedAt;
    next.dataInicioAfastamento = l.dataInternacao;
    next.updatedAt = Date.now();
    return next;
  }

  function copyLinkedAtestadoToLaudo(atestado, laudo) {
    var next = normalizeLaudo(laudo);
    var a = normalizeAtestado(atestado);
    next.procedimento = a.procedimento;
    next.cid10 = a.cid10;
    next.divulgacaoCidAutorizada = a.divulgacaoCidAutorizada;
    next.issuedAt = a.issuedAt;
    next.dataInternacao = a.dataInicioAfastamento;
    next.updatedAt = Date.now();
    return next;
  }

  /**
   * Mantém laudo.procedimentos[] alinhado ao texto do atestado para o mirror
   * não reverter a edição (sync Laudo ↔ Atestado).
   */
  function applyAtestadoProcedimentoToLaudo(laudo, procedimentoText) {
    var ap = getAltaProcedimentos();
    var next = normalizeLaudo(laudo);
    var text = procedimentoText != null ? String(procedimentoText) : "";
    var procs =
      ap && typeof ap.resolveProcedimentosFromLaudo === "function"
        ? ap.resolveProcedimentosFromLaudo(next)
        : Array.isArray(next.procedimentos)
          ? next.procedimentos
          : [];
    var data = "";
    if (procs.length >= 1) {
      data = procs[procs.length - 1].data || next.dataProcedimento || "";
    } else {
      data = next.dataProcedimento || "";
    }
    if (!String(text).trim()) {
      next.procedimentos = [];
      next.procedimento = "";
      next.dataProcedimento = "";
    } else if (procs.length <= 1) {
      next.procedimentos = [{ descricao: text, data: data }];
    } else {
      // Agregado multi-ato editado no atestado → um ato com o texto completo.
      next.procedimentos = [{ descricao: text, data: data }];
    }
    if (ap && typeof ap.mirrorLaudoLegacyFields === "function") {
      return ap.mirrorLaudoLegacyFields(next);
    }
    next.procedimento = text;
    return next;
  }

  /**
   * Aplica linhas do retorno (descricaoAto / dataCirurgia) ao laudo.procedimentos[].
   * Fallback com padding quando parseRetornoMultiline rejeita por linhas desalinhadas
   * (ex.: data vazia no fim — UI de slots emite N linhas paralelas).
   */
  function applyRetornoLinesToLaudo(laudo, retorno) {
    var ap = getAltaProcedimentos();
    var next = normalizeLaudo(laudo);
    var descRaw = retorno && retorno.descricaoAto != null ? String(retorno.descricaoAto) : "";
    var dateRaw = retorno && retorno.dataCirurgia != null ? String(retorno.dataCirurgia) : "";
    var parsed = null;
    if (ap && typeof ap.parseRetornoMultiline === "function") {
      parsed = ap.parseRetornoMultiline(descRaw, dateRaw);
    }
    if (parsed === null) {
      var descLines = descRaw.replace(/\r\n/g, "\n").split("\n");
      var dateLines = dateRaw.replace(/\r\n/g, "\n").split("\n");
      if (!descRaw.length && !dateRaw.length) {
        parsed = [];
      } else {
        var n = Math.max(descLines.length, dateLines.length);
        parsed = [];
        for (var i = 0; i < n; i++) {
          var desc = i < descLines.length ? descLines[i] : "";
          var data = i < dateLines.length ? dateLines[i] : "";
          if (!String(desc).trim() && !String(data).trim()) continue;
          parsed.push({ descricao: desc, data: data });
        }
      }
    }
    next.procedimentos = Array.isArray(parsed) ? parsed : [];
    if (ap && typeof ap.mirrorLaudoLegacyFields === "function") {
      return ap.mirrorLaudoLegacyFields(next);
    }
    if (next.procedimentos.length) {
      next.procedimento = next.procedimentos
        .map(function (p) {
          return p && p.descricao ? String(p.descricao) : "";
        })
        .filter(Boolean)
        .join(" E ");
      next.dataProcedimento = next.procedimentos[next.procedimentos.length - 1].data || "";
    } else {
      next.procedimento = "";
      next.dataProcedimento = "";
    }
    return next;
  }

  /** Atualiza laudo.procedimentos[] a partir do retorno (sync entre abas). */
  function syncLaudoLinesFromRetorno(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var retorno = normalizeRetorno(base.retorno);
    var laudo = applyRetornoLinesToLaudo(base.laudo, retorno);
    var atestado = copyLinkedLaudoToAtestado(laudo, base.atestado);
    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  /** Atualiza descricaoAto/dataCirurgia do retorno a partir do laudo (sync entre abas). */
  function syncRetornoLinesFromLaudo(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var retorno = normalizeRetorno(base.retorno);
    var ap = getAltaProcedimentos();
    var derived =
      ap && typeof ap.formatRetornoMultiline === "function"
        ? ap.formatRetornoMultiline(
            ap.resolveProcedimentosFromLaudo
              ? ap.resolveProcedimentosFromLaudo(laudo)
              : laudo.procedimentos,
          )
        : { descricaoAto: "", dataCirurgia: "" };
    if (!derived.descricaoAto && laudo.procedimento) {
      derived.descricaoAto = String(laudo.procedimento).toUpperCase();
    }
    if (!derived.dataCirurgia && laudo.dataProcedimento) {
      var altaPrint = getAltaPrintSafe();
      derived.dataCirurgia = altaPrint
        ? altaPrint.formatBrDate(laudo.dataProcedimento)
        : laudo.dataProcedimento;
    }
    retorno.descricaoAto = derived.descricaoAto || "";
    retorno.dataCirurgia = derived.dataCirurgia || "";
    retorno.updatedAt = Date.now();
    var procedimentos =
      ap && typeof ap.resolveProcedimentosFromLaudo === "function"
        ? ap.resolveProcedimentosFromLaudo(laudo)
        : [];
    syncRetornoEquipesCount(retorno, procedimentos.length, null);
    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  function reconcileLinkedLaudoAtestado(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var atestado = normalizeAtestado(base.atestado);
    var linkedKeys = Object.keys(LINKED_LAUDO_TO_ATESTADO);
    var laudoChanged = false;
    var atestadoChanged = false;

    for (var i = 0; i < linkedKeys.length; i++) {
      var lk = linkedKeys[i];
      var ak = LINKED_LAUDO_TO_ATESTADO[lk];
      var lv = laudo[lk];
      var av = atestado[ak];
      if (strEmpty(lv) && !strEmpty(av)) {
        // procedimento: não empurrar escalar do atestado → laudo (mirror/procedimentos[]).
        if (lk === "procedimento") continue;
        laudo[lk] = av;
        laudoChanged = true;
      } else if (!strEmpty(lv) && strEmpty(av)) {
        // procedimento: não repor vazio no finalize (apagar no atestado deve persistir).
        if (lk === "procedimento") continue;
        atestado[ak] = lv;
        atestadoChanged = true;
      } else if (!strEmpty(lv) && !strEmpty(av) && String(lv) !== String(av)) {
        // procedimento: edição no atestado prevalece; demais campos: laudo prevalece.
        if (lk === "procedimento") continue;
        atestado[ak] = lv;
        atestadoChanged = true;
      }
    }

    if (strEmpty(laudo.dataInternacao) && !strEmpty(atestado.dataInicioAfastamento)) {
      laudo.dataInternacao = atestado.dataInicioAfastamento;
      laudoChanged = true;
    } else if (!strEmpty(laudo.dataInternacao) && strEmpty(atestado.dataInicioAfastamento)) {
      atestado.dataInicioAfastamento = laudo.dataInternacao;
      atestadoChanged = true;
    } else if (
      !strEmpty(laudo.dataInternacao) &&
      !strEmpty(atestado.dataInicioAfastamento) &&
      String(laudo.dataInternacao) !== String(atestado.dataInicioAfastamento)
    ) {
      atestado.dataInicioAfastamento = laudo.dataInternacao;
      atestadoChanged = true;
    }

    if (laudoChanged) laudo.updatedAt = Date.now();
    if (atestadoChanged) atestado.updatedAt = Date.now();

    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  /** Preenche atestado.procedimento vazio a partir do laudo (hydrate / patchLaudo). */
  function syncAtestadoEmptyFromLaudo(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var atestado = normalizeAtestado(base.atestado);
    if (strEmpty(atestado.procedimento) && !strEmpty(laudo.procedimento)) {
      atestado = normalizeAtestado(
        Object.assign({}, atestado, {
          procedimento: laudo.procedimento,
          updatedAt: Date.now(),
        }),
      );
    }
    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  function reconcileLaudoToAcompanhante(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var acompanhante = normalizeAcompanhante(base.acompanhante);
    var changed = false;
    if (strEmpty(acompanhante.dataInicio) && !strEmpty(laudo.dataInternacao)) {
      acompanhante.dataInicio = laudo.dataInternacao;
      changed = true;
    }
    if (changed) acompanhante.updatedAt = Date.now();
    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: base.atestado,
      acompanhante: acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  function reconcileLaudoToRetorno(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var retorno = normalizeRetorno(base.retorno);
    var ap = getAltaProcedimentos();
    var retornoChanged = false;

    // Não repor descricaoAto / dataCirurgia / diagnostico vazios aqui:
    // apagar por completo no formulário deve persistir (fill só em
    // syncRetornoEmptyFromLaudo / applyPassometro / patchLaudo / normalizeSnap).

    var procedimentos =
      ap && typeof ap.resolveProcedimentosFromLaudo === "function"
        ? ap.resolveProcedimentosFromLaudo(laudo)
        : [];
    var prevEquipesJson = JSON.stringify(retorno.equipes || []);
    syncRetornoEquipesCount(retorno, procedimentos.length, null);
    if (JSON.stringify(retorno.equipes || []) !== prevEquipesJson) {
      retornoChanged = true;
    }

    if (retornoChanged) retorno.updatedAt = Date.now();

    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  /**
   * Preenche campos vazios do retorno a partir do laudo (seed / patchLaudo /
   * hydrate). Não usar em todo finalize — senão o médico não consegue apagar.
   */
  function syncRetornoEmptyFromLaudo(snap) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var retorno = normalizeRetorno(base.retorno);
    var ap = getAltaProcedimentos();
    var retornoChanged = false;

    if (strEmpty(retorno.diagnostico) && !strEmpty(laudo.diagnostico)) {
      retorno.diagnostico = laudo.diagnostico;
      retornoChanged = true;
    }

    var derived =
      ap && typeof ap.formatRetornoMultiline === "function"
        ? ap.formatRetornoMultiline(
            ap.resolveProcedimentosFromLaudo
              ? ap.resolveProcedimentosFromLaudo(laudo)
              : laudo.procedimentos,
          )
        : { descricaoAto: "", dataCirurgia: "" };

    if (!derived.descricaoAto && laudo.procedimento) {
      derived.descricaoAto = String(laudo.procedimento).toUpperCase();
    }
    if (!derived.dataCirurgia && laudo.dataProcedimento && ap) {
      var altaPrint = getAltaPrintSafe();
      derived.dataCirurgia = altaPrint
        ? altaPrint.formatBrDate(laudo.dataProcedimento)
        : laudo.dataProcedimento;
    }

    if (strEmpty(retorno.descricaoAto) && derived.descricaoAto) {
      retorno.descricaoAto = derived.descricaoAto;
      retornoChanged = true;
    }
    if (strEmpty(retorno.dataCirurgia) && derived.dataCirurgia) {
      retorno.dataCirurgia = derived.dataCirurgia;
      retornoChanged = true;
    }

    if (retornoChanged) retorno.updatedAt = Date.now();

    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  function finalizeAltaSnap(snap) {
    var retained = retainEncaminhamento(
      snap,
      snap && typeof snap === "object" ? Object.assign({}, snap) : emptyAltaSnap(),
    );
    return reconcileLaudoToRetorno(
      reconcileLaudoToAcompanhante(reconcileLinkedLaudoAtestado(retained)),
    );
  }

  function extractAltaSeedFromPassometro(passometroSnap, patientEpisodesSnap) {
    var ps = getPassometroSchema();
    var ap = getAltaProcedimentos();
    if (!ps) return { laudo: {}, atestado: {}, retorno: {} };
    var resolved = resolvePassometroSnapInput(
      passometroSnap,
      patientEpisodesSnap,
    );
    var norm = ps.normalizeSnap(resolved || {});
    var header = norm.header || {};
    var cirurgias = ps.normalizeCirurgiasFromHeader(header);
    var laudo = {};
    var atestado = {};
    var retorno = {};

    var dihIso = passometroBrDateToIso(header.dih);
    if (dihIso) laudo.dataInternacao = dihIso;

    var procedimentos =
      ap && typeof ap.procedimentosFromPassometroCirurgias === "function"
        ? ap.procedimentosFromPassometroCirurgias(cirurgias, passometroBrDateToIso)
        : [];
    if (procedimentos.length) {
      laudo.procedimentos = procedimentos;
      if (ap && typeof ap.mirrorLaudoLegacyFields === "function") {
        var mirrored = ap.mirrorLaudoLegacyFields({
          procedimentos: procedimentos,
          procedimento: "",
          dataProcedimento: "",
        });
        laudo.procedimento = mirrored.procedimento;
        laudo.dataProcedimento = mirrored.dataProcedimento;
        atestado.procedimento = mirrored.procedimento;
        var retornoLines =
          ap && typeof ap.formatRetornoMultiline === "function"
            ? ap.formatRetornoMultiline(procedimentos)
            : { descricaoAto: "", dataCirurgia: "" };
        retorno.descricaoAto = retornoLines.descricaoAto;
        retorno.dataCirurgia = retornoLines.dataCirurgia;
      }
      if (ap && typeof ap.equipesFromPassometroCirurgias === "function") {
        retorno.equipes = ap.equipesFromPassometroCirurgias(
          cirurgias,
          passometroBrDateToIso,
        );
      }
    }

    if (header.diagnostico) {
      var dx = String(header.diagnostico).trim();
      laudo.diagnostico = dx;
      retorno.diagnostico = dx;
    }

    return { laudo: laudo, atestado: atestado, retorno: retorno };
  }

  function applyPassometroToAlta(snap, passometroSnap, options) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var fillEmptyOnly = !options || options.fillEmptyOnly !== false;
    var seed = extractAltaSeedFromPassometro(
      passometroSnap,
      options && options.patientEpisodes ? options.patientEpisodes : null,
    );
    var laudo = normalizeLaudo(base.laudo);
    var atestado = normalizeAtestado(base.atestado);
    var retorno = normalizeRetorno(base.retorno);
    var seedHasProcedimentos =
      seed.laudo.procedimentos &&
      Array.isArray(seed.laudo.procedimentos) &&
      seed.laudo.procedimentos.length > 0;
    var laudoKeys = seedHasProcedimentos
      ? ["dataInternacao", "diagnostico"]
      : ["dataInternacao", "diagnostico", "procedimento", "dataProcedimento"];
    var atestadoKeys = ["procedimento"];
    var retornoKeys = ["diagnostico", "descricaoAto", "dataCirurgia"];
    var laudoChanged = false;
    var atestadoChanged = false;
    var retornoChanged = false;
    var procedimentosSynced = false;
    var ap = getAltaProcedimentos();

    if (seedHasProcedimentos) {
      var shouldSyncProcs =
        ap && typeof ap.shouldSyncProcedimentosFromPassometro === "function"
          ? ap.shouldSyncProcedimentosFromPassometro(
              laudo,
              seed.laudo.procedimentos,
              fillEmptyOnly,
            )
          : !fillEmptyOnly ||
            !Array.isArray(laudo.procedimentos) ||
            laudo.procedimentos.length === 0;
      if (shouldSyncProcs) {
        laudo.procedimentos = seed.laudo.procedimentos.slice();
        laudoChanged = true;
        procedimentosSynced = true;
      }
    }

    if (laudoChanged && ap && typeof ap.mirrorLaudoLegacyFields === "function") {
      laudo = ap.mirrorLaudoLegacyFields(laudo);
    }

    if (procedimentosSynced && ap) {
      atestado.procedimento = laudo.procedimento;
      atestadoChanged = true;
      if (typeof ap.formatRetornoMultiline === "function") {
        var retornoLines = ap.formatRetornoMultiline(laudo.procedimentos);
        retorno.descricaoAto = retornoLines.descricaoAto;
        retorno.dataCirurgia = retornoLines.dataCirurgia;
        retornoChanged = true;
      }
      if (
        seed.retorno.equipes &&
        Array.isArray(seed.retorno.equipes) &&
        seed.retorno.equipes.length &&
        typeof ap.shouldSyncEquipesFromPassometro === "function" &&
        ap.shouldSyncEquipesFromPassometro(retorno, seed.retorno.equipes, fillEmptyOnly)
      ) {
        retorno.equipes = seed.retorno.equipes.slice();
        retornoChanged = true;
      }
    }

    for (var i = 0; i < laudoKeys.length; i++) {
      var lk = laudoKeys[i];
      var seedVal = seed.laudo[lk];
      if (seedVal == null || strEmpty(seedVal)) continue;
      if (!fillEmptyOnly || strEmpty(laudo[lk])) {
        if (String(laudo[lk]) !== String(seedVal)) {
          laudo[lk] = seedVal;
          laudoChanged = true;
        }
      }
    }

    if (
      seedHasProcedimentos &&
      !procedimentosSynced &&
      !strEmpty(seed.laudo.dataProcedimento) &&
      strEmpty(laudo.dataProcedimento)
    ) {
      laudo.dataProcedimento = seed.laudo.dataProcedimento;
      laudoChanged = true;
    }

    if (laudoChanged && !procedimentosSynced && ap && typeof ap.mirrorLaudoLegacyFields === "function") {
      laudo = ap.mirrorLaudoLegacyFields(laudo);
    }

    for (var j = 0; j < atestadoKeys.length; j++) {
      var ak = atestadoKeys[j];
      var aSeedVal = seed.atestado[ak];
      if (aSeedVal == null || strEmpty(aSeedVal)) continue;
      if (!fillEmptyOnly || strEmpty(atestado[ak])) {
        if (String(atestado[ak]) !== String(aSeedVal)) {
          atestado[ak] = aSeedVal;
          atestadoChanged = true;
        }
      }
    }

    for (var r = 0; r < retornoKeys.length; r++) {
      var rk = retornoKeys[r];
      var rSeedVal = seed.retorno[rk];
      if (rSeedVal == null || strEmpty(rSeedVal)) continue;
      if (!fillEmptyOnly || strEmpty(retorno[rk])) {
        if (String(retorno[rk]) !== String(rSeedVal)) {
          retorno[rk] = rSeedVal;
          retornoChanged = true;
        }
      }
    }

    if (
      !procedimentosSynced &&
      seed.retorno.equipes &&
      Array.isArray(seed.retorno.equipes) &&
      seed.retorno.equipes.length &&
      ap &&
      typeof ap.shouldSyncEquipesFromPassometro === "function" &&
      ap.shouldSyncEquipesFromPassometro(retorno, seed.retorno.equipes, fillEmptyOnly)
    ) {
      retorno.equipes = seed.retorno.equipes.slice();
      retornoChanged = true;
    }

    if (laudoChanged) laudo.updatedAt = Date.now();
    if (atestadoChanged) atestado.updatedAt = Date.now();
    if (retornoChanged) retorno.updatedAt = Date.now();

    return finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: base.atualizadoEm,
    });
  }

  /** Sincroniza diagnóstico Laudo ↔ Retorno (ambas as direcções). */
  function syncDiagnosticoBetweenLaudoRetorno(snap, source) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(base.laudo);
    var retorno = normalizeRetorno(base.retorno);
    var src = source === "retorno" ? "retorno" : "laudo";
    if (src === "laudo") {
      retorno.diagnostico = laudo.diagnostico != null ? String(laudo.diagnostico) : "";
      retorno.updatedAt = Date.now();
    } else {
      laudo.diagnostico = retorno.diagnostico != null ? String(retorno.diagnostico) : "";
      laudo.updatedAt = Date.now();
    }
    return snapShell({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      previewHtml: base.previewHtml,
      atualizadoEm: base.atualizadoEm,
    }, base);
  }

  function patchLaudo(snap, laudoPartial) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudo = normalizeLaudo(Object.assign({}, base.laudo, laudoPartial, { updatedAt: Date.now() }));
    var atestado = copyLinkedLaudoToAtestado(laudo, base.atestado);
    var next = finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: Date.now(),
    });
    next = syncAtestadoEmptyFromLaudo(syncRetornoEmptyFromLaudo(next));
    var touchesProcs =
      laudoPartial &&
      (Object.prototype.hasOwnProperty.call(laudoPartial, "procedimento") ||
        Object.prototype.hasOwnProperty.call(laudoPartial, "procedimentos") ||
        Object.prototype.hasOwnProperty.call(laudoPartial, "dataProcedimento"));
    if (touchesProcs) {
      next = syncRetornoLinesFromLaudo(next);
      // Garante atestado.procedimento = agregado pós-mirror.
      next = snapShell({
        version: next.version,
        receitas: next.receitas,
        orientacoes: next.orientacoes,
        laudo: next.laudo,
        atestado: copyLinkedLaudoToAtestado(next.laudo, next.atestado),
        acompanhante: next.acompanhante,
        laudoPersonalizado: next.laudoPersonalizado,
        retorno: next.retorno,
        previewHtml: next.previewHtml,
        atualizadoEm: next.atualizadoEm,
      }, next);
    }
    if (
      laudoPartial &&
      Object.prototype.hasOwnProperty.call(laudoPartial, "diagnostico")
    ) {
      next = syncDiagnosticoBetweenLaudoRetorno(next, "laudo");
    }
    return next;
  }

  function patchAtestado(snap, atestadoPartial) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var atestado = normalizeAtestado(
      Object.assign({}, base.atestado, atestadoPartial, { updatedAt: Date.now() }),
    );
    var laudo = copyLinkedAtestadoToLaudo(atestado, base.laudo);
    if (
      atestadoPartial &&
      Object.prototype.hasOwnProperty.call(atestadoPartial, "procedimento")
    ) {
      laudo = applyAtestadoProcedimentoToLaudo(laudo, atestado.procedimento);
      atestado = normalizeAtestado(
        Object.assign({}, atestado, {
          procedimento: laudo.procedimento,
          updatedAt: Date.now(),
        }),
      );
    }
    var next = finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: laudo,
      atestado: atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: Date.now(),
    });
    if (
      atestadoPartial &&
      Object.prototype.hasOwnProperty.call(atestadoPartial, "procedimento")
    ) {
      next = syncRetornoLinesFromLaudo(next);
      next = snapShell({
        version: next.version,
        receitas: next.receitas,
        orientacoes: next.orientacoes,
        laudo: next.laudo,
        atestado: copyLinkedLaudoToAtestado(next.laudo, next.atestado),
        acompanhante: next.acompanhante,
        laudoPersonalizado: next.laudoPersonalizado,
        retorno: next.retorno,
        previewHtml: next.previewHtml,
        atualizadoEm: next.atualizadoEm,
      }, next);
    }
    return next;
  }

  function patchAcompanhante(snap, acompanhantePartial) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var acompanhante = normalizeAcompanhante(
      Object.assign({}, base.acompanhante, acompanhantePartial, {
        updatedAt: Date.now(),
      }),
    );
    return finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: base.laudo,
      atestado: base.atestado,
      acompanhante: acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: base.retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: Date.now(),
    });
  }

  function patchLaudoPersonalizado(snap, laudoPersonalizadoPartial) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var laudoPersonalizado = normalizeLaudoPersonalizado(
      Object.assign({}, base.laudoPersonalizado, laudoPersonalizadoPartial, {
        updatedAt: Date.now(),
      }),
    );
    return finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: base.laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: laudoPersonalizado,
      retorno: base.retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: Date.now(),
    });
  }

  function patchRetorno(snap, retornoPartial) {
    var base = snap && typeof snap === "object" ? snap : emptyAltaSnap();
    var retorno = Object.assign({}, base.retorno, retornoPartial, {
      updatedAt: Date.now(),
    });
    var next = finalizeAltaSnap({
      version: base.version || ALTA_SNAP_VERSION,
      receitas: base.receitas,
      orientacoes: base.orientacoes,
      laudo: base.laudo,
      atestado: base.atestado,
      acompanhante: base.acompanhante,
      laudoPersonalizado: base.laudoPersonalizado,
      retorno: retorno,
      referencia: base.referencia,
      contrarreferencia: base.contrarreferencia,
      previewHtml: normalizePreviewHtml(base.previewHtml),
      atualizadoEm: Date.now(),
    });
    if (
      retornoPartial &&
      Object.prototype.hasOwnProperty.call(retornoPartial, "diagnostico")
    ) {
      next = syncDiagnosticoBetweenLaudoRetorno(next, "retorno");
    }
    var touchesRetornoLines =
      retornoPartial &&
      (Object.prototype.hasOwnProperty.call(retornoPartial, "descricaoAto") ||
        Object.prototype.hasOwnProperty.call(retornoPartial, "dataCirurgia"));
    if (touchesRetornoLines) {
      next = syncLaudoLinesFromRetorno(next);
    }
    return next;
  }


  function patchReferencia(snap, partial) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.patchReferencia === "function") {
      return finalizeAltaSnap(api.patchReferencia(snap, partial));
    }
    return finalizeAltaSnap(snap);
  }

  function patchContrarreferencia(snap, partial) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.patchContrarreferencia === "function") {
      return finalizeAltaSnap(api.patchContrarreferencia(snap, partial));
    }
    return finalizeAltaSnap(snap);
  }

  function applyPiiToEncaminhamento(snap, patientRecord, options) {
    var api = getEncaminhamentoApi();
    if (api && typeof api.applyPiiToEncaminhamento === "function") {
      return finalizeAltaSnap(
        api.applyPiiToEncaminhamento(snap, patientRecord, options),
      );
    }
    return finalizeAltaSnap(snap);
  }

  function normalizeSnapCore(raw) {
    if (!raw || typeof raw !== "object") return emptyAltaSnap();
    var receitaSnap = receitaSchema.normalizeSnap(raw);
    var version =
      typeof raw.version === "number" && raw.version >= ALTA_SNAP_VERSION
        ? ALTA_SNAP_VERSION
        : raw.version === 1
          ? ALTA_SNAP_VERSION
          : ALTA_SNAP_VERSION;
    return {
      version: version,
      receitas: receitaSnap.receitas,
      orientacoes: normalizeOrientacoes(raw.orientacoes),
      laudo: normalizeLaudo(raw.laudo),
      atestado: normalizeAtestado(raw.atestado),
      acompanhante: normalizeAcompanhante(raw.acompanhante),
      laudoPersonalizado: normalizeLaudoPersonalizado(raw.laudoPersonalizado),
      retorno: normalizeRetorno(raw.retorno),
      referencia: encNormalizeReferencia(raw.referencia),
      contrarreferencia: encNormalizeContrarreferencia(raw.contrarreferencia),
      previewHtml: normalizePreviewHtml(raw.previewHtml),
      atualizadoEm:
        typeof raw.atualizadoEm === "number"
          ? raw.atualizadoEm
          : receitaSnap.atualizadoEm,
    };
  }

  function normalizeSnap(raw, options) {
    var snap = normalizeSnapCore(raw);
    if (options && options.passometro) {
      snap = applyPassometroToAlta(snap, options.passometro, {
        fillEmptyOnly: true,
        patientEpisodes:
          options.patientEpisodes || options.patient_episodes || null,
      });
    } else {
      snap = finalizeAltaSnap(snap);
      snap = syncRetornoEmptyFromLaudo(snap);
      snap = syncAtestadoEmptyFromLaudo(snap);
    }
    return snap;
  }

  function orientacoesHasContent(orientacoes) {
    var o = normalizeOrientacoes(orientacoes);
    return o.items.length > 0;
  }

  function laudoHasContent(laudo) {
    var l = normalizeLaudo(laudo);
    return !!(
      l.dataInternacao ||
      l.diagnostico ||
      l.procedimento ||
      l.dataProcedimento ||
      (Array.isArray(l.procedimentos) && l.procedimentos.length > 0) ||
      l.evolucao ||
      l.cid10
    );
  }

  function retornoHasContent(retorno) {
    var r = normalizeRetorno(retorno);
    var ap = getAltaProcedimentos();
    var equipesFilled =
      ap &&
      typeof ap.equipesHasContent === "function" &&
      ap.equipesHasContent(r.equipes);
    return !!(
      r.diagnostico ||
      r.descricaoAto ||
      r.dataCirurgia ||
      equipesFilled ||
      r.localRetorno ||
      r.dataHoraRetorno ||
      r.medicoRetorno
    );
  }

  function atestadoHasContent(atestado) {
    var a = normalizeAtestado(atestado);
    return !!(a.procedimento || a.dataInicioAfastamento || a.cid10);
  }

  function lineHasMedication(line) {
    return !!(line && String(line.drugName || "").trim());
  }

  function snapHasMedicationLines(snap) {
    if (!snap || !Array.isArray(snap.receitas)) return false;
    for (var i = 0; i < snap.receitas.length; i++) {
      var d = snap.receitas[i];
      if (!d || !Array.isArray(d.lines)) continue;
      for (var j = 0; j < d.lines.length; j++) {
        if (lineHasMedication(d.lines[j])) return true;
      }
    }
    return false;
  }

  function acompanhanteHasContent(acompanhante) {
    var a = normalizeAcompanhante(acompanhante);
    return Boolean(String(a.nomeAcompanhante || "").trim());
  }

  function laudoPersonalizadoHasContent(laudoPersonalizado) {
    var lp = normalizeLaudoPersonalizado(laudoPersonalizado);
    return Boolean(String(lp.titulo || "").trim() || String(lp.corpo || "").trim());
  }

  function snapHasAltaContent(snap) {
    if (!snap || typeof snap !== "object") return false;
    if (snapHasMedicationLines(snap)) return true;
    if (orientacoesHasContent(snap.orientacoes)) return true;
    if (laudoHasContent(snap.laudo)) return true;
    if (laudoPersonalizadoHasContent(snap.laudoPersonalizado)) return true;
    if (atestadoHasContent(snap.atestado)) return true;
    if (acompanhanteHasContent(snap.acompanhante)) return true;
    if (retornoHasContent(snap.retorno)) return true;
    if (encReferenciaHasContent(snap.referencia)) return true;
    if (encContrarreferenciaHasContent(snap.contrarreferencia)) return true;
    var receitas = snap.receitas;
    return Array.isArray(receitas) && receitas.length > 0;
  }

  function snapHasSaveableContent(snap, nome) {
    if (snapHasAltaContent(snap)) return true;
    return receitaSchema.snapHasSaveableContent(snap, nome);
  }

  function defaultOrientacoesItems() {
    return altaDefaults.DEFAULT_ORIENTACOES_ITEMS.slice();
  }

  function applyDefaultOrientacoes(snap) {
    var normalized = normalizeSnap(snap);
    normalized.orientacoes = {
      items: defaultOrientacoesItems(),
      updatedAt: Date.now(),
    };
    return normalized;
  }

  return {
    ALTA_SNAP_VERSION: ALTA_SNAP_VERSION,
    emptyAltaSnap: emptyAltaSnap,
    emptyOrientacoes: emptyOrientacoes,
    emptyLaudo: emptyLaudo,
    emptyAtestado: emptyAtestado,
    emptyAcompanhante: emptyAcompanhante,
    emptyLaudoPersonalizado: emptyLaudoPersonalizado,
    emptyRetorno: emptyRetorno,
    emptyPreviewHtml: emptyPreviewHtml,
    isLegacyRetornoPreviewHtml: isLegacyRetornoPreviewHtml,
    sanitizePreviewHtmlSection: sanitizePreviewHtmlSection,
    normalizePreviewHtml: normalizePreviewHtml,
    clearPreviewHtmlSection: clearPreviewHtmlSection,
    clearReceituarioDocPreview: clearReceituarioDocPreview,
    clearAllReceituarioDocPreviews: clearAllReceituarioDocPreviews,
    normalizeReceituarioDocs: normalizeReceituarioDocs,
    normalizeSnap: normalizeSnap,
    normalizeSnapCore: normalizeSnapCore,
    patchLaudo: patchLaudo,
    patchAtestado: patchAtestado,
    patchAcompanhante: patchAcompanhante,
    patchLaudoPersonalizado: patchLaudoPersonalizado,
    patchRetorno: patchRetorno,
    patchReferencia: patchReferencia,
    patchContrarreferencia: patchContrarreferencia,
    applyPiiToEncaminhamento: applyPiiToEncaminhamento,
    emptyReferencia: encEmptyReferencia,
    emptyContrarreferencia: encEmptyContrarreferencia,
    normalizeReferencia: encNormalizeReferencia,
    normalizeContrarreferencia: encNormalizeContrarreferencia,
    referenciaHasContent: encReferenciaHasContent,
    contrarreferenciaHasContent: encContrarreferenciaHasContent,
    reconcileLinkedLaudoAtestado: reconcileLinkedLaudoAtestado,
    reconcileLaudoToRetorno: reconcileLaudoToRetorno,
    syncRetornoEmptyFromLaudo: syncRetornoEmptyFromLaudo,
    syncRetornoLinesFromLaudo: syncRetornoLinesFromLaudo,
    syncLaudoLinesFromRetorno: syncLaudoLinesFromRetorno,
    syncAtestadoEmptyFromLaudo: syncAtestadoEmptyFromLaudo,
    syncDiagnosticoBetweenLaudoRetorno: syncDiagnosticoBetweenLaudoRetorno,
    applyAtestadoProcedimentoToLaudo: applyAtestadoProcedimentoToLaudo,
    applyRetornoLinesToLaudo: applyRetornoLinesToLaudo,
    finalizeAltaSnap: finalizeAltaSnap,
    extractAltaSeedFromPassometro: extractAltaSeedFromPassometro,
    applyPassometroToAlta: applyPassometroToAlta,
    passometroBrDateToIso: passometroBrDateToIso,
    LINKED_LAUDO_TO_ATESTADO: LINKED_LAUDO_TO_ATESTADO,
    normalizeOrientacoes: normalizeOrientacoes,
    normalizeLaudo: normalizeLaudo,
    normalizeAtestado: normalizeAtestado,
    normalizeAcompanhante: normalizeAcompanhante,
    normalizeLaudoPersonalizado: normalizeLaudoPersonalizado,
    normalizeRetorno: normalizeRetorno,
    orientacoesHasContent: orientacoesHasContent,
    laudoHasContent: laudoHasContent,
    laudoPersonalizadoHasContent: laudoPersonalizadoHasContent,
    atestadoHasContent: atestadoHasContent,
    acompanhanteHasContent: acompanhanteHasContent,
    retornoHasContent: retornoHasContent,
    snapHasAltaContent: snapHasAltaContent,
    snapHasSaveableContent: snapHasSaveableContent,
    defaultOrientacoesItems: defaultOrientacoesItems,
    applyDefaultOrientacoes: applyDefaultOrientacoes,
    DEFAULT_SERVICE_LINE: altaDefaults.DEFAULT_SERVICE_LINE,
    DEFAULT_LOCATION_LINE: altaDefaults.DEFAULT_LOCATION_LINE,
    DEFAULT_LAUDO_EVOLUCAO: altaDefaults.DEFAULT_LAUDO_EVOLUCAO,
    DEFAULT_RETORNO_LOCAL: altaDefaults.DEFAULT_RETORNO_LOCAL,
    // reexport receita helpers used by alta editor
    emptyReceitaDoc: receitaSchema.emptyReceitaDoc,
    emptyReceitaSnap: receitaSchema.emptyReceitaSnap,
    normalizePatientAddress: receitaSchema.normalizePatientAddress,
    hasPatientAddressContent: receitaSchema.hasPatientAddressContent,
    resolveBestPatientAddressFromSnap: receitaSchema.resolveBestPatientAddressFromSnap,
  };
});
