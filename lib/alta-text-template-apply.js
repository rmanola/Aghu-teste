/**
 * Aplica templates de texto de alta ao AltaSnapV2.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./alta-schema.js")
      : root.AghuAltaSchema,
    typeof require !== "undefined"
      ? require("./alta-text-template-schema.js")
      : root.AghuAltaTextTemplateSchema,
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaTextTemplateApply = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  altaSchema,
  altaTextSchema,
) {
  "use strict";

  if (!altaSchema) {
    throw new Error("alta-text-template-apply: alta-schema required");
  }
  if (!altaTextSchema) {
    throw new Error("alta-text-template-apply: alta-text-template-schema required");
  }

  var LAUDO_PRESERVE_KEYS = [
    "dataInternacao",
    "diagnostico",
    "procedimento",
    "dataProcedimento",
  ];
  var ATESTADO_PRESERVE_KEYS = ["procedimento", "dataInicioAfastamento"];
  var RETORNO_PRESERVE_KEYS = ["diagnostico", "descricaoAto", "dataCirurgia"];
  var MISSING_DATE_BR = "__/__/__";

  function getAltaProcedimentos() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-procedimentos.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaProcedimentos || null;
  }

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return globalThis.AghuDateBr || null;
  }

  function isoFromMs(nowMs) {
    var d = new Date(
      typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now(),
    );
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function toBrYy(iso) {
    var dateBr = getDateBr();
    if (dateBr && typeof dateBr.isoToBrYy === "function") {
      return dateBr.isoToBrYy(iso) || "";
    }
    if (!iso) return "";
    var p = String(iso).trim().split("-");
    if (p.length !== 3) return "";
    return (
      String(p[2]).padStart(2, "0") +
      "/" +
      String(p[1]).padStart(2, "0") +
      "/" +
      String(p[0]).slice(-2)
    );
  }

  function interpolateOrientacaoItem(text, snap, nowMs) {
    var laudo = snap && snap.laudo ? snap.laudo : {};
    var internacaoIso = laudo.dataInternacao
      ? String(laudo.dataInternacao).trim()
      : "";
    var internacaoBr = toBrYy(internacaoIso) || MISSING_DATE_BR;
    var hojeBr = toBrYy(isoFromMs(nowMs)) || MISSING_DATE_BR;
    return String(text)
      .replace(/\{\{dataInternacao\}\}/g, internacaoBr)
      .replace(/\{\{dataHoje\}\}/g, hojeBr);
  }

  function resolveRetornoAtoCountForTemplate(laudo, retorno) {
    var ap = getAltaProcedimentos();
    var atoCount = 0;
    if (laudo && ap && typeof ap.resolveProcedimentosFromLaudo === "function") {
      atoCount = ap.resolveProcedimentosFromLaudo(laudo).length;
    }
    if (!atoCount && retorno && ap && typeof ap.countMultilineLines === "function") {
      atoCount = ap.countMultilineLines(retorno.descricaoAto);
    }
    if (!atoCount && retorno && Array.isArray(retorno.equipes)) {
      atoCount = retorno.equipes.length;
    }
    return atoCount > 0 ? atoCount : 1;
  }

  function applyEquipeScalarsToEquipes(equipes, atoCount, src) {
    var ap = getAltaProcedimentos();
    if (!ap || typeof ap.normalizeEquipes !== "function") return equipes;
    var next = ap.normalizeEquipes(equipes, atoCount, null);
    var staff = src.staff ? String(src.staff).trim() : "";
    var aux1 = src.auxiliar1 ? String(src.auxiliar1).trim() : "";
    var aux2 = src.auxiliar2 ? String(src.auxiliar2).trim() : "";
    for (var i = 0; i < next.length; i++) {
      if (staff && !next[i].staff) next[i].staff = staff;
      if (aux1) {
        next[i] = ap.normalizeEquipeItem(next[i]);
        var aux = next[i].auxiliares.slice();
        while (aux.length < 1) aux.push("");
        if (!aux[0]) aux[0] = aux1;
        next[i].auxiliares = aux;
      }
      if (aux2) {
        next[i] = ap.normalizeEquipeItem(next[i]);
        var aux2List = next[i].auxiliares.slice();
        while (aux2List.length < 2) aux2List.push("");
        if (!aux2List[1]) aux2List[1] = aux2;
        next[i].auxiliares = aux2List;
      }
    }
    return next;
  }

  function applyOrientacoesTemplate(snap, template, nowMs) {
    var base = altaSchema.normalizeSnap(snap);
    if (!template || !Array.isArray(template.orientacoesItems)) return base;
    var stamp =
      typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    var items = [];
    for (var i = 0; i < template.orientacoesItems.length; i++) {
      var t = String(template.orientacoesItems[i] || "").trim();
      if (!t) continue;
      items.push(interpolateOrientacaoItem(t, base, stamp));
    }
    return altaSchema.normalizeSnap({
      version: base.version,
      receitas: base.receitas,
      orientacoes: { items: items, updatedAt: stamp },
      laudo: base.laudo,
      atestado: base.atestado,
      retorno: base.retorno,
      atualizadoEm: stamp,
    });
  }

  function buildLaudoPatchFromTemplate(template, currentLaudo) {
    if (!template || !template.laudo) return null;
    var patch = {};
    var src = template.laudo;
    if (src.evolucao) patch.evolucao = String(src.evolucao).trim();
    if (typeof src.semIntercorrencias === "boolean") {
      patch.semIntercorrencias = src.semIntercorrencias;
    }
    if (src.cid10) patch.cid10 = String(src.cid10).trim().toUpperCase();
    if (typeof src.divulgacaoCidAutorizada === "boolean") {
      patch.divulgacaoCidAutorizada = src.divulgacaoCidAutorizada;
    }
    var laudo = Object.assign({}, currentLaudo || {}, patch);
    for (var i = 0; i < LAUDO_PRESERVE_KEYS.length; i++) {
      var k = LAUDO_PRESERVE_KEYS[i];
      if (currentLaudo && currentLaudo[k] != null && String(currentLaudo[k]).trim()) {
        laudo[k] = currentLaudo[k];
      }
    }
    return laudo;
  }

  function applyLaudoTemplate(snap, template) {
    var base = altaSchema.normalizeSnap(snap);
    var laudo = buildLaudoPatchFromTemplate(template, base.laudo);
    if (!laudo) return base;
    return altaSchema.patchLaudo(base, laudo);
  }

  function buildAtestadoPatchFromTemplate(template, currentAtestado) {
    if (!template || !template.atestado) return null;
    var patch = {};
    var src = template.atestado;
    if (
      typeof src.diasAfastamento === "number" &&
      Number.isFinite(src.diasAfastamento) &&
      src.diasAfastamento > 0
    ) {
      patch.diasAfastamento = Math.floor(src.diasAfastamento);
    }
    if (src.cid10) patch.cid10 = String(src.cid10).trim().toUpperCase();
    if (typeof src.divulgacaoCidAutorizada === "boolean") {
      patch.divulgacaoCidAutorizada = src.divulgacaoCidAutorizada;
    }
    var atestado = Object.assign({}, currentAtestado || {}, patch);
    for (var i = 0; i < ATESTADO_PRESERVE_KEYS.length; i++) {
      var k = ATESTADO_PRESERVE_KEYS[i];
      if (
        currentAtestado &&
        currentAtestado[k] != null &&
        String(currentAtestado[k]).trim()
      ) {
        atestado[k] = currentAtestado[k];
      }
    }
    return atestado;
  }

  function applyAtestadoTemplate(snap, template) {
    var base = altaSchema.normalizeSnap(snap);
    var atestado = buildAtestadoPatchFromTemplate(template, base.atestado);
    if (!atestado) return base;
    return altaSchema.patchAtestado(base, atestado);
  }

  function buildRetornoPatchFromTemplate(template, currentRetorno, laudo) {
    if (!template || !template.retorno) return null;
    var patch = {};
    var src = template.retorno;
    if (src.localRetorno) patch.localRetorno = String(src.localRetorno).trim();
    if (src.dataHoraRetorno) {
      patch.dataHoraRetorno = String(src.dataHoraRetorno).trim();
    }
    if (src.medicoRetorno) patch.medicoRetorno = String(src.medicoRetorno).trim();
    if (src.staff || src.auxiliar1 || src.auxiliar2) {
      var atoCount = resolveRetornoAtoCountForTemplate(laudo, currentRetorno);
      patch.equipes = applyEquipeScalarsToEquipes(
        currentRetorno && currentRetorno.equipes,
        atoCount,
        src,
      );
    }
    var retorno = Object.assign({}, currentRetorno || {}, patch);
    for (var i = 0; i < RETORNO_PRESERVE_KEYS.length; i++) {
      var k = RETORNO_PRESERVE_KEYS[i];
      if (
        currentRetorno &&
        currentRetorno[k] != null &&
        String(currentRetorno[k]).trim()
      ) {
        retorno[k] = currentRetorno[k];
      }
    }
    if (currentRetorno && Array.isArray(currentRetorno.equipes) && patch.equipes) {
      var ap = getAltaProcedimentos();
      if (ap && typeof ap.normalizeEquipes === "function") {
        var merged = ap.normalizeEquipes(currentRetorno.equipes, patch.equipes.length, null);
        for (var j = 0; j < merged.length; j++) {
          var cur = merged[j];
          var next = patch.equipes[j] || ap.emptyEquipe();
          merged[j] = ap.mergeEquipesPatch([cur], [next], 1)[0];
        }
        retorno.equipes = merged;
      }
    }
    return retorno;
  }

  function applyRetornoTemplate(snap, template) {
    var base = altaSchema.normalizeSnap(snap);
    var retorno = buildRetornoPatchFromTemplate(template, base.retorno, base.laudo);
    if (!retorno) return base;
    return altaSchema.patchRetorno(base, retorno);
  }

  var REFERENCIA_PRESERVE_KEYS = [
    "nomePaciente",
    "sexo",
    "nomeMae",
    "telefone",
    "cartaoSus",
    "dataNascimento",
    "idade",
    "prontuarioHucam",
    "motivoEncaminhamento",
    "examesTratamento",
    "estabelecimentoSaude",
    "cnes",
  ];

  function buildReferenciaPatchFromTemplate(template, currentReferencia) {
    if (!template || !template.referencia) return null;
    var src = template.referencia;
    var patch = {};
    if (src.especialidadeOrigem) {
      patch.especialidadeOrigem = String(src.especialidadeOrigem).trim();
    }
    if (src.encaminhadoPara) {
      patch.encaminhadoPara = String(src.encaminhadoPara).trim();
    }
    if (src.cid10) patch.cid = String(src.cid10).trim().toUpperCase();
    if (src.hipoteseDiagnostica) {
      patch.hipoteseDiagnostica = String(src.hipoteseDiagnostica).trim();
    }
    var referencia = Object.assign({}, currentReferencia || {}, patch);
    for (var i = 0; i < REFERENCIA_PRESERVE_KEYS.length; i++) {
      var k = REFERENCIA_PRESERVE_KEYS[i];
      if (
        currentReferencia &&
        currentReferencia[k] != null &&
        String(currentReferencia[k]).trim()
      ) {
        referencia[k] = currentReferencia[k];
      }
    }
    return referencia;
  }

  function applyReferenciaTemplate(snap, template) {
    var base = altaSchema.normalizeSnap(snap);
    var referencia = buildReferenciaPatchFromTemplate(
      template,
      base.referencia,
    );
    if (!referencia) return base;
    if (typeof altaSchema.patchReferencia === "function") {
      return altaSchema.patchReferencia(base, referencia);
    }
    return base;
  }

  function applyTemplate(snap, template) {
    if (!template) return altaSchema.normalizeSnap(snap);
    var kind = altaTextSchema.normalizeKind(template.kind);
    if (kind === altaTextSchema.KIND_LAUDO) {
      return applyLaudoTemplate(snap, template);
    }
    if (kind === altaTextSchema.KIND_ATESTADO) {
      return applyAtestadoTemplate(snap, template);
    }
    if (kind === altaTextSchema.KIND_RETORNO) {
      return applyRetornoTemplate(snap, template);
    }
    if (
      altaTextSchema.KIND_REFERENCIA &&
      kind === altaTextSchema.KIND_REFERENCIA
    ) {
      return applyReferenciaTemplate(snap, template);
    }
    return applyOrientacoesTemplate(snap, template);
  }

  return {
    applyOrientacoesTemplate: applyOrientacoesTemplate,
    applyLaudoTemplate: applyLaudoTemplate,
    applyAtestadoTemplate: applyAtestadoTemplate,
    applyRetornoTemplate: applyRetornoTemplate,
    applyReferenciaTemplate: applyReferenciaTemplate,
    applyTemplate: applyTemplate,
    interpolateOrientacaoItem: interpolateOrientacaoItem,
    LAUDO_PRESERVE_KEYS: LAUDO_PRESERVE_KEYS,
    ATESTADO_PRESERVE_KEYS: ATESTADO_PRESERVE_KEYS,
    RETORNO_PRESERVE_KEYS: RETORNO_PRESERVE_KEYS,
    REFERENCIA_PRESERVE_KEYS: REFERENCIA_PRESERVE_KEYS,
  };
});
