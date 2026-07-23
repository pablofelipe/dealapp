# Architecture Review — Radar da Oferta (dealapp)

Status: **findings 1-4 implemented** (server-authoritative coupon/stock flow, domain layer in
Cloud Functions, Firestore config cleanup — see the note at the top of each finding below and
`functions/src/`). **Findings 5-8 remain open.**
Scope: `public/` (customer PWA), `merchant/` (merchant panel), `functions/` (Cloud Functions),
Firestore/Storage security configuration, CI.

This document records the findings from an initial architectural pass, the reasoning behind each
recommendation, and a phased roadmap the team has agreed to. It is meant to be read before touching
the coupon/deal/stock flows or the Cloud Functions entry point, since several of the findings are not
visible from reading any single file in isolation.

## Executive summary

| # | Finding | Severity | Category | Status |
|---|---|---|---|---|
| 1 | Stock/coupon mutation is client-authoritative with no real transaction | P0 | Correctness / trust boundary | **Fixed** |
| 2 | The only transactional, server-side coupon logic exists but is never deployed | P0 | Dead code / architectural drift | **Fixed** |
| 3 | Firestore rules and indexes exist in two diverging copies; only one is live | P0 | Configuration risk | **Fixed** |
| 4 | Domain model is anemic; business rules live inline in DOM-manipulating code | P1 | DDD violation | **Fixed** (in `functions/`; frontends still open, see #5) |
| 5 | Both frontends have no build pipeline, no TypeScript, no test runner | P1 | TDD enabler / foundational | Open |
| 6 | Geo-proximity data (`geohash`) is written but never queried; declared dependency unused | P2 | Dead data modeling | **Fixed** |
| 7 | No test suite anywhere in the repository | P1 | TDD enabler | **Fixed** for `functions/` and pure logic in both frontends; component/DOM testing open |
| 8 | Storage rules allow any authenticated user to write to any path | P2 | Security hardening | **Fixed** |

Findings 1 and 2 are two faces of the same problem and should be fixed together: the codebase already
contains the correct fix, it is simply not wired into what actually runs in production.

---

## Finding 1 — Stock/coupon mutation is client-authoritative

> **Resolved.** `public/js/coupons.js::generateCoupon` and `merchant/js/coupons.js::confirmRedemption`
> now call the `generateCoupon`/`redeemCoupon` Cloud Functions instead of writing to Firestore
> directly. See Finding 2 for the implementation, and `firestore.rules` for the tightened rules
> (client can no longer write `coupons` or decrement `deals.stockAvailable`). The description below is
> kept as the historical record of the bug found.

**Where:** `public/js/coupons.js` (`generateCoupon`, lines 18–86); the primary (active) path in
`merchant/js/coupons.js` above `confirmRedemptionCloudFunction`.

**What happens today:** the browser reads the `deals` document, checks `stockAvailable` and
`expiresAt` client-side, generates a coupon code with `Math.random()`, then performs two independent
writes — `addDoc` on `coupons` and `updateDoc({ stockAvailable: increment(-1) })` on `deals` — with no
`runTransaction` wrapping them. Firestore security rules only constrain the *shape* of each write in
isolation:

```
// firestore.rules
match /deals/{dealId} {
  allow update: if isAuthenticated() &&
                   (resource.data.merchantId == request.auth.uid ||
                    request.resource.data.stockAvailable == resource.data.stockAvailable - 1);
}
match /coupons/{couponId} {
  allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
}
```

Neither rule references the other collection. A client can decrement `stockAvailable` without ever
creating a coupon, create a coupon without decrementing stock, or two concurrent requests can both
read `stockAvailable: 1`, both pass the rule (each computes `1 - 1 = 0` independently), and both
succeed — overselling stock. There is also no server-side verification that the six-digit code is
unique or that the deal was actually still active at write time beyond the client's own (spoofable)
read.

**Why this matters (technical justification):** stock and coupon issuance are exactly the kind of
invariant DDD calls an *aggregate boundary* — "a coupon may only exist if stock was atomically
decremented for it" must be enforced by a single transactional writer, not by two rules that each see
half the picture. Firestore security rules can express cross-document invariants (via `get()`/`exists()`
inside the rule, or by denying direct writes to derived fields entirely), but the robust way to do this
is a single server-side transaction that is the *only* writer of `stockAvailable`.

**Recommendation:** move coupon issuance and redemption to be server-authoritative:
- The client calls a Cloud Function (see Finding 2 — this already exists in `functions/src/index.ts`
  and just needs to be the thing that actually deploys).
- Firestore rules stop allowing direct client writes to `stockAvailable` and to `coupons.status`; only
  the Functions service account (via Admin SDK, which bypasses rules) may write them.
- The function wraps the stock check + decrement + coupon creation in `admin.firestore().runTransaction`.

**Trade-offs:**
- *Benefit:* correctness — no overselling, no forged coupons, single source of truth for the invariant.
- *Cost:* one network round-trip through a callable function instead of an optimistic local write; the
  UI needs a loading state it may not have today. This is a small UX cost relative to the correctness
  gained, and the app already does a Firestore read before writing, so the perceived latency delta is
  modest.
- *Complexity:* low — the transactional logic already exists (Finding 2), this is largely a wiring and
  rules-tightening change, not new design.

**When it would *not* be worth it:** if stock/coupon counts were purely cosmetic (no real scarcity or
fraud concern). They are not here — stock is a real constraint tied to a physical, single-redemption
coupon, so server-side enforcement is warranted, not over-engineering.

---

## Finding 2 — The correct server-side implementation exists but never deploys

> **Resolved.** The old `functions/src/index.ts` (with the bugs described below — read-outside-
> transaction, non-transactional `redeemCoupon`, mismatched returned coupon id) was replaced, not
> reused as-is. New implementation: `functions/src/domain/{Deal,Coupon,couponCode}.ts` (pure domain
> logic, unit-tested), `functions/src/application/couponService.ts` (the real
> `db.runTransaction(...)` orchestration, integration-tested against the Firestore Emulator),
> `functions/src/callable/coupons.ts` (the `onCall` wrappers). `createDeal`/`updateStock` were dropped,
> not ported (see the roadmap note at the end of this finding). `functions/index.js` now requires and
> re-exports the compiled `generateCoupon`/`redeemCoupon`. The description below is kept as the
> historical record of what was found.

**Where:** `functions/src/index.ts` (compiles to `functions/lib/index.js`, gitignored) vs.
`functions/index.js` (plain JS, the real entry point).

`functions/package.json` sets `"main": "index.js"`. `functions/index.js` requires only
`firebase-functions`, `firebase-admin`, `firebase-functions/v2/https`, `firebase-functions/logger`, and
`@google/generative-ai` — it never requires anything from `./lib`. Meanwhile `functions/src/index.ts`
defines `generateCoupon`, `redeemCoupon`, `createDeal`, and `updateStock`, each using
`admin.firestore().runTransaction` correctly. None of these four functions are ever registered with
Cloud Functions, because nothing imports `lib/index.js`'s exports into `index.js`.

This is confirmed by `merchant/js/coupons.js`: it defines an *active* redemption path (direct Firestore
writes, reached by the real UI) and a second, unreferenced function
`window.confirmRedemptionCloudFunction` that calls `httpsCallable(functions, 'redeemCoupon')` — a
function name that, per the above, does not exist in the deployed Functions. If anything ever called
this path, it would fail at runtime with "function not found."

**Why this matters:** this is architectural drift — a past migration to TypeScript/Cloud Functions was
started, is functionally correct, and was silently abandoned in favor of client-side writes, without
removing the dead code. Anyone reading `functions/src/*` today reasonably assumes it is what runs in
production; it is not. This is exactly the kind of non-obvious risk that costs real debugging time.

**Recommendation:** pick one source of truth and delete the other.
- Given Finding 1's remediation requires exactly this transactional logic, **promote
  `functions/src/index.ts` to be the deployed code**: either point `functions/package.json`'s `main`
  at the compiled output (with `build` actually running `tsc`, unlike today's no-op script), or port
  `functions/index.js`'s currently-deployed functions (`processOfferWithAI`, `manageSubscription`,
  `onNewDealNotify`, `testNotification`, `checkTopicStatus`, `debugTokenInfo`) into the TypeScript
  source tree and retire `functions/index.js` entirely.
- Delete the dead `window.confirmRedemptionCloudFunction` path in `merchant/js/coupons.js` once the
  real redemption flow is server-authoritative (it becomes the *only* path, not a second one).

**Trade-offs:** consolidating to a single TypeScript entry point costs one afternoon of careful,
test-covered migration (see the P0/P1 roadmap below) but removes an entire class of "which file is
real" confusion for every future change to Functions.

**What actually shipped (see resolution note above):** `functions/index.js` keeps the six original
JS exports untouched and additionally requires the compiled `generateCoupon`/`redeemCoupon` from
`functions/lib/callable/coupons.js` — a smaller, lower-risk change than a full migration of the six
stable functions to TypeScript, which remains open as tech debt. `createDeal`/`updateStock` were not
ported: they were unused by any client, had no real admin check (just a `// TODO`), and `createDeal`'s
shape didn't match what `merchant/js/deals.js::createDeal()` actually writes (missing
`merchantLocation`, `geohash`, etc.). Revisit as separately scoped work if server-authoritative deal
creation is ever needed. `window.confirmRedemptionCloudFunction` (the dead duplicate path) was deleted.

