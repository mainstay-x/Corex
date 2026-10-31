(function () {
  "use strict";

  const config = window.COREX_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Configuração pública do Supabase não encontrada.");
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Biblioteca do Supabase não carregada.");
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  function messageFrom(error, fallback) {
    if (!error) return fallback;
    if (error.context && error.context.error) return String(error.context.error);
    return error.message || fallback;
  }

  async function signIn(email, password) {
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error(messageFrom(result.error, "Não foi possível entrar."));
    return result.data;
  }

  async function signOut() {
    const result = await client.auth.signOut();
    if (result.error) throw new Error(messageFrom(result.error, "Não foi possível encerrar a sessão."));
  }

  async function getSession() {
    const result = await client.auth.getSession();
    if (result.error) throw new Error(messageFrom(result.error, "Não foi possível validar a sessão."));
    return result.data.session;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session || !session.user) return null;
    const result = await client
      .from("corex_profiles")
      .select("user_id, role, team_code, job_title, is_admin, permissions, active, display_name, whatsapp_phone, created_at")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (result.error) throw new Error(messageFrom(result.error, "Não foi possível carregar o perfil."));
    return result.data;
  }

  async function invokeAdmin(action, payload) {
    const result = await client.functions.invoke("corex-admin-users", {
      body: Object.assign({ action }, payload || {}),
    });

    if (result.error) {
      let detail = result.error.message;
      try {
        const response = result.error.context;
        if (response && typeof response.json === "function") {
          const body = await response.json();
          if (body && body.error) detail = body.error;
        }
      } catch (_ignored) {
        detail = result.error.message;
      }
      throw new Error(detail || "A operação administrativa falhou.");
    }

    if (result.data && result.data.error) throw new Error(String(result.data.error));
    return result.data;
  }

  function throwIfError(result, fallback) {
    if (result.error) throw new Error(messageFrom(result.error, fallback));
    return result.data;
  }

  async function getSdrCatalog() {
    const results = await Promise.all([
      client.from("corex_courses").select("id, title, kind, active").eq("active", true).order("title"),
      client.from("corex_classes").select("*").in("status", ["planejada", "aberta"]).order("start_date"),
      client.from("corex_business_holidays").select("holiday_date, name").order("holiday_date"),
      client.from("corex_settings").select("key, value").in("key", [
        "conversion_rate",
        "goal_margin_students",
        "briefing_hour",
        "gateway_pix_mdr",
        "gateway_pix_fixed_fee",
      ]),
      client.rpc("corex_list_active_closers"),
      client.from("corex_prices").select("course_id, pix_price, card_price, card_installments, valid_from").order("valid_from", { ascending: false }),
      client.from("corex_tiers").select("tier, min_trainings, discount_pix, discount_3x, discount_5x"),
    ]);
    return {
      courses: throwIfError(results[0], "Não foi possível carregar os cursos."),
      classes: throwIfError(results[1], "Não foi possível carregar as turmas."),
      holidays: throwIfError(results[2], "Não foi possível carregar os feriados."),
      settings: throwIfError(results[3], "Não foi possível carregar as configurações."),
      closers: throwIfError(results[4], "Não foi possível carregar os Closers."),
      prices: throwIfError(results[5], "Não foi possível carregar os preços."),
      tiers: throwIfError(results[6], "Não foi possível carregar os níveis."),
    };
  }

  async function listLeads() {
    const leadResult = await client.from("corex_leads").select("*").order("updated_at", { ascending: false });
    const leads = throwIfError(leadResult, "Não foi possível carregar os leads.") || [];
    const ids = leads.map((lead) => lead.id);
    if (!ids.length) return [];
    const [interestResult, followupResult, interactionResult, tierResult] = await Promise.all([
      client.from("corex_interests").select("*").in("lead_id", ids).order("priority"),
      client.from("corex_followups").select("*").in("lead_id", ids).eq("status", "aberto").order("due_at"),
      client.from("corex_interactions").select("lead_id, occurred_at, direction").in("lead_id", ids).order("occurred_at", { ascending: false }),
      client.from("corex_lead_tier").select("lead_id, trainings_count, tier").in("lead_id", ids),
    ]);
    const interests = throwIfError(interestResult, "Não foi possível carregar os interesses.") || [];
    const followups = throwIfError(followupResult, "Não foi possível carregar os retornos.") || [];
    const interactions = throwIfError(interactionResult, "Não foi possível carregar as interações.") || [];
    const tiers = throwIfError(tierResult, "Não foi possível carregar os níveis.") || [];
    return leads.map((lead) => ({
      ...lead,
      interests: interests.filter((item) => item.lead_id === lead.id),
      open_followups: followups.filter((item) => item.lead_id === lead.id),
      last_interaction: interactions.find((item) => item.lead_id === lead.id) || null,
      has_outbound_interaction: interactions.some((item) => item.lead_id === lead.id && item.direction === "out"),
      tier: tiers.find((item) => item.lead_id === lead.id) || { tier: "normal", trainings_count: 0 },
    }));
  }

  async function getLead(leadId) {
    const results = await Promise.all([
      client.from("corex_leads").select("*").eq("id", leadId).single(),
      client.from("corex_interests").select("*").eq("lead_id", leadId).order("priority"),
      client.from("corex_interactions").select("*").eq("lead_id", leadId).order("occurred_at", { ascending: false }),
      client.from("corex_followups").select("*").eq("lead_id", leadId).order("due_at", { ascending: false }),
      client.from("corex_objections").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      client.from("corex_lead_courses").select("*").eq("lead_id", leadId),
      client.from("corex_lead_tier").select("lead_id, trainings_count, tier").eq("lead_id", leadId).maybeSingle(),
      client.from("corex_offers").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      client.from("corex_payments_manual").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
    ]);
    return {
      lead: throwIfError(results[0], "Lead não encontrado."),
      interests: throwIfError(results[1], "Não foi possível carregar os interesses."),
      interactions: throwIfError(results[2], "Não foi possível carregar o histórico."),
      followups: throwIfError(results[3], "Não foi possível carregar os retornos."),
      objections: throwIfError(results[4], "Não foi possível carregar as objeções."),
      courses: throwIfError(results[5], "Não foi possível carregar os cursos feitos."),
      tier: throwIfError(results[6], "Não foi possível carregar o nível.") || { tier: "normal", trainings_count: 0 },
      offers: throwIfError(results[7], "Não foi possível carregar as ofertas."),
      payments: throwIfError(results[8], "Não foi possível carregar os pagamentos."),
    };
  }

  async function findDuplicateLead(phone, email) {
    if (phone) {
      const result = await client.from("corex_leads").select("id, name").eq("phone", phone).maybeSingle();
      if (result.error) throw new Error(messageFrom(result.error, "Não foi possível verificar o telefone."));
      if (result.data) return result.data;
    }
    if (email) {
      const result = await client.from("corex_leads").select("id, name").ilike("email", email).maybeSingle();
      if (result.error) throw new Error(messageFrom(result.error, "Não foi possível verificar o e-mail."));
      if (result.data) return result.data;
    }
    return null;
  }

  async function createLead(payload, interest, followups) {
    const result = await client.from("corex_leads").insert(payload).select("*").single();
    const lead = throwIfError(result, "Não foi possível criar o lead.");
    try {
      if (interest && interest.course_id) {
        throwIfError(await client.from("corex_interests").insert({ ...interest, lead_id: lead.id }), "Não foi possível salvar o interesse.");
      }
      if (followups && followups.length) {
        throwIfError(
          await client.from("corex_followups").insert(followups.map((item) => ({ ...item, lead_id: lead.id }))),
          "Não foi possível criar o retorno.",
        );
      }
      return lead;
    } catch (error) {
      throw new Error(error.message + " O lead foi criado; abra a ficha para concluir o cadastro.");
    }
  }

  async function updateLead(leadId, changes) {
    return throwIfError(await client.from("corex_leads").update(changes).eq("id", leadId).select("*").single(), "Não foi possível atualizar o lead.");
  }

  async function addInteraction(payload) {
    const interaction = throwIfError(await client.from("corex_interactions").insert(payload).select("*").single(), "Não foi possível registrar a interação.");
    if (payload.direction === "in") {
      throwIfError(
        await client.from("corex_followups").update({ status: "cancelado" }).eq("lead_id", payload.lead_id).eq("type", "sem_resposta").eq("status", "aberto"),
        "A interação foi salva, mas a sequência não pôde ser cancelada.",
      );
    }
    return interaction;
  }

  async function addFollowups(items) {
    return throwIfError(await client.from("corex_followups").insert(items).select("*"), "Não foi possível criar o retorno.");
  }

  async function updateFollowup(id, changes) {
    return throwIfError(await client.from("corex_followups").update(changes).eq("id", id).select("*").single(), "Não foi possível atualizar o retorno.");
  }

  async function addObjection(payload) {
    return throwIfError(await client.from("corex_objections").insert(payload).select("*").single(), "Não foi possível registrar a objeção.");
  }

  async function addCompletedCourse(payload) {
    return throwIfError(await client.from("corex_lead_courses").upsert(payload).select("*"), "Não foi possível registrar o curso feito.");
  }

  async function addInterest(payload) {
    return throwIfError(await client.from("corex_interests").insert(payload).select("*").single(), "Não foi possível registrar o interesse.");
  }

  async function handoffToCloser(leadId, closerId, note) {
    return throwIfError(await client.rpc("corex_handoff_to_closer", { p_lead: leadId, p_closer: closerId, p_note: note || null }), "Não foi possível passar o lead ao Closer.");
  }

  async function createOffer(payload) {
    return throwIfError(await client.rpc("corex_create_offer", {
      p_lead: payload.leadId,
      p_course: payload.courseId,
      p_class: payload.classId,
      p_method: payload.method,
      p_valid_until: payload.validUntil,
    }), "Não foi possível criar a oferta.");
  }

  async function markOfferSent(offerId) {
    return throwIfError(await client.rpc("corex_mark_offer_sent", { p_offer: offerId }), "Não foi possível registrar o envio.");
  }

  async function acceptOffer(offerId, paymentDueDate) {
    return throwIfError(await client.rpc("corex_accept_offer", {
      p_offer: offerId,
      p_payment_due_date: paymentDueDate,
    }), "Não foi possível registrar o aceite.");
  }

  async function recordPaymentReceipt(paymentId, note) {
    return throwIfError(await client.rpc("corex_record_payment_receipt", {
      p_payment: paymentId,
      p_note: note || null,
    }), "Não foi possível registrar o comprovante.");
  }

  async function confirmPayment(paymentId, note) {
    return throwIfError(await client.rpc("corex_confirm_payment", {
      p_payment: paymentId,
      p_note: note || null,
    }), "Não foi possível confirmar o pagamento.");
  }

  async function listPayments() {
    const paymentResult = await client.from("corex_payments_manual").select("*").order("payment_due_date", { ascending: true });
    const payments = throwIfError(paymentResult, "Não foi possível carregar os pagamentos.") || [];
    if (!payments.length) return [];
    const leadIds = [...new Set(payments.map((item) => item.lead_id))];
    const offerIds = [...new Set(payments.map((item) => item.offer_id))];
    const [leadResult, offerResult] = await Promise.all([
      client.from("corex_leads").select("id, name, email, phone, stage").in("id", leadIds),
      client.from("corex_offers").select("*").in("id", offerIds),
    ]);
    const leads = throwIfError(leadResult, "Não foi possível carregar os leads dos pagamentos.") || [];
    const offers = throwIfError(offerResult, "Não foi possível carregar as ofertas dos pagamentos.") || [];
    return payments.map((payment) => ({
      ...payment,
      lead: leads.find((lead) => lead.id === payment.lead_id) || null,
      offer: offers.find((offer) => offer.id === payment.offer_id) || null,
    }));
  }

  async function getGoalMetrics() {
    return throwIfError(await client.rpc("corex_goal_metrics"), "Não foi possível calcular as metas.");
  }

  function onAuthStateChange(callback) {
    return client.auth.onAuthStateChange(callback);
  }

  window.CorexApi = Object.freeze({
    signIn,
    signOut,
    getSession,
    getCurrentProfile,
    listUsers: () => invokeAdmin("list"),
    createUser: (payload) => invokeAdmin("create", payload),
    updateUser: (payload) => invokeAdmin("update", payload),
    resetUserPassword: (payload) => invokeAdmin("reset_password", payload),
    getSdrCatalog,
    listLeads,
    getLead,
    findDuplicateLead,
    createLead,
    updateLead,
    addInteraction,
    addFollowups,
    updateFollowup,
    addObjection,
    addCompletedCourse,
    addInterest,
    handoffToCloser,
    createOffer,
    markOfferSent,
    acceptOffer,
    recordPaymentReceipt,
    confirmPayment,
    listPayments,
    getGoalMetrics,
    onAuthStateChange,
  });
})();
