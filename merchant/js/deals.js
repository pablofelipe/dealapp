import { db, auth } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Carregar ofertas do lojista
export async function loadMerchantDeals(merchantId) {
  try {
    console.log('📦 Carregando ofertas do lojista:', merchantId);
    
    const dealsRef = collection(db, 'deals');
    const q = query(
      dealsRef,
      where('merchantId', '==', merchantId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    console.log('📊 Total de ofertas:', snapshot.size);
    
    const deals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    renderMerchantDeals(deals);
    return deals;
    
  } catch (error) {
    console.error('❌ Erro ao carregar ofertas:', error);
    
    // Se erro for de índice, tentar query sem orderBy
    if (error.code === 'failed-precondition') {
      console.log('⚠️ Índice não existe, tentando query simples...');
      return await loadMerchantDealsSimple(merchantId);
    }
    
    return [];
  }
}

// Query simplificada (fallback)
async function loadMerchantDealsSimple(merchantId) {
  try {
    const dealsRef = collection(db, 'deals');
    const q = query(dealsRef, where('merchantId', '==', merchantId));
    
    const snapshot = await getDocs(q);
    const deals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Ordenar no cliente
    deals.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || new Date(0);
      const dateB = b.createdAt?.toDate() || new Date(0);
      return dateB - dateA;
    });
    
    renderMerchantDeals(deals);
    return deals;
  } catch (error) {
    console.error('❌ Erro na query simples:', error);
    return [];
  }
}

// Renderizar ofertas
function renderMerchantDeals(deals) {
  const dealsList = document.getElementById('deals-list');
  
  if (!dealsList) return;
  
  dealsList.innerHTML = '';
  
  if (deals.length === 0) {
    dealsList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #64748b;">
        <p style="font-size: 18px; margin-bottom: 12px;">📦 Nenhuma oferta criada ainda</p>
        <p>Clique em "Nova Oferta" para começar</p>
      </div>
    `;
    return;
  }
  
  deals.forEach(deal => {
    const dealItem = createDealItem(deal);
    dealsList.appendChild(dealItem);
  });
}

function createDealItem(deal) {
  const item = document.createElement('div');
  item.className = 'deal-item';
  
  const expiresAt = deal.expiresAt?.toDate() || new Date();
  const isExpired = expiresAt < new Date();
  const isLowStock = deal.stockAvailable < 10;
  
  item.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/120'}" alt="${deal.title}">
    <div class="deal-item-content">
      <h3>${deal.title}</h3>
      <p style="color: #64748b; margin-bottom: 8px;">${deal.description}</p>
      <div class="deal-item-meta">
        <span>💰 R$ ${deal.dealPrice.toFixed(2)} (${deal.discount}% OFF)</span>
        <span style="color: ${isLowStock ? '#f59e0b' : '#10b981'}">
          📦 ${deal.stockAvailable}/${deal.stockTotal} restantes
        </span>
        <span style="color: ${isExpired ? '#ef4444' : '#64748b'}">
          📅 ${isExpired ? 'Expirado' : 'Válido até ' + expiresAt.toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
    <div class="deal-item-actions">
      <button class="btn-icon" onclick="editDeal('${deal.id}')" title="Editar">
        ✏️ Editar
      </button>
      <button class="btn-icon" onclick="toggleDealStatus('${deal.id}', ${deal.stockAvailable})" title="Pausar/Ativar">
        ${deal.stockAvailable > 0 ? '⏸️ Pausar' : '▶️ Ativar'}
      </button>
      <button class="btn-icon" onclick="deleteDeal('${deal.id}', '${deal.title.replace(/'/g, "\\'")}')" 
              style="color: #ef4444;" title="Deletar">
        🗑️ Deletar
      </button>
    </div>
  `;
  
  return item;
}

// Setup do formulário de criação
export function setupDealForm() {
  const form = document.getElementById('deal-form');
  
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createDeal();
  });
}

// Criar nova oferta
async function createDeal() {
  try {
    const merchantId = auth.currentUser?.uid;
    
    if (!merchantId) {
      alert('Você precisa estar logado para criar ofertas');
      return;
    }
    
    const title = document.getElementById('deal-title').value;
    const description = document.getElementById('deal-description').value;
    const originalPrice = parseFloat(document.getElementById('deal-original-price').value);
    const dealPrice = parseFloat(document.getElementById('deal-price').value);
    const stock = parseInt(document.getElementById('deal-stock').value);
    const category = document.getElementById('deal-category').value;
    const expiresDate = document.getElementById('deal-expires').value;
    const imageUrl = document.getElementById('deal-image').value;
    const condominiumId = document.getElementById('deal-condominium').value;
    
    // Validações
    if (dealPrice >= originalPrice) {
      alert('O preço com desconto deve ser menor que o preço original');
      return;
    }
    
    const expiresAt = new Date(expiresDate);
    if (expiresAt <= new Date()) {
      alert('A data de validade deve ser no futuro');
      return;
    }
    
    // Calcular desconto
    const discount = Math.round(((originalPrice - dealPrice) / originalPrice) * 100);
    
    // Criar documento
    const dealData = {
      title,
      description,
      originalPrice,
      dealPrice,
      discount,
      stockTotal: stock,
      stockAvailable: stock,
      category,
      condominiumId,
      merchantId,
      imageUrl: imageUrl || 'https://via.placeholder.com/500',
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now()
    };
    
    console.log('📝 Criando oferta:', dealData);
    
    const docRef = await addDoc(collection(db, 'deals'), dealData);
    
    console.log('✅ Oferta criada com ID:', docRef.id);
    alert('✅ Oferta criada com sucesso!');
    
    // Limpar formulário
    document.getElementById('deal-form').reset();
    
    // Voltar para lista
    window.showView('deals');
    
    // Recarregar lista
    await loadMerchantDeals(merchantId);
    
  } catch (error) {
    console.error('❌ Erro ao criar oferta:', error);
    alert('❌ Erro ao criar oferta: ' + error.message);
  }
}

// Editar oferta
window.editDeal = async function(dealId) {
  alert('Função de edição em desenvolvimento. Deal ID: ' + dealId);
  // TODO: Implementar edição
};

// Pausar/Ativar oferta
window.toggleDealStatus = async function(dealId, currentStock) {
  try {
    const newStock = currentStock > 0 ? 0 : 1;
    const action = newStock > 0 ? 'ativar' : 'pausar';
    
    if (!confirm(`Tem certeza que deseja ${action} esta oferta?`)) {
      return;
    }
    
    const dealRef = doc(db, 'deals', dealId);
    await updateDoc(dealRef, {
      stockAvailable: newStock
    });
    
    console.log(`✅ Oferta ${action}da`);
    alert(`✅ Oferta ${action}da com sucesso!`);
    
    // Recarregar lista
    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);
    
  } catch (error) {
    console.error('❌ Erro ao alterar status:', error);
    alert('❌ Erro ao alterar status da oferta');
  }
};

// Deletar oferta
window.deleteDeal = async function(dealId, dealTitle) {
  try {
    if (!confirm(`Tem certeza que deseja DELETAR a oferta "${dealTitle}"?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }
    
    const dealRef = doc(db, 'deals', dealId);
    await deleteDoc(dealRef);
    
    console.log('✅ Oferta deletada');
    alert('✅ Oferta deletada com sucesso!');
    
    // Recarregar lista
    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);
    
  } catch (error) {
    console.error('❌ Erro ao deletar:', error);
    alert('❌ Erro ao deletar oferta');
  }
};
