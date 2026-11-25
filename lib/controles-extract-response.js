/**
 * Resposta segura para extrairControles (content script).
 * CTRL-AC-03
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesExtractResponse = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONTROLES_TEXTO_PLACEHOLDER =
    "[Registros encontrados mas sem valores numéricos legíveis — verifique se a aba Monitorização está carregada completamente]";

  /**
   * @param {string} [texto]
   * @returns {boolean}
   */
  function isControlesTextoPlaceholder(texto) {
    return String(texto || "").trim() === CONTROLES_TEXTO_PLACEHOLDER;
  }

  /**
   * @param {Array<{ texto?: string }>} [entries]
   */
  function classifyControlesEntries(entries) {
    entries = entries || [];
    var placeholderCount = 0;
    for (var i = 0; i < entries.length; i++) {
      if (isControlesTextoPlaceholder(entries[i] && entries[i].texto)) {
        placeholderCount++;
      }
    }
    return {
      total: entries.length,
      placeholderCount: placeholderCount,
      allPlaceholder: entries.length > 0 && placeholderCount === entries.length,
      somePlaceholder: placeholderCount > 0 && placeholderCount < entries.length,
    };
  }

  /**
   * Fatia Controles sem dados extraíveis (FEAT-110 / PM1C-AC-34..35).
   * Soft: não aborta o loop multi-fatia do orquestrador.
   * @param {{ ok?: boolean, empty?: boolean, degraded?: boolean, error?: string, erro?: string }|null|undefined} res
   * @returns {boolean}
   */
  function isControlesSliceSoftEmpty(res) {
    if (!res || typeof res !== "object") return false;
    if (res.empty === true) return true;
    if (res.degraded === true) return true;
    var msg = String(res.error || res.erro || "").toLowerCase();
    if (!msg) return false;
    if (msg.indexOf("nenhum valor num") !== -1) return true;
    if (msg.indexOf("nenhum registro encontrado na tabela") !== -1) return true;
    if (msg.indexOf("sem valores num") !== -1) return true;
    // Paciente sem internação no período: AGHU não monta abas Monitorização/Hídrico.
    if (msg.indexOf("tabela de monitoriza") !== -1) return true;
    return false;
  }

  /**
   * @param {() => object} executar
   * @returns {object}
   */
  function safeExtrairControlesResult(executar) {
    try {
      return executar();
    } catch (_e) {
      return { ok: false, erro: "Erro interno na extração.", patient: null };
    }
  }

  return {
    CONTROLES_TEXTO_PLACEHOLDER: CONTROLES_TEXTO_PLACEHOLDER,
    isControlesTextoPlaceholder: isControlesTextoPlaceholder,
    classifyControlesEntries: classifyControlesEntries,
    isControlesSliceSoftEmpty: isControlesSliceSoftEmpty,
    safeExtrairControlesResult: safeExtrairControlesResult,
  };
});
