// Funções auxiliares

/**
 * Formata um valor numérico como moeda brasileira
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Formata uma data para formato brasileiro
 */
export function formatDate(date) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date.seconds ? date.seconds * 1000 : date);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Formata uma data e hora para formato brasileiro
 */
export function formatDateTime(date) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date.seconds ? date.seconds * 1000 : date);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calcula o desconto percentual entre dois valores
 */
export function calculateDiscount(originalPrice, dealPrice) {
  return Math.round(((originalPrice - dealPrice) / originalPrice) * 100);
}

/**
 * Valida se um email é válido
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Debounce function para limitar chamadas de função
 */
export function debounce(func, wait) {
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

/**
 * Verifica se estamos offline
 */
export function isOffline() {
  return !navigator.onLine;
}
