/* =============================================
   FINANCE TRACKER - Core Application Logic
   Firebase Firestore + Google Auth Edition
   ============================================= */

// ---- Installment Helpers ----
function toggleInstallmentFields(enabled) {
    const installEl = document.getElementById('installmentFields');
    const nonEl = document.getElementById('nonInstallmentFields');
    if (installEl) installEl.style.display = enabled ? 'block' : 'none';
    if (nonEl) nonEl.style.display = enabled ? 'none' : 'contents';
}

function autoCalcInstallment() {
    const f = document.getElementById('friendForm');
    if (!f) return;
    const total = parseFloat(f.friendAmount?.value) || 0;
    const count = parseInt(f.friendTotalInstallments?.value) || 0;
    const amtField = document.getElementById('friendInstallmentAmountField');
    if (amtField && total > 0 && count > 0) {
        amtField.value = (total / count).toFixed(2);
    }
}

function nextDueDateFromFrequency(dateStr, frequency) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
    else d.setMonth(d.getMonth() + 1); // monthly
    return d.toISOString().split('T')[0];
}

// ---- Firebase References (set after init) ----
let auth = null;
let db = null;
let currentUser = null;
let _unsubscribers = [];

// ---- State ----
const STATE = {
    creditCards: [],
    loans: [],
    friends: [],
    settings: {
        currency: '₱',
        reminderDays: 7,
        darkMode: true,
        notificationsEnabled: false,
    },
    activeTab: 'dashboard',
    searchQuery: '',
    editingId: null,
    editingType: null,
    firestoreReady: false,
};

// ---- Check if Firebase is configured ----
function isFirebaseConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
        FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
}

// ---- Initialize Firebase ----
function initFirebase() {
    if (!isFirebaseConfigured()) {
        console.warn('Firebase not configured. Using localStorage only.');
        showApp();
        loadFromLocalStorage();
        return;
    }

    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();

        // Enable offline persistence (works offline, syncs when back online)
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code === 'failed-precondition') console.warn('Persistence: multi-tab conflict');
            else if (err.code === 'unimplemented') console.warn('Persistence not supported');
        });

        // Listen for auth state changes
        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                updateUserUI(user);
                showApp();
                subscribeToFirestore();
                loadSettingsFromFirestore();
            } else {
                currentUser = null;
                _unsubscribers.forEach(u => u());
                _unsubscribers = [];
                showSignIn();
            }
        });
    } catch (e) {
        console.error('Firebase init error:', e);
        showApp();
        loadFromLocalStorage();
    }
}

// ---- Auth: Google Sign-In ----
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
        console.error(err);
        toast('Sign-in failed: ' + err.message, 'error');
    });
}

function signOut() {
    if (!auth) return;
    auth.signOut().then(() => toast('Signed out.', 'info'));
}

// ---- UI: Show / hide sign-in vs app ----
function showSignIn() {
    document.getElementById('signInScreen').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
}

