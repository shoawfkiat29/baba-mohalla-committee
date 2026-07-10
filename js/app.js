// Main UI: rendering, navigation, and event wiring. Vanilla JS, no framework, no build step.

let data = loadData();
let currentPage = 'dashboard';
let currentFamilyId = null;
let dashboardYear = currentYear();
let dashboardMonth = currentMonth();
let familyDetailYear = currentYear();

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

// ---------- Boot / top-level screen switch ----------

function boot() {
  wireLoginScreen();
  wireGlobalChrome();
  renderApp();
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

function wireLoginScreen() {
  el('btn-show-admin-login').addEventListener('click', () => {
    el('admin-login-form').classList.remove('hidden');
    el('login-error').textContent = '';
    el('admin-password').focus();
  });

  el('btn-admin-cancel').addEventListener('click', () => {
    el('admin-login-form').classList.add('hidden');
    el('admin-password').value = '';
    el('login-error').textContent = '';
  });

  el('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = el('admin-password').value;
    const ok = await verifyAdminPassword(data, password);
    if (ok) {
      setRole('admin');
      el('admin-password').value = '';
      el('admin-login-form').classList.add('hidden');
      renderApp();
    } else {
      el('login-error').textContent = 'Incorrect password. Try again.';
      el('admin-password').value = '';
      el('admin-password').focus();
    }
  });

  el('btn-viewer-login').addEventListener('click', () => {
    setRole('viewer');
    renderApp();
  });
}

function wireGlobalChrome() {
  el('btn-logout').addEventListener('click', () => {
    clearRole();
    renderApp();
  });

  el('tab-dashboard').addEventListener('click', () => navigateTo('dashboard'));
  el('tab-families').addEventListener('click', () => navigateTo('families'));
  el('tab-settings').addEventListener('click', () => navigateTo('settings'));

  el('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function navigateTo(page, params = {}) {
  currentPage = page;
  ['dashboard', 'families', 'family-detail', 'settings'].forEach((p) => {
    el(`page-${p}`).classList.toggle('hidden', p !== page);
  });
  ['dashboard', 'families', 'settings'].forEach((p) => {
    el(`tab-${p}`).classList.toggle('active', p === page);
  });

  if (page === 'dashboard') renderDashboard();
  if (page === 'families') renderFamiliesPage();
  if (page === 'family-detail') {
    currentFamilyId = params.familyId || currentFamilyId;
    familyDetailYear = params.year || currentYear();
    renderFamilyDetail(currentFamilyId);
  }
  if (page === 'settings') renderSettingsPage();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const admin = isAdmin();
  const pending = getPendingFamiliesForMonth(data, dashboardYear, dashboardMonth);

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
        <div class="stat-label">Collected in ${dashboardYear}</div>
        <div class="stat-value">${formatCurrency(totalCollectedForYear(data, dashboardYear))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Collected All-Time</div>
        <div class="stat-value">${formatCurrency(totalCollectedAllTime(data))}</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-label">Pending - ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</div>
        <div class="stat-value">${pending.length}</div>
      </div>
    </div>

    <h3>Families pending for ${MONTH_NAMES[dashboardMonth - 1]} ${dashboardYear}</h3>
    ${
      pending.length === 0
        ? '<p class="empty-note">Everyone has paid for this month. 🎉</p>'
        : `<table class="data-table">
            <thead><tr><th>Head Name</th><th>Phone</th><th>Members</th><th>Amount Due</th><th></th></tr></thead>
            <tbody>
              ${pending
                .map(
                  (f) => `
                <tr>
                  <td>${escapeHtml(f.headName)}</td>
                  <td>${escapeHtml(f.phone)}</td>
                  <td>${f.members}</td>
                  <td>${formatCurrency(f.members * data.settings.ratePerMember)}</td>
                  <td>
                    <button class="btn-link" data-action="view-family" data-id="${f.id}">View</button>
                    ${admin ? `<button class="btn-link" data-action="pay-family" data-id="${f.id}">Record Payment</button>` : ''}
                  </td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>`
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

  el('page-dashboard').querySelectorAll('[data-action="view-family"]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo('family-detail', { familyId: btn.dataset.id, year: dashboardYear }));
  });
  el('page-dashboard').querySelectorAll('[data-action="pay-family"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo('family-detail', { familyId: btn.dataset.id, year: dashboardYear });
      openRecordPaymentModal(btn.dataset.id, dashboardYear);
    });
  });
}

// ---------- Families list ----------

let familySearchQuery = '';

function renderFamiliesPage() {
  const admin = isAdmin();
  el('page-families').innerHTML = `
    <div class="page-header">
      <h2>Families</h2>
      ${admin ? `<button class="btn-primary" id="btn-add-family">+ Add Family</button>` : ''}
    </div>
    <input type="text" id="family-search" placeholder="Search by name or phone..." value="${escapeHtml(familySearchQuery)}" />
    <table class="data-table">
      <thead><tr><th>Head Name</th><th>Phone</th><th>Members</th><th>Amount / Month</th><th></th></tr></thead>
      <tbody id="families-tbody"></tbody>
    </table>
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
  const list = searchFamilies(data, familySearchQuery);
  const tbody = el('families-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-note">No families found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (f) => `
    <tr>
      <td>${escapeHtml(f.headName)}</td>
      <td>${escapeHtml(f.phone)}</td>
      <td>${f.members}</td>
      <td>${formatCurrency(f.members * data.settings.ratePerMember)}</td>
      <td>
        <button class="btn-link" data-action="view" data-id="${f.id}">View</button>
        ${admin ? `<button class="btn-link" data-action="edit" data-id="${f.id}">Edit</button>` : ''}
        ${admin ? `<button class="btn-link danger" data-action="delete" data-id="${f.id}">Delete</button>` : ''}
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-action="view"]').forEach((btn) =>
    btn.addEventListener('click', () => navigateTo('family-detail', { familyId: btn.dataset.id, year: currentYear() }))
  );
  tbody.querySelectorAll('[data-action="edit"]').forEach((btn) =>
    btn.addEventListener('click', () => openAddEditFamilyModal(btn.dataset.id))
  );
  tbody.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const family = getFamily(data, btn.dataset.id);
      const count = familyPaymentCount(data, btn.dataset.id);
      const msg = count > 0
        ? `Delete ${family.headName}? This will also delete ${count} payment record(s). This cannot be undone.`
        : `Delete ${family.headName}? This cannot be undone.`;
      if (confirm(msg)) {
        deleteFamily(data, btn.dataset.id);
        renderFamiliesTableBody();
      }
    })
  );
}

