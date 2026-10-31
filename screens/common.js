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
  });
})();
