# PWA Features — Radar da Oferta

Actual state of each PWA capability: what's implemented and what isn't. See
[`architecture-review.md`](architecture-review.md) for the architectural decisions and
[`setup.md`](setup.md) for how to test each item locally.

## Implemented

### Service Worker

Two separate service workers, one per surface, registered from
`frontend/static/{public,merchant}/sw.js` (unhashed Vite passthrough — see
`frontend/vite.config.js`):

- **Customer PWA** (`frontend/static/public/sw.js`): network-first with cache fallback, plus a
  `push`/`notificationclick` handler that complements the messaging service worker below. The
  `urlsToCache` precache list used to reference non-hashed paths (`/js/app.js`, `/css/styles.css`)
  left over from before the Vite migration, which no longer exist in `dist/` (Vite content-hashes
  the JS/CSS bundle filenames) — `cache.addAll()` failed for the whole list. **Fixed**: the list now
  only contains the stable, unhashed assets actually served from `frontend/static/`
  (`/public/index.html`, `/public/manifest.json`, `/public/assets/icons/icon-192.png`).
  **Note:** registering this service worker is currently commented out in `frontend/public/index.html`
  (only `firebase-messaging-sw.js` is registered) — the precache fix keeps the file correct for
  whenever it's re-enabled, but today it isn't active, so there's no app-shell precache in
  production yet either way.
- **Merchant panel** (`frontend/static/merchant/sw.js`): trivial — plain fetch passthrough, no
  caching strategy of its own.

### Firebase Cloud Messaging (push notifications)

Implemented end to end, not a roadmap item:

- `frontend/static/public/firebase-messaging-sw.js` receives background messages
  (`onBackgroundMessage`) and builds the notification (icon, "View Deal"/"Dismiss" actions, deep
  link by `dealId`).
- The client (`frontend/public/js/app.ts`) requests permission, obtains the token via `getToken`,
  stores `fcmToken`/`notificationsEnabled` on `users/{uid}`, and subscribes/unsubscribes category
  topics through the `manageSubscription` Cloud Function.
- Every newly published deal triggers `onNewDealNotify` (Firestore trigger on `deals/{dealId}`),
  which notifies the matching category topic.

### Web App Manifest

- **Merchant panel** (`frontend/static/merchant/manifest.json`): `start_url` and `scope` are correct
  (`/merchant/index.html`, `/merchant/`).
- **Customer PWA** (`frontend/static/public/manifest.json`): `start_url` used to be `"/"` (the
  landing page) with no `scope` set — installing the app and later opening it from the home screen
  icon landed on the landing page, not the deals feed. **Fixed**: `start_url` is now
  `/public/index.html` with `scope: "/public/"`, mirroring the merchant manifest. Also fixed while
  in there: both manifests referenced `icon-512.png`, which never existed in the repo (only
  `icon-192.png` does) — removed the broken 512px entry from both manifests rather than leave a
  dead reference. A real 512px icon asset would still be worth adding at some point (Lighthouse's
  PWA audit expects one), but that requires a design asset this fix can't produce.

### Installing on a device

- **Android (Chrome):** menu (⋮) → "Add to Home screen".
- **iOS (Safari):** Share (□↑) → "Add to Home Screen".
- **Desktop (Chrome/Edge):** install icon in the address bar, or menu → "Install".

### Offline experience

- The interface and navigation between already-visited screens work from the browser cache even
  offline.
- Generating/redeeming a coupon requires a connection (depends on Cloud Functions) — expected
  behavior, not a bug.

## Not implemented (roadmap, not work in progress)

None of these have any associated code today — they're recorded ideas, not partially built
features:

- **Background Sync** — sync actions performed offline once the connection comes back
  (`ServiceWorkerRegistration.sync`).
- **Offline queue** — a local (IndexedDB) queue of pending actions while offline.
- **Resource-specific caching strategies** — today it's network-first for everything;
  cache-first would make more sense for hashed static assets, stale-while-revalidate for dynamic
  data.
- An explicit **app shell architecture** (separating shell cache from dynamic content cache).
- Re-enabling the customer PWA's `sw.js` registration (currently commented out — see above).
- A real 512px icon asset (both manifests only reference the 192px one today).

## How to validate

**Lighthouse:** DevTools → Lighthouse → "Progressive Web App" category → Analyze page load. The
manifest and precache-list bugs are fixed, but expect the maskable-icon/512px checks to still flag
something until a real 512px icon is added, and offline-start checks won't reflect the precache fix
until `sw.js`'s registration is re-enabled (see above).

**Manual offline test:** DevTools → Network → Throttling → "Offline", then:
- Interface loads from the browser cache ✅
- Navigation between already-visited screens ✅
- Coupon generation fails ✅ (expected — depends on Cloud Functions)

**Push notification:** follow the "Enable notifications" step of the functional validation guide in
[`setup.md`](setup.md) — publishing a deal in a subscribed category should trigger a notification
within a few seconds.
