import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadMerchantDeals, setupDealForm } from './deals.js';
import { setupCouponValidation, loadStats } from './coupons.js';
import { checkMerchantProfile, saveMerchantProfile } from './merchant.js';
import { initializeEditMerchant, loadMerchantForEdit } from './edit-merchant.js';

// Elementos DOM
const loading = document.getElementById('loading');
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const panel = document.getElementById('panel');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPhoto = document.getElementById('user-photo');
const userName = document.getElementById('user-name');

const navButtons = document.querySelectorAll('.nav-btn');

let currentUser = null;
let currentMerchant = null;

// ========== INICIALIZAÇÃO ==========
let isAppInitialized = false;

function initializeApp() {
  if (isAppInitialized) {
    console.warn('⚠️ App já inicializado');
    return;
  }

  isAppInitialized = true;
  console.log('🚀 Inicializando app...');

  setupEventListeners();
  setupRegisterForm();
  observeAuthState(handleAuthStateChange);
  setupDealForm();
  setupCouponValidation();
  setupDiscountCalculator();
  setupDealFormWithMerchantData();
  initializeEditMerchant();
  initializeBadgeOnLoad();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('ref');
  if (code) {
    const vendorInput = document.getElementById('vendorCode');
    if (vendorInput) {
      vendorInput.value = code.toUpperCase();
    }
  }

  console.log('✅ App inicializado com sucesso');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM carregado');
  initializeApp();
});

window.addEventListener('beforeunload', () => {
  eventListenersManager.clearAll();
  cleanupCurrentView();
});

// ========== GESTÃO DE EVENT LISTENERS ==========
const eventListenersManager = {
  listeners: new Map(),

  add(element, event, handler, options) {
    if (!this.listeners.has(element)) {
      this.listeners.set(element, []);
    }
    element.addEventListener(event, handler, options);
    this.listeners.get(element).push({ event, handler });
  },

  removeAll(element) {
    if (this.listeners.has(element)) {
      this.listeners.get(element).forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.listeners.delete(element);
    }
  },

  removeAllFromSelector(selector) {
    document.querySelectorAll(selector).forEach(element => {
      this.removeAll(element);
    });
  },

  clearAll() {
    this.listeners.forEach((listeners, element) => {
      listeners.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    this.listeners.clear();
  }
};

// Função helper para debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========== SETUP DE EVENTOS ==========

function setupEventListeners() {
  // Login com Google
  eventListenersManager.add(
    googleLoginBtn,
    'click',
    async () => {
      try {
        showLoading(true);
        const user = await loginWithGoogle();
        if (user) {
          await handleNewLogin(user);
        }
      } catch (error) {
        console.error('❌ Erro no login:', error);
        showNotification('error', 'Erro ao fazer login. Tente novamente.');
      } finally {
        showLoading(false);
      }
    }
  );

  // Logout
  eventListenersManager.add(
    logoutBtn,
    'click',
    async () => {
      try {
        await logout();
        showLoginScreen();
      } catch (error) {
        console.error('❌ Erro no logout:', error);
      }
    }
  );

  // Navegação do painel
  navButtons.forEach(btn => {
    eventListenersManager.add(
      btn,
      'click',
      () => {
        const view = btn.dataset.view;
        showView(view);
      }
    );
  });

  // Botão voltar (usando delegação de eventos)
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-back')) {
      showView('deals');
    }
  });
}

// NOVO: Configurar formulário de cadastro
function setupRegisterForm() {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;

  // Máscaras
  setupFormMasks();

  // Busca de CEP automática
  setupCEPSearch();

  // Submit do formulário
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleRegisterSubmit();
  });
}

