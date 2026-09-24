import {
  currentInstallEnv,
  currentLanguages,
  detectIosBrowser,
  shouldShowIosInstallHint,
} from "./iosBrowser";
import { installCopy } from "./i18n";

/**
 * No iOS browser fires `beforeinstallprompt`, so iOS gets manual Add to Home
 * Screen steps instead of the one-tap INSTALL APP button, worded per browser
 * and in the device's language. Hidden off iOS and once the app is already
 * running from the Home Screen.
 */
export default function IosInstallHint() {
  const env = currentInstallEnv();
  if (!shouldShowIosInstallHint(env)) return null;
  const copy = installCopy(currentLanguages());
  return (
    <p className="tip" dir="auto">
      {copy.steps[detectIosBrowser(env) ?? "other"]} {copy.tail}
    </p>
  );
}
