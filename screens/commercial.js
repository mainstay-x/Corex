(function () {
  "use strict";

  function canManageAll(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_all_leads === true)));
  }

  function canManageBilling(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_billing === true)));
  }

  function canCloseLead(profile, lead) {
    return canManageAll(profile) || Boolean(profile && profile.role === "closer" && lead.owner_role === "closer" && lead.owner_id === profile.user_id);
  }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function calculateOfferPrice(catalog, courseId, tier, method) {
    const prices = (catalog.prices || []).filter((item) => item.course_id === courseId);
    const price = prices[0];
    const level = (catalog.tiers || []).find((item) => item.tier === tier);
    if (!price || !level) return null;
    const base = method === "pix" ? Number(price.pix_price) : Number(price.card_price);
    const discount = Number(method === "pix" ? level.discount_pix : method === "3x" ? level.discount_3x : level.discount_5x);
    return Math.round(base * (1 - discount) * 100) / 100;
  }

  function createOfferForm(context, data, catalog, reload) {
    const ui = window.CorexSdr;
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Oferta pela tabela vigente"));
    const course = ui.select("offer-course", catalog.courses.map((item) => ({ value: item.id, label: item.title })), data.interests[0] ? data.interests[0].course_id : "", true);
    const klass = ui.select("offer-class", [], "", true);
    const method = ui.select("offer-method", [
      { value: "pix", label: "Pix" },
      { value: "3x", label: "Cartão em 3x" },
      { value: "5x", label: "Cartão em 5x" },
    ], "pix");
    const validUntil = ui.input("offer-valid-until", "datetime-local", ui.localInputValue(ui.addDays(new Date(), 7)), true);
    course.required = true;
    klass.required = true;
    const preview = context.make("p", "form-hint", "Selecione curso, turma e forma de pagamento.");

    function refreshClasses() {
      while (klass.firstChild) klass.removeChild(klass.firstChild);
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Selecione";
      klass.appendChild(empty);
      catalog.classes.filter((item) => item.course_id === course.value).forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        klass.appendChild(option);
      });
      const preferred = data.interests.find((item) => item.course_id === course.value && item.class_id);
      if (preferred) klass.value = preferred.class_id;
      refreshPreview();
    }
    function refreshPreview() {
      const price = calculateOfferPrice(catalog, course.value, data.tier.tier || "normal", method.value);
      preview.textContent = price === null
        ? "Preço vigente não encontrado."
        : "Nível " + String(data.tier.tier || "normal").replaceAll("_", " ") + " · valor " + money(price);
    }
    course.addEventListener("change", refreshClasses);
    method.addEventListener("change", refreshPreview);
    ui.field(context, section, "Curso", course);
    ui.field(context, section, "Turma", klass);
    ui.field(context, section, "Forma de pagamento", method);
    ui.field(context, section, "Validade", validUntil);
    section.appendChild(preview);
    refreshClasses();
    const save = context.make("button", "button button-primary", "Criar oferta");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        await context.api.createOffer({
          leadId: data.lead.id,
          courseId: course.value,
          classId: klass.value,
          method: method.value,
          validUntil: new Date(validUntil.value).toISOString(),
        });
        context.closePanel();
        window.CorexSdr.store.invalidateLeads();
        context.toast("Oferta criada pela tabela vigente.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  function acceptOfferForm(context, offer, reload) {
    const ui = window.CorexSdr;
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Pagamento combinado"));
    section.appendChild(context.make("p", "", money(offer.price) + " · " + offer.payment_method));
    const date = ui.input("payment-due-date", "date", "", true);
    ui.field(context, section, "Data combinada", date);
    const save = context.make("button", "button button-primary", "Registrar aceite");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        await context.api.acceptOffer(offer.id, date.value);
        context.closePanel();
        ui.store.invalidateLeads();
        context.toast("Aceite e retornos de pagamento registrados.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  function receiptForm(context, payment, reload) {
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Registrar comprovante"));
    const note = document.createElement("textarea");
    note.id = "payment-receipt-note";
    window.CorexSdr.field(context, section, "Observação", note);
    const save = context.make("button", "button button-primary", "Registrar recebimento");
    save.type = "submit";
    form.append(section, save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await context.api.recordPaymentReceipt(payment.id, note.value.trim() || null);
        context.closePanel();
        context.toast("Comprovante registrado.", "success");
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  function confirmationForm(context, payment, reload) {
    const form = context.make("form", "panel-form");
    const section = context.make("section", "form-section");
    section.appendChild(context.make("h3", "", "Confirmar pagamento"));
    const note = document.createElement("textarea");
    note.id = "payment-financial-note";
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
        await reload();
      } catch (error) {
        context.toast(error.message, "error");
        save.disabled = false;
      }
    });
    return form;
  }

  function render(context, data, catalog, reload) {
    const ui = window.CorexSdr;
    const host = context.make("div", "stack-list");
    if (canCloseLead(context.currentProfile, data.lead)) {
      const create = context.make("button", "button button-primary", "Nova oferta");
      create.type = "button";
      create.addEventListener("click", () => context.openPanel("Nova oferta", createOfferForm(context, data, catalog, reload)));
      host.appendChild(create);
    }

    const offers = context.make("section", "surface-card");
    offers.appendChild(context.make("h3", "", "Ofertas"));
    if (!data.offers.length) offers.appendChild(context.make("p", "", "Nenhuma oferta registrada."));
    data.offers.forEach((offer) => {
      const card = context.make("article", "compact-card");
      card.append(
        context.make("span", "badge", offer.status),
        context.make("h3", "", money(offer.price) + " · " + offer.payment_method),
        context.make("p", "", ui.courseName(catalog, offer.course_id) + " · válido até " + ui.formatDate(offer.valid_until, true)),
      );
      if (offer.status === "enviada" && canCloseLead(context.currentProfile, data.lead)) {
        if (!offer.sent_at) {
          const sent = context.make("button", "table-action", "Registrar link enviado");
          sent.type = "button";
          sent.addEventListener("click", async () => {
            try {
              await context.api.markOfferSent(offer.id);
              ui.store.invalidateLeads();
              await reload();
            } catch (error) {
              context.toast(error.message, "error");
            }
          });
          card.appendChild(sent);
        }
        const accept = context.make("button", "table-action", "Registrar aceite");
        accept.type = "button";
        accept.addEventListener("click", () => context.openPanel("Registrar aceite", acceptOfferForm(context, offer, reload)));
        card.appendChild(accept);
      }
      offers.appendChild(card);
    });
    host.appendChild(offers);

    const payments = context.make("section", "surface-card");
    payments.appendChild(context.make("h3", "", "Pagamentos"));
    if (!data.payments.length) payments.appendChild(context.make("p", "", "Nenhum pagamento registrado."));
    data.payments.forEach((payment) => {
      const card = context.make("article", "compact-card");
      card.append(
        context.make("span", "badge", payment.status.replaceAll("_", " ")),
        context.make("h3", "", money(payment.amount) + " · " + payment.method),
        context.make("p", "", "Data combinada: " + ui.formatDateOnly(payment.payment_due_date)),
      );
      if (payment.receipt_received_at) card.appendChild(context.make("p", "", "Comprovante recebido em " + ui.formatDate(payment.receipt_received_at, true)));
      if (payment.status === "pendente" && canCloseLead(context.currentProfile, data.lead)) {
        const receipt = context.make("button", "table-action", "Comprovante recebido");
        receipt.type = "button";
        receipt.addEventListener("click", () => context.openPanel("Registrar comprovante", receiptForm(context, payment, reload)));
        card.appendChild(receipt);
      }
      if (payment.status === "comprovante_recebido" && canManageBilling(context.currentProfile)) {
        const confirm = context.make("button", "table-action", "Confirmar pagamento");
        confirm.type = "button";
        confirm.addEventListener("click", () => context.openPanel("Confirmar pagamento", confirmationForm(context, payment, reload)));
        card.appendChild(confirm);
      }
      payments.appendChild(card);
    });
    host.appendChild(payments);
    return host;
  }

  window.CorexCommerce = Object.freeze({ render, calculateOfferPrice, canManageBilling, canCloseLead });
})();
