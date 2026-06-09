/* ========================================================
   EXPENSE TRACKER — app.js
   PIN Auth + Data Layer + Persons + UI Logic
   ======================================================== */

// ─────────────────────────────────────────────
//  STORAGE HELPERS
// ─────────────────────────────────────────────
const DB = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  remove(key)   { localStorage.removeItem(key); }
};

function loadTransactions()  { return DB.get('transactions', []); }
function saveTransactions(d) { DB.set('transactions', d); }
function loadDebts()         { return DB.get('debts', []); }
function saveDebts(d)        { DB.set('debts', d); }
function loadSettlements()   { return DB.get('settlements', []); }
function saveSettlements(d)  { DB.set('settlements', d); }
function loadCategories()    { return DB.get('categories', DEFAULT_CATEGORIES.slice()); }
function saveCategories(d)   { DB.set('categories', d); }
function loadCurrency()      { return DB.get('currency', '₹'); }
function saveCurrency(c)     { DB.set('currency', c); }
function loadTheme()         { return DB.get('theme', 'dark'); }
function saveTheme(t)        { DB.set('theme', t); }
function loadPersons()       { return DB.get('persons', []); }
function savePersons(d)      { DB.set('persons', d); }

const DEFAULT_CATEGORIES = [
  'Food', 'Rent', 'Transport', 'Entertainment',
  'Health', 'Shopping', 'Utilities', 'Education', 'Other'
];

let CURRENCY = loadCurrency();

function fmt(amount) {
  return CURRENCY + Number(amount).toFixed(2);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMonth(iso) {
  if (!iso) return '';
  const d = new Date(iso + '-01T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getCategoryIcon(cat) {
  const map = {
    'Food':'🍔','Rent':'🏠','Transport':'🚗','Entertainment':'🎬',
    'Health':'💊','Shopping':'🛍️','Utilities':'💡','Education':'📚',
    'Other':'📦'
  };
  return map[cat] || '💼';
}

// ─────────────────────────────────────────────
//  SECURITY: escape helpers
// ─────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ─────────────────────────────────────────────
//  PIN AUTH
//  PIN is hashed with djb2 before storing
// ─────────────────────────────────────────────

function hashPin(pin) {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h) ^ pin.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function loadPinHash()  { return DB.get('pinHash', null); }
function savePinHash(h) { DB.set('pinHash', h); }
function hasPinSet()    { return loadPinHash() !== null; }

let pinBuffer = '';
let pinMode   = 'unlock'; // 'unlock' | 'setup' | 'setup-confirm' | 'change' | 'change-new' | 'change-confirm'
let pinFirst  = '';

const PIN_LENGTH = 4;

function initLockScreen() {
  const hasPin = hasPinSet();
  pinMode   = hasPin ? 'unlock' : 'setup';
  pinBuffer = '';
  pinFirst  = '';
  updateLockSubtitle();
  updatePinDots();
  document.getElementById('lock-setup-hint').style.display = hasPin ? 'none' : 'block';
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('app-shell').hidden = true;
}

function updateLockSubtitle() {
  const el = document.getElementById('lock-subtitle');
  if      (pinMode === 'unlock')         el.textContent = 'Enter your PIN';
  else if (pinMode === 'setup')          el.textContent = 'Create a new PIN';
  else if (pinMode === 'setup-confirm')  el.textContent = 'Confirm your PIN';
  else if (pinMode === 'change')         el.textContent = 'Enter current PIN';
  else if (pinMode === 'change-new')     el.textContent = 'Enter new PIN';
  else if (pinMode === 'change-confirm') el.textContent = 'Confirm new PIN';
}

function updatePinDots() {
  for (let i = 0; i < PIN_LENGTH; i++) {
    document.getElementById('dot-' + i).classList.toggle('filled', i < pinBuffer.length);
  }
}

function pinInput(digit) {
  if (pinBuffer.length >= PIN_LENGTH) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === PIN_LENGTH) {
    setTimeout(processPinComplete, 120);
  }
}

function pinDelete() {
  if (pinBuffer.length > 0) {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  }
}

function showPinError(msg) {
  const el   = document.getElementById('pin-error');
  const dots = document.getElementById('pin-dots');
  el.textContent = msg;
  dots.classList.remove('shake');
  void dots.offsetWidth;
  dots.classList.add('shake');
  setTimeout(() => { el.textContent = ''; }, 2500);
}

function processPinComplete() {
  const entered = pinBuffer;
  pinBuffer = '';
  updatePinDots();

  if (pinMode === 'unlock') {
    if (hashPin(entered) === loadPinHash()) {
      unlockApp();
    } else {
      showPinError('Incorrect PIN. Try again.');
    }

  } else if (pinMode === 'setup') {
    pinFirst = entered;
    pinMode  = 'setup-confirm';
    updateLockSubtitle();

  } else if (pinMode === 'setup-confirm') {
    if (entered === pinFirst) {
      savePinHash(hashPin(entered));
      unlockApp();
    } else {
      showPinError("PINs don't match. Start again.");
      pinMode  = 'setup';
      pinFirst = '';
      updateLockSubtitle();
    }

  } else if (pinMode === 'change') {
    if (hashPin(entered) === loadPinHash()) {
      pinMode = 'change-new';
      updateLockSubtitle();
    } else {
      showPinError('Incorrect PIN.');
    }

  } else if (pinMode === 'change-new') {
    pinFirst = entered;
    pinMode  = 'change-confirm';
    updateLockSubtitle();

  } else if (pinMode === 'change-confirm') {
    if (entered === pinFirst) {
      savePinHash(hashPin(entered));
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('app-shell').hidden = false;
      showToast('PIN changed successfully!');
    } else {
      showPinError("PINs don't match. Try again.");
      pinMode  = 'change-new';
      pinFirst = '';
      updateLockSubtitle();
    }
  }
}

function unlockApp() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app-shell').hidden = false;
  renderDashboard();
  renderSettings();
}

