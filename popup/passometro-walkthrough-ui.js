/**
 * FEAT-309 — UI coachmarks Passômetro one-click.
 * Depende de window.AghuPassometroWalkthrough (lib).
 * Auto-start só com body[data-auth="signed-in"] + aba Passômetro activa.
 */
(function () {
  "use strict";

  var api = window.AghuPassometroWalkthrough;
  if (!api) {
    console.error("[AGHU] passometro-walkthrough-ui: lib ausente");
    return;
  }

  var overlay = null;
  var dialog = null;
  var titleEl = null;
  var bodyEl = null;
  var stepIndexEl = null;
  var spotlight = null;
  var btnNext = null;
  var btnSkip = null;
  var currentIndex = 0;
  var active = false;
  var storage = null;
  var authObserver = null;

  function getStorage() {
    if (storage) return storage;
    try {
      if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
        storage = api.createBrowserStorageAdapter(browser.storage.local);
        return storage;
      }
    } catch (_e) {
      /* fallthrough */
    }
    storage = {
      _m: {},
      get: function (key) {
        return Promise.resolve(this._m[key]);
      },
      set: function (obj) {
        Object.assign(this._m, obj);
        return Promise.resolve();
      },
      remove: function (key) {
        delete this._m[key];
        return Promise.resolve();
      },
    };
    return storage;
  }

  function isSignedIn() {
    return document.body.getAttribute("data-auth") === "signed-in";
  }

  function isPassometroActive() {
    var panel = document.getElementById("panel-passometro");
    return !!(panel && panel.classList.contains("active"));
  }

  function ensureDom() {
    overlay = document.getElementById("pm-walkthrough-overlay");
    if (!overlay) return false;
    dialog = document.getElementById("pm-walkthrough-dialog");
    titleEl = document.getElementById("pm-walkthrough-title");
    bodyEl = document.getElementById("pm-walkthrough-body");
    stepIndexEl = document.getElementById("pm-walkthrough-step");
    spotlight = document.getElementById("pm-walkthrough-spotlight");
    btnNext = document.getElementById("pm-walkthrough-next");
    btnSkip = document.getElementById("pm-walkthrough-skip");
    return !!(dialog && titleEl && bodyEl && btnNext && btnSkip);
  }

  function clearSpotlight() {
    if (!spotlight) return;
    spotlight.hidden = true;
    spotlight.style.top = "";
    spotlight.style.left = "";
    spotlight.style.width = "";
    spotlight.style.height = "";
  }

  function positionSpotlight(selector) {
    if (!spotlight) return;
    if (!selector) {
      clearSpotlight();
      return;
    }
    var el = document.querySelector(selector);
    if (!el) {
      clearSpotlight();
      return;
    }
    var rect = el.getBoundingClientRect();
    var pad = 4;
    spotlight.hidden = false;
    spotlight.style.top = Math.max(0, rect.top - pad) + "px";
    spotlight.style.left = Math.max(0, rect.left - pad) + "px";
    spotlight.style.width = rect.width + pad * 2 + "px";
    spotlight.style.height = rect.height + pad * 2 + "px";
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (_e) {
      /* ignore */
    }
  }

  function renderStep() {
    var steps = api.TOUR_STEPS;
    var step = steps[currentIndex];
    if (!step) return;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    if (stepIndexEl) {
      stepIndexEl.textContent = currentIndex + 1 + " / " + steps.length;
    }
    var isLast = currentIndex >= steps.length - 1;
    btnNext.textContent = isLast ? "Concluir" : "Próximo";
    positionSpotlight(step.target);
  }

  function closeOverlay() {
    active = false;
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
    }
    clearSpotlight();
    document.removeEventListener("keydown", onKeydown, true);
  }

  function finishTour() {
    return api.markTourDone(getStorage()).then(function () {
      closeOverlay();
    }).catch(function () {
      closeOverlay();
    });
  }

  /** Fecha sem gravar flag — ex.: sign-out a meio do tour. */
  function abortTourWithoutDone() {
    closeOverlay();
  }

  function onKeydown(ev) {
    if (!active) return;
    if (ev.key === "Escape" || ev.key === "Esc") {
      ev.preventDefault();
      void finishTour();
    }
  }

  function openAt(index) {
    if (!ensureDom()) return;
    currentIndex = Math.max(0, Math.min(index, api.TOUR_STEPS.length - 1));
    active = true;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    renderStep();
    document.addEventListener("keydown", onKeydown, true);
    try {
      dialog.focus();
    } catch (_e) {
      /* ignore */
    }
  }

  function onNext() {
    if (!active) return;
    if (currentIndex >= api.TOUR_STEPS.length - 1) {
      void finishTour();
      return;
    }
    currentIndex += 1;
    renderStep();
  }

  function onSkip() {
    if (!active) return;
    void finishTour();
  }

  function bindOnce() {
    if (!ensureDom()) return;
    if (overlay.dataset.bound === "1") return;
    overlay.dataset.bound = "1";
    btnNext.addEventListener("click", onNext);
    btnSkip.addEventListener("click", onSkip);
    var replay = document.getElementById("btnPmWalkthroughReplay");
    if (replay) {
      replay.addEventListener("click", function () {
        void startTour({ force: true });
      });
    }
  }

  /**
   * @param {{ force?: boolean }} [opts]
   */
  function startTour(opts) {
    opts = opts || {};
    bindOnce();
    if (!ensureDom()) return Promise.resolve(false);
    if (!isSignedIn()) return Promise.resolve(false);

    if (opts.force) {
      return api.resetTour(getStorage()).then(function () {
        openAt(0);
        return true;
      });
    }

    return api.readTourDone(getStorage()).then(function (done) {
      if (!api.shouldStartTour({ done: done, signedIn: true })) return false;
      openAt(0);
      return true;
    });
  }

  function maybeStartTour() {
    if (!isSignedIn()) return Promise.resolve(false);
    if (!isPassometroActive()) return Promise.resolve(false);
    return startTour({ force: false });
  }

  function onAuthAttrChange() {
    if (!isSignedIn()) {
      if (active) abortTourWithoutDone();
      return;
    }
    void maybeStartTour();
  }

  function watchAuthState() {
    if (authObserver || !document.body) return;
    authObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === "data-auth") {
          onAuthAttrChange();
          break;
        }
      }
    });
    authObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-auth"],
    });
  }

  window.AghuPassometroWalkthroughUi = {
    startTour: startTour,
    maybeStartTour: maybeStartTour,
    finishTour: finishTour,
  };

  function boot() {
    bindOnce();
    watchAuthState();
    void maybeStartTour();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
