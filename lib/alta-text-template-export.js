/**
 * Exporta secções do AltaSnapV2 para payloads de template de texto (simétrico ao apply).
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./alta-text-template-schema.js")
      : root.AghuAltaTextTemplateSchema,
    typeof require !== "undefined"
      ? require("./alta-schema.js")
      : root.AghuAltaSchema,
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaTextTemplateExport = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  altaTextSchema,
  altaSchema,
) {
  "use strict";

  if (!altaTextSchema) {
    throw new Error("alta-text-template-export: alta-text-template-schema required");
  }
  if (!altaSchema) {
    throw new Error("alta-text-template-export: alta-schema required");
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

  function exportOrientacoesTemplatePayload(orientacoes) {
    var norm = altaSchema.normalizeOrientacoes(orientacoes);
    var items = normalizeOrientacoesItems(norm.items);
    if (!items.length) return null;
    return { orientacoesItems: items };
  }

  function exportLaudoTemplatePayload(laudo) {
    var norm = altaSchema.normalizeLaudo(laudo);
    var evolucao = String(norm.evolucao || "").trim();
    if (!evolucao) return null;
    return {
      laudo: {
        evolucao: evolucao,
        semIntercorrencias: norm.semIntercorrencias !== false,
        cid10: norm.cid10 ? String(norm.cid10).trim().toUpperCase() : "",
        divulgacaoCidAutorizada: !!norm.divulgacaoCidAutorizada,
      },
    };
  }

  function exportAtestadoTemplatePayload(atestado) {
    var norm = altaSchema.normalizeAtestado(atestado);
    var dias = norm.diasAfastamento;
    var diasNum =
      typeof dias === "number" && Number.isFinite(dias) && dias > 0
        ? Math.floor(dias)
        : 15;
    return {
      atestado: {
        diasAfastamento: diasNum,
        cid10: norm.cid10 ? String(norm.cid10).trim().toUpperCase() : "",
        divulgacaoCidAutorizada: !!norm.divulgacaoCidAutorizada,
      },
    };
  }

  function getAltaProcedimentos() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-procedimentos.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaProcedimentos || null;
  }

  function exportRetornoEquipeScalars(equipes) {
    var ap = getAltaProcedimentos();
    var list = Array.isArray(equipes) ? equipes : [];
    if (!list.length || !ap) {
      return { staff: "", auxiliar1: "", auxiliar2: "" };
    }
    var first = ap.normalizeEquipeItem(list[0]);
    var allSameStaff = true;
    for (var i = 1; i < list.length; i++) {
      if (ap.normalizeEquipeItem(list[i]).staff !== first.staff) {
        allSameStaff = false;
        break;
      }
    }
    return {
      staff: allSameStaff ? first.staff : first.staff,
      auxiliar1: first.auxiliar1,
      auxiliar2: first.auxiliar2,
    };
  }

  function exportRetornoTemplatePayload(retorno, laudo) {
    var norm = altaSchema.normalizeRetorno(retorno, { laudo: laudo });
    var equipeScalars = exportRetornoEquipeScalars(norm.equipes);
    var payload = {
      localRetorno: norm.localRetorno ? String(norm.localRetorno).trim() : "",
      dataHoraRetorno: norm.dataHoraRetorno
        ? String(norm.dataHoraRetorno).trim()
        : "",
      medicoRetorno: norm.medicoRetorno ? String(norm.medicoRetorno).trim() : "",
      staff: equipeScalars.staff ? String(equipeScalars.staff).trim() : "",
      auxiliar1: equipeScalars.auxiliar1 ? String(equipeScalars.auxiliar1).trim() : "",
      auxiliar2: equipeScalars.auxiliar2 ? String(equipeScalars.auxiliar2).trim() : "",
    };
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      if (payload[keys[i]]) return { retorno: payload };
    }
    return null;
  }

  function exportReferenciaTemplatePayload(referencia) {
    var r = referencia && typeof referencia === "object" ? referencia : {};
    var payload = {
      especialidadeOrigem: r.especialidadeOrigem
        ? String(r.especialidadeOrigem).trim()
        : "",
      encaminhadoPara: r.encaminhadoPara
        ? String(r.encaminhadoPara).trim()
        : "",
      cid10: r.cid
        ? String(r.cid).trim().toUpperCase()
        : r.cid10
          ? String(r.cid10).trim().toUpperCase()
          : "",
      hipoteseDiagnostica: r.hipoteseDiagnostica
        ? String(r.hipoteseDiagnostica).trim()
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
    return { referencia: payload };
  }

  function exportTemplatePayload(kind, section) {
    var k = altaTextSchema.normalizeKind(kind);
    if (k === altaTextSchema.KIND_LAUDO) {
      return exportLaudoTemplatePayload(section);
    }
    if (k === altaTextSchema.KIND_ATESTADO) {
      return exportAtestadoTemplatePayload(section);
    }
    if (k === altaTextSchema.KIND_RETORNO) {
      return exportRetornoTemplatePayload(section);
    }
    if (
      altaTextSchema.KIND_REFERENCIA &&
      k === altaTextSchema.KIND_REFERENCIA
    ) {
      return exportReferenciaTemplatePayload(section);
    }
    return exportOrientacoesTemplatePayload(section);
  }

  function canExportTemplate(kind, section) {
    return exportTemplatePayload(kind, section) !== null;
  }

  function buildTextTemplateDraft(kind, name, section) {
    var k = altaTextSchema.normalizeKind(kind);
    var payload = exportTemplatePayload(k, section);
    if (!payload) return null;
    var now = Date.now();
    return Object.assign(
      {
        name: String(name || "").trim(),
        description: "",
        kind: k,
        createdAt: now,
        updatedAt: now,
      },
      payload,
    );
  }

  return {
    exportOrientacoesTemplatePayload: exportOrientacoesTemplatePayload,
    exportLaudoTemplatePayload: exportLaudoTemplatePayload,
    exportAtestadoTemplatePayload: exportAtestadoTemplatePayload,
    exportRetornoTemplatePayload: exportRetornoTemplatePayload,
    exportReferenciaTemplatePayload: exportReferenciaTemplatePayload,
    exportTemplatePayload: exportTemplatePayload,
    canExportTemplate: canExportTemplate,
    buildTextTemplateDraft: buildTextTemplateDraft,
  };
});
