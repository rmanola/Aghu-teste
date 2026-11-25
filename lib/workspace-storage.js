/**
 * Workspace activo na extensão (browser.storage.local).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aghu_active_workspace_v1";

  async function getActiveWorkspaceId() {
    var got = await browser.storage.local.get(STORAGE_KEY);
    var id = got[STORAGE_KEY];
    return typeof id === "string" && id ? id : null;
  }

  async function setActiveWorkspaceId(workspaceId) {
    var payload = {};
    if (workspaceId) {
      payload[STORAGE_KEY] = workspaceId;
    } else {
      await browser.storage.local.remove(STORAGE_KEY);
      return;
    }
    await browser.storage.local.set(payload);
  }

  function workspaceHeaders(workspaceId) {
    if (!workspaceId) return {};
    var access = window.AghuWorkspaceAccess;
    var header = access && access.WORKSPACE_HEADER
      ? access.WORKSPACE_HEADER
      : "X-AGHU-Workspace-Id";
    var out = {};
    out[header] = workspaceId;
    return out;
  }

  window.AghuWorkspaceStorage = {
    getActiveWorkspaceId: getActiveWorkspaceId,
    setActiveWorkspaceId: setActiveWorkspaceId,
    workspaceHeaders: workspaceHeaders,
    STORAGE_KEY: STORAGE_KEY,
  };
})();
