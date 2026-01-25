import { observeAuthState, loginWithGoogle, logout } from './auth.js';
import { loadMerchantDeals, setupDealForm } from './deals.js';
import { setupCouponValidation, loadStats } from './coupons.js';
import { checkMerchantProfile, saveMerchantProfile } from './merchant.js';

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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupRegisterForm();
  observeAuthState(handleAuthStateChange);
  setupDealForm();
  setupCouponValidation();

  setupDiscountCalculator();
  setupDealFormWithMerchantData();
});

// ========== SETUP DE EVENTOS ==========

function setupEventListeners() {
  // Login com Google
  googleLoginBtn.addEventListener('click', async () => {
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
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await logout();
      showLoginScreen();
    } catch (error) {
      console.error('❌ Erro no logout:', error);
    }
  });

  // Navegação do painel
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
    });
  });

  // Botão voltar
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

  if (user) {
    currentUser = user;

    // Verificar se já tem cadastro como lojista
    try {
      const merchantProfile = await checkMerchantProfile(user.uid);

      if (merchantProfile) {
        // Tem cadastro completo
        currentMerchant = merchantProfile;
        showPanelScreen();
        await loadInitialData();
      } else {
        // Verificar se tem dados no localStorage (para desenvolvimento)
        const localMerchant = localStorage.getItem('merchantProfile');
        if (localMerchant) {
          currentMerchant = JSON.parse(localMerchant);
          showPanelScreen();
          await loadInitialData();
        } else {
          // Primeiro acesso - mostrar cadastro
          showRegisterScreen();
        }
      }
    } catch (error) {
      console.error('❌ Erro ao verificar perfil:', error);
      showRegisterScreen();
    }

  } else {
    showLoginScreen();
  }
}

// Na função showPanelScreen ou handleNewLogin, adicione:
function updateMerchantInfo(merchantData) {
  if (!merchantData) return;

  // Atualizar badge do merchant
  const merchantBadge = document.getElementById('merchant-name-badge');
  if (merchantBadge && merchantData.tradingName) {
    merchantBadge.textContent = merchantData.tradingName;
    merchantBadge.title = `CNPJ: ${merchantData.cnpj || 'Não informado'}`;
  }

  // Armazenar no objeto global para uso em outros módulos
  window.currentMerchant = merchantData;

  // Chamar função do deals.js para atualizar UI
  if (window.updateMerchantUI) {
    window.updateMerchantUI(merchantData);
  }
}

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

function showPanelScreen() {
  hideAllScreens();
  panel.classList.remove('hidden');

  // Atualizar informações do usuário
  if (currentUser) {
    userPhoto.src = currentUser.photoURL || '/public/assets/icons/default-avatar.png';
    userName.textContent = currentUser.displayName || currentUser.email || 'Usuário';
  }

  // Mostrar view inicial
  showView('deals');
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

window.showView = function (viewName) {
  // Atualizar navegação
  navButtons.forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

  // Mostrar view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Carregar dados específicos da view
  switch (viewName) {
    case 'deals':
      if (currentUser) loadMerchantDeals(currentUser.uid);
      break;
    case 'stats':
      if (currentUser) loadStats(currentUser.uid);
      break;
  }
};

// ========== FUNÇÕES AUXILIARES ==========

function setupDiscountCalculator() {
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
}

function setupDealFormWithMerchantData() {

  const observer = new MutationObserver(() => {
    const createDealView = document.getElementById('view-create-deal');
    if (createDealView && createDealView.classList.contains('active')) {
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

        // Adicionar nota informativa
        const locationSection = document.querySelector('h3[style*="Localização"]');
        if (locationSection) {
          const note = document.createElement('div');
          note.style.cssText = `
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 12px;
            margin: 16px 0;
            font-size: 0.875rem;
            color: #0369a1;
          `;
          note.innerHTML = `
            <strong>ℹ️ Informação:</strong> 
            A localização e raio de atendimento são herdados do seu cadastro. 
            Para alterar, atualize seus dados no perfil do estabelecimento.
          `;
          locationSection.parentNode.insertBefore(note, locationSection.nextSibling);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
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

export { currentUser, currentMerchant };