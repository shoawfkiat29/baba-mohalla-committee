// Payment recording, receipt numbering, and dues calculations.

function calculateAmount(members, ratePerMember, monthsCount) {
  return Number(members) * Number(ratePerMember) * Number(monthsCount);
}

function getPaidMonthsForYear(data, familyId, year) {
  const paid = new Set();
  data.payments
    .filter((p) => p.familyId === familyId && p.year === year)
    .forEach((p) => p.months.forEach((m) => paid.add(m)));
  return paid;
}

function nextReceiptNo(data) {
  const year = currentYear();
  const num = String(data.settings.receiptCounter).padStart(4, '0');
  return `${data.settings.receiptPrefix}-${year}-${num}`;
}

// Returns { payment } on success, or { error } if all requested months are already paid.
function recordPayment(data, { familyId, year, months, paidOn, note }) {
  const family = getFamily(data, familyId);
  if (!family) return { error: 'Family not found.' };

  const alreadyPaid = getPaidMonthsForYear(data, familyId, year);
  const newMonths = months.filter((m) => !alreadyPaid.has(m));
  if (newMonths.length === 0) {
    return { error: 'All selected months are already marked as paid.' };
  }

  const amount = calculateAmount(family.members, data.settings.ratePerMember, newMonths.length);
  const payment = {
    id: generateId('pay'),
    familyId,
    year,
    months: newMonths.sort((a, b) => a - b),
    membersAtPayment: family.members,
    ratePerMember: data.settings.ratePerMember,
    amount,
    paidOn: paidOn || todayISO(),
    note: (note || '').trim(),
    receiptNo: nextReceiptNo(data),
    createdAt: new Date().toISOString()
  };

  data.payments.push(payment);
  data.settings.receiptCounter += 1;
  saveData(data);
  return { payment };
}

function getPaymentsForFamily(data, familyId) {
  return data.payments
    .filter((p) => p.familyId === familyId)
    .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
}

function getPayment(data, id) {
  return data.payments.find((p) => p.id === id) || null;
}

function totalCollectedAllTime(data) {
  return data.payments.reduce((sum, p) => sum + p.amount, 0);
}

function totalCollectedForYear(data, year) {
  return data.payments.filter((p) => p.year === year).reduce((sum, p) => sum + p.amount, 0);
}

function getPendingFamiliesForMonth(data, year, month) {
  return data.families.filter((f) => {
    const paid = getPaidMonthsForYear(data, f.id, year);
    return !paid.has(month);
  });
}
