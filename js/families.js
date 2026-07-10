// CRUD helpers for family records.

function addFamily(data, fields) {
  const family = {
    id: generateId('fam'),
    headName: fields.headName.trim(),
    phone: fields.phone.trim(),
    members: Number(fields.members),
    address: (fields.address || '').trim(),
    notes: (fields.notes || '').trim(),
    createdAt: todayISO()
  };
  data.families.push(family);
  saveData(data);
  return family;
}

function updateFamily(data, id, fields) {
  const family = getFamily(data, id);
  if (!family) return null;
  family.headName = fields.headName.trim();
  family.phone = fields.phone.trim();
  family.members = Number(fields.members);
  family.address = (fields.address || '').trim();
  family.notes = (fields.notes || '').trim();
  saveData(data);
  return family;
}

function deleteFamily(data, id) {
  data.families = data.families.filter((f) => f.id !== id);
  data.payments = data.payments.filter((p) => p.familyId !== id);
  saveData(data);
}

function getFamily(data, id) {
  return data.families.find((f) => f.id === id) || null;
}

function searchFamilies(data, query) {
  const q = (query || '').trim().toLowerCase();
  const list = [...data.families].sort((a, b) => a.headName.localeCompare(b.headName));
  if (!q) return list;
  return list.filter(
    (f) => f.headName.toLowerCase().includes(q) || f.phone.toLowerCase().includes(q)
  );
}

function familyPaymentCount(data, familyId) {
  return data.payments.filter((p) => p.familyId === familyId).length;
}
