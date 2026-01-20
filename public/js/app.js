import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadNearbyDeals } from './deals.js';
import { loadMyCoupons } from './coupons.js';
import { db } from './firebase-config.js';
import { doc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// Estado
let currentUser = null;
let userLocation = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  observeAuthState(handleAuthStateChange);
});

function setupEventListeners() {
  googleLoginBtn?.addEventListener('click', loginWithGoogle);
  logoutBtn?.addEventListener('click', logout);

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });

  // Fechar modal
  document.querySelector('.close')?.addEventListener('click', closeModal);
}

async function handleAuthStateChange(user) {
  loading.classList.add('hidden');

  if (user) {
    currentUser = user;
    showApp(user);
    await requestLocationAndLoadDeals();
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

  if (userPhoto) {
    userPhoto.src = user.photoURL || '/assets/icons/icon-192.png';
    userPhoto.alt = user.displayName || 'Usuário';
  }
}

/**
 * Solicitar localização e carregar ofertas
 */
async function requestLocationAndLoadDeals() {
  console.log('📍 Solicitando localização do usuário...');

  try {
    const position = await getCurrentPosition();

    userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    console.log('✅ Localização obtida:', userLocation);

    // Salvar localização do usuário
    await updateUserLocation(userLocation);

    // Buscar ofertas próximas (raio de 10km)
    await loadDeals(10);

  } catch (error) {
    console.error('❌ Erro ao obter localização:', error);
    handleLocationError(error);
  }
}

/**
 * Carregar ofertas próximas
 */
async function loadDeals(radius = 10) {
  try {
    if (!userLocation) {
      console.error('Localização do usuário não disponível');
      return;
    }

    console.log(`🔍 Buscando ofertas em um raio de ${radius}km`);

    await loadNearbyDeals();

  } catch (error) {
    console.error('❌ Erro ao carregar ofertas:', error);
  }
}

/**
 * Expandir busca para raio maior
 */
window.expandSearch = async function () {
  await loadDeals(20); // 20km
};

/**
 * Obter posição atual do navegador
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo navegador'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // Cache de 5 minutos
      }
    );
  });
}

/**
 * Atualizar localização do usuário no Firestore
 */
async function updateUserLocation(location) {
  try {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);

    await setDoc(userRef, {
      location,
      lastLocationUpdate: Timestamp.now()
    }, { merge: true });

    console.log('✅ Localização salva no Firestore');
  } catch (error) {
    console.error('❌ Erro ao salvar localização:', error);
  }
}

/**
 * Tratar erros de localização
 */
function handleLocationError(error) {
  console.error('Erro de localização:', error);

  let message = 'Não foi possível obter sua localização.';
  let fallbackLocation = null;

  switch (error.code) {
    case error.PERMISSION_DENIED:
      message = 'Você negou acesso à localização. Para ver ofertas próximas, permita o acesso.';
      break;
    case error.POSITION_UNAVAILABLE:
      message = 'Localização indisponível no momento.';
      break;
    case error.TIMEOUT:
      message = 'Tempo esgotado ao buscar localização.';
      break;
  }

  alert(message + '\n\nUsando localização padrão (São Paulo - Centro).');

  // Usar localização padrão (Avenida Paulista, SP)
  userLocation = {
    latitude: -23.561684,
    longitude: -46.655981,
    isDefault: true
  };

  loadDeals(50); // Raio maior para localização padrão
}

/**
 * Trocar entre abas
 */
function switchTab(tab) {
  navItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

  if (tab === 'deals') {
    dealsContainer?.classList.remove('hidden');
    couponsSection?.classList.add('hidden');
  } else if (tab === 'coupons') {
    dealsContainer?.classList.add('hidden');
    couponsSection?.classList.remove('hidden');
  }
}

/**
 * Fechar modal
 */
function closeModal() {
  document.getElementById('deal-modal')?.classList.add('hidden');
}

window.closeModal = closeModal;
