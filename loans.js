/* =============================================
   FINANCE TRACKER - Loans
   ============================================= */

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