function showApp() {
    document.getElementById('signInScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    document.getElementById('userSection').style.display = isFirebaseConfigured() ? 'flex' : 'none';
}

function updateUserUI(user) {
    const el = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    if (el) el.src = user.photoURL || '';
    if (name) name.textContent = user.displayName?.split(' ')[0] || 'User';
}

// ---- Firestore: User root document ----
function userRef() {
    return db.collection('users').doc(currentUser.uid);
}

// ---- Firestore: Real-time listeners ----
function subscribeToFirestore() {
    _unsubscribers.forEach(u => u());
    _unsubscribers = [];

    const listen = (col, stateKey) => {
        const unsub = userRef().collection(col)
            .onSnapshot(snapshot => {
                STATE[stateKey] = snapshot.docs.map(d => d.data());
                // Also update localStorage as offline cache
                localStorage.setItem('ft_' + col, JSON.stringify(STATE[stateKey]));
                renderPage(STATE.activeTab);
                updateNotifBadge();
            }, err => {
                console.error('Snapshot error', col, err);
            });
        _unsubscribers.push(unsub);
    };

    listen('creditCards', 'creditCards');
    listen('loans', 'loans');
    listen('friends', 'friends');
    STATE.firestoreReady = true;
}

// ---- Firestore: Write helpers ----
async function fsSet(col, data) {
    if (!currentUser || !db) { saveLocalOnly(col, data); return; }
    try {
        await userRef().collection(col).doc(data.id).set(data);
    } catch (e) {
        console.error('Firestore set error:', e);
        toast('Sync error — saved locally.', 'error');
        saveLocalOnly(col, data);
    }
}

async function fsDelete(col, id) {
    if (!currentUser || !db) { return; }
    try {
        await userRef().collection(col).doc(id).delete();
    } catch (e) {
        console.error('Firestore delete error:', e);
        toast('Sync error on delete.', 'error');
    }
}

// ---- Firestore: Settings ----
async function loadSettingsFromFirestore() {
    if (!currentUser || !db) return;
    try {
        const snap = await userRef().get();
        if (snap.exists && snap.data().settings) {
            STATE.settings = { ...STATE.settings, ...snap.data().settings };
            applySettings();
        }
    } catch (e) { /* use defaults */ }
}

async function saveSettingsToFirestore() {
    if (!currentUser || !db) {
        localStorage.setItem('ft_settings', JSON.stringify(STATE.settings));
        return;
    }
    try {
        await userRef().set({ settings: STATE.settings }, { merge: true });
        localStorage.setItem('ft_settings', JSON.stringify(STATE.settings));
    } catch (e) {
        localStorage.setItem('ft_settings', JSON.stringify(STATE.settings));
    }
}

// ---- Persistence: localStorage fallback ----
function saveLocalOnly(col, data) {
    const arr = JSON.parse(localStorage.getItem('ft_' + col) || '[]');
    const idx = arr.findIndex(x => x.id === data.id);
    if (idx >= 0) arr[idx] = data; else arr.push(data);
    localStorage.setItem('ft_' + col, JSON.stringify(arr));
}

function loadFromLocalStorage() {
    try {
        const cc = localStorage.getItem('ft_creditCards');
        const loans = localStorage.getItem('ft_loans');
        const friends = localStorage.getItem('ft_friends');
        const settings = localStorage.getItem('ft_settings');
        if (cc) STATE.creditCards = JSON.parse(cc);
        if (loans) STATE.loans = JSON.parse(loans);
        if (friends) STATE.friends = JSON.parse(friends);
        if (settings) STATE.settings = { ...STATE.settings, ...JSON.parse(settings) };
    } catch (e) { console.error(e); }
}

// ---- Unified save ----
async function saveRecord(col, record) {
    if (currentUser && db) {
        await fsSet(col, record);
        // onSnapshot will update STATE automatically
    } else {
        // localStorage-only mode
        saveLocalOnly(col, record);
        const arr = JSON.parse(localStorage.getItem('ft_' + col) || '[]');
        STATE[col] = arr;
        renderPage(STATE.activeTab);
        updateNotifBadge();
    }
}

async function deleteRecord(col, id) {
    if (currentUser && db) {
        await fsDelete(col, id);
        // onSnapshot will update STATE automatically
    } else {
        const arr = JSON.parse(localStorage.getItem('ft_' + col) || '[]').filter(x => x.id !== id);
        localStorage.setItem('ft_' + col, JSON.stringify(arr));
        STATE[col] = arr;
        renderPage(STATE.activeTab);
        updateNotifBadge();
    }
}

// ---- ID Generator ----
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ---- Date Utilities ----
function today() {
    return new Date().toISOString().split('T')[0];
}

function daysDiff(dateStr) {
    if (!dateStr) return null;
    const due = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getUrgency(dateStr) {
    const diff = daysDiff(dateStr);
    if (diff === null) return 'none';
    if (diff < 0) return 'overdue';
    if (diff <= STATE.settings.reminderDays) return 'soon';
    return 'ok';
}

function formatDaysLabel(diff) {
    if (diff === null) return '';
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Due Today!';
    if (diff === 1) return 'Due Tomorrow';
    return `${diff}d left`;
}

// ---- Currency ----
function fmt(amount) {
    const n = parseFloat(amount) || 0;
    return STATE.settings.currency + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Toast ----
function toast(msg, type = 'success') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// ---- Apply Settings ----
function applySettings() {
    document.body.classList.toggle('light', !STATE.settings.darkMode);
}

// ---- Navigation ----
function navigate(tab) {
    STATE.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    document.querySelectorAll('.page').forEach(el => {
        el.classList.toggle('active', el.id === 'page-' + tab);
    });
    const titles = {
        dashboard: ['Dashboard', 'Welcome back! Here\'s your financial overview.'],
        cards: ['Credit Cards', 'Manage your credit cards and track statement dates.'],
        loans: ['Loans & Lending Apps', 'Monitor your personal loans and borrowings.'],
        friends: ['Lent to Friends', 'Track money you lent to friends and family.'],
        settings: ['Settings', 'Customize your Finance Tracker experience.'],
    };
    const [title, subtitle] = titles[tab] || ['', ''];
    document.getElementById('topbarTitle').textContent = title;
    document.getElementById('topbarSubtitle').textContent = subtitle;
    renderPage(tab);
    closeMobileSidebar();
}

function renderPage(tab) {
    if (tab === 'dashboard') renderDashboard();
    else if (tab === 'cards') renderCards();
    else if (tab === 'loans') renderLoans();
    else if (tab === 'friends') renderFriends();
    else if (tab === 'settings') renderSettings();
}

// ---- Notifications ----
function getUpcomingDues(daysWindow) {
    const items = [];
    const window = daysWindow ?? STATE.settings.reminderDays;

    STATE.creditCards.forEach(c => {
        const diff = daysDiff(c.dueDate);
        if (diff !== null && diff <= window) {
            items.push({ type: 'card', name: c.name, bank: c.bank, amount: c.minimumPayment || c.balance, dueDate: c.dueDate, diff, id: c.id });
        }
    });

    STATE.loans.forEach(l => {
        const diff = daysDiff(l.dueDate);
        if (diff !== null && diff <= window) {
            items.push({ type: 'loan', name: l.name, bank: l.lender, amount: l.monthlyPayment || l.balance, dueDate: l.dueDate, diff, id: l.id });
        }
    });

    STATE.friends.forEach(f => {
        if (f.status === 'paid') return;
        const diff = daysDiff(f.dueDate);
        if (diff !== null && diff <= window) {
            items.push({ type: 'friend', name: f.name, bank: 'Lent money', amount: f.amount - (f.paidAmount || 0), dueDate: f.dueDate, diff, id: f.id });
        }
    });

    return items.sort((a, b) => a.diff - b.diff);
}

function updateNotifBadge() {
    const items = getUpcomingDues(STATE.settings.reminderDays);
    const overdue = items.filter(i => i.diff < 0).length;
    const badge = document.getElementById('notifBadge');
    const navBadge = document.getElementById('navBadge');
    if (overdue > 0) {
        badge.classList.remove('hidden');
        navBadge.textContent = overdue;
        navBadge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        navBadge.classList.add('hidden');
    }
}

function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                STATE.settings.notificationsEnabled = true;
                saveSettingsToFirestore();
                toast('Browser notifications enabled!', 'success');
                renderPage('settings');
            }
        });
    }
}

