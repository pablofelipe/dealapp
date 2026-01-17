import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadMerchantDeals, setupDealForm } from './deals.js';
import { setupCouponValidation, loadStats } from './coupons.js';
import { auth } from './firebase-config.js';

// Elementos DOM
const loading = document.getElementById('loading');
const loginScreen = document.getElementById('login-screen');
const panel = document.getElementById('panel');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPhoto = document.getElementById('user-photo');
const userName = document.getElementById('user-name');

// Navegação
const navButtons = document.querySelectorAll('.nav-btn');

let currentUser = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  observeAuthState(handleAuthStateChange);
  setupDealForm();
  setupCouponValidation();
  
  // Calcular desconto automaticamente
  const originalPriceInput = document.getElementById('deal-original-price');
  const dealPriceInput = document.getElementById('deal-price');
  const discountInput = document.getElementById('deal-discount');
  
  function calculateDiscount() {
    const original = parseFloat(originalPriceInput.value) || 0;
    const deal = parseFloat(dealPriceInput.value) || 0;
    
    if (original > 0 && deal > 0 && deal < original) {
      const discount = Math.round(((original - deal) / original) * 100);
      discountInput.value = discount;
    } else {
      discountInput.value = '';
    }
  }
  
  originalPriceInput?.addEventListener('input', calculateDiscount);
  dealPriceInput?.addEventListener('input', calculateDiscount);
});

function setupEventListeners() {
  googleLoginBtn.addEventListener('click', loginWithGoogle);
  logoutBtn.addEventListener('click', logout);
  
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
    });
  });
}

async function handleAuthStateChange(user) {
  loading.classList.add('hidden');
  
  if (user) {
    currentUser = user;
    showPanel(user);
    await loadInitialData();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  panel.classList.add('hidden');
}

function showPanel(user) {
  loginScreen.classList.add('hidden');
  panel.classList.remove('hidden');
  
  userPhoto.src = user.photoURL;
  userName.textContent = user.displayName;
}

async function loadInitialData() {
  await loadMerchantDeals(currentUser.uid);
  await loadStats(currentUser.uid);
}

window.showView = function(viewName) {
  // Atualizar navegação
  navButtons.forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
  
  // Mostrar view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
};

export { currentUser };
