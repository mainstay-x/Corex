(function () {
  "use strict";

  // Copiloto de vendas: sugestão de mensagem, próxima ação e retorno para um lead.
  // Todo texto vindo da OpenAI ou do banco é exibido com textContent.

  const ui = () => window.CorexSdr;
  const wa = () => window.CorexWhatsapp;

  const allowedRoles = ["founder", "sdr", "closer"];

  function canUse(profile) {
    return Boolean(profile && (allowedRoles.includes(profile.role) || profile.is_admin));
  }

  function canUseAdvanced(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.role === "closer" || profile.is_admin));
  }

  // Data e hora sugeridas pelo copiloto, no horário de Brasília (UTC-3, sem horário de verão).
  function followupDueAt(day, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
    const hour = /^\d{2}:\d{2}$/.test(time || "") ? time : "09:00";
    const due = new Date(day + "T" + hour + ":00-03:00");
    return Number.isNaN(due.getTime()) ? null : due;
  }

  function quotaLine(summary) {
    if (!summary) return "";
    const own = Number(summary.user_month || 0);
    const quota = Number(summary.month_quota || 0);
    return (
      "Sua cota no mês: " + wa().money(own) + " de " + wa().money(quota) +
      " · hoje: " + wa().money(summary.user_day) + " de " + wa().money(summary.daily_quota) +
      " · total da empresa: " + wa().money(summary.spent) + " de " + wa().money(summary.limit)
    );
  }

  function block(context, title, text) {
    const section = context.make("section", "copilot-block");
    section.appendChild(context.make("h4", "", title));
    const body = context.make("p", "copilot-text", text || "Sem sugestão.");
    section.appendChild(body);
    return section;
  }

  function render(context, options) {
    const leadId = options.leadId;
    const profile = context.currentProfile;
    const root = context.make("div", "copilot-panel");
    root.appendChild(context.make("p", "copilot-intro", "Sugestões a partir do histórico do lead. Revise antes de enviar: nada sai sem você."));

    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    const instruction = document.createElement("textarea");
    instruction.id = "copilot-instruction";
    instruction.rows = 3;
    instruction.maxLength = 1000;
    instruction.placeholder = "Opcional: o que você quer da próxima mensagem";
    ui().field(context, section, "Instrução", instruction);

    let model = null;
    if (canUseAdvanced(profile)) {
      model = ui().select("copilot-model", [
        { value: "padrao", label: "Padrão" },
        { value: "avancado", label: "Avançado (custa mais)" },
      ], "padrao");
      ui().field(context, section, "Modelo", model);
    }

    const quota = context.make("p", "copilot-quota", "");
    section.appendChild(quota);
    const submit = context.make("button", "button button-primary", "Sugerir próxima mensagem");
    submit.type = "submit";
    form.append(section, submit);

    const result = context.make("div", "copilot-result");
    root.append(form, result);

    async function refreshQuota() {
      try {
        quota.textContent = quotaLine(await context.api.getAiSummary());
      } catch (_error) {
        quota.textContent = "";
      }
    }

    function showSuggestion(data) {
      context.clear(result);
      const suggestion = data.suggestion || {};
      const message = block(context, "Mensagem sugerida", suggestion.mensagem);
      const messageActions = context.make("div", "copilot-actions");
      const copy = context.make("button", "button button-secondary", "Copiar");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(suggestion.mensagem || "");
          context.toast("Mensagem copiada.", "success");
        } catch (_error) {
          context.toast("Não foi possível copiar. Selecione o texto e use Ctrl+C.", "error");
        }
      });
      messageActions.appendChild(copy);
      if (typeof options.onUseText === "function") {
        const use = context.make("button", "button button-secondary", "Usar na resposta");
        use.type = "button";
        use.addEventListener("click", () => options.onUseText(suggestion.mensagem || ""));
        messageActions.appendChild(use);
      }
      message.appendChild(messageActions);

      const action = block(context, "Próxima ação", suggestion.proxima_acao);
      const followup = suggestion.retorno || {};
      const due = followupDueAt(followup.data, followup.hora);
      const followupText =
        (ui().followupLabels[followup.tipo] || followup.tipo || "Retorno") +
        (due ? " em " + ui().formatDate(due.toISOString(), true) : "") +
        (followup.motivo ? ". " + followup.motivo : "");
      const followupBlock = block(context, "Retorno proposto", followupText);
      if (due && due.getTime() > Date.now()) {
        const create = context.make("button", "button button-secondary", "Criar este retorno");
        create.type = "button";
        create.addEventListener("click", async () => {
          create.disabled = true;
          try {
            await context.api.addFollowups([{
              lead_id: leadId,
              type: followup.tipo,
              due_at: due.toISOString(),
              reason: String(followup.motivo || "Retorno sugerido pelo copiloto").slice(0, 500),
            }]);
            if (ui().store && ui().store.invalidateLeads) ui().store.invalidateLeads();
            context.toast("Retorno criado.", "success");
            if (typeof options.onFollowupCreated === "function") options.onFollowupCreated();
          } catch (error) {
            create.disabled = false;
            context.toast(error.message || "Não foi possível criar o retorno.", "error");
          }
        });
        followupBlock.appendChild(create);
      }
      result.append(message, action, followupBlock);
      if (suggestion.observacao) result.appendChild(block(context, "Atenção", suggestion.observacao));
      result.appendChild(context.make("p", "copilot-cost",
        "Custo desta sugestão: " + wa().money(data.cost) + (data.charged_to === "comum" ? " (saldo comum)" : "")));
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = "Pensando...";
      try {
        const data = await context.api.suggestCopilot({
          lead_id: leadId,
          instruction: instruction.value.trim(),
          model: model ? model.value : "padrao",
        });
        showSuggestion(data);
      } catch (error) {
        context.clear(result);
        result.appendChild(context.make("p", "form-message", error.message || "O copiloto não respondeu."));
      } finally {
        submit.disabled = false;
        submit.textContent = "Sugerir próxima mensagem";
        refreshQuota();
      }
    });

    refreshQuota();
    return root;
  }

  function open(context, options) {
    context.openPanel("Copiloto", render(context, options));
  }

  window.CorexCopilot = Object.freeze({ canUse, canUseAdvanced, followupDueAt, quotaLine, render, open });
})();
