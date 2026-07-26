# Setup, Execution and Validation Guide — Radar da Oferta

This guide covers three separate things: getting the project running locally from a clean machine,
understanding the Firestore data model, and functionally validating that the system works end to
end. For the architecture and the trade-offs behind each decision, see
[`architecture-review.md`](architecture-review.md).

## About this project's infrastructure

This is a serverless project built on Firebase: no containers, no orchestration, no message queue.
Because of that, items common in other stacks don't apply here:

- **Docker Compose / Kubernetes** — none exist. Hosting, Firestore, Auth, Storage and Cloud Functions
  are managed services; the only local "orchestrator" is the Firebase Emulator Suite.
- **RabbitMQ / message queue** — none exists. The only asynchronous communication is the push
  notification triggered by a Firestore trigger (`onNewDealNotify`, see Architecture).
- **Prometheus / Grafana** — neither exists. Observability is done through Cloud Logging
  (`firebase functions:log` or the Firebase/GCP Console), there is no dedicated metrics stack.
- **Swagger/OpenAPI/Postman** — none exist. The only traditional HTTP endpoint is
  `processOfferWithAI`; the rest of the API surface is Firebase SDK callables (`generateCoupon`,
  `redeemCoupon`, `manageSubscription`, etc.), which aren't REST and don't document well in OpenAPI.
  They're described in the "Cloud Functions" section below instead.

## Prerequisites

