import IosInstallHint from "./IosInstallHint";
import { useInstallPrompt } from "./useInstallPrompt";

/**
 * Settings entry: reports whether the app is installed and offers the right
 * install path for this browser (one-tap button on Chrome/Edge, manual iOS
 * Safari steps, or nothing where install is unsupported).
 */
export default function InstallSection() {
  const { canInstall, install, installed } = useInstallPrompt();
  return (
    <>
      <h3 className="sectionTitle">INSTALL APP</h3>
      <p className="tip">
        {installed
          ? "Installed — opens full screen from your Home Screen."
          : "Not installed yet."}
      </p>
      {!installed && canInstall && (
        <button
          type="button"
          className="secondaryButton"
          onClick={() => void install()}
        >
          INSTALL APP
        </button>
      )}
      {!installed && <IosInstallHint />}
    </>
  );
}
