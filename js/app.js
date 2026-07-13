// Main UI: rendering, navigation, and event wiring. Vanilla JS, no build step.
// Data arrives via Firestore snapshot listeners; every change re-renders the
// current page so all devices stay on the exact same live data.

let currentPage = 'dashboard';
let currentFamilyId = null;
let dashboardYear = currentYear();
let dashboardMonth = currentMonth();
let familyDetailYear = currentYear();
let familySearchQuery = '';
let expenseSearchQuery = '';

function el(id) {
  return document.getElementById(id);
}

function yearOptions(selected) {
  const years = [];
  for (let y = currentYear() - 3; y <= currentYear() + 1; y++) years.push(y);
  if (!years.includes(selected)) years.push(selected);
  years.sort((a, b) => a - b);
  return years
    .map((y) => `<option value="${y}" ${y === selected ? 'selected' : ''}>${y}</option>`)
    .join('');
}

// ---------- Row action menu (tap the ⋮ button to reveal View/Edit/Delete etc.) ----------

let closeOpenActionMenu = null;

function toggleActionMenu(triggerEl, items) {
  const wasOpenForThisTrigger = triggerEl.dataset.menuOpen === '1';
  if (closeOpenActionMenu) closeOpenActionMenu();
  if (wasOpenForThisTrigger) return;

  const menu = document.createElement('div');
  menu.className = 'action-menu';
  menu.innerHTML = items
    .map((it, i) => `<button type="button" class="action-menu-item ${it.danger ? 'danger' : ''}" data-idx="${i}">${escapeHtml(it.label)}</button>`)
    .join('');
  document.body.appendChild(menu);

  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  menu.style.left = `${left + window.scrollX}px`;

  triggerEl.dataset.menuOpen = '1';
  triggerEl.classList.add('active');

  menu.querySelectorAll('.action-menu-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = items[Number(btn.dataset.idx)];
      if (closeOpenActionMenu) closeOpenActionMenu();
      action.onClick();
    });
  });

  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== triggerEl) closeOpenActionMenu();
  };
  const onScroll = () => closeOpenActionMenu && closeOpenActionMenu();
  document.addEventListener('click', onDocClick, true);
  window.addEventListener('scroll', onScroll, true);

  closeOpenActionMenu = () => {
    menu.remove();
    triggerEl.dataset.menuOpen = '0';
    triggerEl.classList.remove('active');
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('scroll', onScroll, true);
    closeOpenActionMenu = null;
  };
}

// ---------- Boot / top-level screen switch ----------

function boot() {
  wireLoginScreen();
  wireGlobalChrome();

  if (window.fb === undefined) {
    showLoginNotice('Could not load. Check your internet connection and reload the page.');
    return;
  }
  if (window.fb === null) {
    showLoginNotice('Cloud sync is not configured yet. The app will work once setup is completed.');
    return;
  }

  window.fb.onAuthStateChanged(window.fb.auth, (user) => {
    setFbUser(user);
    renderApp();
  });

  startDataSync(() => {
    refreshCurrentPage();
  });
}

function showLoginNotice(message) {
  el('setup-notice').textContent = message;
  el('setup-notice').classList.remove('hidden');
  el('btn-show-admin-login').disabled = true;
  el('btn-viewer-login').disabled = true;
}

function renderApp() {
  const role = getRole();
  if (!role) {
    el('login-screen').classList.remove('hidden');
    el('app-screen').classList.add('hidden');
    return;
  }
  el('login-screen').classList.add('hidden');
  el('app-screen').classList.remove('hidden');
  el('app-committee-name').textContent = data.settings.committeeName;
  el('app-role-badge').textContent = role === 'admin' ? 'Admin' : 'Viewer';
  el('app-role-badge').className = `role-badge ${role}`;
  el('tab-settings').classList.toggle('hidden', role !== 'admin');
  navigateTo('dashboard');
}

// Re-renders whatever page is showing when cloud data changes.
function refreshCurrentPage() {
  if (!getRole() || el('app-screen').classList.contains('hidden')) return;
  el('app-committee-name').textContent = data.settings.committeeName;
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'families') renderFamiliesPage();
  if (currentPage === 'family-detail') renderFamilyDetail(currentFamilyId);
  if (currentPage === 'expenses') renderExpensesPage();
  // Settings page holds form state the user may be typing in; don't clobber it.
}

