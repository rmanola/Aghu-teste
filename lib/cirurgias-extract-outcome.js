/**
 * Classificação de outcomes da extração de cirurgias (FEAT-062).
 * Pure — testável sem DOM/PrimeFaces.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasExtractOutcome = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Após tentativas de select: distingue race (select_failed) de Descrição indisponível.
   * @param {{ highlighted?: boolean, descricaoEnabled?: boolean, descricaoPresent?: boolean }} state
   * @returns {{ reason: string, skipped: boolean, ok: boolean }}
   */
  function classifySelectOutcome(state) {
    var s = state || {};
    // CIR-EXT-13: Descrição enabled sem highlight do índice alvo = select_failed
    // (evita aceitar botão da linha anterior).
    if (s.descricaoEnabled && s.highlighted) {
      return { reason: "ok", skipped: false, ok: true };
    }
    if (s.descricaoEnabled && !s.highlighted) {
      return { reason: "select_failed", skipped: false, ok: false };
    }
    if (s.highlighted && s.descricaoPresent) {
      return { reason: "sem_descricao", skipped: true, ok: false };
    }
    if (s.highlighted && !s.descricaoPresent) {
      // Linha selecionada mas botão ausente — trata como skip CIR-EXT-05.
      return { reason: "sem_descricao", skipped: true, ok: false };
    }
    return { reason: "select_failed", skipped: false, ok: false };
  }

  /**
   * Lote em que N PDFs colapsaram na mesma chave de merge (updated===N, length===1).
   * @param {{ extractedCount?: number, mergedLength?: number, updated?: number }} stats
   */
  function isBatchKeyCollapse(stats) {
    var s = stats || {};
    var n = s.extractedCount != null ? Number(s.extractedCount) : 0;
    var len = s.mergedLength != null ? Number(s.mergedLength) : 0;
    var updated = s.updated != null ? Number(s.updated) : 0;
    return n >= 2 && len === 1 && updated === n;
  }

  /**
   * Lote: sucesso se extraiu algo; skipped-only sem erro = ok; select_failed sem itens = falha.
   * @param {{ extractedCount?: number, skipped?: Array<{reason?: string}>, errors?: Array<{reason?: string}>, listCount?: number }} batch
   */
  function classifyBatchOk(batch) {
    var b = batch || {};
    var extracted = b.extractedCount != null ? Number(b.extractedCount) : 0;
    var skipped = Array.isArray(b.skipped) ? b.skipped : [];
    var errors = Array.isArray(b.errors) ? b.errors : [];
    var listCount = b.listCount != null ? Number(b.listCount) : 0;

    if (extracted > 0) return true;
    if (errors.length > 0) return false;
    if (listCount > 0 && skipped.length > 0) return true;
    return false;
  }

  /**
   * Conta errors com reason select_failed.
   */
  function countSelectFailed(errors) {
    if (!Array.isArray(errors)) return 0;
    var n = 0;
    for (var i = 0; i < errors.length; i++) {
      if (errors[i] && errors[i].reason === "select_failed") n++;
    }
    return n;
  }

  /**
   * PDF parseado sem EQUIPE/ACHADOS/DESCRIÇÃO não deve virar item só com nome.
   * @param {object|null|undefined} parsed
   * @returns {{ ok: boolean, reason: string }}
   */
  function classifyParsedPdf(parsed) {
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "parse_failed" };
    }
    var data = parsed.data != null ? String(parsed.data).trim() : "";
    if (!data) return { ok: false, reason: "parse_failed" };
    var body =
      (parsed.equipe && String(parsed.equipe).trim()) ||
      (parsed.achadosOperatorios && String(parsed.achadosOperatorios).trim()) ||
      (parsed.descricao && String(parsed.descricao).trim());
    if (!body) return { ok: false, reason: "parse_failed" };
    return { ok: true, reason: "ok" };
  }

  return {
    classifySelectOutcome: classifySelectOutcome,
    classifyBatchOk: classifyBatchOk,
    countSelectFailed: countSelectFailed,
    isBatchKeyCollapse: isBatchKeyCollapse,
    classifyParsedPdf: classifyParsedPdf,
  };
});
