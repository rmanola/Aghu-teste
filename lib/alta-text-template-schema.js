/**
 * Schema de templates de texto de alta (orientações, laudo, atestado).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaTextTemplateSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KIND_ORIENTACOES = "orientacoes";
  var KIND_LAUDO = "laudo";
  var KIND_ATESTADO = "atestado";
  var KIND_RETORNO = "retorno";
  var KIND_REFERENCIA = "referencia";
  var VALID_KINDS = [
    KIND_ORIENTACOES,
    KIND_LAUDO,
    KIND_ATESTADO,
    KIND_RETORNO,
    KIND_REFERENCIA,
  ];

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-" + String(Date.now()).slice(-12);
  }

  function emptySnap() {
    return { version: 1, templates: [], atualizadoEm: null };
  }

  function normalizeKind(raw) {
    var k = String(raw || "").trim();
    if (VALID_KINDS.indexOf(k) >= 0) return k;
    return KIND_ORIENTACOES;
  }

  function normalizeOrientacoesItems(raw) {
    var items = [];
    if (!Array.isArray(raw)) return items;
    for (var i = 0; i < raw.length; i++) {
      var t = String(raw[i] || "").trim();
      if (t) items.push(t);
    }
    return items;
  }

  function normalizeLaudoPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    var evolucao = String(raw.evolucao || "").trim();
    if (!evolucao) return null;
    return {
      evolucao: evolucao,
      semIntercorrencias: raw.semIntercorrencias !== false,
      cid10: raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "",
      divulgacaoCidAutorizada: !!raw.divulgacaoCidAutorizada,
    };
  }

  function normalizeAtestadoPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    var dias = raw.diasAfastamento;
    var diasNum =
      typeof dias === "number" && Number.isFinite(dias) && dias > 0
        ? Math.floor(dias)
        : 15;
    return {
      diasAfastamento: diasNum,
      cid10: raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "",
      divulgacaoCidAutorizada: !!raw.divulgacaoCidAutorizada,
    };
  }

  function normalizeRetornoPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    var payload = {
      localRetorno: raw.localRetorno ? String(raw.localRetorno).trim() : "",
      dataHoraRetorno: raw.dataHoraRetorno
        ? String(raw.dataHoraRetorno).trim()
        : "",
      medicoRetorno: raw.medicoRetorno ? String(raw.medicoRetorno).trim() : "",
      staff: raw.staff ? String(raw.staff).trim() : "",
      auxiliar1: raw.auxiliar1 ? String(raw.auxiliar1).trim() : "",
      auxiliar2: raw.auxiliar2 ? String(raw.auxiliar2).trim() : "",
    };
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      if (payload[keys[i]]) return payload;
    }
    return null;
  }

  function normalizeReferenciaPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    var payload = {
      especialidadeOrigem: raw.especialidadeOrigem
        ? String(raw.especialidadeOrigem).trim()
        : "",
      encaminhadoPara: raw.encaminhadoPara
        ? String(raw.encaminhadoPara).trim()
        : "",
      cid10: raw.cid10 ? String(raw.cid10).trim().toUpperCase() : "",
      hipoteseDiagnostica: raw.hipoteseDiagnostica
        ? String(raw.hipoteseDiagnostica).trim()
        : "",
    };
    if (
      !payload.especialidadeOrigem &&
      !payload.encaminhadoPara &&
      !payload.cid10 &&
      !payload.hipoteseDiagnostica
    ) {
      return null;
    }
    return payload;
  }

  function normalizeTemplate(raw) {
    if (!raw || typeof raw !== "object") return null;
    var kind = normalizeKind(raw.kind);
    var now = Date.now();
    var base = {
      id: raw.id && String(raw.id) ? String(raw.id) : newId(),
      name: String(raw.name || "").trim() || "Modelo",
      description: String(raw.description || "").trim(),
      kind: kind,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
    };

    if (kind === KIND_LAUDO) {
      var laudo = normalizeLaudoPayload(raw.laudo);
      if (!laudo) return null;
      base.laudo = laudo;
      return base;
    }

    if (kind === KIND_ATESTADO) {
      var atestado = normalizeAtestadoPayload(raw.atestado);
      if (!atestado) return null;
      base.atestado = atestado;
      return base;
    }

    if (kind === KIND_RETORNO) {
      var retorno = normalizeRetornoPayload(raw.retorno);
      if (!retorno) return null;
      base.retorno = retorno;
      return base;
    }

    if (kind === KIND_REFERENCIA) {
      var referencia = normalizeReferenciaPayload(raw.referencia);
      if (!referencia) return null;
      base.referencia = referencia;
      return base;
    }

    var items = normalizeOrientacoesItems(raw.orientacoesItems);
    if (!items.length) return null;
    base.orientacoesItems = items;
    return base;
  }

  function normalizeSnap(raw) {
    if (!raw || typeof raw !== "object") return emptySnap();
    var templates = [];
    if (Array.isArray(raw.templates)) {
      for (var i = 0; i < raw.templates.length; i++) {
        var t = normalizeTemplate(raw.templates[i]);
        if (t) templates.push(t);
      }
    }
    return {
      version: 1,
      templates: templates,
      atualizadoEm:
        typeof raw.atualizadoEm === "number" ? raw.atualizadoEm : null,
    };
  }

  function filterTemplatesByKind(templates, kind) {
    var k = normalizeKind(kind);
    var list = Array.isArray(templates) ? templates : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && normalizeKind(list[i].kind) === k) out.push(list[i]);
    }
    return out;
  }

  return {
    KIND_ORIENTACOES: KIND_ORIENTACOES,
    KIND_LAUDO: KIND_LAUDO,
    KIND_ATESTADO: KIND_ATESTADO,
    KIND_RETORNO: KIND_RETORNO,
    KIND_REFERENCIA: KIND_REFERENCIA,
    VALID_KINDS: VALID_KINDS,
    emptySnap: emptySnap,
    normalizeSnap: normalizeSnap,
    normalizeTemplate: normalizeTemplate,
    normalizeKind: normalizeKind,
    filterTemplatesByKind: filterTemplatesByKind,
    newId: newId,
  };
});
