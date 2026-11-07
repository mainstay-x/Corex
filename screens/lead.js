(function () {
  "use strict";
  window.CorexScreens = window.CorexScreens || {};
  const ui = () => window.CorexSdr;

  function hasPermission(profile, permission) {
    return Boolean(profile && profile.permissions && profile.permissions[permission] === true);
  }

  function canManageAll(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || hasPermission(profile, "manage_all_leads")));
  }

  function canEditLead(profile, lead) {
    return canManageAll(profile) || Boolean(profile && lead.owner_id === profile.user_id && ["sdr", "closer"].includes(profile.role));
  }

  function panelForm(context, title, fields, onSubmit) {
    const form = context.make("form", "panel-form"); ui().blockEnterSubmit(form);
    const section = context.make("section", "form-section"); section.appendChild(context.make("h3", "", title));
    fields.forEach((item) => ui().field(context, section, item.label, item.control));
    const actions = context.make("div", "form-actions");
    const cancel = context.make("button", "button button-secondary", "Cancelar"); cancel.type = "button"; cancel.addEventListener("click", context.closePanel);
    const save = context.make("button", "button button-primary", "Salvar"); save.type = "submit"; actions.append(cancel, save); form.append(section, actions);
    form.addEventListener("submit", async (event) => { event.preventDefault(); if (!form.reportValidity()) return; save.disabled = true; try { await onSubmit(); context.closePanel(); } catch (error) { context.toast(error.message, "error"); } finally { save.disabled = false; } });
    return form;
  }

  function summary(context, data, catalog, visibleLeads, reload) {
    const lead = data.lead; const editable = canEditLead(context.currentProfile, lead); const grid = context.make("div", "detail-grid");
    const qualification = context.make("section", "surface-card"); qualification.appendChild(context.make("h3", "", "Qualificação"));
    [["E-mail", lead.email], ["Área", lead.sector], ["Cargo", lead.job_role], ["Empresa", lead.company], ["Temperatura", lead.temperature], ["Embarcado", lead.works_offshore === null ? null : lead.works_offshore ? "Sim" : "Não"], ["Escala", lead.offshore_schedule], ["Experiência", lead.topic_experience]].forEach(([label, value]) => {
      const row = context.make("div", "detail-row"); row.append(context.make("span", "", label), context.make("b", "", value || "Não informado")); qualification.appendChild(row);
    });
    const edit = context.make("button", "button button-secondary", "Editar qualificação"); edit.type = "button";
    edit.addEventListener("click", () => {
      const email = ui().input("qual-email", "email", lead.email || "", false); const sector = ui().input("qual-sector", "text", lead.sector || "", false); const job = ui().input("qual-job", "text", lead.job_role || "", false);
      const company = ui().input("qual-company", "text", lead.company || "", false); const temperature = ui().select("qual-temperature", [{ value: "", label: "Não definida" }, { value: "frio", label: "Frio" }, { value: "morno", label: "Morno" }, { value: "quente", label: "Quente" }], lead.temperature || ""); const offshore = ui().select("qual-offshore", [{ value: "", label: "Não informado" }, { value: "true", label: "Sim" }, { value: "false", label: "Não" }], lead.works_offshore === null ? "" : String(lead.works_offshore));
      const schedule = ui().input("qual-schedule", "text", lead.offshore_schedule || "", false); const experience = document.createElement("textarea"); experience.id = "qual-experience"; experience.value = lead.topic_experience || "";
      context.openPanel("Editar qualificação", panelForm(context, "Dados do lead", [{ label: "E-mail", control: email }, { label: "Área", control: sector }, { label: "Cargo", control: job }, { label: "Empresa", control: company }, { label: "Temperatura", control: temperature }, { label: "Trabalha embarcado", control: offshore }, { label: "Escala", control: schedule }, { label: "Experiência com o tema", control: experience }], async () => {
        await context.api.updateLead(lead.id, { email: email.value.trim() || null, sector: sector.value.trim() || null, job_role: job.value.trim() || null, company: company.value.trim() || null, temperature: temperature.value || null, works_offshore: offshore.value === "" ? null : offshore.value === "true", offshore_schedule: schedule.value.trim() || null, topic_experience: experience.value.trim() || null }); ui().store.invalidateLeads(); await reload();
      }));
    });
    if (editable) qualification.appendChild(edit);

    const interestCard = context.make("section", "surface-card"); interestCard.appendChild(context.make("h3", "", "Interesses e cursos feitos"));
    if (!data.interests.length) interestCard.appendChild(context.make("p", "", "Nenhum interesse registrado."));
    data.interests.forEach((item) => {
      interestCard.appendChild(context.make("p", "", ui().courseName(catalog, item.course_id) + " · " + ui().className(catalog, item.class_id)));
      if (item.notify_next_class) interestCard.appendChild(context.make("span", "badge success", "Avisar 15 dias antes da próxima turma"));
      if (!editable) return;
      const toggle = context.make("button", "table-action", item.notify_next_class ? "Não avisar mais" : "Avisar na próxima turma");
      toggle.type = "button";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        try {
          await context.api.updateInterest(item.id, { notify_next_class: !item.notify_next_class });
          ui().store.invalidateLeads();
          await reload();
        } catch (error) {
          toggle.disabled = false;
          context.toast(error.message, "error");
        }
      });
      interestCard.appendChild(toggle);
    });
    interestCard.appendChild(context.make("p", "", "Nível: " + String(data.tier.tier || "normal").toUpperCase() + " · " + data.tier.trainings_count + " treinamentos"));
    const addInterest = context.make("button", "button button-secondary", "Adicionar interesse"); addInterest.type = "button";
    addInterest.addEventListener("click", () => { const course = ui().select("interest-course", catalog.courses.map((item) => ({ value: item.id, label: item.title })), "", true); course.required = true; const klass = ui().select("interest-class", catalog.classes.map((item) => ({ value: item.id, label: item.name })), "", true); const notify = ui().select("interest-notify", [{ value: "false", label: "Não" }, { value: "true", label: "Sim" }], "false"); context.openPanel("Adicionar interesse", panelForm(context, "Curso e turma", [{ label: "Curso", control: course }, { label: "Turma", control: klass }, { label: "Avisar 15 dias antes da próxima turma", control: notify }], async () => { await context.api.addInterest({ lead_id: lead.id, course_id: course.value, class_id: klass.value || null, priority: data.interests.length + 1, notify_next_class: notify.value === "true" }); ui().store.invalidateLeads(); await reload(); })); }); if (editable) interestCard.appendChild(addInterest);
    const addCourse = context.make("button", "button button-secondary", "Adicionar curso feito"); addCourse.type = "button";
    addCourse.addEventListener("click", () => {
      const course = ui().select("completed-course", catalog.courses.map((item) => ({ value: item.id, label: item.title })), "", true); course.required = true;
      const completed = ui().input("completed-at", "date", "", false);
      context.openPanel("Curso feito", panelForm(context, "Registro manual", [{ label: "Curso", control: course }, { label: "Conclusão", control: completed }], async () => { await context.api.addCompletedCourse({ lead_id: lead.id, course_id: course.value, completed_at: completed.value || null }); await reload(); }));
    });
    if (canManageAll(context.currentProfile) || hasPermission(context.currentProfile, "manage_students")) interestCard.appendChild(addCourse);

    const referrer = visibleLeads.find((item) => item.id === lead.referred_by_lead_id);
    const origin = context.make("section", "surface-card"); origin.append(context.make("h3", "", "Origem"), context.make("p", "", (ui().sourceLabels[lead.source] || lead.source) + " · entrada em " + ui().formatDate(lead.created_at, true)), context.make("p", "", "Indicador: " + (referrer ? referrer.name : lead.referred_by_lead_id ? "Lead não acessível" : "Não informado")));
    grid.append(qualification, interestCard, origin); return grid;
  }

  function history(context, data, reload) {
    const host = context.make("div"); const add = context.make("button", "button button-primary", "Registrar interação"); add.type = "button";
    add.addEventListener("click", () => {
      const channel = ui().select("interaction-channel", ["whatsapp", "ligacao", "email", "linkedin", "nota"].map((value) => ({ value, label: value })), "whatsapp");
      const direction = ui().select("interaction-direction", [{ value: "out", label: "Saída" }, { value: "in", label: "Entrada" }, { value: "interna", label: "Nota interna" }], "out");
      const body = document.createElement("textarea"); body.id = "interaction-body"; body.required = true;
      const needsReturn = !data.followups.some((item) => item.status === "aberto"); const due = ui().input("interaction-return", "datetime-local", ui().localInputValue(ui().addDays(new Date(), 2)), needsReturn); const fields = [{ label: "Canal", control: channel }, { label: "Direção", control: direction }, { label: "Texto", control: body }];
      if (needsReturn) { fields.push({ label: "Próximo retorno, obrigatório para saída", control: due }); direction.addEventListener("change", () => { due.disabled = direction.value !== "out"; due.required = direction.value === "out"; }); }
      context.openPanel("Registrar interação", panelForm(context, "Nova interação", fields, async () => {
        await context.api.addInteraction({ lead_id: data.lead.id, channel: channel.value, direction: direction.value, body: body.value.trim(), occurred_at: new Date().toISOString() });
        if (needsReturn && direction.value === "out") await context.api.addFollowups([{ lead_id: data.lead.id, type: "outro", due_at: new Date(due.value).toISOString(), reason: "Próximo passo após interação" }]);
        ui().store.invalidateLeads(); await reload();
      }));
    }); if (canEditLead(context.currentProfile, data.lead)) host.appendChild(add);
    const timeline = context.make("div", "timeline");
    if (!data.interactions.length) timeline.appendChild(context.make("div", "empty-state", "Nenhuma interação registrada."));
    data.interactions.forEach((item) => { const card = context.make("article", "timeline-item"); const author = item.author_id === context.currentProfile.user_id ? context.currentProfile.display_name : "Outro usuário"; card.append(context.make("span", "badge", item.channel + " · " + item.direction), context.make("small", "", author + " · " + ui().formatDate(item.occurred_at, true)), context.make("p", "", item.body)); timeline.appendChild(card); });
    host.appendChild(timeline); return host;
  }

  function followups(context, data, catalog, reload) {
    const host = context.make("div");
    const add = context.make("button", "button button-primary", "Novo retorno");
    add.type = "button";
    add.addEventListener("click", () => {
      const type = ui().select("followup-type", Object.entries(ui().followupLabels).filter(([key]) => key !== "passagem_closer").map(([value, label]) => ({ value, label })), "outro");
      const due = ui().input("followup-due", "datetime-local", ui().localInputValue(ui().addDays(new Date(), 2)), true);
      const reason = ui().input("followup-reason", "text", "", true);
      const meetingUrl = ui().input("followup-meeting-url", "url", "", false);
      const platform = ui().select("followup-meeting-platform", [
        { value: "", label: "Não informada" },
        { value: "google_meet", label: "Google Meet" },
        { value: "microsoft_teams", label: "Microsoft Teams" },
        { value: "zoom", label: "Zoom" },
        { value: "outra", label: "Outra" },
      ], "");
      type.addEventListener("change", () => {
        const base = type.value === "pos_aula_gratuita" ? data.lead.source_event_at : new Date();
        const dates = ui().suggestedFollowups(type.value, base, catalog.holidays);
        due.value = ui().localInputValue(dates[0]);
        meetingUrl.disabled = type.value !== "reuniao";
        platform.disabled = type.value !== "reuniao";
      });
      meetingUrl.disabled = true;
      platform.disabled = true;
      context.openPanel("Novo retorno", panelForm(context, "Próximo passo", [
        { label: "Tipo", control: type },
        { label: "Data", control: due },
        { label: "Motivo", control: reason },
        { label: "Link da reunião", control: meetingUrl },
        { label: "Plataforma", control: platform },
      ], async () => {
        if (type.value === "pos_aula_gratuita" && !data.lead.source_event_at) throw new Error("Informe a data da aula na origem do lead.");
        const firstDue = new Date(due.value);
        const dates = type.value === "sem_resposta" ? [0, 2, 5, 12].map((days) => ui().addDays(firstDue, days)) : [firstDue];
        await context.api.addFollowups(dates.map((date, index) => ({
          lead_id: data.lead.id,
          type: type.value,
          sequence_step: type.value === "sem_resposta" ? index + 1 : null,
          due_at: date.toISOString(),
          reason: reason.value.trim() || null,
          meeting_status: type.value === "reuniao" ? "agendada" : null,
          meeting_url: type.value === "reuniao" ? meetingUrl.value.trim() || null : null,
          meeting_platform: type.value === "reuniao" ? platform.value || null : null,
        })));
        ui().store.invalidateLeads();
        await reload();
      }));
    });
    if (canEditLead(context.currentProfile, data.lead)) host.appendChild(add);

    const list = context.make("div", "stack-list");
    data.followups.forEach((item) => {
      const card = context.make("article", "surface-card compact-card");
      card.append(
        context.make("span", "badge " + (item.status === "aberto" && new Date(item.due_at) < new Date() ? "warning" : "neutral"), ui().followupLabels[item.type] || item.type),
        context.make("h3", "", ui().formatDate(item.due_at, true)),
        context.make("p", "", item.reason || "Sem motivo"),
      );
      if (item.type === "reuniao") {
        card.appendChild(context.make("span", "badge", ui().meetingStatusLabels[item.meeting_status] || item.meeting_status));
        try {
          const url = new URL(item.meeting_url);
          if (url.protocol === "https:" || url.protocol === "http:") {
            const join = context.make("a", "table-action", "Entrar na reunião");
            join.href = url.href;
            join.target = "_blank";
            join.rel = "noreferrer noopener";
            card.appendChild(join);
          }
        } catch (_ignored) {}
      }
      if (item.status === "aberto" && canEditLead(context.currentProfile, data.lead)) {
        const edit = context.make("button", "table-action", "Editar");
        edit.type = "button";
        edit.addEventListener("click", () => context.openPanel("Editar retorno", ui().followupEditor(context, item, reload)));
        card.appendChild(edit);
        const done = context.make("button", "table-action", item.type === "reuniao" ? "Marcar realizada" : "Concluir");
        done.type = "button";
        done.addEventListener("click", async () => {
          const changes = { status: "feito", done_at: new Date().toISOString() };
          if (item.type === "reuniao") changes.meeting_status = "realizada";
          await context.api.updateFollowup(item.id, changes);
          ui().store.invalidateLeads();
          await reload();
        });
        card.appendChild(done);
      } else if (item.status !== "aberto") {
        card.appendChild(context.make("span", "badge success", item.status));
      }
      list.appendChild(card);
    });
    if (!data.followups.length) list.appendChild(context.make("div", "empty-state", "Nenhum retorno registrado."));
    host.appendChild(list);
    return host;
  }

  function objections(context, data, reload) {
    const host = context.make("div"); const add = context.make("button", "button button-primary", "Registrar objeção"); add.type = "button";
    add.addEventListener("click", () => { const category = ui().select("objection-category", [["valor", "Valor"], ["tempo_embarque", "Tempo e embarque"], ["encaixe", "Encaixe"], ["pagamento", "Pagamento"], ["confianca", "Confiança"], ["silencio", "Silêncio"], ["outro", "Outro"]].map(([value, label]) => ({ value, label })), "valor"); const text = document.createElement("textarea"); text.id = "objection-text";
      context.openPanel("Registrar objeção", panelForm(context, "Objeção", [{ label: "Categoria", control: category }, { label: "Texto", control: text }], async () => { await context.api.addObjection({ lead_id: data.lead.id, category: category.value, text: text.value.trim() || null }); await reload(); })); }); if (canEditLead(context.currentProfile, data.lead)) host.appendChild(add);
    data.objections.forEach((item) => { const card = context.make("article", "surface-card compact-card"); card.append(context.make("span", "badge", item.category), context.make("p", "", item.text || "Sem observação"), context.make("small", "", ui().formatDate(item.created_at, true))); host.appendChild(card); }); if (!data.objections.length) host.appendChild(context.make("div", "empty-state", "Nenhuma objeção registrada.")); return host;
  }

  async function render(context, leadId, initialTab) {
    context.clear(context.workspace); context.workspace.appendChild(context.make("div", "loading-state", "Carregando ficha..."));
    try {
      const [data, catalog, visibleLeads] = await Promise.all([context.api.getLead(leadId), ui().store.getCatalog(context.api), ui().store.getLeads(context.api)]);
      let activeTab = initialTab || "resumo"; const reload = () => render(context, leadId, activeTab); context.clear(context.workspace);
      const hero = context.make("section", "lead-header surface-card"); const title = context.make("div");
      const ownerLabel = !data.lead.owner_id ? "Sem dono" : data.lead.owner_id === context.currentProfile.user_id ? context.currentProfile.display_name : "Outro responsável";
      title.append(context.make("p", "eyebrow", ui().stageLabels[data.lead.stage] || data.lead.stage), context.make("h2", "", data.lead.name), context.make("p", "", (data.lead.phone || "Sem telefone") + " · nível " + (data.tier.tier || "normal") + " · " + ownerLabel));
      const actions = context.make("div", "lead-actions");
      const profile = context.currentProfile;
      const inboxAccess = profile.role === "sdr" || profile.role === "closer" || canManageAll(profile);
      if (data.lead.phone && inboxAccess && window.CorexScreens.inbox) {
        const conversation = context.make("button", "button button-secondary", "Conversa no WhatsApp"); conversation.type = "button";
        conversation.addEventListener("click", () => context.navigate("inbox", leadId)); actions.appendChild(conversation);
      }
      if (window.CorexCopilot && window.CorexCopilot.canUse(profile)) {
        const copilot = context.make("button", "button button-secondary", "Copiloto"); copilot.type = "button";
        copilot.addEventListener("click", () => window.CorexCopilot.open(context, { leadId, onFollowupCreated: reload })); actions.appendChild(copilot);
      }
      const managesAll = canManageAll(profile);
      const sdrFlow = data.lead.owner_role === "sdr" || !data.lead.owner_role;
      const canRunSdrFlow = sdrFlow && (managesAll || (profile.role === "sdr" && (!data.lead.owner_id || data.lead.owner_id === profile.user_id)));
      const canRunCloserFlow = window.CorexCommerce && window.CorexCommerce.canCloseLead(profile, data.lead);
      if (canRunSdrFlow && !data.lead.price_requested_at) {
        const priceRequest = context.make("button", "button button-secondary", "Registrar pedido de preço"); priceRequest.type = "button";
        priceRequest.addEventListener("click", async () => { try { await context.api.updateLead(leadId, { price_requested_at: new Date().toISOString() }); ui().store.invalidateLeads(); context.toast("Pedido de preço registrado.", "success"); await reload(); } catch (error) { context.toast(error.message, "error"); } }); actions.appendChild(priceRequest);
      }
      const stageButton = context.make("button", "button button-secondary", "Mudar etapa"); stageButton.type = "button";
      stageButton.addEventListener("click", () => { const stage = ui().select("lead-stage", ["novo", "contato_iniciado", "qualificado", "aula_gratuita", "perdido_adiado"].map((value) => ({ value, label: ui().stageLabels[value] })), data.lead.stage); context.openPanel("Mudar etapa", panelForm(context, "Etapa do SDR", [{ label: "Etapa", control: stage }], async () => { await context.api.updateLead(leadId, { stage: stage.value }); ui().store.invalidateLeads(); await reload(); })); });
      const handoff = context.make("button", "button button-primary", "Passar ao Closer"); handoff.type = "button";
      const openClass = data.interests.some((item) => catalog.classes.some((klass) => klass.id === item.class_id && klass.status === "aberta")); const checks = [Boolean(data.lead.sector || data.lead.job_role), openClass, Boolean(data.lead.price_requested_at)];
      handoff.addEventListener("click", () => {
        const form = context.make("form", "panel-form"); const section = context.make("section", "form-section"); section.appendChild(context.make("h3", "", "Checklist de passagem"));
        [["Área preenchida", checks[0]], ["Curso com turma aberta", checks[1]], ["Pedido de preço registrado", checks[2]]].forEach(([label, ok]) => { const row = context.make("div", "detail-row"); row.append(context.make("span", "", label), context.make("span", "badge " + (ok ? "success" : "warning"), ok ? "Atendido" : "Pendente")); section.appendChild(row); });
        const closer = ui().select("handoff-closer", catalog.closers.map((item) => ({ value: item.user_id, label: item.display_name })), "", true); closer.required = true; const note = document.createElement("textarea"); note.id = "handoff-note"; ui().field(context, section, "Closer", closer); ui().field(context, section, "Observação", note);
        const confirm = context.make("button", "button button-primary", "Confirmar passagem"); confirm.type = "submit"; confirm.disabled = !checks.every(Boolean) || !catalog.closers.length; form.append(section, confirm);
        form.addEventListener("submit", async (event) => { event.preventDefault(); if (!form.reportValidity() || confirm.disabled) return; confirm.disabled = true; try { await context.api.handoffToCloser(leadId, closer.value, note.value.trim()); ui().store.invalidateLeads(); context.closePanel(); context.toast("Lead passado ao Closer.", "success"); context.navigate("leads"); } catch (error) { context.toast(error.message, "error"); confirm.disabled = false; } }); context.openPanel("Passar ao Closer", form);
      });
      if (canRunSdrFlow) actions.append(stageButton, handoff);
      if (canRunCloserFlow && data.lead.stage !== "pago" && data.lead.stage !== "perdido_adiado") {
        const lost = context.make("button", "button button-secondary", "Marcar perdido ou adiado");
        lost.type = "button";
        lost.addEventListener("click", async () => {
          try {
            await context.api.updateLead(leadId, { stage: "perdido_adiado" });
            ui().store.invalidateLeads();
            await reload();
          } catch (error) {
            context.toast(error.message, "error");
          }
        });
        actions.appendChild(lost);
      }
      hero.append(title, actions);
      const tabs = context.make("div", "tab-bar"); const content = context.make("div", "tab-content");
      const views = { resumo: () => summary(context, data, catalog, visibleLeads, reload), historico: () => history(context, data, reload), retornos: () => followups(context, data, catalog, reload), objecoes: () => objections(context, data, reload) };
      const tabLabels = { resumo: "Resumo", historico: "Histórico", retornos: "Retornos", objecoes: "Objeções" };
      if (window.CorexCommerce && (data.lead.owner_role === "closer" || data.offers.length || data.payments.length)) {
        views.comercial = () => window.CorexCommerce.render(context, data, catalog, reload);
        tabLabels.comercial = "Oferta e pagamento";
      }
      if (!views[activeTab]) activeTab = "resumo";
      Object.entries(tabLabels).forEach(([key, label]) => { const button = context.make("button", "tab-button" + (key === activeTab ? " active" : ""), label); button.type = "button"; button.addEventListener("click", () => { activeTab = key; tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active")); button.classList.add("active"); context.clear(content); content.appendChild(views[key]()); }); tabs.appendChild(button); });
      content.appendChild(views[activeTab]()); context.workspace.append(hero, tabs, content);
    } catch (error) { context.clear(context.workspace); context.workspace.appendChild(context.make("div", "empty-state", error.message)); }
  }
  window.CorexScreens.lead = Object.freeze({ render });
})();
