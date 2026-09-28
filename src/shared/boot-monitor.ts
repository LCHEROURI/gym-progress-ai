/**
 * App-side handle to the pre-React boot probe.
 *
 * The probe script is injected as raw text (src/shared/boot-probe.ts), so
 * TypeScript cannot see it. This module is the typed seam: every call is
 * optional-chained, because in a test, an SSR pass, or a stripped build the
 * probe may legitimately be absent. Monitoring must never be able to break
 * the app it is monitoring.
 */
import { BOOT_GLOBAL } from "./boot-probe";

interface BootProbeHandle {
  markMounted: () => void;
  reportRenderFailure: (message: string) => void;
}

declare global {
  interface Window {
    [BOOT_GLOBAL]?: BootProbeHandle;
  }
}

/** Marks a successful React mount so the probe stops watching for a blank screen. */
export function markMounted(): void {
  try {
    window[BOOT_GLOBAL]?.markMounted();
  } catch {
    // A monitoring probe must never break the app.
  }
}

/** Reports a render or lazy-load crash caught by AppErrorBoundary. */
export function reportRenderFailure(message: string): void {
  try {
    window[BOOT_GLOBAL]?.reportRenderFailure(message);
  } catch {
    // Ignore: the user already sees the error boundary UI.
  }
}

/**
 * `true` for an installed home-screen app, where a blank screen is worst: the
 * user has no browser chrome to reload from and may be offline.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}