function sendBrowserNotifications() {
    if (!STATE.settings.notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const items = getUpcomingDues(STATE.settings.reminderDays);
    items.filter(i => i.diff <= 3).forEach(item => {
        const tag = `ft-${item.id}`;
        const label = item.diff < 0 ? `OVERDUE by ${Math.abs(item.diff)} days` : item.diff === 0 ? 'Due TODAY' : `Due in ${item.diff} day(s)`;
        new Notification(`💰 Finance Tracker: ${item.name}`, {
            body: `${label} — ${fmt(item.amount)}`,
            tag,
        });
    });
}

// =============================================
// DASHBOARD
// =============================================
function renderDashboard() {
    const totalCC = STATE.creditCards.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0);
    const totalLoans = STATE.loans.reduce((s, l) => s + (parseFloat(l.balance) || 0), 0);
    const totalLent = STATE.friends.filter(f => f.status !== 'paid').reduce((s, f) => s + (parseFloat(f.amount) - (parseFloat(f.paidAmount) || 0)), 0);
    const totalOwed = totalCC + totalLoans;
    const upcoming = getUpcomingDues(STATE.settings.reminderDays);
    const overdue = upcoming.filter(i => i.diff < 0).length;

    document.getElementById('statTotalOwed').textContent = fmt(totalOwed);
    document.getElementById('statTotalCC').textContent = fmt(totalCC);
    document.getElementById('statTotalLoans').textContent = fmt(totalLoans);
    document.getElementById('statTotalLent').textContent = fmt(totalLent);
    document.getElementById('statUpcoming').textContent = upcoming.length;

    const overdueEl = document.getElementById('statOverdueBadge');
    if (overdueEl) {
        overdueEl.textContent = overdue + ' overdue';
        overdueEl.style.display = overdue > 0 ? 'inline-flex' : 'none';
    }

    const listEl = document.getElementById('upcomingDuesList');
    if (upcoming.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding:30px 0">
      <span class="empty-icon">🎉</span>
      <h3>All clear!</h3>
      <p>No upcoming dues within the next ${STATE.settings.reminderDays} days.</p>
    </div>`;
    } else {
        listEl.innerHTML = upcoming.slice(0, 8).map(item => {
            const urgency = item.diff < 0 ? 'overdue' : item.diff <= 3 ? 'soon' : 'ok';
            const icon = item.type === 'card' ? '💳' : item.type === 'loan' ? '🏦' : '👤';
            const iconBg = item.type === 'card' ? 'var(--blue-bg)' : item.type === 'loan' ? 'var(--purple-bg)' : 'var(--green-bg)';
            return `<div class="due-item">
        <div class="due-item-icon" style="background:${iconBg}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="due-item-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
          <div class="due-item-sub">${item.bank || ''} · ${formatDate(item.dueDate)}</div>
        </div>
        <div class="due-item-right">
          <div class="due-item-amount">${fmt(item.amount)}</div>
          <div class="due-item-days ${urgency}">${formatDaysLabel(item.diff)}</div>
        </div>
      </div>`;
        }).join('');
    }

    renderChart();
    updateNotifBadge();
}

function renderChart() {
    const ctx = document.getElementById('paymentChart');
    if (!ctx) return;
    if (window._ftChart) window._ftChart.destroy();

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    }

    const ccBase = STATE.creditCards.reduce((s, c) => s + (parseFloat(c.minimumPayment) || 0), 0);
    const loanBase = STATE.loans.reduce((s, l) => s + (parseFloat(l.monthlyPayment) || 0), 0);
    const ccData = months.map(() => ccBase > 0 ? ccBase * (0.85 + Math.random() * 0.3) : 0);
    const loanData = months.map(() => loanBase);

    window._ftChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Credit Cards', data: ccData, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6, borderSkipped: false },
                { label: 'Loans', data: loanData, backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 6, borderSkipped: false },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#8b90a7', font: { family: 'Inter', size: 11 }, boxWidth: 12, boxHeight: 12 } },
                tooltip: { callbacks: { label: ctx => ` ${STATE.settings.currency}${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}` } },
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#545870', font: { family: 'Inter', size: 11 } } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#545870', font: { family: 'Inter', size: 11 }, callback: v => STATE.settings.currency + v.toLocaleString() } },
            },
        },
    });
}

// =============================================
// CREDIT CARDS
// =============================================
function renderCards() {
    const filtered = filterItems(STATE.creditCards);
    const el = document.getElementById('cardsList');
    if (!filtered.length) {
        el.innerHTML = emptyState('💳', 'No credit cards yet', 'Add your first credit card to start tracking statement dates and due dates.');
        return;
    }

    el.innerHTML = '';
    filtered.forEach(c => {
        const paidThisCycle = c.paidAt === today();
        const urgency = paidThisCycle ? 'none' : getUrgency(c.dueDate);
        const diff = paidThisCycle ? null : daysDiff(c.dueDate);
        const utilPct = c.creditLimit ? Math.min(100, (parseFloat(c.balance) / parseFloat(c.creditLimit)) * 100) : 0;
        const utilColor = utilPct >= 90 ? 'red' : utilPct >= 60 ? 'yellow' : 'green';
        const colors = ['linear-gradient(135deg,#1e1b4b,#312e81)', 'linear-gradient(135deg,#0f172a,#1e3a5f)', 'linear-gradient(135deg,#1a1a2e,#6b21a8)', 'linear-gradient(135deg,#0c1220,#065f46)', 'linear-gradient(135deg,#3b0764,#6d28d9)'];
        const bg = colors[Math.abs(c.id.charCodeAt(0)) % colors.length];
        const card = document.createElement('div');
        card.className = `item-card urgency-${urgency}`;
        card.innerHTML = `
      <div class="cc-visual" style="background:${bg}">
        <div class="cc-bank" style="color:#fff">${c.bank || 'My Bank'}</div>
        <div class="cc-num" style="color:#fff">•••• •••• •••• ${c.lastFour || '0000'}</div>
      </div>
      <div class="item-card-header">
        <div>
          <div class="item-card-title">${c.name}</div>
          <div class="item-card-subtitle">Due: ${formatDate(c.dueDate)} · Statement: ${c.statementDate ? `Day ${c.statementDate}` : '—'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          ${paidThisCycle
                ? `<span class="badge badge-paid">✅ Paid</span>`
                : `<span class="badge badge-${urgency}">${urgency === 'overdue' ? '🔴' : urgency === 'soon' ? '🟡' : '🟢'} ${urgency === 'none' ? 'No Date' : urgency.charAt(0).toUpperCase() + urgency.slice(1)}</span>`
            }
          <div class="item-card-actions">
            ${!paidThisCycle ? `<button class="item-btn pay" onclick="markCardPaid('${c.id}')" title="Mark as Paid">✅</button>` : ''}
            <button class="item-btn edit" onclick="openEditCard('${c.id}')" title="Edit">✏️</button>
            <button class="item-btn delete" onclick="deleteCard('${c.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
      <div class="info-grid">
        <div><div class="info-item-label">Outstanding</div><div class="info-item-value" style="color:${paidThisCycle ? 'var(--green)' : 'var(--red)'}">${fmt(c.balance)}</div></div>
        <div><div class="info-item-label">Min. Payment</div><div class="info-item-value">${fmt(c.minimumPayment)}</div></div>
        <div><div class="info-item-label">Credit Limit</div><div class="info-item-value">${fmt(c.creditLimit)}</div></div>
        <div><div class="info-item-label">Interest Rate</div><div class="info-item-value">${c.interestRate || 0}% / mo</div></div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar ${utilColor}" style="width:${utilPct.toFixed(1)}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)">
        <span>Utilization: ${utilPct.toFixed(0)}%</span>
        ${diff !== null ? `<span class="due-item-days ${urgency === 'overdue' ? 'overdue' : urgency === 'soon' ? 'soon' : 'ok'}">${formatDaysLabel(diff)}</span>` : ''}
      </div>
      ${paidThisCycle ? `<div style="margin-top:10px;font-size:12px;color:var(--green);background:var(--green-bg);padding:8px 10px;border-radius:8px;font-weight:600">🎉 Paid on ${formatDate(c.paidAt)} — next due ${formatDate(c.dueDate)}</div>` : ''}
      ${c.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);background:var(--bg-input);padding:8px 10px;border-radius:8px">${c.notes}</div>` : ''}
    `;
        el.appendChild(card);
    });
}

function openAddCard() { openCardModal(); }
function openEditCard(id) {
    const c = STATE.creditCards.find(x => x.id === id);
    if (c) openCardModal(c);
}

function openCardModal(data = null) {
    STATE.editingId = data ? data.id : null;
    STATE.editingType = 'card';
    const isEdit = !!data;
    document.getElementById('cardModalTitle').textContent = isEdit ? 'Edit Credit Card' : 'Add Credit Card';
    const f = document.getElementById('cardForm');
    f.cardName.value = data?.name || '';
    f.cardBank.value = data?.bank || '';
    f.cardLastFour.value = data?.lastFour || '';
    f.cardBalance.value = data?.balance || '';
    f.cardCreditLimit.value = data?.creditLimit || '';
    f.cardMinPayment.value = data?.minimumPayment || '';
    f.cardInterestRate.value = data?.interestRate || '';
    f.cardStatementDate.value = data?.statementDate || '';
    f.cardDueDate.value = data?.dueDate || '';
    f.cardNotes.value = data?.notes || '';
    openModal('cardModal');
}

async function saveCard() {
    const f = document.getElementById('cardForm');
    const name = f.cardName.value.trim();
    if (!name) { toast('Card name is required.', 'error'); return; }
    const record = {
        id: STATE.editingId || genId(),
        name,
        bank: f.cardBank.value.trim(),
        lastFour: f.cardLastFour.value.trim(),
        balance: parseFloat(f.cardBalance.value) || 0,
        creditLimit: parseFloat(f.cardCreditLimit.value) || 0,
        minimumPayment: parseFloat(f.cardMinPayment.value) || 0,
        interestRate: parseFloat(f.cardInterestRate.value) || 0,
        statementDate: f.cardStatementDate.value,
        dueDate: f.cardDueDate.value,
        notes: f.cardNotes.value.trim(),
        createdAt: STATE.editingId ? (STATE.creditCards.find(x => x.id === STATE.editingId)?.createdAt || today()) : today(),
        updatedAt: today(),
    };
    await saveRecord('creditCards', record);
    toast(STATE.editingId ? 'Credit card updated!' : 'Credit card added!', 'success');
    closeModal('cardModal');
}

async function deleteCard(id) {
    if (!confirm('Delete this credit card?')) return;
    await deleteRecord('creditCards', id);
    if (!currentUser) renderCards();
    toast('Credit card removed.', 'info');
}

async function markCardPaid(id) {
    const c = STATE.creditCards.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Mark "${c.name}" as paid for this month?\nThis will reset the balance to ₱0 and advance the due date by 30 days.`)) return;
    let newDueDate = c.dueDate;
    if (c.dueDate) {
        const d = new Date(c.dueDate + 'T00:00:00');
        d.setDate(d.getDate() + 30);
        newDueDate = d.toISOString().split('T')[0];
    }
    const updated = { ...c, balance: 0, paidAt: today(), dueDate: newDueDate, updatedAt: today() };
    await saveRecord('creditCards', updated);
    toast(`${c.name} marked as paid! 🎉`, 'success');
}

