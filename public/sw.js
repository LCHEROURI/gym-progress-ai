// Bump the version to flush stale precached shell on the next activation.
// v4: cache writes and cache reads are now guarded by status + content type
// (see isCacheable / expectedType). Deploys no longer poison a client.
const CACHE = "gym-progress-ai-v4";
const CORE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Hosting rewrites every unmatched path to /index.html (see the hosting config),
// so a chunk deleted by a new deploy answers 200 text/html instead of 404. Caching
// that response under the chunk's .js URL makes a module import receive HTML
// forever — a blank screen no reload or redeploy can clear. These guards make
// that impossible: a script URL only accepts a script content type, and only
// a real 2xx is ever written.
const SCRIPT_TYPES = [
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "application/x-javascript",
];
const STYLE_TYPES = ["text/css"];
const HTML_TYPES = ["text/html"];

/** The content type this URL is allowed to be answered with, or null for any. */
function expectedType(url) {
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".mjs")) {
    return "script";
  }
  if (url.pathname.endsWith(".css")) return "style";
  if (url.pathname.endsWith(".html") || url.pathname === "/") return "html";
  return null; // icons, manifest, fonts: any type is fine
}

function contentTypeOf(response) {
  try {
    return (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
  } catch (error) {
    return "";
  }
}

function typeAllowed(contentType, kind) {
  if (!kind) return true;
  if (kind === "script") {
    // "module" is what some servers label an ES module with.
    return SCRIPT_TYPES.includes(contentType) || contentType === "module";
  }
  if (kind === "style") return STYLE_TYPES.includes(contentType);
  return HTML_TYPES.includes(contentType);
}

/**
 * A response may be cached only if it succeeded and its content type matches
 * what this URL is supposed to return.
 */
function isCacheable(response, kind) {
  if (!response || !response.ok) return false;
  if (response.type === "opaque") return false;
  return typeAllowed(contentTypeOf(response), kind);
}

/** Fetch, and write to the cache only when the response is safe to cache. */
function fetchAndCache(request, kind) {
  return fetch(request).then((response) => {
    if (isCacheable(response, kind)) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

/**
 * Cache-first, but self-healing: a cached entry whose content type does not
 * match its URL is a poisoned leftover (written by a pre-v4 worker). Drop it
 * and go to the network, so a client that is already bricked recovers on the
 * next load without the user clearing site data.
 */
function cacheFirst(request, kind) {
  return caches.match(request).then((hit) => {
    if (hit && isCacheable(hit, kind)) return hit;
    if (!hit) return fetchAndCache(request, kind);
    return caches
      .open(CACHE)
      .then((cache) => cache.delete(request))
      .then(() => fetchAndCache(request, kind));
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never intercept Firebase Auth, Firestore, or AI traffic — offline
  // persistence is Firestore's job; this worker covers the app shell only.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network-first so a deploy reaches users immediately, with a cached
    // shell as the offline fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html"))),
    );
    return;
  }

  event.respondWith(cacheFirst(req, expectedType(url)));
});

// Workout reminders (FCM web push). Handled raw on purpose: the payload is the
// message's data/notification JSON, so this worker never imports Firebase and
// no config or keys live in a committed file.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data ? event.data.text() : "" } };
  }
  const data = payload.data || {};
  const note = payload.notification || {};
  const title = data.title || note.title || "Gym Progress AI";
  const body = data.body || note.body || "Workout time — today’s session is ready when you are.";
  const url = data.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "workout-reminder",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