function setupFormMasks() {
  // CNPJ
  const cnpjInput = document.getElementById('merchant-cnpj');
  if (cnpjInput) {
    cnpjInput.addEventListener('input', function () {
      let value = this.value.replace(/\D/g, "");
      if (value.length > 14) value = value.slice(0, 14);
      value = value.replace(/^(\d{2})(\d)/, "$1.$2");
      value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
      value = value.replace(/(\d{4})(\d)/, "$1-$2");
      this.value = value;
    });
  }

  // CEP
  const cepInput = document.getElementById('merchant-cep');
  if (cepInput) {
    cepInput.addEventListener('input', function () {
      let value = this.value.replace(/\D/g, "");
      if (value.length > 8) value = value.slice(0, 8);
      if (value.length > 5) {
        value = value.replace(/^(\d{5})(\d)/, "$1-$2");
      }
      this.value = value;
    });
  }

  // Telefone
  const phoneInputs = [
    document.getElementById('merchant-phone'),
    document.getElementById('merchant-responsible-phone')
  ];

  phoneInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', function () {
        let value = this.value.replace(/\D/g, "");
        if (value.length > 11) value = value.slice(0, 11);

        if (value.length <= 10) {
          value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
          value = value.replace(/(\d{4})(\d)/, "$1-$2");
        } else {
          value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
          value = value.replace(/(\d{5})(\d)/, "$1-$2");
        }
        this.value = value;
      });
    }
  });
}

function setupCEPSearch() {
  const cepInput = document.getElementById('merchant-cep');
  if (!cepInput) return;

  cepInput.addEventListener('blur', async function () {
    const cep = this.value.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (!data.erro) {
          document.getElementById('merchant-address').value = data.logradouro || '';
          document.getElementById('merchant-neighborhood').value = data.bairro || '';
          document.getElementById('merchant-city').value = data.localidade || '';
          document.getElementById('merchant-state').value = data.uf || '';
        }
      } catch (error) {
        console.error('❌ Erro ao buscar CEP:', error);
      }
    }
  });
}

async function handleRegisterSubmit() {
  try {
    showLoading(true);

    // Coletar dados do formulário
    const formData = {
      cnpj: document.getElementById('merchant-cnpj').value,
      businessName: document.getElementById('merchant-business-name').value,
      tradingName: document.getElementById('merchant-trading-name').value,
      category: document.getElementById('merchant-category').value,
      phone: document.getElementById('merchant-phone').value,
      businessHours: document.getElementById('businessHours').value || '',

      location: {
        cep: document.getElementById('merchant-cep').value,
        state: document.getElementById('merchant-state').value,
        city: document.getElementById('merchant-city').value,
        neighborhood: document.getElementById('merchant-neighborhood').value,
        address: document.getElementById('merchant-address').value,
        number: document.getElementById('merchant-number').value,
        complement: document.getElementById('merchant-complement').value,
        deliveryRadius: parseInt(document.getElementById('merchant-radius').value) || 5,
        deliveryOptions: ['pickup']
      },

      contact: {
        responsibleName: document.getElementById('merchant-responsible-name').value,
        responsibleEmail: document.getElementById('merchant-responsible-email').value,
        responsiblePhone: document.getElementById('merchant-responsible-phone').value
      }
    };

    // Validar campos obrigatórios
    if (!validateRegisterForm(formData)) {
      throw new Error('Preencha todos os campos obrigatórios.');
    }

    // Validar CNPJ
    if (!validateCNPJ(formData.cnpj)) {
      throw new Error('CNPJ inválido. Verifique os dígitos.');
    }

    const merchantData = await saveMerchantProfile(
      currentUser.uid,
      currentUser.email,
      formData
    );

    currentMerchant = merchantData;

    showNotification('success', '✅ Cadastro realizado com sucesso!');
    showPanelScreen();
    await loadInitialData();

  } catch (error) {
    console.error('❌ Erro no cadastro:', error);
    showNotification('error', error.message);
  } finally {
    showLoading(false);
  }
}

// ========== HANDLERS DE AUTENTICAÇÃO ==========