// ---------- Family detail ----------

function renderFamilyDetail(familyId) {
  const family = getFamily(data, familyId);
  if (!family) {
    navigateTo('families');
    return;
  }
  const admin = isAdmin();
  const paidMonths = getPaidMonthsForYear(data, familyId, familyDetailYear);
  const history = getPaymentsForFamily(data, familyId);

  el('page-family-detail').innerHTML = `
    <button class="btn-link" id="btn-back-to-families">&larr; Back to Families</button>
    <div class="page-header">
      <h2>${escapeHtml(family.headName)}</h2>
      ${admin ? `
        <div>
          <button class="btn-secondary" id="btn-edit-family">Edit</button>
          <button class="btn-danger" id="btn-delete-family">Delete</button>
        </div>` : ''}
    </div>

    <div class="info-card">
      <div><strong>Phone:</strong> ${escapeHtml(family.phone)}</div>
      <div><strong>Members:</strong> ${family.members}</div>
      <div><strong>Amount / Month:</strong> ${formatCurrency(family.members * data.settings.ratePerMember)}</div>
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
        history.filter((p) => p.year === familyDetailYear).reduce((s, p) => s + p.amount, 0)
      )}</strong>
      &nbsp;|&nbsp; All-time: <strong>${formatCurrency(history.reduce((s, p) => s + p.amount, 0))}</strong>
      &nbsp;|&nbsp; Outstanding months this year: <strong>${12 - paidMonths.size}</strong>
    </p>
    ${admin ? `<button class="btn-primary" id="btn-record-payment">Record Payment</button>` : ''}

    <h3>Payment History</h3>
    ${
      history.length === 0
        ? '<p class="empty-note">No payments recorded yet.</p>'
        : `<table class="data-table">
            <thead><tr><th>Date</th><th>Months</th><th>Amount</th><th>Receipt No.</th><th></th></tr></thead>
            <tbody>
              ${history
                .map(
                  (p) => `
                <tr>
                  <td>${formatDateForDisplay(p.paidOn)}</td>
                  <td>${monthsListLabel(p.year, p.months)}</td>
                  <td>${formatCurrency(p.amount)}</td>
                  <td>${p.receiptNo}</td>
                  <td><button class="btn-link" data-action="view-receipt" data-id="${p.id}">View Receipt</button></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>`
    }
  `;

  el('btn-back-to-families').addEventListener('click', () => navigateTo('families'));
  el('fd-year').addEventListener('change', (e) => {
    familyDetailYear = Number(e.target.value);
    renderFamilyDetail(familyId);
  });
  el('page-family-detail').querySelectorAll('[data-action="view-receipt"]').forEach((btn) =>
    btn.addEventListener('click', () => openReceiptModal(btn.dataset.id))
  );

  if (admin) {
    el('btn-edit-family').addEventListener('click', () => openAddEditFamilyModal(familyId));
    el('btn-delete-family').addEventListener('click', () => {
      const count = familyPaymentCount(data, familyId);
      const msg = count > 0
        ? `Delete ${family.headName}? This will also delete ${count} payment record(s). This cannot be undone.`
        : `Delete ${family.headName}? This cannot be undone.`;
      if (confirm(msg)) {
        deleteFamily(data, familyId);
        navigateTo('families');
      }
    });
    el('btn-record-payment').addEventListener('click', () => openRecordPaymentModal(familyId, familyDetailYear));
  }
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
      <h3>Change Admin Password</h3>
      <form id="form-password">
        <label>Current Password <input type="password" id="pw-current" required /></label>
        <label>New Password <input type="password" id="pw-new" required minlength="4" /></label>
        <label>Confirm New Password <input type="password" id="pw-confirm" required minlength="4" /></label>
        <button type="submit" class="btn-primary">Change Password</button>
        <span class="save-feedback" id="password-save-feedback"></span>
      </form>
    </div>

    <div class="settings-section">
      <h3>Backup &amp; Restore</h3>
      <p class="muted">Data is stored only in this browser. Export a backup regularly, especially before clearing browser data or switching devices.</p>
      <button class="btn-secondary" id="btn-export">Export Backup (JSON)</button>
      <label class="file-input-label">Import Backup
        <input type="file" id="btn-import" accept="application/json" />
      </label>
    </div>

    <div class="settings-section danger-zone">
      <h3>Danger Zone</h3>
      <button class="btn-danger" id="btn-reset-all">Erase All Data</button>
    </div>
  `;

  el('form-committee').addEventListener('submit', (e) => {
    e.preventDefault();
    data.settings.committeeName = el('set-committee-name').value.trim() || data.settings.committeeName;
    data.settings.ratePerMember = Number(el('set-rate').value) || data.settings.ratePerMember;
    saveData(data);
    el('app-committee-name').textContent = data.settings.committeeName;
    el('committee-save-feedback').textContent = 'Saved!';
    setTimeout(() => (el('committee-save-feedback').textContent = ''), 2000);
  });

  el('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = el('password-save-feedback');
    const current = el('pw-current').value;
    const next = el('pw-new').value;
    const confirmPw = el('pw-confirm').value;
    if (next !== confirmPw) {
      feedback.textContent = 'New passwords do not match.';
      feedback.className = 'save-feedback error';
      return;
    }
    const ok = await verifyAdminPassword(data, current);
    if (!ok) {
      feedback.textContent = 'Current password is incorrect.';
      feedback.className = 'save-feedback error';
      return;
    }
    await changeAdminPassword(data, next);
    feedback.textContent = 'Password changed.';
    feedback.className = 'save-feedback';
    el('form-password').reset();
  });

  el('btn-export').addEventListener('click', () => exportDataFile(data));

  el('btn-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importing will replace all current data in this browser. Continue?')) {
      e.target.value = '';
      return;
    }
    try {
      data = await importDataFile(file);
      alert('Backup imported successfully.');
      renderApp();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  });

  el('btn-reset-all').addEventListener('click', () => {
    const typed = prompt('This will permanently erase all families, payments and settings from this browser.\nType DELETE to confirm.');
    if (typed === 'DELETE') {
      localStorage.removeItem(STORAGE_KEY);
      clearRole();
      location.reload();
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
  const family = editing ? getFamily(data, familyId) : null;

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
  el('form-family').addEventListener('submit', (e) => {
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

    if (editing) {
      updateFamily(data, familyId, fields);
    } else {
      addFamily(data, fields);
    }
    closeModal();
    if (currentPage === 'families') renderFamiliesTableBody();
    if (currentPage === 'family-detail') renderFamilyDetail(currentFamilyId);
    if (currentPage === 'dashboard') renderDashboard();
  });
}

// ---------- Modal: Record Payment ----------

function openRecordPaymentModal(familyId, prefillYear) {
  const family = getFamily(data, familyId);
  if (!family) return;
  let year = prefillYear || currentYear();

  const renderBody = () => {
    const paidMonths = getPaidMonthsForYear(data, familyId, year);
    return `
      <h3>Record Payment - ${escapeHtml(family.headName)}</h3>
      <label>Year <select id="rp-year">${yearOptions(year)}</select></label>
      <p class="muted">Select the months being paid for. Already-paid months are locked.</p>
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
      <div class="amount-display">Amount: <strong id="rp-amount">₹0</strong></div>
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

    const updateAmount = () => {
      const checked = el('rp-month-grid').querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
      el('rp-amount').textContent = formatCurrency(calculateAmount(family.members, data.settings.ratePerMember, checked.length));
    };
    el('rp-month-grid').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', updateAmount);
    });
    updateAmount();

    el('rp-cancel').addEventListener('click', closeModal);
    el('rp-save').addEventListener('click', () => {
      const checked = [...el('rp-month-grid').querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')];
      const months = checked.map((c) => Number(c.value));
      if (months.length === 0) {
        el('rp-error').textContent = 'Select at least one month.';
        return;
      }
      const result = recordPayment(data, {
        familyId,
        year,
        months,
        paidOn: el('rp-date').value || todayISO(),
        note: el('rp-note').value
      });
      if (result.error) {
        el('rp-error').textContent = result.error;
        return;
      }
      closeModal();
      if (currentPage === 'family-detail') renderFamilyDetail(currentFamilyId);
      if (currentPage === 'dashboard') renderDashboard();
      openReceiptModal(result.payment.id);
    });
  };

  openModal(renderBody());
  wireBody();
}

// ---------- Modal: Receipt ----------

function openReceiptModal(paymentId) {
  const payment = getPayment(data, paymentId);
  if (!payment) return;
  const family = getFamily(data, payment.familyId);
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
