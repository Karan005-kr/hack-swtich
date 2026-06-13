/* ============================================================
   FINZEN — DUAL MODE STUDENT FINANCE APP
   app.js v3.0  —  Personal + Group Modes
   ============================================================ */
"use strict";

/* ═══════════════════════════════════════════════════════════════
   SECTION 1 ▸ CONSTANTS & STATE
═══════════════════════════════════════════════════════════════ */
const RATES_TO_INR = {
  INR:1, USD:83.5, EUR:90.2, GBP:105.8, JPY:0.56,
  AUD:54.1, CAD:61.3, SGD:62.4, AED:22.7
};
const SYM = { INR:"₹", USD:"$", EUR:"€", GBP:"£", JPY:"¥", AUD:"A$", CAD:"C$", SGD:"S$", AED:"د.إ" };

const CAT_EMOJI = {
  Food:"🍽️", Transport:"🚌", Accommodation:"🏨", Entertainment:"🎬",
  Shopping:"🛍️", Utilities:"💡", Medical:"💊", Savings:"🏦",
  Education:"📚", Other:"📦"
};

const CHART_COLORS = ["#7DF9C2","#38bdf8","#a78bfa","#fbbf24","#fb7185","#34d399","#f97316","#c084fc","#4ade80","#60a5fa"];

const STORAGE = {
  mode: "fz_mode",
  currency: "fz_currency",
  personal: "fz_personal_v1",
  budgets: "fz_budgets_v1",
  pFilter: "fz_pfilter",
  members: "fz_members_v1",
  gExpenses: "fz_gexpenses_v1",
  gFilter: "fz_gfilter"
};

let STATE = {
  mode: "personal",            // "personal" | "group"
  currency: "INR",
  // Personal
  personal: [],                // [{id, amount, currency, desc, category, date, recurring}]
  budgets: {},                 // { Food:5000, Transport:2000, … }
  pFilter: "month",            // "week" | "month" | "all"
  // Group
  members: [],                 // [{id, name}]
  gExpenses: [],               // [{id, payerId, payerName, amount, currency, desc, category, split, date}]
  gFilter: "month"
};

// Chart instances
let pPieChart = null, pLineChart = null, gPieChart = null, gBarChart = null;

/* ═══════════════════════════════════════════════════════════════
   SECTION 2 ▸ INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  setDefaultDate();
  bindEvents();
  renderAll();
});

function setDefaultDate() {
  const d = document.getElementById("pExpDate");
  if (d) d.value = new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 3 ▸ PERSISTENCE
═══════════════════════════════════════════════════════════════ */
function saveState() {
  try {
    ls(STORAGE.mode, STATE.mode);
    ls(STORAGE.currency, STATE.currency);
    ls(STORAGE.personal, JSON.stringify(STATE.personal));
    ls(STORAGE.budgets, JSON.stringify(STATE.budgets));
    ls(STORAGE.pFilter, STATE.pFilter);
    ls(STORAGE.members, JSON.stringify(STATE.members));
    ls(STORAGE.gExpenses, JSON.stringify(STATE.gExpenses));
    ls(STORAGE.gFilter, STATE.gFilter);
  } catch(e) { console.warn("Storage:", e); }
}

function loadState() {
  try {
    STATE.mode     = lsg(STORAGE.mode) || "personal";
    STATE.currency = lsg(STORAGE.currency) || "INR";
    STATE.personal = JSON.parse(lsg(STORAGE.personal) || "[]").filter(e => e?.id && e?.amount > 0);
    STATE.budgets  = JSON.parse(lsg(STORAGE.budgets)  || "{}");
    STATE.pFilter  = lsg(STORAGE.pFilter) || "month";
    STATE.members  = JSON.parse(lsg(STORAGE.members)  || "[]").filter(m => m?.id && m?.name);
    STATE.gExpenses= JSON.parse(lsg(STORAGE.gExpenses)|| "[]").filter(e => e?.id && e?.amount > 0);
    STATE.gFilter  = lsg(STORAGE.gFilter) || "month";

    // Backfill
    STATE.personal.forEach(e => { if(!e.currency) e.currency="INR"; });
    STATE.gExpenses.forEach(e => { if(!e.currency) e.currency="INR"; if(!e.split) e.split="equal"; });
  } catch(e) {
    STATE.personal = []; STATE.budgets = {}; STATE.members = []; STATE.gExpenses = [];
  }
}

const ls  = (k, v) => localStorage.setItem(k, v);
const lsg = (k)    => localStorage.getItem(k);

/* ═══════════════════════════════════════════════════════════════
   SECTION 4 ▸ EVENTS
═══════════════════════════════════════════════════════════════ */
function bindEvents() {
  // Mode switching
  $("btnPersonalMode").addEventListener("click", () => switchMode("personal"));
  $("btnGroupMode").addEventListener("click", () => switchMode("group"));

  // Currency
  $("currencySelect").value = STATE.currency;
  $("currencySelect").addEventListener("change", e => {
    STATE.currency = e.target.value;
    saveState();
    $("footerCurrency").textContent = SYM[STATE.currency] + " " + STATE.currency;
    renderAll();
    toast(`Currency: ${STATE.currency} ${SYM[STATE.currency]}`, "info");
  });

  // Reset
  $("btnReset").addEventListener("click", handleReset);

  // ─── PERSONAL ────────────────────────────────────────────
  $("btnAddPersonal").addEventListener("click", handleAddPersonal);
  $("pExpDesc").addEventListener("keydown", e => { if(e.key==="Enter") handleAddPersonal(); });
  $("btnSaveBudgets").addEventListener("click", saveBudgets);
  $("btnPersonalCSV").addEventListener("click", exportPersonalCSV);

  // Personal filter buttons
  document.querySelectorAll("[data-pfilter]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.pFilter = btn.dataset.pfilter;
      saveState();
      document.querySelectorAll("[data-pfilter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderPersonalCharts();
      renderPersonalReport();
    });
  });

  // ─── GROUP ───────────────────────────────────────────────
  $("btnAddMember").addEventListener("click", handleAddMember);
  $("gMemberName").addEventListener("keydown", e => { if(e.key==="Enter") handleAddMember(); });
  $("btnAddGroupExpense").addEventListener("click", handleAddGroupExpense);
  $("btnSettle").addEventListener("click", handleSettle);

  // Group filter buttons
  document.querySelectorAll("[data-gfilter]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.gFilter = btn.dataset.gfilter;
      saveState();
      document.querySelectorAll("[data-gfilter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGroupReport();
    });
  });

  $("btnGroupCSV").addEventListener("click", exportGroupCSV);
  $("btnGroupPDF").addEventListener("click", exportGroupPDF);
  $("btnScanQR").addEventListener("click", handleScanQR);
  $("btnUploadBill").addEventListener("click", () => $("billFileInput").click());
  $("billFileInput").addEventListener("change", handleUploadBill);
  $("btnUPI").addEventListener("click", handleUPI);

  // Modal
  $("modalClose").addEventListener("click", closeModal);
  $("modalCloseX").addEventListener("click", closeModal);
  $("modalOverlay").addEventListener("click", e => { if(e.target===$("modalOverlay")) closeModal(); });
  document.addEventListener("keydown", e => { if(e.key==="Escape" && !$("modalOverlay").hasAttribute("hidden")) closeModal(); });
}

