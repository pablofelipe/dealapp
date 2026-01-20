# Guia de Setup - Radar de Ofertas

## Pré-requisitos

- Node.js 18+ instalado
- Conta Firebase criada
- Firebase CLI instalado (`npm install -g firebase-tools`)

## Passo a Passo

### 1. Configurar Firebase

```bash
# Login no Firebase
firebase login

# Inicializar projeto (se ainda não foi feito)
firebase init
```

Durante a inicialização:

- Selecione **Hosting** e **Functions**
- Escolha seu projeto Firebase ou crie um novo
- Configure o diretório público como `public`
- Configure o diretório de functions como `functions`

### 2. Configurar Firebase no Frontend

Edite `public/js/firebase-config.js` e substitua as credenciais:

```javascript
const firebaseConfig = {
  apiKey: 'SUA_API_KEY',
  authDomain: 'SEU_PROJETO.firebaseapp.com',
  projectId: 'SEU_PROJECT_ID',
  storageBucket: 'SEU_PROJETO.appspot.com',
  messagingSenderId: 'SEU_SENDER_ID',
  appId: 'SEU_APP_ID',
};
```

Você pode encontrar essas credenciais em:

- Firebase Console → Configurações do Projeto → Seus Apps

### 3. Configurar Autenticação

No Firebase Console:

1. Vá em **Authentication** → **Sign-in method**
2. Habilite **Google** como provedor de autenticação
3. Configure o domínio autorizado (se necessário)

### 4. Configurar Firestore

As regras e índices já estão configurados em:

- `firestore/firestore.rules`
- `firestore/firestore.indexes.json`

Para aplicar:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. Instalar Dependências das Functions

```bash
cd functions
npm install
```

### 6. Deploy das Functions

```bash
# Build local para testar
npm run build

# Deploy
firebase deploy --only functions
```

### 7. Criar Ícones PWA

Você precisa criar os ícones do PWA em `public/assets/icons/`:

- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

**Dica:** Use ferramentas online como:

- https://www.pwabuilder.com/imageGenerator
- https://realfavicongenerator.net/

### 8. Deploy do Hosting

```bash
# Deploy completo
firebase deploy

# Ou apenas hosting
firebase deploy --only hosting
```

### 9. Testar Localmente

```bash
# Iniciar emuladores (Firestore + Functions)
firebase emulators:start

# Ou apenas hosting (com Live Server ou similar)
# Abra public/index.html em um servidor local
```

## Estrutura de Dados

### Collections do Firestore

#### `deals` (Ofertas)

```javascript
{
  title: string,
  description: string,
  originalPrice: number,
  dealPrice: number,
  discount: number,
  stockAvailable: number,
  imageUrl: string,
  expiresAt: Timestamp,
  createdAt: Timestamp,
  createdBy: string
}
```

#### `coupons` (Cupons)

```javascript
{
  code: string,
  dealId: string,
  userId: string,
  status: 'pending' | 'redeemed' | 'expired',
  generatedAt: Timestamp,
  expiresAt: Timestamp,
  redeemedAt?: Timestamp,
  dealTitle: string,
  dealPrice: number
}
```

#### `users` (Usuários)

```javascript
{
  email: string,
  displayName: string,
  photoURL: string,
  isAdmin: boolean,
  createdAt: Timestamp
}
```

## Próximos Passos

1. Adicionar tratamento de erros mais robusto
2. Implementar notificações push (Firebase Cloud Messaging)
3. Adicionar analytics
4. Implementar cache offline mais inteligente
5. Adicionar testes automatizados
