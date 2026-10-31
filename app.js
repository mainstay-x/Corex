(function () {
  "use strict";

  const api = window.CorexApi;
  const config = window.COREX_CONFIG;
  const state = { profile: null, route: "home", routeParam: null, booting: false };

  const elements = {
    loginView: document.getElementById("login-view"),
    loginForm: document.getElementById("login-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    loginSubmit: document.getElementById("login-submit"),
    loginMessage: document.getElementById("login-message"),
    togglePassword: document.getElementById("toggle-password"),
    appView: document.getElementById("app-view"),
    primaryNav: document.getElementById("primary-nav"),
    workspace: document.getElementById("workspace"),
    pageKicker: document.getElementById("page-kicker"),
    pageTitle: document.getElementById("page-title"),
    topbarActions: document.getElementById("topbar-actions"),
    profileAvatar: document.getElementById("profile-avatar"),
    profileName: document.getElementById("profile-name"),
    profileRole: document.getElementById("profile-role"),
    connectionStatus: document.getElementById("connection-status"),
    logoutButton: document.getElementById("logout-button"),
    sidebarCollapse: document.getElementById("sidebar-collapse"),
    mobileMenu: document.getElementById("mobile-menu"),
    sidebarScrim: document.getElementById("sidebar-scrim"),
    contextPanel: document.getElementById("context-panel"),
    contextTitle: document.getElementById("context-title"),
    contextContent: document.getElementById("context-content"),
    contextClose: document.getElementById("context-close"),
    environmentLabel: document.getElementById("environment-label"),
    statusClock: document.getElementById("status-clock"),
    toastRegion: document.getElementById("toast-region"),
  };

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, className, textValue) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  }

  function initials(value) {
    return String(value || "C")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function roleLabel(profile) {
    if (profile.job_title) return profile.job_title;
    if (profile.role === "founder") return "Founder";
    if (profile.role === "closer") return profile.is_admin ? "Closer · Administrador" : "Closer";
    if (profile.role === "sdr") return profile.is_admin ? "SDR · Administrador" : "SDR";
    return String(profile.role || "Usuário")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function canManageUsers(profile) {
    return Boolean(
      profile &&
        (profile.role === "founder" ||
          profile.is_admin ||
          (profile.permissions && profile.permissions.manage_users === true)),
    );
  }

  function hasPermission(profile, permission) {
    return Boolean(profile && profile.permissions && profile.permissions[permission] === true);
  }

  function setLoginMessage(message) {
    elements.loginMessage.textContent = message || "";
  }

  function showLogin(message) {
    state.profile = null;
    elements.appView.hidden = true;
    elements.loginView.hidden = false;
    elements.loginPassword.value = "";
    setLoginMessage(message || "");
    window.setTimeout(() => elements.loginEmail.focus(), 0);
  }

  function showApp() {
    setLoginMessage("");
    elements.loginView.hidden = true;
    elements.appView.hidden = false;
    renderProfile();
    renderNavigation();
    const first = navigationItems()[0] || { id: "home" };
    navigate(first.id);
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.firstElementChild.textContent = label;
  }

  function toast(message, kind) {
    const item = make("div", "toast" + (kind ? " " + kind : ""), message);
    elements.toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 3800);
  }

  function renderProfile() {
    const profile = state.profile;
    elements.profileName.textContent = profile.display_name;
    elements.profileRole.textContent = roleLabel(profile);
    elements.profileAvatar.textContent = initials(profile.display_name);
    elements.connectionStatus.textContent = profile.display_name + " · " + roleLabel(profile);
  }

  function navigationItems() {
    const profile = state.profile;
    const items = [];
    const sdrAccess = profile && (profile.role === "sdr" || profile.role === "founder" || profile.is_admin || hasPermission(profile, "manage_all_leads"));
    const closerAccess = profile && (profile.role === "closer" || profile.role === "founder" || profile.is_admin || hasPermission(profile, "manage_all_leads"));
    const billingAccess = profile && (profile.role === "founder" || profile.is_admin || hasPermission(profile, "manage_billing"));
    if (sdrAccess) {
      items.push(
        { id: "briefing", label: "Briefing", icon: "◫" },
        { id: "leads", label: "Leads", icon: "◎" },
      );
    }
    if (closerAccess) items.push({ id: "opportunities", label: "Oportunidades", icon: "◇" });
    if (sdrAccess || closerAccess) items.push({ id: "followups", label: "Retornos", icon: "◷" });
    if (billingAccess) items.push({ id: "payments", label: "Pagamentos", icon: "▣" });
    if (sdrAccess) items.push({ id: "goals", label: "Metas", icon: "◇" });
    if (!items.length) items.push({ id: "home", label: "Início", icon: "⌂" });
    if (canManageUsers(state.profile)) items.push({ id: "users", label: "Usuários", icon: "◎" });
    return items;
  }

  function renderNavigation() {
    clear(elements.primaryNav);
    navigationItems().forEach((item) => {
      const button = make("button", "nav-button");
      button.type = "button";
      button.dataset.route = item.id;
      const icon = make("span", "nav-icon", item.icon);
      icon.setAttribute("aria-hidden", "true");
      button.append(icon, make("span", "nav-label", item.label));
      button.addEventListener("click", () => navigate(item.id));
      elements.primaryNav.appendChild(button);
    });
  }

  function setActiveNavigation(route) {
    const hasOpportunities = navigationItems().some((item) => item.id === "opportunities");
    const hasLeads = navigationItems().some((item) => item.id === "leads");
    const activeRoute = route === "lead" ? (hasOpportunities && !hasLeads ? "opportunities" : "leads") : route;
    elements.primaryNav.querySelectorAll(".nav-button").forEach((button) => {
      const active = button.dataset.route === activeRoute;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function setHeader(title, kicker) {
    elements.pageTitle.textContent = title;
    elements.pageKicker.textContent = kicker;
  }

  function setTopbarActions(nodes) {
    clear(elements.topbarActions);
    (nodes || []).forEach((node) => elements.topbarActions.appendChild(node));
  }

  function openPanel(title, content) {
    elements.contextTitle.textContent = title;
    clear(elements.contextContent);
    if (content) elements.contextContent.appendChild(content);
    elements.contextPanel.hidden = false;
  }

  function closePanel() {
    elements.contextPanel.hidden = true;
    elements.contextTitle.textContent = "";
    clear(elements.contextContent);
  }

  function renderHome() {
    setHeader("Início", "Visão geral");
    setTopbarActions([]);
    closePanel();
    clear(elements.workspace);

    const hero = make("section", "hero-card");
    const heroCopy = make("div", "hero-copy");
    heroCopy.appendChild(make("p", "eyebrow", "Fundação ativa"));
    heroCopy.appendChild(make("h2", "", "Bem-vindo ao ambiente comercial da FlowCore."));
    const heroText = make("p");
    heroText.append("Sua sessão está protegida e os módulos disponíveis respeitam os privilégios de ");
    const name = make("strong", "", state.profile.display_name);
    heroText.appendChild(name);
    heroText.append(".");
    heroCopy.appendChild(heroText);
    hero.append(heroCopy, make("span", "hero-badge", "Fase 0"));

    const grid = make("section", "section-grid");
    const cards = [
      ["01", "Acesso configurado", "Autenticação por e-mail e perfil operacional validado."],
      ["02", "Privilégios aplicados", "A navegação exibe somente os recursos liberados para esta conta."],
      ["03", "Base preparada", "A fundação está pronta para receber os módulos das próximas fases."],
    ];
    cards.forEach(([icon, title, description]) => {
      const card = make("article", "surface-card");
      card.append(make("span", "card-icon", icon), make("h3", "", title), make("p", "", description));
      grid.appendChild(card);
    });

    elements.workspace.append(hero, grid);
  }

  async function renderUsers() {
    if (!canManageUsers(state.profile) || !window.CorexScreens || !window.CorexScreens.users) {
      navigate("home");
      return;
    }
    setHeader("Usuários", "Administração");
    closePanel();
    await window.CorexScreens.users.render({
      workspace: elements.workspace,
      currentProfile: state.profile,
      api,
      make,
      clear,
      toast,
      openPanel,
      closePanel,
      setTopbarActions,
      navigate,
    });
  }

  function screenContext() {
    return {
      workspace: elements.workspace, currentProfile: state.profile, api, make, clear, toast,
      openPanel, closePanel, setTopbarActions, navigate,
    };
  }

  function navigate(route, param) {
    const items = navigationItems();
    const allowed = items.some((item) => item.id === route) || (route === "lead" && items.some((item) => item.id === "leads" || item.id === "opportunities" || item.id === "payments"));
    state.route = allowed ? route : (navigationItems()[0] || { id: "home" }).id;
    state.routeParam = allowed ? param || null : null;
    setActiveNavigation(state.route);
    elements.appView.classList.remove("mobile-nav-open");
    elements.sidebarScrim.hidden = true;
    closePanel();
    setTopbarActions([]);
    if (state.route === "users") renderUsers();
    else if (state.route === "lead") { setHeader("Ficha do lead", "CRM"); window.CorexScreens.lead.render(screenContext(), state.routeParam); }
    else if (state.route === "briefing") { setHeader("Briefing", "Operação SDR"); window.CorexScreens.briefing.render(screenContext()); }
    else if (state.route === "leads") { setHeader("Leads", "Operação SDR"); window.CorexScreens.leads.render(screenContext()); }
    else if (state.route === "opportunities") { setHeader("Oportunidades", "Operação Closer"); window.CorexScreens.opportunities.render(screenContext()); }
    else if (state.route === "followups") { setHeader("Retornos", state.profile.role === "closer" ? "Operação Closer" : "Operação comercial"); window.CorexScreens.followups.render(screenContext()); }
    else if (state.route === "payments") { setHeader("Pagamentos", "Controle manual"); window.CorexScreens.payments.render(screenContext()); }
    else if (state.route === "goals") { setHeader("Metas", "Operação SDR"); window.CorexScreens.goals.render(screenContext()); }
    else renderHome();
    elements.workspace.focus();
  }

  async function loadAuthenticatedApp() {
    if (state.booting) return;
    state.booting = true;
    try {
      const profile = await api.getCurrentProfile();
      if (!profile) {
        await api.signOut();
        showLogin("Acesso não configurado");
        return;
      }
      if (!profile.active) {
        await api.signOut();
        showLogin("Acesso desativado");
        return;
      }
      state.profile = profile;
      showApp();
    } catch (error) {
      showLogin(error.message || "Não foi possível carregar o acesso.");
    } finally {
      state.booting = false;
    }
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("");
    if (!elements.loginForm.reportValidity()) return;
    setBusy(elements.loginSubmit, true, "Entrando...");
    try {
      await api.signIn(elements.loginEmail.value.trim(), elements.loginPassword.value);
      await loadAuthenticatedApp();
    } catch (error) {
      setLoginMessage(error.message || "E-mail ou senha inválidos.");
    } finally {
      setBusy(elements.loginSubmit, false, "Entrar");
    }
  });

  elements.togglePassword.addEventListener("click", () => {
    const visible = elements.loginPassword.type === "text";
    elements.loginPassword.type = visible ? "password" : "text";
    elements.togglePassword.textContent = visible ? "Mostrar" : "Ocultar";
    elements.togglePassword.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
  });

  elements.logoutButton.addEventListener("click", async () => {
    try {
      await api.signOut();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLogin("");
    }
  });

  elements.sidebarCollapse.addEventListener("click", () => {
    elements.appView.classList.toggle("sidebar-is-collapsed");
    const collapsed = elements.appView.classList.contains("sidebar-is-collapsed");
    elements.sidebarCollapse.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  });

  elements.mobileMenu.addEventListener("click", () => {
    elements.appView.classList.add("mobile-nav-open");
    elements.sidebarScrim.hidden = false;
  });

  elements.sidebarScrim.addEventListener("click", () => {
    elements.appView.classList.remove("mobile-nav-open");
    elements.sidebarScrim.hidden = true;
  });

  elements.contextClose.addEventListener("click", closePanel);

  elements.environmentLabel.textContent = config.environment + " · " + config.timeZone;
  const clockFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: config.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  function updateClock() {
    elements.statusClock.textContent = clockFormatter.format(new Date());
  }
  updateClock();
  window.setInterval(updateClock, 1000);

  api.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") showLogin("");
    if (event === "SIGNED_IN" && session && !state.profile) window.setTimeout(loadAuthenticatedApp, 0);
  });

  api
    .getSession()
    .then((session) => (session ? loadAuthenticatedApp() : showLogin("")))
    .catch((error) => showLogin(error.message));
})();
