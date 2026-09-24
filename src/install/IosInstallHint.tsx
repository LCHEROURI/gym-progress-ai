import {
  currentInstallEnv,
  detectIosBrowser,
  shouldShowIosInstallHint,
  type IosBrowser,
} from "./iosBrowser";

/** Per-browser wording for the manual Add to Home Screen steps. */
const STEPS: Record<IosBrowser, string> = {
  safari:
    "In Safari, tap the Share button, then “Add to Home Screen”, then Add — choose “Web App” if asked. Don’t see the option? Scroll to Edit Actions and add it.",
  chrome:
    "In Chrome, tap Share to the right of the address bar, then “Add to Home Screen”, then Add — choose “Web App” if asked.",
  firefox:
    "In Firefox, tap the ☰ menu, then Share, then “Add to Home Screen”, then Add — choose “Web App” if asked.",
  edge:
    "In Edge, tap the Share icon (the box with an arrow), then “Add to Home Screen”, then Add — choose “Web App” if asked.",
  other:
    "In your browser, open Share, then tap “Add to Home Screen”, then Add — choose “Web App” if asked.",
};

/**
 * No iOS browser fires `beforeinstallprompt`, so iOS gets manual Add to Home
 * Screen steps instead of the one-tap INSTALL APP button, worded per browser.
 * Hidden off iOS and once the app is already running from the Home Screen.
 */
export default function IosInstallHint() {
  const env = currentInstallEnv();
  if (!shouldShowIosInstallHint(env)) return null;
  return (
    <p className="tip">
      {STEPS[detectIosBrowser(env) ?? "other"]} The app opens full screen from
      your Home Screen.
    </p>
  );
}
