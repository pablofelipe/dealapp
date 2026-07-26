# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/) starting from this, its first tagged release.

## [Unreleased]

## [0.1.0] - 2026-07-26

First tagged release. No prior versions were ever published — this entry summarizes the project's
state at this point, not just changes since a previous tag.

### Added
- Server-authoritative coupon generation and redemption: `generateCoupon`/`redeemCoupon` Cloud
  Functions run inside real Firestore transactions, verified under concurrency against the
  Firestore Emulator (no overselling, no double redemption).
- Domain layer for coupon/deal invariants (`functions/src/domain/`), with the client-side
  duplication of expiry/status logic consolidated into `frontend/shared/domain/`.
- Real geo-proximity search: `geofire-common` geohash bounding-box queries replace a full
  `deals` collection scan.
- AI-assisted offer creation (`processOfferWithAI`): photo + title + price in, a marketing
  description/category/suggested price/discount out, via Gemini (`gemini-flash-latest`), with a
  deterministic fallback so publishing never blocks on the AI call.
- Push notifications on new deals, segmented by category topic (Firebase Cloud Messaging).
- Full TypeScript conversion of both frontends (`frontend/public/`, `frontend/merchant/`), built
  by Vite, with real ESLint coverage (`typescript-eslint`) for the first time.
- Test suites: Vitest unit + Firestore Emulator integration tests in `functions/` (23 + 8 tests);
  Vitest + jsdom domain-logic and component-rendering tests in `frontend/` (53 tests, including
  the pure card-rendering functions `createDealCard`/`createCouponCard`/`createDealItem`).
- CNPJ validation now supports Receita Federal's alphanumeric CNPJ format (letters allowed in the
  first 12 positions), consolidated into a single, shared, TDD'd implementation
  (`frontend/shared/domain/cnpj.ts`) used by all three call sites that previously each carried a
  near-identical, numeric-only copy.
- CI (`.github/workflows/firebase-hosting.yml`) now lints and runs both test suites before
  building and deploying — a red test suite blocks the deploy.

### Changed
- Firestore rules: client writes to `coupons` blocked entirely; `deals.stockAvailable` only
  writable by the deal's own merchant.
- Storage rules: uploads scoped to the uploading merchant's own path
  (`deals/{merchantId}/{fileName}`, checked against `request.auth.uid`).
- Customer PWA manifest: `start_url`/`scope` corrected so installing the app and reopening it
  from the home screen lands on the deals feed, not the landing page.
- Both manifests now reference a real `icon-512.png` (generated from a native 310px asset already
  present in the repo, not upscaled from the 192px icon) instead of a dead reference to a file
  that never existed.
- `frontend/static/public/sw.js`'s install-time precache list now references real, stable, unhashed
  asset paths instead of pre-Vite paths that no longer exist in the build output.
- Both `firebase-config.ts` files now call `connectFunctionsEmulator`, so `generateCoupon`/
  `redeemCoupon` invoked from a locally running app hit the Functions emulator instead of the
  real deployed functions and production Firestore.

### Fixed
- The only correct, transactional coupon/stock implementation existed in the codebase but was
  never wired into what actually deployed — Cloud Functions ran a client-writes-directly flow
  with no atomicity guarantee instead.
- Two diverging copies of Firestore rules/indexes existed; only one was ever actually deployed,
  and setup docs pointed at the unused one.
- Flash deals (`isUnlimited: true` with a real 24h `expiresAt`) never actually expired in the
  customer feed; the merchant dashboard silently excluded deals with no `expiresAt` from the
  "active deals" count. Both surfaced and fixed while consolidating the duplicated expiry logic.
- `enableNotifications` (customer PWA) returned `undefined` on its success path because an inner
  `const token` shadowed the outer variable meant to hold the fetched FCM token.
- Two competing `updateMerchantInfo` definitions in the merchant panel (the second always won
  silently); dead code referencing a nonexistent `create-deal-form`/`handleCreateDealSubmit` pair
  and a `closeAllModals` function that never existed anywhere.
- Root `eslint.config.mjs` produced hundreds of false-positive errors linting compiled Cloud
  Functions output and never covered the frontend's TypeScript at all; `functions/`'s own lint
  config silently resolved zero files whenever the root's flat config was also present.

### Security
- Firestore and Storage rules hardened and covered by rules-unit-testing against the emulator
  (see Changed, above).

### Known limitations (see `docs/architecture-review.md` for the full, current list)
- Six Cloud Functions (`processOfferWithAI`, `manageSubscription`, `onNewDealNotify`,
  `testNotification`, `checkTopicStatus`, `debugTokenInfo`) remain plain JavaScript, outside the
  TypeScript tree used by `generateCoupon`/`redeemCoupon` — a permanent decision, not a gap.
  `createDeal`/`updateStock` were dropped rather than made server-authoritative, also permanent.
- One Vite output chunk (`coupon-*.js`) is ~527KB, above Vite's 500KB warning threshold; no
  code-splitting applied yet.
- `frontend/static/public/sw.js`'s registration stays commented out in `frontend/public/index.html`
  by design — no app-shell precache runs in production today.
