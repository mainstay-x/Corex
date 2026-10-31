(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  async function render(context) {
    const ui = window.CorexSdr;
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando oportunidades..."));
    try {
      const [catalog, leads] = await Promise.all([
        ui.store.getCatalog(context.api, true),
        ui.store.getLeads(context.api, true),
      ]);
      const stages = new Set([
        "passagem_closer",
        "oferta_apresentada",
        "link_enviado",
        "pagamento_pendente",
        "pago",
        "perdido_adiado",
      ]);
      const opportunities = leads.filter((lead) => lead.owner_role === "closer" && stages.has(lead.stage));
      context.clear(context.workspace);

      const toolbar = context.make("div", "screen-toolbar");
      const copy = context.make("div", "screen-toolbar-copy");
      copy.append(
        context.make("h2", "", "Pipeline do Closer"),
        context.make("p", "", "Oportunidades recebidas do SDR, ofertas e pagamentos em andamento."),
      );
      const refresh = context.make("button", "button button-secondary", "Atualizar");
      refresh.type = "button";
      refresh.addEventListener("click", () => render(context));
      toolbar.append(copy, refresh);

      const counters = context.make("div", "watcher-strip");
      [
        ["Recebidos", "passagem_closer"],
        ["Oferta", "oferta_apresentada"],
        ["Link enviado", "link_enviado"],
        ["Pagamento pendente", "pagamento_pendente"],
      ].forEach(([label, stage]) => {
        counters.appendChild(context.make("span", "badge neutral", label + " · " + opportunities.filter((lead) => lead.stage === stage).length));
      });

      const shell = context.make("div", "table-shell");
      if (!opportunities.length) {
        shell.appendChild(context.make("div", "empty-state", "Nenhuma oportunidade atribuída."));
        context.workspace.append(toolbar, counters, shell);
        return;
      }
      const table = context.make("table", "data-table");
      const head = document.createElement("thead");
      const header = document.createElement("tr");
      ["Lead", "Etapa", "Curso e turma", "Temperatura", "Próximo passo", "Ação"].forEach((label) => header.appendChild(context.make("th", "", label)));
      head.appendChild(header);
      const body = document.createElement("tbody");
      opportunities.forEach((lead) => {
        const row = document.createElement("tr");
        const interest = lead.interests[0];
        const next = lead.open_followups[0];
        const values = [
          lead.name,
          ui.stageLabels[lead.stage] || lead.stage,
          interest ? ui.courseName(catalog, interest.course_id) + " · " + ui.className(catalog, interest.class_id) : "Não definido",
          lead.temperature || "Não definida",
          next ? ui.formatDate(next.due_at, true) : "Sem próximo passo",
        ];
        values.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        const action = document.createElement("td");
        const open = context.make("button", "table-action", "Abrir");
        open.type = "button";
        open.addEventListener("click", () => context.navigate("lead", lead.id));
        action.appendChild(open);
        row.appendChild(action);
        body.appendChild(row);
      });
      table.append(head, body);
      shell.appendChild(table);
      context.workspace.append(toolbar, counters, shell);
    } catch (error) {
      context.clear(context.workspace);
      context.workspace.appendChild(context.make("div", "empty-state", error.message));
    }
  }

  window.CorexScreens.opportunities = Object.freeze({ render });
})();
