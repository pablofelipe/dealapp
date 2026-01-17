import { auth } from './firebase-config.js';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const provider = new GoogleAuthProvider();

// Login com Google
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    console.log('✅ Login realizado:', result.user.email);
    return result.user;
  } catch (error) {
    console.error('❌ Erro no login:', error);
    alert('Erro ao fazer login. Tente novamente.');
  }
}

// Logout
export async function logout() {
  try {
    await signOut(auth);
    console.log('✅ Logout realizado');
  } catch (error) {
    console.error('❌ Erro no logout:', error);
  }
}

// Observar estado de autenticação
export function observeAuthState(callback) {
  onAuthStateChanged(auth, callback);
}
