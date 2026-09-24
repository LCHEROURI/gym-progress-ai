import { useEffect, useState } from "react";

const THANKS_MS = 6000;

/**
 * Thank-you toast shown when the browser reports `appinstalled`. Auto-dismisses
 * so it never blocks the workout flow.
 */
export default function InstallToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onInstalled = () => setVisible(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), THANKS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="installToast" role="status">
      <p>Thanks for installing Gym Progress AI!</p>
      <p>It now opens full screen from your Home Screen.</p>
      <button
        type="button"
        className="secondaryButton"
        onClick={() => setVisible(false)}
      >
        DISMISS
      </button>
    </div>
  );
}
