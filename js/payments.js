// Payment recording, advance-balance handling, and dues calculations. Reads
// use the live mirror; receipt numbers and balance updates are done inside a
// transaction so two devices acting at the same time never conflict.
//
// Two kinds of "transaction" live in the payments collection:
//   type: 'payment'  -> tied to specific months (the normal case)
//   type: 'advance'  -> money kept on account, not tied to any month yet
//
// A family's advanceBalance is auto-applied toward dues when recording a
// payment, and any extra handed over beyond what's due can be banked back
// into the advance balance for future months.

function calculateAmount(members, ratePerMember, monthsCount) {
  return Number(members) * Number(ratePerMember) * Number(monthsCount);
}

function getPaidMonthsForYear(familyId, year) {
  const paid = new Set();
  data.payments
    .filter((p) => p.type !== 'advance' && p.familyId === familyId && p.year === year)
    .forEach((p) => p.months.forEach((m) => paid.add(m)));
  return paid;
}

function familyRef(familyId) {
  return window.fb.doc(window.fb.db, 'families', familyId);
}

// Actual new cash that changed hands for a transaction (as opposed to its
// face value, which may have been partly funded by a pre-existing advance).
function cashCollectedOf(p) {
  if (p.type === 'advance') return p.amount;
  return (p.amount || 0) - (p.advanceApplied || 0) + (p.advanceAdded || 0);
}

async function issueReceiptNo(tx) {
  const snap = await tx.get(settingsRef());
  const settings = { ...getDefaultSettings(), ...(snap.exists() ? snap.data() : {}) };
  const receiptNo = `${settings.receiptPrefix}-${currentYear()}-${String(settings.receiptCounter).padStart(4, '0')}`;
  tx.set(settingsRef(), { ...settings, receiptCounter: settings.receiptCounter + 1 });
  return { receiptNo, settings };
}

// Returns { payment } on success, or { error } if all requested months are already paid.
// extraAdvance: optional amount handed over beyond what's due, banked for future months.
async function recordPayment({ familyId, year, months, paidOn, note, extraAdvance }) {
  const family = getFamily(familyId);
  if (!family) return { error: 'Family not found.' };

  const alreadyPaid = getPaidMonthsForYear(familyId, year);
  const newMonths = months.filter((m) => !alreadyPaid.has(m));
  if (newMonths.length === 0) {
    return { error: 'All selected months are already marked as paid.' };
  }

  const { db, doc, runTransaction } = window.fb;
  const payRef = doc(db, 'payments', generateId('pay'));
  const famRef = familyRef(familyId);
  const extra = Math.max(0, Number(extraAdvance) || 0);

  const payment = await runTransaction(db, async (tx) => {
    const famSnap = await tx.get(famRef);
    const currentAdvance = famSnap.exists() ? Number(famSnap.data().advanceBalance) || 0 : 0;
    const { receiptNo, settings } = await issueReceiptNo(tx);

    const amount = calculateAmount(family.members, settings.ratePerMember, newMonths.length);
    const advanceApplied = Math.min(currentAdvance, amount);
    const newAdvanceBalance = currentAdvance - advanceApplied + extra;

    const fields = {
      type: 'payment',
      familyId,
      year,
      months: [...newMonths].sort((a, b) => a - b),
      membersAtPayment: family.members,
      ratePerMember: settings.ratePerMember,
      amount,
      advanceApplied,
      advanceAdded: extra,
      paidOn: paidOn || todayISO(),
      note: (note || '').trim(),
      receiptNo,
      createdAt: new Date().toISOString()
    };

    tx.set(payRef, fields);
    tx.update(famRef, { advanceBalance: newAdvanceBalance });
    return { id: payRef.id, ...fields, newAdvanceBalance };
  });

  return { payment };
}

// Records money received that isn't tied to specific months yet; it's banked
// on the family's advance balance and auto-applied to future payments.
async function recordAdvance({ familyId, amount, paidOn, note }) {
  const family = getFamily(familyId);
  if (!family) return { error: 'Family not found.' };
  const amt = Number(amount) || 0;
  if (amt <= 0) return { error: 'Enter an amount greater than zero.' };

  const { db, doc, runTransaction } = window.fb;
  const advRef = doc(db, 'payments', generateId('adv'));
  const famRef = familyRef(familyId);
  const date = paidOn || todayISO();

  const advance = await runTransaction(db, async (tx) => {
    const famSnap = await tx.get(famRef);
    const currentAdvance = famSnap.exists() ? Number(famSnap.data().advanceBalance) || 0 : 0;
    const { receiptNo } = await issueReceiptNo(tx);
    const newAdvanceBalance = currentAdvance + amt;

    const fields = {
      type: 'advance',
      familyId,
      year: Number(date.slice(0, 4)),
      amount: amt,
      paidOn: date,
      note: (note || '').trim(),
      receiptNo,
      createdAt: new Date().toISOString()
    };

    tx.set(advRef, fields);
    tx.update(famRef, { advanceBalance: newAdvanceBalance });
    return { id: advRef.id, ...fields, newAdvanceBalance };
  });

  return { advance };
}

// Deletes a payment or advance deposit and reverses its effect on the
// family's advance balance (clamped at 0 to stay defensive).
async function deleteTransaction(paymentId) {
  const { db, doc, runTransaction } = window.fb;
  const payRef = doc(db, 'payments', paymentId);

  await runTransaction(db, async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists()) return;
    const p = paySnap.data();
    const famRef = familyRef(p.familyId);
    const famSnap = await tx.get(famRef);
    const currentAdvance = famSnap.exists() ? Number(famSnap.data().advanceBalance) || 0 : 0;

    const delta = p.type === 'advance'
      ? -p.amount
      : (p.advanceApplied || 0) - (p.advanceAdded || 0);

    tx.delete(payRef);
    if (famSnap.exists()) {
      tx.update(famRef, { advanceBalance: Math.max(0, currentAdvance + delta) });
    }
  });
}

function getTransactionsForFamily(familyId) {
  return data.payments
    .filter((p) => p.familyId === familyId)
    .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
}

function getPayment(id) {
  return data.payments.find((p) => p.id === id) || null;
}

function totalCollectedAllTime() {
  return data.payments.reduce((sum, p) => sum + cashCollectedOf(p), 0);
}

function totalCollectedForYear(year) {
  return data.payments.filter((p) => p.year === year).reduce((sum, p) => sum + cashCollectedOf(p), 0);
}

// Value of dues settled for one specific month (not the cash timeline - a
// single payment can cover several months, so this counts each month's
// share of it, regardless of when or via advance the money came in).
function totalDuesForMonth(year, month) {
  return data.payments
    .filter((p) => p.type !== 'advance' && p.year === year && p.months.includes(month))
    .reduce((sum, p) => sum + p.ratePerMember * p.membersAtPayment, 0);
}

function getPendingFamiliesForMonth(year, month) {
  return data.families.filter((f) => {
    const paid = getPaidMonthsForYear(f.id, year);
    return !paid.has(month);
  });
}

function getPaidFamiliesForMonth(year, month) {
  return data.families.filter((f) => {
    const paid = getPaidMonthsForYear(f.id, year);
    return paid.has(month);
  });
}
