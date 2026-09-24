import { shouldShowIosInstallHint, type InstallEnv } from "./iosSafari";
import { isStandalone } from "./useInstallPrompt";

function currentEnv(): InstallEnv {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
  };
}

/**
 * iOS Safari never fires `beforeinstallprompt`, so it gets manual Add to Home
 * Screen steps instead of the one-tap INSTALL APP button. Hidden elsewhere and
 * once the app is already running from the Home Screen.
 */
export default function IosInstallHint() {
  if (!shouldShowIosInstallHint(currentEnv())) return null;
  return (
    <p className="tip">
      In Safari, tap the Share button, then &ldquo;Add to Home Screen&rdquo;,
      then Add. The app opens full screen from your Home Screen.
    </p>
  );
}
