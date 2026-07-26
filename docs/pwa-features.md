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
  `push`/`notificationclick` handler that complements the messaging service worker below.
  **Known limitation:** the `urlsToCache` list used in the `install` event still references
  non-hashed paths (`/js/app.js`, `/css/styles.css`) that existed before the Vite migration. The
  current build produces content-hashed filenames, so those paths no longer exist in `dist/`, and
  `cache.addAll()` fails for the whole list. In practice, this service worker's app-shell precache
  doesn't work today; basic offline behavior relies on the browser's HTTP cache for the hashed
  assets. See `setup.md` (Troubleshooting).
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
- **Customer PWA** (`frontend/static/public/manifest.json`): **known bug** — `start_url` is `"/"`
  (the landing page) and `scope` isn't set. Installing the app from `/app` and later opening it from
  the home screen icon lands on the landing page, not the deals feed. Fix pending: `start_url`
  should be `/public/index.html` (or `/app`) with `scope: "/public/"` (or `/app`), mirroring what's
  already correct in the merchant manifest.

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
- Fixing the customer PWA's `sw.js` precache list for the post-Vite asset paths (see bug above).
- Fixing the customer PWA manifest's `start_url`/`scope` (see bug above).

## How to validate

**Lighthouse:** DevTools → Lighthouse → "Progressive Web App" category → Analyze page load. Given
the precache bug above, expect the "offline start" check to fail until it's fixed.

**Manual offline test:** DevTools → Network → Throttling → "Offline", then:
- Interface loads from the browser cache ✅
- Navigation between already-visited screens ✅
- Coupon generation fails ✅ (expected — depends on Cloud Functions)

**Push notification:** follow the "Enable notifications" step of the functional validation guide in
[`setup.md`](setup.md) — publishing a deal in a subscribed category should trigger a notification
within a few seconds.