function wireLoginScreen() {
  el('btn-show-admin-login').addEventListener('click', () => {
    el('admin-login-form').classList.remove('hidden');
    el('login-error').textContent = '';
    el('admin-email').focus();
  });

  el('btn-admin-cancel').addEventListener('click', () => {
    el('admin-login-form').classList.add('hidden');
    el('admin-password').value = '';
    el('login-error').textContent = '';
  });

  el('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('login-error').textContent = '';
    const btn = el('btn-admin-submit');
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    try {
      await adminLogin(el('admin-email').value.trim(), el('admin-password').value);
      el('admin-password').value = '';
      el('admin-login-form').classList.add('hidden');
      // onAuthStateChanged triggers renderApp()
    } catch (err) {
      el('login-error').textContent = friendlyAuthError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });

  el('btn-viewer-login').addEventListener('click', () => {
    enterViewer();
    renderApp();
  });
}

function wireGlobalChrome() {
  el('btn-logout').addEventListener('click', async () => {
    await logoutAll();
    renderApp();
  });

  el('tab-dashboard').addEventListener('click', () => navigateTo('dashboard'));
  el('tab-families').addEventListener('click', () => navigateTo('families'));
  el('tab-expenses').addEventListener('click', () => navigateTo('expenses'));
  el('tab-settings').addEventListener('click', () => navigateTo('settings'));

  el('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function navigateTo(page, params = {}) {
  currentPage = page;
  ['dashboard', 'families', 'family-detail', 'expenses', 'settings'].forEach((p) => {
    el(`page-${p}`).classList.toggle('hidden', p !== page);
  });
  ['dashboard', 'families', 'expenses', 'settings'].forEach((p) => {
    el(`tab-${p}`).classList.toggle('active', p === page || (page === 'family-detail' && p === 'families'));
  });

  if (page === 'dashboard') renderDashboard();
  if (page === 'families') renderFamiliesPage();
  if (page === 'family-detail') {
    currentFamilyId = params.familyId || currentFamilyId;
    familyDetailYear = params.year || currentYear();
    renderFamilyDetail(currentFamilyId);
  }
  if (page === 'expenses') renderExpensesPage();
  if (page === 'settings') renderSettingsPage();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const admin = isAdmin();
  const pending = getPendingFamiliesForMonth(dashboardYear, dashboardMonth);
  const paid = getPaidFamiliesForMonth(dashboardYear, dashboardMonth);

  el('page-dashboard').innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <div class="filter-row">
        <label>Month
          <select id="dash-month">
            ${MONTH_NAMES.map((m, i) => `<option value="${i + 1}" ${i + 1 === dashboardMonth ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
        <label>Year
          <select id="dash-year">${yearOptions(dashboardYear)}</select>
        </label>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">Total Families</div>
        <div class="stat-value">${data.families.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Collected in ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</div>
        <div class="stat-value">${formatCurrency(totalDuesForMonth(dashboardYear, dashboardMonth))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Collected All-Time</div>
        <div class="stat-value">${formatCurrency(totalCollectedAllTime())}</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-label">Pending - ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</div>
        <div class="stat-value">${pending.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expenses in ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</div>
        <div class="stat-value">${formatCurrency(totalExpensesForMonth(dashboardYear, dashboardMonth))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Balance in Hand</div>
        <div class="stat-value">${formatCurrency(totalCollectedAllTime() - totalExpensesAllTime())}</div>
      </div>
    </div>

    <h3>Families paid for ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</h3>
    ${
      paid.length === 0
        ? '<p class="empty-note">No one has paid for this month yet.</p>'
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Head Name</th><th>Phone</th><th>Members</th><th>Amount</th></tr></thead>
            <tbody>
              ${paid
                .map(
                  (f) => `
                <tr>
                  <td><button class="row-name-link" data-action="open-family" data-id="${f.id}">${escapeHtml(f.headName)}</button></td>
                  <td>${escapeHtml(f.phone)}</td>
                  <td>${f.members}</td>
                  <td>${formatCurrency(f.members * data.settings.ratePerMember)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table></div>`
    }

    <h3>Families pending for ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</h3>
    ${
      pending.length === 0
        ? '<p class="empty-note">Everyone has paid for this month. 🎉</p>'
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Head Name</th><th>Phone</th><th>Members</th><th>Amount Due</th><th></th></tr></thead>
            <tbody>
              ${pending
                .map(
                  (f) => `
                <tr>
                  <td><button class="row-name-link" data-action="open-family" data-id="${f.id}">${escapeHtml(f.headName)}</button></td>
                  <td>${escapeHtml(f.phone)}</td>
                  <td>${f.members}</td>
                  <td>${formatCurrency(f.members * data.settings.ratePerMember)}</td>
                  <td>
                    ${admin ? `<button class="kebab-btn" data-action="row-menu" data-id="${f.id}" aria-label="Actions">&#8942;</button>` : ''}
                  </td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table></div>`
    }
  `;

  el('dash-month').addEventListener('change', (e) => {
    dashboardMonth = Number(e.target.value);
    renderDashboard();
  });
  el('dash-year').addEventListener('change', (e) => {
    dashboardYear = Number(e.target.value);
    renderDashboard();
  });

  el('page-dashboard').querySelectorAll('[data-action="open-family"]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('family-detail', { familyId: btn.dataset.id, year: dashboardYear }));
  });

  el('page-dashboard').querySelectorAll('[data-action="row-menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const familyId = btn.dataset.id;
      const items = [
        {
          label: 'Record Payment',
          onClick: () => {
            navigateTo('family-detail', { familyId, year: dashboardYear });
            openRecordPaymentModal(familyId, dashboardYear);
          }
        }
      ];
      toggleActionMenu(btn, items);
    });
  });
}