function lockApp() {
  pinBuffer = '';
  pinMode   = hasPinSet() ? 'unlock' : 'setup';
  updateLockSubtitle();
  updatePinDots();
  document.getElementById('pin-error').textContent = '';
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('app-shell').hidden = true;
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = [
      'position:fixed',
      'bottom:calc(var(--nav-h) + 16px)',
      'left:50%',
      'transform:translateX(-50%) translateY(10px)',
      'background:var(--surface2)',
      'border:1px solid var(--border)',
      'color:var(--text)',
      'padding:10px 18px',
      'border-radius:999px',
      'font-size:13px',
      'font-weight:500',
      'box-shadow:var(--shadow)',
      'z-index:9000',
      'opacity:0',
      'transition:opacity 0.2s ease,transform 0.2s ease',
      'pointer-events:none',
      'white-space:nowrap'
    ].join(';');
    document.getElementById('app-shell').appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
  }, 2200);
}

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let currentTab       = 'dashboard';
let currentSubtab    = 'i-owe';
let txnFilterMonth   = '';
let txnFilterCat     = '';
let txnFilterType    = '';        // '' | 'income' | 'expense'
let txnSearch        = '';        // live search query
let txnSort          = 'newest';  // 'newest'|'oldest'|'highest'|'lowest'
let txnViewMode      = 'list';    // 'list' | 'calendar'
let calendarMonth    = todayISO().slice(0, 7); // 'YYYY-MM'
let calendarSelectedDay = '';     // 'YYYY-MM-DD' or ''
let confirmCallback  = null;
let fabOpen          = false;

// ─────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
const TAB_TITLES = {
  dashboard:    'Dashboard',
  transactions: 'Transactions',
  debts:        'Debts & Lending',
  settings:     'Settings'
};
const FAB_HIDDEN_TABS = ['settings'];

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('.nav-btn[data-tab="' + tab + '"]').classList.add('active');
  document.getElementById('headerTitle').textContent = TAB_TITLES[tab] || tab;

  const fab = document.getElementById('fab-btn');
  if (FAB_HIDDEN_TABS.includes(tab)) { fab.setAttribute('hidden', ''); }
  else { fab.removeAttribute('hidden'); }
  closeFabMenu();

  if (tab === 'dashboard')    renderDashboard();
  if (tab === 'transactions') renderTransactions();
  if (tab === 'debts')        renderDebts();
  if (tab === 'settings')     renderSettings();
}

function switchSubtab(subtab) {
  currentSubtab = subtab;
  document.querySelectorAll('.subtab-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.subtab-content').forEach(el => el.classList.remove('active'));
  document.querySelector('.subtab-btn[data-subtab="' + subtab + '"]').classList.add('active');
  document.getElementById('subtab-' + subtab).classList.add('active');
}

// ─────────────────────────────────────────────
//  FAB
// ─────────────────────────────────────────────
function openFabMenu() {
  fabOpen = true;
  document.getElementById('fab-btn').classList.add('open');
  document.getElementById('fab-menu').classList.add('open');
}
function closeFabMenu() {
  fabOpen = false;
  document.getElementById('fab-btn').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
}

// ─────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

function openConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  confirmCallback = cb;
  openModal('modal-confirm');
}

// ─────────────────────────────────────────────
//  PERSONS CRUD
// ─────────────────────────────────────────────
function addPerson(name) {
  const persons = loadPersons();
  const trimmed = name.trim();
  if (!trimmed || persons.includes(trimmed)) return false;
  persons.push(trimmed);
  savePersons(persons);
  return true;
}

function deletePerson(name) {
  savePersons(loadPersons().filter(p => p !== name));
}

// ─────────────────────────────────────────────
//  TRANSACTION CRUD
// ─────────────────────────────────────────────
function addTransaction(type, amount, category, note, date) {
  const txns = loadTransactions();
  txns.unshift({ id: uid(), type, amount: parseFloat(amount), category, note, date });
  saveTransactions(txns);
}

