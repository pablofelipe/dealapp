# DealApp - Location-Based Deals PWA

Progressive Web App (PWA) designed to deliver exclusive deals and coupons to users based on their proximity to local merchants and stores.

## 🚀 Technologies

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Firebase Functions (TypeScript)
- **Database**: Cloud Firestore
- **Authentication**: Firebase Auth (Google)
- **Hosting**: Firebase Hosting
- **PWA**: Service Worker, Web App Manifest

## ✨ Features

- 🔐 Google Authentication
- 🏷️ Location-based deals listing
- 🎫 Coupon generation and management
- 📱 Installable as an app (PWA)
- 🔄 Offline functionality (caching)
- 🎨 Modern and responsive interface
- 📍 Location-based deal delivery to nearby users

## 📋 Project Structure

```
dealapp/
├── public/              # Main PWA frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js           # Service Worker
│   ├── css/
│   ├── js/
│   └── assets/
├── merchant/           # Merchant panel frontend
│   ├── index.html
│   ├── css/
│   └── js/
├── functions/          # Cloud Functions (TypeScript)
│   └── src/
├── firestore/         # Firestore rules and indexes
├── docs/              # Documentation
└── .github/           # GitHub Actions (CI/CD)
```

## 🛠️ Initial Setup

See the complete guide at [docs/setup.md](docs/setup.md)

### Quick Steps

1. **Install dependencies**:
   ```bash
   cd functions
   npm install
   ```

2. **Configure Firebase**:
   - Edit `public/js/firebase-config.js` with your credentials
   - Configure Authentication in Firebase Console

3. **Deploy**:
   ```bash
   firebase deploy
   ```

## 🧪 Testing

### Firebase Console

Access the Firebase Console to manage your project:
- [Firebase Console](https://console.firebase.google.com/)

### Local Development

To test the application locally before deploying:

```bash
firebase serve --only hosting --project the-dealapp
```

Once the server is running, you can access:

- **Main PWA**: [http://localhost:5000/public/](http://localhost:5000/public/)
- **Merchant Panel**: [http://localhost:5000/merchant/](http://localhost:5000/merchant/)

### Testing Guidelines

1. **Firebase Console**: Use the Firebase Console to monitor authentication, database operations, and view logs
2. **Local Testing**: Always test changes locally using `firebase serve` before deploying
3. **Both Interfaces**: Test both the user-facing PWA (`/public/`) and the merchant panel (`/merchant/`) to ensure full functionality

## 📖 Documentation

- [Setup Guide](docs/setup.md) - Detailed configuration
- [PWA Features](docs/pwa-features.md) - PWA functionalities

## 🎯 Next Steps

1. Add PWA icons in `public/assets/icons/`
   - `icon-192.png` (192x192 pixels)
   - `icon-512.png` (512x512 pixels)

2. Configure Firebase credentials in `public/js/firebase-config.js`

3. Deploy the project:
   ```bash
   firebase deploy
   ```

## 📝 License

All rights reserved.
