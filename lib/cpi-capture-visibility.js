/**
 * Quando cada formulário de captura CPI aparece.
 *
 * A regra vivia só no TSX (`patient-episode-form.tsx`), o que a tornava
 * inauditável e intestável. Aqui é pura e tem suite própria.
 *
 * Decisão (revisão do gate de alta): os três formulários de episódio deixam de
 * exigir episódio encerrado. Nenhum AC das FEAT-143/147/148/149 o exigia — o
 * gate nasceu do Brief UX da FEAT-147 e foi copiado. A FEAT-148 desenha
 * explicitamente o cTNM (pré-operatório) na revisão 1 e o pTNM numa revisão
 * nova (Clarificação 4), fluxo que o gate tornava inexecutável.
 *
 * Captura parcial não corrompe indicador: campo obrigatório em branco entra em
 * `unanswered` (`cpi-capture-record.js`) e `episodeAnswered`
 * (`cpi-data-quality.js`) exige `unanswered` vazio — logo conta exactamente
 * como captura nenhuma, nunca como valor.
 *
 * O marco longitudinal mantém a exigência de alta: a âncora do relógio é
 * `dischargeAt` (FEAT-149), e sem ela não há `dueAtIso`.
 *
 * Sem I/O.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCaptureVisibility = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Listas próprias em vez de `require("./cpi-nephrologic-capture.js")`: no
   * bundle do browser esse require cai para um global que pode não estar
   * registado, e a captura desapareceria em silêncio. `tests/
   * cpi-capture-visibility.test.mjs` fixa a igualdade com a lib nefrológica —
   * divergir quebra a suite.
   */
  var NEPHROLOGIC_EPISODE_LINES = Object.freeze(["nef_lesao_renal_aguda"]);
  var LONGITUDINAL_LINES = Object.freeze([
    "nef_doenca_renal_cronica",
    "cad_cirrose_hepatica",
  ]);

  /** Igual a WINDOW_DAYS de cpi-perioperative-outcome.js; fixado por teste. */
  var CLAVIEN_WINDOW_DAYS = 30;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function dateOnlyMs(iso) {
    var s = str(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var ms = Date.parse(s + "T00:00:00.000Z");
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * A janela do Clavien conta da **cirurgia**, não da alta. Sem data de
   * cirurgia devolvemos "observing": avisar a mais é seguro, avisar a menos
   * deixa passar um grau provisório como se fosse definitivo.
   */
  function clavienWindowState(surgeryDateIso, nowIso) {
    var start = dateOnlyMs(surgeryDateIso);
    var asOf = dateOnlyMs(nowIso);
    if (start == null || asOf == null) return "observing";
    return asOf >= start + CLAVIEN_WINDOW_DAYS * MS_PER_DAY
      ? "closed"
      : "observing";
  }

  function isNephrologicEpisodeLine(careLineId) {
    return NEPHROLOGIC_EPISODE_LINES.indexOf(str(careLineId)) !== -1;
  }

  function isLongitudinalCareLine(careLineId) {
    return LONGITUDINAL_LINES.indexOf(str(careLineId)) !== -1;
  }

  /** Alta registada — por status explícito ou por data de fim. */
  function isEpisodeClosed(episode) {
    var ep = episode && typeof episode === "object" ? episode : {};
    return str(ep.status) === "closed" || !!str(ep.endedAt);
  }

  /**
   * @param {{
   *   recordClientId?: string,
   *   episode?: { id?: string, status?: string, endedAt?: string|null },
   *   episodePersisted?: boolean,
   *   surgeryDateIso?: string|null,
   *   nowIso?: string|null,
   *   perioperativeCareLineId?: string|null,
   *   oncologyCareLineId?: string|null,
   *   nephrologicCareLineId?: string|null
   * }} input
   * @returns {{
   *   perioperative: boolean, oncology: boolean, nephrologic: boolean,
   *   longitudinal: boolean, perioperativeWindowOpen: boolean,
   *   episodeClosed: boolean
   * }}
   */
  function captureFormVisibility(input) {
    var it = input && typeof input === "object" ? input : {};
    var ep = it.episode && typeof it.episode === "object" ? it.episode : {};

    // Pré-requisitos de qualquer captura de episódio: sem paciente, sem
    // episódio, ou com episódio ainda por gravar, não há `subject_key` estável
    // — a captura ficaria órfã se o utilizador cancelasse a criação.
    var persisted = it.episodePersisted !== false;
    var ready = !!str(it.recordClientId) && !!str(ep.id) && persisted;
    var endedAt = str(ep.endedAt);
    var closed = isEpisodeClosed(ep);

    var periId = str(it.perioperativeCareLineId);
    var oncoId = str(it.oncologyCareLineId);
    var nephroId = str(it.nephrologicCareLineId);

    var perioperative = ready && !!periId;

    return {
      perioperative: perioperative,
      oncology: ready && !!oncoId,
      nephrologic: ready && !!nephroId && isNephrologicEpisodeLine(nephroId),
      // Único gate de alta que sobrevive: sem `endedAt` não há âncora.
      longitudinal:
        ready && !!nephroId && isLongitudinalCareLine(nephroId) && !!endedAt,
      // A janela conta da cirurgia, não da alta: com alta ao dia 5 o episódio
      // fecha e o grau ainda pode mudar até ao dia 30. Avisar por `!closed`
      // calaria o aviso exactamente quando ele é preciso.
      perioperativeWindowOpen:
        perioperative &&
        clavienWindowState(it.surgeryDateIso, it.nowIso) === "observing",
      episodeClosed: closed,
    };
  }

  return {
    NEPHROLOGIC_EPISODE_LINES: NEPHROLOGIC_EPISODE_LINES,
    LONGITUDINAL_LINES: LONGITUDINAL_LINES,
    CLAVIEN_WINDOW_DAYS: CLAVIEN_WINDOW_DAYS,
    clavienWindowState: clavienWindowState,
    captureFormVisibility: captureFormVisibility,
    isEpisodeClosed: isEpisodeClosed,
    isNephrologicEpisodeLine: isNephrologicEpisodeLine,
    isLongitudinalCareLine: isLongitudinalCareLine,
  };
});