// ---------- Families list ----------

function renderFamiliesPage() {
  const admin = isAdmin();
  el('page-families').innerHTML = `
    <div class="page-header">
      <h2>Families</h2>
      ${admin ? `<button class="btn-primary" id="btn-add-family">+ Add Family</button>` : ''}
    </div>
    <input type="text" id="family-search" placeholder="Search by name or phone..." value="${escapeHtml(familySearchQuery)}" />
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Head Name</th><th>Phone</th><th>Members</th><th>Amount / Month</th><th></th></tr></thead>
      <tbody id="families-tbody"></tbody>
    </table></div>
  `;

  if (admin) {
    el('btn-add-family').addEventListener('click', () => openAddEditFamilyModal());
  }
  el('family-search').addEventListener('input', (e) => {
    familySearchQuery = e.target.value;
    renderFamiliesTableBody();
  });
  renderFamiliesTableBody();
}

function renderFamiliesTableBody() {
  const admin = isAdmin();
  const list = searchFamilies(familySearchQuery);
  const tbody = el('families-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-note">No families found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (f) => `
    <tr>
      <td><button class="row-name-link" data-action="open-family" data-id="${f.id}">${escapeHtml(f.headName)}</button></td>
      <td>${escapeHtml(f.phone)}</td>
      <td>${f.members}</td>
      <td>${formatCurrency(f.members * data.settings.ratePerMember)}</td>
      <td>
        ${admin ? `<button class="kebab-btn" data-action="row-menu" data-id="${f.id}" aria-label="Actions">&#8942;</button>` : ''}
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-action="open-family"]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('family-detail', { familyId: btn.dataset.id, year: currentYear() }));
  });

  tbody.querySelectorAll('[data-action="row-menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const familyId = btn.dataset.id;
      const items = [
        { label: 'Edit', onClick: () => openAddEditFamilyModal(familyId) },
        { label: 'Delete', danger: true, onClick: () => confirmDeleteFamily(familyId, () => renderFamiliesTableBody()) }
      ];
      toggleActionMenu(btn, items);
    });
  });
}

