import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadNearbyDeals } from './deals.js';
import { loadMyCoupons } from './coupons.js';
import { auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

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
  { id: 'clothing', label: 'Moda', emoji: '👕' },
  { id: 'other', label: 'Outros', emoji: '❓' }
];

// 2. Função para renderizar as pílulas no Perfil
function renderCategoryInterests() {
  const container = document.getElementById('category-interests');
  if (!container) return;

  // Recupera as preferências já salvas (ou um array vazio)
  let userInterests = localStorage.getItem('userInterests');

  //let savedInterests = DEFAULT_CATEGORIES
  const ALL_CATEGORIES_ = CATEGORIES.map(cat => cat.id);

  let savedInterests = ALL_CATEGORIES_;

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
  const isAdding = !savedInterests.includes(categoryId);

  // Atualizar localmente
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

      // 1. Atualizar interesses no Firestore
      await updateDoc(userRef, {
        interests: savedInterests,
        lastUpdate: serverTimestamp()
      });

      console.log("✅ Interesses atualizados no Firestore");

      // 2. Obter token FCM atual
      const messaging = getMessaging();
      const token = await getToken(messaging, {
        vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ'
      });

      if (!token) {
        console.warn("⚠️ Sem token FCM, não pode gerenciar tópicos");
        return;
      }

      // 3. Gerenciar inscrição no tópico
      await syncTopicSubscriptions(token);

    } catch (error) {
      console.error("❌ Erro:", error);
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
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();

        // Sincronizar interesses
        if (userData.interests) {
          localStorage.setItem('userInterests', JSON.stringify(userData.interests));
        }

        // ✅ Sincronizar notificações - Firestore TEM PRIORIDADE
        let notificationsEnabled = false;

        // Primeiro tenta do Firestore
        if (userData.notificationsEnabled !== undefined) {
          notificationsEnabled = userData.notificationsEnabled;
        }
        // Se não tem no Firestore, tenta localStorage
        else if (localStorage.getItem('notificationsEnabled')) {
          notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';
        }

        // Salva em ambos para consistência
        localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());

        // Atualizar o switch visualmente
        /*
        const alertSwitch = document.getElementById('pref-notifications');
        if (alertSwitch) {
          alertSwitch.checked = notificationsEnabled;
          console.log(`🔄 Switch sincronizado: ${notificationsEnabled ? 'ON' : 'OFF'}`);
        }
        */

        // Atualizar status visual
        updateNotificationStatus(notificationsEnabled);
      } else {
        // Se usuário não existe no Firestore, usa localStorage
        /*
        const localEnabled = localStorage.getItem('notificationsEnabled') === 'true';
        const alertSwitch = document.getElementById('pref-notifications');
        if (alertSwitch) {
          alertSwitch.checked = localEnabled;
        }
        updateNotificationStatus(localEnabled);
        */
      }

    } catch (error) {
      console.error('Erro ao sincronizar interesses:', error);
      // Fallback para localStorage
      /*
      const localEnabled = localStorage.getItem('notificationsEnabled') === 'true';
      const alertSwitch = document.getElementById('pref-notifications');
      if (alertSwitch) {
        alertSwitch.checked = localEnabled;
      }
      updateNotificationStatus(localEnabled);
      */
    }

    renderCategoryInterests();
  }
}

// Função para atualizar status visual
function updateNotificationStatus(isEnabled) {
  /*
  const statusElement = document.getElementById('notification-status');
  if (statusElement) {
    statusElement.textContent = isEnabled
      ? "✅ Notificações ativas - Você receberá alertas das categorias selecionadas"
      : "🔕 Notificações desativadas";
    statusElement.style.color = isEnabled ? '#10b981' : '#ef4444';
    statusElement.style.fontSize = '0.85rem';
    statusElement.style.marginTop = '8px';
  }

  // Também pode adicionar um toast/confirmação
  showNotificationToast(isEnabled);
  */
}

