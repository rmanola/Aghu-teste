/**
 * Extrai alterações das receitas editáveis no preview do kit (data-rx-field).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaPreviewSync = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RX_FIELD_PATH_RE = /^receitas\.(\d+)\.lines\.(\d+)\.(\w+)$/;

  function getPreviewEditable() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-preview-editable.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPreviewEditable;
  }

  function stripEditablePlaceholder(raw) {
    var mod = getPreviewEditable();
    if (mod && typeof mod.stripEditablePlaceholder === "function") {
      return mod.stripEditablePlaceholder(raw);
    }
    if (raw == null) return "";
    return String(raw).replace(/\u00a0/g, " ").trim();
  }

  function normalizeFieldValue(key, raw) {
    var text = stripEditablePlaceholder(raw).trim();
    if (key === "drugName" || key === "presentation" || key === "route") {
      return text;
    }
    return text;
  }

  function getMedicationCatalog() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-medication-catalog.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaMedicationCatalog;
  }

  function parseFreeTextMedicationLocal(text) {
    var catalog = getMedicationCatalog();
    if (catalog && typeof catalog.parseFreeTextMedication === "function") {
      return catalog.parseFreeTextMedication(text);
    }
    var raw = String(text || "").trim();
    if (!raw) return { drugName: "", presentation: "" };
    var sep = raw.indexOf(" — ");
    if (sep < 0) sep = raw.indexOf(" - ");
    if (sep >= 0) {
      return {
        drugName: raw.slice(0, sep).trim(),
        presentation: raw.slice(sep + 3).trim(),
      };
    }
    return { drugName: raw, presentation: "" };
  }

  /**
   * Converte texto do campo drugName no preview (pode incluir índice/apresentação legados).
   * @param {string} raw
   * @returns {{ drugName: string, presentation: string }}
   */
  function parseDrugNameFieldFromPreview(raw) {
    var text = stripEditablePlaceholder(raw).trim();
    if (!text) return { drugName: "", presentation: "" };
    text = text.replace(/^(?:\d+\)\s*)+/g, "").trim();
    text = text.replace(/\s*\([^)]+\)\s*$/g, "").trim();
    return parseFreeTextMedicationLocal(text);
  }

  function assignDrugNameFieldPartial(partial, raw) {
    var parsed = parseDrugNameFieldFromPreview(raw);
    if (parsed.drugName) partial.drugName = parsed.drugName;
    if (parsed.presentation) partial.presentation = parsed.presentation;
  }

  function linePartialHasContent(partial) {
    if (!partial || typeof partial !== "object") return false;
    var keys = Object.keys(partial);
    for (var k = 0; k < keys.length; k++) {
      var val = partial[keys[k]];
      if (val != null && String(val).trim()) return true;
    }
    return false;
  }

  /**
   * @param {ParentNode} container
   * @returns {{ receitas?: Array<{ lines: object[] }> }}
   */
  function extractReceitaPreviewPatch(container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return {};
    }
    var nodes = container.querySelectorAll("[data-rx-field]");
    if (!nodes.length) return {};

    var seenPaths = {};
    var byDoc = {};
    var maxDoc = -1;
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i].getAttribute("data-rx-field") || "";
      if (!path || seenPaths[path]) continue;
      seenPaths[path] = true;
      var match = path.match(RX_FIELD_PATH_RE);
      if (!match) continue;
      var docIdx = Number(match[1]);
      var lineIdx = Number(match[2]);
      var key = match[3];
      if (!Number.isFinite(docIdx) || docIdx < 0) continue;
      if (!Number.isFinite(lineIdx) || lineIdx < 0) continue;
      if (!byDoc[docIdx]) byDoc[docIdx] = {};
      if (!byDoc[docIdx][lineIdx]) byDoc[docIdx][lineIdx] = {};
      if (key === "drugName") {
        assignDrugNameFieldPartial(
          byDoc[docIdx][lineIdx],
          nodes[i].textContent || "",
        );
      } else {
        byDoc[docIdx][lineIdx][key] = normalizeFieldValue(
          key,
          nodes[i].textContent || "",
        );
      }
      if (docIdx > maxDoc) maxDoc = docIdx;
    }

    if (maxDoc < 0) return {};

    var receitas = [];
    for (var d = 0; d <= maxDoc; d++) {
      if (!byDoc[d]) continue;
      var lineKeys = Object.keys(byDoc[d]);
      var lines = [];
      for (var lk = 0; lk < lineKeys.length; lk++) {
        var li = Number(lineKeys[lk]);
        if (!Number.isFinite(li) || li < 0) continue;
        var partial = byDoc[d][li];
        if (!linePartialHasContent(partial)) continue;
        lines[li] = partial;
      }
      if (lines.length) {
        receitas[d] = { lines: lines };
      }
    }

    return receitas.length ? { receitas: receitas } : {};
  }

  /**
   * Copia filhos DOM de source para target (sem innerHTML).
   * @param {Element} source
   * @param {Element} target
   */
  function mirrorDomChildren(source, target) {
    if (!source || !target) return;
    target.replaceChildren();
    var nodes = source.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      target.appendChild(nodes[i].cloneNode(true));
    }
  }

  /**
   * Espelha o DOM do campo editado para todas as outras vias com o mesmo data-rx-field.
   * @param {Document} doc
   * @param {Element} sourceField
   */
  function resolveViaSelector(via) {
    if (!via || !via.classList) return null;
    if (via.classList.contains("rx-block")) return ".rx-block";
    if (via.classList.contains("rx-half")) return ".rx-half";
    return null;
  }

  /**
   * Espelha a via editada (.rx-block / .rx-half) para a(s) outra(s) via(s) da mesma página.
   * @param {Document} doc
   * @param {Element} sourceVia
   */
  function mirrorRxViaSiblings(doc, sourceVia) {
    if (!doc || !sourceVia || typeof sourceVia.closest !== "function") {
      return;
    }
    var viaSel = resolveViaSelector(sourceVia);
    if (!viaSel) return;
    var page = sourceVia.closest(".rx-page-simple, .rx-page-special");
    if (!page) return;
    var vias = page.querySelectorAll(viaSel);
    if (vias.length < 2) return;

    var sourceIdx = -1;
    for (var i = 0; i < vias.length; i++) {
      if (vias[i] === sourceVia) {
        sourceIdx = i;
        break;
      }
    }
    if (sourceIdx < 0) return;

    for (var j = 0; j < vias.length; j++) {
      if (j === sourceIdx) continue;
      mirrorDomChildren(sourceVia, vias[j]);
    }
  }

  function mirrorRxFieldSiblings(doc, sourceField) {
    if (!doc || !sourceField || typeof sourceField.getAttribute !== "function") {
      return;
    }
    var path = sourceField.getAttribute("data-rx-field");
    if (!path) return;
    var siblings = doc.querySelectorAll('[data-rx-field="' + path + '"]');
    if (siblings.length < 2) return;

    var editable = getPreviewEditable();
    var normalize =
      editable && typeof editable.normalizeFieldAfterEdit === "function"
        ? editable.normalizeFieldAfterEdit
        : null;

    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i] === sourceField) continue;
      mirrorDomChildren(sourceField, siblings[i]);
      if (normalize) normalize(siblings[i]);
    }
  }

  return {
    extractReceitaPreviewPatch: extractReceitaPreviewPatch,
    parseDrugNameFieldFromPreview: parseDrugNameFieldFromPreview,
    mirrorRxFieldSiblings: mirrorRxFieldSiblings,
    mirrorRxViaSiblings: mirrorRxViaSiblings,
  };
});