async function handleAuthStateChange(user) {
  showLoading(false);
  console.log('🔐 Estado de autenticação alterado:', user?.email);

  if (user) {
    currentUser = user;
    console.log('👤 Usuário atual:', user.email);

    try {
      // Verificar se já tem cadastro como lojista
      const merchantProfile = await checkMerchantProfile(user.uid);
      console.log('📋 Perfil do merchant encontrado?', !!merchantProfile);

      if (merchantProfile) {
        // Tem cadastro completo
        currentMerchant = merchantProfile;

        //updateMerchantInfo(merchantProfile);

        showPanelScreen();
        await loadInitialData();
      } else {
        // Primeiro acesso - mostrar cadastro
        console.log('📝 Primeiro acesso, mostrando cadastro');
        showRegisterScreen();
      }
    } catch (error) {
      console.error('❌ Erro ao verificar perfil:', error);
      showRegisterScreen();
    }

  } else {
    console.log('👤 Usuário deslogado');

    // Limpar cache ao deslogar
    localStorage.removeItem('currentMerchant');
    window.currentMerchant = null;

    showLoginScreen();
  }
}

// ========== GERENCIAMENTO DO MERCHANT BADGE ==========
window.updateMerchantInfo = function (merchantData) {
  // Verificação básica de segurança
  if (!merchantData || typeof merchantData !== 'object') {
    console.warn('updateMerchantInfo: dados inválidos');
    return false;
  }

  console.log('ℹ️ updateMerchantInfo chamado para:', merchantData.tradingName);

  // Atualizar badge do merchant (APENAS SE NECESSÁRIO)
  const merchantBadge = document.getElementById('merchant-name-badge');
  if (merchantBadge) {
    const newName = merchantData.tradingName || merchantData.businessName || 'Lojista';

    // VERIFICAR SE JÁ ESTÁ COM O NOME CORRETO
    if (merchantBadge.textContent === newName) {
      console.log('✓ Badge já está correto:', newName);
    } else {
      merchantBadge.textContent = newName;
      merchantBadge.title = `CNPJ: ${merchantData.cnpj || 'Não informado'}`;
      console.log('✓ Badge atualizado:', newName);
    }
  }

  // Atualizar variável global (simples)
  window.currentMerchant = merchantData;

  // Salvar no localStorage (sem eventos)
  try {
    localStorage.setItem('currentMerchant', JSON.stringify(merchantData));
    console.log('✓ Dados salvos no localStorage');
  } catch (e) {
    console.error('Erro ao salvar no localStorage:', e);
  }

  return true;
};

// Modifique handleNewLogin ou onde você recebe os dados do merchant:
async function handleNewLogin(user) {
  currentUser = user;

  try {
    const { checkMerchantProfile } = await import('./merchant.js');
    const merchantProfile = await checkMerchantProfile(user.uid);

    if (merchantProfile) {
      currentMerchant = merchantProfile;
      updateMerchantInfo(merchantProfile);
      showPanelScreen();
      await loadInitialData();
    } else {
      showRegisterScreen();
    }
  } catch (error) {
    console.error('❌ Erro ao verificar perfil:', error);
    showRegisterScreen();
  }
}

// ========== GERENCIAMENTO DE TELAS ==========

function showLoginScreen() {
  hideAllScreens();
  loginScreen.classList.remove('hidden');
}

function showRegisterScreen() {
  hideAllScreens();

  // Preencher e-mail automaticamente se tiver usuário
  if (currentUser) {
    const emailField = document.getElementById('merchant-responsible-email');
    if (emailField) emailField.value = currentUser.email || '';

    const nameField = document.getElementById('merchant-responsible-name');
    if (nameField && currentUser.displayName) {
      nameField.value = currentUser.displayName;
    }
  }

  registerScreen.classList.remove('hidden');
}

function hideAllScreens() {
  loginScreen.classList.add('hidden');
  registerScreen.classList.add('hidden');
  panel.classList.add('hidden');
}

