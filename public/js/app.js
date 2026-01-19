import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { getAvailableDeals, renderDeals } from './deals.js';
import { loadMyCoupons } from './coupons.js';

// Elementos DOM
const loading = document.getElementById('loading');
const loginScreen = document.getElementById('login-screen');
const app = document.getElementById('app');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPhoto = document.getElementById('user-photo');

// Navegação entre tabs
const navItems = document.querySelectorAll('.nav-item');
const dealsContainer = document.querySelector('.deals-container');
const couponsSection = document.getElementById('coupons-section');

// Estado da aplicação
let currentUser = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  observeAuthState(handleAuthStateChange);
});

function setupEventListeners() {
  // Login
  googleLoginBtn.addEventListener('click', loginWithGoogle);
  
  // Logout
  logoutBtn.addEventListener('click', logout);
  
  // Navegação
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Fechar modal
  const modal = document.getElementById('deal-modal');
  const closeBtn = document.querySelector('.close');
  const modalBackdrop = document.querySelector('.modal-backdrop');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeModal);
  }
  
  // Fechar modal com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

async function handleAuthStateChange(user) {
  loading.classList.add('hidden');
  
  if (user) {
    currentUser = user;
    showApp(user);
    await loadDeals();
    await loadMyCoupons();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  app.classList.add('hidden');
}

function showApp(user) {
  loginScreen.classList.add('hidden');
  app.classList.remove('hidden');
  
  // Atualizar UI com dados do usuário
  if (user.photoURL) {
    userPhoto.src = user.photoURL;
  }
  userPhoto.alt = user.displayName || 'Usuário';
}

async function loadDeals() {
  try {
    // TODO: Pegar condominiumId do perfil do usuário
    const condominiumId = 'cond_001'; // Temporário
    const deals = await getAvailableDeals(condominiumId);
    renderDeals(deals);
  } catch (error) {
    console.error('Erro ao carregar ofertas:', error);
  }
}

function switchTab(tab) {
  // Atualizar navegação
  navItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  
  // Mostrar conteúdo correto
  if (tab === 'deals') {
    dealsContainer.classList.remove('hidden');
    couponsSection.classList.add('hidden');
  } else if (tab === 'coupons') {
    dealsContainer.classList.add('hidden');
    couponsSection.classList.remove('hidden');
  }
}

function closeModal() {
  document.getElementById('deal-modal').classList.add('hidden');
}

// Exportar para uso global
window.closeModal = closeModal;
