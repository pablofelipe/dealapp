import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadMerchantDeals, setupDealForm } from './deals.js';
import { setupCouponValidation, loadStats } from './coupons.js';
import { checkMerchantProfile, saveMerchantProfile } from './merchant.js';
import { initializeEditMerchant, loadMerchantForEdit } from './edit-merchant.js';
import { validateCNPJ } from '../../shared/domain/cnpj.js';

function getEl(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

// Elementos DOM
const loading = document.getElementById('loading') as HTMLElement;
const loginScreen = document.getElementById('login-screen') as HTMLElement;
const registerScreen = document.getElementById('register-screen') as HTMLElement;
const panel = document.getElementById('panel') as HTMLElement;
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPhoto = document.getElementById('user-photo') as HTMLImageElement | null;
const userName = document.getElementById('user-name') as HTMLElement | null;

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
  setupFlashDealView();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('ref');
  if (code) {
    const vendorInput = getEl('vendorCode');
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
  listeners: new Map<EventTarget, { event: string; handler: EventListener }[]>(),

  add(element: EventTarget, event: string, handler: EventListener, options?: boolean | AddEventListenerOptions) {
    if (!this.listeners.has(element)) {
      this.listeners.set(element, []);
    }
    element.addEventListener(event, handler, options);
    this.listeners.get(element)!.push({ event, handler });
  },

  removeAll(element: EventTarget) {
    if (this.listeners.has(element)) {
      this.listeners.get(element)!.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.listeners.delete(element);
    }
  },

  removeAllFromSelector(selector: string) {
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
function debounce(func: (...args: any[]) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: any[]) {
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
  // 1. Login com Google
  if (googleLoginBtn) {
    eventListenersManager.add(googleLoginBtn, 'click', async () => {
      try {
        showLoading(true);
        const user = await loginWithGoogle();
        if (user) await handleNewLogin(user);
      } catch (error) {
        console.error('❌ Erro no login:', error);
        showNotification('error', 'Erro ao fazer login. Tente novamente.');
      } finally {
        showLoading(false);
      }
    });
  }

  // 2. Navegação Unificada (Incluindo Logout)
  // Usamos delegação de eventos na bottom-nav para ser mais eficiente
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    eventListenersManager.add(bottomNav, 'click', (async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.nav-btn') as HTMLElement | null; // Pega o botão mesmo clicando no ícone/span
      if (!btn) return;

      // Caso especial: Botão de Sair
      if (btn.id === 'logout-btn' || btn.classList.contains('logout-btn-nav')) {
        if (confirm('Deseja realmente sair do Radar?')) {
          try {
            await logout();
            window.location.reload(); // Limpa estado e volta pro login
          } catch (error) {
            console.error('❌ Erro no logout:', error);
          }
        }
        return;
      }

      // Navegação normal
      const view = btn.dataset.view;
      if (view) showView(view);
    }) as EventListener);
  }

  // 3. Cliques Globais (Botão Voltar e Fechar Modais)
  eventListenersManager.add(document, 'click', ((e: MouseEvent) => {
    // Botão Voltar
    if ((e.target as HTMLElement).closest('.btn-back')) {
      showView('deals');
      return;
    }

    // Fechar modais (se houver um fundo clicável)
    if ((e.target as HTMLElement).classList.contains('modal')) {
      (window as any).closePreview?.();
    }
  }) as EventListener);

  setupNavHighlight();
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
  const cnpjInput = getEl('merchant-cnpj');
  if (cnpjInput) {
    cnpjInput.addEventListener('input', function (this: HTMLInputElement) {
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
  const cepInput = getEl('merchant-cep');
  if (cepInput) {
    cepInput.addEventListener('input', function (this: HTMLInputElement) {
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
    getEl('merchant-phone'),
    getEl('merchant-responsible-phone')
  ];

  phoneInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', function (this: HTMLInputElement) {
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
  const cepInput = getEl('merchant-cep');
  if (!cepInput) return;

  cepInput.addEventListener('blur', async function (this: HTMLInputElement) {
    const cep = this.value.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (!data.erro) {
          getEl('merchant-address').value = data.logradouro || '';
          getEl('merchant-neighborhood').value = data.bairro || '';
          getEl('merchant-city').value = data.localidade || '';
          getEl('merchant-state').value = data.uf || '';
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
      cnpj: getEl('merchant-cnpj').value,
      businessName: getEl('merchant-business-name').value,
      tradingName: getEl('merchant-trading-name').value,
      category: getEl('merchant-category').value,
      phone: getEl('merchant-phone').value,
      businessHours: getEl('businessHours').value || '',

      location: {
        cep: getEl('merchant-cep').value,
        state: getEl('merchant-state').value,
        city: getEl('merchant-city').value,
        neighborhood: getEl('merchant-neighborhood').value,
        address: getEl('merchant-address').value,
        number: getEl('merchant-number').value,
        complement: getEl('merchant-complement').value,
        deliveryRadius: parseInt(getEl('merchant-radius').value) || 5,
        deliveryOptions: ['pickup']
      },

      contact: {
        responsibleName: getEl('merchant-responsible-name').value,
        responsibleEmail: getEl('merchant-responsible-email').value,
        responsiblePhone: getEl('merchant-responsible-phone').value
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

  const navContainer = document.querySelector('.bottom-nav') as HTMLElement | null;

  if (navContainer) navContainer.style.display = 'none';

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

        loginScreen.style.display = 'none';
        registerScreen.style.display = 'none';
        panel.style.display = 'block';

        if (navContainer) navContainer.style.display = 'flex';

        //updateMerchantInfo(merchantProfile);

        showPanelScreen();
        await loadInitialData();
      } else {
        loginScreen.style.display = 'none';
        registerScreen.style.display = 'block';
        panel.style.display = 'none';

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
    (window as any).currentMerchant = null;

    loginScreen.style.display = 'flex';
    registerScreen.style.display = 'none';
    panel.style.display = 'none';

    showLoginScreen();
  }
}

// ========== GERENCIAMENTO DO MERCHANT BADGE ==========
// (updateMerchantInfo é definida mais abaixo, com guarda contra chamadas concorrentes)

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
    const emailField = getEl('merchant-responsible-email');
    if (emailField) emailField.value = currentUser.email || '';

    const nameField = getEl('merchant-responsible-name');
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

async function showView(viewName: string) {
  // Se já está mudando, agendar próxima mudança
  if (isChangingView) {
    pendingViewChange = viewName;
    return;
  }

  console.log(`🔍 showView chamada com viewName: "${viewName}"`);

  // Mapeamento de nomes de view para IDs de elementos
  const viewIdMap = {
    'deals': 'view-deals',
    'flash-deal-view': 'flash-deal-view',
    'create-deal': 'view-create-deal',
    'validate': 'view-validate',
    'stats': 'view-stats',
    'edit-merchant': 'view-edit-merchant'
  };

  // Se é a mesma view, ignorar
  const targetViewId = viewIdMap[viewName] || `view-${viewName}`;

  console.log(`🎯 Target View ID: ${targetViewId}`);

  // Se é a mesma view, ignorar
  const currentView = document.querySelector('.view.active');

  if (currentView && currentView.id === targetViewId) {
    console.log(`⚠️ Já está na view ${targetViewId}, ignorando...`);
    return;
  }

  isChangingView = true;

  try {
    console.log(`🔄 Mudando para view: ${viewName}`);

    // 1. Limpar event listeners específicos da view anterior
    cleanupCurrentView();

    // 2. Atualizar navegação
    navButtons.forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.view === viewName);
    });

    // 3. Mostrar/ocultar views
    document.querySelectorAll('.view').forEach(v => {
      const shouldBeActive = v.id === targetViewId;
      v.classList.toggle('active', shouldBeActive);

      // Log para debug
      if (shouldBeActive) {
        console.log(`✅ Ativando view: ${v.id}`);
      }
    });

    // 4. Atualizar badge se necessário
    updateMerchantBadge();

    // 5. Carregar dados da nova view
    await loadViewData(viewName);

    if ((window as any).closePreview) {
      (window as any).closePreview();
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
}
(window as any).showView = showView;

const currentViewListeners = new Set<{ element: EventTarget; event: string; handler: EventListener }>();

function cleanupCurrentView() {
  // Limpar event listeners específicos da view atual
  currentViewListeners.forEach(listener => {
    if (listener.element && listener.handler) {
      listener.element.removeEventListener(listener.event, listener.handler);
    }
  });
  currentViewListeners.clear();
}

function addViewListener(element: EventTarget, event: string, handler: EventListener) {
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
  const descriptionField = document.getElementById('deal-description');

  if (descriptionField) {
    // Debounce mais longo para campo de descrição
    const debouncedHandler = debounce(function (e: Event) {
      // Atualizar contador de caracteres se houver
      const charCount = (e.target as HTMLTextAreaElement).value.length;
      const counter = document.getElementById('description-counter');
      if (counter) {
        counter.textContent = `${charCount}/500`;
      }
    }, 500); // 500ms para não travar

    addViewListener(descriptionField, 'input', debouncedHandler as EventListener);
  }
}

function updateMerchantBadge() {
  if (!(window as any).currentMerchant?.tradingName) return;

  const badge = document.getElementById('merchant-name-badge');
  if (badge && badge.textContent !== (window as any).currentMerchant.tradingName) {
    badge.textContent = (window as any).currentMerchant.tradingName;
  }
}

// ========== FUNÇÕES AUXILIARES ==========

/**
 * Garante que os cálculos de desconto funcionem
 */
export function setupDiscountCalculator() {
  const originalPriceInput = getEl('deal-original-price');
  const dealPriceInput = getEl('deal-price');
  const discountInput = getEl('deal-discount');

  // VERIFICAÇÃO DE SEGURANÇA: Só prossegue se os campos existirem
  if (!originalPriceInput || !dealPriceInput || !discountInput) {
    return;
  }

  let lastActiveField: string | null = null;

  // Funções auxiliares (internas para não poluir o escopo global)
  const parseNumber = (value: string) => {
    if (!value) return 0;
    return parseFloat(String(value).replace(',', '.')) || 0;
  };

  const formatNumber = (num: number) => num.toFixed(2).replace('.', ',');

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
      const addressField = getEl('deal-address');
      if (addressField && !addressField.value) {
        const loc = currentMerchant.location;
        addressField.value = `${loc.address}, ${loc.number} - ${loc.neighborhood}, ${loc.city} - ${loc.state}`;
        addressField.readOnly = true;
        addressField.title = "Endereço definido no cadastro do estabelecimento";
      }

      const neighborhoodField = getEl('deal-neighborhood');
      if (neighborhoodField && !neighborhoodField.value) {
        neighborhoodField.value = currentMerchant.location.neighborhood;
        neighborhoodField.readOnly = true;
      }

      const radiusField = getEl('deal-radius');
      if (radiusField) {
        radiusField.value = (currentMerchant.location.deliveryRadius || 5).toString();
        radiusField.disabled = true;
        radiusField.title = "Raio de atendimento definido no cadastro";
      }
    }
  }

  // Adicionar ao loadViewData para ser chamado quando a view for carregada
  (window as any).initCreateDealForm = initCreateDealForm;
}

async function loadInitialData() {
  if (currentUser) {
    await loadMerchantDeals(currentUser.uid);
    await loadStats(currentUser.uid);
  }
}

// Validação do formulário de cadastro
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

// Sistema de notificações
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

function updateMerchantInfo(merchantData: any, forceUpdate = false) {

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
    (window as any).currentMerchant = merchantData;

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
}
(window as any).updateMerchantInfo = updateMerchantInfo;

// Função auxiliar para obter o merchant atual
function getCurrentMerchant() {
  return (window as any).currentMerchant;
}
(window as any).getCurrentMerchant = getCurrentMerchant;

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
      if (typeof updateMerchantInfo === 'function') {
        updateMerchantInfo(merchantProfile);
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
    userPhoto.src = currentUser.photoURL || '/public/assets/default-avatar.jpg';
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


// Dentro do setupEventListeners() no app.js
const flashImageInput = document.getElementById('flash-image') as HTMLInputElement | null;
if (flashImageInput) {
  flashImageInput.addEventListener('change', function (e: Event) {
    const reader = new FileReader();
    reader.onload = function (event: ProgressEvent<FileReader>) {
      const preview = document.getElementById('flash-preview') as HTMLElement | null;
      if (preview) preview.innerHTML = `<img src="${event.target?.result}" style="width: 100%; border-radius: 10px; margin-top: 10px;">`;
    };
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) reader.readAsDataURL(file);
  });
}

// Vincule o clique do botão de publicar
document.getElementById('btn-publish-flash')?.addEventListener('click', () => {
  publishFlashDeal();
});

function setupNavHighlight() {
  const allNavButtons = document.querySelectorAll('.nav-btn');

  allNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove a classe active de TODOS (sidebar e bottom nav)
      allNavButtons.forEach(b => b.classList.remove('active'));

      // Adiciona no que foi clicado
      btn.classList.add('active');

      // Pega o ID da view e muda a tela
      const viewId = btn.getAttribute('data-view');
      if (viewId) showView(viewId);
    });
  });
}

function setupFlashDealView() {
  const flashDealView = document.getElementById('flash-deal-view');
  if (!flashDealView) return;

  console.log('⚡ Inicializando view Flash Deal');

  // Configurar o input de imagem
  const flashImageInput = document.getElementById('flash-image') as HTMLInputElement | null;
  const flashPreview = document.getElementById('flash-preview') as HTMLElement | null;

  if (flashImageInput && flashPreview) {
    flashImageInput.addEventListener('change', function (e: Event) {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event: ProgressEvent<FileReader>) {
          flashPreview.innerHTML = `
            <div style="margin-top: 10px;">
              <img src="${event.target?.result}" style="width: 100%; max-width: 300px; border-radius: 10px;">
              <button type="button" onclick="clearFlashImage()" style="margin-top: 10px; padding: 5px 10px; background: #ef4444; color: white; border: none; border-radius: 5px; cursor: pointer;">
                ✕ Remover Imagem
              </button>
            </div>
          `;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Configurar botão de publicação
  const publishBtn = document.getElementById('btn-publish-flash');
  if (publishBtn) {
    publishBtn.addEventListener('click', publishFlashDeal);
  }
}

// Função para limpar a imagem flash
function clearFlashImage() {
  const flashImageInput = document.getElementById('flash-image') as HTMLInputElement | null;
  const flashPreview = document.getElementById('flash-preview') as HTMLElement | null;

  if (flashImageInput) flashImageInput.value = '';
  if (flashPreview) flashPreview.innerHTML = '';
}
(window as any).clearFlashImage = clearFlashImage;

// Função de publicação da oferta relâmpago
async function publishFlashDeal() {
  try {
    const title = getEl('flash-title').value;
    const price = getEl('flash-price').value;
    const imageInput = getEl('flash-image');

    if (!title || !price) {
      showNotification('error', 'Preencha título e preço!');
      return;
    }

    if (!imageInput.files?.[0]) {
      showNotification('error', 'Tire uma foto do produto!');
      return;
    }

    showLoading(true);

    // lógica de upload
    setTimeout(() => {
      showLoading(false);
      showNotification('success', '⚡ Oferta Relâmpago publicada com sucesso!');

      // Limpar formulário
      getEl('flash-title').value = '';
      getEl('flash-price').value = '';
      clearFlashImage();

      // Voltar para as ofertas
      showView('deals');
    }, 1500);

  } catch (error) {
    showLoading(false);
    showNotification('error', 'Erro ao publicar oferta: ' + error.message);
  }
}
