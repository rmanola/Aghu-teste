/**
 * System/user prompts para análise clínica LLM — fonte única testável em Node.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientAnalysisPrompt = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ANALYSIS_TIMEZONE = "America/Sao_Paulo";
  var ANALYSIS_MAX_CHARS = 1000;
  var MAX_USER_SYSTEM_PROMPT_CHARS = 6000;

  var WEEKDAYS_PT = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];

  /**
   * @param {Date} date
   * @returns {{ iso: string, localDateBr: string, localDateTimeBr: string, weekdayPt: string, timezone: string }}
   */
  function buildReferenceNow(date) {
    var d = date instanceof Date ? date : new Date(date || Date.now());
    var iso = d.toISOString();

    var dateFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: ANALYSIS_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    var timeFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: ANALYSIS_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    var weekdayFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: ANALYSIS_TIMEZONE,
      weekday: "long",
    });

    var localDateBr = dateFmt.format(d);
    var localDateTimeBr = timeFmt.format(d);
    var weekdayPt = weekdayFmt.format(d);

    return {
      iso: iso,
      localDateBr: localDateBr,
      localDateTimeBr: localDateTimeBr,
      weekdayPt: weekdayPt,
      timezone: ANALYSIS_TIMEZONE,
    };
  }

  /**
   * @param {{ referenceNow: ReturnType<typeof buildReferenceNow> }} opts
   * @returns {string}
   */
  function buildAnalysisSystemPrompt(opts) {
    opts = opts || {};
    var ref = opts.referenceNow || buildReferenceNow(new Date());
    return resolveSystemPrompt(undefined, ref);
  }

  function defaultUserInstructions() {
    return [
      "Você é um assistente de síntese clínica ultra-resumida para médicos em plantão hospitalar.",
      "Responda em português brasileiro, num único parágrafo denso (sem títulos, listas ou Markdown estruturado).",
      "",
      "ENTRADA: JSON com prontuarioColado + dadosSincronizados + referenceNow.",
      "- Em divergência narrativa, priorize prontuarioColado.text.",
      "- Valores numéricos e datas: preferir dadosSincronizados.",
      "",
      "REGRAS TEMPORAIS:",
      "- Priorize dados recentes quando existirem no JSON.",
      "- Use dihDaysAgo, poLabel, hoursAgo/daysAgo só se o dado estiver presente — não comente a falta.",
      "- Sem dataCirurgia, DIH, controles ou exames no JSON: omita silenciosamente; não declare ausência nem indisponibilidade.",
      "",
      "IDENTIFICAÇÃO:",
      "- Use sempre «paciente»; nunca nome próprio, iniciais ou identificadores do titular.",
      "",
      "CONDUTAS E MEDICAÇÕES:",
      "- Cite apenas medicações e condutas da doença atual ou manejo de intercorrência relevante ao quadro agudo.",
      "- Não liste medicamentos de uso crónico ou comorbidades que não impactem o episódio actual.",
    ].join("\n");
  }

  function buildMandatoryDateBlock(ref) {
    return [
      "DATA ACTUAL (use para DIH, PO, idade dos exames — não assuma «hoje» sem cruzar o JSON):",
      "Hoje é " +
        ref.localDateBr +
        " (" +
        ref.weekdayPt +
        "), horário de referência " +
        ref.localDateTimeBr +
        " (" +
        ref.timezone +
        ").",
    ].join("\n");
  }

  function buildMandatorySafetyFormatBlock() {
    return [
      "SEGURANÇA: apoio à decisão; não prescreve condutas novas.",
      "",
      "FORMATO:",
      "- Resposta = UM ÚNICO PARÁGRAFO contínuo.",
      "- Proibido: títulos (#), listas (-, *, 1.), múltiplos parágrafos, secções.",
      "- Máximo " +
        ANALYSIS_MAX_CHARS +
        " caracteres (inclui espaços); o mais curto possível sem omitir o essencial.",
      "- Integre numa narrativa: idade (se houver), contexto temporal disponível, diagnóstico/eixo, evolução recente, alertas/lab, condutas do episódio, monitorização.",
      "- Se precisar cortar, omita detalhes secundários antes de alertas e condutas críticas.",
      "",
      "PROIBIÇÕES: não inventar comorbidades; não repetir laudos integrais; não usar nome do paciente; não evidenciar dados em falta (ex.: «sem controles», «PO indisponível», «sem exames»).",
    ].join("\n");
  }

  function sanitizeUserSystemPrompt(raw) {
    var text = String(raw || "")
      .replace(/\0/g, "")
      .trim()
      .slice(0, MAX_USER_SYSTEM_PROMPT_CHARS);
    text = text.replace(/^system:\s*/gim, "").trim();
    return text;
  }

  function resolveSystemPrompt(userInstructions, referenceNow) {
    var ref = referenceNow || buildReferenceNow(new Date());
    var userBlock =
      sanitizeUserSystemPrompt(userInstructions) ||
      defaultUserInstructions();
    return [
      userBlock,
      buildMandatoryDateBlock(ref),
      buildMandatorySafetyFormatBlock(),
    ].join("\n\n");
  }

  /**
   * @param {object} contextJson
   * @returns {string}
   */
  function buildInitialUserMessage(contextJson) {
    var payload =
      typeof contextJson === "string"
        ? contextJson
        : JSON.stringify(contextJson);
    return (
      "Gere a análise clínica com base exclusivamente no JSON abaixo.\n" +
      "Responda num único parágrafo com no máximo " +
      ANALYSIS_MAX_CHARS +
      " caracteres.\n\n" +
      payload
    );
  }

  /**
   * @param {string} userFeedback
   * @returns {string}
   */
  function wrapUserFeedbackTurn(userFeedback) {
    return (
      "Feedback do médico sobre o rascunho anterior:\n\n" +
      String(userFeedback || "").trim() +
      "\n\nReescreva a análise como um único parágrafo (máximo " +
      ANALYSIS_MAX_CHARS +
      " caracteres) incorporando este feedback. " +
      "Não use títulos, listas nem Markdown estruturado; não repita o feedback literalmente."
    );
  }

  /**
   * Pós-processamento fail-safe: parágrafo único ≤ ANALYSIS_MAX_CHARS.
   * @param {string} text
   * @param {number} [maxChars]
   * @returns {string}
   */
  function normalizeAnalysisOutput(text, maxChars) {
    var limit = typeof maxChars === "number" ? maxChars : ANALYSIS_MAX_CHARS;
    var raw = String(text || "").trim();
    if (!raw) return "";

    var lines = raw.split(/\r?\n/);
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^#{1,6}\s/.test(line)) {
        line = line.replace(/^#{1,6}\s+/, "").trim();
      }
      line = line.replace(/^[-*•]\s+/, "").trim();
      line = line.replace(/^\d+[.)]\s+/, "").trim();
      if (line) parts.push(line);
    }

    var paragraph = parts.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph.length <= limit) return paragraph;

    var slice = paragraph.slice(0, limit - 1);
    var lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > limit * 0.6) {
      slice = slice.slice(0, lastSpace);
    }
    return slice.trim() + "…";
  }

  return {
    ANALYSIS_TIMEZONE: ANALYSIS_TIMEZONE,
    ANALYSIS_MAX_CHARS: ANALYSIS_MAX_CHARS,
    MAX_USER_SYSTEM_PROMPT_CHARS: MAX_USER_SYSTEM_PROMPT_CHARS,
    buildReferenceNow: buildReferenceNow,
    buildAnalysisSystemPrompt: buildAnalysisSystemPrompt,
    defaultUserInstructions: defaultUserInstructions,
    buildMandatoryDateBlock: buildMandatoryDateBlock,
    buildMandatorySafetyFormatBlock: buildMandatorySafetyFormatBlock,
    sanitizeUserSystemPrompt: sanitizeUserSystemPrompt,
    resolveSystemPrompt: resolveSystemPrompt,
    buildInitialUserMessage: buildInitialUserMessage,
    wrapUserFeedbackTurn: wrapUserFeedbackTurn,
    normalizeAnalysisOutput: normalizeAnalysisOutput,
  };
});
