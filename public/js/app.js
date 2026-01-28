import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadNearbyDeals } from './deals.js';
import { loadMyCoupons } from './coupons.js';
import { auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const DEFAULT_CATEGORIES = ['bakery', 'fruit-veg', 'pizzeria', 'restaurant', 'supermarket'];

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
  let userInterests = localStorage.getItem('userInterests');

  let savedInterests = DEFAULT_CATEGORIES
  if (!userInterests) {
    localStorage.setItem('userInterests', JSON.stringify(savedInterests));
    console.log("✨ Perfil inicial padrão aplicado.");
  } else {
    savedInterests = JSON.parse(userInterests);
  }

  container.innerHTML = CATEGORIES.map(cat => `
    <div class="category-pill ${savedInterests.includes(cat.id) ? 'active' : ''}" 
         data-id="${cat.id}"
         onclick="toggleInterest('${cat.id}')">
      ${cat.emoji} ${cat.label}
    </div>
  `).join('');
}

// 3. Função para ativar/desativar um interesse
window.toggleInterest = async function (categoryId) {
  let savedInterests = JSON.parse(localStorage.getItem('userInterests') || '[]');

  // 1. Determine se está adicionando ANTES de alterar o array
  const isAdding = !savedInterests.includes(categoryId);

  if (!isAdding) {
    savedInterests = savedInterests.filter(id => id !== categoryId);
  } else {
    savedInterests.push(categoryId);
  }

  localStorage.setItem('userInterests', JSON.stringify(savedInterests));
  renderCategoryInterests();

  const user = auth.currentUser;
  if (user) {
    try {
      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        interests: savedInterests,
        lastUpdate: serverTimestamp()
      });

      console.log("Interesses atualizados no Firestore!");

      await syncTopicSubscription(categoryId, isAdding);

    } catch (error) {
      console.error("Erro ao salvar no Firestore:", error);
    }
  }
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

async function syncInterests() {
  const user = auth.currentUser;
  if (user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.interests) {
        localStorage.setItem('userInterests', JSON.stringify(userData.interests));
      }
      // ✅ Sincroniza o status de notificação do banco para o local
      if (userData.notificationsEnabled !== undefined) {
        localStorage.setItem('notificationsEnabled', userData.notificationsEnabled.toString());
      }
    }
    renderCategoryInterests();
  }
}

async function handleAuthStateChange(user) {
  loading.classList.add('hidden');

  if (user) {
    currentUser = user;
    showApp(user);
    await requestLocationAndLoadDeals();
    await loadMyCoupons();
    updateNotificationSubscriptions();
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
    syncInterests();

    // --- VÍNCULO DO SWITCH DE ALERTAS ---
    const alertSwitch = document.getElementById('pref-notifications');
    if (alertSwitch && auth.currentUser) {
      // Tenta ler do localStorage primeiro para ser rápido, depois validamos com o banco
      const userRef = doc(db, "users", auth.currentUser.uid);
      getDoc(userRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Seta o switch baseado no campo do banco (default false se não existir)
          alertSwitch.checked = data.notificationsEnabled || false;
        }
      });

      alertSwitch.onchange = async (e) => {
        const isChecked = e.target.checked;
        if (isChecked) {
          await enableNotifications();
        } else {
          // Desativa direto no banco
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, { notificationsEnabled: false });
        }
      };
    }
  }
}

async function updateNotificationSubscriptions(interests) {
  const messaging = getMessaging();
  try {
    const currentToken = await getToken(messaging, { vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ' });

    if (currentToken) {
      // Aqui você enviaria o token e a lista de interesses para uma Cloud Function
      // que faz o subscribe/unsubscribe nos tópicos.
      console.log('🎫 Token FCM atualizado para tópicos:', interests);

      // Salva o token no documento do usuário no Firestore para envio segmentado
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { fcmToken: currentToken });
    }
  } catch (err) {
    console.error('❌ Erro ao gerenciar notificações:', err);
  }
}

async function syncTopicSubscription(categoryId, isSubscribed) {
  try {
    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ' });

    if (!token) return;

    const functions = getFunctions();
    const manageSub = httpsCallable(functions, 'manageSubscription');

    await manageSub({
      token: token,
      topic: categoryId,
      action: isSubscribed ? 'subscribe' : 'unsubscribe'
    });

    console.log(`📡 Notificações para ${categoryId}: ${isSubscribed ? 'Ativadas' : 'Desativadas'}`);
  } catch (error) {
    console.error("Erro ao sincronizar tópico:", error);
  }
}

// Função para ativar notificações
async function enableNotifications() {
  try {
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ'
    });

    if (token) {
      console.log("Token gerado:", token);
      if (auth.currentUser) {
        const userRef = doc(db, "users", auth.currentUser.uid);
        // ✅ Salvando na base de dados e no cache local
        await updateDoc(userRef, {
          fcmToken: token,
          notificationsEnabled: true,
          lastTokenUpdate: serverTimestamp()
        }, { merge: true });
        localStorage.setItem('notificationsEnabled', 'true');
        console.log("✅ Preferência de notificação salva no Firestore");
      }
    }
  } catch (error) {
    console.error("Erro ao ativar notificações:", error);
  }
}

/**
 * Fechar modal
 */
function closeModal() {
  document.getElementById('deal-modal')?.classList.add('hidden');
}

window.closeModal = closeModal;
