/**
 * Extrai alterações das regiões editáveis da pré-visualização → patch parcial do AltaSnapV2.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPreviewSync = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DATE_FIELD_PATHS = {
    "laudo.dataInternacao": true,
    "atestado.dataInicioAfastamento": true,
    "acompanhante.dataInicio": true,
  };

  var PROCEDIMENTO_DATE_PATH_RE = /^laudo\.procedimentos\.(\d+)\.data$/;

  var MULTILINE_FIELD_PATHS = {
    "laudoPersonalizado.corpo": true,
    "retorno.descricaoAto": true,
    "retorno.dataCirurgia": true,
    "retorno.staff": true,
    "retorno.auxiliar1": true,
    "retorno.auxiliar2": true,
  };

  // Free-text: não trimar no extract (ALTA-AC-97 / AC-86). Datas usam normalizeDateField.
  var NO_TRIM_FIELD_PATHS = {
    "acompanhante.nomeAcompanhante": true,
    "laudo.diagnostico": true,
    "laudo.evolucao": true,
    "laudo.procedimento": true,
    "atestado.procedimento": true,
    "retorno.diagnostico": true,
    "retorno.descricaoAto": true,
    "retorno.localRetorno": true,
    "retorno.dataHoraRetorno": true,
    "retorno.medicoRetorno": true,
    "laudoPersonalizado.titulo": true,
    "laudoPersonalizado.corpo": true,
  };

  var NO_TRIM_FIELD_PATH_RE =
    /^(laudo\.procedimentos\.\d+\.descricao|retorno\.atos\.\d+\.descricao|retorno\.equipes\.\d+\.staff|retorno\.equipes\.\d+\.auxiliares\.\d+|orientacoes\.items\.\d+)$/;

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return globalThis.AghuDateBr;
  }

  function getPreviewSanitize() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-preview-sanitize.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPreviewSanitize;
  }

  function getReceitaPreviewSync() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-preview-sync.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaPreviewSync;
  }

  function getPreviewEditable() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-preview-editable.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPreviewEditable;
  }

  function getAltaProcedimentos() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-procedimentos.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaProcedimentos;
  }

  function stripEditablePlaceholder(raw) {
    var mod = getPreviewEditable();
    if (mod && typeof mod.stripEditablePlaceholder === "function") {
      return mod.stripEditablePlaceholder(raw);
    }
    if (raw == null) return "";
    // Sem .trim() — preserva espaços durante digitação (ALTA-AC-97).
    return String(raw).replace(/\u00a0/g, " ");
  }

  function sanitizePreviewHtml(html) {
    var mod = getPreviewSanitize();
    if (mod && typeof mod.sanitizePreviewHtml === "function") {
      return mod.sanitizePreviewHtml(html);
    }
    return html == null ? "" : String(html);
  }

  function normalizeMultilineField(_path, raw) {
    var text = stripEditablePlaceholder(raw);
    // Sem upper/trim por linha (ALTA-AC-97) — upper na impressão.
    if (text == null || text === "") return "";
    return String(text).replace(/\r\n/g, "\n").replace(/\n+$/, "");
  }

  function normalizeMultilineDateField(raw) {
    var text = stripEditablePlaceholder(raw);
    if (!text) return "";
    var dateBr = getDateBr();
    return text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        var trimmed = line.trim();
        if (!trimmed) return "";
        if (dateBr && typeof dateBr.brToIso === "function") {
          var iso = dateBr.brToIso(trimmed);
          if (iso) return iso;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        return trimmed;
      })
      .join("\n")
      .replace(/\n+$/, "");
  }

  function normalizeFieldText(path, raw) {
    var stripped = stripEditablePlaceholder(raw);
    var noTrim =
      NO_TRIM_FIELD_PATHS[path] ||
      (NO_TRIM_FIELD_PATH_RE && NO_TRIM_FIELD_PATH_RE.test(path));
    return noTrim ? stripped : stripped.trim();
  }

  function normalizeDateField(raw) {
    var text = stripEditablePlaceholder(raw).trim();
    if (!text) return "";
    var dateBr = getDateBr();
    if (dateBr && typeof dateBr.brToIso === "function") {
      var iso = dateBr.brToIso(text);
      if (iso) return iso;
    }
    return text;
  }

  function filterTrailingEmptyOrientacaoItems(items) {
    return items.filter(function (item, index, arr) {
      if (item) return true;
      return arr.slice(index + 1).some(function (next) {
        return Boolean(next && String(next).trim());
      });
    });
  }

  function reindexOrientacoesListFields(container) {
    if (!container) return;
    var ol = container.querySelector("ol.alta-orientacoes-list");
    if (!ol) return;
    var lis = ol.children;
    var index = 0;
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].tagName !== "LI") continue;
      lis[i].setAttribute("data-alta-field", "orientacoes.items." + index);
      if (!lis[i].classList.contains("alta-editable")) {
        lis[i].classList.add("alta-editable");
      }
      index += 1;
    }
  }

  function extractOrientacoesItemsFromOl(container) {
    var ol = container.querySelector("ol.alta-orientacoes-list");
    if (!ol) return null;
    reindexOrientacoesListFields(container);
    var items = [];
    var lis = ol.children;
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].tagName !== "LI") continue;
      var path = lis[i].getAttribute("data-alta-field") || "orientacoes.items." + items.length;
      items.push(normalizeFieldText(path, lis[i].textContent || ""));
    }
    return filterTrailingEmptyOrientacaoItems(items);
  }

  function extractOrientacoesItemsLegacy(container) {
    var nodes = container.querySelectorAll(
      'div.alta-item [data-alta-field^="orientacoes.items."], [data-alta-field^="orientacoes.items."]',
    );
    var maxIndex = -1;
    var byIndex = {};
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-alta-field") || "";
      var match = path.match(/^orientacoes\.items\.(\d+)$/);
      if (!match) continue;
      var idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx < 0) continue;
      byIndex[idx] = normalizeFieldText(path, nodes[i].textContent || "");
      if (idx > maxIndex) maxIndex = idx;
    }
    var items = [];
    for (var j = 0; j <= maxIndex; j++) {
      items.push(byIndex[j] != null ? byIndex[j] : "");
    }
    return filterTrailingEmptyOrientacaoItems(items);
  }

  function extractOrientacoesItems(container) {
    var fromOl = extractOrientacoesItemsFromOl(container);
    if (fromOl !== null) return fromOl;
    return extractOrientacoesItemsLegacy(container);
  }

  function extractLaudoProcedimentos(container) {
    var nodes = container.querySelectorAll('[data-alta-field^="laudo.procedimentos."]');
    var maxIndex = -1;
    var byIndex = {};
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-alta-field") || "";
      var match = path.match(/^laudo\.procedimentos\.(\d+)\.(descricao|data)$/);
      if (!match) continue;
      var idx = Number(match[1]);
      var key = match[2];
      if (!Number.isFinite(idx) || idx < 0) continue;
      if (!byIndex[idx]) byIndex[idx] = { descricao: "", data: "" };
      var raw = nodes[i].textContent || "";
      if (key === "data") {
        byIndex[idx].data = normalizeDateField(raw);
      } else {
        byIndex[idx].descricao = normalizeFieldText(path, raw);
      }
      if (idx > maxIndex) maxIndex = idx;
    }
    var list = [];
    for (var j = 0; j <= maxIndex; j++) {
      var item = byIndex[j] || { descricao: "", data: "" };
      if (item.descricao || item.data) list.push(item);
    }
    return list;
  }

  function extractRetornoAtos(container) {
    var nodes = container.querySelectorAll('[data-alta-field^="retorno.atos."]');
    var maxIndex = -1;
    var byIndex = {};
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-alta-field") || "";
      var match = path.match(/^retorno\.atos\.(\d+)\.(descricao|data)$/);
      if (!match) continue;
      var idx = Number(match[1]);
      var key = match[2];
      if (!Number.isFinite(idx) || idx < 0) continue;
      if (!byIndex[idx]) byIndex[idx] = { descricao: "", data: "" };
      var raw = nodes[i].textContent || "";
      if (key === "data") {
        byIndex[idx].data = normalizeDateField(raw);
      } else {
        byIndex[idx].descricao = normalizeFieldText(path, raw);
      }
      if (idx > maxIndex) maxIndex = idx;
    }
    var list = [];
    for (var j = 0; j <= maxIndex; j++) {
      list.push(byIndex[j] || { descricao: "", data: "" });
    }
    return list;
  }

  function extractRetornoEquipes(container) {
    var nodes = container.querySelectorAll('[data-alta-field^="retorno.equipes."]');
    var maxIndex = -1;
    var byIndex = {};
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-alta-field") || "";
      var auxMatch = path.match(/^retorno\.equipes\.(\d+)\.auxiliares\.(\d+)$/);
      if (auxMatch) {
        var eqIdx = Number(auxMatch[1]);
        var auxIdx = Number(auxMatch[2]);
        if (!Number.isFinite(eqIdx) || eqIdx < 0 || !Number.isFinite(auxIdx) || auxIdx < 0) {
          continue;
        }
        if (!byIndex[eqIdx]) byIndex[eqIdx] = { staff: "", auxiliares: [] };
        var auxList = byIndex[eqIdx].auxiliares.slice();
        while (auxList.length <= auxIdx) auxList.push("");
        auxList[auxIdx] = normalizeFieldText(path, nodes[i].textContent || "");
        byIndex[eqIdx].auxiliares = auxList;
        if (eqIdx > maxIndex) maxIndex = eqIdx;
        continue;
      }
      var match = path.match(/^retorno\.equipes\.(\d+)\.(staff|auxiliar1|auxiliar2)$/);
      if (!match) continue;
      var idx = Number(match[1]);
      var key = match[2];
      if (!Number.isFinite(idx) || idx < 0) continue;
      if (!byIndex[idx]) byIndex[idx] = { staff: "", auxiliares: [] };
      var text = normalizeFieldText(path, nodes[i].textContent || "");
      if (key === "staff") {
        byIndex[idx].staff = text;
      } else if (key === "auxiliar1") {
        var legacy1 = byIndex[idx].auxiliares.slice();
        while (legacy1.length < 1) legacy1.push("");
        legacy1[0] = text;
        byIndex[idx].auxiliares = legacy1;
      } else if (key === "auxiliar2") {
        var legacy2 = byIndex[idx].auxiliares.slice();
        while (legacy2.length < 2) legacy2.push("");
        legacy2[1] = text;
        byIndex[idx].auxiliares = legacy2;
      }
      if (idx > maxIndex) maxIndex = idx;
    }
    var list = [];
    for (var j = 0; j <= maxIndex; j++) {
      list.push(byIndex[j] || { staff: "", auxiliares: [] });
    }
    return list;
  }

  function buildRetornoPatchFromContainer(container) {
    var scalarPatch = extractSectionFields(container, "retorno");
    var atos = extractRetornoAtos(container);
    var equipes = extractRetornoEquipes(container);
    if (!atos.length && !equipes.length) {
      return Object.keys(scalarPatch).length ? scalarPatch : null;
    }
    var ap = getAltaProcedimentos();
    var count = Math.max(atos.length, equipes.length);
    var merged = [];
    for (var i = 0; i < count; i++) {
      var ato = atos[i] || { descricao: "", data: "" };
      var eq = equipes[i] || { staff: "", auxiliares: [] };
      merged.push({
        descricao: ato.descricao || "",
        data: ato.data || "",
        staff: eq.staff || "",
        auxiliares: Array.isArray(eq.auxiliares) ? eq.auxiliares.slice() : [],
      });
    }
    var fields =
      ap && typeof ap.atosToRetornoFields === "function"
        ? ap.atosToRetornoFields(merged)
        : {};
    var out = {};
    var sk;
    for (sk in scalarPatch) {
      if (Object.prototype.hasOwnProperty.call(scalarPatch, sk)) out[sk] = scalarPatch[sk];
    }
    if (fields.descricaoAto != null) out.descricaoAto = fields.descricaoAto;
    if (fields.dataCirurgia != null) out.dataCirurgia = fields.dataCirurgia;
    if (fields.equipes) out.equipes = fields.equipes;
    return out;
  }

  function extractSectionFields(container, prefix) {
    var patch = {};
    var nodes = container.querySelectorAll("[data-alta-field]");
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-alta-field") || "";
      if (path.indexOf(prefix + ".") !== 0) continue;
      var key = path.slice(prefix.length + 1);
      if (!key) continue;
      if (key.indexOf("procedimentos.") === 0) continue;
      if (key.indexOf("atos.") === 0) continue;
      if (key.indexOf("equipes.") === 0) continue;
      if (key.indexOf(".") >= 0) continue;
      var raw = nodes[i].textContent || "";
      if (key === "diasAfastamento" || key === "diasDeclaracao") {
        var n = parseInt(String(raw).replace(/\D/g, ""), 10);
        patch[key] = Number.isFinite(n) && n > 0 ? n : 15;
        continue;
      }
      if (MULTILINE_FIELD_PATHS[path]) {
        if (path === "retorno.dataCirurgia") {
          patch[key] = normalizeMultilineDateField(raw);
        } else {
          patch[key] = normalizeMultilineField(path, raw);
        }
        continue;
      }
      if (DATE_FIELD_PATHS[path] || PROCEDIMENTO_DATE_PATH_RE.test(path)) {
        patch[key] = normalizeDateField(raw);
        continue;
      }
      patch[key] = normalizeFieldText(path, raw);
    }
    return patch;
  }

  /**
   * @param {ParentNode} container
   * @param {"orientacoes"|"laudo"|"laudoPersonalizado"|"atestado"|"acompanhante"|"retorno"|"kit"|"receituario"} kind
   * @returns {{ orientacoes?: object, laudo?: object, laudoPersonalizado?: object, atestado?: object, acompanhante?: object, retorno?: object }}
   */
  function extractPreviewPatch(container, kind) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return {};
    }

    if (kind === "kit") {
      var result = {};
      var orientItems = extractOrientacoesItems(container);
      if (orientItems.length) {
        result.orientacoes = { items: orientItems };
      }
      var laudoPatch = extractSectionFields(container, "laudo");
      var procedimentos = extractLaudoProcedimentos(container);
      if (procedimentos.length) laudoPatch.procedimentos = procedimentos;
      if (Object.keys(laudoPatch).length) result.laudo = laudoPatch;
      var atestadoPatch = extractSectionFields(container, "atestado");
      if (Object.keys(atestadoPatch).length) result.atestado = atestadoPatch;
      var laudoPersonalizadoPatch = extractSectionFields(container, "laudoPersonalizado");
      if (Object.keys(laudoPersonalizadoPatch).length) {
        result.laudoPersonalizado = laudoPersonalizadoPatch;
      }
      var acompanhantePatch = extractSectionFields(container, "acompanhante");
      if (Object.keys(acompanhantePatch).length) result.acompanhante = acompanhantePatch;
      var retornoMerged = buildRetornoPatchFromContainer(container);
      if (retornoMerged) result.retorno = retornoMerged;
      return result;
    }

    if (kind === "orientacoes") {
      return { orientacoes: { items: extractOrientacoesItems(container) } };
    }
    if (kind === "laudo") {
      var laudoOnly = extractSectionFields(container, "laudo");
      var procs = extractLaudoProcedimentos(container);
      if (procs.length) laudoOnly.procedimentos = procs;
      return Object.keys(laudoOnly).length ? { laudo: laudoOnly } : {};
    }
    if (kind === "atestado") {
      var atestado = extractSectionFields(container, "atestado");
      return Object.keys(atestado).length ? { atestado: atestado } : {};
    }
    if (kind === "laudoPersonalizado") {
      var laudoPersonalizado = extractSectionFields(container, "laudoPersonalizado");
      return Object.keys(laudoPersonalizado).length
        ? { laudoPersonalizado: laudoPersonalizado }
        : {};
    }
    if (kind === "acompanhante") {
      var acompanhante = extractSectionFields(container, "acompanhante");
      return Object.keys(acompanhante).length ? { acompanhante: acompanhante } : {};
    }
    if (kind === "referencia") {
      var referencia = extractSectionFields(container, "referencia");
      return Object.keys(referencia).length ? { referencia: referencia } : {};
    }
    if (kind === "contrarreferencia") {
      var contrarreferencia = extractSectionFields(container, "contrarreferencia");
      return Object.keys(contrarreferencia).length
        ? { contrarreferencia: contrarreferencia }
        : {};
    }
    if (kind === "retorno") {
      var retornoMergedOnly = buildRetornoPatchFromContainer(container);
      return retornoMergedOnly ? { retorno: retornoMergedOnly } : {};
    }
    return {};
  }

  function extractPreviewHtmlPatch(container, kind) {
    if (!container) return {};
    if (kind === "kit") {
      return { kit: sanitizePreviewHtml(container.innerHTML || "") };
    }
    if (kind === "receituario") {
      var rxPreview = container.querySelector(
        ".alta-receituario-preview[data-receituario-doc-id]",
      );
      if (!rxPreview) return {};
      var docId = rxPreview.getAttribute("data-receituario-doc-id") || "";
      if (!docId) return {};
      var receituarioDocs = {};
      receituarioDocs[docId] = sanitizePreviewHtml(rxPreview.outerHTML || "");
      return { receituarioDocs: receituarioDocs };
    }
    var page =
      container.querySelector(".alta-page") ||
      container.querySelector(".guia-page");
    if (!page) {
      // Documento Guia pode ser o body inteiro
      if (
        (kind === "referencia" || kind === "contrarreferencia") &&
        container.innerHTML
      ) {
        var full = {};
        full[kind] = sanitizePreviewHtml(container.innerHTML || "");
        return full;
      }
      return {};
    }
    var patch = {};
    patch[kind] = sanitizePreviewHtml(page.outerHTML || "");
    return patch;
  }

  /**
   * @param {ParentNode} container
   * @param {"orientacoes"|"laudo"|"laudoPersonalizado"|"atestado"|"acompanhante"|"retorno"|"kit"|"receituario"} kind
   * @returns {{ patch: object, previewHtml: object }}
   */
  function extractPreviewChange(container, kind) {
    var patch = extractPreviewPatch(container, kind);
    var previewHtml = extractPreviewHtmlPatch(container, kind);
    if (kind === "kit" || kind === "receituario") {
      var rxSync = getReceitaPreviewSync();
      if (rxSync && typeof rxSync.extractReceitaPreviewPatch === "function") {
        var rxPatch = rxSync.extractReceitaPreviewPatch(container);
        if (rxPatch.receitas) {
          patch.receitas = rxPatch.receitas;
        }
      }
    }
    return { patch: patch, previewHtml: previewHtml };
  }

  return {
    extractPreviewPatch: extractPreviewPatch,
    extractPreviewChange: extractPreviewChange,
    extractPreviewHtmlPatch: extractPreviewHtmlPatch,
    sanitizePreviewHtml: sanitizePreviewHtml,
    normalizeFieldText: normalizeFieldText,
    normalizeDateField: normalizeDateField,
    extractLaudoProcedimentos: extractLaudoProcedimentos,
    extractRetornoAtos: extractRetornoAtos,
    extractRetornoEquipes: extractRetornoEquipes,
    extractOrientacoesItems: extractOrientacoesItems,
    reindexOrientacoesListFields: reindexOrientacoesListFields,
  };
});
