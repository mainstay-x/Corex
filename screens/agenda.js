(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  const statusLabels = {
    planejada: "Planejada",
    aberta: "Aberta",
    fechada: "Fechada",
    concluida: "Concluída",
    cancelada: "Cancelada",
  };

  function canManage(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_classes === true)));
  }

  // Datas ISO (AAAA-MM-DD) comparam certo como texto; hoje é o dia em Brasília.
  function isPast(klass, today) {
    if (klass.status === "concluida" || klass.status === "cancelada") return true;
    const last = klass.end_date || klass.start_date;
    return Boolean(last) && last < today;
  }

  function validateDates(values) {
    if (values.sales_open_date && values.close_date && values.sales_open_date > values.close_date) return "A abertura das vendas deve vir antes do fechamento.";
    if (values.close_date && values.start_date && values.close_date > values.start_date) return "O fechamento das vendas deve vir até o início das aulas.";
    if (values.start_date && values.end_date && values.start_date > values.end_date) return "O início das aulas deve vir antes do fim.";
    return "";
  }

  function monthLabel(key) {
    if (!key) return "Sem data";
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 15));
  }

  function groupByMonth(classes) {
    const groups = new Map();
    classes.forEach((klass) => {
      const key = klass.start_date ? klass.start_date.slice(0, 7) : "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(klass);
    });
    return [...groups.entries()];
  }

  function classForm(context, data, klass, reload) {
    const ui = window.CorexSdr;
    const item = klass || {};
    const form = context.make("form", "panel-form");
    ui.blockEnterSubmit(form);

    const main = context.make("section", "form-section");
    main.appendChild(context.make("h3", "", "Turma"));
    const courses = data.courses.filter((course) => course.active || course.id === item.course_id);
    const course = ui.select("class-course", courses.map((option) => ({ value: option.id, label: option.title })), item.course_id || "", true);
    course.required = true;
    const name = ui.input("class-name", "text", item.name || "", true);
    const status = ui.select("class-status", Object.entries(statusLabels).map(([value, label]) => ({ value, label })), item.status || "planejada");
    ui.field(context, main, "Curso", course);
    ui.field(context, main, "Nome da turma", name);
    ui.field(context, main, "Status", status);

    const dates = context.make("section", "form-section");
    dates.appendChild(context.make("h3", "", "Datas"));
    const salesOpen = ui.input("class-sales-open", "date", item.sales_open_date || "", false);
    const close = ui.input("class-close", "date", item.close_date || "", false);
    const start = ui.input("class-start", "date", item.start_date || "", true);
    const end = ui.input("class-end", "date", item.end_date || "", false);
    ui.field(context, dates, "Abertura das vendas", salesOpen);
    ui.field(context, dates, "Fechamento das vendas", close);
    ui.field(context, dates, "Início das aulas", start);
    ui.field(context, dates, "Fim das aulas", end);

    const goals = context.make("section", "form-section");
    goals.appendChild(context.make("h3", "", "Custos e meta"));
    const number = (id, value) => {
      const control = ui.input(id, "number", value, true);
      control.min = "0";
      control.step = "0.01";
      return control;
    };
    const hours = number("class-hours", item.instructor_hours ?? 0);
    const rate = number("class-rate", item.instructor_hour_rate ?? 0);
    const fixed = number("class-fixed", item.fixed_cost_allocated ?? 0);
    const margin = number("class-margin", item.goal_margin_students ?? 2);
    margin.step = "1";
    ui.field(context, goals, "Horas do instrutor", hours);
    ui.field(context, goals, "Valor da hora (R$)", rate);
    ui.field(context, goals, "Custo fixo alocado (R$)", fixed);
    ui.field(context, goals, "Margem de alunos", margin);

    const actions = context.make("div", "form-actions");
    const cancel = context.make("button", "button button-secondary", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", context.closePanel);
    const save = context.make("button", "button button-primary", "Salvar");
    save.type = "submit";
    actions.append(cancel, save);
    form.append(main, dates, goals, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = {
        course_id: course.value,
        name: name.value.trim(),
        status: status.value,
        sales_open_date: salesOpen.value || null,
        close_date: close.value || null,
        start_date: start.value,
        end_date: end.value || null,
        instructor_hours: Number(hours.value),
        instructor_hour_rate: Number(rate.value),
        fixed_cost_allocated: Number(fixed.value),
        goal_margin_students: Number(margin.value),
      };
      const problem = validateDates(values);
      if (problem) {
        context.toast(problem, "error");
        return;
      }
      save.disabled = true;
      try {
        if (item.id) await context.api.updateClass(item.id, values);
        else await context.api.createClass(values);
        ui.store.invalidateCatalog();
        ui.store.invalidateLeads();
        context.closePanel();
        context.toast("Turma salva.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  function classCard(context, data, klass, editable, reload) {
    const ui = window.CorexSdr;
    const card = context.make("article", "surface-card compact-card");
    const course = data.courses.find((item) => item.id === klass.course_id);
    const badge = klass.status === "aberta" ? "badge success" : klass.status === "cancelada" ? "badge warning" : "badge neutral";
    card.append(
      context.make("span", badge, statusLabels[klass.status] || klass.status),
      context.make("h3", "", klass.name),
      context.make("p", "", course ? course.title : "Curso não encontrado"),
      context.make("p", "", "Aulas: " + ui.formatDateOnly(klass.start_date) + (klass.end_date ? " a " + ui.formatDateOnly(klass.end_date) : "")),
    );
    if (klass.sales_open_date || klass.close_date) {
      card.appendChild(context.make("small", "", "Vendas: " + ui.formatDateOnly(klass.sales_open_date) + " a " + ui.formatDateOnly(klass.close_date)));
    }
    if (editable) {
      const edit = context.make("button", "table-action", "Editar");
      edit.type = "button";
      edit.addEventListener("click", () => context.openPanel("Editar turma", classForm(context, data, klass, reload)));
      card.appendChild(edit);
    }
    return card;
  }

  async function render(context) {
    const ui = window.CorexSdr;
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando agenda..."));
    try {
      const data = await context.api.getClassAgenda();
      const editable = canManage(context.currentProfile);
      const reload = () => render(context);
      context.clear(context.workspace);

      const toolbar = context.make("div", "screen-toolbar");
      const title = context.make("div", "screen-toolbar-copy");
      title.append(context.make("h2", "", "Agenda de cursos"), context.make("p", "", "Turmas por mês, com as datas de venda e de aula."));
      toolbar.appendChild(title);
      if (editable) {
        const create = context.make("button", "button button-primary", "Nova turma");
        create.type = "button";
        create.addEventListener("click", () => context.openPanel("Nova turma", classForm(context, data, null, reload)));
        toolbar.appendChild(create);
      }

      const tabs = context.make("div", "tab-bar");
      const host = context.make("div");
      let active = "proximas";

      function draw() {
        context.clear(host);
        const today = ui.localInputValue(new Date()).slice(0, 10);
        const visible = data.classes.filter((klass) => (active === "passadas") === isPast(klass, today));
        if (active === "passadas") visible.reverse();
        if (!visible.length) {
          host.appendChild(context.make("div", "empty-state", active === "passadas" ? "Nenhuma turma passada." : "Nenhuma turma na agenda."));
          return;
        }
        groupByMonth(visible).forEach(([key, classes]) => {
          host.appendChild(context.make("h3", "agenda-month", monthLabel(key)));
          const list = context.make("div", "stack-list");
          classes.forEach((klass) => list.appendChild(classCard(context, data, klass, editable, reload)));
          host.appendChild(list);
        });
      }

      [["proximas", "Próximas"], ["passadas", "Passadas"]].forEach(([key, label], index) => {
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
      context.workspace.append(toolbar, tabs, host);
      draw();
    } catch (error) {
      context.clear(context.workspace);
      context.workspace.appendChild(context.make("div", "empty-state", error.message));
    }
  }

  window.CorexScreens.agenda = Object.freeze({ render, isPast, validateDates, canManage });
})();
