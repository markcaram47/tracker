/* =============================================
   FINANCE TRACKER - Paswipe (Friends / Lent Money)
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

function buildFriendCard(f) {
    const isInstallment = !!f.isInstallment;
    const totalAmt = parseFloat(f.amount) || 0;

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
        return card;
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
    return card;
}

function renderFriends() {
    const filtered = filterItems(STATE.friends);
    const el = document.getElementById('friendsList');
    if (!filtered.length) {
        el.innerHTML = emptyState('👥', 'No lending records yet', 'Track money you\'ve lent to friends and family here.');
        return;
    }

    const active = filtered.filter(f => f.status !== 'paid');
    const paid = filtered.filter(f => f.status === 'paid');

    el.innerHTML = '';

    // ── Active records ──
    if (active.length === 0) {
        const noActive = document.createElement('div');
        noActive.className = 'empty-state';
        noActive.style.padding = '30px 0';
        noActive.innerHTML = `<span class="empty-icon">🎉</span><h3>All caught up!</h3><p>No ongoing transactions. Check the completed section below.</p>`;
        el.appendChild(noActive);
    } else {
        const activeGrid = document.createElement('div');
        activeGrid.className = 'grid-auto';
        active.forEach(f => activeGrid.appendChild(buildFriendCard(f)));
        el.appendChild(activeGrid);
    }

    // ── Paid / Completed collapsible ──
    if (paid.length > 0) {
        const isOpen = STATE.paidFriendsOpen ?? false;

        const accordion = document.createElement('div');
        accordion.className = 'paid-accordion';
        accordion.style.marginTop = '28px';
        accordion.innerHTML = `
          <button class="paid-accordion-toggle" onclick="togglePaidFriends()" id="paidAccordionBtn">
            <span>✅ Completed Transactions</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-paid" style="font-size:11px">${paid.length}</span>
              <span class="paid-accordion-arrow ${isOpen ? 'open' : ''}" id="paidAccordionArrow">▾</span>
            </span>
          </button>
          <div class="paid-accordion-body ${isOpen ? 'open' : ''}" id="paidAccordionBody">
            <div class="grid-auto" style="padding-top:16px" id="paidGrid"></div>
          </div>
        `;
        el.appendChild(accordion);

        const paidGrid = accordion.querySelector('#paidGrid');
        paid.forEach(f => paidGrid.appendChild(buildFriendCard(f)));
    }
}

function togglePaidFriends() {
    STATE.paidFriendsOpen = !(STATE.paidFriendsOpen ?? false);
    const body = document.getElementById('paidAccordionBody');
    const arrow = document.getElementById('paidAccordionArrow');
    if (body) body.classList.toggle('open', STATE.paidFriendsOpen);
    if (arrow) arrow.classList.toggle('open', STATE.paidFriendsOpen);
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
    f.friendName.value = data?.name || '';
    f.friendAmount.value = data?.amount || '';
    f.friendDateLent.value = data?.dateLent || today();
    f.friendNotes.value = data?.notes || '';
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
