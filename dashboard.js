/* =============================================
   FINANCE TRACKER - Dashboard
   ============================================= */

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
