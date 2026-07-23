import { auth } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

const provider = new GoogleAuthProvider();

// Login com Google
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Erro no login:', error);
    alert('Erro ao fazer login. Tente novamente.');
  }
}

// Logout
export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Erro no logout:', error);
  }
}

// Observar estado de autenticação
export function observeAuthState(callback) {
  onAuthStateChanged(auth, callback);
}