async function confirmDeleteFamily(familyId, afterDelete) {
  const family = getFamily(familyId);
  if (!family) return;
  const count = familyPaymentCount(familyId);
  const msg = count > 0
    ? `Delete ${family.headName}? This will also delete ${count} transaction record(s) on ALL devices. This cannot be undone.`
    : `Delete ${family.headName}? This cannot be undone.`;
  if (!confirm(msg)) return;
  try {
    await deleteFamily(familyId);
    afterDelete();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ---------- Family detail ----------

function renderFamilyDetail(familyId) {
  const family = getFamily(familyId);
  if (!family) {
    navigateTo('families');
    return;
  }
  const admin = isAdmin();
  const paidMonths = getPaidMonthsForYear(familyId, familyDetailYear);
  const history = getTransactionsForFamily(familyId);
  const advanceBalance = family.advanceBalance || 0;

  el('page-family-detail').innerHTML = `
    <button class="btn-link back-link" id="btn-back-to-families">&larr; Back to Families</button>
    <div class="page-header">
      <h2>${escapeHtml(family.headName)}</h2>
      ${admin ? `
        <div class="btn-row">
          <button class="btn-secondary" id="btn-edit-family">Edit</button>
          <button class="btn-danger" id="btn-delete-family">Delete</button>
        </div>` : ''}
    </div>

    <div class="info-card">
      <div><strong>Phone:</strong> ${escapeHtml(family.phone)}</div>
      <div><strong>Members:</strong> ${family.members}</div>
      <div><strong>Amount / Month:</strong> ${formatCurrency(family.members * data.settings.ratePerMember)}</div>
      <div><strong>Advance Balance:</strong> ${formatCurrency(advanceBalance)}</div>
      ${family.address ? `<div><strong>Address:</strong> ${escapeHtml(family.address)}</div>` : ''}
      ${family.notes ? `<div><strong>Notes:</strong> ${escapeHtml(family.notes)}</div>` : ''}
    </div>

    <div class="page-header">
      <h3>Payment Status</h3>
      <label>Year <select id="fd-year">${yearOptions(familyDetailYear)}</select></label>
    </div>
    <div class="month-status-grid">
      ${MONTH_SHORT.map((m, i) => `
        <div class="month-box ${paidMonths.has(i + 1) ? 'paid' : 'unpaid'}">${m}</div>
      `).join('')}
    </div>
    <p class="summary-line">
      Collected in ${familyDetailYear}: <strong>${formatCurrency(
        history.filter((p) => p.year === familyDetailYear).reduce((s, p) => s + cashCollectedOf(p), 0)
      )}</strong>
      &nbsp;|&nbsp; All-time: <strong>${formatCurrency(history.reduce((s, p) => s + cashCollectedOf(p), 0))}</strong>
      &nbsp;|&nbsp; Outstanding months this year: <strong>${12 - paidMonths.size}</strong>
    </p>
    ${admin ? `<button class="btn-primary" id="btn-record-payment">Record Payment</button>` : ''}

    <h3>Transaction History</h3>
    ${
      history.length === 0
        ? '<p class="empty-note">No transactions recorded yet.</p>'
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Date</th><th>For</th><th>Amount</th><th>Receipt No.</th><th></th></tr></thead>
            <tbody>
              ${history
                .map(
                  (p) => `
                <tr>
                  <td>${formatDateForDisplay(p.paidOn)}</td>
                  <td>${p.type === 'advance' ? '<span class="type-badge">Advance</span>' : escapeHtml(monthsListLabel(p.year, p.months))}</td>
                  <td>${formatCurrency(p.amount)}</td>
                  <td>${p.receiptNo}</td>
                  <td><button class="kebab-btn" data-action="txn-menu" data-id="${p.id}" aria-label="Actions">&#8942;</button></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table></div>`
    }
  `;

  el('btn-back-to-families').addEventListener('click', () => navigateTo('families'));
  el('fd-year').addEventListener('change', (e) => {
    familyDetailYear = Number(e.target.value);
    renderFamilyDetail(familyId);
  });

  el('page-family-detail').querySelectorAll('[data-action="txn-menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const txnId = btn.dataset.id;
      const items = [{ label: 'View Receipt', onClick: () => openReceiptModal(getPayment(txnId)) }];
      if (admin) {
        items.push({ label: 'Delete', danger: true, onClick: () => confirmDeleteTransaction(txnId, familyId) });
      }
      toggleActionMenu(btn, items);
    });
  });

  if (admin) {
    el('btn-edit-family').addEventListener('click', () => openAddEditFamilyModal(familyId));
    el('btn-delete-family').addEventListener('click', () =>
      confirmDeleteFamily(familyId, () => navigateTo('families'))
    );
    el('btn-record-payment').addEventListener('click', () => openRecordPaymentModal(familyId, familyDetailYear));
  }
}

async function confirmDeleteTransaction(txnId, familyId) {
  const txn = getPayment(txnId);
  if (!txn) return;
  const msg = txn.type === 'advance'
    ? `Delete this advance deposit of ${formatCurrency(txn.amount)}? The family's advance balance will be reduced accordingly.`
    : `Delete this payment for ${monthsListLabel(txn.year, txn.months)} (${formatCurrency(txn.amount)})? Those months will become unpaid again${txn.advanceApplied ? ', and the advance used will be refunded to the balance' : ''}.`;
  if (!confirm(msg)) return;
  try {
    await deleteTransaction(txnId);
    if (currentPage === 'family-detail') renderFamilyDetail(familyId);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ---------- Expenses ----------

function renderExpensesPage() {
  const admin = isAdmin();
  el('page-expenses').innerHTML = `
    <div class="page-header">
      <h2>Expenses</h2>
      ${admin ? `<button class="btn-primary" id="btn-add-expense">+ Add Expense</button>` : ''}
    </div>
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">Total Expenses (All-Time)</div>
        <div class="stat-value">${formatCurrency(totalExpensesAllTime())}</div>
      </div>
    </div>
    <input type="text" id="expense-search" placeholder="Search by description or category..." value="${escapeHtml(expenseSearchQuery)}" />
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr></thead>
      <tbody id="expenses-tbody"></tbody>
    </table></div>
  `;

  if (admin) {
    el('btn-add-expense').addEventListener('click', () => openAddEditExpenseModal());
  }
  el('expense-search').addEventListener('input', (e) => {
    expenseSearchQuery = e.target.value;
    renderExpensesTableBody();
  });
  renderExpensesTableBody();
}

function renderExpensesTableBody() {
  const admin = isAdmin();
  const list = searchExpenses(expenseSearchQuery);
  const tbody = el('expenses-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-note">No expenses found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (e) => `
    <tr>
      <td>${formatDateForDisplay(e.spentOn)}</td>
      <td>${escapeHtml(e.description)}</td>
      <td>${escapeHtml(e.category) || '-'}</td>
      <td>${formatCurrency(e.amount)}</td>
      <td>
        ${admin ? `<button class="kebab-btn" data-action="row-menu" data-id="${e.id}" aria-label="Actions">&#8942;</button>` : ''}
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-action="row-menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expenseId = btn.dataset.id;
      const items = [
        { label: 'Edit', onClick: () => openAddEditExpenseModal(expenseId) },
        { label: 'Delete', danger: true, onClick: () => confirmDeleteExpense(expenseId) }
      ];
      toggleActionMenu(btn, items);
    });
  });
}

