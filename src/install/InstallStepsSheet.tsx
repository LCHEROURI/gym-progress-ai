import { useEffect } from "react";
import IosInstallHint from "./IosInstallHint";
import { currentLanguages } from "./iosBrowser";
import { installCopy } from "./i18n";

/**
 * Bottom sheet with the full per-browser install steps — the same locked copy
 * Settings shows through IosInstallHint — opened by tapping the TODAY nudge
 * banner text, so iOS visitors get the complete steps without hunting through
 * Settings. Closes on the button, Escape, or a backdrop tap (the nudge itself
 * is NOT dismissed).
 */
export default function InstallStepsSheet({ onClose }: { onClose: () => void }) {
  const copy = installCopy(currentLanguages());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="installSheet" onClick={onClose}>
      <div
        className="installSheetPanel"
        role="dialog"
        aria-modal="true"
        aria-label="Install app"
        onClick={(e) => e.stopPropagation()}
      >
        <IosInstallHint />
        <button type="button" className="secondaryButton" onClick={onClose}>
          {copy.close}
        </button>
      </div>
    </div>
  );
}