// =============================================
// LOANS
// =============================================
function renderLoans() {
    const filtered = filterItems(STATE.loans);
    const el = document.getElementById('loansList');
    if (!filtered.length) {
        el.innerHTML = emptyState('🏦', 'No loans added', 'Add a personal loan or lending app to track your monthly payments.');
        return;
    }

    el.innerHTML = '';
    filtered.forEach(l => {
        const urgency = getUrgency(l.dueDate);
        const diff = daysDiff(l.dueDate);
        const paidPct = l.principal ? Math.min(100, ((parseFloat(l.principal) - parseFloat(l.balance)) / parseFloat(l.principal)) * 100) : 0;
        const card = document.createElement('div');
        card.className = `item-card urgency-${urgency}`;
        card.innerHTML = `
      <div class="item-card-header">
        <div>
          <div class="item-card-title">🏦 ${l.name}</div>
          <div class="item-card-subtitle">${l.lender || 'Lender'} · ${l.type || 'Personal Loan'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="badge badge-${urgency}">${urgency === 'overdue' ? '🔴' : urgency === 'soon' ? '🟡' : '🟢'} ${urgency === 'none' ? 'No Date' : urgency.charAt(0).toUpperCase() + urgency.slice(1)}</span>
          <div class="item-card-actions">
            <button class="item-btn edit" onclick="openEditLoan('${l.id}')" title="Edit">✏️</button>
            <button class="item-btn delete" onclick="deleteLoan('${l.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
      <div class="info-grid">
        <div><div class="info-item-label">Remaining Balance</div><div class="info-item-value" style="color:var(--red)">${fmt(l.balance)}</div></div>
        <div><div class="info-item-label">Monthly Payment</div><div class="info-item-value">${fmt(l.monthlyPayment)}</div></div>
        <div><div class="info-item-label">Principal</div><div class="info-item-value">${fmt(l.principal)}</div></div>
        <div><div class="info-item-label">Interest Rate</div><div class="info-item-value">${l.interestRate || 0}% / yr</div></div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar green" style="width:${paidPct.toFixed(1)}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)">
        <span>${paidPct.toFixed(0)}% paid</span>
        ${diff !== null ? `<span class="due-item-days ${urgency === 'overdue' ? 'overdue' : urgency === 'soon' ? 'soon' : 'ok'}">${formatDaysLabel(diff)}</span>` : ''}
      </div>
      <div class="info-grid" style="margin-top:10px">
        <div><div class="info-item-label">Due Date</div><div class="info-item-value">${formatDate(l.dueDate)}</div></div>
        <div><div class="info-item-label">Start Date</div><div class="info-item-value">${formatDate(l.startDate)}</div></div>
      </div>
      ${l.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);background:var(--bg-input);padding:8px 10px;border-radius:8px">${l.notes}</div>` : ''}
    `;
        el.appendChild(card);
    });
}

function openAddLoan() { openLoanModal(); }
function openEditLoan(id) {
    const l = STATE.loans.find(x => x.id === id);
    if (l) openLoanModal(l);
}

function openLoanModal(data = null) {
    STATE.editingId = data ? data.id : null;
    STATE.editingType = 'loan';
    document.getElementById('loanModalTitle').textContent = data ? 'Edit Loan' : 'Add Loan / Lending App';
    const f = document.getElementById('loanForm');
    f.loanName.value = data?.name || '';
    f.loanLender.value = data?.lender || '';
    f.loanType.value = data?.type || 'Personal Loan';
    f.loanPrincipal.value = data?.principal || '';
    f.loanBalance.value = data?.balance || '';
    f.loanMonthlyPayment.value = data?.monthlyPayment || '';
    f.loanInterestRate.value = data?.interestRate || '';
    f.loanStartDate.value = data?.startDate || '';
    f.loanDueDate.value = data?.dueDate || '';
    f.loanNotes.value = data?.notes || '';
    openModal('loanModal');
}

async function saveLoan() {
    const f = document.getElementById('loanForm');
    const name = f.loanName.value.trim();
    if (!name) { toast('Loan name is required.', 'error'); return; }
    const record = {
        id: STATE.editingId || genId(),
        name,
        lender: f.loanLender.value.trim(),
        type: f.loanType.value,
        principal: parseFloat(f.loanPrincipal.value) || 0,
        balance: parseFloat(f.loanBalance.value) || 0,
        monthlyPayment: parseFloat(f.loanMonthlyPayment.value) || 0,
        interestRate: parseFloat(f.loanInterestRate.value) || 0,
        startDate: f.loanStartDate.value,
        dueDate: f.loanDueDate.value,
        notes: f.loanNotes.value.trim(),
        createdAt: STATE.editingId ? (STATE.loans.find(x => x.id === STATE.editingId)?.createdAt || today()) : today(),
        updatedAt: today(),
    };
    await saveRecord('loans', record);
    toast(STATE.editingId ? 'Loan updated!' : 'Loan added!', 'success');
    closeModal('loanModal');
}

async function deleteLoan(id) {
    if (!confirm('Delete this loan?')) return;
    await deleteRecord('loans', id);
    if (!currentUser) renderLoans();
    toast('Loan removed.', 'info');
}

// =============================================
// FRIENDS / LENT MONEY
// =============================================
function renderFriends() {
    const filtered = filterItems(STATE.friends);
    const el = document.getElementById('friendsList');
    if (!filtered.length) {
        el.innerHTML = emptyState('👥', 'No lending records yet', 'Track money you\'ve lent to friends and family here.');
        return;
    }

    el.innerHTML = '';
    filtered.forEach(f => {
        const isInstallment = !!f.isInstallment;
        const totalAmt = parseFloat(f.amount) || 0;

        // --- Installment mode ---
        if (isInstallment) {
            const installsPaid = parseInt(f.installmentsPaid) || 0;
            const totalInstalls = parseInt(f.totalInstallments) || 1;
            const installAmt = parseFloat(f.installmentAmount) || (totalAmt / totalInstalls);
            const paidAmt = installsPaid * installAmt;
            const remaining = totalAmt - paidAmt;
            const paidPct = Math.min(100, (installsPaid / totalInstalls) * 100);
            const urgency = f.status === 'paid' ? 'none' : getUrgency(f.dueDate);
            const diff = f.status === 'paid' ? null : daysDiff(f.dueDate);
            const freqLabel = f.installmentFrequency === 'weekly' ? 'Weekly' : f.installmentFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly';

            // Installment dots (max 12 shown)
            const dotsMax = Math.min(totalInstalls, 24);
            const dots = Array.from({ length: dotsMax }, (_, i) => {
                const filled = i < installsPaid;
                const color = filled ? 'var(--green)' : 'var(--bg-input)';
                const border = filled ? 'var(--green)' : 'var(--border)';
                return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};border:1.5px solid ${border};margin:1px"></span>`;
            }).join('');

            const card = document.createElement('div');
            card.className = `item-card urgency-${urgency}`;
            card.innerHTML = `
        <div class="item-card-header">
          <div>
            <div class="item-card-title">👤 ${f.name}</div>
            <div class="item-card-subtitle">📅 ${freqLabel} installments · Lent ${formatDate(f.dateLent)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="badge badge-${f.status}">${f.status === 'paid' ? '✅ Fully Paid' : urgency === 'overdue' ? '🔴 Overdue' : urgency === 'soon' ? '🟡 Due Soon' : '🟢 On Track'}</span>
            <div class="item-card-actions">
              <button class="item-btn edit" onclick="openEditFriend('${f.id}')" title="Edit">✏️</button>
              <button class="item-btn delete" onclick="deleteFriend('${f.id}')" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
        <div class="info-grid">
          <div><div class="info-item-label">Total Lent</div><div class="info-item-value">${fmt(totalAmt)}</div></div>
          <div><div class="info-item-label">Per Installment</div><div class="info-item-value">${fmt(installAmt)}</div></div>
          <div><div class="info-item-label">Installments Paid</div><div class="info-item-value">${installsPaid} / ${totalInstalls}</div></div>
          <div><div class="info-item-label">Remaining</div><div class="info-item-value" style="color:var(--yellow)">${fmt(remaining)}</div></div>
        </div>
        <div style="margin:12px 0 4px;font-size:11px;color:var(--text-muted)">Progress</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px">${dots}${totalInstalls > 24 ? `<span style="font-size:10px;color:var(--text-muted);margin-left:4px">+${totalInstalls - 24} more</span>` : ''}</div>
        <div class="progress-bar-wrap"><div class="progress-bar green" style="width:${paidPct.toFixed(1)}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px">
          <span>${paidPct.toFixed(0)}% paid back</span>
          ${diff !== null ? `<span class="due-item-days ${urgency === 'overdue' ? 'overdue' : urgency === 'soon' ? 'soon' : 'ok'}">${formatDaysLabel(diff)} · Next due ${formatDate(f.dueDate)}</span>` : ''}
        </div>
        ${f.notes ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);background:var(--bg-input);padding:8px 10px;border-radius:8px">${f.notes}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">
          ${f.status !== 'paid' ? `<button class="btn btn-success btn-sm" onclick="payInstallment('${f.id}')">💸 Pay Installment</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="copyReminder('${f.id}')">📋 Copy Reminder</button>
        </div>
      `;
            el.appendChild(card);
            return;
        }

        // --- Regular (non-installment) mode ---
        const paidAmt = parseFloat(f.paidAmount) || 0;
        const remaining = totalAmt - paidAmt;
        const paidPct = totalAmt > 0 ? Math.min(100, (paidAmt / totalAmt) * 100) : 0;
        const urgency = f.status === 'paid' ? 'none' : getUrgency(f.dueDate);
        const diff = f.status === 'paid' ? null : daysDiff(f.dueDate);
        const card = document.createElement('div');
        card.className = `item-card urgency-${urgency}`;
        card.innerHTML = `
      <div class="item-card-header">
        <div>
          <div class="item-card-title">👤 ${f.name}</div>
          <div class="item-card-subtitle">Lent on ${formatDate(f.dateLent)}${f.dueDate ? ' · Due ' + formatDate(f.dueDate) : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="badge badge-${f.status}">${f.status === 'paid' ? '✅' : f.status === 'partial' ? '🔵' : '🟡'} ${f.status.charAt(0).toUpperCase() + f.status.slice(1)}</span>
          <div class="item-card-actions">
            <button class="item-btn edit" onclick="openEditFriend('${f.id}')" title="Edit">✏️</button>
            <button class="item-btn delete" onclick="deleteFriend('${f.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
      <div class="info-grid">
        <div><div class="info-item-label">Total Lent</div><div class="info-item-value">${fmt(totalAmt)}</div></div>
        <div><div class="info-item-label">Remaining</div><div class="info-item-value" style="color:${remaining > 0 ? 'var(--yellow)' : 'var(--green)'}">${fmt(remaining)}</div></div>
      </div>
      ${totalAmt > 0 ? `<div class="progress-bar-wrap"><div class="progress-bar green" style="width:${paidPct.toFixed(1)}%"></div></div>
      <div style="font-size:11px;color:var(--text-muted)">${paidPct.toFixed(0)}% returned (${fmt(paidAmt)} of ${fmt(totalAmt)})</div>` : ''}
      ${f.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);background:var(--bg-input);padding:8px 10px;border-radius:8px">${f.notes}</div>` : ''}
      ${diff !== null ? `<div style="margin-top:8px;font-size:12px;font-weight:600" class="due-item-days ${urgency === 'overdue' ? 'overdue' : urgency === 'soon' ? 'soon' : 'ok'}">${formatDaysLabel(diff)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">
        ${f.status !== 'paid' ? `
          <button class="btn btn-success btn-sm" onclick="markFriendPaid('${f.id}')">✅ Mark Paid</button>
          <button class="btn btn-ghost btn-sm" onclick="openPartialPayment('${f.id}')">💸 Partial</button>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="copyReminder('${f.id}')">📋 Copy Reminder</button>
      </div>
    `;
        el.appendChild(card);
    });
}

function openAddFriend() { openFriendModal(); }
function openEditFriend(id) {
    const f = STATE.friends.find(x => x.id === id);
    if (f) openFriendModal(f);
}

function openFriendModal(data = null) {
    STATE.editingId = data ? data.id : null;
    STATE.editingType = 'friend';
    document.getElementById('friendModalTitle').textContent = data ? 'Edit Lending Record' : 'Add Lending Record';
    const f = document.getElementById('friendForm');
    // Reset all fields
    f.friendName.value = data?.name || '';
    f.friendAmount.value = data?.amount || '';
    f.friendDateLent.value = data?.dateLent || today();
    f.friendNotes.value = data?.notes || '';
    // Installment fields
    const isInstall = !!(data?.isInstallment);
    const toggle = document.getElementById('friendIsInstallmentToggle');
    if (toggle) toggle.checked = isInstall;
    toggleInstallmentFields(isInstall);
    if (isInstall) {
        f.friendTotalInstallments.value = data?.totalInstallments || '';
        f.friendInstallmentAmount.value = data?.installmentAmount || '';
        f.friendInstallmentFrequency.value = data?.installmentFrequency || 'monthly';
        f.friendDueDate.value = data?.dueDate || '';
        f.friendInstallmentsPaid.value = data?.installmentsPaid || 0;
    } else {
        f.friendPaidAmount.value = data?.paidAmount || '';
        f.friendDueDateSingle.value = data?.dueDate || '';
        f.friendStatus.value = data?.status || 'pending';
    }
    openModal('friendModal');
}

async function saveFriend() {
    const f = document.getElementById('friendForm');
    const name = f.friendName.value.trim();
    if (!name) { toast('Friend\'s name is required.', 'error'); return; }
    const amount = parseFloat(f.friendAmount.value) || 0;
    const isInstallment = document.getElementById('friendIsInstallmentToggle')?.checked || false;
    let record;

    if (isInstallment) {
        const totalInstallments = parseInt(f.friendTotalInstallments.value) || 1;
        const installmentAmount = parseFloat(f.friendInstallmentAmount.value) || (amount / totalInstallments);
        const installmentsPaid = parseInt(f.friendInstallmentsPaid.value) || 0;
        const installmentFrequency = f.friendInstallmentFrequency.value;
        const dueDate = f.friendDueDate.value;
        const paidAmount = installmentsPaid * installmentAmount;
        const status = installmentsPaid >= totalInstallments ? 'paid' : installmentsPaid > 0 ? 'partial' : 'pending';
        record = {
            id: STATE.editingId || genId(),
            name,
            amount,
            isInstallment: true,
            totalInstallments,
            installmentAmount,
            installmentFrequency,
            installmentsPaid,
            paidAmount,
            dueDate,
            status,
            dateLent: f.friendDateLent.value || today(),
            notes: f.friendNotes.value.trim(),
            createdAt: STATE.editingId ? (STATE.friends.find(x => x.id === STATE.editingId)?.createdAt || today()) : today(),
            updatedAt: today(),
        };
    } else {
        const paidAmount = parseFloat(f.friendPaidAmount.value) || 0;
        let status = f.friendStatus.value;
        if (paidAmount >= amount && amount > 0) status = 'paid';
        else if (paidAmount > 0) status = 'partial';
        record = {
            id: STATE.editingId || genId(),
            name,
            amount,
            isInstallment: false,
            paidAmount,
            dueDate: f.friendDueDateSingle.value,
            status,
            dateLent: f.friendDateLent.value || today(),
            notes: f.friendNotes.value.trim(),
            createdAt: STATE.editingId ? (STATE.friends.find(x => x.id === STATE.editingId)?.createdAt || today()) : today(),
            updatedAt: today(),
        };
    }
    await saveRecord('friends', record);
    toast(STATE.editingId ? 'Lending record updated!' : 'Lending record added!', 'success');
    closeModal('friendModal');
}

async function deleteFriend(id) {
    if (!confirm('Delete this lending record?')) return;
    await deleteRecord('friends', id);
    if (!currentUser) renderFriends();
    toast('Record removed.', 'info');
}



async function markFriendPaid(id) {
    const f = STATE.friends.find(x => x.id === id);
    if (!f) return;
    const updated = { ...f, paidAmount: f.amount, status: 'paid', updatedAt: today() };
    await saveRecord('friends', updated);
    toast(`${f.name} marked as paid! 🎉`, 'success');
}

async function payInstallment(id) {
    const f = STATE.friends.find(x => x.id === id);
    if (!f || !f.isInstallment) return;
    const installsPaid = parseInt(f.installmentsPaid) || 0;
    const totalInstalls = parseInt(f.totalInstallments) || 1;
    if (installsPaid >= totalInstalls) { toast('All installments already paid!', 'info'); return; }
    const installAmt = parseFloat(f.installmentAmount) || (parseFloat(f.amount) / totalInstalls);
    const confirm1 = confirm(`Record installment #${installsPaid + 1} of ${totalInstalls} for ${f.name}?\n\nAmount: ${fmt(installAmt)}`);
    if (!confirm1) return;
    const newInstallsPaid = installsPaid + 1;
    const newPaidAmount = newInstallsPaid * installAmt;
    const allDone = newInstallsPaid >= totalInstalls;
    // Advance next due date
    const newDueDate = allDone ? f.dueDate : nextDueDateFromFrequency(f.dueDate, f.installmentFrequency || 'monthly');
    const updated = {
        ...f,
        installmentsPaid: newInstallsPaid,
        paidAmount: newPaidAmount,
        dueDate: newDueDate,
        status: allDone ? 'paid' : 'partial',
        updatedAt: today(),
    };
    await saveRecord('friends', updated);
    if (allDone) {
        toast(`🎉 All ${totalInstalls} installments paid for ${f.name}!`, 'success');
    } else {
        toast(`Installment #${newInstallsPaid}/${totalInstalls} recorded for ${f.name}. Next due: ${formatDate(newDueDate)}`, 'success');
    }
}

async function openPartialPayment(id) {
    const f = STATE.friends.find(x => x.id === id);
    if (!f) return;
    const amt = prompt(`Enter partial payment amount for ${f.name}:\n(Already paid: ${fmt(f.paidAmount || 0)} / ${fmt(f.amount)})`);
    if (amt === null) return;
    const payment = parseFloat(amt);
    if (isNaN(payment) || payment <= 0) { toast('Invalid amount.', 'error'); return; }
    const newPaid = Math.min(parseFloat(f.amount), (parseFloat(f.paidAmount) || 0) + payment);
    const updated = { ...f, paidAmount: newPaid, status: newPaid >= parseFloat(f.amount) ? 'paid' : 'partial', updatedAt: today() };
    await saveRecord('friends', updated);
    toast(`Payment of ${fmt(payment)} recorded for ${f.name}.`, 'success');
}

function copyReminder(id) {
    const f = STATE.friends.find(x => x.id === id);
    if (!f) return;
    const remaining = (parseFloat(f.amount) - (parseFloat(f.paidAmount) || 0));
    const msg = `Hi ${f.name}! 👋 Just a friendly reminder that you have a pending balance of ${fmt(remaining)}.${f.dueDate ? ` It was due on ${formatDate(f.dueDate)}.` : ''} Thank you! 😊`;
    navigator.clipboard.writeText(msg).then(() => {
        toast('Reminder message copied to clipboard!', 'success');
    }).catch(() => {
        prompt('Copy this message:', msg);
    });
}

// =============================================
// SETTINGS
// =============================================
function renderSettings() {
    const s = STATE.settings;
    document.getElementById('settingCurrency').value = s.currency;
    document.getElementById('settingReminderDays').value = s.reminderDays;
    document.getElementById('settingDarkMode').checked = s.darkMode;
    document.getElementById('settingNotif').checked = s.notificationsEnabled;
    const notifStatus = document.getElementById('notifStatus');
    if ('Notification' in window) {
        notifStatus.textContent = Notification.permission === 'granted' ? 'Granted ✅' : Notification.permission === 'denied' ? 'Denied ❌' : 'Not yet asked';
    } else {
        notifStatus.textContent = 'Not supported';
    }
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        if (!isFirebaseConfigured()) {
            syncStatus.textContent = '⚠️ Not configured — data stays local only';
            syncStatus.style.color = 'var(--yellow)';
        } else if (currentUser) {
            syncStatus.textContent = `✅ Syncing as ${currentUser.email}`;
            syncStatus.style.color = 'var(--green)';
        } else {
            syncStatus.textContent = '🔒 Sign in to enable cloud sync';
            syncStatus.style.color = 'var(--text-muted)';
        }
    }
}