---

## Finding 3 — Firestore rules/indexes exist in two diverging copies

> **Resolved.** The stale `firestore/` directory was deleted and `docs/setup.md` now points at the
> root files.

**Where:** `firestore.rules` / `firestore.indexes.json` (repo root) vs. `firestore/firestore.rules` /
`firestore/firestore.indexes.json`.

`firebase.json` points `firestore.rules`/`firestore.indexes.json` at the **root** files, and
`.github/workflows/firebase-hosting.yml` deploys rules from that same root path on every push to
`main`. The `firestore/` copies are not referenced by any config and are never deployed — yet they
contain materially different rules (e.g. a more restrictive `users` read rule, a different
`merchants` write rule) and `docs/setup.md` explicitly instructs readers to edit the *unused* copy:

```
### 4. Configurar Firestore
As regras e índices já estão configurados em:
- `firestore/firestore.rules`
- `firestore/firestore.indexes.json`
```

**Why this matters:** a developer who "tightens" `firestore/firestore.rules` in response to a security
review will believe production is now safer when nothing changed. This is a live foot-gun.

**Recommendation:** delete the `firestore/` copies (or, if they represent an intended future rule set,
make that explicit and diff it against root before ever adopting it), and fix `docs/setup.md` to point
at the root files.

**Trade-offs:** none of substance — this is pure cleanup with no functional cost.

