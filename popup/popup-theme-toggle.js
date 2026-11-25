// ── Tema claro/escuro ───────────────────────────────────────────────────────
(function () {
  "use strict";
  var prefApi = typeof AghuThemePreference !== "undefined" ? AghuThemePreference : null;
  if (!prefApi) return;

  var btn = document.getElementById("btn-theme-toggle");
  var icons = {
    system: document.getElementById("theme-icon-system"),
    light: document.getElementById("theme-icon-light"),
    dark: document.getElementById("theme-icon-dark"),
  };

  function updateToggleUi(preference) {
    if (!btn) return;
    var label = prefApi.preferenceLabel(preference);
    btn.title = label;
    btn.setAttribute("aria-label", label);
    Object.keys(icons).forEach(function (key) {
      var el = icons[key];
      if (el) el.classList.toggle("hidden", key !== preference);
    });
  }

  function applyStoredPreference(preference) {
    prefApi.applyThemePreference(document, preference);
    updateToggleUi(preference);
  }

  var storage = typeof browser !== "undefined" && browser.storage && browser.storage.local
    ? browser.storage.local
    : null;

  prefApi.loadThemePreference(storage).then(function (preference) {
    applyStoredPreference(preference);
  });

  if (btn) {
    btn.addEventListener("click", function () {
      prefApi.loadThemePreference(storage).then(function (current) {
        var next = prefApi.nextPreference(current);
        return prefApi.saveThemePreference(storage, next).then(function () {
          applyStoredPreference(next);
        });
      });
    });
  }
})();