async function confirmDeleteExpense(expenseId) {
  const expense = getExpense(expenseId);
  if (!expense) return;
  if (!confirm(`Delete expense "${expense.description}" (${formatCurrency(expense.amount)})? This cannot be undone.`)) return;
  try {
    await deleteExpense(expenseId);
    renderExpensesTableBody();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

function openAddEditExpenseModal(expenseId = null) {
  const editing = Boolean(expenseId);
  const expense = editing ? getExpense(expenseId) : null;

  openModal(`
    <h3>${editing ? 'Edit Expense' : 'Add Expense'}</h3>
    <form id="form-expense">
      <label>Description
        <input type="text" id="fe-description" value="${editing ? escapeHtml(expense.description) : ''}" required />
      </label>
      <label>Amount
        <input type="number" id="fe-amount" min="0" step="0.01" value="${editing ? expense.amount : ''}" required />
      </label>
      <label>Category (optional)
        <input type="text" id="fe-category" placeholder="e.g. Electricity, Event, Repair" value="${editing ? escapeHtml(expense.category) : ''}" />
      </label>
      <label>Date
        <input type="date" id="fe-date" value="${editing ? expense.spentOn : todayISO()}" required />
      </label>
      <label>Note (optional)
        <input type="text" id="fe-note" value="${editing ? escapeHtml(expense.note) : ''}" />
      </label>
      <p class="form-error" id="fe-error"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="fe-cancel">Cancel</button>
        <button type="submit" class="btn-primary">${editing ? 'Save Changes' : 'Add Expense'}</button>
      </div>
    </form>
  `);

  el('fe-cancel').addEventListener('click', closeModal);
  el('form-expense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = {
      description: el('fe-description').value,
      amount: el('fe-amount').value,
      category: el('fe-category').value,
      spentOn: el('fe-date').value,
      note: el('fe-note').value
    };
    if (!fields.description.trim()) {
      el('fe-error').textContent = 'Description is required.';
      return;
    }
    if (!fields.amount || Number(fields.amount) <= 0) {
      el('fe-error').textContent = 'Amount must be greater than zero.';
      return;
    }

    try {
      if (editing) {
        await updateExpense(expenseId, fields);
      } else {
        await addExpense(fields);
      }
      closeModal();
      refreshCurrentPage();
    } catch (err) {
      el('fe-error').textContent = 'Save failed: ' + err.message;
    }
  });
}

// ---------- Settings ----------

