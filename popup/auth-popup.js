/**
 * Controlador da tela de Login do popup AGHU.
 *
 * Decide se mostra a tela de login ou as abas Exames/Controles com base na
 * sessão atual de `window.AghuSupabaseAuth`. Atualiza o atributo
 * `data-auth` no <body> (pending | signed-out | signed-in), e o CSS de
 * `popup/popup.html` esconde/exibe os blocos conforme esse estado.
 */
(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  var body                  = document.body;
  var loginCard             = document.querySelector(".login-card");
  var emailInput            = $("#auth-email");
  var passwordInput         = $("#auth-password");
  var passwordConfirmInput  = $("#auth-password-confirm");
  var form                  = $("#auth-form");
  var btnSubmit             = $("#btn-auth-submit");
  var btnSignOut            = $("#btn-auth-signout");
  var msgEl                 = $("#auth-message");
  var userEmailEl           = $("#auth-user-email");
  var tabSignIn             = $("#tab-signin");
  var tabSignUp             = $("#tab-signup");

  /** Modo da tela: "signin" | "signup". */
  var mode = "signin";
  var SIGNUP_PLANS = ["free", "interno", "residente", "staff"];

  function getSelectedSignupPlan() {
    var el = document.querySelector('input[name="auth-plan"]:checked');
    return el && el.value ? el.value : "";
  }

  function getSelectedSignupInterval() {
    var el = document.querySelector('input[name="auth-plan-interval"]:checked');
    return el && el.value === "annual" ? "annual" : "month";
  }

  function syncSignupIntervalVisibility() {
    var intervalFs = document.getElementById("auth-plan-interval");
    if (!intervalFs) return;
    var plan = getSelectedSignupPlan();
    var paid = plan && plan !== "free";
    if (paid) {
      intervalFs.classList.remove("hidden");
      intervalFs.removeAttribute("hidden");
    } else {
      intervalFs.classList.add("hidden");
      intervalFs.setAttribute("hidden", "");
    }
  }

  function setAuthState(state) {
    body.setAttribute("data-auth", state);
  }

  function clearMessage() {
    if (!msgEl) return;
    msgEl.textContent = "";
    msgEl.className = "auth-message";
  }

  function showMessage(kind, text) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = "auth-message " + (kind || "info");
  }

  function setBusy(busy) {
    if (btnSubmit) btnSubmit.disabled = !!busy;
    if (emailInput) emailInput.disabled = !!busy;
    if (passwordInput) passwordInput.disabled = !!busy;
    if (passwordConfirmInput) passwordConfirmInput.disabled = !!busy;
    if (tabSignIn) tabSignIn.disabled = !!busy;
    if (tabSignUp) tabSignUp.disabled = !!busy;
  }

  function setMode(newMode) {
    mode = newMode === "signup" ? "signup" : "signin";
    if (loginCard) loginCard.setAttribute("data-mode", mode);
    if (tabSignIn) {
      tabSignIn.classList.toggle("active", mode === "signin");
      tabSignIn.setAttribute("aria-selected", mode === "signin" ? "true" : "false");
    }
    if (tabSignUp) {
      tabSignUp.classList.toggle("active", mode === "signup");
      tabSignUp.setAttribute("aria-selected", mode === "signup" ? "true" : "false");
    }
    if (passwordInput) {
      passwordInput.setAttribute(
        "autocomplete",
        mode === "signup" ? "new-password" : "current-password"
      );
    }
    if (passwordConfirmInput) {
      passwordConfirmInput.required = mode === "signup";
      if (mode === "signin") passwordConfirmInput.value = "";
    }
    clearMessage();
    syncSignupIntervalVisibility();
  }

  function showEvictNotice(evicted) {
    if (evicted && evicted.length) {
      showMessage(
        "info",
        "Outra sessão (extensão ou web) foi encerrada por inatividade."
      );
    }
  }

  function applySession(session) {
    if (session && session.access_token) {
      var email = (session.user && session.user.email) || "Sessão ativa";
      if (userEmailEl) userEmailEl.textContent = email;
      setAuthState("signed-in");
      if (window.AghuBillingStatus && window.AghuBillingStatus.refreshBanner) {
        window.AghuBillingStatus.refreshBanner().catch(function () {});
      }
      if (window.AghuWorkspacePopup && window.AghuWorkspacePopup.refreshWorkspaceSelector) {
        window.AghuWorkspacePopup.refreshWorkspaceSelector().catch(function () {});
      }
      if (window.AghuBillingStatus && window.AghuBillingStatus.maybeStartPendingCheckout) {
        window.AghuBillingStatus.maybeStartPendingCheckout().catch(function () {});
      }
    } else {
      if (userEmailEl) userEmailEl.textContent = "";
      setAuthState("signed-out");
      if (window.AghuWorkspacePopup && window.AghuWorkspacePopup.hideWorkspaceSelector) {
        window.AghuWorkspacePopup.hideWorkspaceSelector();
      }
      var banner = document.getElementById("billing-banner");
      if (banner) banner.classList.add("hidden");
    }
  }

  function ensureReady() {
    var auth = window.AghuSupabaseAuth;
    if (!auth) {
      showMessage("error", "Módulo de autenticação não carregado.");
      return null;
    }
    var cfg = window.AghuSupabaseConfig;
    if (!cfg || !cfg.isConfigured()) {
      showMessage(
        "warn",
        "Extensão não configurada: preencha SUPABASE_URL e anon key em lib/supabase-config.js."
      );
      return null;
    }
    return auth;
  }

  async function handleSubmit(ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    clearMessage();
    var auth = ensureReady();
    if (!auth) return;

    var email = emailInput ? emailInput.value : "";
    var pwd   = passwordInput ? passwordInput.value : "";

    if (mode === "signup") {
      var pwdConfirm = passwordConfirmInput ? passwordConfirmInput.value : "";
      if (pwd !== pwdConfirm) {
        showMessage("error", "As palavras-passe não coincidem.");
        return;
      }
      var plan = getSelectedSignupPlan();
      if (!plan || SIGNUP_PLANS.indexOf(plan) < 0) {
        showMessage("error", "Escolha um plano (Grátis, Interno, Residente ou Staff).");
        return;
      }
      var interval = getSelectedSignupInterval();
      var billing = window.AghuBillingStatus;
      setBusy(true);
      showMessage("info", "A criar conta…");
      var resUp = await auth.signUp(email, pwd);
      if (!resUp || !resUp.ok) {
        setBusy(false);
        showMessage("error", (resUp && resUp.error) || "Falha ao criar conta.");
        return;
      }
      if (resUp.needsConfirmation) {
        if (plan !== "free" && billing && billing.setPendingSignupCheckout) {
          await billing.setPendingSignupCheckout(plan, interval);
        }
        setBusy(false);
        showMessage(
          "info",
          "Conta criada. Confirme o link enviado para " +
            String(email).trim().toLowerCase() +
            " e depois entre." +
            (plan !== "free"
              ? " Após entrar, abrimos o Checkout do plano escolhido."
              : "")
        );
        if (passwordInput) passwordInput.value = "";
        if (passwordConfirmInput) passwordConfirmInput.value = "";
        setMode("signin");
        return;
      }
      if (passwordInput) passwordInput.value = "";
      if (passwordConfirmInput) passwordConfirmInput.value = "";
      clearMessage();
      applySession(resUp.session);
      showEvictNotice(resUp.evicted);
      if (plan !== "free" && billing && billing.startSignupCheckout) {
        showMessage("info", "A abrir Checkout Stripe…");
        var co = await billing.startSignupCheckout(plan, interval);
        setBusy(false);
        if (!co || !co.ok) {
          showMessage(
            "warn",
            (co && co.message) ||
              "Conta criada no plano Grátis. Pode assinar depois em Ver planos."
          );
          return;
        }
        clearMessage();
        return;
      }
      setBusy(false);
      return;
    }

    setBusy(true);
    showMessage("info", "A autenticar…");
    var resIn = await auth.signInWithPassword(email, pwd);
    setBusy(false);
    if (!resIn || !resIn.ok) {
      showMessage("error", (resIn && resIn.error) || "Falha ao autenticar.");
      return;
    }
    clearMessage();
    if (passwordInput) passwordInput.value = "";
    applySession(resIn.session);
    showEvictNotice(resIn.evicted);
  }

  async function handleForgotPassword() {
    var auth = window.AghuSupabaseAuth;
    if (!auth || typeof auth.resetPasswordForEmail !== "function") {
      showMessage("error", "Auth indisponível. Recarregue a extensão.");
      return;
    }

    var email = emailInput ? String(emailInput.value || "").trim() : "";
    if (!email) {
      showMessage("error", "Indique o e-mail da conta para recuperar a palavra-passe.");
      if (emailInput) emailInput.focus();
      return;
    }

    var config = window.AghuSupabaseConfig;
    var base =
      config && typeof config.getWebAppUrl === "function"
        ? config.getWebAppUrl()
        : "";
    var build =
      window.AghuForgotPasswordUrl &&
      typeof window.AghuForgotPasswordUrl.buildPasswordRecoveryRedirectUrl ===
        "function"
        ? window.AghuForgotPasswordUrl.buildPasswordRecoveryRedirectUrl
        : null;
    var redirectTo = build ? build(base) : null;
    if (!redirectTo) {
      showMessage(
        "error",
        "Painel web não configurado: defina WEB_APP_URL em lib/supabase-config.js.",
      );
      return;
    }

    if (typeof auth.getSession === "function") {
      try {
        var session = await auth.getSession();
        if (session && session.access_token && typeof auth.signOut === "function") {
          await auth.signOut();
        }
      } catch (_e) {
        /* segue para o pedido de recuperação */
      }
    }

    setBusy(true);
    showMessage("info", "A enviar e-mail de recuperação…");
    var res;
    try {
      res = await auth.resetPasswordForEmail(email, redirectTo);
    } catch (_e) {
      setBusy(false);
      showMessage("error", "Falha ao pedir recuperação. Tente novamente.");
      return;
    }
    setBusy(false);
    if (!res || !res.ok) {
      showMessage(
        "error",
        (res && res.error) || "Falha ao pedir recuperação. Tente novamente.",
      );
      return;
    }
    showMessage(
      "info",
      "Se existir conta com este e-mail, enviámos instruções para redefinir a palavra-passe.",
    );
  }

  async function handleSignOut() {
    var auth = window.AghuSupabaseAuth;
    if (!auth) return;
    if (btnSignOut) btnSignOut.disabled = true;
    try {
      await auth.signOut();
    } finally {
      if (btnSignOut) btnSignOut.disabled = false;
    }
    if (emailInput) emailInput.focus();
  }

  async function init() {
    if (window.AghuAuthStorageGuard && window.AghuAuthStorageGuard.ready) {
      await window.AghuAuthStorageGuard.ready;
    }

    if (window.AghuPatientStorageMigrate) {
      try {
        await window.AghuPatientStorageMigrate.runPatientStorageMigration();
      } catch (e) {
        console.warn("[AGHU] migração de pacientes", e && e.message);
      }
    }

    setAuthState("pending");
    var auth = window.AghuSupabaseAuth;
    var cfg  = window.AghuSupabaseConfig;

    // Modo offline: sem login — entra direto com a sessão local.
    if (auth && auth.OFFLINE) {
      if (btnSignOut) {
        btnSignOut.classList.add("hidden");
        btnSignOut.setAttribute("hidden", "");
      }
      applySession(await auth.getSession());
      return;
    }
    if (!auth || !cfg) {
      setAuthState("signed-out");
      showMessage("error", "Módulo de autenticação indisponível.");
      return;
    }
    if (!cfg.isConfigured()) {
      setAuthState("signed-out");
      showMessage(
        "warn",
        "Extensão não configurada: preencha SUPABASE_URL e anon key em lib/supabase-config.js."
      );
      return;
    }

    auth.onAuthChange(function (state) {
      void (async function () {
        var purge = window.AghuExtensionClinicalPurge;
        if (state.event === "signed_out") {
          if (purge) {
            var outSignOut = await purge.assertStorageOwner(null);
            if (outSignOut.purged && window.AghuClinicalUiReset) {
              window.AghuClinicalUiReset.dispatch();
            }
          }
          applySession(null);
          return;
        }
        if (state.event === "signed_in") {
          if (purge) {
            var userId =
              state.session &&
              state.session.user &&
              state.session.user.id
                ? state.session.user.id
                : null;
            var outSignIn = await purge.assertStorageOwner(userId);
            if (outSignIn.purged && window.AghuClinicalUiReset) {
              window.AghuClinicalUiReset.dispatch();
            }
          }
          applySession(state.session);
          return;
        }
        if (state.event === "token_refreshed") {
          applySession(state.session);
        }
      })();
    });

    var session = null;
    try {
      session = await auth.getSession();
    } catch (e) {
      console.warn("[AGHU auth] getSession error", e && e.message);
    }
    applySession(session);
    if (session && session.access_token && window.AghuSessionRegister) {
      window.AghuSessionRegister.registerActiveSession({
        platform: "extension",
        access_token: session.access_token,
      }).catch(function () { /* heartbeat best-effort */ });
    }
    if (!session && emailInput) {
      try { emailInput.focus(); } catch (_e) { /* noop */ }
    }
  }

  if (form) form.addEventListener("submit", handleSubmit);
  if (btnSignOut) btnSignOut.addEventListener("click", handleSignOut);
  var btnForgot = $("#btn-forgot-password");
  if (btnForgot) {
    btnForgot.addEventListener("click", function () {
      handleForgotPassword().catch(function () {
        showMessage("error", "Não foi possível abrir o painel web.");
      });
    });
  }
  if (tabSignIn) {
    tabSignIn.addEventListener("click", function () { setMode("signin"); });
  }
  if (tabSignUp) {
    tabSignUp.addEventListener("click", function () { setMode("signup"); });
  }
  document.querySelectorAll('input[name="auth-plan"]').forEach(function (radio) {
    radio.addEventListener("change", syncSignupIntervalVisibility);
  });
  setMode("signin");

  /**
   * Helper para outros módulos consumirem token quando precisarem sincronizar.
   * Ex.: `await window.AghuAuthUI.requireSession()` retorna access_token ou null.
   */
  window.AghuAuthUI = {
    requireSession: async function () {
      var auth = window.AghuSupabaseAuth;
      if (!auth) return null;
      var session = await auth.getSession();
      if (!session) {
        applySession(null);
        return null;
      }
      return session.access_token;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
