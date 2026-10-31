(function () {
  "use strict";

  const WINDOW_MS = 24 * 3600000;
  const statusLabels = {
    pendente: "Enviando",
    enviada: "Enviada",
    entregue: "Entregue",
    lida: "Lida",
    falha: "Falha",
  };
  const mediaLabels = {
    image: "Imagem",
    document: "Documento",
    audio: "Áudio",
    video: "Vídeo",
    sticker: "Figurinha",
  };

  // Janela de atendimento: 24 horas desde a última mensagem recebida pelo webhook.
  function windowState(lastInboundAt, now) {
    if (!lastInboundAt) return { open: false, expiresAt: null };
    const start = new Date(lastInboundAt).getTime();
    if (Number.isNaN(start)) return { open: false, expiresAt: null };
    const expiresAt = new Date(start + WINDOW_MS);
    return { open: expiresAt.getTime() > (now ? new Date(now).getTime() : Date.now()), expiresAt };
  }

  function lastInboundAt(interactions) {
    return (interactions || [])
      .filter((item) => item.direction === "in" && item.wa_message_id)
      .reduce((latest, item) => (!latest || item.occurred_at > latest ? item.occurred_at : latest), null);
  }

  // Espelha corex_can_message_lead; o banco continua sendo a validação final.
  function canMessageLead(profile, lead) {
    if (!profile || !lead) return false;
    if (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_all_leads === true)) return true;
    if (lead.owner_id === profile.user_id) return true;
    return profile.role === "sdr" && !lead.owner_id && (lead.owner_role || "sdr") === "sdr";
  }

  function canManageBilling(profile) {
    return Boolean(profile && (profile.role === "founder" || profile.is_admin || (profile.permissions && profile.permissions.manage_billing === true)));
  }

  function rate(part, total) {
    const count = Number(total || 0);
    if (!count) return "0%";
    return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(Number(part || 0) / count);
  }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  // Situação do limite: normal, alerta de 80%, alerta de 90% ou bloqueado.
  function limitLevel(summary) {
    if (!summary) return { key: "normal", label: "Normal" };
    const spent = Number(summary.spent || 0);
    const limit = Number(summary.limit || 0);
    if (summary.blocked) return { key: "bloqueado", label: summary.manual_block ? "Bloqueado manualmente" : "Bloqueado: limite atingido" };
    const share = limit > 0 ? spent / limit : 0;
    const levels = (Array.isArray(summary.alert_levels) ? summary.alert_levels : [0.8, 0.9, 1])
      .map(Number)
      .filter((value) => value < 1)
      .sort((a, b) => b - a);
    const reached = levels.find((value) => share >= value);
    if (reached) return { key: "alerta", label: "Alerta de " + Math.round(reached * 100) + "%" };
    return { key: "normal", label: "Normal" };
  }

  function messageStatus(message) {
    if (!message) return "";
    if (message.origin === "celular") return "Enviada pelo celular";
    const label = statusLabels[message.status] || message.status;
    return message.status === "falha" && message.error_title ? label + ": " + message.error_title : label;
  }

  window.CorexWhatsapp = Object.freeze({
    statusLabels,
    mediaLabels,
    windowState,
    lastInboundAt,
    canMessageLead,
    canManageBilling,
    rate,
    money,
    limitLevel,
    messageStatus,
  });
})();