function switchMode(mode) {
  STATE.mode = mode;
  saveState();

  const isGroup = mode === "group";
  $("btnPersonalMode").classList.toggle("active", !isGroup);
  $("btnGroupMode").classList.toggle("active", isGroup);
  $("modeSlider").classList.toggle("to-group", isGroup);
  $("personalMode").hidden = isGroup;
  $("groupMode").hidden = !isGroup;

  // Label bar
  document.querySelector(".mode-label-text .personal-only").hidden = isGroup;
  document.querySelector(".mode-label-text .group-only").hidden = !isGroup;

  renderAll();
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 5 ▸ RENDER ALL
═══════════════════════════════════════════════════════════════ */
function renderAll() {
  // Sync mode UI
  const isGroup = STATE.mode === "group";
  $("btnPersonalMode").classList.toggle("active", !isGroup);
  $("btnGroupMode").classList.toggle("active", isGroup);
  $("modeSlider").classList.toggle("to-group", isGroup);
  $("personalMode").hidden = isGroup;
  $("groupMode").hidden = !isGroup;
  document.querySelector(".mode-label-text .personal-only").hidden = isGroup;
  document.querySelector(".mode-label-text .group-only").hidden = !isGroup;
  $("currencySelect").value = STATE.currency;
  $("footerCurrency").textContent = SYM[STATE.currency] + " " + STATE.currency;

  // Sync personal filter buttons
  document.querySelectorAll("[data-pfilter]").forEach(b => {
    b.classList.toggle("active", b.dataset.pfilter === STATE.pFilter);
  });
  document.querySelectorAll("[data-gfilter]").forEach(b => {
    b.classList.toggle("active", b.dataset.gfilter === STATE.gFilter);
  });

  renderPersonalDashboard();
  renderBudgetInputs();
  renderBudgetProgress();
  renderPersonalExpenseList();
  renderPersonalCharts();
  renderPersonalReport();
  renderPersonalInsights();

  renderGroupDashboard();
  renderMemberList();
  renderPayerDropdown();
  renderGroupExpenseList();
  renderGroupCharts();
  renderGroupReport();
  renderGroupWallet();
  renderSettleMeta();
  renderGroupInsights();
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 6 ▸ PERSONAL — ADD EXPENSE
═══════════════════════════════════════════════════════════════ */
function handleAddPersonal() {
  const amount   = parseFloat($("pExpAmount").value);
  const currency = $("pExpCurrency").value;
  const category = $("pExpCategory").value;
  const desc     = $("pExpDesc").value.trim();
  const date     = $("pExpDate").value;
  const recurring= $("pExpRecurring").value;

  if(!amount || amount <= 0) { toast("Enter a valid amount.", "error"); $("pExpAmount").focus(); return; }
  if(!desc) { toast("Enter a description.", "error"); $("pExpDesc").focus(); return; }
  if(!date) { toast("Select a date.", "error"); return; }

  STATE.personal.push({ id: uid(), amount: round2(amount), currency, desc, category, date, recurring });
  saveState();
  $("pExpAmount").value = "";
  $("pExpDesc").value = "";
  $("pExpAmount").focus();
  renderAll();
  toast(`Added: ${fmt(cvt(amount, currency))} — "${esc(desc)}" 💸`, "success");
}

function deletePersonal(id) {
  const e = STATE.personal.find(x => x.id === id);
  if(!e || !confirm(`Delete "${e.desc}"?`)) return;
  STATE.personal = STATE.personal.filter(x => x.id !== id);
  saveState();
  renderAll();
  toast("Expense deleted.", "info");
}
window.deletePersonal = deletePersonal;

/* ═══════════════════════════════════════════════════════════════
   SECTION 7 ▸ PERSONAL — BUDGET
═══════════════════════════════════════════════════════════════ */
const PERSONAL_CATS = ["Food","Transport","Education","Entertainment","Shopping","Utilities","Medical","Savings","Other"];

function renderBudgetInputs() {
  const grid = $("budgetCatsGrid");
  grid.innerHTML = PERSONAL_CATS.map(cat => `
    <div class="budget-cat-field">
      <div class="budget-cat-lbl">${CAT_EMOJI[cat]||"📦"} ${cat}</div>
      <input type="number" class="budget-cat-input" data-cat="${esc(cat)}"
        placeholder="0" min="0" step="1"
        value="${STATE.budgets[cat] ? cvt(STATE.budgets[cat], "INR").toFixed(0) : ""}"
        aria-label="${esc(cat)} budget" />
    </div>
  `).join("");

  // update total on change
  grid.querySelectorAll(".budget-cat-input").forEach(inp => {
    inp.addEventListener("input", updateBudgetTotal);
  });
  updateBudgetTotal();
}

function updateBudgetTotal() {
  let total = 0;
  document.querySelectorAll(".budget-cat-input").forEach(inp => {
    total += parseFloat(inp.value) || 0;
  });
  $("budgetTotalLabel").textContent = total > 0 ? fmt(total) : "—";
}

function saveBudgets() {
  document.querySelectorAll(".budget-cat-input").forEach(inp => {
    const cat = inp.dataset.cat;
    const val = parseFloat(inp.value) || 0;
    // Store in display currency converted to INR
    STATE.budgets[cat] = val > 0 ? val * (RATES_TO_INR[STATE.currency] || 1) : 0;
  });
  saveState();
  renderBudgetProgress();
  renderPersonalInsights();
  toast("Budgets saved! 🎯", "success");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 8 ▸ PERSONAL — DASHBOARD & REPORT
═══════════════════════════════════════════════════════════════ */
function getFilteredPersonal(filter) {
  if(filter==="all") return STATE.personal;
  const cutoff = filter==="week" ? weekStart() : monthStart();
  return STATE.personal.filter(e => new Date(e.date) >= cutoff);
}

function renderPersonalDashboard() {
  const filtered = getFilteredPersonal("month");
  const total    = filtered.reduce((s,e) => s + cvt(e.amount, e.currency), 0);
  const count    = filtered.length;
  const days     = daysInMonth();
  const daily    = count > 0 ? total / days : 0;

  // Budget
  const totalBudgetINR = Object.values(STATE.budgets).reduce((s,v) => s+v, 0);
  const totalBudget    = totalBudgetINR / (RATES_TO_INR[STATE.currency]||1);
  const remaining      = totalBudget > 0 ? totalBudget - total : null;
  const budgetPct      = totalBudget > 0 ? Math.min((total/totalBudget)*100, 100) : 0;

  $("pStatSpent").textContent   = count > 0 ? fmt(total) : "—";
  $("pStatBudget").textContent  = totalBudget > 0 ? fmt(totalBudget) : "Not set";
  $("pStatSaved").textContent   = remaining !== null ? (remaining >= 0 ? fmt(remaining) : "Over by "+fmt(-remaining)) : "—";
  $("pStatDaily").textContent   = count > 0 ? fmt(daily)+"/day" : "—";

  const bar = $("pBudgetBar");
  if(bar) { bar.style.width = budgetPct + "%"; }

  $("personalDateRange").textContent = "This Month · " + new Date().toLocaleString("en-IN", {month:"long", year:"numeric"});
}

function renderPersonalReport() {
  // just re-renders charts (filter already applied there)
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 9 ▸ PERSONAL — BUDGET PROGRESS
═══════════════════════════════════════════════════════════════ */
function renderBudgetProgress() {
  const list = $("budgetProgressList");
  const monthExp = getFilteredPersonal("month");

  const catSpend = {};
  monthExp.forEach(e => { catSpend[e.category] = (catSpend[e.category]||0) + cvt(e.amount, e.currency); });

  const hasBudget = Object.entries(STATE.budgets).some(([,v]) => v > 0);
  if(!hasBudget && Object.keys(catSpend).length === 0) {
    list.innerHTML = '<p class="empty-hint">Set category budgets above and add expenses to see progress.</p>';
    return;
  }

  const pills = [];
  const allCats = new Set([...Object.keys(STATE.budgets).filter(k=>STATE.budgets[k]>0), ...Object.keys(catSpend)]);

  let overCount = 0;
  allCats.forEach(cat => {
    const budgetINR = STATE.budgets[cat] || 0;
    const budget    = budgetINR / (RATES_TO_INR[STATE.currency]||1);
    const spent     = catSpend[cat] || 0;
    const pct       = budget > 0 ? Math.min((spent/budget)*100, 100) : (spent > 0 ? 100 : 0);
    const cls       = !budget ? "ok" : pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
    if(cls==="over") overCount++;

    pills.push(`
      <div class="budget-progress-item">
        <div class="bpi-header">
          <div class="bpi-label">
            <span class="bpi-emoji">${CAT_EMOJI[cat]||"📦"}</span>
            <span>${esc(cat)}</span>
          </div>
          <span class="bpi-amounts">${fmt(spent)} ${budget>0 ? "/ "+fmt(budget) : ""}</span>
          <span class="bpi-pct ${cls}">${budget>0 ? pct.toFixed(0)+"%" : "No limit"}</span>
        </div>
        <div class="bpi-track">
          <div class="bpi-fill ${cls}" style="width:${pct.toFixed(1)}%"></div>
        </div>
      </div>
    `);
  });

  list.innerHTML = pills.join("") || '<p class="empty-hint">No budget data yet.</p>';

  // Status pill
  const pill = $("pBudgetStatusPill");
  if(pill) {
    pill.textContent = overCount > 0 ? `⚠️ ${overCount} category over budget` : "✅ All within budget";
    pill.style.background = overCount > 0 ? "rgba(251,113,133,.15)" : "rgba(125,249,194,.15)";
    pill.style.borderColor= overCount > 0 ? "rgba(251,113,133,.3)"  : "rgba(125,249,194,.3)";
    pill.style.color      = overCount > 0 ? "#fb7185"               : "#34d399";
  }
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 10 ▸ PERSONAL — EXPENSE LIST
═══════════════════════════════════════════════════════════════ */
function renderPersonalExpenseList() {
  const list  = $("pExpList");
  const count = STATE.personal.length;
  $("pExpCountLabel").textContent = `${count} transaction${count!==1?"s":""}`;

  if(count===0) { list.innerHTML = '<li class="empty-hint-li">No expenses yet. Add one above.</li>'; return; }

  const sorted = [...STATE.personal].sort((a,b) => new Date(b.date)-new Date(a.date));
  list.innerHTML = sorted.map(e => {
    const disp     = cvt(e.amount, e.currency);
    const showOrig = e.currency !== STATE.currency;
    return `
      <li class="exp-item">
        <div class="exp-cat-ico">${CAT_EMOJI[e.category]||"📦"}</div>
        <div class="exp-info">
          <div class="exp-desc" title="${esc(e.desc)}">${esc(e.desc)}</div>
          <div class="exp-meta">
            <span>${fmtDate(e.date)}</span>
            <span class="exp-cat-tag">${esc(e.category)}</span>
            <span class="exp-cur-tag">${esc(e.currency)}</span>
            ${e.recurring==="yes" ? '<span class="exp-recur-tag">🔄 Monthly</span>' : ""}
          </div>
        </div>
        <div class="exp-amount-col">
          <div class="exp-amount">${fmt(disp)}</div>
          ${showOrig ? `<div class="exp-amount-orig">${SYM[e.currency]||""}${e.amount.toFixed(2)}</div>` : ""}
        </div>
        <button class="btn-del" onclick="deletePersonal('${e.id}')" aria-label="Delete ${esc(e.desc)}">🗑</button>
      </li>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 11 ▸ PERSONAL — CHARTS
═══════════════════════════════════════════════════════════════ */
function renderPersonalCharts() {
  renderPPersonalPie();
  renderPPersonalLine();
}

function renderPPersonalPie() {
  const ctx = document.getElementById("pPieChart");
  if(!ctx) return;

  const filtered = getFilteredPersonal(STATE.pFilter);
  const catTotals = {};
  filtered.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + cvt(e.amount, e.currency); });

  const labels = Object.keys(catTotals);
  const data   = Object.values(catTotals);

  if(pPieChart) { pPieChart.destroy(); pPieChart=null; }
  const ph = $("pPiePlaceholder");
  if(ph) ph.classList.toggle("hidden", labels.length>0);
  if(!labels.length) return;

  pPieChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0,labels.length), borderColor:"rgba(7,9,15,.8)", borderWidth:2, hoverOffset:8 }] },
    options: {
      responsive:true, maintainAspectRatio:true, cutout:"62%",
      plugins: {
        legend: { position:"bottom", labels:{ color:"#94a3b8", font:{family:"'Space Grotesk',sans-serif",size:11}, padding:10, boxWidth:10, boxHeight:10, usePointStyle:true } },
        tooltip: tooltipCfg("pie")
      },
      animation:{ animateRotate:true, duration:600 }
    }
  });
}

function renderPPersonalLine() {
  const ctx = document.getElementById("pLineChart");
  if(!ctx) return;

  // Last 8 weeks
  const weeks = [];
  const weekTotals = [];
  const now = new Date();
  for(let i=7; i>=0; i--) {
    const start = new Date(now); start.setDate(start.getDate() - start.getDay() - i*7);
    const end   = new Date(start); end.setDate(end.getDate()+7);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const label = start.toLocaleDateString("en-IN", {month:"short", day:"numeric"});
    const total = STATE.personal
      .filter(e => { const d=new Date(e.date); return d>=start && d<end; })
      .reduce((s,e) => s+cvt(e.amount, e.currency), 0);
    weeks.push(label);
    weekTotals.push(round2(total));
  }

  if(pLineChart) { pLineChart.destroy(); pLineChart=null; }
  const ph = $("pLinePlaceholder");
  const hasData = weekTotals.some(v=>v>0);
  if(ph) ph.classList.toggle("hidden", hasData);
  if(!hasData) return;

  pLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: weeks,
      datasets: [{
        label: "Spending", data: weekTotals,
        borderColor: "#7DF9C2", backgroundColor: "rgba(125,249,194,.1)",
        borderWidth: 2, tension:.35, fill:true, pointBackgroundColor:"#7DF9C2",
        pointRadius:3, pointHoverRadius:6
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:tooltipCfg("bar") },
      scales:{
        x:{ ticks:{color:"#94a3b8",font:{size:10}}, grid:{color:"rgba(255,255,255,.04)"} },
        y:{ beginAtZero:true, ticks:{color:"#94a3b8",font:{size:10}, callback:v=>SYM[STATE.currency]+Number(v).toLocaleString("en-IN")}, grid:{color:"rgba(255,255,255,.07)"} }
      },
      animation:{duration:600}
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 12 ▸ PERSONAL — SMART INSIGHTS
═══════════════════════════════════════════════════════════════ */
function renderPersonalInsights() {
  const grid = $("pInsightsGrid");
  if(!STATE.personal.length) {
    grid.innerHTML = '<p class="empty-hint">Add expenses to unlock personalized insights.</p>'; return;
  }

  const insights = generatePersonalInsights();
  if(!insights.length) {
    grid.innerHTML = '<p class="empty-hint">Not enough data yet.</p>'; return;
  }

  grid.innerHTML = insights.map((ins, i) => `
    <div class="insight-card type-${ins.type}" style="animation-delay:${i*45}ms">
      <div class="insight-ico-row">
        <span class="insight-ico">${ins.icon}</span>
        <span class="insight-badge">${ins.badge}</span>
      </div>
      <div class="insight-text">${ins.text}</div>
    </div>
  `).join("");
}

function generatePersonalInsights() {
  const insights = [];
  const monthExp = getFilteredPersonal("month");
  const allExp   = STATE.personal;
  if(!monthExp.length) return insights;

  const totalMonth = monthExp.reduce((s,e) => s+cvt(e.amount,e.currency), 0);
  const totalBudgetINR = Object.values(STATE.budgets).reduce((s,v)=>s+v, 0);
  const totalBudget    = totalBudgetINR / (RATES_TO_INR[STATE.currency]||1);

  // 1. Summary
  insights.push({ type:"info", icon:"💰", badge:"Summary",
    text: `You spent <strong>${fmt(totalMonth)}</strong> this month across <strong>${monthExp.length}</strong> transactions.` });

  // 2. Budget status
  if(totalBudget > 0) {
    const pct = (totalMonth/totalBudget)*100;
    if(pct >= 100) {
      insights.push({ type:"over", icon:"🚨", badge:"Over Budget",
        text: `You're <strong>${fmt(totalMonth-totalBudget)}</strong> over your monthly budget. Consider cutting discretionary spending.` });
    } else if(pct >= 80) {
      insights.push({ type:"warn", icon:"⚠️", badge:"Warning",
        text: `You've used <strong>${pct.toFixed(0)}%</strong> of your budget. Only <strong>${fmt(totalBudget-totalMonth)}</strong> remaining this month.` });
    } else {
      insights.push({ type:"good", icon:"✅", badge:"On Track",
        text: `Great! You've spent <strong>${pct.toFixed(0)}%</strong> of your budget. <strong>${fmt(totalBudget-totalMonth)}</strong> still available.` });
    }
  }

  // 3. Category overspending
  const catSpend = {};
  monthExp.forEach(e => { catSpend[e.category] = (catSpend[e.category]||0) + cvt(e.amount,e.currency); });
  const overCats = Object.entries(STATE.budgets)
    .filter(([cat,budINR]) => {
      const bud = budINR / (RATES_TO_INR[STATE.currency]||1);
      return bud > 0 && (catSpend[cat]||0) > bud;
    })
    .map(([cat]) => cat);

  if(overCats.length) {
    insights.push({ type:"over", icon:"📊", badge:"Overspending",
      text: `You've exceeded your budget in: <strong>${overCats.map(esc).join(", ")}</strong>. Review these categories.` });
  }

  // 4. Top spending category
  const topCat = Object.entries(catSpend).sort((a,b)=>b[1]-a[1])[0];
  if(topCat) {
    const pct = totalMonth > 0 ? ((topCat[1]/totalMonth)*100).toFixed(0) : 0;
    insights.push({ type:"info", icon: CAT_EMOJI[topCat[0]]||"📦", badge:"Top Category",
      text: `<strong>${esc(topCat[0])}</strong> is your biggest spend at <strong>${fmt(topCat[1])}</strong> (${pct}% of total).` });
  }

  // 5. Waste detection — frequent small expenses in Entertainment/Food
  const wasteCategories = ["Entertainment","Shopping","Food"];
  const wasteTxns = monthExp.filter(e => wasteCategories.includes(e.category));
  if(wasteTxns.length >= 5) {
    const wasteTotal = wasteTxns.reduce((s,e)=>s+cvt(e.amount,e.currency),0);
    insights.push({ type:"warn", icon:"🍃", badge:"Waste Alert",
      text: `You have <strong>${wasteTxns.length} transactions</strong> in leisure categories totalling <strong>${fmt(wasteTotal)}</strong>. Consolidate or cut back?` });
  }

  // 6. Daily burn rate
  const days = new Date().getDate(); // days elapsed this month
  const daily = totalMonth / days;
  const projectedMonth = daily * daysInMonth();
  if(totalBudget > 0 && projectedMonth > totalBudget) {
    insights.push({ type:"warn", icon:"📉", badge:"Projection",
      text: `At your current rate of <strong>${fmt(daily)}/day</strong>, you'll spend <strong>${fmt(projectedMonth)}</strong> this month — <strong>${fmt(projectedMonth-totalBudget)}</strong> over budget.` });
  }

  // 7. Recurring expenses
  const recurringTotal = allExp.filter(e=>e.recurring==="yes").reduce((s,e)=>s+cvt(e.amount,e.currency),0);
  if(recurringTotal > 0) {
    insights.push({ type:"tip", icon:"🔄", badge:"Recurring",
      text: `Your monthly recurring commitments total <strong>${fmt(recurringTotal)}</strong>. Factor this into your budget planning.` });
  }

  // 8. Saving suggestion
  const savingsExp = monthExp.filter(e=>e.category==="Savings").reduce((s,e)=>s+cvt(e.amount,e.currency),0);
  const savingsRate = totalMonth > 0 ? (savingsExp/totalMonth)*100 : 0;
  if(savingsRate < 10 && totalMonth > 500) {
    insights.push({ type:"tip", icon:"🏦", badge:"Saving Tip",
      text: `You're saving only <strong>${savingsRate.toFixed(0)}%</strong> of your spend. Aim for 20%. Try setting a Savings budget category!` });
  } else if(savingsRate >= 20) {
    insights.push({ type:"good", icon:"🌟", badge:"Great Saver",
      text: `Excellent! You're putting aside <strong>${savingsRate.toFixed(0)}%</strong> into savings. Keep it up!` });
  }

  // 9. Anomaly detection (expense > 2.5x average)
  if(monthExp.length > 3) {
    const avg = totalMonth / monthExp.length;
    const anomalies = monthExp.filter(e => cvt(e.amount,e.currency) > avg*2.5);
    if(anomalies.length) {
      const names = anomalies.slice(0,2).map(e=>`"${esc(e.desc)}"`).join(", ");
      insights.push({ type:"warn", icon:"⚡", badge:"Anomaly",
        text: `${anomalies.length} unusually large expense${anomalies.length>1?"s":""}: ${names}${anomalies.length>2?"…":""}. Double-check these.` });
    }
  }

  return insights;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 13 ▸ PERSONAL — EXPORT CSV
═══════════════════════════════════════════════════════════════ */
function exportPersonalCSV() {
  if(!STATE.personal.length) { toast("No expenses to export.", "error"); return; }
  const rows = [
    ["Date","Description","Category","Currency","Amount","Converted ("+STATE.currency+")","Recurring"],
    ...STATE.personal.map(e => [
      e.date, `"${e.desc.replace(/"/g,'""')}"`, e.category, e.currency,
      e.amount.toFixed(2), cvt(e.amount,e.currency).toFixed(2), e.recurring
    ])
  ];
  downloadCSV(rows, "personal-expenses");
  toast("CSV exported! ⬇", "success");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 14 ▸ GROUP — ADD MEMBER
═══════════════════════════════════════════════════════════════ */
function handleAddMember() {
  const name = $("gMemberName").value.trim();
  if(!name) { toast("Enter a member name.", "error"); return; }
  if(name.length > 40) { toast("Name too long.", "error"); return; }
  if(STATE.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    toast(`"${name}" is already in the group.`, "error"); return;
  }
  STATE.members.push({ id: uid(), name });
  saveState();
  $("gMemberName").value = "";
  $("gMemberName").focus();
  renderAll();
  toast(`${name} added! 👤`, "success");
}

function removeMember(id) {
  const m = STATE.members.find(x => x.id===id);
  if(!m || !confirm(`Remove "${m.name}"? Their expenses remain in history.`)) return;
  STATE.members = STATE.members.filter(x => x.id!==id);
  saveState();
  renderAll();
  toast(`${m.name} removed.`, "info");
}
window.removeMember = removeMember;

function renderMemberList() {
  const ul    = $("gMemberList");
  const count = STATE.members.length;
  $("gMemberCount").textContent = count;

  if(!count) { ul.innerHTML = '<li class="empty-hint-li">No members yet.</li>'; return; }
  ul.innerHTML = STATE.members.map(m => `
    <li class="member-item">
      <div class="mavatar">${initials(m.name)}</div>
      <span class="mname">${esc(m.name)}</span>
      <button class="btn-rmv" onclick="removeMember('${m.id}')" aria-label="Remove ${esc(m.name)}">✕</button>
    </li>
  `).join("");
}

function renderPayerDropdown() {
  const sel = $("gPayerSelect");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select Payer —</option>' +
    STATE.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  if(prev && STATE.members.find(m=>m.id===prev)) sel.value = prev;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 15 ▸ GROUP — ADD EXPENSE
═══════════════════════════════════════════════════════════════ */
function handleAddGroupExpense() {
  const payerId  = $("gPayerSelect").value;
  const amount   = parseFloat($("gExpAmount").value);
  const currency = $("gExpCurrency").value;
  const desc     = $("gExpDesc").value.trim();
  const category = $("gExpCategory").value;
  const split    = $("gSplitSelect").value;

  if(!payerId) { toast("Select who paid.", "error"); return; }
  if(!amount || amount<=0) { toast("Enter a valid amount.", "error"); return; }
  if(!desc) { toast("Enter a description.", "error"); return; }

  const payer = STATE.members.find(m=>m.id===payerId);
  if(!payer) { toast("Payer not found.", "error"); return; }

  STATE.gExpenses.push({
    id: uid(), payerId, payerName: payer.name,
    amount: round2(amount), currency, desc, category, split,
    date: new Date().toISOString()
  });
  saveState();
  $("gExpAmount").value = "";
  $("gExpDesc").value   = "";
  $("gExpAmount").focus();
  renderAll();
  toast(`Added: ${fmt(cvt(amount,currency))} — "${esc(desc)}" 💸`, "success");
}

function deleteGroupExpense(id) {
  const e = STATE.gExpenses.find(x=>x.id===id);
  if(!e || !confirm(`Delete "${e.desc}"?`)) return;
  STATE.gExpenses = STATE.gExpenses.filter(x=>x.id!==id);
  saveState();
  renderAll();
  toast("Expense deleted.", "info");
}
window.deleteGroupExpense = deleteGroupExpense;

/* ═══════════════════════════════════════════════════════════════
   SECTION 16 ▸ GROUP — DASHBOARD
═══════════════════════════════════════════════════════════════ */
function renderGroupDashboard() {
  const total = STATE.gExpenses.reduce((s,e) => s+cvt(e.amount,e.currency), 0);
  const count = STATE.gExpenses.length;
  const avg   = count > 0 ? total/count : 0;

  const catTotals = {};
  STATE.gExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + cvt(e.amount,e.currency); });
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];

  $("gStatTotal").textContent  = count > 0 ? fmt(total) : "—";
  $("gStatCount").textContent  = count;
  $("gStatTopCat").textContent = topCat ? `${CAT_EMOJI[topCat[0]]||"📦"} ${topCat[0]}` : "—";
  $("gStatAvg").textContent    = count > 0 ? fmt(avg) : "—";
  $("groupMeta").textContent   = `${STATE.members.length} members · ${count} expenses`;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 17 ▸ GROUP — EXPENSE LIST
═══════════════════════════════════════════════════════════════ */
function renderGroupExpenseList() {
  const list  = $("gExpList");
  const count = STATE.gExpenses.length;
  $("gExpCountLabel").textContent = `${count} expense${count!==1?"s":""}`;

  if(!count) { list.innerHTML = '<li class="empty-hint-li">No group expenses yet.</li>'; return; }

  const sorted = [...STATE.gExpenses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  list.innerHTML = sorted.map(e => {
    const disp     = cvt(e.amount, e.currency);
    const showOrig = e.currency !== STATE.currency;
    return `
      <li class="exp-item">
        <div class="exp-cat-ico">${CAT_EMOJI[e.category]||"📦"}</div>
        <div class="exp-info">
          <div class="exp-desc" title="${esc(e.desc)}">${esc(e.desc)}</div>
          <div class="exp-meta">
            <span style="color:var(--sky);font-weight:500">Paid by ${esc(e.payerName)}</span>
            <span class="exp-cat-tag">${esc(e.category)}</span>
            <span class="exp-cur-tag">${esc(e.currency)}</span>
            <span>${e.split==="equal"?"Equal split":"Payer only"}</span>
            <span>${fmtDate(e.date)}</span>
          </div>
        </div>
        <div class="exp-amount-col">
          <div class="exp-amount">${fmt(disp)}</div>
          ${showOrig ? `<div class="exp-amount-orig">${SYM[e.currency]||""}${e.amount.toFixed(2)}</div>` : ""}
        </div>
        <button class="btn-del" onclick="deleteGroupExpense('${e.id}')" aria-label="Delete ${esc(e.desc)}">🗑</button>
      </li>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 18 ▸ GROUP — CHARTS
═══════════════════════════════════════════════════════════════ */
function renderGroupCharts() {
  renderGroupPie();
  renderGroupBar();
}

function renderGroupPie() {
  const ctx = document.getElementById("gPieChart");
  if(!ctx) return;
  const catTotals = {};
  STATE.gExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0)+cvt(e.amount,e.currency); });
  const labels = Object.keys(catTotals);
  const data   = Object.values(catTotals);

  if(gPieChart) { gPieChart.destroy(); gPieChart=null; }
  const ph = $("gPiePlaceholder");
  if(ph) ph.classList.toggle("hidden", labels.length>0);
  if(!labels.length) return;

  gPieChart = new Chart(ctx, {
    type:"doughnut",
    data:{ labels, datasets:[{ data, backgroundColor:CHART_COLORS.slice(0,labels.length), borderColor:"rgba(7,9,15,.8)", borderWidth:2, hoverOffset:8 }] },
    options:{
      responsive:true, maintainAspectRatio:true, cutout:"62%",
      plugins:{ legend:{position:"bottom",labels:{color:"#94a3b8",font:{family:"'Space Grotesk',sans-serif",size:11},padding:10,boxWidth:10,usePointStyle:true}}, tooltip:tooltipCfg("pie") },
      animation:{animateRotate:true,duration:600}
    }
  });
}

function renderGroupBar() {
  const ctx = document.getElementById("gBarChart");
  if(!ctx) return;
  const memberTotals = {};
  STATE.members.forEach(m => { memberTotals[m.name]=0; });
  STATE.gExpenses.forEach(e => { if(Object.prototype.hasOwnProperty.call(memberTotals,e.payerName)) memberTotals[e.payerName]+=cvt(e.amount,e.currency); });
  const labels = Object.keys(memberTotals);
  const data   = Object.values(memberTotals);

  if(gBarChart) { gBarChart.destroy(); gBarChart=null; }
  const ph = $("gBarPlaceholder");
  const hasData = labels.length>0 && data.some(v=>v>0);
  if(ph) ph.classList.toggle("hidden", hasData);
  if(!hasData) return;

  gBarChart = new Chart(ctx, {
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Paid", data,
        backgroundColor: CHART_COLORS.slice(0,labels.length).map(c=>c+"bb"),
        borderColor: CHART_COLORS.slice(0,labels.length),
        borderWidth:1.5, borderRadius:6, borderSkipped:false
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:tooltipCfg("bar") },
      scales:{
        x:{ ticks:{color:"#94a3b8",font:{size:10},maxRotation:30}, grid:{color:"rgba(255,255,255,.04)"} },
        y:{ beginAtZero:true, ticks:{color:"#94a3b8",font:{size:10},callback:v=>SYM[STATE.currency]+Number(v).toLocaleString("en-IN")}, grid:{color:"rgba(255,255,255,.07)"} }
      },
      animation:{duration:600}
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 19 ▸ GROUP — WALLET & BALANCES
═══════════════════════════════════════════════════════════════ */
function computeGroupBalances() {
  const sharedExp   = STATE.gExpenses.filter(e=>e.split!=="payer");
  const totalShared = sharedExp.reduce((s,e)=>s+cvt(e.amount,e.currency),0);
  const n           = STATE.members.length;
  const share       = n > 0 ? totalShared/n : 0;

  const balances = {};
  STATE.members.forEach(m => { balances[m.id] = { id:m.id, name:m.name, paid:0, share, balance:0 }; });
  STATE.gExpenses.forEach(e => { if(balances[e.payerId]) balances[e.payerId].paid += cvt(e.amount,e.currency); });

  const memberPaidShared = {};
  STATE.members.forEach(m => { memberPaidShared[m.id]=0; });
  sharedExp.forEach(e => { if(memberPaidShared[e.payerId]!==undefined) memberPaidShared[e.payerId]+=cvt(e.amount,e.currency); });

  Object.values(balances).forEach(b => {
    b.balance = round2(memberPaidShared[b.id] - b.share);
  });

  const totalSpent = STATE.gExpenses.reduce((s,e)=>s+cvt(e.amount,e.currency),0);
  return { balances, totalSpent, share };
}

function renderGroupWallet() {
  const { balances, totalSpent } = computeGroupBalances();
  $("gTotalSpentLabel").textContent = STATE.gExpenses.length > 0 ? `Total: ${fmt(totalSpent)}` : "Total: —";

  const cardsEl = $("gBalanceCards");
  if(!STATE.members.length) { cardsEl.innerHTML = '<p class="empty-hint">Add members and expenses to see balances.</p>'; $("gBreakdownWrap").innerHTML=""; return; }

  cardsEl.innerHTML = Object.values(balances).map(b => {
    const cls   = b.balance >  0.005 ? "bc-pos" : b.balance < -0.005 ? "bc-neg" : "bc-zero";
    const lbl   = b.balance >  0.005 ? "gets back" : b.balance < -0.005 ? "owes" : "settled ✓";
    const sign  = b.balance >  0.005 ? "+" : "";
    return `
      <div class="balance-card ${cls}">
        <div class="bc-name"><div class="bc-avatar">${initials(b.name)}</div>${esc(b.name)}</div>
        <div class="bc-amount">${sign}${fmt(b.balance)}</div>
        <div class="bc-label">${lbl} · paid ${fmt(b.paid)}</div>
      </div>
    `;
  }).join("");

  // Breakdown table
  const rows = Object.values(balances).map(b => {
    const pillCls = b.balance > 0.005 ? "pos" : b.balance < -0.005 ? "neg" : "zero";
    const pillLbl = b.balance > 0.005 ? "Gets back" : b.balance < -0.005 ? "Owes" : "Settled ✓";
    const sign    = b.balance > 0.005 ? "+" : "";
    return `
      <tr>
        <td><div class="td-name-cell"><div class="mini-av">${initials(b.name)}</div>${esc(b.name)}</div></td>
        <td class="td-paid">${fmt(b.paid)}</td>
        <td class="td-share">${fmt(b.share)}</td>
        <td><span class="bal-pill ${pillCls}">${pillLbl}: ${b.balance!==0 ? sign+fmt(Math.abs(b.balance)) : "—"}</span></td>
      </tr>
    `;
  }).join("");

  $("gBreakdownWrap").innerHTML = `
    <table class="breakdown-table">
      <thead><tr><th>Member</th><th>Total Paid</th><th>Fair Share</th><th>Net Balance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 20 ▸ GROUP — REPORT
═══════════════════════════════════════════════════════════════ */
function filterGroupExpenses(period) {
  if(period==="all") return STATE.gExpenses;
  const cutoff = period==="week" ? weekStart() : monthStart();
  return STATE.gExpenses.filter(e => new Date(e.date) >= cutoff);
}

function renderGroupReport() {
  const filtered = filterGroupExpenses(STATE.gFilter);
  const total = filtered.reduce((s,e) => s+cvt(e.amount,e.currency), 0);
  const count = filtered.length;

  const payerTotals={}, catTotals={};
  filtered.forEach(e => {
    payerTotals[e.payerName] = (payerTotals[e.payerName]||0) + cvt(e.amount,e.currency);
    catTotals[e.category]    = (catTotals[e.category]   ||0) + cvt(e.amount,e.currency);
  });

  const topSpender = Object.entries(payerTotals).sort((a,b)=>b[1]-a[1])[0];
  const topCat     = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];

  $("gRsTotal").textContent    = count > 0 ? fmt(total) : "—";
  $("gRsCount").textContent    = count;
  $("gRsTopSpender").textContent = topSpender ? topSpender[0] : "—";
  $("gRsTopCat").textContent   = topCat ? `${CAT_EMOJI[topCat[0]]||"📦"} ${topCat[0]}` : "—";

  const barList = $("gCatBarList");
  if(!Object.keys(catTotals).length) { barList.innerHTML = '<p class="empty-hint">No data for this period.</p>'; return; }

  const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  const max    = sorted[0][1];
  barList.innerHTML = sorted.map(([cat,amt],i) => {
    const pct = max > 0 ? (amt/max)*100 : 0;
    return `
      <div class="cat-bar-row" style="animation-delay:${i*40}ms">
        <div class="cat-bar-lbl">${CAT_EMOJI[cat]||"📦"} ${esc(cat)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="cat-bar-amount">${fmt(amt)}</div>
      </div>
    `;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 21 ▸ GROUP — SETTLEMENT
═══════════════════════════════════════════════════════════════ */
function minimizeTransactions() {
  const { balances } = computeGroupBalances();
  let creditors=[], debtors=[];
  Object.values(balances).forEach(b => {
    const v = round2(b.balance);
    if(v >  0.01) creditors.push({ name:b.name, amount: v });
    if(v < -0.01) debtors.push(  { name:b.name, amount:-v });
  });
  creditors.sort((a,b)=>b.amount-a.amount);
  debtors.sort((a,b)=>b.amount-a.amount);

  const txns = [];
  while(creditors.length && debtors.length) {
    const cr=creditors[0], dr=debtors[0];
    const pay = Math.min(cr.amount, dr.amount);
    if(pay>=0.01) txns.push({ from:dr.name, to:cr.name, amount:round2(pay) });
    cr.amount = round2(cr.amount - pay);
    dr.amount = round2(dr.amount - pay);
    if(cr.amount<0.01) creditors.shift();
    if(dr.amount<0.01) debtors.shift();
  }
  return txns;
}

function renderSettleMeta() {
  if(STATE.members.length < 2 || !STATE.gExpenses.length) {
    $("gSettleMeta").textContent = "—"; return;
  }
  const count = minimizeTransactions().length;
  $("gSettleMeta").textContent = count===0 ? "All settled ✓" : `${count} pending`;
}

function handleSettle() {
  if(STATE.members.length < 2) {
    $("gSettleResult").innerHTML = '<p class="empty-hint">Add at least 2 members to calculate settlements.</p>'; return;
  }
  if(!STATE.gExpenses.length) {
    $("gSettleResult").innerHTML = '<p class="empty-hint">No expenses to settle yet.</p>'; return;
  }

  const txns = minimizeTransactions();
  if(!txns.length) {
    $("gSettleResult").innerHTML = `<div class="settled-all">✅ Everyone is settled up — no payments needed!</div>`;
    toast("All settled up! ✅", "success"); return;
  }

  $("gSettleResult").innerHTML = txns.map((t,i) => `
    <div class="settle-item" style="animation-delay:${i*55}ms">
      <span class="s-from">${esc(t.from)}</span>
      <span class="s-arrow">→</span>
      <span class="s-to">${esc(t.to)}</span>
      <span class="s-amount">${fmt(t.amount)}</span>
    </div>
  `).join("");

  toast(`${txns.length} settlement${txns.length>1?"s":""} calculated ⚖️`, "success");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 22 ▸ GROUP — INSIGHTS
═══════════════════════════════════════════════════════════════ */
function renderGroupInsights() {
  const grid = $("gInsightsGrid");
  if(!STATE.gExpenses.length || !STATE.members.length) {
    grid.innerHTML = '<p class="empty-hint">Add members and expenses to unlock group insights.</p>'; return;
  }

  const insights = generateGroupInsights();
  grid.innerHTML = insights.map((ins,i) => `
    <div class="insight-card type-${ins.type}" style="animation-delay:${i*45}ms">
      <div class="insight-ico-row">
        <span class="insight-ico">${ins.icon}</span>
        <span class="insight-badge">${ins.badge}</span>
      </div>
      <div class="insight-text">${ins.text}</div>
    </div>
  `).join("");
}

function generateGroupInsights() {
  const insights = [];
  const { balances, totalSpent, share } = computeGroupBalances();
  const balArr = Object.values(balances);

  insights.push({ type:"info", icon:"💰", badge:"Summary",
    text: `Group total: <strong>${fmt(totalSpent)}</strong>. Each member's equal share: <strong>${fmt(share)}</strong>.` });

  const topPayer = balArr.reduce((a,b)=>b.paid>a.paid?b:a, balArr[0]);
  if(topPayer?.paid > 0) {
    insights.push({ type:"good", icon:"🏆", badge:"Top Contributor",
      text: `<strong>${esc(topPayer.name)}</strong> has paid the most — <strong>${fmt(topPayer.paid)}</strong>.` });
  }

  const catTotals={};
  STATE.gExpenses.forEach(e=>{ catTotals[e.category]=(catTotals[e.category]||0)+cvt(e.amount,e.currency); });
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];
  if(topCat) {
    const pct = totalSpent > 0 ? ((topCat[1]/totalSpent)*100).toFixed(0) : 0;
    insights.push({ type:"info", icon:CAT_EMOJI[topCat[0]]||"📦", badge:"Top Category",
      text: `<strong>${esc(topCat[0])}</strong> accounts for <strong>${fmt(topCat[1])}</strong> (${pct}% of total).` });
  }

  const lowContribs = balArr.filter(b=>b.share>0 && b.paid < b.share*0.25);
  if(lowContribs.length) {
    insights.push({ type:"warn", icon:"⚠️", badge:"Low Contribution",
      text: `<strong>${lowContribs.map(b=>esc(b.name)).join(", ")}</strong> paid less than 25% of their fair share.` });
  }

  const bigDebtor = balArr.reduce((a,b)=>b.balance<a.balance?b:a, balArr[0]);
  if(bigDebtor?.balance < -0.5) {
    insights.push({ type:"over", icon:"📉", badge:"Owes Most",
      text: `<strong>${esc(bigDebtor.name)}</strong> owes the most — <strong>${fmt(Math.abs(bigDebtor.balance))}</strong>.` });
  }

  const txnCount = minimizeTransactions().length;
  if(txnCount === 0 && totalSpent > 0) {
    insights.push({ type:"good", icon:"✅", badge:"Balanced",
      text: "Everyone has contributed equally — the group is perfectly balanced!" });
  } else if(txnCount > 0) {
    insights.push({ type:"tip", icon:"⚖️", badge:"Settlement",
      text: `<strong>${txnCount} transaction${txnCount>1?"s":""}</strong> needed to settle up. Click "Calculate Settlements" below.` });
  }

  const currencies = [...new Set(STATE.gExpenses.map(e=>e.currency))];
  if(currencies.length > 1) {
    insights.push({ type:"tip", icon:"🌍", badge:"Multi-Currency",
      text: `Expenses span <strong>${currencies.length} currencies</strong> (${currencies.join(", ")}), all converted to <strong>${STATE.currency}</strong>.` });
  }

  return insights;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 23 ▸ GROUP — EXPORT CSV & PDF
═══════════════════════════════════════════════════════════════ */
function exportGroupCSV() {
  const filtered = filterGroupExpenses(STATE.gFilter);
  if(!filtered.length) { toast("No expenses to export.", "error"); return; }
  const rows = [
    ["Date","Payer","Description","Category","Split","Currency","Amount",`Converted (${STATE.currency})`],
    ...filtered.map(e => [
      fmtDate(e.date), e.payerName, `"${e.desc.replace(/"/g,'""')}"`, e.category, e.split,
      e.currency, e.amount.toFixed(2), cvt(e.amount,e.currency).toFixed(2)
    ])
  ];
  downloadCSV(rows, "group-expenses");
  toast("CSV exported! ⬇", "success");
}

function exportGroupPDF() {
  const filtered = filterGroupExpenses(STATE.gFilter);
  if(!filtered.length) { toast("No expenses to export.", "error"); return; }

  const total = filtered.reduce((s,e)=>s+cvt(e.amount,e.currency),0);
  const period = STATE.gFilter==="week"?"This Week":STATE.gFilter==="month"?"This Month":"All Time";
  const today  = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});
  const catTotals={};
  filtered.forEach(e=>{catTotals[e.category]=(catTotals[e.category]||0)+cvt(e.amount,e.currency);});
  const txns = minimizeTransactions();

  const catRows = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>
    `<tr><td>${CAT_EMOJI[cat]||"📦"} ${cat}</td><td style="text-align:right;font-weight:600">${fmt(amt)}</td></tr>`).join("");

  const expRows = [...filtered].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>
    `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.payerName)}</td><td>${esc(e.desc)}</td><td>${e.category}</td><td style="text-align:right;font-weight:600">${fmt(cvt(e.amount,e.currency))}</td></tr>`).join("");

  const settleRows = txns.length===0
    ? `<tr><td colspan="4" style="text-align:center;color:#34d399">✅ All settled up!</td></tr>`
    : txns.map(t=>`<tr><td>${esc(t.from)}</td><td style="text-align:center">→</td><td>${esc(t.to)}</td><td style="text-align:right;font-weight:600">${fmt(t.amount)}</td></tr>`).join("");

  const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>FinZen Report — ${period}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;color:#1e293b;background:#f8fafc;padding:32px}
h1{font-size:22px;font-weight:800;margin-bottom:4px}p.sub{color:#64748b;font-size:12px;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
.card-lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.card-val{font-size:18px;font-weight:800}
h2{font-size:14px;font-weight:700;margin:16px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:5px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#475569;font-weight:600}
td{padding:8px 12px;border-bottom:1px solid #f1f5f9}tr:last-child td{border-bottom:none}
.footer{margin-top:20px;text-align:center;font-size:10px;color:#94a3b8}</style></head><body>
<h1>📊 FinZen Report — ${period}</h1>
<p class="sub">Generated ${today} · ${STATE.members.length} members · ${STATE.currency}</p>
<div class="cards">
  <div class="card"><div class="card-lbl">Total</div><div class="card-val" style="color:#2563eb">${fmt(total)}</div></div>
  <div class="card"><div class="card-lbl">Transactions</div><div class="card-val" style="color:#d97706">${filtered.length}</div></div>
  <div class="card"><div class="card-lbl">Members</div><div class="card-val" style="color:#059669">${STATE.members.length}</div></div>
</div>
<h2>Category Breakdown</h2><table><thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${catRows}</tbody></table>
<h2>Expenses</h2><table><thead><tr><th>Date</th><th>Payer</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${expRows}</tbody></table>
<h2>Settlement Plan</h2><table><thead><tr><th>From</th><th></th><th>To</th><th style="text-align:right">Amount</th></tr></thead><tbody>${settleRows}</tbody></table>
<div class="footer">FinZen Student Edition · All amounts in ${STATE.currency}</div>
<script>window.onload=function(){window.print()}<\/script></body></html>`;

  const blob = new Blob([html],{type:"text/html;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  toast("Report opened — Ctrl+P to save as PDF 📄", "success");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 24 ▸ GROUP — QUICK ACTIONS
═══════════════════════════════════════════════════════════════ */
function handleScanQR() {
  const amount = Math.floor(Math.random()*4900)+100;
  const desc   = pickRandom(["Hotel stay","Dinner","Cab ride","Movie tickets","Groceries","Fuel","Coffee"]);
  const cat    = pickRandom(Object.keys(CAT_EMOJI));
  const cur    = pickRandom(["INR","USD","EUR","GBP"]);
  $("gExpAmount").value   = amount;
  $("gExpDesc").value     = desc;
  $("gExpCategory").value = cat;
  $("gExpCurrency").value = cur;
  openModal("📷 QR Code Scanned", `
    <div class="qr-mock">🔲</div>
    <p style="margin-top:14px;text-align:center;line-height:1.6;">QR detected! Form auto-filled.</p>
    <p style="margin-top:8px;text-align:center;color:#7DF9C2;font-size:1.1rem;font-weight:700;">${SYM[cur]||""}${amount} ${cur} — ${esc(desc)}</p>
    <p style="margin-top:6px;text-align:center;font-size:.8rem;color:#94a3b8;">Category: ${esc(cat)}</p>
  `);
  toast("QR scanned! Form auto-filled 📷", "success");
}

function handleUploadBill(e) {
  const file = e.target.files[0];
  if(!file) return;
  e.target.value = "";
  toast("Processing bill… ⏳", "info");
  setTimeout(() => {
    const amount = Math.floor(Math.random()*2900)+200;
    const desc   = pickRandom(["Restaurant bill","Grocery receipt","Hotel invoice","Pharmacy bill"]);
    const cat    = pickRandom(["Food","Shopping","Accommodation","Medical"]);
    const cur    = pickRandom(["INR","USD","EUR"]);
    $("gExpAmount").value   = amount;
    $("gExpDesc").value     = desc;
    $("gExpCategory").value = cat;
    $("gExpCurrency").value = cur;
    openModal("🧾 Bill Scanned (OCR)", `
      <p><strong>File:</strong> ${esc(file.name)}</p>
      <p style="margin-top:10px;">OCR detected:</p>
      <table style="margin-top:12px;width:100%;font-size:.88rem;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#94a3b8;width:100px">Amount</td><td style="color:#fbbf24;font-weight:700">${SYM[cur]||""}${amount} ${cur}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Description</td><td>${esc(desc)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Category</td><td>${esc(cat)}</td></tr>
      </table>
      <p style="margin-top:10px;font-size:.8rem;color:#94a3b8">Select a payer and click Add Group Expense.</p>
    `);
    toast("Bill scanned! Form auto-filled 🧾", "success");
  }, 1200);
}

function handleUPI() {
  const txns = minimizeTransactions();
  if(!STATE.members.length || !txns.length) {
    openModal("📲 UPI Payment", '<p>No pending settlements found. ✅ Everyone is settled up!</p>'); return;
  }
  const first = txns[0];
  const upiId = first.to.toLowerCase().replace(/\s+/g,".").replace(/[^a-z.]/g,"").slice(0,20) + "@" + pickRandom(["okaxis","okhdfcbank","okicici","ybl","paytm"]);
  const ref   = Math.random().toString(36).slice(2,10).toUpperCase();
  openModal("📲 UPI Payment", `
    <p style="color:#94a3b8;font-size:.85rem;margin-bottom:12px">First pending settlement:</p>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:9px;">
      <div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:2px">FROM</div><div style="font-weight:600">${esc(first.from)}</div></div>
      <div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:2px">TO</div><div style="font-weight:600">${esc(first.to)}</div></div>
      <div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:2px">AMOUNT</div><div style="font-size:1.3rem;font-weight:700;color:#fbbf24">${fmt(first.amount)}</div></div>
      <div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:2px">UPI ID</div><div style="font-family:monospace;color:#38bdf8;font-size:.88rem">${esc(upiId)}</div></div>
      <div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:2px">REF</div><div style="font-family:monospace;color:#94a3b8;font-size:.82rem">${ref}</div></div>
    </div>
    <p style="margin-top:12px;color:#34d399;font-size:.83rem;text-align:center">✅ Redirecting… <em style="color:#94a3b8">(simulation only)</em></p>
  `);
  toast("Redirecting to UPI app… 📲", "info");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 25 ▸ RESET
═══════════════════════════════════════════════════════════════ */
function handleReset() {
  if(!confirm("⚠️ Reset ALL data?\nThis will clear all expenses, members, and budgets.")) return;
  STATE.personal = []; STATE.budgets = {}; STATE.members = []; STATE.gExpenses = [];
  saveState();
  [pPieChart, pLineChart, gPieChart, gBarChart].forEach(c => { if(c) c.destroy(); });
  pPieChart = pLineChart = gPieChart = gBarChart = null;
  $("gSettleResult").innerHTML = '<p class="empty-hint">Click the button above to compute who owes whom.</p>';
  renderAll();
  toast("All data cleared. Fresh start! 🔄", "info");
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 26 ▸ MODAL & TOAST
═══════════════════════════════════════════════════════════════ */
function openModal(title, bodyHTML) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  $("modalOverlay").removeAttribute("hidden");
}
function closeModal() {
  $("modalOverlay").setAttribute("hidden","");
  setTimeout(()=>{ $("modalBody").innerHTML=""; }, 60);
}

function toast(msg, type="info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(()=>{ t.className="toast"; }, 3200);
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 27 ▸ UTILITIES
═══════════════════════════════════════════════════════════════ */
function $(id)            { return document.getElementById(id); }
function uid()            { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function round2(n)        { return Math.round(n*100)/100; }
function esc(str)         { return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function pickRandom(arr)  { return arr[Math.floor(Math.random()*arr.length)]; }
function initials(name)   { return name.trim().split(/\s+/).map(w=>w[0]).join("").toUpperCase().slice(0,2)||"?"; }

function cvt(amount, fromCurrency) {
  const src = fromCurrency || "INR";
  if(src === STATE.currency) return amount;
  const inr = amount * (RATES_TO_INR[src]||1);
  return inr / (RATES_TO_INR[STATE.currency]||1);
}

function fmt(amount, currency) {
  const cur = currency || STATE.currency;
  const sym = SYM[cur] || cur;
  const decimals = cur==="JPY" ? 0 : 2;
  return sym + Number(amount).toLocaleString("en-IN", { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

function weekStart()  { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d; }
function monthStart() { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function daysInMonth(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }

function tooltipCfg(chartType) {
  return {
    backgroundColor:"#1e293b", borderColor:"rgba(255,255,255,.12)", borderWidth:1,
    titleColor:"#f1f5f9", bodyColor:"#94a3b8", padding:10, cornerRadius:8,
    titleFont:{ family:"'Space Grotesk',sans-serif", weight:"700", size:12 },
    bodyFont:{ family:"'Space Grotesk',sans-serif", size:11 },
    callbacks:{
      label(ctx) {
        const raw = chartType==="bar" ? (ctx.parsed?.y ?? ctx.parsed) : ctx.parsed;
        return "  " + fmt(raw);
      }
    }
  };
}

function downloadCSV(rows, filename) {
  const csv  = rows.map(r=>r.join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}