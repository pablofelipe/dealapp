// Configuração Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3br8TLPbQZiMMyG9pjFm1F66LKxIztLs",
  authDomain: "the-dealapp.firebaseapp.com",
  projectId: "the-dealapp",
  storageBucket: "the-dealapp.firebasestorage.app",
  messagingSenderId: "278659003528",
  appId: "1:278659003528:web:e3e19c810b74a3370bdb3d"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const storage = getStorage(app);
export const messaging = getMessaging(app);
export const functions = getFunctions(app);

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  console.log("🛠️ Rodando em ambiente local. Conectando aos Emuladores...");

  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectAuthEmulator(auth, "http://localhost:9099");
}
