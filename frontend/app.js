const API_BASE = "http://localhost:8000/api";

let categories = [];
let budgets = [];
let transactions = [];
let filters = { months: [], accounts: [], categories: [] };
let chartInstances = {};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { ...opts.headers };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function fmt(n) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

async function refresh() {
  await Promise.all([loadTransactions(), loadStats(), loadFilters(), loadCategories(), loadBudgets()]);
}

async function loadTransactions() {
  const month = $("#filter-month").value;
  const account = $("#filter-account").value;
  const category = $("#filter-category").value;
  const type = $("#filter-type").value;

  const params = new URLSearchParams();
  if (month !== "all") params.set("month", month);
  if (account !== "all") params.set("account", account);
  if (category !== "all") params.set("category", category);
  if (type !== "all") params.set("type", type);

  const qs = params.toString();
  transactions = await api(`/transactions${qs ? "?" + qs : ""}`);
  renderTransactions();
}

async function loadStats() {
  const month = $("#filter-month").value;
  const params = new URLSearchParams();
  if (month !== "all") params.set("month", month);

  const qs = params.toString();
  const [totals, monthly] = await Promise.all([
    api(`/transactions/stats${qs ? "?" + qs : ""}`),
    api("/transactions/monthly-summary"),
  ]);

  $("#total-income").textContent = fmt(totals.totals.total_income);
  $("#total-expense").textContent = fmt(totals.totals.total_expense);
  const bal = totals.totals.balance;
  const balEl = $("#balance");
  balEl.textContent = fmt(bal);
  balEl.className = "card-value " + (bal >= 0 ? "positive" : "negative");

  renderExpenseChart(totals.expense_by_category);
  renderMonthlyChart(monthly);
}

async function loadFilters() {
  filters = await api("/transactions/filters");

  const monthSel = $("#filter-month");
  const curMonth = monthSel.value;
  monthSel.innerHTML = '<option value="all">كل الشهور</option>';
  filters.months.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    monthSel.appendChild(opt);
  });
  monthSel.value = curMonth;

  const accSel = $("#filter-account");
  const curAcc = accSel.value;
  accSel.innerHTML = '<option value="all">كل الحسابات</option>';
  filters.accounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    accSel.appendChild(opt);
  });
  accSel.value = curAcc;

  const catSel = $("#filter-category");
  const curCat = catSel.value;
  catSel.innerHTML = '<option value="all">كل الفئات</option>';
  filters.categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });
  catSel.value = curCat;
}

async function loadCategories() {
  categories = await api("/categories");
  populateCategoryDropdown();
}

function populateCategoryDropdown() {
  const type = $("#txn-type").value;
  const sel = $("#txn-category");
  const curVal = sel.value;
  sel.innerHTML = "";
  categories
    .filter((c) => c.type === type)
    .forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  if (curVal && sel.querySelector(`option[value="${curVal}"]`)) sel.value = curVal;
}

async function loadBudgets() {
  budgets = await api("/budgets");
}

function renderTransactions() {
  const tbody = $("#transactions-table");
  tbody.innerHTML = "";
  if (transactions.length === 0) {
    show($("#empty-state"));
    return;
  }
  hide($("#empty-state"));

  transactions.forEach((t) => {
    const tr = document.createElement("tr");
    const amountClass = t.type === "income" ? "positive" : "negative";
    const sign = t.type === "income" ? "+" : "-";
    const typeLabel = t.type === "income" ? "دخل" : "مصروف";
    const accountLabels = { wallet: "محفظة", instapay: "InstaPay", visa: "فيزا" };
    tr.innerHTML = `
      <td>${fmtDate(t.date)}</td>
      <td class="${t.type}">${typeLabel}</td>
      <td>${accountLabels[t.account] || t.account}</td>
      <td>${t.category}</td>
      <td class="${amountClass}">${sign} ${fmt(t.amount)}</td>
      <td>${t.note || "—"}</td>
      <td class="actions">
        <button class="btn-icon small" onclick="editTransaction('${t.id}')" title="تعديل">✏️</button>
        <button class="btn-icon small btn-danger" onclick="deleteTransaction('${t.id}')" title="حذف">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function resetForm() {
  $("#transaction-form").reset();
  $("#editing-id").value = "";
  $("#form-title").textContent = "إضافة عملية";
  $("#submit-btn").textContent = "💾 حفظ";
  hide($("#cancel-btn"));
  const now = new Date();
  $("#txn-date").value = now.toISOString().split("T")[0];
}

async function editTransaction(id) {
  const t = transactions.find((x) => x.id === id);
  if (!t) return;
  $("#editing-id").value = t.id;
  $("#txn-type").value = t.type;
  populateCategoryDropdown();
  $("#txn-account").value = t.account;
  $("#txn-amount").value = t.amount;
  $("#txn-date").value = t.date.split("T")[0];
  $("#txn-category").value = t.category;
  $("#txn-note").value = t.note || "";
  $("#form-title").textContent = "تعديل عملية";
  $("#submit-btn").textContent = "💾 تحديث";
  show($("#cancel-btn"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTransaction(id) {
  if (!confirm("هل أنت متأكد من حذف هذه العملية؟")) return;
  await api(`/transactions/${id}`, { method: "DELETE" });
  await refresh();
}

async function submitTransaction(e) {
  e.preventDefault();
  const id = $("#editing-id").value;
  const data = {
    type: $("#txn-type").value,
    account: $("#txn-account").value,
    amount: parseFloat($("#txn-amount").value),
    category: $("#txn-category").value,
    date: new Date($("#txn-date").value).toISOString(),
    note: $("#txn-note").value || null,
  };

  if (id) {
    await api(`/transactions/${id}`, { method: "PATCH", body: data });
  } else {
    await api("/transactions", { method: "POST", body: data });
  }
  resetForm();
  await refresh();
}

function renderExpenseChart(data) {
  const canvas = $("#expense-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartInstances.expense) chartInstances.expense.destroy();

  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = ["#e74c3c", "#f39c12", "#9b59b6", "#3498db", "#1abc9c", "#e67e22", "#2ecc71", "#c0392b", "#34495e", "#d35400"];

  if (labels.length === 0) {
    chartInstances.expense = new Chart(ctx, {
      type: "doughnut",
      data: { labels: ["لا توجد بيانات"], datasets: [{ data: [1], backgroundColor: ["#555"] }] },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
    return;
  }

  chartInstances.expense = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right", labels: { color: "#ccc", font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}`,
          },
        },
      },
    },
  });
}