function showLoading(show) {
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

// ========== NAVEGAÇÃO DO PAINEL ==========
// ========== NAVEGAÇÃO DO PAINEL ==========
let isChangingView = false;
let pendingViewChange = null;

window.showView = async function (viewName) {
  // Se já está mudando, agendar próxima mudança
  if (isChangingView) {
    pendingViewChange = viewName;
    return;
  }

  // Se é a mesma view, ignorar
  const currentView = document.querySelector('.view.active');
  if (currentView && currentView.id === `view-${viewName}`) {
    return;
  }

  isChangingView = true;

  try {
    console.log(`🔄 Mudando para view: ${viewName}`);

    // 1. Limpar event listeners específicos da view anterior
    cleanupCurrentView();

    // 2. Atualizar navegação
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // 3. Mostrar/ocultar views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${viewName}`);
    });

    // 4. Atualizar badge se necessário
    updateMerchantBadge();

    // 5. Carregar dados da nova view
    await loadViewData(viewName);

    if (window.closePreview) {
      window.closePreview();
    }

  } catch (error) {
    console.error('❌ Erro ao mudar de view:', error);
  } finally {
    isChangingView = false;

    // Processar mudança pendente se houver
    if (pendingViewChange) {
      const nextView = pendingViewChange;
      pendingViewChange = null;
      setTimeout(() => showView(nextView), 50);
    }
  }
};

let currentViewListeners = new Set();

function cleanupCurrentView() {
  // Limpar event listeners específicos da view atual
  currentViewListeners.forEach(listener => {
    if (listener.element && listener.handler) {
      listener.element.removeEventListener(listener.event, listener.handler);
    }
  });
  currentViewListeners.clear();
}

function addViewListener(element, event, handler) {
  element.addEventListener(event, handler);
  currentViewListeners.add({ element, event, handler });
}

async function loadViewData(viewName) {
  if (!currentUser) return;

  // Limpar listeners da view anterior
  cleanupCurrentView();

  switch (viewName) {
    case 'deals':
      await loadMerchantDeals(currentUser.uid);
      break;
    case 'stats':
      await loadStats(currentUser.uid);
      break;
    case 'edit-merchant':
      try {
        const merchant = await loadMerchantForEdit(currentUser.uid);
        console.log('✅ Dados carregados para edição:', merchant?.tradingName);

        // Configurar listeners específicos para esta view
        //setupEditMerchantListeners();
      } catch (error) {
        console.error('Erro ao carregar merchant para edição:', error);
      }
      break;
    case 'create-deal':
      // Inicializar o formulário de criação de oferta
      //initCreateDealForm();

      // Configurar listeners para o formulário de criação
      setupCreateDealListeners();
      break;
  }
}

function setupCreateDealListeners() {
  const form = document.getElementById('create-deal-form');
  const descriptionField = document.getElementById('deal-description');

  if (form) {
    addViewListener(form, 'submit', handleCreateDealSubmit);
  }

  if (descriptionField) {
    // Debounce mais longo para campo de descrição
    const debouncedHandler = debounce(function (e) {
      // Atualizar contador de caracteres se houver
      const charCount = e.target.value.length;
      const counter = document.getElementById('description-counter');
      if (counter) {
        counter.textContent = `${charCount}/500`;
      }
    }, 500); // 500ms para não travar

    addViewListener(descriptionField, 'input', debouncedHandler);
  }
}

function updateMerchantBadge() {
  if (!window.currentMerchant?.tradingName) return;

  const badge = document.getElementById('merchant-name-badge');
  if (badge && badge.textContent !== window.currentMerchant.tradingName) {
    badge.textContent = window.currentMerchant.tradingName;
  }
}

// ========== FUNÇÕES AUXILIARES ==========

/**
 * Garante que os cálculos de desconto funcionem
 */
export function setupDiscountCalculator() {
  const originalPriceInput = document.getElementById('deal-original-price');
  const dealPriceInput = document.getElementById('deal-price');
  const discountInput = document.getElementById('deal-discount');

  // VERIFICAÇÃO DE SEGURANÇA: Só prossegue se os campos existirem
  if (!originalPriceInput || !dealPriceInput || !discountInput) {
    return;
  }

  let lastActiveField = null;

  // Funções auxiliares (internas para não poluir o escopo global)
  const parseNumber = (value) => {
    if (!value) return 0;
    return parseFloat(String(value).replace(',', '.')) || 0;
  };

  const formatNumber = (num) => num.toFixed(2).replace('.', ',');

  const calculate = () => {
    const original = parseNumber(originalPriceInput.value);
    const deal = parseNumber(dealPriceInput.value);
    const discount = parseNumber(discountInput.value);

    if (original <= 0) return;

    if (lastActiveField === 'deal-discount') {
      const calculatedDeal = original - (original * (discount / 100));
      dealPriceInput.value = formatNumber(calculatedDeal);
    } else {
      const calculatedDiscount = ((original - deal) / original) * 100;
      discountInput.value = formatNumber(Math.max(0, calculatedDiscount));
    }
  };

  // Adiciona os eventos corretamente dentro do escopo onde as variáveis existem
  [originalPriceInput, dealPriceInput, discountInput].forEach(input => {
    input.addEventListener('focus', () => { lastActiveField = input.id; });
    input.addEventListener('input', calculate);
  });
}