- Node.js 20 (matches `functions/package.json`'s `engines`)
- A Firebase account and project, on the **Blaze plan** (Cloud Functions and Gemini require billing
  enabled, even if usage stays within the free tier)
- Firebase CLI: `npm install -g firebase-tools`

## 1. Clone and configure the Firebase project

```bash
git clone https://github.com/pablofelipe/dealapp.git
cd dealapp
firebase login
```

`.firebaserc` is gitignored (each clone points at its own Firebase project) — create yours:

```bash
firebase use --add
# pick or create a project in the Console and give it an alias, e.g. "default"
```

In the Console, enable: **Authentication → Sign-in method → Google**, and **Cloud Firestore** and
**Cloud Storage** (production mode — the rules in this repo handle access control).

## 2. Configure the frontend credentials

Both frontends (`frontend/public/js/firebase-config.ts` and
`frontend/merchant/js/firebase-config.ts`) have the Firebase Web config **hardcoded in source**.
That's intentional, not an oversight: a Firebase Web app's `apiKey` is public by design — real
security is enforced by the Firestore/Storage rules, not by hiding this key (see
`architecture-review.md`). To point at your own project, replace the `firebaseConfig` object in both
files with your Web app's config (Console → Project settings → Your apps).

## 3. Install dependencies and build

```bash
cd functions && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
```

**Important:** `firebase emulators:start` and `firebase serve` do **not** run the `predeploy` hooks
declared in `firebase.json` — they serve whatever is already in `frontend/dist`. If you change
anything under `frontend/`, rerun `npm run build` before reloading the emulator.

## 4. Configure the Gemini secret (optional to run locally)

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Skipping this step doesn't break anything: `processOfferWithAI` falls back to a deterministic
description/category/price generator (see Architecture). Only set this if you want to exercise the
real AI call.

## 5. Start the Emulator Suite

```bash
firebase emulators:start
```

| Service | Port |
|---|---|
| Hosting | 5000 |
| Firestore | 8080 |
| Auth | 9099 |
| Storage | 9199 |
| Functions | 5001 |
| Emulator UI | (printed to the console on startup) |

- Customer PWA: `http://localhost:5000/app` (or `/public/index.html`)
- Merchant panel: `http://localhost:5000/painel` (or `/merchant/index.html`)

Both `firebase-config.ts` files detect `localhost`/`127.0.0.1` and connect Firestore/Auth/Storage to
the emulator automatically. **This does not apply to Functions** — neither file calls
`connectFunctionsEmulator`. In practice, `generateCoupon`/`redeemCoupon` calls made from the app
running locally go to the Cloud Functions **already deployed to the real project**, not to the
Functions emulator. See "Troubleshooting" below for the impact this has on functional validation.

## 6. Manual deploy (outside CI)

```bash
firebase deploy --only firestore:rules   # CI already does this on every push to main
firebase deploy --only firestore:indexes
firebase deploy --only hosting            # CI already does this on every push to main
firebase deploy --only functions          # not automated — always manual
```

## Running the tests

```bash
cd functions && npm test      # unit (domain) + integration against the Firestore Emulator
cd frontend && npm test       # domain logic + component rendering (Vitest + jsdom)
```

`functions`'s `test:emulator` spins up the Firestore/Storage emulator itself via
`firebase emulators:exec` — you don't need `emulators:start` already running in another terminal.

---

## Data model (Firestore)

### `merchants/{uid}`

Written by `frontend/merchant/js/merchant.ts::saveMerchantProfile` during merchant registration.

```ts
{
  cnpj: string,
  businessName: string,
  tradingName: string,
  category: string,
  phone: string,
  businessHours: string,
  location: {
    address: string, number: string, complement: string, neighborhood: string,
    city: string, state: string, cep: string, fullAddress: string,
    latitude: number, longitude: number, geohash: string,
    deliveryRadius: number, deliveryOptions: string[],
  },
  contact: { responsibleName: string, responsibleEmail: string, responsiblePhone: string },
  userId: string, userEmail: string,
  status: 'active',
  isVerified: boolean,
  createdAt: Timestamp, updatedAt: Timestamp,
  stats: { totalDeals: number, totalCoupons: number, totalRevenue: number, lastDealDate: Timestamp | null },
}
```

### `deals/{dealId}`

Written by `frontend/merchant/js/deals.ts::createDeal`. `merchantLocation` is copied from the
merchant document at creation time (not a live reference).

```ts
{
  title: string, description: string,
  originalPrice: number, dealPrice: number, discount: number,
  stockTotal: number, stockAvailable: number, isUnlimited: boolean,
  category: string,
  merchantId: string, merchantName: string, merchantCategory: string, merchantPhone: string,
  merchantLocation: {
    address: string, number: string, complement: string, neighborhood: string,
    city: string, state: string, cep: string, fullAddress: string,
    latitude: number, longitude: number, geohash: string,
    deliveryRadius: number, deliveryOptions: string[],
  },
  imageUrl: string,
  expiresAt: Timestamp, createdAt: Timestamp,
  status: 'active' | 'paused',
  views: number, couponsGenerated: number, couponsRedeemed: number, revenueGenerated: number,
}
```

`stockAvailable` and the coupon counters are only mutated by the Cloud Functions
(`generateCoupon`/`redeemCoupon`, Admin SDK) — the Firestore rules block this write from the client.

### `coupons/{couponId}`

Created entirely by the `generateCoupon` Cloud Function (the client never writes to this collection
— see `firestore.rules`).

```ts
{
  code: string,           // 6 digits
  dealId: string, userId: string,
  status: 'pending' | 'active' | 'urgent' | 'redeemed' | 'expired',
  generatedAt: Timestamp, expiresAt: Timestamp, redeemedAt: Timestamp | null, redeemedBy: string | null,
  dealTitle: string, dealPrice: number,
}
```

`active`/`urgent`/`expired` are derived at runtime from `expiresAt` and `status`
(`frontend/shared/domain/coupon.ts::getCouponStatus`) — only `pending` and `redeemed` are actually
persisted.

### `users/{uid}`

A partial document: different fields are written by the client (profile/preferences) and by the
`redeemCoupon` Cloud Function (savings statistics).

```ts
{
  // Written by the client (auth/profile/notification preferences)
  email: string, displayName: string, photoURL: string,
  notificationsEnabled: boolean, fcmToken: string | null, subscribedTopics: string[],
  // Written by the redeemCoupon Cloud Function (Admin SDK)
  totalSavings: number, dealsPurchased: number, lastActivity: Timestamp,
}
```

---

## Cloud Functions (what each one does)

| Function | Type | Runtime | Description |
|---|---|---|---|
| `generateCoupon` | `onCall` (v1) | TypeScript (`functions/src`) | Generates a coupon for a deal inside a transaction that decrements `stockAvailable`. |
| `redeemCoupon` | `onCall` (v1) | TypeScript (`functions/src`) | Redeems a coupon inside a transaction that marks it `redeemed` and credits `totalSavings`/`dealsPurchased` on the user. |
| `processOfferWithAI` | `onRequest` (v2, HTTP+CORS) | JavaScript (`functions/index.js`) | Takes a photo + title + price, calls Gemini (`gemini-flash-latest`), returns description/category/suggested price/discount. Deterministic fallback if the AI call fails or the secret isn't configured. |
| `manageSubscription` | `onCall` (v1) | JavaScript | Subscribes/unsubscribes an FCM token to a category topic. |
| `onNewDealNotify` | Firestore trigger (`onCreate` on `deals/{dealId}`) | JavaScript | Sends a push notification to the category topic of the newly created deal. |
| `testNotification` | `onCall` (v1) | JavaScript | Sends a test notification to a specific token (debug). |
| `checkTopicStatus` | `onCall` (v1) | JavaScript | Checks whether a token is subscribed to a topic (debug). |
| `debugTokenInfo` | `onCall` (v1) | JavaScript | Returns metadata for an FCM token (debug). |

`generateCoupon`/`redeemCoupon` are the only ones ported to TypeScript — see
[`architecture-review.md`](architecture-review.md) for why the other six remain JavaScript (accepted
tech debt, not an oversight).

---

## Functional validation guide

A step-by-step walkthrough to exercise the whole system manually, against the **real Firebase
project** (not the emulator — see the Functions caveat above). Run `firebase deploy` (rules +
hosting + functions) first, or use the production URL if it's already deployed.

### As a merchant (`/painel`)

1. **Sign in** — click "Sign in with Google". With no prior registration, you land on the
   registration screen.
2. **Register the store** — fill in the CNPJ (valid — the form checks the verification digits), the
   full address, and business hours. The address is geocoded on submit; addresses that fail to
   geocode block registration with an explicit error.
3. **Publish a deal** — under "New Deal": upload a product photo, fill in only the title and the
   promotional price, and watch the AI fill in description/category/original price/discount (or the
   deterministic fallback, if `GEMINI_API_KEY` isn't configured). Adjust if needed, set stock (or
   "unlimited stock") and a future expiry date, publish.
4. **Validate a coupon** — under "Validate Coupon", type the 6-digit code generated on the customer
   side (step 3 below) and confirm the redemption.
5. **Check the stats** — the "Stats" tab should reflect the redeemed coupon (active deals, coupons
   generated/redeemed).

### As a customer (`/app`)

1. **Sign in** — Google sign-in.
2. **Grant location** — the app asks for the browser's position to rank deals by proximity; denying
   it still shows the feed, just unsorted by distance.
3. **Generate a coupon** — open a deal published by the merchant above and generate a coupon. Note
   the 6-digit code.
4. **Check the coupon's status** — under "My Coupons", the coupon should show as active/urgent
   (depending on how close it is to expiring), then switch to "redeemed" once the merchant redeems
   it in step 4 above.
5. **Enable notifications** — under the profile tab, enable notifications and pick categories of
   interest; publishing a new deal in the same category (another merchant, or the same one) should
   trigger a push notification (`onNewDealNotify`).

### Error cases worth validating deliberately

- Generate a second coupon for a deal whose `stockAvailable` is already `1` and taken by another
  user — should fail with `failed-precondition`, never oversell (this is exactly what the emulator
  integration tests assert).
- Try to redeem the same coupon twice — the second attempt should fail.
- Try to redeem an expired coupon — should fail with an expiration-specific message.
- As a merchant, try to edit `stockAvailable` directly from another merchant's panel (or via the
  Firestore Rules Playground) — should be denied by the rules.

