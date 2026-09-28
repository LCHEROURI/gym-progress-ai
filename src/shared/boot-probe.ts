/**
 * The pre-React boot probe, as source text.
 *
 * Why a string and not a component: the failure this exists to catch is
 * "JavaScript never ran" — a poisoned chunk, a MIME error, a syntax failure
 * in the entry bundle. Any solution that imports a module is itself subject to
 * the failure it is meant to observe. So this is a hand-written IIFE that
 * Vite inlines into index.html (see bootProbePlugin in vite.config.ts). It
 * depends on nothing: no Firebase, no React, no shared module.
 *
 * Contract with the app:
 *   - the app calls `window.__gymBoot?.markMounted()` from main.tsx
 *   - the error boundary calls `window.__gymBoot?.reportRenderFailure(msg)`
 *   - a boot that never marks itself mounted is reported on a timer
 *
 * It reports through `navigator.sendBeacon` when available (survives page
 * teardown) and falls back to `fetch(..., { keepalive: true })`. Transport
 * failure is ignored on purpose: a monitoring probe must never break the app.
 */

import { CHUNK_RELOAD_KEY } from "./chunk-recovery";

/** Global name the app uses to talk to the probe. */
export const BOOT_GLOBAL = "__gymBoot";

/** Path the probe posts to; the Hosting rewrite in firebase.json forwards it. */
export const BOOT_REPORT_URL = "/__boot";

/**
 * How long to wait for markMounted() before calling it a pre-React failure.
 * Deliberately generous: a slow phone on a weak connection can take seconds to
 * fetch and parse the bundle, and a false positive would report a healthy boot.
 */
export const BOOT_MOUNT_TIMEOUT_MS = 15000;

export const bootProbeScript = `
(function () {
  if (window.${BOOT_GLOBAL}) return;
  var START = Date.now();
  var reported = false;
  var mounted = false;
  var MAX_MESSAGE = 300;
  var REPORT_URL = ${JSON.stringify(BOOT_REPORT_URL)};

  function buildId() {
    var meta = document.querySelector('meta[name="app-build-id"]');
    return (meta && meta.getAttribute("content")) || "unknown";
  }

  function truncate(text) {
    var value = text == null ? "" : String(text);
    return value.length > MAX_MESSAGE ? value.slice(0, MAX_MESSAGE - 1) + "\\u2026" : value;
  }

  function platform() {
    return [navigator.platform || "", navigator.userAgent ? "" : ""].join("").slice(0, 40);
  }

  function isStandalone() {
    try {
      if (navigator.standalone === true) return true;
      return window.matchMedia("(display-mode: standalone)").matches;
    } catch (e) {
      return false;
    }
  }

  function send(stage, message) {
    if (reported) return;
    reported = true;
    var payload = {
      buildId: buildId(),
      stage: stage,
      message: truncate(message),
      platform: platform(),
      standalone: isStandalone(),
      elapsedMs: Date.now() - START
    };
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        // text/plain avoids a CORS preflight; the Function reads the raw body.
        navigator.sendBeacon(REPORT_URL, new Blob([body], { type: "text/plain" }));
        return;
      }
    } catch (e) { /* fall through to fetch */ }
    try {
      fetch(REPORT_URL, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "text/plain" },
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* monitoring must never break the app */ }
  }

  // Mirrors src/shared/chunk-recovery.ts, inlined because this probe cannot
  // import anything. It shares the same sessionStorage key so the probe and
  // the error boundary cannot each spend a reload: one reload per session.
  var CHUNK_RELOAD_KEY = ${JSON.stringify(CHUNK_RELOAD_KEY)};
  var CHUNK_FAILURE = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload css|error loading chunk|loading chunk [\\w-]+ failed|dynamically imported module/i;
  var reloadedHere = false;

  function tryChunkReload(message, force) {
    try {
      if (reloadedHere) return;
      // A resource error carries no message, so the caller can assert that the
      // load it saw is by definition a chunk that failed to load.
      if (!force && !CHUNK_FAILURE.test(String(message || ""))) return;
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(message).slice(0, 200));
    } catch (e) {
      if (reloadedHere) return; // storage unusable; still allow one attempt
    }
    reloadedHere = true;
    try {
      window.location.reload();
    } catch (e) { /* nothing left to try */ }
  }

  window.addEventListener("error", function (event) {
    // A <script> that fails to load reports on the element, not with a message.
    if (event && event.target && event.target.tagName === "SCRIPT") {
      var src = event.target.getAttribute("src") || "(inline)";
      send("boot", "Script failed to load: " + src);
      // The entry chunk never loaded: React never existed, so nothing else in
      // the app can recover. A single reload fetches the current build. Forced,
      // because a resource error has no message to match on.
      tryChunkReload("Script failed to load: " + src, true);
      return;
    }
    var message = (event && event.message) || "Uncaught error before mount";
    send("window-error", message);
    // Capture phase is required: a resource error (a <script> that 404s) is
    // dispatched at the element and does NOT bubble, so a bubbling listener on
    // window would never see the most important failure this probe exists for.
    tryChunkReload(message, false);
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    send("window-error", "Unhandled rejection: " + (reason && reason.message ? reason.message : reason));
  });

  setTimeout(function () {
    // No markMounted() by now: React never mounted. This is the blank screen.
    if (mounted) return;
    send("boot", "No mount signal within timeout");
  }, ${BOOT_MOUNT_TIMEOUT_MS});

  window.${BOOT_GLOBAL} = {
    markMounted: function () { mounted = true; },
    reportRenderFailure: function (message) { send("render", message); }
  };
})();
`;