function setupDealFormWithMerchantData() {
  // Adicionar event listener para quando a view create-deal for ativada
  function initCreateDealForm() {
    const createDealView = document.getElementById('view-create-deal');
    if (!createDealView) return;

    if (currentMerchant && currentMerchant.location) {
      // Preencher campos de localização (somente leitura)
      const addressField = document.getElementById('deal-address');
      if (addressField && !addressField.value) {
        const loc = currentMerchant.location;
        addressField.value = `${loc.address}, ${loc.number} - ${loc.neighborhood}, ${loc.city} - ${loc.state}`;
        addressField.readOnly = true;
        addressField.title = "Endereço definido no cadastro do estabelecimento";
      }

      const neighborhoodField = document.getElementById('deal-neighborhood');
      if (neighborhoodField && !neighborhoodField.value) {
        neighborhoodField.value = currentMerchant.location.neighborhood;
        neighborhoodField.readOnly = true;
      }

      const radiusField = document.getElementById('deal-radius');
      if (radiusField) {
        radiusField.value = currentMerchant.location.deliveryRadius || 5;
        radiusField.disabled = true;
        radiusField.title = "Raio de atendimento definido no cadastro";
      }
    }
  }

  // Adicionar ao loadViewData para ser chamado quando a view for carregada
  window.initCreateDealForm = initCreateDealForm;
}

async function loadInitialData() {
  if (currentUser) {
    await loadMerchantDeals(currentUser.uid);
    await loadStats(currentUser.uid);
  }
}

// NOVO: Validação do formulário de cadastro
function validateRegisterForm(data) {
  const requiredFields = [
    data.cnpj,
    data.businessName,
    data.tradingName,
    data.category,
    data.phone,
    data.location.cep,
    data.location.state,
    data.location.city,
    data.location.neighborhood,
    data.location.address,
    data.location.number,
    data.contact.responsibleName,
    data.contact.responsibleEmail,
    data.contact.responsiblePhone
  ];

  return requiredFields.every(field => field && field.trim().length > 0);
}

// NOVO: Validação de CNPJ
function validateCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]+/g, '');

  if (cnpj.length !== 14) return false;

  // Elimina CNPJs inválidos conhecidos
  if (/^(\d)\1+$/.test(cnpj)) return false;

  // Valida DVs
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

