/**
 * Abre o painel web AGHU numa nova aba.
 * Com sessão ativa: código SSO one-time (SEC-M-05); fallback hash legado.
 */
(function () {
  "use strict";

  /**
   * Popup MV2 é janela type=popup — tabs.create aqui não navega HTTP.
   * Background abre na janela normal (aghu_source_tab_id ou última normal).
   * @param {string} url
   * @returns {Promise<void>}
   */
  function openPanelUrl(url) {
    return browser.runtime
      .sendMessage({ action: "openWebPanelTab", url: url })
      .then(function (res) {
        if (!res || !res.ok) {
          throw new Error((res && res.error) || "open_web_panel_failed");
        }
        console.log(
          "[AGHU webapp] painel aberto tabId=",
          res.tabId,
          "windowId=",
          res.windowId,
        );
      });
  }

  /**
   * @param {string} [path] path relativo (ex.: "/altas/modelos") a abrir após
   *   o SSO. Forward-compatible: acrescenta `next=` à URL de `/auth/extension`
   *   (sessão activa) ou abre o path directamente na base sem sessão — a
   *   rota `/auth/extension` ainda não lê `next` no lado do painel web; sem
   *   impacto no fallback "/" já existente quando `path` é omitido.
   * @returns {Promise<void>}
   */
  async function openWebApp(path) {
    var config = window.AghuSupabaseConfig;
    var base = config && typeof config.getWebAppUrl === "function"
      ? config.getWebAppUrl()
      : "https://aghu.vercel.app";

    var targetPath = path && String(path).trim() ? String(path).trim() : "/";

    if (window.AghuBillingStatus) {
      var webCheck = await window.AghuBillingStatus.checkFeature("webPanel");
      if (!webCheck.ok) {
        if (typeof window.AghuBillingStatus.openPlansPanel === "function") {
          window.AghuBillingStatus.openPlansPanel();
          return;
        }
        console.warn("[AGHU webapp] webPanel negado e painel de planos indisponível");
        return;
      }
    }

    var url = base + targetPath;
    var auth = window.AghuSupabaseAuth;
    var workspaceStorage = window.AghuWorkspaceStorage;
    var activeWorkspaceId =
      workspaceStorage && typeof workspaceStorage.getActiveWorkspaceId === "function"
        ? await workspaceStorage.getActiveWorkspaceId()
        : null;
    var workspaceQuery =
      activeWorkspaceId && String(activeWorkspaceId).trim()
        ? "&workspace_id=" + encodeURIComponent(String(activeWorkspaceId).trim())
        : "";
    var workspacePathQuery =
      activeWorkspaceId && String(activeWorkspaceId).trim()
        ? "?workspace_id=" + encodeURIComponent(String(activeWorkspaceId).trim())
        : "";
    var nextQuery =
      targetPath !== "/" ? "&next=" + encodeURIComponent(targetPath) : "";
    var nextPathQuery =
      targetPath !== "/"
        ? (workspacePathQuery ? "&" : "?") + "next=" + encodeURIComponent(targetPath)
        : "";
    if (auth && typeof auth.getSession === "function") {
      var session = await auth.getSession();
      if (session && session.access_token && session.refresh_token) {
        var bridge = window.AghuSessionExtensionBridge;
        if (bridge && typeof bridge.createSsoCode === "function") {
          var sso = await bridge.createSsoCode(session);
          if (sso.ok && sso.code) {
            url =
              base +
              "/auth/extension?sso_code=" +
              encodeURIComponent(sso.code) +
              workspaceQuery +
              nextQuery;
            await openPanelUrl(url);
            return;
          }
          console.warn(
            "[AGHU webapp] SSO code falhou, fallback hash:",
            sso.error || "unknown",
          );
        }
        var params = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          token_type: session.token_type || "bearer",
        });
        url =
          base +
          "/auth/extension" +
          workspacePathQuery +
          nextPathQuery +
          "#" +
          params.toString();
      }
    }
    await openPanelUrl(url);
  }

  /**
   * Abre um path específico do painel web (reaproveita o mesmo fluxo de SSO
   * / fallback hash de `openWebApp`). Ex.: `openPath("/altas/modelos")`.
   * @param {string} path
   * @returns {Promise<void>}
   */
  function openWebAppPath(path) {
    return openWebApp(path);
  }

  window.AghuWebApp = {
    open: function () {
      return openWebApp();
    },
    openPath: openWebAppPath,
    /** Abre URL absoluta do painel via background (janela normal). */
    openUrl: openPanelUrl,
  };

  function wireOpenButton() {
    // FEAT-306: botão «Painel web» removido — openPath/openUrl continuam para billing.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireOpenButton);
  } else {
    wireOpenButton();
  }
})();