function deleteTransaction(id) {
  saveTransactions(loadTransactions().filter(t => t.id !== id));
}

function getMonthlyBalance() {
  const txns = loadTransactions();
  let income = 0, expense = 0;
  txns.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  });
  return { income, expense, balance: income - expense };
}

// ─────────────────────────────────────────────
//  DEBT CRUD
// ─────────────────────────────────────────────
function addDebt(direction, person, amount, note, date) {
  const debts = loadDebts();
  debts.unshift({ id: uid(), direction, person: person.trim(), amount: parseFloat(amount), note, date, settled: false });
  saveDebts(debts);
}

function settleDebt(id) {
  const debts = loadDebts();
  const debt  = debts.find(d => d.id === id);
  if (!debt) return;
  debt.settled     = true;
  debt.settledDate = todayISO();
  saveDebts(debts);
  const settlements = loadSettlements();
  settlements.unshift({
    id: uid(), debtId: debt.id, person: debt.person,
    direction: debt.direction, amount: debt.amount,
    note: debt.note, originalDate: debt.date, settledDate: debt.settledDate
  });
  saveSettlements(settlements);
}

function settleAllForPerson(person, direction) {
  const debts = loadDebts();
  const now   = todayISO();
  const settlements = loadSettlements();
  debts.forEach(d => {
    if (d.person === person && d.direction === direction && !d.settled) {
      d.settled     = true;
      d.settledDate = now;
      settlements.unshift({
        id: uid(), debtId: d.id, person: d.person,
        direction: d.direction, amount: d.amount,
        note: d.note, originalDate: d.date, settledDate: now
      });
    }
  });
  saveDebts(debts);
  saveSettlements(settlements);
}

function getDebtTotals() {
  const debts = loadDebts().filter(d => !d.settled);
  let iOwe = 0, theyOwe = 0;
  debts.forEach(d => {
    if (d.direction === 'i-owe') iOwe += d.amount;
    else theyOwe += d.amount;
  });
  return { iOwe, theyOwe };
}

function groupDebtsByPerson(direction, settled) {
  const debts = loadDebts().filter(d => d.direction === direction && d.settled === settled);
  const map = {};
  debts.forEach(d => {
    if (!map[d.person]) map[d.person] = [];
    map[d.person].push(d);
  });
  return map;
}

// ─────────────────────────────────────────────
//  RENDER: DASHBOARD
// ─────────────────────────────────────────────
function renderDashboard() {
  CURRENCY = loadCurrency();
  const { income, expense, balance } = getMonthlyBalance();
  const { iOwe, theyOwe } = getDebtTotals();

  document.getElementById('dash-income').textContent   = fmt(income);
  document.getElementById('dash-expense').textContent  = fmt(expense);
  document.getElementById('dash-balance').textContent  = fmt(balance);
  document.getElementById('dash-i-owe').textContent    = fmt(iOwe);
  document.getElementById('dash-they-owe').textContent = fmt(theyOwe);
  document.getElementById('txn-currency-sym').textContent  = CURRENCY;
  document.getElementById('debt-currency-sym').textContent = CURRENCY;

  const recent = loadTransactions().slice(0, 5);
  const list   = document.getElementById('dash-recent-list');
  const empty  = document.getElementById('dash-empty');
  if (recent.length) {
    list.innerHTML = recent.map(txnHTML).join('');
    empty.classList.remove('show');
  } else {
    list.innerHTML = '';
    empty.classList.add('show');
  }

  renderCategoryBreakdown();
}

// ─────────────────────────────────────────────
//  TRANSACTIONS VIEW MODE
// ─────────────────────────────────────────────
function switchTxnView(mode) {
  txnViewMode = mode;
  document.querySelectorAll('.view-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === mode)
  );
  if (mode === 'calendar') {
    // sync calendar month to current month filter (or today)
    calendarMonth = txnFilterMonth || todayISO().slice(0, 7);
    calendarSelectedDay = '';
  }
  renderTransactions();
}

// ─────────────────────────────────────────────
//  FILTERED TRANSACTIONS HELPER
// ─────────────────────────────────────────────
function getFilteredTransactions() {
  let txns = loadTransactions();
  if (txnFilterMonth) txns = txns.filter(t => t.date && t.date.startsWith(txnFilterMonth));
  if (txnFilterCat)   txns = txns.filter(t => t.category === txnFilterCat);
  if (txnFilterType)  txns = txns.filter(t => t.type === txnFilterType);
  if (txnSearch) {
    const q = txnSearch.toLowerCase();
    txns = txns.filter(t =>
      (t.note     && t.note.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))
    );
  }
  if (txnSort === 'oldest')  txns = txns.slice().sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  else if (txnSort === 'highest') txns = txns.slice().sort((a, b) => b.amount - a.amount);
  else if (txnSort === 'lowest')  txns = txns.slice().sort((a, b) => a.amount - b.amount);
  // 'newest' is default insertion order (unshift)
  return txns;
}

