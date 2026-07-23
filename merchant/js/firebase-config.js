// Configuração Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEJpdEqFdVgSXd8fH7WYjEP2xCfPeGv2Q",
  authDomain: "deal-application.firebaseapp.com",
  projectId: "deal-application",
  storageBucket: "deal-application.firebasestorage.app",
  messagingSenderId: "985803535961",
  appId: "1:985803535961:web:5f7b976c1d5042bfc12348"
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