---

## Finding 4 — Anemic domain model

> **Resolved for the coupon/stock invariants covered by Findings 1-2**, specifically:
> `functions/src/domain/Deal.ts` (`reserveStock()`, `isExpired()`, `savings()`) and
> `functions/src/domain/Coupon.ts` (`canBeRedeemedBy()`, `redeem()`), both unit-tested in isolation.
> `functions/src/models/{Coupon,Deal}.ts` remain as plain DTOs for the Firestore persistence shape —
> the split is intentional (see recommendation below). The client-side status derivation in
> `public/js/coupons.js` (`getStatusLogic`) is display-only logic (labelling a coupon as
> active/urgent for the UI) and was left as-is; it does not enforce any invariant the server doesn't
> already enforce independently.

**Where:** `functions/src/models/Coupon.ts`, `functions/src/models/Deal.ts` (plain data interfaces,
no behavior); business rules duplicated inline in `public/js/coupons.js` (`getStatusLogic`, lines
139–153) and scattered across `deals.js` in both `public/` and `merchant/`.

Status derivation (`active` / `urgent` / `expired` / `redeemed`), stock/expiry validation, and discount
computation are implemented as free functions mixed into UI code, with no single place that owns "what
makes a coupon valid" or "what makes a deal purchasable." The TypeScript models are DTOs, not
aggregates — they carry no invariants or behavior of their own.

**Recommendation:** once Finding 2 lands (TypeScript is the deployed Functions runtime), introduce
`Coupon` and `Deal` as small domain classes with the invariants as methods (`Coupon.redeem()`,
`Deal.reserveStock()`), used by the Cloud Function application layer. Do **not** attempt this in the
two frontends until Finding 5's build pipeline exists — there is no way to share a domain class between
a TypeScript Cloud Function and an unbundled browser ES module today.

