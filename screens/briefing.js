(function () {
  "use strict";
  window.CorexScreens = window.CorexScreens || {};

  function block(context, title, items, renderLine) {
    const card = context.make("section", "surface-card briefing-block"); card.appendChild(context.make("h3", "", title));
    if (!items.length) { card.appendChild(context.make("p", "", "Nada pendente")); return card; }
    items.forEach((item) => { const row = context.make("button", "briefing-row"); row.type = "button"; renderLine(row, item); row.addEventListener("click", () => context.navigate("lead", item.lead ? item.lead.id : item.id)); card.appendChild(row); }); return card;
  }

  async function render(context) {
    const ui = window.CorexSdr; context.clear(context.workspace); context.workspace.appendChild(context.make("div", "loading-state", "Preparando o briefing..."));
    try {
      const [catalog, leads, goalRows] = await Promise.all([ui.store.getCatalog(context.api, true), ui.store.getLeads(context.api, true), window.CorexScreens.goals.getRows(context.api)]);
      const now = new Date(); const briefingDay = ui.operationalDay(now); const allFollowups = []; leads.forEach((lead) => lead.open_followups.forEach((item) => allFollowups.push({ ...item, lead })));
      const overdue = allFollowups.filter((item) => new Date(item.due_at) < now).sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
      const today = allFollowups.filter((item) => ui.isSameSaoPauloDay(item.due_at, briefingDay));
      const referrals = leads.filter((lead) => lead.source === "indicacao" && !lead.has_outbound_interaction);
      const inboundLate = leads.filter((lead) => lead.source === "inbound" && !lead.has_outbound_interaction && lead.open_followups.some((item) => item.type === "inbound_novo" && new Date(item.due_at) < now));
      const warm = leads.filter((lead) => lead.interests.some((interest) => { const klass = catalog.classes.find((item) => item.id === interest.class_id); return klass && klass.status === "planejada"; }) && (!lead.last_interaction || now - new Date(lead.last_interaction.occurred_at) > 14 * 86400000));
      context.clear(context.workspace);
      const toolbar = context.make("div", "screen-toolbar"); const copy = context.make("div", "screen-toolbar-copy"); copy.append(context.make("h2", "", "Briefing do SDR"), context.make("p", "", "Calculado agora, com início operacional às 7h de Brasília.")); const refresh = context.make("button", "button button-secondary", "Atualizar"); refresh.type = "button"; refresh.addEventListener("click", () => render(context)); toolbar.append(copy, refresh);
      const activeStages = new Set(["novo", "contato_iniciado", "qualificado", "aula_gratuita", "oferta_apresentada", "passagem_closer", "link_enviado", "pagamento_pendente"]);
      const alerts = context.make("div", "watcher-strip"); alerts.append(context.make("span", "badge warning", "V01 · " + inboundLate.length + " inbound atrasados"), context.make("span", "badge warning", "V02 · " + overdue.length + " retornos vencidos"), context.make("span", "badge neutral", "V03 · " + leads.filter((lead) => activeStages.has(lead.stage) && !lead.open_followups.length).length + " sem próximo passo"));
      const grid = context.make("div", "briefing-grid");
      const line = (row, item, secondary) => { row.append(context.make("b", "", item.lead ? item.lead.name : item.name), context.make("span", "", secondary(item))); };
      grid.append(
        block(context, "Retornos vencidos", overdue, (row, item) => line(row, item, (value) => (ui.followupLabels[value.type] || value.type) + " · " + Math.max(1, Math.ceil((now - new Date(value.due_at)) / 86400000)) + " dias")),
        block(context, "Retornos de hoje", today, (row, item) => line(row, item, (value) => (ui.followupLabels[value.type] || value.type) + " · " + ui.formatDate(value.due_at, true))),
        block(context, "Indicações sem abordagem", referrals, (row, lead) => { row.append(context.make("b", "", lead.name), context.make("span", "", "Entrada em " + ui.formatDate(lead.created_at, false))); }),
        block(context, "Aquecer para a próxima turma", warm, (row, lead) => { row.append(context.make("b", "", lead.name), context.make("span", "", lead.last_interaction ? "Último contato " + ui.formatDate(lead.last_interaction.occurred_at, false) : "Sem contato")); }),
      );
      const goals = context.make("section", "surface-card briefing-block wide-block"); goals.appendChild(context.make("h3", "", "Metas")); if (!goalRows.length) goals.appendChild(context.make("p", "", "Nada pendente")); goalRows.forEach((item) => { const row = context.make("div", "briefing-row static-row"); row.append(context.make("b", "", item.klass.name), context.make("span", "", "Hoje " + item.daily + " · semana " + item.weekly + " · pagos " + item.paid + "/" + item.studentsNeeded)); goals.appendChild(row); });
      context.workspace.append(toolbar, alerts, grid, goals);
    } catch (error) { context.clear(context.workspace); context.workspace.appendChild(context.make("div", "empty-state", error.message)); }
  }
  window.CorexScreens.briefing = Object.freeze({ render });
})();
