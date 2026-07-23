// Configuração Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getMessaging } from 'firebase/messaging';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

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

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  console.log("🛠️ Rodando em ambiente local. Conectando aos Emuladores...");

  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectAuthEmulator(auth, "http://localhost:9099");
}
