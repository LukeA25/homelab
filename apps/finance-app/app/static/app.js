"use strict";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n) => fmt.format(n || 0);

const state = {
  connected: false,
  months: [],
  labels: [],
  categories: [],
  allTx: [],
};

const el = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); if (j.detail) msg = j.detail; } catch (_) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}
const jbody = (m) => (p, b) => api(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) });
const jpost = jbody("POST");
const jput = jbody("PUT");
const jpatch = jbody("PATCH");
const jdel = (p) => api(p, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Toast + modal
// ---------------------------------------------------------------------------

function toast(message, kind = "success") {
  const t = document.createElement("div");
  t.className = `toast ${kind === "error" ? "error" : "success"}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function openModal(title, fields, onSubmit) {
  const root = el("modal-root");
  const optionsHtml = (f) => f.options.map((o) =>
    `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? "selected" : ""}>${esc(o.label)}</option>`
  ).join("");

  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <form id="modal-form">
          ${fields.map((f) => `
            <label>${esc(f.label)}</label>
            ${f.type === "select"
              ? `<select class="input" name="${f.name}">${optionsHtml(f)}</select>`
              : `<input class="input" type="${f.type || "text"}" name="${f.name}" value="${esc(f.value ?? "")}" ${f.step ? `step="${f.step}"` : ""} ${f.required === false ? "" : "required"} />`}
          `).join("")}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  const close = () => { root.innerHTML = ""; };
  el("modal-cancel").onclick = close;
  root.querySelector(".modal-overlay").onclick = (e) => { if (e.target.classList.contains("modal-overlay")) close(); };
  el("modal-form").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { await onSubmit(data); close(); }
    catch (err) { toast(err.message, "error"); }
  };
}

function subcategoryOptions(selectedId, includeBlank) {
  let html = includeBlank ? `<option value="">— Unassigned —</option>` : "";
  for (const c of state.categories) {
    html += `<optgroup label="${esc(c.name)} (${c.kind})">`;
    for (const s of c.subcategories) {
      html += `<option value="${s.id}" ${String(s.id) === String(selectedId) ? "selected" : ""}>${esc(s.name)}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Connection + refresh
// ---------------------------------------------------------------------------

function setConnected(connected) {
  state.connected = connected;
  el("connection-status").textContent = connected ? "Connected" : "Not connected";
  el("connection-status").classList.toggle("connected", connected);
  el("refresh-btn").disabled = !connected;
  el("empty-state").classList.toggle("hidden", connected);
}

function setLastRefreshed(iso) {
  const node = el("last-refreshed");
  if (!iso) { node.classList.add("hidden"); return; }
  node.textContent = "Updated " + new Date(iso).toLocaleString();
  node.classList.remove("hidden");
}

async function loadSnapshot() {
  const snap = await api("/data");
  setConnected(snap.connected);
  setLastRefreshed(snap.last_refreshed);
  renderAccounts(snap.accounts || []);
}

async function refreshFromPlaid() {
  const btn = el("refresh-btn");
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = "Refreshing…";
  try {
    const snap = await jpost("/refresh");
    setConnected(snap.connected);
    setLastRefreshed(snap.last_refreshed);
    renderAccounts(snap.accounts || []);
    await reloadCurrentView();
    toast("Data refreshed from Plaid");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.textContent = orig; btn.disabled = !state.connected;
  }
}

async function openPlaidLink() {
  try {
    const { link_token } = await jpost("/create_link_token");
    const handler = Plaid.create({
      token: link_token,
      onSuccess: async (publicToken) => {
        try {
          await jpost("/exchange_public_token", { public_token: publicToken });
          toast("Bank connected");
          await refreshFromPlaid();
        } catch (e) { toast(e.message, "error"); }
      },
      onExit: (err) => { if (err) toast("Plaid Link closed with an error", "error"); },
    });
    handler.open();
  } catch (e) { toast(e.message, "error"); }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const VIEW_TITLES = {
  overview: "Overview",
  monthly: "Monthly",
  transactions: "Transactions",
  categories: "Categories & Projections",
  rules: "Mapping Rules",
  accounts: "Accounts",
};

let currentView = "overview";

async function reloadCurrentView() { await loadView(currentView); }

async function loadView(name) {
  switch (name) {
    case "overview": return loadOverview();
    case "monthly": return loadMonthly();
    case "transactions": return loadTransactions();
    case "categories": return loadCategories();
    case "rules": return loadRules();
    case "accounts": return loadSnapshot();
  }
}

function showView(name) {
  currentView = name;
  document.querySelectorAll(".nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${name}`));
  el("view-title").textContent = VIEW_TITLES[name];
  loadView(name).catch((e) => toast(e.message, "error"));
}

// ---------- Overview ----------

function diffCell(n) {
  const cls = n < -0.005 ? "neg" : (n > 0.005 ? "pos" : "");
  return `<td class="num ${cls}">${money(n)}</td>`;
}

function renderOverviewSection(tbodyId, section) {
  const rows = [];
  for (const cat of section.categories) {
    rows.push(`<tr class="cat-row"><td>${esc(cat.name)}</td><td class="num">${money(cat.projected)}</td><td class="num">${money(cat.actual)}</td>${diffCell(cat.difference)}</tr>`);
    for (const s of cat.subcategories) {
      rows.push(`<tr class="sub-row"><td>${esc(s.name)}</td><td class="num">${money(s.projected)}</td><td class="num">${money(s.actual)}</td>${diffCell(s.difference)}</tr>`);
    }
  }
  rows.push(`<tr class="total-row"><td>Total</td><td class="num">${money(section.projected)}</td><td class="num">${money(section.actual)}</td>${diffCell(section.difference)}</tr>`);
  el(tbodyId).innerHTML = rows.join("");
}

async function loadOverview() {
  const data = await api("/budget?view=overview");
  renderOverviewSection("ov-income-body", data.income);
  renderOverviewSection("ov-expense-body", data.expense);

  el("ov-income").textContent = money(data.income.actual);
  el("ov-spent").textContent = money(data.expense.actual);
  const net = el("ov-net");
  net.textContent = money(data.net.actual);
  net.className = "stat-value " + (data.net.actual >= 0 ? "positive" : "negative");

  if (data.months.length) {
    const first = data.months[0], last = data.months[data.months.length - 1];
    el("ov-year").textContent = `${first} → ${last}`;
  }

  const u = data.unassigned;
  const banner = el("unassigned-banner");
  if (u && u.count > 0) {
    banner.classList.remove("hidden");
    banner.textContent = `${u.count} transaction(s) are unassigned (${money(u.expense_actual)} spending, ${money(u.income_actual)} income). Assign them in Transactions or add a mapping rule.`;
  } else {
    banner.classList.add("hidden");
  }
}

// ---------- Monthly ----------

let monthlyData = null;

function renderMonthly() {
  if (!monthlyData) return;
  const mode = el("monthly-mode").value;
  const labels = monthlyData.month_labels;
  const head = `<thead><tr><th>Category</th><th>Subcategory</th>${labels.map((l) => `<th class="num">${esc(l)}</th>`).join("")}<th class="num">Total</th></tr></thead>`;

  const body = [];
  const renderGroup = (sectionLabel, groups) => {
    body.push(`<tr class="cat-row"><td colspan="${labels.length + 3}">${esc(sectionLabel)}</td></tr>`);
    for (const cat of groups) {
      for (const s of cat.subcategories) {
        const vals = mode === "projected" ? s.projected : s.actual;
        const total = mode === "projected" ? s.total_projected : s.total_actual;
        body.push(`<tr><td>${esc(cat.name)}</td><td>${esc(s.name)}</td>${vals.map((v) => `<td class="num">${v ? money(v) : "—"}</td>`).join("")}<td class="num">${money(total)}</td></tr>`);
      }
    }
  };
  renderGroup("Income", monthlyData.income);
  renderGroup("Expenses", monthlyData.expense);

  el("monthly-table").innerHTML = head + `<tbody>${body.join("")}</tbody>`;
}

async function loadMonthly() {
  monthlyData = await api("/budget?view=monthly");
  renderMonthly();
}

// ---------- Transactions ----------

function txAmountCell(amount) {
  const isDebit = amount > 0;
  const cls = isDebit ? "amount-debit" : "amount-credit";
  const text = isDebit ? `-${money(amount)}` : `+${money(Math.abs(amount))}`;
  return `<td class="num ${cls}">${text}</td>`;
}

function renderTransactions(list) {
  const body = list.map((t) => {
    const pending = t.pending ? '<span class="pending-badge">Pending</span>' : "";
    const manual = t.source === "manual" ? '<span class="source-badge">Manual</span>' : "";
    const plaidCat = t.pfc_primary ? esc(t.pfc_primary.replaceAll("_", " ").toLowerCase()) : "—";
    const budgetCls = t.resolved_subcategory_id == null ? "unassigned" : (t.is_override ? "override" : "");
    const select = `<select class="assign-select" data-tx="${esc(t.id)}">${subcategoryOptions(t.resolved_subcategory_id, true)}</select>`;
    const del = t.source === "manual" ? `<button class="btn btn-danger btn-sm" data-del="${esc(t.id)}">Delete</button>` : "";
    return `<tr>
      <td>${esc(t.date)}</td>
      <td>${esc(t.merchant_name || t.name || "")}${pending}${manual}</td>
      <td><span class="category-tag ${budgetCls}" style="text-transform:capitalize">${plaidCat}</span></td>
      <td>${select}</td>
      ${txAmountCell(t.amount)}
      <td>${del}</td>
    </tr>`;
  }).join("");
  el("tx-body").innerHTML = body || `<tr><td colspan="6" style="color:var(--muted)">No transactions. Connect a bank and refresh, or add one manually.</td></tr>`;
}

function applyTxFilter() {
  const q = el("tx-search").value.toLowerCase();
  const filtered = state.allTx.filter((t) => {
    const hay = `${t.merchant_name || ""} ${t.name || ""} ${t.resolved_name || ""} ${t.pfc_primary || ""}`.toLowerCase();
    return hay.includes(q);
  });
  renderTransactions(filtered);
}

async function loadTransactions() {
  const month = el("tx-month").value;
  const qs = month && month !== "all" ? `?month=${month}` : "";
  const data = await api(`/transactions${qs}`);
  state.allTx = data.transactions;
  applyTxFilter();
}

async function assignTransaction(txId, subId) {
  await jput(`/transactions/${encodeURIComponent(txId)}/assign`, { subcategory_id: subId ? Number(subId) : null });
  toast("Transaction reassigned");
  const t = state.allTx.find((x) => x.id === txId);
  if (t) { t.resolved_subcategory_id = subId ? Number(subId) : null; t.is_override = !!subId; }
}

function openManualModal() {
  openModal("Add manual transaction", [
    { name: "date", label: "Date", type: "date", value: new Date().toISOString().slice(0, 10) },
    { name: "name", label: "Description", type: "text" },
    { name: "kind", label: "Type", type: "select", value: "spending", options: [
      { value: "spending", label: "Spending" }, { value: "income", label: "Income" }] },
    { name: "amount", label: "Amount", type: "number", step: "0.01" },
    { name: "subcategory_id", label: "Budget category", type: "select", value: "",
      options: [{ value: "", label: "— Unassigned —" }].concat(
        state.categories.flatMap((c) => c.subcategories.map((s) => ({ value: s.id, label: `${c.name} / ${s.name}` })))) },
  ], async (data) => {
    const amt = Math.abs(parseFloat(data.amount) || 0);
    await jpost("/transactions", {
      date: data.date,
      name: data.name,
      amount: data.kind === "income" ? -amt : amt,
      subcategory_id: data.subcategory_id ? Number(data.subcategory_id) : null,
    });
    toast("Manual transaction added");
    await loadTransactions();
  });
}

// ---------- Categories & Projections ----------

function spreadEven(annual) {
  const base = Math.floor((annual / 12) * 100) / 100;
  const remainder = Math.round((annual - base * 12) * 100) / 100;
  return state.months.map((_, i) => (i === 0 ? base + remainder : base));
}

function renderCategoryEditor() {
  const list = el("cat-editor-list");
  const monthHeads = state.labels.map((l) => `<th class="num">${esc(l)}</th>`).join("");

  list.innerHTML = state.categories.map((c) => {
    const rows = c.subcategories.map((s) => {
      const monthInputs = state.months.map((m) =>
        `<td><input class="input input-num proj-month" data-sub="${s.id}" data-month="${m}" type="number" step="0.01" value="${s.projections[m] || 0}" /></td>`
      ).join("");
      return `<tr>
        <td><input class="input sub-name" data-sub="${s.id}" value="${esc(s.name)}" /></td>
        <td><input class="input input-num annual-input" data-sub="${s.id}" type="number" step="0.01" value="${s.annual || 0}" title="Set annual total and spread evenly" /></td>
        ${monthInputs}
        <td><button class="btn btn-danger btn-sm" data-del-sub="${s.id}">✕</button></td>
      </tr>`;
    }).join("");

    return `<div class="cat-editor">
      <div class="cat-editor-head">
        <span class="kind-tag ${c.kind}">${c.kind}</span>
        <input class="input cat-name" data-cat="${c.id}" value="${esc(c.name)}" />
        <div class="row-actions" style="margin-left:auto">
          <button class="btn btn-ghost btn-sm" data-add-sub="${c.id}">Add subcategory</button>
          <button class="btn btn-danger btn-sm" data-del-cat="${c.id}">Delete category</button>
        </div>
      </div>
      <div class="cat-editor-body">
        <div class="proj-grid-wrap">
          <table>
            <thead><tr><th>Subcategory</th><th class="num">Annual</th>${monthHeads}<th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="${state.months.length + 3}" style="color:var(--muted)">No subcategories yet.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function loadCategories() {
  const data = await api("/categories");
  state.months = data.months;
  state.labels = data.labels;
  state.categories = data.categories;
  el("cat-year-label").textContent = data.months.length ? ` ${data.months[0]} → ${data.months[data.months.length - 1]}` : "";
  renderCategoryEditor();
  populateMonthSelect();
}

async function saveProjections() {
  const projections = [...document.querySelectorAll(".proj-month")].map((inp) => ({
    subcategory_id: Number(inp.dataset.sub),
    month: inp.dataset.month,
    amount: parseFloat(inp.value) || 0,
  }));
  await jput("/projections", { projections });
  toast("Projections saved");
  await loadCategories();
}

// ---------- Rules ----------

async function loadRules() {
  const data = await api("/rules");
  el("rules-body").innerHTML = data.rules.map((r) => `<tr>
    <td>${esc(r.match_type)}</td>
    <td>${esc(r.match_value)}</td>
    <td>${esc(r.category_name || "?")} / ${esc(r.subcategory_name || "?")}</td>
    <td class="num">${r.priority}</td>
    <td><button class="btn btn-danger btn-sm" data-del-rule="${r.id}">Delete</button></td>
  </tr>`).join("") || `<tr><td colspan="5" style="color:var(--muted)">No rules yet.</td></tr>`;
}

function openRuleModal() {
  openModal("Add mapping rule", [
    { name: "match_type", label: "Match type", type: "select", value: "pfc_primary", options: [
      { value: "pfc_primary", label: "Plaid category (primary)" },
      { value: "pfc_detailed", label: "Plaid category (detailed)" },
      { value: "name_contains", label: "Description contains" }] },
    { name: "match_value", label: "Match value (e.g. FOOD_AND_DRINK or 'uber')", type: "text" },
    { name: "subcategory_id", label: "Maps to", type: "select",
      options: state.categories.flatMap((c) => c.subcategories.map((s) => ({ value: s.id, label: `${c.name} / ${s.name}` }))) },
    { name: "priority", label: "Priority (higher wins)", type: "number", value: "0" },
  ], async (data) => {
    await jpost("/rules", {
      match_type: data.match_type,
      match_value: data.match_value,
      subcategory_id: Number(data.subcategory_id),
      priority: parseInt(data.priority) || 0,
    });
    toast("Rule added");
    await loadRules();
  });
}

// ---------- Accounts ----------

function renderAccounts(accounts) {
  el("accounts-grid").innerHTML = accounts.map((a) => `
    <article class="account-card">
      <div class="account-type">${esc(a.subtype || a.type || "Account")}</div>
      <div class="account-name">${esc(a.official_name || a.name || "Account")}</div>
      <div class="account-mask">•••• ${esc(a.mask || "????")}</div>
      <div class="account-balance">${money(a.current_balance ?? a.available_balance ?? 0)}</div>
    </article>`).join("") || `<p style="color:var(--muted)">No accounts yet. Connect a bank and refresh.</p>`;
}

// ---------------------------------------------------------------------------
// Month selector
// ---------------------------------------------------------------------------

function populateMonthSelect() {
  const sel = el("tx-month");
  if (!state.months.length || sel.dataset.filled) return;
  sel.innerHTML = `<option value="all">All months</option>` +
    state.months.map((m, i) => `<option value="${m}">${esc(state.labels[i])}</option>`).join("");
  sel.dataset.filled = "1";
}

async function loadMonths() {
  const data = await api("/months");
  state.months = data.months;
  state.labels = data.labels;
  populateMonthSelect();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

document.querySelectorAll(".nav button").forEach((b) =>
  b.addEventListener("click", () => showView(b.dataset.view)));

el("link-button").onclick = openPlaidLink;
el("link-button-empty").onclick = openPlaidLink;
el("refresh-btn").onclick = refreshFromPlaid;

el("monthly-mode").onchange = renderMonthly;
el("tx-month").onchange = loadTransactions;
el("tx-search").addEventListener("input", applyTxFilter);
el("add-manual-btn").onclick = openManualModal;
el("save-projections-btn").onclick = () => saveProjections().catch((e) => toast(e.message, "error"));
el("add-rule-btn").onclick = openRuleModal;

el("add-category-btn").onclick = () => openModal("Add category", [
  { name: "name", label: "Name", type: "text" },
  { name: "kind", label: "Type", type: "select", value: "expense", options: [
    { value: "expense", label: "Expense" }, { value: "income", label: "Income" }] },
], async (data) => {
  await jpost("/categories", { name: data.name, kind: data.kind, sort_order: state.categories.length });
  toast("Category added");
  await loadCategories();
});

// Delegated events for dynamic content
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.classList.contains("assign-select")) {
    assignTransaction(t.dataset.tx, t.value).catch((err) => toast(err.message, "error"));
  } else if (t.classList.contains("annual-input")) {
    const sub = t.dataset.sub;
    const vals = spreadEven(parseFloat(t.value) || 0);
    document.querySelectorAll(`.proj-month[data-sub="${sub}"]`).forEach((inp, i) => { inp.value = vals[i]; });
  } else if (t.classList.contains("cat-name")) {
    jpatch(`/categories/${t.dataset.cat}`, { name: t.value }).then(() => toast("Renamed")).catch((err) => toast(err.message, "error"));
  } else if (t.classList.contains("sub-name")) {
    jpatch(`/subcategories/${t.dataset.sub}`, { name: t.value }).then(() => toast("Renamed")).catch((err) => toast(err.message, "error"));
  }
});

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.del) {
    if (confirm("Delete this manual transaction?"))
      jdel(`/transactions/${encodeURIComponent(t.dataset.del)}`).then(() => { toast("Deleted"); loadTransactions(); }).catch((err) => toast(err.message, "error"));
  } else if (t.dataset.delRule) {
    if (confirm("Delete this rule?"))
      jdel(`/rules/${t.dataset.delRule}`).then(() => { toast("Deleted"); loadRules(); }).catch((err) => toast(err.message, "error"));
  } else if (t.dataset.delCat) {
    if (confirm("Delete this category and all its subcategories/projections?"))
      jdel(`/categories/${t.dataset.delCat}`).then(() => { toast("Deleted"); loadCategories(); }).catch((err) => toast(err.message, "error"));
  } else if (t.dataset.delSub) {
    if (confirm("Delete this subcategory and its projections?"))
      jdel(`/subcategories/${t.dataset.delSub}`).then(() => { toast("Deleted"); loadCategories(); }).catch((err) => toast(err.message, "error"));
  } else if (t.dataset.addSub) {
    openModal("Add subcategory", [{ name: "name", label: "Name", type: "text" }], async (data) => {
      await jpost("/subcategories", { category_id: Number(t.dataset.addSub), name: data.name, sort_order: 0 });
      toast("Subcategory added");
      await loadCategories();
    });
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async function init() {
  try {
    await loadSnapshot();
    await loadMonths();
    // categories are needed by several views for the assign/move dropdowns
    const data = await api("/categories");
    state.categories = data.categories;
    showView("overview");
  } catch (err) {
    toast(err.message, "error");
  }
})();
