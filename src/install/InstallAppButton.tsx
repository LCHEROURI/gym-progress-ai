import { useInstallPrompt } from "./useInstallPrompt";

/** One-tap PWA install. Renders nothing unless the browser offers install. */
export default function InstallAppButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button type="button" className="secondaryButton" onClick={() => void install()}>
      INSTALL APP
    </button>
  );
}
