(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  function initials(value) {
    return String(value || "U")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function roleLabel(user, catalogs) {
    const role = catalogs.roles.find((item) => item.code === user.role);
    const label = role ? role.name : user.role || "Sem perfil";
    return user.is_admin && user.role !== "founder" ? label + " · Admin" : label;
  }

  function appendField(context, parent, labelText, input) {
    const label = context.make("label", "", labelText);
    if (input.id) label.htmlFor = input.id;
    parent.append(label, input);
  }

  function textInput(id, type, required, placeholder) {
    const input = document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = type;
    input.required = Boolean(required);
    if (placeholder) input.placeholder = placeholder;
    if (type === "password") input.minLength = 8;
    return input;
  }

  function selectCatalog(id, items, excludeProtected) {
    const select = document.createElement("select");
    select.id = id;
    select.name = id;
    items
      .filter((item) => !excludeProtected || !item.protected)
      .forEach((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = item.name;
      select.appendChild(option);
    });
    return select;
  }

  function checkRow(context, key, title, description, checked) {
    const label = context.make("label", "check-row");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = key;
    input.checked = Boolean(checked);
    const copy = context.make("span", "check-copy");
    copy.append(context.make("span", "", title), context.make("small", "", description));
    label.append(input, copy);
    return label;
  }

  function collectPermissions(form, definitions) {
    return definitions.reduce((permissions, item) => {
      permissions[item.code] = Boolean(form.elements[item.code] && form.elements[item.code].checked);
      return permissions;
    }, {});
  }

  function appendPermissionRows(context, parent, form, selectedPermissions) {
    let currentCategory = "";
    context.catalogs.permissions.forEach((item) => {
      if (item.category && item.category !== currentCategory) {
        currentCategory = item.category;
        parent.appendChild(context.make("p", "permission-category", currentCategory));
      }
      const enabled = Boolean(selectedPermissions && selectedPermissions[item.code] === true);
      parent.appendChild(checkRow(context, item.code, item.name, item.description, enabled));
    });
  }

  function applyRoleDefaults(context, form, roleCode, teamSelect, setRoleTeam) {
    const role = context.catalogs.roles.find((item) => item.code === roleCode);
    if (!role) return;
    if (setRoleTeam !== false && role.team_code) teamSelect.value = role.team_code;
    context.catalogs.permissions.forEach((permission) => {
      const input = form.elements[permission.code];
      if (!input) return;
      input.disabled = false;
      if (role.default_permissions && role.default_permissions[permission.code] === true) {
        input.checked = true;
        input.disabled = true;
      }
    });
  }

  function formButton(context, label, className) {
    const button = context.make("button", className || "button button-primary", label);
    button.type = "submit";
    return button;
  }

  function setButtonBusy(button, busy, idleLabel, busyLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  function createUserForm(context, refresh) {
    const form = context.make("form", "panel-form");
    form.noValidate = true;

    const identity = context.make("section", "form-section");
    identity.append(
      context.make("h3", "", "Identificação"),
      context.make("p", "", "Dados usados para criar o acesso no Supabase Auth e o perfil no COREX."),
    );
    const name = textInput("new-display-name", "text", true, "Nome completo");
    const email = textInput("new-email", "email", true, "nome@empresa.com.br");
    const password = textInput("new-password", "password", true, "Mínimo de 8 caracteres");
    const jobTitle = textInput("new-job-title", "text", false, "Ex.: CEO, CFO, Analista Financeiro");
    appendField(context, identity, "Nome", name);
    appendField(context, identity, "E-mail", email);
    appendField(context, identity, "Senha temporária", password);
    appendField(context, identity, "Cargo", jobTitle);

    const access = context.make("section", "form-section");
    access.append(
      context.make("h3", "", "Perfil e privilégios"),
      context.make("p", "", "O perfil define a base do acesso. Cargo, equipe e privilégios continuam independentes."),
    );
    const role = selectCatalog("new-role", context.catalogs.roles, true);
    const team = selectCatalog("new-team", context.catalogs.teams, false);
    appendField(context, access, "Perfil operacional", role);
    appendField(context, access, "Equipe", team);
    access.appendChild(
      checkRow(
        context,
        "is_admin",
        "Administrador",
        "Libera a área administrativa e todos os recursos do COREX.",
        false,
      ),
    );
    appendPermissionRows(context, access, form, {});
    role.addEventListener("change", () => applyRoleDefaults(context, form, role.value, team, true));

    const actions = context.make("div", "form-actions");
    const cancel = context.make("button", "button button-secondary", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", context.closePanel);
    const submit = formButton(context, "Criar conta");
    actions.append(cancel, submit);
    form.append(identity, access, actions);
    applyRoleDefaults(context, form, role.value, team, true);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setButtonBusy(submit, true, "Criar conta", "Criando...");
      try {
        await context.api.createUser({
          email: email.value.trim(),
          password: password.value,
          display_name: name.value.trim(),
          role: role.value,
          team_code: team.value,
          job_title: jobTitle.value.trim() || null,
          is_admin: form.elements.is_admin.checked,
          permissions: collectPermissions(form, context.catalogs.permissions),
        });
        context.toast("Conta criada com sucesso.", "success");
        context.closePanel();
        await refresh();
      } catch (error) {
        context.toast(error.message || "Não foi possível criar a conta.", "error");
      } finally {
        setButtonBusy(submit, false, "Criar conta", "Criando...");
      }
    });
    return form;
  }

  function editUserForm(context, user, refresh) {
    const form = context.make("form", "panel-form");
    form.noValidate = true;

    const identity = context.make("section", "form-section");
    identity.append(
      context.make("h3", "", "Conta"),
      context.make("p", "", user.email || "E-mail não disponível"),
    );
    const name = textInput("edit-display-name", "text", true);
    name.value = user.display_name || "";
    const jobTitle = textInput("edit-job-title", "text", false, "Ex.: CEO, CFO, Analista Financeiro");
    jobTitle.value = user.job_title || "";
    appendField(context, identity, "Nome", name);
    appendField(context, identity, "Cargo", jobTitle);

    const access = context.make("section", "form-section");
    access.append(
      context.make("h3", "", "Perfil e privilégios"),
      context.make("p", "", "As mudanças passam a valer nas próximas consultas da conta."),
    );
    const role = selectCatalog("edit-role", context.catalogs.roles, true);
    role.value = user.role;
    const team = selectCatalog("edit-team", context.catalogs.teams, false);
    team.value = user.team_code || "";
    appendField(context, access, "Perfil operacional", role);
    appendField(context, access, "Equipe", team);
    access.appendChild(
      checkRow(context, "active", "Conta ativa", "Desmarque para impedir novos acessos.", user.active),
    );
    access.appendChild(
      checkRow(context, "is_admin", "Administrador", "Libera a área administrativa e todos os recursos.", user.is_admin),
    );
    appendPermissionRows(context, access, form, user.permissions || {});
    role.addEventListener("change", () => applyRoleDefaults(context, form, role.value, team, true));

    const reset = context.make("section", "form-section");
    reset.append(
      context.make("h3", "", "Redefinir senha"),
      context.make("p", "", "A senha é substituída imediatamente."),
    );
    const newPassword = textInput("reset-password", "password", false, "Nova senha, mínimo de 8 caracteres");
    appendField(context, reset, "Nova senha", newPassword);
    const resetButton = context.make("button", "button button-secondary", "Redefinir senha");
    resetButton.type = "button";
    resetButton.addEventListener("click", async () => {
      if (newPassword.value.length < 8) {
        context.toast("A nova senha precisa ter ao menos 8 caracteres.", "error");
        return;
      }
      setButtonBusy(resetButton, true, "Redefinir senha", "Redefinindo...");
      try {
        await context.api.resetUserPassword({ user_id: user.user_id, password: newPassword.value });
        newPassword.value = "";
        context.toast("Senha redefinida.", "success");
      } catch (error) {
        context.toast(error.message || "Não foi possível redefinir a senha.", "error");
      } finally {
        setButtonBusy(resetButton, false, "Redefinir senha", "Redefinindo...");
      }
    });
    reset.appendChild(resetButton);

    const actions = context.make("div", "form-actions");
    const cancel = context.make("button", "button button-secondary", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", context.closePanel);
    const submit = formButton(context, "Salvar alterações");
    actions.append(cancel, submit);
    form.append(identity, access, reset, actions);
    applyRoleDefaults(context, form, role.value, team, false);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setButtonBusy(submit, true, "Salvar alterações", "Salvando...");
      try {
        await context.api.updateUser({
          user_id: user.user_id,
          display_name: name.value.trim(),
          role: role.value,
          team_code: team.value,
          job_title: jobTitle.value.trim() || null,
          active: form.elements.active.checked,
          is_admin: form.elements.is_admin.checked,
          permissions: collectPermissions(form, context.catalogs.permissions),
        });
        context.toast("Acesso atualizado.", "success");
        context.closePanel();
        await refresh();
      } catch (error) {
        context.toast(error.message || "Não foi possível atualizar a conta.", "error");
      } finally {
        setButtonBusy(submit, false, "Salvar alterações", "Salvando...");
      }
    });
    return form;
  }

  function renderTable(context, users, refresh) {
    const shell = context.make("div", "table-shell");
    if (!users.length) {
      shell.appendChild(context.make("div", "empty-state", "Nenhuma conta encontrada."));
      return shell;
    }

    const table = context.make("table", "data-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Usuário", "Equipe", "Perfil", "Privilégios", "Status", ""].forEach((label) => {
      headRow.appendChild(context.make("th", "", label));
    });
    head.appendChild(headRow);
    const body = document.createElement("tbody");

    users.forEach((user) => {
      const row = document.createElement("tr");
      const personCell = document.createElement("td");
      const person = context.make("div", "person-cell");
      const avatar = context.make("span", "profile-avatar", initials(user.display_name));
      const meta = context.make("span", "person-meta");
      meta.append(
        context.make("b", "", user.display_name || "Perfil não configurado"),
        context.make("small", "", user.email || "E-mail não disponível"),
      );
      if (user.job_title) meta.appendChild(context.make("small", "", user.job_title));
      person.append(avatar, meta);
      personCell.appendChild(person);
      row.appendChild(personCell);

      const teamCell = document.createElement("td");
      const teamDefinition = context.catalogs.teams.find((item) => item.code === user.team_code);
      teamCell.textContent = teamDefinition ? teamDefinition.name : "Não definida";
      row.appendChild(teamCell);

      const roleCell = document.createElement("td");
      roleCell.appendChild(context.make("span", "badge", roleLabel(user, context.catalogs)));
      row.appendChild(roleCell);

      const permissionCell = document.createElement("td");
      const enabledPermissions = Object.values(user.permissions || {}).filter((value) => value === true).length;
      permissionCell.textContent = user.role === "founder" || user.is_admin ? "Acesso administrativo" : enabledPermissions + " permissões";
      row.appendChild(permissionCell);

      const statusCell = document.createElement("td");
      statusCell.appendChild(
        context.make("span", "badge " + (user.active ? "success" : "neutral"), user.active ? "Ativo" : "Inativo"),
      );
      row.appendChild(statusCell);

      const actionCell = document.createElement("td");
      if (user.role !== "founder" && user.user_id !== context.currentProfile.user_id) {
        const edit = context.make("button", "table-action", "Editar");
        edit.type = "button";
        edit.addEventListener("click", () => {
          context.openPanel("Editar usuário", editUserForm(context, user, refresh));
        });
        actionCell.appendChild(edit);
      } else {
        actionCell.appendChild(context.make("span", "badge neutral", user.role === "founder" ? "Protegido" : "Conta atual"));
      }
      row.appendChild(actionCell);
      body.appendChild(row);
    });

    table.append(head, body);
    shell.appendChild(table);
    return shell;
  }

  async function render(context) {
    context.clear(context.workspace);
    const toolbar = context.make("div", "screen-toolbar");
    const copy = context.make("div", "screen-toolbar-copy");
    copy.append(
      context.make("h2", "", "Contas e acessos"),
      context.make("p", "", "Crie usuários e defina os privilégios disponíveis para cada conta."),
    );
    const create = context.make("button", "button button-primary", "Nova conta");
    create.type = "button";
    create.disabled = true;
    toolbar.append(copy, create);
    context.workspace.append(toolbar, context.make("div", "loading-state", "Carregando contas..."));
    context.setTopbarActions([]);

    const refresh = async () => render(context);
    create.addEventListener("click", () => {
      context.openPanel("Nova conta", createUserForm(context, refresh));
    });

    try {
      const result = await context.api.listUsers();
      const users = Array.isArray(result && result.users) ? result.users : [];
      context.catalogs = {
        roles: Array.isArray(result && result.roles) ? result.roles : [],
        teams: Array.isArray(result && result.teams) ? result.teams : [],
        permissions: Array.isArray(result && result.permission_definitions) ? result.permission_definitions : [],
      };
      if (!context.catalogs.roles.length || !context.catalogs.teams.length) {
        throw new Error("O catálogo de perfis ainda não foi instalado. Execute a migração 002.");
      }
      create.disabled = false;
      while (context.workspace.childNodes.length > 1) context.workspace.removeChild(context.workspace.lastChild);
      context.workspace.appendChild(renderTable(context, users, refresh));
    } catch (error) {
      while (context.workspace.childNodes.length > 1) context.workspace.removeChild(context.workspace.lastChild);
      const empty = context.make("div", "empty-state");
      empty.append(
        context.make("h3", "", "Não foi possível carregar os usuários"),
        context.make("p", "", error.message || "Verifique a função administrativa do Supabase."),
      );
      context.workspace.appendChild(empty);
    }
  }

  window.CorexScreens.users = Object.freeze({ render });
})();