function renderMonthlyChart(data) {
  const canvas = $("#income-expense-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartInstances.monthly) chartInstances.monthly.destroy();

  const labels = data.map((d) => d.month);
  const income = data.map((d) => d.income);
  const expense = data.map((d) => d.expense);

  chartInstances.monthly = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "دخل", data: income, backgroundColor: "#27ae60", borderRadius: 4, borderSkipped: false },
        { label: "مصروف", data: expense, backgroundColor: "#e74c3c", borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top", labels: { color: "#ccc", font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: "#888" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#888" }, grid: { color: "rgba(255,255,255,0.05)" } },
      },
    },
  });
}

function showModal(title, bodyHTML, footerHTML = "") {
  $(".modal-title").textContent = title;
  $(".modal-body").innerHTML = bodyHTML;
  $(".modal-footer").innerHTML = footerHTML;
  show($("#modal-overlay"));
}

function closeModal() {
  hide($("#modal-overlay"));
}

// Categories Manager
async function openCategoriesManager() {
  categories = await api("/categories");
  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  function renderList(list, type) {
    return list
      .map(
        (c) => `
      <div class="category-row">
        <div class="category-info">
          <span class="category-color" style="background:${c.color}"></span>
          <span class="category-name">${c.name}</span>
          ${c.is_default ? '<span class="badge default">افتراضي</span>' : ""}
        </div>
        <div class="category-actions">
          ${!c.is_default ? `<button class="btn-icon small btn-danger" onclick="deleteCategory('${c.id}')">🗑️</button>` : ""}
        </div>
      </div>
    `
      )
      .join("");
  }

  const body = `
    <div class="category-tabs">
      <button class="tab-btn active" onclick="filterCatTabs('income',this)">دخل</button>
      <button class="tab-btn" onclick="filterCatTabs('expense',this)">مصروف</button>
    </div>
    <div class="category-list" id="cat-list-income">${renderList(income)}</div>
    <div class="category-list" id="cat-list-expense" style="display:none">${renderList(expense)}</div>
    <div class="manager-footer">
      <input type="text" id="new-cat-name" placeholder="اسم الفئة الجديدة" style="flex:1;padding:0.5rem;border:1px solid var(--border-color);border-radius:var(--radius);background:var(--bg-tertiary);color:var(--text-primary);">
      <input type="color" id="new-cat-color" value="#3498db" style="width:40px;height:36px;border:none;border-radius:var(--radius);cursor:pointer;">
      <button class="btn btn-primary" onclick="addCategory()">إضافة</button>
    </div>
  `;
  showModal("إدارة الفئات", body, "");
}