// ─────────────────────────────────────────────
//  RENDER: TRANSACTIONS
// ─────────────────────────────────────────────
function renderTransactions() {
  populateMonthFilter();
  populateCategoryFilter();

  const isCalendar = txnViewMode === 'calendar';
  document.getElementById('txn-list-view').style.display     = isCalendar ? 'none' : 'block';
  document.getElementById('txn-calendar-view').style.display = isCalendar ? 'block' : 'none';

  if (isCalendar) {
    renderCalendar();
    return;
  }

  const txns  = getFilteredTransactions();
  const list  = document.getElementById('txn-list');
  const empty = document.getElementById('txn-empty');

  if (txns.length === 0) {
    list.innerHTML = '';
    empty.classList.add('show');
  } else {
    empty.classList.remove('show');
    list.innerHTML = txns.map(txnHTML).join('');
  }
}

// ─────────────────────────────────────────────
//  RENDER: CALENDAR
// ─────────────────────────────────────────────
function renderCalendar() {
  const [year, month] = calendarMonth.split('-').map(Number);
  const monthDate     = new Date(year, month - 1, 1);
  document.getElementById('cal-month-title').textContent =
    monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Build day map for this month
  const allTxns = loadTransactions();
  const monthTxns = allTxns.filter(t => t.date && t.date.startsWith(calendarMonth));
  const dayMap = {};
  monthTxns.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { income: 0, expense: 0, txns: [] };
    dayMap[t.date].txns.push(t);
    if (t.type === 'income') dayMap[t.date].income += t.amount;
    else dayMap[t.date].expense += t.amount;
  });

  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth  = new Date(year, month, 0).getDate();
  const todayStr     = todayISO();
  let html = '';

  // Leading empty cells
  for (let i = 0; i < firstWeekday; i++) {
    html += '<div class="cal-cell cal-cell-empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calendarMonth + '-' + String(d).padStart(2, '0');
    const data    = dayMap[dateStr];
    const isToday = dateStr === todayStr;
    const isSel   = dateStr === calendarSelectedDay;

    let dots = '';
    if (data) {
      if (data.expense > 0) dots += '<span class="cal-dot cal-dot-expense"></span>';
      if (data.income  > 0) dots += '<span class="cal-dot cal-dot-income"></span>';
    }

    const cls = ['cal-cell',
      isToday ? 'cal-today'    : '',
      isSel   ? 'cal-selected' : '',
      data    ? 'cal-has-txn'  : ''
    ].filter(Boolean).join(' ');

    html += '<div class="' + cls + '" data-date="' + escAttr(dateStr) + '">'
      + '<span class="cal-day-num">' + d + '</span>'
      + (data ? '<div class="cal-day-dots">' + dots + '</div>' : '')
      + (data && data.expense > 0 ? '<div class="cal-day-amt">&minus;' + fmt(data.expense) + '</div>' : '')
      + '</div>';
  }

  document.getElementById('cal-grid').innerHTML = html;

  // Day detail
  const detail = document.getElementById('cal-day-detail');
  if (calendarSelectedDay && dayMap[calendarSelectedDay]) {
    const dayTxns = dayMap[calendarSelectedDay].txns;
    detail.innerHTML =
      '<div class="cal-detail-header">' + fmtDate(calendarSelectedDay)
      + ' <span class="cal-detail-count">' + dayTxns.length + ' item' + (dayTxns.length !== 1 ? 's' : '') + '</span></div>'
      + '<div class="transaction-list">' + dayTxns.map(txnHTML).join('') + '</div>';
  } else {
    detail.innerHTML = '';
  }
}

// ─────────────────────────────────────────────
//  RENDER: CATEGORY BREAKDOWN (dashboard)
// ─────────────────────────────────────────────
function renderCategoryBreakdown() {
  const currentMonth = todayISO().slice(0, 7);
  const label = document.getElementById('dash-month-label');
  if (label) label.textContent = fmtMonth(currentMonth);

  const txns = loadTransactions().filter(
    t => t.type === 'expense' && t.date && t.date.startsWith(currentMonth)
  );
  const breakdown = {};
  txns.forEach(t => {
    breakdown[t.category] = (breakdown[t.category] || 0) + t.amount;
  });
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted.length ? sorted[0][1] : 0;

  const el = document.getElementById('dash-category-breakdown');
  if (!el) return;
  if (sorted.length === 0) {
    el.innerHTML = '<div class="breakdown-empty">No expenses recorded this month.</div>';
    return;
  }
  el.innerHTML = sorted.map(([cat, amt]) => {
    const pct = max ? Math.round((amt / max) * 100) : 0;
    return '<div class="cat-bar-row">'
      + '<div class="cat-bar-label"><span class="cat-icon">' + getCategoryIcon(cat) + '</span><span class="cat-name">' + escHtml(cat) + '</span></div>'
      + '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="cat-bar-amt">' + fmt(amt) + '</div>'
      + '</div>';
  }).join('');
}

