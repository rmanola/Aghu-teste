/**
 * FEAT-309 — Walkthrough / coachmarks do Passômetro one-click.
 * Copy e selectors canónicos (testáveis sem DOM). Persistência: storage.local
 * key `aghu_pm_walkthrough_done` — sem PHI, sem nuvem.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPassometroWalkthrough = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "aghu_pm_walkthrough_done";

  /** @type {ReadonlyArray<{ id: string, target: string|null, title: string, body: string }>} */
  var TOUR_STEPS = Object.freeze([
    Object.freeze({
      id: "welcome",
      target: null,
      title: "Passômetro one-click",
      body:
        "Com o AGHU já autenticado, um clique extrai os domínios e monta o passômetro local. A extensão não faz login no hospital.",
    }),
    Object.freeze({
      id: "prontuarios",
      target: "#pmProntuarios",
      title: "Prontuários",
      body:
        "Informe só números (ex.: 12345678). Sem barra / — a máscara NNNNNNN/N do AGHU é aplicada pela nav. Um por linha ou separados por vírgula; vários pacientes correm em série.",
    }),
    Object.freeze({
      id: "period-modes",
      target: ".pm-oc-period",
      title: "Modos de período",
      body:
        "Hoje / Ontem / Semanal (últimos 7 dias inclusivos) ou De/Até em dd/mm/aaaa. Controles usam janela clínica 07:00 → 06:59 (não meia-noite). Prescrições filtram validade 16:00 → 15:59.",
    }),
    Object.freeze({
      id: "controles-window",
      target: ".pm-oc-period",
      title: "Janela Controles e teto AGHU",
      body:
        "O AGHU limita Controles a 15 dias por pesquisa. Período maior não bloqueia Extrair: Controles é fatiado em ciclos ≤15d com janela clínica 07:00 → 06:59; Exames/Cirurgias/Rx usam o período pai 1×. Status mostra «Controles (k/n)…».",
    }),
    Object.freeze({
      id: "domains",
      target: "#pmDomainsSelect",
      title: "O que extrair",
      body:
        "Marque só o necessário: Cadastro, Controles, Exames, Cirurgias, Prescrições (default: todos). Zero marcado → Extrair bloqueado. Só Controles → sem abrir POL; Cadastro/Exames/Cirurgias → POL.",
    }),
    Object.freeze({
      id: "extract",
      target: "#btnPassometroOneClick",
      title: "Extrair",
      body:
        "Clique Extrair para Passômetro. Fail-soft: erro num domínio/paciente não aborta o lote. Login AGHU continua manual.",
    }),
  ]);

  /**
   * Auto-start só com sessão AGHU (`signedIn`) e flag ainda não concluída.
   * Pre-login / pending → nunca inicia (painel Passômetro pode estar `.active`
   * no DOM mas oculto por CSS `data-auth`).
   * @param {{ done?: boolean|null, signedIn?: boolean|null }|null|undefined} flags
   * @returns {boolean}
   */
  function shouldStartTour(flags) {
    if (!flags || typeof flags !== "object") return false;
    if (flags.signedIn !== true) return false;
    return flags.done !== true;
  }

  /**
   * @param {{ get?: Function, set?: Function }|null} storage
   * @returns {Promise<boolean>}
   */
  function readTourDone(storage) {
    if (!storage || typeof storage.get !== "function") {
      return Promise.resolve(false);
    }
    return Promise.resolve(storage.get(STORAGE_KEY)).then(function (raw) {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return raw[STORAGE_KEY] === true;
      }
      return raw === true;
    });
  }

  /**
   * @param {{ set?: Function }|null} storage
   * @returns {Promise<void>}
   */
  function markTourDone(storage) {
    if (!storage || typeof storage.set !== "function") {
      return Promise.reject(new Error("storage.set obrigatório para markTourDone"));
    }
    var payload = {};
    payload[STORAGE_KEY] = true;
    return Promise.resolve(storage.set(payload));
  }

  /**
   * @param {{ remove?: Function, set?: Function }|null} storage
   * @returns {Promise<void>}
   */
  function resetTour(storage) {
    if (!storage) {
      return Promise.reject(new Error("storage obrigatório para resetTour"));
    }
    if (typeof storage.remove === "function") {
      return Promise.resolve(storage.remove(STORAGE_KEY));
    }
    if (typeof storage.set === "function") {
      var payload = {};
      payload[STORAGE_KEY] = false;
      return Promise.resolve(storage.set(payload));
    }
    return Promise.reject(new Error("storage.remove ou storage.set obrigatório"));
  }

  /**
   * Adapter browser.storage.local → { get, set, remove } com a chave isolada.
   * @param {object} browserStorageLocal — browser.storage.local
   */
  function createBrowserStorageAdapter(browserStorageLocal) {
    if (!browserStorageLocal || typeof browserStorageLocal.get !== "function") {
      throw new Error("browser.storage.local inválido");
    }
    return {
      get: function (key) {
        return browserStorageLocal.get(key).then(function (obj) {
          return obj && obj[key];
        });
      },
      set: function (obj) {
        return browserStorageLocal.set(obj);
      },
      remove: function (key) {
        return browserStorageLocal.remove(key);
      },
    };
  }

  /** API pública — sem fetch/XHR; sem log de prontuário. */
  return {
    STORAGE_KEY: STORAGE_KEY,
    TOUR_STEPS: TOUR_STEPS,
    shouldStartTour: shouldStartTour,
    readTourDone: readTourDone,
    markTourDone: markTourDone,
    resetTour: resetTour,
    createBrowserStorageAdapter: createBrowserStorageAdapter,
  };
});
