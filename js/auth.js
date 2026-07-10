// Roles: admin = signed-in Firebase user (email/password, enforced by Firestore
// security rules); viewer = read-only, no login, flagged in sessionStorage.

const VIEWER_KEY = 'mohalla_viewer';

let fbUser = null; // kept current by the onAuthStateChanged listener in app.js

function setFbUser(user) {
  fbUser = user;
}

function getRole() {
  if (fbUser) return 'admin';
  return sessionStorage.getItem(VIEWER_KEY) ? 'viewer' : null;
}

function isAdmin() {
  return getRole() === 'admin';
}

function adminEmail() {
  return fbUser ? fbUser.email : '';
}

function enterViewer() {
  sessionStorage.setItem(VIEWER_KEY, '1');
}

async function adminLogin(email, password) {
  await window.fb.signInWithEmailAndPassword(window.fb.auth, email, password);
}

async function logoutAll() {
  sessionStorage.removeItem(VIEWER_KEY);
  if (window.fb.auth.currentUser) {
    await window.fb.signOut(window.fb.auth);
  }
}

async function changeAdminPassword(currentPassword, newPassword) {
  const user = window.fb.auth.currentUser;
  const cred = window.fb.EmailAuthProvider.credential(user.email, currentPassword);
  await window.fb.reauthenticateWithCredential(user, cred);
  await window.fb.updatePassword(user, newPassword);
}

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Incorrect email or password.';
  }
  if (code.includes('invalid-email')) return 'That is not a valid email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.';
  if (code.includes('network-request-failed')) return 'Network error. Check your internet connection.';
  if (code.includes('weak-password')) return 'Password is too weak (minimum 6 characters).';
  return 'Login failed: ' + (err && err.message ? err.message : 'unknown error');
}
