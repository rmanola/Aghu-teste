/**
 * Selector de workspace activo no popup da extensão.
 */
(function () {
  "use strict";

  var SELECT_ID = "aghu-workspace-select";
  var WRAP_ID = "workspace-select-wrap";
  var wired = false;

  function getSelect() {
    return document.getElementById(SELECT_ID);
  }

  function getWrap() {
    return document.getElementById(WRAP_ID);
  }

  function formatOptionLabel(workspace) {
    var suffix = workspace.type === "team" ? " (equipe)" : "";
    return workspace.name + suffix;
  }

  function resolveActiveWorkspace(workspaces, activeId) {
    var active = workspaces.find(function (w) {
      return w.id === activeId;
    });
    if (active) return active;
    return (
      workspaces.find(function (w) {
        return w.type === "personal";
      }) || workspaces[0] || null
    );
  }

  function populateSelect(select, workspaces, activeId) {
    select.innerHTML = "";
    workspaces.forEach(function (ws) {
      var opt = document.createElement("option");
      opt.value = ws.id;
      opt.textContent = formatOptionLabel(ws);
      select.appendChild(opt);
    });
    select.value = activeId || "";
    var active = workspaces.find(function (w) {
      return w.id === activeId;
    });
    select.title = active
      ? "Área de trabalho: " + active.name + " (" + active.role + ")"
      : "Área de trabalho activa";
  }

  async function onWorkspaceChange(nextId) {
    var storage = window.AghuWorkspaceStorage;
    if (!storage || !nextId) return;
    await storage.setActiveWorkspaceId(nextId);
    if (window.AghuBillingStatus && window.AghuBillingStatus.invalidate) {
      await window.AghuBillingStatus.invalidate();
    }
    if (window.AghuBillingStatus && window.AghuBillingStatus.refreshBanner) {
      await window.AghuBillingStatus.refreshBanner();
    }
  }

  function wireSelectOnce(select) {
    if (wired || !select) return;
    wired = true;
    select.addEventListener("change", function () {
      var nextId = select.value;
      if (!nextId) return;
      select.disabled = true;
      onWorkspaceChange(nextId)
        .catch(function () {})
        .finally(function () {
          select.disabled = false;
        });
    });
  }

  function hideWorkspaceSelector() {
    var wrap = getWrap();
    var select = getSelect();
    if (wrap) wrap.classList.add("hidden");
    if (select) {
      select.innerHTML = '<option value="">Área…</option>';
      select.value = "";
      select.disabled = false;
    }
  }

  async function refreshWorkspaceSelector() {
    hideWorkspaceSelector();
  }

  document.addEventListener("DOMContentLoaded", function () {
    void refreshWorkspaceSelector();
  });

  window.AghuWorkspacePopup = {
    refreshWorkspaceSelector: refreshWorkspaceSelector,
    /** @deprecated use refreshWorkspaceSelector */
    refreshWorkspaceLabel: refreshWorkspaceSelector,
    hideWorkspaceSelector: hideWorkspaceSelector,
  };
})();
