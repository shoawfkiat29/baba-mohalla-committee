// Role handling. Admin is password protected (hash stored in settings); Viewer needs no password.
// Role is kept in sessionStorage so closing the browser tab returns to the login screen.

const SESSION_ROLE_KEY = 'mohalla_role';

function getRole() {
  return sessionStorage.getItem(SESSION_ROLE_KEY);
}

function setRole(role) {
  sessionStorage.setItem(SESSION_ROLE_KEY, role);
}

function clearRole() {
  sessionStorage.removeItem(SESSION_ROLE_KEY);
}

function isAdmin() {
  return getRole() === 'admin';
}

async function verifyAdminPassword(data, password) {
  const hash = await sha256Hex(password || '');
  return hash === data.settings.adminPasswordHash;
}

async function changeAdminPassword(data, newPassword) {
  data.settings.adminPasswordHash = await sha256Hex(newPassword);
  saveData(data);
}
