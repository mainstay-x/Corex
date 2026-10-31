(function () {
  "use strict";
  window.CorexScreens = window.CorexScreens || {};

  function usefulDaysUntil(dateValue, holidays) {
    if (!dateValue) return 0;
    const holidaySet = new Set(holidays.map((item) => item.holiday_date)); let count = 0;
    const current = new Date(); current.setHours(12, 0, 0, 0); const end = new Date(dateValue + "T12:00:00");
    while (current <= end) { const day = current.getDay(); const key = current.toISOString().slice(0, 10); if (day !== 0 && day !== 6 && !holidaySet.has(key)) count += 1; current.setDate(current.getDate() + 1); }
    return count;
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function calculateNetGoldPix(pixPrice, discount, mdr, fixedFee) {
    const goldPixPrice = roundMoney(Number(pixPrice) * (1 - Number(discount)));
    if (!goldPixPrice) return 0;
    const pixFee = roundMoney(goldPixPrice * Number(mdr)) + Number(fixedFee);
    return roundMoney(goldPixPrice - pixFee);
  }

  function calculateBreakEven(costs, netRevenue) {
    return Number(netRevenue) > 0 ? Math.ceil(Number(costs) / Number(netRevenue)) : 0;
  }

  async function getRows(api) {
    const ui = window.CorexSdr; const [catalog, metrics] = await Promise.all([ui.store.getCatalog(api, true), api.getGoalMetrics()]);
    const settings = Object.fromEntries(catalog.settings.map((item) => [item.key, Number(item.value)])); const rate = settings.conversion_rate || 0.1;
    const goldTier = catalog.tiers.find((item) => item.tier === "ouro") || { discount_pix: 0.15 };
    const pixMdr = settings.gateway_pix_mdr || 0.0119;
    const pixFixedFee = settings.gateway_pix_fixed_fee || 0.55;
    return catalog.classes.filter((item) => item.status === "aberta").map((klass) => {
      const price = catalog.prices.find((item) => item.course_id === klass.course_id);
      const netRevenue = price ? calculateNetGoldPix(price.pix_price, goldTier.discount_pix, pixMdr, pixFixedFee) : 0;
      const costs = Number(klass.fixed_cost_allocated || 0) + Number(klass.instructor_hours || 0) * Number(klass.instructor_hour_rate || 0);
      const breakEven = calculateBreakEven(costs, netRevenue); const margin = Number(klass.goal_margin_students || settings.goal_margin_students || 2);
      const studentsNeeded = breakEven + margin; const goalQualified = Math.ceil(studentsNeeded / rate); const metric = metrics.find((item) => item.class_id === klass.id) || { qualified_count: 0, paid_count: 0 };
      const remaining = Math.max(0, goalQualified - Number(metric.qualified_count)); const days = usefulDaysUntil(klass.close_date, catalog.holidays); const daily = days > 0 ? Math.ceil(remaining / days) : remaining;
      return { klass, course: ui.courseName(catalog, klass.course_id), breakEven, margin, studentsNeeded, goalQualified, qualified: Number(metric.qualified_count), paid: Number(metric.paid_count), remaining, days, daily, weekly: Math.min(remaining, daily * 5), netRevenue };
    });
  }

  async function render(context) {
    context.clear(context.workspace); context.workspace.appendChild(context.make("div", "loading-state", "Calculando metas..."));
    try {
      const rows = await getRows(context.api); context.clear(context.workspace); const intro = context.make("div", "screen-toolbar-copy"); intro.append(context.make("h2", "", "Metas por turma"), context.make("p", "", "Cálculo baseado no ponto de equilíbrio, margem e conversão configurada.")); context.workspace.appendChild(intro);
      const grid = context.make("div", "goal-grid");
      rows.forEach((row) => { const card = context.make("article", "surface-card goal-card"); card.append(context.make("p", "eyebrow", row.course), context.make("h3", "", row.klass.name), context.make("p", "", "Período comercial: " + (row.klass.sales_open_date || "não definido") + " a " + (row.klass.close_date || "não definido"))); const stats = context.make("div", "metric-grid"); [["Equilíbrio", row.breakEven], ["Margem", row.margin], ["Alunos necessários", row.studentsNeeded], ["Alunos pagos", row.paid], ["Qualificados necessários", row.goalQualified], ["Qualificados no período", row.qualified], ["Meta de hoje", row.daily], ["Meta da semana", row.weekly]].forEach(([label, value]) => { const metric = context.make("div", "metric"); metric.append(context.make("span", "", label), context.make("b", "", String(value))); stats.appendChild(metric); }); card.appendChild(stats); if (!row.days && row.remaining) card.appendChild(context.make("span", "badge warning", "Prazo encerrado")); grid.appendChild(card); });
      if (!rows.length) grid.appendChild(context.make("div", "empty-state", "Nenhuma turma aberta.")); context.workspace.appendChild(grid);
    } catch (error) { context.clear(context.workspace); context.workspace.appendChild(context.make("div", "empty-state", error.message)); }
  }
  window.CorexScreens.goals = Object.freeze({ render, getRows, calculateNetGoldPix, calculateBreakEven });
})();
