(function () {
  "use strict";

  window.CorexScreens = window.CorexScreens || {};

  const wa = () => window.CorexWhatsapp;
  const ui = () => window.CorexSdr;

  function preview(value) {
    const textValue = String(value || "").replace(/\s+/g, " ").trim();
    return textValue.length > 90 ? textValue.slice(0, 87) + "..." : textValue;
  }

  function mediaButton(context, item) {
    const host = context.make("div", "inbox-media");
    host.appendChild(context.make("span", "badge neutral", wa().mediaLabels[item.media_type] || "Anexo"));
    if (item.file_name) host.appendChild(context.make("small", "", item.file_name));
    if (item.status === "salvo" && item.storage_path) {
      const open = context.make("button", "table-action", "Abrir anexo");
      open.type = "button";
      open.addEventListener("click", async () => {
        open.disabled = true;
        try {
          const url = await context.api.getWhatsappMediaUrl(item.storage_path);
          window.open(url, "_blank", "noopener");
        } catch (error) {
          context.toast(error.message, "error");
        } finally {
          open.disabled = false;
        }
      });
      host.appendChild(open);
    } else if (item.status === "pendente") {
      host.appendChild(context.make("small", "", "Salvando anexo..."));
    } else {
      host.appendChild(context.make("small", "", item.status === "muito_grande" ? "Anexo acima de 25 MB" : "Anexo indisponível"));
    }
    return host;
  }

  async function render(context, leadId) {
    const state = { conversations: [], selected: leadId || null, search: "", timer: null, active: true, unsubscribe: null };
    context.onLeave(() => {
      state.active = false;
      window.clearTimeout(state.timer);
      if (state.unsubscribe) state.unsubscribe();
    });
    context.clear(context.workspace);
    context.workspace.appendChild(context.make("div", "loading-state", "Carregando conversas..."));

    const shell = context.make("div", "inbox-shell");
    const listPane = context.make("section", "inbox-list surface-card");
    const search = ui().input("inbox-search", "search", "");
    search.placeholder = "Buscar por nome ou telefone";
    search.setAttribute("aria-label", "Buscar conversa");
    const listHost = context.make("div", "inbox-items");
    listPane.append(search, listHost);
    const threadPane = context.make("section", "inbox-thread surface-card");
    shell.append(listPane, threadPane);

    function renderList() {
      context.clear(listHost);
      const term = state.search.toLowerCase();
      const digits = term.replace(/\D/g, "");
      const visible = state.conversations.filter((item) => {
        if (!term) return true;
        return String(item.lead.name || "").toLowerCase().includes(term) || (digits && String(item.lead.phone || "").includes(digits));
      });
      if (!visible.length) {
        listHost.appendChild(context.make("div", "empty-state", state.conversations.length ? "Nenhuma conversa encontrada." : "Nenhuma conversa de WhatsApp ainda."));
        return;
      }
      visible.forEach((item) => {
        const row = context.make("button", "inbox-item" + (item.lead_id === state.selected ? " active" : ""));
        row.type = "button";
        const top = context.make("span", "inbox-item-top");
        top.append(context.make("b", "", item.lead.name), context.make("small", "", ui().formatDate(item.last_at, true)));
        const bottom = context.make("span", "inbox-item-bottom");
        bottom.appendChild(context.make("span", "", (item.last_direction === "out" ? "Você: " : "") + preview(item.last_body)));
        if (wa().windowState(item.last_inbound_at).open) bottom.appendChild(context.make("span", "badge success", "Janela aberta"));
        row.append(top, bottom);
        row.addEventListener("click", () => openConversation(item.lead_id));
        listHost.appendChild(row);
      });
    }

    async function loadList() {
      state.conversations = await context.api.listWhatsappConversations();
      renderList();
    }

    function renderThread(data) {
      // Atualizações em tempo real não apagam o texto que está sendo digitado.
      const previous = threadPane.querySelector("textarea");
      const draft = previous && state.draftLead === data.lead.id ? previous.value : "";
      state.draftLead = data.lead.id;
      context.clear(threadPane);
      const lead = data.lead;
      const head = context.make("header", "inbox-thread-head");
      const title = context.make("div");
      title.append(
        context.make("h2", "", lead.name),
        context.make("p", "", (lead.phone || "Sem telefone") + " · " + (ui().stageLabels[lead.stage] || lead.stage)),
      );
      const open = context.make("button", "button button-secondary", "Abrir ficha");
      open.type = "button";
      open.addEventListener("click", () => context.navigate("lead", lead.id));
      head.append(title, open);

      const byInteraction = new Map();
      data.messages.forEach((message) => {
        if (message.interaction_id) byInteraction.set(message.interaction_id, message);
      });
      const mediaByInteraction = new Map(data.media.map((item) => [item.interaction_id, item]));

      const messages = context.make("div", "inbox-messages");
      if (!data.interactions.length) messages.appendChild(context.make("div", "empty-state", "Nenhuma mensagem nesta conversa."));
      data.interactions.forEach((item) => {
        const bubble = context.make("article", "inbox-bubble " + (item.direction === "in" ? "incoming" : "outgoing"));
        bubble.appendChild(context.make("p", "", item.body));
        const media = mediaByInteraction.get(item.id);
        if (media) bubble.appendChild(mediaButton(context, media));
        const meta = [ui().formatDate(item.occurred_at, true)];
        if (item.direction === "out") {
          const message = byInteraction.get(item.id);
          if (message) meta.push(wa().messageStatus(message));
          else if (!item.wa_message_id) meta.push("Registrada manualmente");
        }
        bubble.appendChild(context.make("small", "", meta.join(" · ")));
        messages.appendChild(bubble);
      });
      const failedReservations = data.messages.filter((message) => !message.interaction_id && message.status === "falha" && message.origin === "corex").slice(0, 3);
      failedReservations.forEach((message) => {
        const bubble = context.make("article", "inbox-bubble outgoing failed");
        bubble.appendChild(context.make("p", "", "Mensagem não enviada"));
        bubble.appendChild(context.make("small", "", ui().formatDate(message.created_at, true) + " · " + wa().messageStatus(message)));
        messages.appendChild(bubble);
      });

      const windowInfo = wa().windowState(wa().lastInboundAt(data.interactions));
      const allowed = wa().canMessageLead(context.currentProfile, lead);
      const composer = context.make("form", "inbox-composer");
      const notice = context.make("p", "inbox-notice");
      if (!allowed) notice.textContent = "Você pode ler esta conversa, mas a resposta cabe ao dono do lead.";
      else if (!windowInfo.open) notice.textContent = "Janela de 24 horas fechada. Responda pelo celular ou aguarde uma nova mensagem do lead.";
      else notice.textContent = "Janela aberta até " + ui().formatDate(windowInfo.expiresAt, true) + ".";
      const textarea = document.createElement("textarea");
      textarea.id = "inbox-message";
      textarea.maxLength = 4096;
      textarea.rows = 3;
      textarea.placeholder = "Escreva a mensagem";
      textarea.setAttribute("aria-label", "Mensagem");
      textarea.value = draft;
      const send = context.make("button", "button button-primary", "Enviar");
      send.type = "submit";
      const blocked = !allowed || !windowInfo.open;
      textarea.disabled = blocked;
      send.disabled = blocked;
      composer.append(notice, textarea, send);
      composer.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = textarea.value;
        if (!body.trim() || send.disabled) return;
        send.disabled = true;
        textarea.disabled = true;
        try {
          await context.api.sendWhatsappMessage(lead.id, body);
          textarea.value = "";
          await refreshThread();
          await loadList();
        } catch (error) {
          context.toast(error.message, "error");
          await refreshThread();
        }
      });
      textarea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) composer.requestSubmit();
      });

      threadPane.append(head, messages, composer);
      messages.scrollTop = messages.scrollHeight;
    }

    async function refreshThread() {
      if (!state.selected) {
        context.clear(threadPane);
        threadPane.appendChild(context.make("div", "empty-state", "Escolha uma conversa."));
        return;
      }
      try {
        renderThread(await context.api.getWhatsappConversation(state.selected));
      } catch (error) {
        context.clear(threadPane);
        threadPane.appendChild(context.make("div", "empty-state", error.message));
      }
    }

    async function openConversation(id) {
      state.selected = id;
      renderList();
      context.clear(threadPane);
      threadPane.appendChild(context.make("div", "loading-state", "Carregando conversa..."));
      await refreshThread();
    }

    search.addEventListener("input", () => {
      state.search = search.value.trim();
      renderList();
    });

    try {
      await loadList();
      if (!state.active) return;
      if (!state.selected && state.conversations.length) state.selected = state.conversations[0].lead_id;
      renderList();
      context.clear(context.workspace);
      context.workspace.appendChild(shell);
      await refreshThread();
    } catch (error) {
      context.clear(context.workspace);
      context.workspace.appendChild(context.make("div", "empty-state", error.message));
      return;
    }

    // Realtime respeita o RLS: só chegam eventos de leads visíveis para a conta.
    if (!state.active) return;
    state.unsubscribe = context.api.subscribeWhatsapp((row) => {
      if (!state.active) return;
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(async () => {
        try {
          await loadList();
          if (!row.lead_id || row.lead_id === state.selected) await refreshThread();
        } catch (error) {
          context.toast(error.message, "error");
        }
      }, 400);
    });
  }

  window.CorexScreens.inbox = Object.freeze({ render });
})();