function renderSettingsPage() {
  el('page-settings').innerHTML = `
    <h2>Settings</h2>

    <div class="settings-section">
      <h3>Committee</h3>
      <form id="form-committee">
        <label>Committee Name
          <input type="text" id="set-committee-name" value="${escapeHtml(data.settings.committeeName)}" required />
        </label>
        <label>Rate per Member per Month (₹)
          <input type="number" id="set-rate" value="${data.settings.ratePerMember}" min="1" required />
        </label>
        <button type="submit" class="btn-primary">Save</button>
        <span class="save-feedback" id="committee-save-feedback"></span>
      </form>
    </div>

    <div class="settings-section">
      <h3>Admin Account</h3>
      <p class="muted">Logged in as <strong>${escapeHtml(adminEmail())}</strong></p>
      <form id="form-password">
        <label>Current Password <input type="password" id="pw-current" required /></label>
        <label>New Password <input type="password" id="pw-new" required minlength="6" /></label>
        <label>Confirm New Password <input type="password" id="pw-confirm" required minlength="6" /></label>
        <button type="submit" class="btn-primary">Change Password</button>
        <span class="save-feedback" id="password-save-feedback"></span>
      </form>
    </div>

    <div class="settings-section">
      <h3>Backup &amp; Restore</h3>
      <p class="muted">Data is synced to the cloud automatically. Backups are an extra safety net.</p>
      <div class="btn-row">
        <button class="btn-secondary" id="btn-export">Export Backup (JSON)</button>
        <label class="file-input-label btn-secondary">Import Backup
          <input type="file" id="btn-import" accept="application/json" />
        </label>
        ${hasLegacyLocalData() ? `<button class="btn-secondary" id="btn-migrate">Move old data from this browser to cloud</button>` : ''}
      </div>
    </div>

    <div class="settings-section danger-zone">
      <h3>Danger Zone</h3>
      <button class="btn-danger" id="btn-reset-all">Erase All Data</button>
    </div>
  `;

  el('form-committee').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = el('committee-save-feedback');
    try {
      await saveSettings({
        committeeName: el('set-committee-name').value.trim() || data.settings.committeeName,
        ratePerMember: Number(el('set-rate').value) || data.settings.ratePerMember
      });
      feedback.textContent = 'Saved!';
      feedback.className = 'save-feedback';
    } catch (err) {
      feedback.textContent = 'Save failed: ' + err.message;
      feedback.className = 'save-feedback error';
    }
    setTimeout(() => (feedback.textContent = ''), 3000);
  });

  el('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = el('password-save-feedback');
    const next = el('pw-new').value;
    if (next !== el('pw-confirm').value) {
      feedback.textContent = 'New passwords do not match.';
      feedback.className = 'save-feedback error';
      return;
    }
    try {
      await changeAdminPassword(el('pw-current').value, next);
      feedback.textContent = 'Password changed.';
      feedback.className = 'save-feedback';
      el('form-password').reset();
    } catch (err) {
      feedback.textContent = friendlyAuthError(err);
      feedback.className = 'save-feedback error';
    }
  });

  el('btn-export').addEventListener('click', () => exportDataFile());

  el('btn-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importing will REPLACE all current data on ALL devices. Continue?')) {
      e.target.value = '';
      return;
    }
    try {
      await importDataFile(file);
      alert('Backup imported successfully.');
      renderApp();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  });

  const migrateBtn = el('btn-migrate');
  if (migrateBtn) {
    migrateBtn.addEventListener('click', async () => {
      if (!confirm('This copies the old data saved in this browser to the cloud, REPLACING whatever is in the cloud now. Continue?')) return;
      try {
        await migrateLegacyLocalData();
        alert('Old data moved to the cloud. It will now appear on all devices.');
        renderSettingsPage();
      } catch (err) {
        alert('Migration failed: ' + err.message);
      }
    });
  }

  el('btn-reset-all').addEventListener('click', async () => {
    const typed = prompt('This will permanently erase all families, payments and settings on ALL devices.\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try {
      await eraseAllCloudData();
      alert('All data erased.');
      renderApp();
    } catch (err) {
      alert('Erase failed: ' + err.message);
    }
  });
}

// ---------- Modal: generic open/close ----------

function openModal(html) {
  el('modal-content').innerHTML = html;
  el('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  el('modal-overlay').classList.add('hidden');
  el('modal-content').innerHTML = '';
}

// ---------- Modal: Add / Edit Family ----------

function openAddEditFamilyModal(familyId = null) {
  const editing = Boolean(familyId);
  const family = editing ? getFamily(familyId) : null;

  openModal(`
    <h3>${editing ? 'Edit Family' : 'Add Family'}</h3>
    <form id="form-family">
      <label>Family Head Name
        <input type="text" id="ff-head-name" value="${editing ? escapeHtml(family.headName) : ''}" required />
      </label>
      <label>Phone Number
        <input type="tel" id="ff-phone" value="${editing ? escapeHtml(family.phone) : ''}" placeholder="e.g. 9876543210" required />
      </label>
      <label>Number of Family Members
        <input type="number" id="ff-members" min="1" value="${editing ? family.members : ''}" required />
      </label>
      <label>Address (optional)
        <input type="text" id="ff-address" value="${editing ? escapeHtml(family.address) : ''}" />
      </label>
      <label>Notes (optional)
        <input type="text" id="ff-notes" value="${editing ? escapeHtml(family.notes) : ''}" />
      </label>
      <p class="form-error" id="ff-error"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="ff-cancel">Cancel</button>
        <button type="submit" class="btn-primary">${editing ? 'Save Changes' : 'Add Family'}</button>
      </div>
    </form>
  `);

  el('ff-cancel').addEventListener('click', closeModal);
  el('form-family').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = {
      headName: el('ff-head-name').value,
      phone: el('ff-phone').value,
      members: el('ff-members').value,
      address: el('ff-address').value,
      notes: el('ff-notes').value
    };
    if (!fields.headName.trim()) {
      el('ff-error').textContent = 'Head name is required.';
      return;
    }
    if (fields.phone.replace(/\D/g, '').length < 10) {
      el('ff-error').textContent = 'Enter a valid phone number (at least 10 digits).';
      return;
    }
    if (!fields.members || Number(fields.members) < 1) {
      el('ff-error').textContent = 'Number of members must be at least 1.';
      return;
    }

    try {
      if (editing) {
        await updateFamily(familyId, fields);
      } else {
        await addFamily(fields);
      }
      closeModal();
      refreshCurrentPage();
    } catch (err) {
      el('ff-error').textContent = 'Save failed: ' + err.message;
    }
  });
}

