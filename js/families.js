// Family reads come from the live mirror (synchronous); writes go to Firestore.

async function addFamily(fields) {
  const { db, doc, setDoc } = window.fb;
  const id = generateId('fam');
  await setDoc(doc(db, 'families', id), {
    headName: fields.headName.trim(),
    phone: fields.phone.trim(),
    members: Number(fields.members),
    address: (fields.address || '').trim(),
    notes: (fields.notes || '').trim(),
    createdAt: todayISO()
  });
  return id;
}

async function updateFamily(id, fields) {
  const { db, doc, setDoc } = window.fb;
  await setDoc(
    doc(db, 'families', id),
    {
      headName: fields.headName.trim(),
      phone: fields.phone.trim(),
      members: Number(fields.members),
      address: (fields.address || '').trim(),
      notes: (fields.notes || '').trim()
    },
    { merge: true }
  );
}

async function deleteFamily(id) {
  const { db, doc, writeBatch } = window.fb;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'families', id));
  data.payments.filter((p) => p.familyId === id).forEach((p) => batch.delete(doc(db, 'payments', p.id)));
  await batch.commit();
}

function getFamily(id) {
  return data.families.find((f) => f.id === id) || null;
}

function searchFamilies(query) {
  const q = (query || '').trim().toLowerCase();
  const list = [...data.families].sort((a, b) => a.headName.localeCompare(b.headName));
  if (!q) return list;
  return list.filter(
    (f) => f.headName.toLowerCase().includes(q) || f.phone.toLowerCase().includes(q)
  );
}

function familyPaymentCount(familyId) {
  return data.payments.filter((p) => p.familyId === familyId).length;
}
