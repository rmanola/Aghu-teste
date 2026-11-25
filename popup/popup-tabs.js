// ── Sistema de abas ───────────────────────────────────────────────────────────
(function () {
  "use strict";
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      void (async () => {
        const tab = btn.dataset.tab;
        const activePanel = document.querySelector(".tab-panel.active");
        if (
          activePanel &&
          activePanel.id === "panel-passometro" &&
          tab !== "passometro"
        ) {
          const pm = window.AghuPassometroPopup;
          if (pm && typeof pm.flushPendingSave === "function") {
            await pm.flushPendingSave();
          }
        }
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        btn.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
        const panel = document.getElementById("panel-" + tab);
        if (panel) panel.classList.add("active");
        // FEAT-309: primeira abertura da aba Passômetro → coachmarks
        if (tab === "passometro") {
          const wt = window.AghuPassometroWalkthroughUi;
          if (wt && typeof wt.maybeStartTour === "function") {
            void wt.maybeStartTour();
          }
        }
      })();
    });
  });
})();
