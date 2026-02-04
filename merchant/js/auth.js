import { auth } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const provider = new GoogleAuthProvider();

// Configurações do provedor
provider.setCustomParameters({
  prompt: 'select_account'
});

// Estado da aplicação
let currentUser = null;
let authListeners = [];

// ========== FUNÇÕES PÚBLICAS ==========

/**
 * Inicia o login com Google
 * @returns {Promise<User|null>} Usuário logado ou null em caso de erro
 */
export async function loginWithGoogle() {
  try {
    showLoading(true);

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    console.log('✅ Login realizado:', user.email);

    // Verificar se é um lojista cadastrado
    const merchantProfile = await checkMerchantProfile(user.uid);

    // Retorna objeto combinado com dados do usuário e do merchant
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      merchantProfile: merchantProfile,
      isMerchantRegistered: !!merchantProfile
    };

    currentUser = userData;
    notifyAuthListeners(userData);

    return userData;

  } catch (error) {
    console.error('❌ Erro no login:', error);
    handleAuthError(error);
    return null;
  } finally {
    showLoading(false);
  }
}

/**
 * Realiza logout do usuário
 * @returns {Promise<boolean>} Sucesso da operação
 */
export async function logout() {
  try {
    showLoading(true);

    await signOut(auth);
    console.log('✅ Logout realizado');

    currentUser = null;
    notifyAuthListeners(null);

    return true;
  } catch (error) {
    console.error('❌ Erro no logout:', error);
    handleAuthError(error);
    return false;
  } finally {
    showLoading(false);
  }
}

export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Retorna o usuário atual
 * @returns {Object|null} Dados do usuário atual
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Verifica se o usuário está autenticado
 * @returns {boolean} Status de autenticação
 */
export function isAuthenticated() {
  return currentUser !== null;
}

/**
 * Verifica se o usuário é um lojista cadastrado
 * @returns {boolean} Status de cadastro como lojista
 */
export function isMerchantRegistered() {
  return currentUser?.isMerchantRegistered || false;
}

/**
 * Adiciona listener para mudanças de autenticação
 * @param {Function} callback - Função a ser chamada quando o estado muda
 * @returns {Function} Função para remover o listener
 */
export function addAuthListener(callback) {
  authListeners.push(callback);

  // Chama imediatamente com estado atual
  if (currentUser !== undefined) {
    callback(currentUser);
  }

  // Retorna função para remover o listener
  return () => {
    const index = authListeners.indexOf(callback);
    if (index > -1) {
      authListeners.splice(index, 1);
    }
  };
}

/**
 * Inicializa o observador de estado de autenticação
 */
export function initializeAuth() {
  console.log('🔐 Inicializando observador de autenticação...');

  onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (firebaseUser) {
        console.log('👤 Usuário autenticado:', firebaseUser.email);

        // Verificar perfil do merchant
        const merchantProfile = await checkMerchantProfile(firebaseUser.uid);

        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          merchantProfile: merchantProfile,
          isMerchantRegistered: !!merchantProfile
        };

        currentUser = userData;
        notifyAuthListeners(userData);

        inicializarConcierge(userData);

      } else {
        console.log('👤 Nenhum usuário autenticado');
        currentUser = null;
        notifyAuthListeners(null);
      }
    } catch (error) {
      console.error('❌ Erro ao processar estado de autenticação:', error);
      currentUser = null;
      notifyAuthListeners(null);
    }
  });
}

export async function inicializarConcierge(userData) {
  try {
    //console.log('🚀 Inicializando concierge para:', JSON.stringify(userData));

    const { inicializarConcierge: conciergeUI } = await import('./merchant.js');

    return await conciergeUI(userData);

  } catch (error) {
    console.error('❌ Erro ao inicializar concierge:', error);
    return null;
  }
}

// ========== FUNÇÕES PRIVADAS ==========

/**
 * Notifica todos os listeners sobre mudança de estado
 * @param {Object|null} user - Novo estado do usuário
 */
function notifyAuthListeners(user) {
  console.log('📢 Notificando', authListeners.length, 'listeners');
  authListeners.forEach(callback => {
    try {
      callback(user);
    } catch (error) {
      console.error('❌ Erro em listener de autenticação:', error);
    }
  });
}

/**
 * Mostra/oculta tela de loading
 * @param {boolean} show - Se deve mostrar ou ocultar
 */
function showLoading(show) {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Trata erros de autenticação de forma amigável
 * @param {Error} error - Erro ocorrido
 */
function handleAuthError(error) {
  let userMessage = 'Ocorreu um erro durante a autenticação.';

  switch (error.code) {
    case 'auth/popup-blocked':
      userMessage = 'O popup de login foi bloqueado. Permita popups para este site.';
      break;
    case 'auth/popup-closed-by-user':
      userMessage = 'Login cancelado. Feche a janela de login?';
      break;
    case 'auth/unauthorized-domain':
      userMessage = 'Domínio não autorizado. Contate o suporte.';
      break;
    case 'auth/operation-not-allowed':
      userMessage = 'Operação não permitida. Contate o suporte.';
      break;
    case 'auth/network-request-failed':
      userMessage = 'Erro de conexão. Verifique sua internet.';
      break;
    default:
      userMessage = error.message || 'Erro desconhecido. Tente novamente.';
  }

  // Mostrar notificação visual
  showNotification('error', userMessage);
}

/**
 * Mostra notificação visual
 * @param {string} type - Tipo: 'success', 'error', 'warning'
 * @param {string} message - Mensagem a ser exibida
 */
function showNotification(type, message) {
  // Remove notificações anteriores
  const existing = document.querySelector('.auth-notification');
  if (existing) existing.remove();

  // Cria nova notificação
  const notification = document.createElement('div');
  notification.className = `auth-notification auth-notification-${type}`;
  notification.textContent = message;

  // Estilos
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    border-radius: 8px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideInRight 0.3s ease;
    max-width: 400px;
    word-wrap: break-word;
  `;

  document.body.appendChild(notification);

  // Remove após 5 segundos
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Adiciona estilos de animação se não existirem
if (!document.querySelector('#auth-notification-styles')) {
  const style = document.createElement('style');
  style.id = 'auth-notification-styles';
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export async function getCurrentMerchant() {
  if (!currentUser || !currentUser.uid) return null;

  try {
    const merchantProfile = await checkMerchantProfile(currentUser.uid);
    return merchantProfile;
  } catch (error) {
    console.error('❌ Erro ao buscar merchant:', error);
    return null;
  }
}

export async function checkMerchantProfile(uid) {
  try {
    // Importação dinâmica para evitar dependência circular
    const { checkMerchantProfile } = await import('./merchant.js');
    return await checkMerchantProfile(uid);
  } catch (error) {
    console.error('❌ Erro ao verificar perfil:', error);
    return null;
  }
}

// Salvar perfil do merchant
export async function saveMerchantProfile(uid, userEmail, profileData) {
  try {
    const { saveMerchantProfile } = await import('./merchant.js');
    return await saveMerchantProfile(uid, userEmail, profileData);
  } catch (error) {
    console.error('❌ Erro ao salvar perfil:', error);
    throw error;
  }
}

// Validação de CNPJ
export function validateCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]+/g, '');

  if (cnpj.length !== 14) return false;

  if (/^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(1))) return false;

  return true;
}

// Buscar CEP
export async function fetchCEP(cep) {
  try {
    const { fetchCEP } = await import('./merchant.js');
    return await fetchCEP(cep);
  } catch (error) {
    console.error('❌ Erro ao buscar CEP:', error);
    throw error;
  }
}

// Inicializa automaticamente quando o módulo é carregado
initializeAuth();