(function () {
  "use strict";
  window.CorexScreens = window.CorexScreens || {};

  function quickLeadForm(context, catalog, leads) {
    const ui = window.CorexSdr;
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.append(context.make("h3", "", "Cadastro rápido"), context.make("p", "", "Telefone no formato internacional, por exemplo +5522999999999."));
    const name = ui.input("lead-name", "text", "", true);
    const phone = ui.input("lead-phone", "tel", "+55", true);
    const email = ui.input("lead-email", "email", "", false);
    const source = ui.select("lead-source", Object.entries(ui.sourceLabels).map(([value, label]) => ({ value, label })), "linkedin");
    const country = ui.input("lead-country", "text", "BR", false);
    const company = ui.input("lead-company", "text", "", false);
    const job = ui.input("lead-job", "text", "", false);
    [["Nome", name], ["Telefone", phone], ["E-mail", email], ["Fonte", source], ["País", country], ["Empresa", company], ["Cargo", job]].forEach(([label, control]) => ui.field(context, section, label, control));

    const interestSection = context.make("section", "form-section");
    interestSection.append(context.make("h3", "", "Origem e interesse"));
    const course = ui.select("lead-course", catalog.courses.map((item) => ({ value: item.id, label: item.title })), "", true);
    const classSelect = ui.select("lead-class", catalog.classes.map((item) => ({ value: item.id, label: item.name })), "", true);
    const referral = ui.select("lead-referral", leads.map((item) => ({ value: item.id, label: item.name })), "", true);
    const sourceEvent = ui.input("lead-source-event", "datetime-local", "", false);
    ui.field(context, interestSection, "Curso de interesse", course);
    ui.field(context, interestSection, "Turma", classSelect);
    const referralWrap = context.make("div"); ui.field(context, referralWrap, "Lead indicador", referral);
    const eventWrap = context.make("div"); ui.field(context, eventWrap, "Data e hora da aula", sourceEvent);
    interestSection.append(referralWrap, eventWrap);
    function updateConditionalFields() {
      referralWrap.hidden = source.value !== "indicacao";
      eventWrap.hidden = source.value !== "aula_gratuita";
      referral.required = source.value === "indicacao";
      sourceEvent.required = source.value === "aula_gratuita";
    }
    source.addEventListener("change", updateConditionalFields); updateConditionalFields();

    const actions = context.make("div", "form-actions");
    const cancel = context.make("button", "button button-secondary", "Cancelar"); cancel.type = "button"; cancel.addEventListener("click", context.closePanel);
    const submit = context.make("button", "button button-primary", "Salvar lead"); submit.type = "submit";
    actions.append(cancel, submit); form.append(section, interestSection, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      submit.disabled = true; submit.textContent = "Salvando...";
      try {
        const duplicate = await context.api.findDuplicateLead(phone.value.trim(), email.value.trim() || null);
        if (duplicate) { context.toast("Lead já existe: " + duplicate.name, "error"); context.closePanel(); context.navigate("lead", duplicate.id); return; }
        const sourceValue = source.value;
        const eventDate = sourceEvent.value ? new Date(sourceEvent.value) : null;
        let followupType = "outro"; let base = new Date();
        if (sourceValue === "inbound") followupType = "inbound_novo";
        if (sourceValue === "indicacao") followupType = "indicacao";
        if (sourceValue === "aula_gratuita") { followupType = "pos_aula_gratuita"; base = eventDate; }
        let due = ui.suggestedFollowups(followupType, base, catalog.holidays)[0];
        if (followupType === "outro") due = ui.addDays(new Date(), 2);
        const lead = await context.api.createLead({
          name: name.value.trim(), phone: phone.value.trim(), email: email.value.trim() || null,
          source: sourceValue, country: country.value.trim() || "BR", company: company.value.trim() || null,
          job_role: job.value.trim() || null, referred_by_lead_id: referral.value || null,
          source_event_at: eventDate ? eventDate.toISOString() : null,
        }, course.value ? { course_id: course.value, class_id: classSelect.value || null, priority: 1 } : null,
        [{ type: followupType, due_at: due.toISOString(), reason: "Primeiro contato" }]);
        ui.store.invalidateLeads(); context.toast("Lead criado.", "success"); context.closePanel(); context.navigate("lead", lead.id);
      } catch (error) { context.toast(error.message, "error"); }
      finally { submit.disabled = false; submit.textContent = "Salvar lead"; }
    });
    return form;
  }

  async function render(context) {
    const ui = window.CorexSdr;
    context.clear(context.workspace); context.workspace.appendChild(context.make("div", "loading-state", "Carregando leads..."));
    try {
      const [catalog, leads] = await Promise.all([ui.store.getCatalog(context.api), ui.store.getLeads(context.api, true)]);
      context.clear(context.workspace);
      const toolbar = context.make("div", "screen-toolbar");
      const copy = context.make("div", "screen-toolbar-copy");
      copy.append(context.make("h2", "", "Pipeline SDR"), context.make("p", "", "Leads próprios e sem responsável, com próximos passos em evidência."));
      const create = context.make("button", "button button-primary", "Novo lead"); create.type = "button";
      create.addEventListener("click", () => context.openPanel("Novo lead", quickLeadForm(context, catalog, leads)));
      toolbar.append(copy, create);

      const filters = context.make("div", "filter-bar surface-card");
      const search = ui.input("lead-search", "search", "", false); search.placeholder = "Buscar nome, telefone ou e-mail";
      const stage = ui.select("filter-stage", Object.entries(ui.stageLabels).map(([value, label]) => ({ value, label })), "", true);
      const classFilter = ui.select("filter-class", catalog.classes.map((item) => ({ value: item.id, label: item.name })), "", true);
      const source = ui.select("filter-source", Object.entries(ui.sourceLabels).map(([value, label]) => ({ value, label })), "", true);
      const temperature = ui.select("filter-temperature", ["frio", "morno", "quente"].map((value) => ({ value, label: value })), "", true);
      const followup = ui.select("filter-followup", [{ value: "vencido", label: "Vencido" }, { value: "hoje", label: "Hoje" }, { value: "sem", label: "Sem retorno" }], "", true);
      filters.append(search, stage, classFilter, source, temperature, followup);
      const tableHost = context.make("div");

      function draw() {
        context.clear(tableHost); const now = new Date(); const needle = search.value.trim().toLowerCase(); const activeStages = new Set(["novo", "contato_iniciado", "qualificado", "aula_gratuita", "oferta_apresentada", "passagem_closer", "link_enviado", "pagamento_pendente"]);
        const filtered = leads.filter((lead) => {
          const next = lead.open_followups[0] || null;
          const matchesText = !needle || [lead.name, lead.phone, lead.email].some((value) => String(value || "").toLowerCase().includes(needle));
          const matchesFollowup = !followup.value || (followup.value === "sem" && !next) || (followup.value === "vencido" && next && new Date(next.due_at) < now) || (followup.value === "hoje" && next && ui.isSameSaoPauloDay(next.due_at, now));
          return matchesText && (!stage.value || lead.stage === stage.value) && (!classFilter.value || lead.interests.some((item) => item.class_id === classFilter.value)) && (!source.value || lead.source === source.value) && (!temperature.value || lead.temperature === temperature.value) && matchesFollowup;
        }).sort((a, b) => {
          const ad = a.open_followups[0] ? new Date(a.open_followups[0].due_at).getTime() : Infinity;
          const bd = b.open_followups[0] ? new Date(b.open_followups[0].due_at).getTime() : Infinity;
          return ad - bd;
        });
        const shell = context.make("div", "table-shell");
        if (!filtered.length) { shell.appendChild(context.make("div", "empty-state", "Nenhum lead encontrado.")); tableHost.appendChild(shell); return; }
        const table = context.make("table", "data-table"); const head = document.createElement("thead"); const hr = document.createElement("tr");
        ["Nome", "Etapa", "Curso / turma", "Fonte", "Temperatura", "Próximo retorno", "Sem contato"].forEach((label) => hr.appendChild(context.make("th", "", label)));
        head.appendChild(hr); const body = document.createElement("tbody");
        filtered.forEach((lead) => {
          const row = document.createElement("tr"); row.className = "clickable-row"; row.tabIndex = 0;
          const interest = lead.interests[0]; const next = lead.open_followups[0];
          const cells = [lead.name, ui.stageLabels[lead.stage] || lead.stage, interest ? ui.courseName(catalog, interest.course_id) + " · " + ui.className(catalog, interest.class_id) : "Não definido", ui.sourceLabels[lead.source] || lead.source, lead.temperature || "Não definida", next ? ui.formatDate(next.due_at, true) : activeStages.has(lead.stage) ? "Sem próximo passo" : "Nenhum retorno", lead.last_interaction ? Math.max(0, Math.floor((Date.now() - new Date(lead.last_interaction.occurred_at)) / 86400000)) + " dias" : "Sem contato"];
          cells.forEach((value, index) => { const cell = document.createElement("td"); if (index === 5 && ((activeStages.has(lead.stage) && !next) || (next && new Date(next.due_at) < now))) cell.appendChild(context.make("span", "badge " + (next ? "warning" : "neutral"), value)); else cell.textContent = value; row.appendChild(cell); });
          const open = () => context.navigate("lead", lead.id); row.addEventListener("click", open); row.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); }); body.appendChild(row);
        });
        table.append(head, body); shell.appendChild(table); tableHost.appendChild(shell);
      }
      [search, stage, classFilter, source, temperature, followup].forEach((control) => control.addEventListener("input", draw));
      context.workspace.append(toolbar, filters, tableHost); draw();
    } catch (error) { context.clear(context.workspace); context.workspace.appendChild(context.make("div", "empty-state", error.message)); }
  }
  window.CorexScreens.leads = Object.freeze({ render });
})();
