/* =============================================
   FINANCE TRACKER - Core Application Logic
   Firebase Firestore + Google Auth Edition
   ============================================= */


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
// PAGE MODULES → see dashboard.js, cards.js, loans.js, friends.js
// =============================================

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
