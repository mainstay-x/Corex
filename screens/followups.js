(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  function safeMeetingUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (_ignored) {
      return null;
    }
  }

  function workflowForMeetingStatus(status) {
    if (status === "cancelada") return { status: "cancelado", done_at: new Date().toISOString() };
    if (status === "realizada" || status === "nao_compareceu") return { status: "feito", done_at: new Date().toISOString() };
    return { status: "aberto", done_at: null };
  }

  function meetingEditor(context, item, render) {
    const ui = window.CorexSdr;
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Dados da reunião"));
    const status = ui.select("meeting-status", Object.entries(ui.meetingStatusLabels).map(([value, label]) => ({ value, label })), item.meeting_status || "agendada");
    const link = ui.input("meeting-url", "url", item.meeting_url || "", false);
    const platform = ui.select("meeting-platform", [
      { value: "", label: "Não informada" },
      { value: "google_meet", label: "Google Meet" },
      { value: "microsoft_teams", label: "Microsoft Teams" },
      { value: "zoom", label: "Zoom" },
      { value: "outra", label: "Outra" },
    ], item.meeting_platform || "");
    ui.field(context, section, "Status", status);
    ui.field(context, section, "Link de acesso", link);
    ui.field(context, section, "Plataforma", platform);
    const save = context.make("button", "button button-primary", "Salvar");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      await context.api.updateFollowup(item.id, {
        meeting_status: status.value,
        meeting_url: link.value.trim() || null,
        meeting_platform: platform.value || null,
        ...workflowForMeetingStatus(status.value),
      });
      context.closePanel();
      ui.store.invalidateLeads();
      await render(context);
    });
    return form;
  }

  async function render(context) {
    const ui = window.CorexSdr;
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando retornos..."));
    try {
      const leads = await ui.store.getLeads(context.api, true);
      context.clear(context.workspace);
      const title = context.make("div", "screen-toolbar-copy");
      title.append(context.make("h2", "", "Fila de retornos"), context.make("p", "", "Próximos passos organizados por prazo."));
      const tabs = context.make("div", "tab-bar");
      const host = context.make("div");
      let active = "vencidos";

      function draw() {
        context.clear(host);
        const now = new Date();
        const limit = ui.addDays(now, 7);
        const items = [];
        leads.forEach((lead) => lead.open_followups.forEach((item) => items.push({ ...item, lead })));
        const filtered = items
          .filter((item) => active === "vencidos"
            ? new Date(item.due_at) < now
            : active === "hoje"
              ? ui.isSameSaoPauloDay(item.due_at, now)
              : new Date(item.due_at) >= now && new Date(item.due_at) <= limit)
          .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
        const shell = context.make("div", "table-shell");
        if (!filtered.length) {
          shell.appendChild(context.make("div", "empty-state", "Nada pendente"));
          host.appendChild(shell);
          return;
        }
        const table = context.make("table", "data-table");
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Lead", "Tipo", "Status", "Data", "Motivo", "Acesso", "Última interação", "Ações"].forEach((label) => headerRow.appendChild(context.make("th", "", label)));
        head.appendChild(headerRow);
        const body = document.createElement("tbody");

        filtered.forEach((item) => {
          const row = document.createElement("tr");
          [
            item.lead.name,
            ui.followupLabels[item.type] || item.type,
            item.type === "reuniao" ? ui.meetingStatusLabels[item.meeting_status] || item.meeting_status : "Aberto",
            ui.formatDate(item.due_at, true),
            item.reason || "Sem motivo",
          ].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
          });

          const access = document.createElement("td");
          const meetingUrl = item.type === "reuniao" ? safeMeetingUrl(item.meeting_url) : null;
          if (meetingUrl) {
            const join = context.make("a", "table-action", "Entrar");
            join.href = meetingUrl;
            join.target = "_blank";
            join.rel = "noreferrer noopener";
            access.appendChild(join);
          } else {
            access.textContent = item.type === "reuniao" ? "Link pendente" : "Não se aplica";
          }
          row.appendChild(access);

          const lastInteraction = document.createElement("td");
          lastInteraction.textContent = item.lead.last_interaction ? ui.formatDate(item.lead.last_interaction.occurred_at, true) : "Sem interação";
          row.appendChild(lastInteraction);

          const actions = document.createElement("td");
          const open = context.make("button", "table-action", "Abrir");
          open.type = "button";
          open.addEventListener("click", () => context.navigate("lead", item.lead.id));
          actions.appendChild(open);
          if (item.type === "reuniao") {
            const editMeeting = context.make("button", "table-action", "Reunião");
            editMeeting.type = "button";
            editMeeting.addEventListener("click", () => context.openPanel("Editar reunião", meetingEditor(context, item, render)));
            actions.appendChild(editMeeting);
          } else {
            const done = context.make("button", "table-action", "Concluir");
            done.type = "button";
            done.addEventListener("click", async () => {
              await context.api.updateFollowup(item.id, { status: "feito", done_at: new Date().toISOString() });
              ui.store.invalidateLeads();
              await render(context);
            });
            actions.appendChild(done);
          }

          const edit = context.make("button", "table-action", "Editar");
          edit.type = "button";
          edit.addEventListener("click", () => context.openPanel("Editar retorno", ui.followupEditor(context, item, () => render(context))));
          actions.appendChild(edit);
          row.appendChild(actions);
          body.appendChild(row);
        });
        table.append(head, body);
        shell.appendChild(table);
        host.appendChild(shell);
      }

      [["vencidos", "Vencidos"], ["hoje", "Hoje"], ["proximos", "Próximos 7 dias"]].forEach(([key, label], index) => {
        const button = context.make("button", "tab-button" + (index === 0 ? " active" : ""), label);
        button.type = "button";
        button.addEventListener("click", () => {
          active = key;
          tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          draw();
        });
        tabs.appendChild(button);
      });
      context.workspace.append(title, tabs, host);
      draw();
    } catch (error) {
      context.clear(context.workspace);
      context.workspace.appendChild(context.make("div", "empty-state", error.message));
    }
  }

  window.CorexScreens.followups = Object.freeze({ render });
})();