function txnHTML(t) {
  return '<div class="txn-item">'
    + '<div class="txn-icon ' + t.type + '">' + (t.type === 'income' ? '💰' : getCategoryIcon(t.category)) + '</div>'
    + '<div class="txn-details">'
    + '<div class="txn-category">' + escHtml(t.category) + '</div>'
    + '<div class="txn-meta">' + escHtml(t.note || '—') + '</div>'
    + '</div>'
    + '<div class="txn-right">'
    + '<div class="txn-amount ' + t.type + '">' + (t.type === 'expense' ? '−' : '+') + fmt(t.amount) + '</div>'
    + '<div class="txn-date">' + fmtDate(t.date) + '</div>'
    + '</div>'
    + '<button class="txn-delete" data-id="' + escAttr(t.id) + '" title="Delete">✕</button>'
    + '</div>';
}

function populateMonthFilter() {
  const sel    = document.getElementById('txn-filter-month');
  const txns   = loadTransactions();
  const months = [...new Set(txns.map(t => t.date ? t.date.slice(0,7) : null).filter(Boolean))].sort().reverse();
  const prev   = sel.value;
  sel.innerHTML = '<option value="">All Time</option>'
    + months.map(m => '<option value="' + m + '"' + (m === prev ? ' selected' : '') + '>' + fmtMonth(m) + '</option>').join('');
  if (prev) sel.value = prev;
}

function populateCategoryFilter() {
  const sel  = document.getElementById('txn-filter-cat');
  const cats = loadCategories();
  const prev = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>'
    + cats.map(c => '<option value="' + escAttr(c) + '"' + (c === prev ? ' selected' : '') + '>' + escHtml(c) + '</option>').join('');
  if (prev) sel.value = prev;
}

// ─────────────────────────────────────────────
//  RENDER: DEBTS
// ─────────────────────────────────────────────
function renderDebts() {
  renderDebtSubtab('i-owe',    false, 'i-owe-list',    'i-owe-empty');
  renderDebtSubtab('they-owe', false, 'they-owe-list', 'they-owe-empty');
  renderClearedDebts();
}

