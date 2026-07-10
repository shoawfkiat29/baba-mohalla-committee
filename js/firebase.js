// Loads the Firebase SDK and exposes everything the app needs on window.fb.
// Runs as a module (deferred), so it finishes before DOMContentLoaded.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

if (window.FIREBASE_CONFIG) {
  const app = initializeApp(window.FIREBASE_CONFIG);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  window.fb = {
    auth,
    db,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    doc,
    collection,
    onSnapshot,
    setDoc,
    deleteDoc,
    writeBatch,
    runTransaction
  };
} else {
  window.fb = null;
}
