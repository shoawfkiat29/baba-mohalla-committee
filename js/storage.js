// Local-storage backed data layer. Everything the app knows lives in one JSON blob.

const STORAGE_KEY = 'mohalla_committee_data_v1';

// SHA-256 of the default admin password "admin123" (precomputed so first load is sync).
const DEFAULT_ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

function getDefaultData() {
  return {
    settings: {
      committeeName: 'Baba Mohalla Committee',
      ratePerMember: 50,
      adminPasswordHash: DEFAULT_ADMIN_HASH,
      receiptPrefix: 'MC',
      receiptCounter: 1
    },
    families: [],
    payments: []
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = getDefaultData();
    saveData(fresh);
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw);
    // Fill in any missing fields for forward compatibility.
    const defaults = getDefaultData();
    parsed.settings = { ...defaults.settings, ...(parsed.settings || {}) };
    parsed.families = Array.isArray(parsed.families) ? parsed.families : [];
    parsed.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
    return parsed;
  } catch (e) {
    console.error('Failed to parse stored data, resetting.', e);
    const fresh = getDefaultData();
    saveData(fresh);
    return fresh;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function exportDataFile(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = todayISO();
  a.href = url;
  a.download = `mohalla-committee-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDataFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.settings) {
          throw new Error('This file does not look like a valid backup.');
        }
        const defaults = getDefaultData();
        parsed.settings = { ...defaults.settings, ...(parsed.settings || {}) };
        parsed.families = Array.isArray(parsed.families) ? parsed.families : [];
        parsed.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
        saveData(parsed);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}
