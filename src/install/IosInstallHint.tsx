import {
  currentInstallEnv,
  currentLanguages,
  detectIosBrowser,
  shouldShowIosInstallHint,
} from "./iosBrowser";
import { installCopy } from "./i18n";
import InstallStepsDiagram from "./InstallStepsDiagram";

/**
 * No iOS browser fires `beforeinstallprompt`, so iOS gets manual Add to Home
 * Screen steps instead of the one-tap INSTALL APP button, worded per browser
 * and in the device's language — rendered as an illustrated step-by-step
 * diagram whose captions are the verbatim locked wording. Hidden off iOS and
 * once the app is already running from the Home Screen.
 */
export default function IosInstallHint() {
  const env = currentInstallEnv();
  if (!shouldShowIosInstallHint(env)) return null;
  const copy = installCopy(currentLanguages());
  return (
    <InstallStepsDiagram
      slices={copy.slices}
      browser={detectIosBrowser(env) ?? "other"}
      tail={copy.tail}
    />
  );
}
