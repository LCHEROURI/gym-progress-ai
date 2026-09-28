import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { markMounted } from "./shared/boot-monitor";
import { clearChunkRecovery } from "./shared/chunk-recovery";
import { announceUpdateReady } from "./pwa/BuildStatus";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Tell the pre-React probe the app is alive. Deferred one frame so it fires
// only after React has actually committed and painted: a mark here would make
// a later render crash look like a healthy boot, which is the exact case the
// probe exists to catch.
requestAnimationFrame(() => {
  markMounted();
  // This build ran, so any earlier chunk-reload marker is spent: a future
  // chunk failure gets its own single retry.
  clearChunkRecovery();
});

// PWA: register the app-shell service worker in production builds only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      const notifyIfUpdateIsReady = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          announceUpdateReady();
        }
      };

      notifyIfUpdateIsReady();
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            announceUpdateReady();
          }
        });
      });
    });
  });
}
