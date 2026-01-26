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

// 1. Defina a lista de categorias (sincronizada com o lojista)
const CATEGORIES = [
  { id: 'butcher', label: 'Açougue', emoji: '🥩' },
  { id: 'bakery', label: 'Padaria', emoji: '🥖' },
  { id: 'home-gifts', label: 'Casa', emoji: '🏠' },
  { id: 'electronics', label: 'Tecnologia', emoji: '💻' },
  { id: 'pharmacy', label: 'Farmácia', emoji: '💊' },
  { id: 'fruit-veg', label: 'Hortifruti', emoji: '🍎' },
  { id: 'petshop', label: 'Pet Shop', emoji: '🐾' },
  { id: 'pizzeria', label: 'Pizzaria', emoji: '🍕' },
  { id: 'restaurant', label: 'Restaurante', emoji: '🍽️' },
  { id: 'services', label: 'Serviços', emoji: '🛠️' },
  { id: 'supermarket', label: 'Mercado', emoji: '🛒' },
  { id: 'clothing', label: 'Moda', emoji: '👕' }
];

// 2. Função para renderizar as pílulas no Perfil
function renderCategoryInterests() {
  const container = document.getElementById('category-interests');
  if (!container) return;

  // Recupera as preferências já salvas (ou um array vazio)
  const savedInterests = JSON.parse(localStorage.getItem('userInterests') || '[]');

  container.innerHTML = CATEGORIES.map(cat => `
    <div class="category-pill ${savedInterests.includes(cat.id) ? 'active' : ''}" 
         data-id="${cat.id}"
         onclick="toggleInterest('${cat.id}')">
      ${cat.emoji} ${cat.label}
    </div>
  `).join('');
}

// 3. Função para ativar/desativar um interesse
window.toggleInterest = function (categoryId) {
  let savedInterests = JSON.parse(localStorage.getItem('userInterests') || '[]');

  if (savedInterests.includes(categoryId)) {
    // Remove se já existia
    savedInterests = savedInterests.filter(id => id !== categoryId);
  } else {
    // Adiciona se não existia
    savedInterests.push(categoryId);
  }

  // Guarda no localStorage
  localStorage.setItem('userInterests', JSON.stringify(savedInterests));

  // Atualiza o visual
  renderCategoryInterests();

  // DICA: Aqui no futuro poderemos avisar o Firestore que o usuário mudou os interesses
};

function setupRadiusSlider() {
  const slider = document.getElementById('pref-radius');
  const display = document.getElementById('radius-value');

  // Opções idênticas às do lojista
  const radiusOptions = [1, 2, 3, 5, 10, 15, 20];

  if (!slider || !display) return;

  // Carregar valor salvo ou definir padrão 10km (índice 4)
  const savedRadius = parseInt(localStorage.getItem('userRadius')) || 10;
  const initialIndex = radiusOptions.indexOf(savedRadius);
  slider.value = initialIndex !== -1 ? initialIndex : 4;

  updateDisplay(radiusOptions[slider.value]);

  slider.addEventListener('input', (e) => {
    const km = radiusOptions[e.target.value];
    updateDisplay(km);
  });

  slider.addEventListener('change', (e) => {
    const km = radiusOptions[e.target.value];
    localStorage.setItem('userRadius', km);
    console.log(`Raio de busca definido para: ${km}km`);

    // recarregar ofertas ao mudar
    loadNearbyDeals();
  });

  function updateDisplay(km) {
    let label = `${km}km`;
    if (km === 5) label += " (recomendado)";
    if (km === 20) label += " (máximo)";
    display.textContent = label;
  }
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
    const preferredRadius = parseInt(localStorage.getItem('userRadius')) || 10;

    await loadDeals(preferredRadius);

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

  const allViews = document.querySelectorAll('.view, .deals-container, #coupons-section');
  allViews.forEach(view => view.classList.add('hidden'));

  if (tab === 'deals') {
    dealsContainer?.classList.remove('hidden');
    loadNearbyDeals();
  }
  else if (tab === 'coupons') {
    const couponsSection = document.getElementById('coupons-section');
    couponsSection?.classList.remove('hidden');
    if (currentUser) loadMyCoupons(currentUser.uid);
  }
  else if (tab === 'profile') {
    const profileSection = document.getElementById('profile');
    profileSection?.classList.remove('hidden');

    renderCategoryInterests();
    setupRadiusSlider();
  }
}

/**
 * Fechar modal
 */
function closeModal() {
  document.getElementById('deal-modal')?.classList.add('hidden');
}

window.closeModal = closeModal;