**Trade-offs:** this is the highest-value, lowest-risk DDD investment in the codebase, because
TypeScript and a package boundary already exist in `functions/`. Doing it here first — before the
frontends — avoids the anti-pattern of introducing domain layers in a place that can't yet support them
(the frontends, per Finding 5).

---

## Finding 5 — No build pipeline in either frontend

**Where:** `public/` and `merchant/` load Firebase directly from
`https://www.gstatic.com/firebasejs/10.7.1/...` via native `<script type="module">`, with no bundler,
no TypeScript, and no test runner in either directory.

**Decision (confirmed with the user):** full DDD/TDD adoption is the target for the whole codebase,
which requires introducing a build pipeline for both frontends — this is accepted as in-scope, not
deferred. Recording the trade-offs here regardless, per the project's own rule to justify every
architectural decision rather than adopt patterns by default:

- *Benefit:* enables a shared domain layer (types, validation, status derivation) between `public/`,
  `merchant/`, and `functions/`; enables real unit tests for business logic that today only exists
  inline in DOM code; enables static type-checking across the whole system.
- *Cost:* today, Firebase Hosting serves `public/` and `merchant/` as-is with zero build step — CI
  (`firebase-hosting.yml`) currently only runs `npm install`/`npm run build` inside `functions/`. Adding
  a bundler means CI must build the frontends too, and every contributor needs a build step in their
  local loop, which does not exist today (`firebase serve --only hosting` currently serves raw files
  directly).
- *Migration risk:* this must be done incrementally, module by module, verifying in the emulator after
  each step, so the app is never in a state where Hosting serves stale or half-migrated output.

**Recommended sequencing** (see roadmap below): do this *after* Finding 1/2/3 are fixed and Finding 4 is
done inside `functions/`, so the highest-risk correctness issues are resolved before undertaking a
foundational tooling change. Introducing the build pipeline itself is a separate, larger initiative that
should get its own dedicated plan once P0 items are closed.

---

## Finding 6 — Geo data is written but never queried

> **Resolved.** `public/js/deals.js::loadNearbyDeals` now queries via `geofire-common`'s
> `geohashQueryBounds` instead of fetching the whole collection; the two hand-rolled geohash
> encoders (found to already be correct, just duplicated) now both call `geohashForLocation`. See
> `frontend/public/js/deals.js` and the new composite index in `firestore.indexes.json`
> (`deals`: `status` + `merchantLocation.geohash`). `ngeohash` was removed from the root
> `package.json` — never used, superseded by `geofire-common`.

**Where:** `merchant/js/merchant.js` (`generateGeohash`, lines 254–257), `merchant/js/edit-merchant.js`
(lines 642–645) — both contain a hand-rolled "simplified" geohash function with a comment saying to use
a real library in production. `ngeohash` is declared in the root `package.json` but never imported
anywhere. `public/js/deals.js` (`loadNearbyDeals`) fetches the *entire* `deals` collection filtered only
by `status`/`stockAvailable`, then presumably filters by distance client-side — it does not use the
stored `geohash` field for a bounding-box/proximity query at all.

**Why this matters:** the `geohash` field is dead data — it costs a write and storage on every deal but
provides zero query benefit today. `loadNearbyDeals` will not scale past a small number of active deals
since it always reads the full active set regardless of the user's actual radius.

**Recommendation:** either (a) actually use `ngeohash` to compute proper geohash prefixes and query
Firestore with a bounding-box range query bounded by the user's radius, or (b) remove the dead
`geohash` field and the unused `ngeohash` dependency if proximity filtering at current data volumes
does not yet justify the added query complexity. Given current scale is unknown, this review does not
mandate a choice — it flags that the current state (write the field, never read it) is worse than
either alternative.

---

## Finding 7 — No test suite

> **Resolved for `functions/`** (Vitest, unit + Firestore Emulator integration tests) and **for pure
> business logic in both frontends** (Vitest + jsdom, `frontend/{public,merchant}/js/*.test.js`) —
> component/DOM-interaction testing remains open, as a separate, later step.

**Where:** none of the three `package.json` files (root, `functions/`) declare a test runner or contain
test files.

