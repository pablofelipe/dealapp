# Recursos PWA - DealApp

## Características PWA Implementadas

### 1. Service Worker (sw.js)

O Service Worker é responsável por:
- **Cache de recursos**: Armazena arquivos estáticos (HTML, CSS, JS, imagens)
- **Estratégia Network First**: Tenta buscar na rede primeiro, usa cache como fallback
- **Atualização automática**: Limpa caches antigos quando há nova versão

### 2. Web App Manifest (manifest.json)

Configurações para instalação como app:
- **Nome e descrição**: Informações exibidas na tela de instalação
- **Ícones**: 192x192 e 512x512 pixels
- **Display mode**: `standalone` (remove barra do navegador)
- **Theme color**: Cor da barra de status no Android

### 3. Funcionalidades Offline

O app funciona parcialmente offline:
- ✅ Interface carregada do cache
- ✅ Navegação entre telas
- ✅ Visualização de ofertas em cache
- ⚠️ Geração de cupons requer conexão (Cloud Functions)

### 4. Instalação no Dispositivo

**Android (Chrome):**
1. Abra o site no Chrome
2. Menu (⋮) → "Adicionar à tela inicial"
3. O app aparece como um app nativo

**iOS (Safari):**
1. Abra o site no Safari
2. Compartilhar (□↑) → "Adicionar à Tela de Início"
3. O app aparece na tela inicial

**Desktop (Chrome/Edge):**
1. Ícone de instalação na barra de endereços
2. Ou: Menu → "Instalar DealApp"

### 5. Experiência App-like

- **Tela splash**: Configurada via manifest
- **Navegação nativa**: Bottom navigation bar
- **Sem barra do navegador**: Em modo standalone
- **Responsivo**: Funciona em mobile e desktop

## Melhorias Futuras PWA

### 1. Notificações Push

Implementar Firebase Cloud Messaging:
```javascript
// Em messaging.js (a ser criado)
import { messaging } from './firebase-config.js';
import { getToken, onMessage } from 'firebase/messaging';

// Solicitar permissão
const token = await getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' });

// Escutar mensagens
onMessage(messaging, (payload) => {
  // Mostrar notificação
});
```

### 2. Background Sync

Sincronizar ações quando conexão voltar:
```javascript
// Registrar sync
navigator.serviceWorker.ready.then(registration => {
  return registration.sync.register('sync-coupons');
});

// Escutar sync no SW
self.addEventListener('sync', event => {
  if (event.tag === 'sync-coupons') {
    event.waitUntil(syncCoupons());
  }
});
```

### 3. Cache Estratégico

Melhorar estratégias de cache:
- **Cache First**: Para assets estáticos (imagens, CSS)
- **Network First**: Para dados dinâmicos (ofertas, cupons)
- **Stale While Revalidate**: Para melhor performance

### 4. Offline Queue

Fila de ações offline:
```javascript
// Salvar ações em IndexedDB
const offlineQueue = [];

function queueAction(action) {
  offlineQueue.push(action);
  // Sincronizar quando online
}
```

### 5. Precaching Inteligente

Pré-carregar recursos críticos:
```javascript
// No SW install
const criticalResources = [
  '/',
  '/css/styles.css',
  '/js/app.js'
];
```

### 6. App Shell Architecture

Separar shell do conteúdo:
- **Shell**: Layout, navegação, header (sempre em cache)
- **Content**: Dados dinâmicos (ofertas, cupons)

## Testando PWA

### Lighthouse Audit

1. Abra DevTools (F12)
2. Vá em **Lighthouse**
3. Selecione **Progressive Web App**
4. Execute audit

**Meta**: Score 90+ em todos os critérios

### Checklist PWA

- [x] Service Worker registrado
- [x] Manifest.json configurado
- [x] Ícones PWA (192x192, 512x512)
- [x] HTTPS (necessário para produção)
- [x] Responsivo
- [ ] Notificações Push
- [ ] Background Sync
- [ ] Offline-first architecture

### Teste Offline

1. Abra o app
2. DevTools → Network → Throttling → "Offline"
3. Teste funcionalidades:
   - ✅ App carrega do cache
   - ✅ Navegação funciona
   - ⚠️ Geração de cupons falha (esperado)

## Performance

### Métricas Alvo

- **First Contentful Paint**: < 2s
- **Time to Interactive**: < 3s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1

### Otimizações

- Minificar CSS/JS para produção
- Comprimir imagens
- Lazy loading de imagens
- Code splitting (se necessário)
