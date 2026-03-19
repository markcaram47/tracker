/* =============================================
   FINANCE TRACKER - Credit Cards
   ============================================= */

function renderCards() {
    const filtered = filterItems(STATE.creditCards);
    const el = document.getElementById('cardsList');
    if (!filtered.length) {
        el.innerHTML = emptyState('💳', 'No credit cards yet', 'Add your first credit card to start tracking statement dates and due dates.');
        return;
    }

    const urgencyOrder = { overdue: 0, soon: 1, ok: 2, none: 3 };
    filtered.sort((a, b) => {
        const aPaid = a.paidAt === today() ? 1 : 0;
        const bPaid = b.paidAt === today() ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        // Among unpaid: sort by urgency
        const aUrg = urgencyOrder[getUrgency(a.dueDate)] ?? 3;
        const bUrg = urgencyOrder[getUrgency(b.dueDate)] ?? 3;
        return aUrg - bUrg;
    });

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
            ${!paidThisCycle && c.balance > 0 ? `<button class="item-btn" onclick="partialPaymentCard('${c.id}')" title="Partial Payment">💸</button>` : ''}
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
      ${c.paymentHistory && c.paymentHistory.length > 0 ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);background:var(--bg-input);padding:8px 10px;border-radius:8px"><strong>Latest Partial Payment:</strong> ${fmt(c.paymentHistory[c.paymentHistory.length-1].amount)} on ${formatDate(c.paymentHistory[c.paymentHistory.length-1].date)}</div>` : ''}
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

async function partialPaymentCard(id) {
    const c = STATE.creditCards.find(x => x.id === id);
    if (!c) return;
    const amountStr = prompt(`Enter partial payment amount for ${c.name}\nCurrent balance: ${fmt(c.balance)}`);
    if (!amountStr) return;
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
        toast('Invalid amount', 'error');
        return;
    }
    if (amount > c.balance) {
        toast('Payment cannot exceed outstanding balance.', 'error');
        return;
    }

    c.balance -= amount;

    if (!c.paymentHistory) {
        c.paymentHistory = [];
    }
    c.paymentHistory.push({
        date: today(),
        amount: amount
    });

    c.updatedAt = today();
    await saveRecord('creditCards', c);
    toast(`Partial payment of ${fmt(amount)} recorded! Remaining: ${fmt(c.balance)}`, 'success');
}
