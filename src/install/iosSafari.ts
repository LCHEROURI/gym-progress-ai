export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

/**
 * Safari on iPhone/iPad/iPod, including iPadOS 13+ which hides behind a
 * desktop Mac user agent (platform "MacIntel" + touch points).
 */
export function isIosSafari(env: InstallEnv): boolean {
  const iDevice =
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (env.platform === "MacIntel" && env.maxTouchPoints > 1);
  if (!iDevice) return false;
  // Chrome/Firefox/Edge/Opera on iOS spell their names in the UA; the Share
  // sheet steps below are Safari-specific.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(env.userAgent);
}

/** Show the manual install steps only in iOS Safari outside the installed app. */
export function shouldShowIosInstallHint(env: InstallEnv): boolean {
  return isIosSafari(env) && !env.standalone;
}