async function saveSettings() {
    STATE.settings.currency = document.getElementById('settingCurrency').value;
    STATE.settings.reminderDays = parseInt(document.getElementById('settingReminderDays').value) || 7;
    await saveSettingsToFirestore();
    toast('Settings saved!', 'success');
    renderPage(STATE.activeTab);
    updateNotifBadge();
}

function toggleDarkMode(checked) {
    STATE.settings.darkMode = checked;
    document.body.classList.toggle('light', !checked);
    saveSettingsToFirestore();
}

function toggleNotifications(checked) {
    if (checked) {
        requestNotifPermission();
    } else {
        STATE.settings.notificationsEnabled = false;
        saveSettingsToFirestore();
    }
}

// =============================================
// IMPORT / EXPORT
// =============================================
function exportJSON() {
    const data = {
        exportedAt: new Date().toISOString(),
        creditCards: STATE.creditCards,
        loans: STATE.loans,
        friends: STATE.friends,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `finance-tracker-${today()}.json`);
    toast('Data exported as JSON!', 'success');
}

function exportCSV() {
    let csv = 'Type,Name,Bank/Lender,Balance,Due Date,Status,Notes\n';
    STATE.creditCards.forEach(c => {
        csv += `Credit Card,"${c.name}","${c.bank}",${c.balance},"${c.dueDate}","active","${c.notes || ''}"\n`;
    });
    STATE.loans.forEach(l => {
        csv += `Loan,"${l.name}","${l.lender}",${l.balance},"${l.dueDate}","active","${l.notes || ''}"\n`;
    });
    STATE.friends.forEach(f => {
        csv += `Friend,"${f.name}","N/A",${f.amount - (f.paidAmount || 0)},"${f.dueDate}","${f.status}","${f.notes || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `finance-tracker-${today()}.csv`);
    toast('Data exported as CSV!', 'success');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function triggerCSVImport() {
    document.getElementById('csvFileInput').click();
}

async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const data = JSON.parse(ev.target.result);
                const saves = [];
                if (data.creditCards) data.creditCards.forEach(c => saves.push(saveRecord('creditCards', c)));
                if (data.loans) data.loans.forEach(l => saves.push(saveRecord('loans', l)));
                if (data.friends) data.friends.forEach(f => saves.push(saveRecord('friends', f)));
                await Promise.all(saves);
                if (!currentUser) renderPage(STATE.activeTab);
                toast(`Imported ${(data.creditCards?.length || 0) + (data.loans?.length || 0) + (data.friends?.length || 0)} records!`, 'success');
            } catch { toast('Invalid JSON file.', 'error'); }
        };
        reader.readAsText(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = async ev => {
        const lines = ev.target.result.split('\n').slice(1);
        let count = 0;
        const saves = [];
        lines.forEach(line => {
            if (!line.trim()) return;
            const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
            const [type, name, bank, balance, dueDate, status, notes] = clean;
            if (!name) return;
            if (type === 'Credit Card') {
                saves.push(saveRecord('creditCards', { id: genId(), name, bank, balance: parseFloat(balance) || 0, dueDate, notes, createdAt: today(), updatedAt: today() }));
            } else if (type === 'Loan') {
                saves.push(saveRecord('loans', { id: genId(), name, lender: bank, balance: parseFloat(balance) || 0, dueDate, notes, type: 'Personal Loan', createdAt: today(), updatedAt: today() }));
            } else if (type === 'Friend') {
                saves.push(saveRecord('friends', { id: genId(), name, amount: parseFloat(balance) || 0, paidAmount: 0, dueDate, status: status || 'pending', notes, dateLent: today(), createdAt: today(), updatedAt: today() }));
            }
            count++;
        });
        await Promise.all(saves);
        if (!currentUser) renderPage(STATE.activeTab);
        toast(`Imported ${count} records from CSV!`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
}

async function clearAllData() {
    if (!confirm('⚠️ This will permanently delete ALL your data. Are you sure?')) return;
    if (!confirm('Last warning: Delete everything?')) return;

    if (currentUser && db) {
        const cols = ['creditCards', 'loans', 'friends'];
        for (const col of cols) {
            const snap = await userRef().collection(col).get();
            const batch = db.batch();
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await userRef().set({ settings: STATE.settings }, { merge: true });
    } else {
        localStorage.removeItem('ft_creditCards');
        localStorage.removeItem('ft_loans');
        localStorage.removeItem('ft_friends');
        STATE.creditCards = [];
        STATE.loans = [];
        STATE.friends = [];
        renderPage(STATE.activeTab);
        updateNotifBadge();
    }
    toast('All data cleared.', 'info');
}

// =============================================
// SEARCH
// =============================================
function filterItems(items) {
    const q = STATE.searchQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter(item => Object.values(item).join(' ').toLowerCase().includes(q));
}

function handleSearch(e) {
    STATE.searchQuery = e.target.value;
    renderPage(STATE.activeTab);
}

// =============================================
// MODALS
// =============================================
function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
    STATE.editingId = null;
    STATE.editingType = null;
}

// =============================================
// NOTIFICATION PANEL
// =============================================
function toggleNotifPanel() {
    document.getElementById('notifPanel').classList.toggle('open');
    renderNotifPanel();
}

function renderNotifPanel() {
    const items = getUpcomingDues(STATE.settings.reminderDays);
    const listEl = document.getElementById('notifList');
    if (!items.length) {
        listEl.innerHTML = `<div class="empty-state" style="padding:24px 16px"><span class="empty-icon" style="font-size:32px">😊</span><p>No urgent dues right now!</p></div>`;
        return;
    }
    listEl.innerHTML = items.map(item => {
        const urgency = item.diff < 0 ? 'overdue' : item.diff <= 3 ? 'soon' : 'ok';
        const icon = item.type === 'card' ? '💳' : item.type === 'loan' ? '🏦' : '👤';
        const bg = urgency === 'overdue' ? 'var(--red-bg)' : urgency === 'soon' ? 'var(--yellow-bg)' : 'var(--green-bg)';
        return `<div class="notif-entry">
      <div class="notif-entry-icon" style="background:${bg}">${icon}</div>
      <div>
        <div class="notif-entry-text"><strong>${item.name}</strong> — ${fmt(item.amount)}</div>
        <div class="notif-entry-sub">${formatDaysLabel(item.diff)} · ${formatDate(item.dueDate)}</div>
      </div>
    </div>`;
    }).join('');
}

// =============================================
// MOBILE SIDEBAR
// =============================================
function toggleMobileSidebar() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').style.display =
        document.getElementById('sidebar').classList.contains('mobile-open') ? 'block' : 'none';
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').style.display = 'none';
}

// =============================================
// FAB
// =============================================
function handleFAB() {
    const tab = STATE.activeTab;
    if (tab === 'cards') openAddCard();
    else if (tab === 'loans') openAddLoan();
    else if (tab === 'friends') openAddFriend();
    else openAddCard();
}

// =============================================
// HELPERS
// =============================================
function emptyState(icon, title, desc) {
    return `<div class="empty-state">
    <span class="empty-icon">${icon}</span>
    <h3>${title}</h3>
    <p>${desc}</p>
  </div>`;
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    // Apply theme from localStorage immediately (before Firebase loads)
    const savedSettings = JSON.parse(localStorage.getItem('ft_settings') || '{}');
    if (savedSettings.darkMode === false) document.body.classList.add('light');

    // Init Firebase (handles auth state → showApp / showSignIn)
    initFirebase();

    // Close notification panel on outside click
    document.addEventListener('click', e => {
        const panel = document.getElementById('notifPanel');
        const btn = document.getElementById('notifBtn');
        if (panel && panel.classList.contains('open') && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });
});