---

## Troubleshooting

Real problems encountered during this project's development, not hypothetical ones.

**Symptom:** `firebase emulators:start` comes up fine, but coupons generated locally never show up
in the Firestore Emulator UI, and the merchant panel can't find the deal when redeeming.
**Cause:** `generateCoupon`/`redeemCoupon` are called via `httpsCallable`, and neither
`firebase-config.ts` calls `connectFunctionsEmulator`. The calls go to the Cloud Functions already
deployed to the real project, which read/write the production Firestore, not the local emulator.
**How to identify it:** the deal created locally (in the emulator) simply doesn't exist from the real
function's point of view, which responds with `DEAL_NOT_FOUND`.
**Fix:** to test the coupon flow end to end against the emulator, use `firebase functions:shell`
(calls the functions locally) instead of the app running in the browser, or add
`connectFunctionsEmulator(functions, 'localhost', 5001)` to both `firebase-config.ts` files while
testing locally.

**Symptom:** the Vite build fails with `Failed to resolve import "../../shared/domain/deal.js" from
"merchant/js/deals.js"` (during a `.js`-to-`.ts` migration).
**Cause:** Vite's `.js` → `.ts` extension resolution only works when the **importing** file is
already `.ts`. If the importer is still `.js`, it never finds the matching `.ts` file.
**Fix:** convert files in dependency order (leaves first), never in arbitrary order.