// ---------- Modal: Record Payment (also handles pure advance deposits) ----------

function openRecordPaymentModal(familyId, prefillYear) {
  const family = getFamily(familyId);
  if (!family) return;
  let year = prefillYear || currentYear();

  const renderBody = () => {
    const paidMonths = getPaidMonthsForYear(familyId, year);
    return `
      <h3>Record Payment - ${escapeHtml(family.headName)}</h3>
      <label>Year <select id="rp-year">${yearOptions(year)}</select></label>
      <p class="muted">Select the months being paid for. Already-paid months are locked. Leave all months unchecked to record a standalone advance deposit instead.</p>
      <div class="month-checkbox-grid" id="rp-month-grid">
        ${MONTH_SHORT.map((m, i) => {
          const monthNum = i + 1;
          const paid = paidMonths.has(monthNum);
          return `
            <label class="month-checkbox ${paid ? 'paid' : ''}">
              <input type="checkbox" value="${monthNum}" ${paid ? 'checked disabled' : ''} />
              ${m}${paid ? ' ✓' : ''}
            </label>`;
        }).join('')}
      </div>
      <div class="amount-display" id="rp-amount-box"></div>
      <label id="rp-extra-label">Extra Amount
        <input type="number" id="rp-extra" min="0" value="0" />
      </label>
      <p class="muted" id="rp-extra-hint"></p>
      <label>Payment Date <input type="date" id="rp-date" value="${todayISO()}" /></label>
      <label>Note (optional) <input type="text" id="rp-note" /></label>
      <p class="form-error" id="rp-error"></p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="rp-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="rp-save">Save Payment</button>
      </div>
    `;
  };

  const wireBody = () => {
    el('rp-year').value = String(year);
    el('rp-year').addEventListener('change', (e) => {
      year = Number(e.target.value);
      el('modal-content').innerHTML = renderBody();
      wireBody();
    });

    const advanceBalance = family.advanceBalance || 0;
    const updateAmount = () => {
      const checked = el('rp-month-grid').querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
      const extra = Math.max(0, Number(el('rp-extra').value) || 0);
      const box = el('rp-amount-box');
      const saveBtn = el('rp-save');

      if (checked.length === 0) {
        box.innerHTML = `<div>Advance to Deposit: <strong>${formatCurrency(extra)}</strong></div>`;
        el('rp-extra-label').firstChild.textContent = 'Advance Amount ';
        el('rp-extra-hint').textContent = 'No months selected - this will be recorded as a standalone advance deposit, auto-applied to future dues.';
        saveBtn.textContent = 'Save Advance';
      } else {
        const dues = calculateAmount(family.members, data.settings.ratePerMember, checked.length);
        const advanceApplied = Math.min(advanceBalance, dues);
        box.innerHTML = `
          <div>Dues Amount: <strong>${formatCurrency(dues)}</strong></div>
          ${advanceBalance > 0 ? `<div>Advance Applied: <strong>${formatCurrency(advanceApplied)}</strong> <span class="muted">(balance: ${formatCurrency(advanceBalance)})</span></div>` : ''}
          <div>Amount to Collect Now: <strong>${formatCurrency(dues - advanceApplied + extra)}</strong></div>
        `;
        el('rp-extra-label').firstChild.textContent = 'Extra Amount ';
        el('rp-extra-hint').textContent = 'Optional: anything paid beyond dues is banked as advance for future months.';
        saveBtn.textContent = 'Save Payment';
      }
    };
    el('rp-month-grid').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', updateAmount);
    });
    el('rp-extra').addEventListener('input', updateAmount);
    updateAmount();

    el('rp-cancel').addEventListener('click', closeModal);
    el('rp-save').addEventListener('click', async () => {
      const checked = [...el('rp-month-grid').querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')];
      const months = checked.map((c) => Number(c.value));
      const extra = Math.max(0, Number(el('rp-extra').value) || 0);
      const paidOn = el('rp-date').value || todayISO();
      const note = el('rp-note').value;

      if (months.length === 0 && extra <= 0) {
        el('rp-error').textContent = 'Select at least one month, or enter an amount to record as advance.';
        return;
      }
      const saveBtn = el('rp-save');
      saveBtn.disabled = true;
      const savingLabel = months.length === 0 ? 'Saving advance...' : 'Saving...';
      saveBtn.textContent = savingLabel;
      try {
        const result = months.length === 0
          ? await recordAdvance({ familyId, amount: extra, paidOn, note })
          : await recordPayment({ familyId, year, months, paidOn, note, extraAdvance: extra });
        if (result.error) {
          el('rp-error').textContent = result.error;
          return;
        }
        closeModal();
        refreshCurrentPage();
        openReceiptModal(result.payment || result.advance);
      } catch (err) {
        el('rp-error').textContent = 'Save failed: ' + err.message;
      } finally {
        saveBtn.disabled = false;
      }
    });
  };

  openModal(renderBody());
  wireBody();
}

