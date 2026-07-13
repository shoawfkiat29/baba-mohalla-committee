// Committee expense tracking. Reads use the live mirror; writes go to Firestore.

async function addExpense(fields) {
  const { db, doc, setDoc } = window.fb;
  const id = generateId('exp');
  await setDoc(doc(db, 'expenses', id), {
    description: fields.description.trim(),
    amount: Number(fields.amount),
    category: (fields.category || '').trim(),
    spentOn: fields.spentOn || todayISO(),
    note: (fields.note || '').trim(),
    createdAt: new Date().toISOString()
  });
  return id;
}

async function updateExpense(id, fields) {
  const { db, doc, setDoc } = window.fb;
  await setDoc(
    doc(db, 'expenses', id),
    {
      description: fields.description.trim(),
      amount: Number(fields.amount),
      category: (fields.category || '').trim(),
      spentOn: fields.spentOn || todayISO(),
      note: (fields.note || '').trim()
    },
    { merge: true }
  );
}

async function deleteExpense(id) {
  const { db, doc, deleteDoc } = window.fb;
  await deleteDoc(doc(db, 'expenses', id));
}

function getExpense(id) {
  return data.expenses.find((e) => e.id === id) || null;
}

function searchExpenses(query) {
  const q = (query || '').trim().toLowerCase();
  const list = [...data.expenses].sort((a, b) => (a.spentOn < b.spentOn ? 1 : -1));
  if (!q) return list;
  return list.filter(
    (e) => e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
  );
}

function totalExpensesAllTime() {
  return data.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function totalExpensesForMonth(year, month) {
  return data.expenses
    .filter((e) => e.spentOn && Number(e.spentOn.slice(0, 4)) === year && Number(e.spentOn.slice(5, 7)) === month)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}