**Symptom:** `Emulators: Error: read ECONNRESET`, or `esbuild`/`vitest` failing to load config, with
a 0-byte `jsconfig.json` at the repo root.
**Cause:** an empty `jsconfig.json` breaks esbuild's config resolution (used under the hood by
Vitest).
**Fix:** make sure `jsconfig.json` has at least `{}` in it.

**Symptom:** `generateCoupon`/`redeemCoupon` keep the old behavior even after a deploy.
**Cause:** `functions/package.json`'s `main` is `index.js`, and that file only exports the two
functions with the latest behavior if `require('./lib/callable/coupons')` points at freshly compiled
output — if `npm run build` didn't run before the deploy, `functions/lib/` is stale.
**How to identify it:** compare the timestamp of `functions/lib/callable/coupons.js` against the last
edit to `functions/src/callable/coupons.ts`.
**Fix:** `firebase.json`'s `predeploy` already runs `npm run build` before `firebase deploy`, but
calling `functions:shell`/running local tests doesn't trigger that automatically — run
`npm run build` manually first.

**Symptom:** `processOfferWithAI` always responds with the deterministic fallback, never with
actual AI-generated text.
**Most common causes, in order of frequency:** (1) `GEMINI_API_KEY` isn't configured — expected,
not a bug; (2) the key was generated from the wrong product (Vertex AI Express Mode or a Firebase
key, not a Google AI Studio key) — the Generative Language API rejects it with
`API_KEY_SERVICE_BLOCKED`; (3) a deprecated model name (`gemini-2.0-flash`/`gemini-2.5-flash` have
both already returned 404 "no longer available" on this project) — using the `gemini-flash-latest`
alias avoids having to track deprecations manually; (4) a stale secret — after running
`firebase functions:secrets:set`, the functions need to be redeployed for the new secret version to
take effect (Firebase warns "functions are using stale version of secret" on the prior deploy).
**How to identify it:** `firebase functions:log` shows the specific error from the Gemini call.

**Symptom:** the customer PWA's service worker (`frontend/static/public/sw.js`) fails silently on
install, or never populates the expected cache.
**Cause:** the file's `urlsToCache` array lists non-hashed paths (`/js/app.js`, `/css/styles.css`)
that only existed before the Vite migration. The current build produces content-hashed filenames
(`/assets/customer-<hash>.js`), so those literal paths no longer exist in `dist/`, and
`cache.addAll()` rejects the whole promise if any URL in the list fails to fetch.
**Status:** known limitation, not fixed as part of this documentation pass — this specific SW's app
shell precache is effectively broken since the migration; real offline behavior today relies on the
browser's HTTP cache for the hashed assets, not on this manual precache.

**Symptom:** ESLint (`npx eslint .` at the repo root) returns hundreds of errors in
`functions/lib/*.js`.
**Cause:** `eslint.config.mjs` at the root only covers `**/*.{js,mjs,cjs}` and doesn't ignore the
compiled output directory `functions/lib/`. Additionally, after the full TypeScript migration of the
frontend, **there is no lint configuration covering `.ts` files at all** in `frontend/` — the root
ESLint config never touched those files, even before the migration.
**Status:** known limitation. Running lint today doesn't validate the actual frontend source.