// ---------- Modal: Receipt ----------

function openReceiptModal(payment) {
  if (!payment) return;
  const family = getFamily(payment.familyId);
  if (!family) return;
  const message = buildReceiptMessage(payment, family, data.settings);

  openModal(`
    <h3>Receipt ${payment.receiptNo}</h3>
    <textarea id="receipt-text" class="receipt-preview" readonly rows="12">${escapeHtml(message)}</textarea>
    <div class="modal-actions wrap">
      <button class="btn-secondary" id="receipt-copy">Copy Message</button>
      <button class="btn-secondary" id="receipt-print">Print Receipt</button>
      <button class="btn-primary" id="receipt-whatsapp">Send via WhatsApp</button>
      <button class="btn-secondary" id="receipt-close">Close</button>
    </div>
    <span class="save-feedback" id="receipt-feedback"></span>
  `);

  el('receipt-close').addEventListener('click', closeModal);

  el('receipt-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message);
      el('receipt-feedback').textContent = 'Copied to clipboard!';
    } catch {
      el('receipt-text').select();
      document.execCommand('copy');
      el('receipt-feedback').textContent = 'Copied to clipboard!';
    }
    setTimeout(() => (el('receipt-feedback').textContent = ''), 2000);
  });

  el('receipt-whatsapp').addEventListener('click', () => {
    window.open(buildWhatsAppLink(family.phone, message), '_blank');
  });

  el('receipt-print').addEventListener('click', () => {
    printReceipt(payment, family, data.settings);
  });
}

function printReceipt(payment, family, settings) {
  const monthsLabel = monthsListLabel(payment.year, payment.months);
  const w = window.open('', '_blank', 'width=420,height=600');
  w.document.write(`
    <html>
      <head>
        <title>Receipt ${escapeHtml(payment.receiptNo)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h2 { margin-bottom: 0; }
          .muted { color: #555; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          td { padding: 6px 0; border-bottom: 1px solid #eee; }
          td.label { color: #555; width: 55%; }
          .total { font-size: 1.2em; font-weight: bold; }
          .footer { margin-top: 24px; text-align: center; color: #555; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(settings.committeeName)}</h2>
        <p class="muted">Payment Receipt</p>
        <table>
          <tr><td class="label">Receipt No.</td><td>${escapeHtml(payment.receiptNo)}</td></tr>
          <tr><td class="label">Date</td><td>${formatDateForDisplay(payment.paidOn)}</td></tr>
          <tr><td class="label">Family Head</td><td>${escapeHtml(family.headName)}</td></tr>
          <tr><td class="label">Phone</td><td>${escapeHtml(family.phone)}</td></tr>
          <tr><td class="label">Family Members</td><td>${payment.membersAtPayment}</td></tr>
          <tr><td class="label">Months Paid</td><td>${escapeHtml(monthsLabel)}</td></tr>
          <tr><td class="label">Rate</td><td>${formatCurrency(payment.ratePerMember)} / member / month</td></tr>
          <tr><td class="label total">Total Amount</td><td class="total">${formatCurrency(payment.amount)}</td></tr>
        </table>
        <p class="footer">Thank you for your contribution.</p>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  w.print();
}

document.addEventListener('DOMContentLoaded', boot);