// NOVO: Sistema de notificações
function showNotification(type, message) {
  // Remove notificações anteriores
  const existing = document.querySelector('.app-notification');
  if (existing) existing.remove();

  // Cria nova notificação
  const notification = document.createElement('div');
  notification.className = `app-notification app-notification-${type}`;
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

// Adicionar estilos CSS se não existirem
if (!document.querySelector('#app-notification-styles')) {
  const style = document.createElement('style');
  style.id = 'app-notification-styles';
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

let isUpdatingMerchant = false;

window.updateMerchantInfo = function (merchantData, forceUpdate = false) {

  if (isUpdatingMerchant) {
    console.log('⚠️ updateMerchantInfo já em execução, ignorando chamada...');
    return;
  }
  isUpdatingMerchant = true;

  try {

    // Verificação básica
    if (!merchantData || typeof merchantData !== 'object') {
      console.log('❌ updateMerchantInfo: Dados inválidos', merchantData);
      return;
    }

    console.log('🔄 updateMerchantInfo chamada para:', merchantData.tradingName || merchantData.businessName);

    // Verificar se é o mesmo merchant (para evitar atualizações desnecessárias)
    const currentBadgeText = document.getElementById('merchant-name-badge')?.textContent;
    const newDisplayName = merchantData.tradingName || merchantData.businessName || 'Lojista';

    if (!forceUpdate && currentBadgeText === newDisplayName) {
      console.log('ℹ️ Badge já está atualizado, ignorando...');
      return;
    }

    const merchantBadge = document.getElementById('merchant-name-badge');
    if (merchantBadge) {
      console.log('📝 Atualizando badge de', currentBadgeText, 'para', newDisplayName);
      merchantBadge.textContent = newDisplayName;
      merchantBadge.title = `CNPJ: ${merchantData.cnpj || 'Não informado'}`;
      console.log('✅ Badge atualizado com sucesso');
    } else {
      console.log('❌ Elemento merchant-name-badge não encontrado');
    }

    // Atualizar variável global (sem disparar eventos)
    window.currentMerchant = merchantData;

    // Salvar no localStorage (operação segura)
    try {
      localStorage.setItem('currentMerchant', JSON.stringify(merchantData));
      console.log('💾 Merchant salvo no localStorage');
    } catch (e) {
      console.error('❌ Erro ao salvar no localStorage:', e);
    }

  } finally {
    isUpdatingMerchant = false;
  }
};

// Função auxiliar para obter o merchant atual
window.getCurrentMerchant = function () {
  return window.currentMerchant;
};

async function syncMerchantData() {
  if (!currentUser || !currentUser.uid) {
    console.log('⚠️ syncMerchantData: Nenhum usuário logado');
    return;
  }

  try {
    console.log('🔄 Sincronizando dados do merchant...');

    // Buscar dados atualizados do Firestore
    const { checkMerchantProfile } = await import('./merchant.js');
    const merchantProfile = await checkMerchantProfile(currentUser.uid);

    if (merchantProfile) {
      console.log('✅ Dados sincronizados do Firestore:', merchantProfile.tradingName);

      // Atualizar localmente
      currentMerchant = merchantProfile;

      // Atualizar badge
      if (typeof window.updateMerchantInfo === 'function') {
        window.updateMerchantInfo(merchantProfile);
      } else {
        // Fallback: atualizar diretamente
        const badge = document.getElementById('merchant-name-badge');
        if (badge && merchantProfile.tradingName) {
          badge.textContent = merchantProfile.tradingName;
        }
      }

      return merchantProfile;
    }
  } catch (error) {
    console.error('❌ Erro ao sincronizar merchant:', error);
  }

  return null;
}

function showPanelScreen() {
  hideAllScreens();
  panel.classList.remove('hidden');

  console.log('🏪 Mostrando painel, usuário:', currentUser?.email);

  // Atualizar informações do usuário
  if (currentUser) {
    userPhoto.src = currentUser.photoURL || '/public/assets/icons/default-avatar.png';
    userName.textContent = currentUser.displayName || currentUser.email || 'Usuário';
  }

  if (currentUser) {
    syncMerchantData().then(merchant => {
      if (merchant) {
        console.log('✅ Painel sincronizado com dados atualizados');
      }
    });
  }

  // Mostrar view inicial
  showView('deals');
}

function initializeBadgeOnLoad() {
  console.log('🔍 Inicializando badge no carregamento...');

  // Tentar carregar do localStorage
  try {
    const savedMerchant = localStorage.getItem('currentMerchant');
    if (savedMerchant) {
      const merchant = JSON.parse(savedMerchant);
      const badge = document.getElementById('merchant-name-badge');

      if (badge && merchant.tradingName) {
        badge.textContent = merchant.tradingName;
        badge.title = `CNPJ: ${merchant.cnpj || 'Não informado'}`;
        console.log('✓ Badge inicializado do localStorage:', merchant.tradingName);
      }
    }
  } catch (e) {
    console.error('Erro ao inicializar badge:', e);
  }
}

export { currentUser, currentMerchant };