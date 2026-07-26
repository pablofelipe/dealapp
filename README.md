# Radar da Oferta (dealapp)

[![Deploy](https://github.com/pablofelipe/dealapp/actions/workflows/firebase-hosting.yml/badge.svg)](https://github.com/pablofelipe/dealapp/actions/workflows/firebase-hosting.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Progressive Web App that connects neighborhood merchants to nearby customers: merchants publish
time-limited deals, customers discover them by proximity and redeem coupons in-store. Serverless on
Firebase, no backend to operate beyond Cloud Functions.

![Landing page](frontend/static/radar-hero.png)

## Problem

Small neighborhood merchants have no low-friction way to advertise short-lived offers (a batch of
fresh bread, a slow-moving product) to people who are physically close enough to act on them today.
Radar da Oferta gives merchants a two-field, AI-assisted publishing flow and gives customers a
proximity-ranked feed with server-guaranteed stock (no overselling, no double-redeemed coupons).

## Product surfaces

- **Customer PWA** (`frontend/public/`, served at `/app`) — browse nearby deals, generate coupons,
  receive push notifications for new offers in chosen categories. Installable, works offline for
  already-cached content.
- **Merchant panel** (`frontend/merchant/`, served at `/painel`) — register a store, publish offers
  (with AI-assisted description/category/pricing), validate and redeem customer coupons, track
  redemption stats.
- **Landing page** (`frontend/index.html`) — public acquisition page.

## AI-assisted offer creation

Publishing a good offer is the merchant's biggest friction point, so the merchant panel delegates it
to a multimodal AI step (`processOfferWithAI`, an HTTP Cloud Function):

1. The merchant uploads a product photo and types only the title and the promotional price.
2. The function sends the image and the two fields to **Gemini** (`gemini-flash-latest`).
3. The model returns structured JSON: a short marketing description, the product category
   (constrained to the app's category taxonomy), a suggested original price, and the computed
   discount percentage.
4. If the model call fails or no API key is configured, a deterministic fallback fills the same
   fields, so the publishing flow never blocks on the AI.

The Gemini API key is stored as a Cloud Functions secret (`GEMINI_API_KEY`) — it never ships to the
client or the repository.

## Features

- Google sign-in (Firebase Auth)
- Location-based deal discovery via geohash bounding-box queries (`geofire-common`), not a full
  collection scan
- Server-authoritative coupon generation and redemption (Cloud Functions + Firestore transactions —
  no overselling, no double redemption, verified under concurrency against the Firestore Emulator)
- AI-generated offer descriptions and categorization (Gemini, multimodal)
- Push notifications on new deals, segmented by category topic (FCM)
- Installable PWA with offline caching (service worker + manifest)
- Firestore and Storage security rules with owner-based authorization, deployed via CI

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript, Vite (multi-page build), PWA (service worker, manifest) |
| Frontend tests | Vitest + jsdom (domain logic, component rendering) |
| Backend | Firebase Cloud Functions (Node.js 20) — TypeScript for the coupon/domain layer, JavaScript for the older notification/AI functions (see [Architecture](docs/architecture-review.md)) |
| Backend tests | Vitest — unit (domain layer) + integration against the Firestore Emulator (concurrency) |
| AI | Gemini (`gemini-flash-latest`) via `@google/generative-ai`, multimodal |
| Data | Cloud Firestore (rules + composite indexes), Firebase Storage |
| Auth | Firebase Authentication (Google) |
| Messaging | Firebase Cloud Messaging (topic-based) |
| Hosting & CI | Firebase Hosting, GitHub Actions (builds and deploys rules + hosting on every push to `main`; Cloud Functions deploy is manual — see [Setup guide](docs/setup.md)) |

## Project structure

```text
dealapp/
├── frontend/                # Vite project: builds all three static surfaces below
│   ├── public/               # Customer PWA source (TypeScript)
│   ├── merchant/             # Merchant panel source (TypeScript)
│   ├── shared/                # Domain logic shared by both frontends (expiry/status rules)
│   ├── static/                 # Unhashed passthrough assets: service workers, manifests, icons
│   └── index.html, 404.html    # Landing page and 404 page (also built by Vite)
├── functions/                # Cloud Functions (Node.js 20)
│   ├── index.js                # Deployed entry point (see Architecture doc for why it's JS + TS)
│   └── src/                    # TypeScript domain/application/callable layer for coupons
├── firestore.rules           # Firestore security rules (owner-based access control)
├── firestore.indexes.json    # Firestore composite indexes
├── storage.rules             # Storage security rules (merchant-scoped uploads)
├── docs/                     # Architecture review, setup/validation guide, PWA feature notes
└── .github/workflows/         # CI: builds functions + frontend, deploys rules + hosting on push
```

## Running locally

See the [Setup guide](docs/setup.md) for the full from-clean-machine walkthrough, including Firebase
project configuration, the Emulator Suite, and a step-by-step functional validation flow (register a
merchant, publish a deal, generate and redeem a coupon). Short version:

```bash
cd functions && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
firebase emulators:start
```

- Customer PWA: http://localhost:5000/app (or `/public/index.html`)
- Merchant panel: http://localhost:5000/painel (or `/merchant/index.html`)

## Testing

```bash
cd functions && npm test     # Vitest: domain unit tests + Firestore Emulator integration tests
cd frontend && npm test      # Vitest + jsdom: domain logic + component rendering
```

Neither suite currently runs in CI as a deploy gate (see [Architecture review](docs/architecture-review.md),
known limitations) — both are run manually before a deploy today.

## Deploy

Pushes to `main` build both packages and deploy Firestore rules + Hosting automatically through
GitHub Actions (`.github/workflows/firebase-hosting.yml`). Cloud Functions deploy is manual:

```bash
firebase deploy --only functions
```

## Architecture and documentation

- [`docs/architecture-review.md`](docs/architecture-review.md) — architecture overview, diagrams,
  the trade-offs behind every non-obvious technical decision, resolved findings, and the roadmap
  (implemented / planned / explicitly out of scope / accepted tech debt).
- [`docs/setup.md`](docs/setup.md) — setup from a clean machine, Firestore data model, and a full
  functional validation walkthrough.
- [`docs/pwa-features.md`](docs/pwa-features.md) — PWA capabilities: what's implemented, what isn't,
  and how to test each one.

## Contributing

There's no separate contribution guide yet — the working agreement is: write a failing test before
the implementation for any non-trivial change, keep business rules in the domain layer
(`functions/src/domain/`, `frontend/shared/domain/`) rather than in UI/infrastructure code, and run
both test suites (`functions/`, `frontend/`) before opening a change. See
[`docs/architecture-review.md`](docs/architecture-review.md) for the reasoning behind the current
module boundaries before restructuring them.

## License

Licensed under the [Apache License 2.0](LICENSE).
