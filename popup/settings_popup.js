/**
 * FEAT-306 — Overlay Configurações (engrenagem no header).
 */
(function () {
  "use strict";

  var api = window.AghuExtensionSettings;
  var openBtn = document.getElementById("btn-open-settings");
  var closeBtn = document.getElementById("btn-close-settings");
  var panel = document.getElementById("panel-settings");
  var statusEl = document.getElementById("settings-status");
  var serviceSelect = document.getElementById("settings-service-select");
  var otherWrap = document.getElementById("settings-service-other-wrap");
  var otherInput = document.getElementById("settings-service-other");
  var locationInput = document.getElementById("settings-location");
  if (!openBtn || !panel || !api) return;

  var saveTimer = null;
  var currentSettings = null;
  var lastFocus = null;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("settings-status-error", !!isError);
  }

  function fillServiceSelect() {
    if (!serviceSelect || serviceSelect.options.length) return;
    var presets = api.SERVICE_PRESETS || [];
    for (var i = 0; i < presets.length; i++) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = presets[i];
      serviceSelect.appendChild(opt);
    }
    var other = document.createElement("option");
    other.value = api.PRESET_OTHER;
    other.textContent = "Outro…";
    serviceSelect.appendChild(other);
  }

  function syncOtherVisibility() {
    var isOther = serviceSelect && serviceSelect.value === api.PRESET_OTHER;
    if (otherWrap) {
      otherWrap.classList.toggle("hidden", !isOther);
      otherWrap.hidden = !isOther;
    }
  }

  function applyToForm(settings) {
    currentSettings = settings;
    fillServiceSelect();
    var match = api.matchServicePreset(settings.service_line);
    if (serviceSelect) serviceSelect.value = match.presetId;
    if (otherInput) otherInput.value = match.customText || "";
    if (locationInput) locationInput.value = settings.location_line || "";
    var pa = api.normalizePaFormat(settings.pa_format);
    var radios = document.querySelectorAll('input[name="settingsPaFormat"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === pa;
    }
    syncOtherVisibility();
    if (window.AghuPaFormatControls && typeof window.AghuPaFormatControls.syncRadios === "function") {
      window.AghuPaFormatControls.syncRadios(settings.pa_format);
    }
  }

  function readFormPartial() {
    var serviceLine = api.normalizeServiceSelection(
      serviceSelect ? serviceSelect.value : "0",
      otherInput ? otherInput.value : "",
    );
    var locationRaw = locationInput ? locationInput.value : "";
    var locationLine = String(locationRaw || "").trim() || api.DEFAULT_LOCATION_LINE;
    var checked = document.querySelector('input[name="settingsPaFormat"]:checked');
    return {
      service_line: serviceLine,
      location_line: locationLine,
      pa_format: api.normalizePaFormat(checked && checked.value),
    };
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persistForm();
    }, 400);
  }

  async function persistForm() {
    var partial = readFormPartial();
    setStatus("A guardar…");
    var out = await api.saveSettings(partial, currentSettings || undefined);
    if (!out.ok) {
      var msg =
        out.error === "no_session"
          ? "Inicie sessão para gravar na conta."
          : "Não foi possível gravar. Verifique a ligação e tente de novo.";
      setStatus(msg, true);
      return;
    }
    currentSettings = out.settings;
    setStatus("Guardado na conta.");
    document.dispatchEvent(
      new CustomEvent("aghu:pa-format-changed", {
        detail: { paFormat: out.settings.pa_format },
      }),
    );
  }

  function openPanel() {
    lastFocus = document.activeElement;
    fillServiceSelect();
    panel.classList.remove("hidden");
    panel.hidden = false;
    document.body.classList.add("settings-open");
    api.loadSettings().then(function (out) {
      applyToForm(out.settings);
      if (out.source === "defaults") {
        setStatus("Valores padrão. Altere e guarde com sessão activa.");
      } else {
        setStatus("");
      }
      if (serviceSelect) serviceSelect.focus();
    });
  }

  function closePanel() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      persistForm();
    }
    panel.classList.add("hidden");
    panel.hidden = true;
    document.body.classList.remove("settings-open");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (_e) {
        openBtn.focus();
      }
    } else {
      openBtn.focus();
    }
  }

  function isOpen() {
    return !panel.hidden && !panel.classList.contains("hidden");
  }

  openBtn.addEventListener("click", function () {
    if (isOpen()) closePanel();
    else openPanel();
  });
  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && isOpen()) {
      ev.preventDefault();
      closePanel();
    }
  });

  if (serviceSelect) {
    serviceSelect.addEventListener("change", function () {
      syncOtherVisibility();
      scheduleSave();
    });
  }
  if (otherInput) {
    otherInput.addEventListener("input", scheduleSave);
  }
  if (locationInput) {
    locationInput.addEventListener("input", scheduleSave);
  }
  var paRadios = document.querySelectorAll('input[name="settingsPaFormat"]');
  for (var r = 0; r < paRadios.length; r++) {
    paRadios[r].addEventListener("change", scheduleSave);
  }

  // Pré-carrega cache em memória para print/Controles
  api.loadSettings().catch(function () {});
})();
