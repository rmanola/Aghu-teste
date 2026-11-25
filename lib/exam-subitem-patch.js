/**
 * Substitui um analito (subitem) no texto completo do laudo, preservando o restante.
 * Testável em Node; web: global AghuExamSubitemPatch (requer AghuExamMatrixDisplay).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamSubitemPatch = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getMatrixDisplay() {
    return typeof globalThis !== "undefined" && globalThis.AghuExamMatrixDisplay
      ? globalThis.AghuExamMatrixDisplay
      : null;
  }

  function getLabParse() {
    return typeof globalThis !== "undefined" && globalThis.AghuPdfLabParse
      ? globalThis.AghuPdfLabParse
      : null;
  }

  /**
   * @param {{ label: string, value: string }[]} items
   * @returns {string}
   */
  function serializeLabSubitems(items) {
    return (items || [])
      .filter(function (it) {
        var v = it && it.value != null ? String(it.value).trim() : "";
        return v !== "" && v !== "—";
      })
      .map(function (it) {
        return it.label + ": " + it.value;
      })
      .join("\n");
  }

  /**
   * @param {function(string, *): { label: string, value: string }[]} parseFn
   * @param {string} text
   * @param {string} subitemLabel
   * @param {string} newValue
   * @param {*} [parseCtx]
   * @returns {string}
   */
  function replaceInFixedLabelItems(
    parseFn,
    text,
    subitemLabel,
    newValue,
    parseCtx,
  ) {
    var items = parseFn(String(text || ""), parseCtx);
    var found = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].label === subitemLabel) {
        items[i].value = newValue;
        found = true;
        break;
      }
    }
    if (!found) {
      items.push({ label: subitemLabel, value: newValue });
    }
    return serializeLabSubitems(items);
  }

  /**
   * @param {string} text
   * @param {string} subitemLabel
   * @param {string} newValue
   * @param {string} [examName]
   * @returns {string}
   */
  function replaceSubitemInGenericLabText(text, subitemLabel, newValue, examName) {
    var md = getMatrixDisplay();
    if (!md) {
      throw new Error("replaceSubitemInLabText requer AghuExamMatrixDisplay");
    }

    var normalized = md.normalizeMultilineLabResult(String(text || ""));
    if (!normalized || normalized === "—") {
      return subitemLabel + ": " + newValue;
    }

    var rawLines = normalized.split(/\r?\n/);
    var replaced = false;
    var out = [];

    for (var i = 0; i < rawLines.length; i++) {
      var line = rawLines[i].trim();
      if (!line) continue;
      var parsed = md.parseLabResultSubitem(line);
      if (parsed && parsed.label === subitemLabel) {
        out.push(parsed.label + ": " + newValue);
        replaced = true;
      } else {
        out.push(line);
      }
    }

    if (!replaced) {
      out.push(subitemLabel + ": " + newValue);
    }

    return out.join("\n");
  }

  /**
   * @param {string} fullText
   * @param {string} subitemLabel
   * @param {string} newValue
   * @param {{ examName?: string }} [opts]
   * @returns {string}
   */
  function replaceSubitemInLabText(fullText, subitemLabel, newValue, opts) {
    opts = opts || {};
    var md = getMatrixDisplay();
    if (!md) {
      throw new Error("replaceSubitemInLabText requer AghuExamMatrixDisplay");
    }

    var label = String(subitemLabel || "").trim();
    var value = String(newValue != null ? newValue : "").trim();
    var examName = opts.examName || "";

    if (!label) {
      throw new Error("subitemLabel obrigatório");
    }

    if (examName && md.isGasometryExamName(examName)) {
      var lab = getLabParse();
      if (!lab) {
        throw new Error("replaceSubitemInLabText gasometria requer AghuPdfLabParse");
      }
      return replaceInFixedLabelItems(
        function (t) {
          return md.parseGasometryCellSubitems(t, lab);
        },
        fullText,
        label,
        value,
      );
    }

    if (examName && md.isEasExamName(examName)) {
      var labEas = getLabParse();
      if (!labEas) {
        throw new Error("replaceSubitemInLabText EAS requer AghuPdfLabParse");
      }
      return replaceInFixedLabelItems(
        function (t) {
          return md.parseEasCellSubitems(t, labEas);
        },
        fullText,
        label,
        value,
      );
    }

    if (examName && md.isQualitativePanelExamName(examName)) {
      if (!md.parseQualitativePanelCellSubitems) {
        throw new Error(
          "replaceSubitemInLabText painel requer parseQualitativePanelCellSubitems",
        );
      }
      return replaceInFixedLabelItems(
        function (t) {
          return md.parseQualitativePanelCellSubitems(t, examName);
        },
        fullText,
        label,
        value,
      );
    }

    return replaceSubitemInGenericLabText(fullText, label, value, examName);
  }

  return {
    serializeLabSubitems: serializeLabSubitems,
    replaceSubitemInLabText: replaceSubitemInLabText,
    replaceSubitemInGenericLabText: replaceSubitemInGenericLabText,
  };
});
