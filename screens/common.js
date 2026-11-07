(function () {
  "use strict";

  const stageLabels = {
    novo: "Novo",
    contato_iniciado: "Contato iniciado",
    qualificado: "Qualificado",
    aula_gratuita: "Aula gratuita",
    oferta_apresentada: "Oferta apresentada",
    passagem_closer: "Passagem ao Closer",
    link_enviado: "Link enviado",
    pagamento_pendente: "Pagamento pendente",
    pago: "Pago",
    perdido_adiado: "Perdido ou adiado",
    ex_aluno: "Ex-aluno",
  };
  const followupLabels = {
    inbound_novo: "Inbound novo",
    indicacao: "Indicação",
    pos_aula_gratuita: "Pós-aula gratuita",
    sem_resposta: "Ementa ou preço sem resposta",
    reativacao: "Reativação",
    embarcado: "Embarcado",
    passagem_closer: "Passagem ao Closer",
    reuniao: "Reunião",
    pagamento: "Pagamento",
    outro: "Outro",
  };
  const meetingStatusLabels = {
    agendada: "Agendada",
    realizada: "Realizada",
    remarcada: "Remarcada",
    cancelada: "Cancelada",
    nao_compareceu: "Não compareceu",
  };
  const sourceLabels = {
    linkedin: "LinkedIn",
    indicacao: "Indicação",
    aula_gratuita: "Aula gratuita",
    inbound: "Inbound",
    outro: "Outro",
  };

  const store = {
    catalog: null,
    leads: null,
    async getCatalog(api, force) {
      if (!this.catalog || force) this.catalog = await api.getSdrCatalog();
      return this.catalog;
    },
    async getLeads(api, force) {
      if (!this.leads || force) this.leads = await api.listLeads();
      return this.leads;
    },
    invalidateLeads() {
      this.leads = null;
    },
    invalidateCatalog() {
      this.catalog = null;
    },
  };

  function formatDate(value, withTime) {
    if (!value) return "Não definido";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Não definido";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: withTime ? "short" : undefined,
    }).format(date);
  }

  function formatDateOnly(value) {
    const parts = String(value || "").slice(0, 10).split("-");
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return "Não definido";
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function localInputValue(value) {
    const date = value ? new Date(value) : new Date();
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).reduce((out, part) => ((out[part.type] = part.value), out), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function isSameSaoPauloDay(value, comparison) {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
    return formatter.format(new Date(value)) === formatter.format(comparison || new Date());
  }

  function operationalDay(value) {
    const date = new Date(value || Date.now());
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(date));
    return hour < 7 ? addDays(date, -1) : date;
  }

  function addDays(value, days) {
    const date = new Date(value || Date.now());
    date.setDate(date.getDate() + days);
    return date;
  }

  function addBusinessHour(value, holidays) {
    let date = new Date(value || Date.now());
    let minutes = 60;
    const holidaySet = new Set((holidays || []).map((item) => item.holiday_date));
    while (minutes > 0) {
      date = new Date(date.getTime() + 60000);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(date).reduce((out, part) => ((out[part.type] = part.value), out), {});
      const useful = !["Sat", "Sun"].includes(parts.weekday) && !holidaySet.has(`${parts.year}-${parts.month}-${parts.day}`) && Number(parts.hour) >= 8 && Number(parts.hour) < 18;
      if (useful) minutes -= 1;
    }
    return date;
  }

  function suggestedFollowups(type, base, holidays) {
    const start = new Date(base || Date.now());
    if (type === "inbound_novo") return [addBusinessHour(start, holidays)];
    if (type === "indicacao") return [new Date(start.getTime() + 48 * 3600000)];
    if (type === "pos_aula_gratuita") return [new Date(start.getTime() + 24 * 3600000)];
    if (type === "sem_resposta") return [2, 4, 7, 14].map((days) => addDays(start, days));
    if (type === "reativacao") return [addDays(start, 90)];
    return [start];
  }

  function input(id, type, value, required) {
    const node = document.createElement("input");
    node.id = id;
    node.name = id;
    node.type = type || "text";
    node.required = Boolean(required);
    if (value !== undefined && value !== null) node.value = value;
    return node;
  }

  function select(id, options, value, includeEmpty) {
    const node = document.createElement("select");
    node.id = id;
    node.name = id;
    if (includeEmpty) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Selecione";
      node.appendChild(empty);
    }
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      node.appendChild(option);
    });
    if (value !== undefined && value !== null) node.value = value;
    return node;
  }

  function field(context, parent, labelText, control) {
    const label = context.make("label", "", labelText);
    label.htmlFor = control.id;
    parent.append(label, control);
  }

  function courseName(catalog, id) {
    return (catalog.courses.find((item) => item.id === id) || {}).title || "Não definido";
  }

  function className(catalog, id) {
    return (catalog.classes.find((item) => item.id === id) || {}).name || "Não definida";
  }

  function blockEnterSubmit(form) {
    // Enter num campo não salva o formulário: só o botão Salvar salva.
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.tagName === "INPUT") event.preventDefault();
    });
  }

  function followupEditor(context, item, onSaved) {
    const form = context.make("form", "panel-form");
    blockEnterSubmit(form);
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Retorno"));
    const systemTypes = ["passagem_closer", "sem_resposta", "pagamento"];
    const locked = Boolean(item.class_id || item.sequence_step) || systemTypes.includes(item.type);
    const options = Object.entries(followupLabels)
      .filter(([value]) => value === item.type || !systemTypes.includes(value))
      .map(([value, label]) => ({ value, label }));
    const type = select("followup-edit-type", options, item.type);
    type.disabled = locked;
    const due = input("followup-edit-due", "datetime-local", localInputValue(item.due_at), true);
    const reason = input("followup-edit-reason", "text", item.reason || "", true);
    const meetingUrl = input("followup-edit-url", "url", item.meeting_url || "", false);
    const platform = select("followup-edit-platform", [
      { value: "", label: "Não informada" },
      { value: "google_meet", label: "Google Meet" },
      { value: "microsoft_teams", label: "Microsoft Teams" },
      { value: "zoom", label: "Zoom" },
      { value: "outra", label: "Outra" },
    ], item.meeting_platform || "");
    const syncMeeting = () => {
      meetingUrl.disabled = type.value !== "reuniao";
      platform.disabled = type.value !== "reuniao";
    };
    type.addEventListener("change", syncMeeting);
    syncMeeting();
    field(context, section, "Tipo", type);
    field(context, section, "Data", due);
    field(context, section, "Motivo", reason);
    field(context, section, "Link da reunião", meetingUrl);
    field(context, section, "Plataforma", platform);
    if (item.class_id) section.appendChild(context.make("p", "", "Aviso de turma: para parar, use Não avisar mais no interesse do lead."));

    const finish = async (changes) => {
      await context.api.updateFollowup(item.id, changes);
      store.invalidateLeads();
      context.closePanel();
      context.toast("Retorno salvo.", "success");
      await onSaved();
    };

    const actions = context.make("div", "form-actions");
    if (!item.class_id) {
      const remove = context.make("button", "button button-secondary", "Cancelar retorno");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm("Cancelar este retorno?")) return;
        remove.disabled = true;
        try {
          const changes = { status: "cancelado", done_at: new Date().toISOString() };
          if (item.type === "reuniao") changes.meeting_status = "cancelada";
          await finish(changes);
        } catch (error) {
          remove.disabled = false;
          context.toast(error.message, "error");
        }
      });
      actions.appendChild(remove);
    }
    const save = context.make("button", "button button-primary", "Salvar");
    save.type = "submit";
    actions.appendChild(save);
    form.append(section, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const changes = { due_at: new Date(due.value).toISOString(), reason: reason.value.trim() };
      if (type.value !== item.type) changes.type = type.value;
      if (type.value === "reuniao") {
        changes.meeting_url = meetingUrl.value.trim() || null;
        changes.meeting_platform = platform.value || null;
        if (item.type !== "reuniao") changes.meeting_status = "agendada";
        else if (due.value !== localInputValue(item.due_at)) changes.meeting_status = "remarcada";
      } else if (item.type === "reuniao") {
        Object.assign(changes, { meeting_status: null, meeting_url: null, meeting_platform: null });
      }
      save.disabled = true;
      try {
        await finish(changes);
      } catch (error) {
        save.disabled = false;
        context.toast(error.message, "error");
      }
    });
    return form;
  }

  window.CorexSdr = Object.freeze({
    store,
    stageLabels,
    followupLabels,
    meetingStatusLabels,
    sourceLabels,
    formatDate,
    formatDateOnly,
    localInputValue,
    isSameSaoPauloDay,
    operationalDay,
    addDays,
    suggestedFollowups,
    input,
    select,
    field,
    courseName,
    className,
    blockEnterSubmit,
    followupEditor,
  });
})();
