import { isStandalone } from "./useInstallPrompt";

export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

/** The live browser as an InstallEnv (display-mode standalone included). */
export function currentInstallEnv(): InstallEnv {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
  };
}

export type IosBrowser = "safari" | "chrome" | "firefox" | "edge" | "other";

/**
 * iPhone/iPad/iPod, including iPadOS 13+ which hides behind a desktop Mac
 * user agent (platform "MacIntel" + touch points).
 */
function isIosDevice(env: InstallEnv): boolean {
  return (
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (env.platform === "MacIntel" && env.maxTouchPoints > 1)
  );
}

/**
 * Which iOS browser is in use. Every iOS browser installs manually (Add to
 * Home Screen) but reaches it through a different menu, so the hint wording
 * follows the browser. Opera and in-app webviews (Facebook, Instagram, ...)
 * fall back to "other" with generic wording.
 */
export function detectIosBrowser(env: InstallEnv): IosBrowser | null {
  if (!isIosDevice(env)) return null;
  const ua = env.userAgent;
  if (/EdgiOS/.test(ua)) return "edge";
  if (/FxiOS/.test(ua)) return "firefox";
  if (/CriOS/.test(ua)) return "chrome";
  if (/OPiOS/.test(ua)) return "other";
  // Real Safari carries the "Version/" token that in-app webviews omit.
  return /Version\//.test(ua) && /Safari\//.test(ua) ? "safari" : "other";
}

/** Manual install steps show in every iOS browser outside the installed app. */
export function shouldShowIosInstallHint(env: InstallEnv): boolean {
  return detectIosBrowser(env) !== null && !env.standalone;
}
