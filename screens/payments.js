(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  function canManageBilling(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_billing === true)));
  }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function confirmationForm(context, payment, render) {
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Confirmar pagamento"));
    section.appendChild(context.make("p", "", payment.lead.name + " · " + money(payment.amount)));
    const note = document.createElement("textarea");
    note.id = "payment-confirmation-note";
    window.CorexSdr.field(context, section, "Observação financeira", note);
    const save = context.make("button", "button button-primary", "Confirmar pagamento");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await context.api.confirmPayment(payment.id, note.value.trim() || null);
        context.closePanel();
        window.CorexSdr.store.invalidateLeads();
        context.toast("Pagamento confirmado.", "success");
        await render(context);
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  async function render(context) {
    const ui = window.CorexSdr;
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando pagamentos..."));
    try {
      const payments = await context.api.listPayments();
      context.clear(context.workspace);
      const toolbar = context.make("div", "screen-toolbar");
      const copy = context.make("div", "screen-toolbar-copy");
      copy.append(
        context.make("h2", "", "Pagamentos manuais"),
        context.make("p", "", "Aceites, comprovantes recebidos e confirmações financeiras."),
      );
      const refresh = context.make("button", "button button-secondary", "Atualizar");
      refresh.type = "button";
      refresh.addEventListener("click", () => render(context));
      toolbar.append(copy, refresh);

      const shell = context.make("div", "table-shell");
      if (!payments.length) {
        shell.appendChild(context.make("div", "empty-state", "Nenhum pagamento registrado."));
        context.workspace.append(toolbar, shell);
        return;
      }
      const table = context.make("table", "data-table");
      const head = document.createElement("thead");
      const header = document.createElement("tr");
      ["Lead", "Valor", "Forma", "Data combinada", "Status", "Comprovante", "Ações"].forEach((label) => header.appendChild(context.make("th", "", label)));
      head.appendChild(header);
      const body = document.createElement("tbody");
      payments.forEach((payment) => {
        const row = document.createElement("tr");
        [
          payment.lead ? payment.lead.name : "Lead não acessível",
          money(payment.amount),
          payment.method,
          ui.formatDateOnly(payment.payment_due_date),
          payment.status.replaceAll("_", " "),
          payment.receipt_received_at ? ui.formatDate(payment.receipt_received_at, true) : "Não recebido",
        ].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        const actions = document.createElement("td");
        if (payment.lead) {
          const open = context.make("button", "table-action", "Abrir lead");
          open.type = "button";
          open.addEventListener("click", () => context.navigate("lead", payment.lead.id));
          actions.appendChild(open);
        }
        if (payment.status === "comprovante_recebido" && canManageBilling(context.currentProfile)) {
          const confirm = context.make("button", "table-action", "Confirmar");
          confirm.type = "button";
          confirm.addEventListener("click", () => context.openPanel("Confirmar pagamento", confirmationForm(context, payment, render)));
          actions.appendChild(confirm);
        }
        row.appendChild(actions);
        body.appendChild(row);
      });
      table.append(head, body);
      shell.appendChild(table);
      context.workspace.append(toolbar, shell);
    } catch (error) {
      context.clear(context.workspace);
      context.workspace.appendChild(context.make("div", "empty-state", error.message));
    }
  }

  window.CorexScreens.payments = Object.freeze({ render });
})();
