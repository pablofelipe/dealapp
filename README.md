# Radar da Oferta (DealApp)

[![Deploy](https://github.com/pablofelipe/dealapp/actions/workflows/firebase-hosting.yml/badge.svg)](https://github.com/pablofelipe/dealapp/actions/workflows/firebase-hosting.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Progressive Web App that connects neighborhood merchants to nearby customers: merchants publish time-limited deals, customers discover them by proximity and redeem coupons in-store. Fully serverless on Firebase.

## Overview

The product has three surfaces:

- **Customer PWA** (`public/`) — browse nearby deals, generate coupons, receive push notifications for new offers in chosen categories. Installable, works offline.
- **Merchant panel** (`merchant/`) — publish offers, validate and redeem customer coupons, track redemption stats.
- **Landing page** (`index.html`) — public acquisition page.

## AI-assisted offer creation

Publishing a good offer is the merchant's biggest friction point, so the merchant panel delegates it to a multimodal AI step (`processOfferWithAI` Cloud Function):

1. The merchant uploads a product photo and types only the title and the promotional price.
2. The function sends the image and the two fields to **Gemini 2.0 Flash**.
3. The model returns structured JSON: a short marketing description, the product category (constrained to the app's category taxonomy), a suggested original price and the computed discount percentage.
4. If the model call fails or no API key is configured, a deterministic fallback fills the same fields, so the publishing flow never blocks on the AI.

The Gemini API key is stored as a Cloud Functions secret — it never ships to the client or the repository.

## Features

- Google sign-in (Firebase Auth)
- Location-based deal discovery
- Coupon generation, in-store validation and redemption tracking
- AI-generated offer descriptions and categorization (Gemini, multimodal)
- Push notifications on new deals, segmented by category topic (FCM)
- Installable PWA with offline caching (service worker + manifest)
- Firestore security rules with owner-based authorization, deployed via CI

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES6+), PWA (service worker, manifest) |
| Backend | Firebase Cloud Functions (Node.js 20) |
| AI | Gemini 2.0 Flash via `@google/generative-ai` (multimodal) |
| Data | Cloud Firestore (+ security rules and composite indexes) |
| Auth | Firebase Authentication (Google) |
| Messaging | Firebase Cloud Messaging (topic-based) |
| Hosting & CI | Firebase Hosting, GitHub Actions (deploys rules + hosting on push) |

## Project structure

```text
dealapp/
├── public/          # Customer PWA
├── merchant/        # Merchant panel
├── functions/       # Cloud Functions (AI offer assist, notifications, subscriptions)
├── firestore.rules  # Security rules (owner-based access control)
├── docs/            # Setup guide and PWA feature notes
├── .github/         # CI: Firestore rules + Hosting deploy on every push
└── index.html       # Landing page
```

## Running locally

```bash
cd functions && npm install && cd ..
firebase serve --only hosting
```

- Customer PWA: http://localhost:5000/public/
- Merchant panel: http://localhost:5000/merchant/

Firebase project credentials go in `public/js/firebase-config.js` (web app config — public by design). The Gemini key is configured once as a function secret:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

## Deploy

Pushes to `main` deploy Firestore rules and Hosting automatically through GitHub Actions. Manual deploy:

```bash
firebase deploy
```

## Documentation

- [Setup guide](docs/setup.md)
- [PWA features](docs/pwa-features.md)

## License

Licensed under the [Apache License 2.0](LICENSE).
