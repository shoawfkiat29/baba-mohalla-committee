// Firestore-backed data layer. A live in-memory mirror (`data`) is kept in sync
// via snapshot listeners; mutations write to Firestore and the listeners
// (with Firestore's latency compensation) update the mirror immediately.
//
// Firestore layout:
//   meta/settings                 -> { committeeName, ratePerMember, receiptPrefix, receiptCounter }
//   families/{id}                 -> family fields
//   payments/{id}                 -> payment fields
//   expenses/{id}                 -> expense fields

const LEGACY_STORAGE_KEY = 'mohalla_committee_data_v1';

function getDefaultSettings() {
  return {
    committeeName: 'Baba Mohalla Committee',
    ratePerMember: 50,
    receiptPrefix: 'MC',
    receiptCounter: 1
  };
}

// Live mirror of the cloud data. Read synchronously everywhere in the app.
const data = {
  settings: getDefaultSettings(),
  families: [],
  payments: [],
  expenses: []
};

function settingsRef() {
  return window.fb.doc(window.fb.db, 'meta', 'settings');
}

// Subscribes to all three data sets; calls onChange after every update.
function startDataSync(onChange) {
  const { db, onSnapshot, collection } = window.fb;

  onSnapshot(settingsRef(), (snap) => {
    data.settings = { ...getDefaultSettings(), ...(snap.exists() ? snap.data() : {}) };
    onChange();
  });

  onSnapshot(collection(db, 'families'), (snap) => {
    data.families = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange();
  });

  onSnapshot(collection(db, 'payments'), (snap) => {
    data.payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange();
  });

  onSnapshot(collection(db, 'expenses'), (snap) => {
    data.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange();
  });
}

async function saveSettings(fields) {
  await window.fb.setDoc(settingsRef(), fields, { merge: true });
}

// ---------- Backup / restore ----------

function exportDataFile() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mohalla-committee-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stripId(record) {
  const { id, ...rest } = record;
  return rest;
}

// Deletes every family and payment currently in the mirror, in batches.
async function eraseAllCloudData() {
  const { db, doc, writeBatch, setDoc } = window.fb;
  const refs = [
    ...data.families.map((f) => doc(db, 'families', f.id)),
    ...data.payments.map((p) => doc(db, 'payments', p.id)),
    ...data.expenses.map((e) => doc(db, 'expenses', e.id))
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await setDoc(settingsRef(), getDefaultSettings());
}

// Replaces all cloud data with the contents of a parsed backup object.
async function writeBackupToCloud(parsed) {
  const { db, doc, writeBatch, setDoc } = window.fb;
  await eraseAllCloudData();

  const writes = [
    ...(parsed.families || []).map((f) => ({ ref: doc(db, 'families', f.id || generateId('fam')), fields: stripId(f) })),
    ...(parsed.payments || []).map((p) => ({ ref: doc(db, 'payments', p.id || generateId('pay')), fields: stripId(p) })),
    ...(parsed.expenses || []).map((e) => ({ ref: doc(db, 'expenses', e.id || generateId('exp')), fields: stripId(e) }))
  ];
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach((w) => batch.set(w.ref, w.fields));
    await batch.commit();
  }

  const settings = { ...getDefaultSettings(), ...(parsed.settings || {}) };
  delete settings.adminPasswordHash; // field from the old local-storage version
  await setDoc(settingsRef(), settings);
}

function importDataFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.settings) {
          throw new Error('This file does not look like a valid backup.');
        }
        await writeBackupToCloud(parsed);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

// ---------- Migration from the old local-storage version ----------

function hasLegacyLocalData() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return (parsed.families || []).length > 0 || (parsed.payments || []).length > 0;
  } catch {
    return false;
  }
}

async function migrateLegacyLocalData() {
  const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
  await writeBackupToCloud(parsed);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
