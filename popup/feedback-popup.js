/**
 * FAB e modal de feedback na extensão (utilizador autenticado).
 */
(function () {
  "use strict";

  var DESCRIPTION_MIN = 20;
  var selectedKind = "bug";

  var ERROR_MESSAGES = {
    missing_bearer_token: "Inicie sessão para enviar feedback.",
    invalid_kind: "Selecione bug ou funcionalidade.",
    description_too_short: "Descreva com pelo menos 20 caracteres.",
    description_too_long: "Descrição demasiado longa.",
    rate_limit_exceeded: "Limite de envios. Tente dentro de uma hora.",
    submit_failed: "Não foi possível enviar.",
    network_error: "Falha de rede.",
    modules_missing: "Módulos de feedback indisponíveis.",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.classList.remove("hidden");
  }

  function hide(el) {
    if (el) el.classList.add("hidden");
  }

  function setError(msg) {
    var el = $("feedback-error");
    if (!el) return;
    if (!msg) {
      hide(el);
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    show(el);
  }

  function resetForm() {
    selectedKind = "bug";
    document.querySelectorAll(".feedback-kind-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-kind") === "bug");
    });
    var title = $("feedback-title");
    var desc = $("feedback-description");
    if (title) title.value = "";
    if (desc) desc.value = "";
    setError("");
    show($("feedback-form-view"));
    hide($("feedback-success-view"));
  }

  function openDialog() {
    var dlg = $("feedback-dialog");
    if (!dlg || typeof dlg.showModal !== "function") return;
    resetForm();
    dlg.showModal();
  }

  function closeDialog() {
    var dlg = $("feedback-dialog");
    if (dlg && typeof dlg.close === "function") dlg.close();
    resetForm();
  }

  function errorMessage(code) {
    return ERROR_MESSAGES[code] || "Erro ao enviar feedback.";
  }

  async function resolvePatientKey() {
    var sel = document.getElementById("patientSelect");
    if (sel && sel.value && sel.value !== "__page__") {
      return sel.value;
    }
    return null;
  }

  async function resolveRecordClientId() {
    if (!window.AghuSupabaseSync || !window.AghuSupabaseSync.ensureRecordClientId) {
      return null;
    }
    var patientKey = await resolvePatientKey();
    if (!patientKey) return null;
    try {
      return await window.AghuSupabaseSync.ensureRecordClientId(patientKey);
    } catch (_e) {
      return null;
    }
  }

  async function collectExtensionContext() {
    var pagePath = "popup";
    var pageUrl = "extension://popup";
    try {
      var tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs[0] && tabs[0].url) {
        var u = new URL(tabs[0].url);
        pagePath = u.pathname || "/";
        pageUrl = u.origin + u.pathname + u.search;
      }
    } catch (_e) {
      /* best-effort */
    }
    var recordClientId = await resolveRecordClientId();
    return {
      page_path: pagePath,
      page_url: pageUrl,
      record_client_id: recordClientId,
    };
  }

  async function handleSubmit() {
    var submitBtn = $("feedback-submit");
    var descEl = $("feedback-description");
    if (!window.AghuProductFeedbackSubmit) {
      setError(errorMessage("modules_missing"));
      return;
    }
    var description = descEl ? String(descEl.value || "").trim() : "";
    if (description.length < DESCRIPTION_MIN) {
      setError(errorMessage("description_too_short"));
      return;
    }

    setError("");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "A enviar…";
    }

    try {
      var ctx = await collectExtensionContext();
      var titleEl = $("feedback-title");
      var out = await window.AghuProductFeedbackSubmit.submitProductFeedback({
        kind: selectedKind,
        description: description,
        title: titleEl ? String(titleEl.value || "").trim() : "",
        page_path: ctx.page_path,
        page_url: ctx.page_url,
        record_client_id: ctx.record_client_id,
      });

      if (!out.ok) {
        setError(errorMessage(out.error));
        return;
      }

      hide($("feedback-form-view"));
      show($("feedback-success-view"));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar";
      }
    }
  }

  function bindKindToggle() {
    document.querySelectorAll(".feedback-kind-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedKind = btn.getAttribute("data-kind") || "bug";
        document.querySelectorAll(".feedback-kind-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });
  }

  function init() {
    var fab = $("feedback-fab");
    if (fab) fab.addEventListener("click", openDialog);

    var closeBtn = $("feedback-close");
    var cancelBtn = $("feedback-cancel");
    var doneBtn = $("feedback-done");
    var submitBtn = $("feedback-submit");
    var dlg = $("feedback-dialog");

    if (closeBtn) closeBtn.addEventListener("click", closeDialog);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
    if (doneBtn) doneBtn.addEventListener("click", closeDialog);
    if (submitBtn) submitBtn.addEventListener("click", handleSubmit);
    if (dlg) {
      dlg.addEventListener("cancel", function (e) {
        e.preventDefault();
        closeDialog();
      });
    }

    bindKindToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
