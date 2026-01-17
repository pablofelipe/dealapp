// Configuração Firebase (MESMA do app do usuário)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const firebaseConfig = {
  apiKey: "AIzaSyA3br8TLPbQZiMMyG9pjFm1F66LKxIztLs",
  authDomain: "the-dealapp.firebaseapp.com",
  projectId: "the-dealapp",
  storageBucket: "the-dealapp.firebasestorage.app",
  messagingSenderId: "278659003528",
  appId: "1:278659003528:web:e3e19c810b74a3370bdb3d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