function renderDebtSubtab(direction, settled, listId, emptyId) {
  const grouped = groupDebtsByPerson(direction, settled);
  const list    = document.getElementById(listId);
  const empty   = document.getElementById(emptyId);
  const persons = Object.keys(grouped);

  if (persons.length === 0) {
    list.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');
  list.innerHTML = persons.map(p => personCardHTML(p, grouped[p], direction, false)).join('');
}

function renderClearedDebts() {
  const list  = document.getElementById('cleared-list');
  const empty = document.getElementById('cleared-empty');
  const debts = loadDebts().filter(d => d.settled);

  if (debts.length === 0) {
    list.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  const map = {};
  debts.forEach(d => {
    const key = d.person + '__' + d.direction;
    if (!map[key]) map[key] = { person: d.person, direction: d.direction, entries: [] };
    map[key].entries.push(d);
  });

  list.innerHTML = Object.values(map).map(g =>
    personCardHTML(g.person, g.entries, g.direction, true)
  ).join('');
}

function personCardHTML(person, entries, direction, settled) {
  const total    = entries.reduce((s, d) => s + d.amount, 0);
  const dirClass = settled ? 'cleared' : direction;
  const dirLabel = direction === 'i-owe' ? 'I Owe' : 'They Owe Me';
  const cardId   = 'card-' + encodeURIComponent(person) + '-' + direction;

  const entriesHTML = entries.map(d =>
    '<div class="debt-entry">'
    + '<div class="debt-entry-info">'
    + '<div class="debt-entry-note">' + escHtml(d.note || '(no note)') + '</div>'
    + '<div class="debt-entry-date">' + fmtDate(d.date) + (d.settledDate ? ' · Settled ' + fmtDate(d.settledDate) : '') + '</div>'
    + '</div>'
    + '<div class="debt-entry-amount ' + dirClass + '">' + fmt(d.amount) + '</div>'
    + (!settled ? '<div class="debt-entry-actions"><button class="btn-settle-one" data-debt-id="' + escAttr(d.id) + '" data-direction="' + escAttr(direction) + '" data-person="' + escAttr(person) + '">✓ Settle</button></div>' : '')
    + '</div>'
  ).join('');

  return '<div class="debt-person-card" id="' + escAttr(cardId) + '">'
    + '<div class="debt-person-header" data-card="' + escAttr(cardId) + '">'
    + '<div class="debt-person-avatar">' + escHtml(person.slice(0,1).toUpperCase()) + '</div>'
    + '<div class="debt-person-info">'
    + '<div class="debt-person-name">' + escHtml(person) + '</div>'
    + '<div class="debt-person-count">' + entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') + ' · ' + dirLabel + '</div>'
    + '</div>'
    + '<div class="debt-person-total ' + dirClass + '">' + fmt(total) + '</div>'
    + '<div class="debt-person-expand">▼</div>'
    + '</div>'
    + '<div class="debt-person-body">'
    + entriesHTML
    + (!settled
        ? '<div class="debt-card-footer"><button class="btn-settle-all" data-person="' + escAttr(person) + '" data-direction="' + escAttr(direction) + '">✓ Settle All for ' + escHtml(person) + '</button></div>'
        : '')
    + '</div>'
    + '</div>';
}

// ─────────────────────────────────────────────
//  RENDER: SETTINGS
// ─────────────────────────────────────────────
function renderSettings() {
  CURRENCY = loadCurrency();
  document.getElementById('currency-symbol').value = CURRENCY;
  renderPersonsList();
  renderCategoryChips();
}

function renderPersonsList() {
  const persons = loadPersons();
  const list    = document.getElementById('persons-list');
  if (persons.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:4px 0">No people added yet.</div>';
    return;
  }
  list.innerHTML = persons.map(p =>
    '<div class="person-row">'
    + '<div class="person-row-avatar">' + escHtml(p.slice(0,1).toUpperCase()) + '</div>'
    + '<div class="person-row-name">' + escHtml(p) + '</div>'
    + '<button class="person-row-del" data-person="' + escAttr(p) + '" title="Remove">&times;</button>'
    + '</div>'
  ).join('');
}

function renderCategoryChips() {
  const cats = loadCategories();
  const list = document.getElementById('category-list');
  list.innerHTML = cats.map(c =>
    '<span class="category-chip">'
    + escHtml(c)
    + (DEFAULT_CATEGORIES.includes(c) ? '' : '<button class="chip-del" data-cat="' + escAttr(c) + '" title="Remove">&times;</button>')
    + '</span>'
  ).join('');
}

// ─────────────────────────────────────────────
//  MODAL: ADD TRANSACTION
// ─────────────────────────────────────────────
function openAddTransactionModal() {
  setToggleActive('txn-type-toggle', 'expense');
  document.getElementById('txn-amount').value   = '';
  document.getElementById('txn-note').value     = '';
  document.getElementById('txn-date').value     = todayISO();
  document.getElementById('txn-currency-sym').textContent = loadCurrency();
  populateTxnCategorySelect();
  openModal('modal-txn');
  setTimeout(() => document.getElementById('txn-amount').focus(), 200);
}

function populateTxnCategorySelect() {
  const cats = loadCategories();
  const sel  = document.getElementById('txn-category');
  sel.innerHTML = cats.map(c => '<option value="' + escAttr(c) + '">' + escHtml(c) + '</option>').join('');
}

function saveTxnModal() {
  const type     = getToggleVal('txn-type-toggle');
  const amount   = parseFloat(document.getElementById('txn-amount').value);
  const category = document.getElementById('txn-category').value;
  const note     = document.getElementById('txn-note').value.trim();
  const date     = document.getElementById('txn-date').value || todayISO();

  if (!amount || amount <= 0) { showToast('Please enter a valid amount.'); return; }

  addTransaction(type, amount, category, note, date);
  closeModal('modal-txn');
  showToast('Transaction saved!');
  renderDashboard();
  if (currentTab === 'transactions') renderTransactions();
}

// ─────────────────────────────────────────────
//  MODAL: ADD DEBT
// ─────────────────────────────────────────────
function openAddDebtModal() {
  setToggleActive('debt-dir-toggle', 'i-owe');
  document.getElementById('debt-person').value  = '';
  document.getElementById('debt-amount').value  = '';
  document.getElementById('debt-note').value    = '';
  document.getElementById('debt-date').value    = todayISO();
  document.getElementById('debt-currency-sym').textContent = loadCurrency();
  renderDebtPersonChips('');
  openModal('modal-debt');
}

function renderDebtPersonChips(selected) {
  const persons   = loadPersons();
  const container = document.getElementById('debt-person-chips');
  if (persons.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = persons.map(p =>
    '<button class="person-chip' + (p === selected ? ' selected' : '') + '" data-person="' + escAttr(p) + '">'
    + '<span class="person-chip-av">' + escHtml(p.slice(0,1).toUpperCase()) + '</span>'
    + escHtml(p)
    + '</button>'
  ).join('');
}

function saveDebtModal() {
  const direction = getToggleVal('debt-dir-toggle');
  const selectedChip = document.querySelector('#debt-person-chips .person-chip.selected');
  const person = selectedChip
    ? selectedChip.dataset.person
    : document.getElementById('debt-person').value.trim();

  const amount = parseFloat(document.getElementById('debt-amount').value);
  const note   = document.getElementById('debt-note').value.trim();
  const date   = document.getElementById('debt-date').value || todayISO();

  if (!person) { showToast('Please select or enter a person.'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount.'); return; }

  addDebt(direction, person, amount, note, date);
  closeModal('modal-debt');
  showToast('Debt entry saved!');
  renderDashboard();
  if (currentTab === 'debts') renderDebts();
}

// ─────────────────────────────────────────────
//  TOGGLE HELPERS
// ─────────────────────────────────────────────
function setToggleActive(groupId, val) {
  document.getElementById(groupId).querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
  });
}

function getToggleVal(groupId) {
  const btn = document.querySelector('#' + groupId + ' .toggle-btn.active');
  return btn ? btn.dataset.val : null;
}

// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────
function exportData() {
  const data = {
    exportedAt:   new Date().toISOString(),
    transactions: loadTransactions(),
    debts:        loadDebts(),
    settlements:  loadSettlements(),
    categories:   loadCategories(),
    persons:      loadPersons()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'expense-tracker-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Data exported!');
}

// ─────────────────────────────────────────────
//  CLEAR ALL
// ─────────────────────────────────────────────
function clearAllData() {
  ['transactions','debts','settlements','categories','persons'].forEach(k => DB.remove(k));
  CURRENCY = loadCurrency();
  renderDashboard();
  renderSettings();
  showToast('All data cleared.');
}

// ─────────────────────────────────────────────
//  EVENT BINDING
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Apply saved theme immediately
  applyTheme(loadTheme());

  // Init lock screen
  initLockScreen();

  // PIN KEYPAD
  document.getElementById('pin-del').addEventListener('click', pinDelete);
  document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 150);
      pinInput(btn.dataset.digit);
    });
  });

  // BOTTOM NAV
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // HEADER BUTTONS
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  });
  document.getElementById('lockBtn').addEventListener('click', lockApp);

  // FAB
  document.getElementById('fab-btn').addEventListener('click', () => {
    if (fabOpen) closeFabMenu(); else openFabMenu();
  });
  document.getElementById('fab-add-txn').addEventListener('click', () => { closeFabMenu(); openAddTransactionModal(); });
  document.getElementById('fab-add-debt').addEventListener('click', () => { closeFabMenu(); openAddDebtModal(); });
  document.addEventListener('click', e => {
    if (fabOpen && !e.target.closest('#fab-btn') && !e.target.closest('#fab-menu')) closeFabMenu();
  });

  // TRANSACTION MODAL
  document.getElementById('txn-cancel').addEventListener('click', () => closeModal('modal-txn'));
  document.getElementById('txn-save').addEventListener('click', saveTxnModal);
  document.getElementById('modal-txn').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-txn');
  });
  document.getElementById('txn-type-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) setToggleActive('txn-type-toggle', btn.dataset.val);
  });

  // DEBT MODAL
  document.getElementById('debt-cancel').addEventListener('click', () => closeModal('modal-debt'));
  document.getElementById('debt-save').addEventListener('click', saveDebtModal);
  document.getElementById('modal-debt').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modal-debt');
    const chip = e.target.closest('.person-chip');
    if (chip) {
      const isSelected = chip.classList.contains('selected');
      const person = chip.dataset.person;
      renderDebtPersonChips(isSelected ? '' : person);
      document.getElementById('debt-person').value = isSelected ? '' : person;
    }
  });
  document.getElementById('debt-dir-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) setToggleActive('debt-dir-toggle', btn.dataset.val);
  });

  // CONFIRM MODAL
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    confirmCallback = null; closeModal('modal-confirm');
  });
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
    closeModal('modal-confirm');
  });
  document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target === e.currentTarget) { confirmCallback = null; closeModal('modal-confirm'); }
  });

  // DEBT SUBTABS
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSubtab(btn.dataset.subtab));
  });

  // TRANSACTION FILTERS
  document.getElementById('txn-filter-month').addEventListener('change', e => {
    txnFilterMonth = e.target.value; renderTransactions();
  });
  document.getElementById('txn-filter-cat').addEventListener('change', e => {
    txnFilterCat = e.target.value; renderTransactions();
  });

  // SORT
  document.getElementById('txn-sort').addEventListener('change', e => {
    txnSort = e.target.value; renderTransactions();
  });

  // TYPE FILTER PILLS
  document.getElementById('txn-filter-type').addEventListener('click', e => {
    const btn = e.target.closest('.type-pill');
    if (!btn) return;
    document.querySelectorAll('#txn-filter-type .type-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    txnFilterType = btn.dataset.type;
    renderTransactions();
  });

  // SEARCH (debounced)
  let searchTimer;
  document.getElementById('txn-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      txnSearch = e.target.value.trim();
      renderTransactions();
    }, 220);
  });

  // VIEW TOGGLE (List / Calendar)
  document.getElementById('view-list-btn').addEventListener('click', () => switchTxnView('list'));
  document.getElementById('view-cal-btn').addEventListener('click', () => switchTxnView('calendar'));

  // CALENDAR NAVIGATION
  document.getElementById('cal-prev').addEventListener('click', () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const prev   = new Date(y, m - 2, 1);
    calendarMonth = prev.toISOString().slice(0, 7);
    calendarSelectedDay = '';
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const next   = new Date(y, m, 1);
    calendarMonth = next.toISOString().slice(0, 7);
    calendarSelectedDay = '';
    renderCalendar();
  });

  // CALENDAR DAY CLICK (delegated)
  document.getElementById('cal-grid').addEventListener('click', e => {
    const cell = e.target.closest('.cal-cell[data-date]');
    if (!cell) return;
    const date = cell.dataset.date;
    calendarSelectedDay = (calendarSelectedDay === date) ? '' : date;
    renderCalendar();
  });

  // DELEGATED: main content area
  document.querySelector('.app-main').addEventListener('click', e => {

    // Delete transaction
    const delBtn = e.target.closest('.txn-delete');
    if (delBtn) {
      e.stopPropagation();
      openConfirm('Delete Transaction', 'Permanently delete this transaction?', () => {
        deleteTransaction(delBtn.dataset.id);
        renderDashboard();
        if (currentTab === 'transactions') renderTransactions();
      });
    }

    // Expand/collapse person card
    const header = e.target.closest('.debt-person-header');
    if (header && !e.target.closest('button')) {
      const card = document.getElementById(header.dataset.card);
      if (card) card.classList.toggle('expanded');
    }

    // Settle single entry
    const settleOne = e.target.closest('.btn-settle-one');
    if (settleOne) {
      const person = settleOne.dataset.person;
      openConfirm('Settle Entry', 'Mark this entry with ' + person + ' as settled?', () => {
        settleDebt(settleOne.dataset.debtId);
        renderDebts();
        renderDashboard();
        showToast('Entry settled!');
      });
    }

    // Settle all for person
    const settleAll = e.target.closest('.btn-settle-all');
    if (settleAll) {
      const person    = settleAll.dataset.person;
      const direction = settleAll.dataset.direction;
      openConfirm('Settle All', 'Mark all entries with ' + person + ' as cleared?', () => {
        settleAllForPerson(person, direction);
        renderDebts();
        renderDashboard();
        showToast('All entries settled!');
      });
    }
  });

  // SETTINGS: currency
  document.getElementById('save-currency').addEventListener('click', () => {
    const val = document.getElementById('currency-symbol').value.trim();
    if (val) { CURRENCY = val; saveCurrency(val); renderDashboard(); showToast('Currency saved!'); }
  });

  // SETTINGS: add person
  document.getElementById('add-person-btn').addEventListener('click', () => {
    const input = document.getElementById('new-person-input');
    const name  = input.value.trim();
    if (!name) return;
    if (!addPerson(name)) { showToast('Person already exists.'); return; }
    input.value = '';
    renderPersonsList();
    showToast(name + ' added!');
  });
  document.getElementById('new-person-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-person-btn').click();
  });

  // SETTINGS: delete person (delegated)
  document.getElementById('persons-list').addEventListener('click', e => {
    const btn = e.target.closest('.person-row-del');
    if (btn) {
      openConfirm('Remove Person', 'Remove "' + btn.dataset.person + '" from your people list?', () => {
        deletePerson(btn.dataset.person);
        renderPersonsList();
        showToast('Person removed.');
      });
    }
  });

  // SETTINGS: add category
  document.getElementById('add-category-btn').addEventListener('click', () => {
    const input = document.getElementById('new-category-input');
    const name  = input.value.trim();
    if (!name) return;
    const cats = loadCategories();
    if (cats.includes(name)) { showToast('Category already exists.'); return; }
    cats.push(name);
    saveCategories(cats);
    input.value = '';
    renderCategoryChips();
    showToast('"' + name + '" added!');
  });

  // SETTINGS: remove category (delegated)
  document.getElementById('category-list').addEventListener('click', e => {
    const btn = e.target.closest('.chip-del');
    if (btn) {
      openConfirm('Remove Category', 'Remove the category "' + btn.dataset.cat + '"?', () => {
        saveCategories(loadCategories().filter(c => c !== btn.dataset.cat));
        renderCategoryChips();
      });
    }
  });

  // SETTINGS: change PIN
  document.getElementById('change-pin-btn').addEventListener('click', () => {
    pinMode  = hasPinSet() ? 'change' : 'setup';
    pinBuffer = '';
    pinFirst  = '';
    updateLockSubtitle();
    updatePinDots();
    document.getElementById('pin-error').textContent = '';
    document.getElementById('lock-setup-hint').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
    document.getElementById('app-shell').hidden = true;
  });

  // SETTINGS: export
  document.getElementById('export-btn').addEventListener('click', exportData);

  // SETTINGS: clear all
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    openConfirm(
      'Clear All Data',
      'Permanently delete ALL transactions, debts, settlements, and people? This cannot be undone.',
      clearAllData
    );
  });

  // Keyboard support for PIN
  document.addEventListener('keydown', e => {
    if (document.getElementById('lock-screen').style.display !== 'none') {
      if (/^[0-9]$/.test(e.key)) pinInput(e.key);
      if (e.key === 'Backspace')  pinDelete();
    }
  });
});
