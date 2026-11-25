/**
 * FEAT-304 — radios de vista da PA (Controles, Passômetro, Configurações).
 * Persistência única via AghuExtensionSettings.pa_format.
 */
(function () {
  "use strict";

  var GROUPS = ["controlesPaFormat", "passometroPaFormat", "settingsPaFormat"];
  var WRITE_GROUPS = ["controlesPaFormat", "passometroPaFormat"];
  var api = window.AghuExtensionSettings;
  var current = "minmax";
  var applying = false;

  function normalize(raw) {
    if (api && typeof api.normalizePaFormat === "function") {
      return api.normalizePaFormat(raw);
    }
    return raw === "sequence" ? "sequence" : "minmax";
  }

  function syncRadios(value) {
    applying = true;
    var next = normalize(value);
    current = next;
    for (var g = 0; g < GROUPS.length; g++) {
      var radios = document.querySelectorAll('input[name="' + GROUPS[g] + '"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === next;
      }
    }
    applying = false;
  }

  function emit() {
    document.dispatchEvent(
      new CustomEvent("aghu:pa-format-changed", {
        detail: { paFormat: current },
      }),
    );
  }

  async function persist(value) {
    var next = normalize(value);
    syncRadios(next);
    if (!api || typeof api.saveSettings !== "function") {
      emit();
      return;
    }
    var out = await api.saveSettings({ pa_format: next });
    if (out && out.settings && out.settings.pa_format) {
      syncRadios(out.settings.pa_format);
    }
    emit();
  }

  function onChange(ev) {
    if (applying) return;
    var target = ev.target;
    if (!target || target.type !== "radio") return;
    if (WRITE_GROUPS.indexOf(target.name) < 0) return;
    persist(target.value);
  }

  document.addEventListener("change", onChange);

  document.addEventListener("aghu:pa-format-changed", function (ev) {
    var detail = ev.detail || {};
    if (!detail.paFormat || detail.paFormat === current) return;
    syncRadios(detail.paFormat);
  });

  async function init() {
    if (api && typeof api.getPaFormat === "function") {
      try {
        current = normalize(await api.getPaFormat());
      } catch (_e) {
        current = "minmax";
      }
    }
    syncRadios(current);
  }

  window.AghuPaFormatControls = {
    getCachedPaFormat: function () {
      return current;
    },
    syncRadios: syncRadios,
    init: init,
  };

  init();
})();