function showNotificationToast(isEnabled) {
  // Cria um toast temporário
  const toast = document.createElement('div');
  toast.textContent = `Notificações ${isEnabled ? 'ativadas' : 'desativadas'}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isEnabled ? '#10b981' : '#ef4444'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);

  // Adicionar CSS para animações se não existir
  if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

async function handleAuthStateChange(user) {
  loading.classList.add('hidden');

  if (user) {
    currentUser = user;
    showApp(user);
    await requestLocationAndLoadDeals();
    await loadMyCoupons();

    // ✅ INICIALIZAÇÃO AUTOMÁTICA DAS NOTIFICAÇÕES
    await initializeUserNotifications(user);

  } else {
    showLogin();
  }
}

/**
 * Inicializa notificações ao fazer login
 */
async function initializeUserNotifications(user) {
  try {
    console.log('🔔 Inicializando notificações para:', user.uid);

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const notificationsEnabled = userData.notificationsEnabled || false;

      // Sincronizar localStorage
      localStorage.setItem('notificationsEnabled', notificationsEnabled.toString());

      // Se notificações estão ativas mas não tem token válido
      if (notificationsEnabled) {
        console.log('🔄 Notificações ativas, verificando token...');

        let token = userData.fcmToken;

        if (!token) {
          console.log('⚠️ Sem token. Gerando...');
          token = await enableNotifications();

          await updateDoc(userRef, {
            fcmToken: token,
            lastTokenUpdate: serverTimestamp()
          });
        } else {
          console.log('✅ Token FCM já existe:', token.substring(0, 20) + '...');
        }

        // 🔥 AQUI estava faltando
        console.log('🔁 Sincronizando tópicos com FCM...');
        await syncTopicSubscriptions(token);
      }
    }

  } catch (error) {
    console.error('❌ Erro ao inicializar notificações:', error);
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
/**
 * Trocar entre abas
 */
function switchTab(tab) {
  navItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

  const allViews = document.querySelectorAll('.view, .deals-container, #coupons-section');
  allViews.forEach(view => view.classList.add('hidden'));

  const filterWrapper = document.getElementById('filter-wrapper');

  if (filterWrapper) {
    filterWrapper.style.display = 'none';
  }

  if (tab === 'deals') {
    dealsContainer?.classList.remove('hidden');
    loadNearbyDeals();

    if (filterWrapper) {
      filterWrapper.style.display = 'flex';
    }
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

    /*
    const alertSwitch = document.getElementById('pref-notifications');
    if (alertSwitch && auth.currentUser) {
      // Remover listeners anteriores para evitar duplicação
      alertSwitch.onchange = null;

      // Buscar estado atual do banco
      const userRef = doc(db, "users", auth.currentUser.uid);
      getDoc(userRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const isEnabled = data.notificationsEnabled || false;

          // Sincronizar switch com banco de dados
          alertSwitch.checked = isEnabled;

          // Sincronizar localStorage também
          localStorage.setItem('notificationsEnabled', isEnabled.toString());
        }
      }).catch(err => {
        console.error("Erro ao buscar preferências:", err);
      });

      // No switchTab() função, substitua o alertSwitch.onchange:
      alertSwitch.onchange = async (e) => {
        const isChecked = e.target.checked;

        // Feedback visual imediato
        alertSwitch.checked = isChecked;

        // Gerenciar notificações
        const success = await manageNotifications(isChecked);

        if (!success) {
          // Reverter visualmente se falhou
          alertSwitch.checked = !isChecked;
          alert('Não foi possível alterar as notificações. Tente novamente.');
        }

        // Atualizar status visual
        updateNotificationStatus(isChecked);
      };
    }
    */
  }
}

/**
 * Gerencia notificações de forma robusta
 * @param {boolean} shouldEnable - true para ativar, false para desativar
 */
async function manageNotifications(shouldEnable) {
  const user = auth.currentUser;
  if (!user) {
    console.warn('❌ Usuário não autenticado');
    return false;
  }

  const userRef = doc(db, "users", user.uid);

  try {
    if (shouldEnable) {
      console.log('🔄 Ativando notificações...');

      // 1. Tentar ativar notificações FCM
      const token = await enableNotifications();

      if (token) {
        // 2. Se sucesso, salvar estado
        await updateDoc(userRef, {
          notificationsEnabled: true,
          fcmToken: token,
          lastTokenUpdate: serverTimestamp()
        }, { merge: true });

        localStorage.setItem('notificationsEnabled', 'true');
        console.log('✅ Notificações ativadas com sucesso');

        // 3. Inscrever tópicos
        await syncTopicSubscriptions(token);

        return true;
      } else {
        // 3. Se falhou, manter desativado
        console.warn('⚠️ Falha ao ativar notificações FCM');
        return false;
      }

    } else {
      // DESATIVAR
      console.log('🔕 Desativando notificações...');

      // 1. Obter token atual para desinscrever de tópicos
      const userSnap = await getDoc(userRef);
      const currentToken = userSnap.exists() ? userSnap.data().fcmToken : null;

      if (currentToken) {
        // Desinscrever de todos os tópicos
        await updateDoc(userRef, {
          subscribedTopics: []
        });

      }

      // 2. Atualizar estado
      await updateDoc(userRef, {
        notificationsEnabled: false,
        fcmToken: null
      }, { merge: true });

      localStorage.setItem('notificationsEnabled', 'false');
      console.log('✅ Notificações desativadas');

      return true;
    }

  } catch (error) {
    console.error('❌ Erro ao gerenciar notificações:', error);

    // Em caso de erro, garantir estado consistente
    if (shouldEnable) {
      // Se estava tentando ativar e falhou, manter desativado
      await updateDoc(userRef, {
        notificationsEnabled: false
      }, { merge: true });

      localStorage.setItem('notificationsEnabled', 'false');
    }

    return false;
  }
}

async function syncTopicSubscriptions(token) {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const data = snap.data();

  const desired = data.interests || [];
  const subscribed = data.subscribedTopics || [];

  const toSubscribe = desired.filter(t => !subscribed.includes(t));
  const toUnsubscribe = subscribed.filter(t => !desired.includes(t));

  console.log("📡 Delta tópicos:");
  console.log(" ➕ Inscrever:", toSubscribe);
  console.log(" ➖ Remover:", toUnsubscribe);

  for (const topic of toSubscribe) {
    const ok = await subscribeToTopic(topic, token);
    if (ok) subscribed.push(topic);
  }

  for (const topic of toUnsubscribe) {
    const ok = await unsubscribeFromTopic(topic, token);
    if (ok) {
      const idx = subscribed.indexOf(topic);
      if (idx !== -1) subscribed.splice(idx, 1);
    }
  }

  await updateDoc(userRef, {
    subscribedTopics: subscribed,
    lastSubscriptionSync: serverTimestamp()
  });
}

async function enableNotifications() {
  console.log('🔐 Iniciando ativação de notificações...');

  // 1. Verificar permissão
  if (Notification.permission === 'denied') {
    throw new Error('Permissão negada anteriormente. Vá nas configurações do navegador.');
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permissão negada pelo usuário');
    }
  }

  console.log('✅ Permissão concedida');

  // 2. Garantir que temos um Service Worker ativo
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não suportado');
  }

  let registration;

  try {
    // Tenta registrar o SW do Firebase Messaging
    console.log('🔄 Registrando Firebase Messaging SW...');
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      updateViaCache: 'none'
    });

    console.log('✅ Firebase Messaging SW registrado. Escopo:', registration.scope);

    // Aguardar ativação
    if (registration.installing) {
      console.log('⏳ Aguardando ativação do SW...');
      await new Promise((resolve) => {
        registration.installing.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') {
            console.log('✅ SW ativado!');
            resolve();
          }
        });
      });
    } else if (registration.active) {
      console.log('✅ SW já está ativo');
    }

  } catch (swError) {
    console.warn('⚠️ Erro ao registrar Firebase SW:', swError.message);

    // Fallback: usar SW principal
    console.log('🔄 Usando SW principal como fallback...');
    try {
      registration = await navigator.serviceWorker.ready;
      console.log('✅ SW principal pronto');
    } catch (readyError) {
      console.error('❌ Nenhum SW disponível:', readyError.message);
      throw new Error('Service Worker não disponível');
    }
  }

  // 3. Obter token FCM com o SW ativo
  const messaging = getMessaging();
  let token;

  try {
    const options = {
      vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ'
    };

    // Se temos um registration, usar
    if (registration) {
      options.serviceWorkerRegistration = registration;
    }

    console.log('🔑 Solicitando token FCM...');
    //token = await getToken(messaging, options);
    const token = await getToken(messaging, {
      vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ',
      serviceWorkerRegistration: registration
    });

    if (!token) {
      throw new Error('Token não foi gerado');
    }

    console.log('✅ Token FCM gerado com sucesso');
    console.log('📱 Token:', token.substring(0, 30) + '...');

  } catch (error) {
    console.error('❌ Erro ao obter token FCM:', error.message);

    // Se é erro de SW inativo, tentar método mais simples
    if (error.message.includes('no active Service Worker') ||
      error.code === 'messaging/invalid-sw-registration') {

      console.log('🔄 Tentando método simplificado...');

      try {
        // Tentar sem especificar SW
        token = await getToken(messaging, {
          vapidKey: 'BPb43TW_UXA4Isl1yDo6GMjVoiCTs6jZUmacxpx-s42WMWgIP_lHHa27F_MlAAOR8Zh86cawjciiXkRHf1pzBzQ'
        });

        if (token) {
          console.log('✅ Token obtido com método simplificado');
        } else {
          throw new Error('Token não gerado');
        }

      } catch (simpleError) {
        console.error('❌ Método simplificado também falhou:', simpleError.message);
        throw new Error('Não foi possível configurar notificações push');
      }
    } else {
      throw new Error('Falha na configuração de notificações');
    }
  }

  return token;
}

// Nova função simplificada para inscrever em tópicos
async function subscribeToTopic(topic, token) {
  try {
    const functions = getFunctions();
    const manageSub = httpsCallable(functions, 'manageSubscription');

    await manageSub({
      token: token,
      topic: topic,
      action: 'subscribe'
    });

    console.log(`✅ Inscrito no tópico: ${topic}`);
    return true;
  } catch (error) {
    console.error(`❌ Falha ao inscrever em ${topic}:`, error.message);
    return false;
  }
}

// Função para desinscrever
async function unsubscribeFromTopic(topic, token) {
  try {
    const functions = getFunctions();
    const manageSub = httpsCallable(functions, 'manageSubscription');

    await manageSub({
      token: token,
      topic: topic,
      action: 'unsubscribe'
    });

    console.log(`✅ Desinscrito do tópico: ${topic}`);
    return true;
  } catch (error) {
    console.error(`❌ Falha ao desinscrever de ${topic}:`, error.message);
    return false;
  }
}

// Função para diagnosticar Service Workers
window.diagnoseServiceWorkers = async function () {
  console.log('=== 🔍 DIAGNÓSTICO DE SERVICE WORKERS ===');

  if (!('serviceWorker' in navigator)) {
    console.log('❌ Navegador não suporta Service Worker');
    return;
  }

  try {
    // 1. Verificar SWs registrados
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log(`📋 ${registrations.length} SW(s) registrado(s):`);

    registrations.forEach((reg, i) => {
      console.log(`  ${i + 1}. ${reg.scope}`);
      console.log(`     Estado: ${reg.active ? 'Ativo' : 'Inativo'}`);
      console.log(`     Instalando: ${reg.installing ? 'Sim' : 'Não'}`);
      console.log(`     Esperando: ${reg.waiting ? 'Sim' : 'Não'}`);
    });

    // 2. Tentar registrar o Firebase SW
    console.log('\n🔄 Tentando registrar Firebase Messaging SW...');
    try {
      const firebaseSW = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        {
          updateViaCache: 'none'
        }
      );

      console.log('✅ Firebase SW registrado com sucesso');
      console.log(`   Escopo: ${firebaseSW.scope}`);
      console.log(`   Estado: ${firebaseSW.active ? 'Ativo' : 'Inativo'}`);

      // Aguardar ativação se necessário
      if (firebaseSW.installing) {
        console.log('⏳ Aguardando ativação...');
        return new Promise(resolve => {
          firebaseSW.installing.addEventListener('statechange', (e) => {
            console.log(`   Estado mudou para: ${e.target.state}`);
            if (e.target.state === 'activated') {
              console.log('🎉 Firebase SW ativado!');
              resolve();
            }
          });
        });
      }

    } catch (regError) {
      console.error('❌ Erro ao registrar Firebase SW:', regError.message);
    }

    // 3. Verificar SW principal (seu app)
    console.log('\n🔧 Verificando SW principal do app...');
    try {
      const appRegistration = await navigator.serviceWorker.ready;
      console.log('✅ App SW pronto');
      console.log(`   Escopo: ${appRegistration.scope}`);
    } catch (appError) {
      console.log('ℹ️ App SW não está pronto. message:', appError.message);
    }

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
  }

  console.log('=== FIM DO DIAGNÓSTICO ===');
};

/**
 * Fechar modal
 */
function closeModal() {
  document.getElementById('deal-modal')?.classList.add('hidden');
}

window.closeModal = closeModal;
