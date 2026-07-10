// Payment recording and dues calculations. Reads use the live mirror; the
// receipt number is issued inside a transaction so two devices recording at
// the same time can never get the same number.

function calculateAmount(members, ratePerMember, monthsCount) {
  return Number(members) * Number(ratePerMember) * Number(monthsCount);
}

function getPaidMonthsForYear(familyId, year) {
  const paid = new Set();
  data.payments
    .filter((p) => p.familyId === familyId && p.year === year)
    .forEach((p) => p.months.forEach((m) => paid.add(m)));
  return paid;
}

// Returns { payment } on success, or { error } if all requested months are already paid.
async function recordPayment({ familyId, year, months, paidOn, note }) {
  const family = getFamily(familyId);
  if (!family) return { error: 'Family not found.' };

  const alreadyPaid = getPaidMonthsForYear(familyId, year);
  const newMonths = months.filter((m) => !alreadyPaid.has(m));
  if (newMonths.length === 0) {
    return { error: 'All selected months are already marked as paid.' };
  }

  const { db, doc, runTransaction } = window.fb;
  const payRef = doc(db, 'payments', generateId('pay'));

  const payment = await runTransaction(db, async (tx) => {
    const snap = await tx.get(settingsRef());
    const settings = { ...getDefaultSettings(), ...(snap.exists() ? snap.data() : {}) };
    const receiptNo = `${settings.receiptPrefix}-${currentYear()}-${String(settings.receiptCounter).padStart(4, '0')}`;

    const fields = {
      familyId,
      year,
      months: [...newMonths].sort((a, b) => a - b),
      membersAtPayment: family.members,
      ratePerMember: settings.ratePerMember,
      amount: calculateAmount(family.members, settings.ratePerMember, newMonths.length),
      paidOn: paidOn || todayISO(),
      note: (note || '').trim(),
      receiptNo,
      createdAt: new Date().toISOString()
    };

    tx.set(payRef, fields);
    tx.set(settingsRef(), { ...settings, receiptCounter: settings.receiptCounter + 1 });
    return { id: payRef.id, ...fields };
  });

  return { payment };
}

function getPaymentsForFamily(familyId) {
  return data.payments
    .filter((p) => p.familyId === familyId)
    .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
}

function getPayment(id) {
  return data.payments.find((p) => p.id === id) || null;
}

function totalCollectedAllTime() {
  return data.payments.reduce((sum, p) => sum + p.amount, 0);
}

function totalCollectedForYear(year) {
  return data.payments.filter((p) => p.year === year).reduce((sum, p) => sum + p.amount, 0);
}

function getPendingFamiliesForMonth(year, month) {
  return data.families.filter((f) => {
    const paid = getPaidMonthsForYear(f.id, year);
    return !paid.has(month);
  });
}
