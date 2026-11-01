(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  const wa = () => window.CorexWhatsapp;
  const ui = () => window.CorexSdr;

  function metric(context, label, value) {
    const node = context.make("div", "metric");
    node.append(context.make("span", "", label), context.make("b", "", value));
    return node;
  }

  function monthLabel(value) {
    const parts = String(value || "").slice(0, 7).split("-");
    return parts.length === 2 ? parts[1] + "/" + parts[0] : "Mês corrente";
  }

  function limitForm(context, summary, reload) {
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Limite de " + monthLabel(summary.month)));
    section.appendChild(context.make("p", "", "Consumo atual: " + wa().money(summary.spent) + ". Para desbloquear, salve um limite maior que o consumo e desmarque o bloqueio."));
    const amount = ui().input("whatsapp-limit", "number", Number(summary.limit || 0).toFixed(2), true);
    amount.min = "0";
    amount.max = "100000";
    amount.step = "0.01";
    ui().field(context, section, "Limite mensal (R$)", amount);
    const blockRow = context.make("label", "check-row");
    const block = document.createElement("input");
    block.type = "checkbox";
    block.id = "whatsapp-block";
    block.checked = Boolean(summary.manual_block);
    const copy = context.make("span", "check-copy", "Bloquear envios cobrados");
    blockRow.append(block, copy);
    section.appendChild(blockRow);
    const save = context.make("button", "button button-primary", "Salvar limite");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        await context.api.setWhatsappLimit(Number(amount.value), block.checked);
        context.closePanel();
        context.toast("Limite salvo.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  // Limite do copiloto (OpenAI): mesma regra do WhatsApp, liberação pela Financial & Billing Lead.
  function aiLimitForm(context, summary, reload) {
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Limite do copiloto em " + monthLabel(summary.month)));
    section.appendChild(context.make("p", "", "Consumo atual: " + wa().money(summary.spent) + ". Para liberar, salve um limite maior que o consumo e desmarque o bloqueio."));
    const amount = ui().input("ai-limit", "number", Number(summary.limit || 0).toFixed(2), true);
    amount.min = "0";
    amount.max = "100000";
    amount.step = "0.01";
    ui().field(context, section, "Limite mensal da OpenAI (R$)", amount);
    const blockRow = context.make("label", "check-row");
    const block = document.createElement("input");
    block.type = "checkbox";
    block.id = "ai-block";
    block.checked = Boolean(summary.manual_block);
    blockRow.append(block, context.make("span", "check-copy", "Bloquear o copiloto"));
    section.appendChild(blockRow);
    const save = context.make("button", "button button-primary", "Salvar limite");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        await context.api.setAiLimit(Number(amount.value), block.checked);
        context.closePanel();
        context.toast("Limite do copiloto salvo.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  async function render(context) {
    const billing = wa().canManageBilling(context.currentProfile);
    const filters = { days: 30, role: "", classId: "" };
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando mensagens..."));

    let classes = [];
    try {
      classes = await context.api.listClasses();
    } catch (error) {
      classes = [];
    }

    const toolbar = context.make("div", "screen-toolbar");
    const copy = context.make("div", "screen-toolbar-copy");
    copy.append(
      context.make("h2", "", "Mensagens do WhatsApp"),
      context.make("p", "", billing ? "Envios de todos os perfis, custos e limite mensal." : "Seus envios e o consumo do mês."),
    );
    const refresh = context.make("button", "button button-secondary", "Atualizar");
    refresh.type = "button";
    toolbar.append(copy, refresh);

    const summaryHost = context.make("div");
    const filterBar = context.make("div", "filter-bar surface-card messages-filters");
    const period = ui().select("messages-period", [
      { value: "7", label: "Últimos 7 dias" },
      { value: "30", label: "Últimos 30 dias" },
      { value: "90", label: "Últimos 90 dias" },
      { value: "", label: "Todo o período" },
    ], "30");
    period.setAttribute("aria-label", "Período");
    const klass = ui().select("messages-class", classes.map((item) => ({ value: item.id, label: item.name })), "", true);
    klass.options[0].textContent = "Todas as turmas";
    klass.setAttribute("aria-label", "Turma");
    filterBar.append(period, klass);
    let role = null;
    if (billing) {
      role = ui().select("messages-role", [
        { value: "", label: "Todos os perfis" },
        { value: "founder", label: "Founder" },
        { value: "sdr", label: "SDR" },
        { value: "closer", label: "Closer" },
      ], "");
      role.setAttribute("aria-label", "Perfil");
      filterBar.appendChild(role);
    }
    const panelHost = context.make("div");
    const aiHost = context.make("div");
    const showAi = billing || Boolean(window.CorexCopilot && window.CorexCopilot.canUse(context.currentProfile));

    async function loadSummary() {
      context.clear(summaryHost);
      try {
        const summary = await context.api.getWhatsappSummary();
        const level = wa().limitLevel(summary);
        const card = context.make("section", "surface-card messages-summary");
        const head = context.make("div", "messages-summary-head");
        const title = context.make("div");
        title.append(context.make("p", "eyebrow", "Consumo de " + monthLabel(summary.month)), context.make("h3", "", wa().money(summary.spent) + " de " + wa().money(summary.limit)));
        const badgeClass = level.key === "bloqueado" ? "badge danger" : level.key === "alerta" ? "badge warning" : "badge success";
        head.append(title, context.make("span", badgeClass, level.label));
        card.appendChild(head);
        const limit = Number(summary.limit || 0);
        const share = limit > 0 ? Math.min(1, Number(summary.spent || 0) / limit) : 1;
        const bar = context.make("div", "usage-bar");
        const fill = context.make("span", "usage-fill " + level.key);
        fill.style.width = Math.round(share * 100) + "%";
        bar.appendChild(fill);
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", Math.round(share * 100) + "% do limite mensal");
        card.appendChild(bar);
        const byClass = Array.isArray(summary.by_class) ? summary.by_class : [];
        if (byClass.length) {
          const list = context.make("div", "messages-class-list");
          byClass.forEach((item) => {
            const row = context.make("div", "detail-row");
            row.append(context.make("span", "", item.name), context.make("b", "", wa().money(item.spent)));
            list.appendChild(row);
          });
          card.appendChild(list);
        }
        if (billing) {
          const edit = context.make("button", "button button-secondary", "Alterar limite");
          edit.type = "button";
          edit.addEventListener("click", () => context.openPanel("Limite do WhatsApp", limitForm(context, summary, run)));
          card.appendChild(edit);
        }
        summaryHost.appendChild(card);
      } catch (error) {
        summaryHost.appendChild(context.make("div", "empty-state", error.message));
      }
    }

    async function loadPanel() {
      context.clear(panelHost);
      panelHost.appendChild(context.make("div", "loading-state", "Calculando indicadores..."));
      try {
        const data = await context.api.getWhatsappPanel({
          days: filters.days ? Number(filters.days) : null,
          role: filters.role || null,
          classId: filters.classId || null,
        });
        context.clear(panelHost);
        const card = context.make("section", "surface-card");
        card.appendChild(context.make("h3", "", data.scope === "todos" ? "Indicadores de todos os envios" : "Indicadores dos seus envios"));
        const grid = context.make("div", "metric-grid");
        const attempts = Number(data.attempts || 0);
        grid.append(
          metric(context, "Tentativas de envio", String(attempts)),
          metric(context, "Entregues", String(data.delivered || 0)),
          metric(context, "Falhas", String(data.failed || 0)),
          metric(context, "Taxa de entrega", wa().rate(data.delivered, attempts)),
          metric(context, "Taxa de leitura", wa().rate(data.read, data.delivered)),
          metric(context, "Respostas em 72 h", String(data.replied || 0)),
          metric(context, "Taxa de resposta", wa().rate(data.replied, Number(attempts) - Number(data.failed || 0))),
          metric(context, "Custo", wa().money(data.cost)),
        );
        card.appendChild(grid);
        panelHost.appendChild(card);
      } catch (error) {
        context.clear(panelHost);
        panelHost.appendChild(context.make("div", "empty-state", error.message));
      }
    }

    async function loadAi() {
      context.clear(aiHost);
      if (!showAi) return;
      try {
        const summary = await context.api.getAiSummary();
        const card = context.make("section", "surface-card messages-summary");
        const head = context.make("div", "messages-summary-head");
        const title = context.make("div");
        title.append(context.make("p", "eyebrow", "Copiloto (OpenAI) em " + monthLabel(summary.month)), context.make("h3", "", wa().money(summary.spent) + " de " + wa().money(summary.limit)));
        const level = wa().limitLevel(summary);
        const badgeClass = level.key === "bloqueado" ? "badge danger" : level.key === "alerta" ? "badge warning" : "badge success";
        head.append(title, context.make("span", badgeClass, level.label));
        card.appendChild(head);
        const limit = Number(summary.limit || 0);
        const share = limit > 0 ? Math.min(1, Number(summary.spent || 0) / limit) : 1;
        const bar = context.make("div", "usage-bar");
        const fill = context.make("span", "usage-fill " + level.key);
        fill.style.width = Math.round(share * 100) + "%";
        bar.appendChild(fill);
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", Math.round(share * 100) + "% do limite mensal do copiloto");
        card.appendChild(bar);
        if (summary.role) card.appendChild(context.make("p", "copilot-quota", window.CorexCopilot.quotaLine(summary)));
        if (billing) {
          const edit = context.make("button", "button button-secondary", "Alterar limite do copiloto");
          edit.type = "button";
          edit.addEventListener("click", () => context.openPanel("Limite do copiloto", aiLimitForm(context, summary, run)));
          card.appendChild(edit);
        }
        aiHost.appendChild(card);
      } catch (error) {
        aiHost.appendChild(context.make("div", "empty-state", error.message));
      }
    }

    async function run() {
      await Promise.all([loadSummary(), loadPanel(), loadAi()]);
    }

    period.addEventListener("change", () => { filters.days = period.value; loadPanel(); });
    klass.addEventListener("change", () => { filters.classId = klass.value; loadPanel(); });
    if (role) role.addEventListener("change", () => { filters.role = role.value; loadPanel(); });
    refresh.addEventListener("click", run);

    context.clear(context.workspace);
    context.workspace.append(toolbar, summaryHost, aiHost, filterBar, panelHost);
    await run();
  }

  window.CorexScreens.messages = Object.freeze({ render });
})();