window.filterCatTabs = function (type, btn) {
  $$(".category-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  hide($("#cat-list-income"));
  hide($("#cat-list-expense"));
  show($(`#cat-list-${type}`));
};

window.addCategory = async function () {
  const name = $("#new-cat-name").value.trim();
  const color = $("#new-cat-color").value;
  if (!name) return alert("أدخل اسم الفئة");
  const activeTab = $(".category-tabs .tab-btn.active").textContent;
  const type = activeTab === "دخل" ? "income" : "expense";
  await api("/categories", { method: "POST", body: { name, type, color } });
  await openCategoriesManager();
  await loadCategories();
};

window.deleteCategory = async function (id) {
  if (!confirm("هل أنت متأكد من حذف هذه الفئة؟")) return;
  await api(`/categories/${id}`, { method: "DELETE" });
  await openCategoriesManager();
  await loadCategories();
};

// Budgets Manager
async function openBudgetsManager() {
  budgets = await api("/budgets");
  categories = await api("/categories");

  function renderBudgets() {
    if (budgets.length === 0) return '<div style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد ميزانيات</div>';
    return budgets
      .map((b) => {
        const cat = categories.find((c) => c.id === b.category_id);
        const catName = cat ? cat.name : "غير معروف";
        const catColor = cat ? cat.color : "#888";
        const spent = transactions
          .filter((t) => t.type === "expense" && t.category === catName)
          .reduce((sum, t) => sum + t.amount, 0);
        const pct = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0;
        const isOver = spent > b.amount;
        const isWarning = pct >= b.alert_threshold && !isOver;
        const rowClass = isOver ? "over" : isWarning ? "warning" : "";
        const fillColor = isOver ? "var(--expense-color)" : isWarning ? "var(--warning-color)" : "var(--accent-primary)";
        const periodLabels = { monthly: "شهري", weekly: "أسبوعي", yearly: "سنوي" };
        return `
          <div class="budget-row ${rowClass}">
            <div style="flex:1">
              <div class="budget-header">
                <div class="budget-category" style="border-color:${catColor}">${catName}</div>
                <span class="budget-period">${periodLabels[b.period] || b.period}</span>
              </div>
              <div class="budget-progress">
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${fillColor}"></div></div>
                <div class="budget-amounts">
                  <span class="spent">${fmt(spent)} / ${fmt(b.amount)}</span>
                  <span class="percentage ${isOver ? "over" : ""}">${Math.round(pct)}%</span>
                </div>
              </div>
            </div>
            <div class="budget-actions" style="margin-right:1rem">
              <button class="btn-icon small btn-danger" onclick="deleteBudget('${b.id}')">🗑️</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const expenseCats = categories.filter((c) => c.type === "expense");
  const catOpts = expenseCats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");

  const body = `
    <div class="budgets-list">${renderBudgets()}</div>
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-color);">
      <div class="budget-form">
        <div class="form-group">
          <label>الفئة</label>
          <select id="budget-cat">${catOpts}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>المبلغ الشهري</label>
            <input type="number" id="budget-amount" step="0.01" min="0.01" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>تنبيه عند (%)</label>
            <input type="number" id="budget-alert" min="10" max="100" value="80">
          </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="addBudget()">➕ إضافة ميزانية</button>
      </div>
    </div>
  `;
  showModal("إدارة الميزانيات", body, "");
}

window.addBudget = async function () {
  const categoryId = $("#budget-cat").value;
  const amount = parseFloat($("#budget-amount").value);
  const alertThreshold = parseInt($("#budget-alert").value);
  if (!categoryId || !amount || amount <= 0) return alert("أدخل بيانات صحيحة");
  await api("/budgets", {
    method: "POST",
    body: {
      category_id: categoryId,
      amount,
      period: "monthly",
      start_date: new Date().toISOString(),
      alert_threshold: alertThreshold,
    },
  });
  await openBudgetsManager();
  await loadBudgets();
};

window.deleteBudget = async function (id) {
  if (!confirm("هل أنت متأكد من حذف هذه الميزانية؟")) return;
  await api(`/budgets/${id}`, { method: "DELETE" });
  await openBudgetsManager();
  await loadBudgets();
};

// Export
async function exportJSON() {
  const data = await api("/transactions");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `money-tracker-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
}

async function exportCSV() {
  const data = await api("/transactions");
  const headers = ["التاريخ", "النوع", "الحساب", "الفئة", "المبلغ", "ملاحظة"];
  const rows = data.map((t) => [t.date.split("T")[0], t.type, t.account, t.category, t.amount, t.note || ""]);
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `money-tracker-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}

// Init
function init() {
  loadCategories();
  loadBudgets();
  refresh();
  bindEvents();
}

function bindEvents() {
  $("#txn-type").addEventListener("change", populateCategoryDropdown);
  $("#transaction-form").addEventListener("submit", submitTransaction);
  $("#cancel-btn").addEventListener("click", resetForm);

  ["filter-month", "filter-account", "filter-category", "filter-type"].forEach((id) => {
    $(`#${id}`).addEventListener("change", () => {
      loadTransactions();
      loadStats();
    });
  });

  $("#export-json").addEventListener("click", exportJSON);
  $("#export-csv").addEventListener("click", exportCSV);
  $("#categories-btn").addEventListener("click", openCategoriesManager);
  $("#budgets-btn").addEventListener("click", openBudgetsManager);
  $("#logout-btn").addEventListener("click", () => { localStorage.clear(); window.location.reload(); });

  $(".modal-close").addEventListener("click", closeModal);
  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  const now = new Date();
  $("#txn-date").value = now.toISOString().split("T")[0];
}

init();