**Recommendation:** introduce test tooling scoped to where the first real changes land (Finding 1/2 —
`functions/`, already TypeScript): a Node test runner (e.g. Vitest, matching the ecosystem already used
via `@google/generative-ai`/`firebase-admin`) with the Firebase emulator suite for integration tests of
the transactional coupon/stock logic. Frontend test tooling is deferred to Finding 5's build-pipeline
work, since there is no realistic way to unit-test ES modules that assume a CDN-loaded global `Firebase`
without a bundler/test-runner setup first.

---

## Finding 8 — Storage rules are broader than necessary

> **Resolved.** Both real upload paths in `merchant/js/deals.js` were inventoried (the regular deal
> photo upload and the "flash deal" upload, which used a different, non-nested path shape) and
> normalized to the same `deals/{merchantId}/{fileName}` convention. `storage.rules` now scopes
> writes to `request.auth.uid == merchantId`, covered by emulator-backed rules tests
> (`functions/test/integration/storage.rules.emulator.test.ts`).

**Where:** `storage.rules`.

Before:
```
match /{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

Any authenticated user (not just merchants, not just the owner of a given path) could write to any
path in the bucket.

---

## Roadmap

Steps 1-4 and 7 below are **done** and deployed to production (`deal-application`). Step 5 is **done**
for the build pipeline itself; the TypeScript-conversion half of the original finding is a deliberate,
separate follow-up (see below). Only step 6 (client-side domain/application layer) and the
component/DOM-testing half of step 4 remain open.

1. ~~**P0 — Server-authoritative coupon/stock flow.**~~ **Done.** New implementation in
   `functions/src/{domain,application,callable}/`, `functions/index.js` wires in the compiled
   `generateCoupon`/`redeemCoupon`, Firestore rules tightened, `confirmRedemptionCloudFunction`
   deleted. TDD: unit tests for the domain layer + integration tests against the Firestore Emulator
   for the concurrency behavior (`npm test` in `functions/`).
2. ~~**P0 — Firestore config cleanup.**~~ **Done.** Stale `firestore/` copy deleted, `docs/setup.md`
   corrected.
3. ~~**P1 — Domain layer in Functions.**~~ **Done**, scoped to the coupon/deal invariants
   (`functions/src/domain/`). `createDeal`/`updateStock` were dropped rather than ported (see
   Finding 2) — revisit separately if server-authoritative deal creation becomes a priority.
4. ~~**P1 — Test tooling.**~~ **Done** for `functions/` (Vitest, unit + Firestore Emulator
   integration tests) and for pure business logic in both frontends (Vitest + jsdom,
   `frontend/{public,merchant}/js/*.test.js`). **Still open:** component/DOM-interaction testing for
   either frontend (e.g. rendering, form flows) — a separate, larger step than unit-testing already-pure
   functions.
5. ~~**P1 — Build pipeline for both frontends.**~~ **Done.** Fix for Finding 5: `frontend/` is now a
   Vite project (source separate from `dist/` build output), covering the customer PWA, merchant panel,
   and landing page, with CI building it before deploy. **Deliberately not done in this pass:**
   converting the `.js` files to TypeScript — scoped out from the start as a separate, later change so
   the bundler migration and a language migration didn't happen as one undifferentiated risk.
6. ~~**P2 — Domain/application layer in both frontends.**~~ **Done, scoped to what was actually
   duplicated.** `frontend/shared/domain/{deal,coupon}.js` consolidates the expiry/status checks that
   had drifted into ~5 inconsistent ad-hoc implementations across `public/js`/`merchant/js` — not a
   full layered rewrite (category taxonomy and price formatting were checked and found not actually
   duplicated, so left alone). Surfaced and fixed two real behavior bugs in the process: flash deals
   (`isUnlimited: true` + a real 24h `expiresAt`) never actually expired in the customer feed, and the
   merchant dashboard silently excluded deals with no `expiresAt` from the "active deals" count. No
   code sharing with `functions/` (different runtimes; conceptually mirrors its domain layer's spirit
   without forcing shared code across Node/browser boundaries).
7. ~~**P2 — Geo query correctness**~~ (Finding 6) **and storage rule hardening** (Finding 8) — **both
   done.** Geo: `frontend/public/js/deals.js` uses `geofire-common` geohash bounding-box queries instead
   of fetching the whole `deals` collection. Storage: `storage.rules` scopes writes to
   `deals/{merchantId}/{fileName}` matching `request.auth.uid`, covered by emulator rules tests.
