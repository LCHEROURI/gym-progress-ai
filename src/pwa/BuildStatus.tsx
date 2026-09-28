import { useEffect, useState } from "react";

export const UPDATE_READY_EVENT = "gym-progress-ai:update-ready";

type UpdateState = "checking" | "current" | "ready" | "unavailable";

export function announceUpdateReady() {
  window.dispatchEvent(new Event(UPDATE_READY_EVENT));
}

export default function BuildStatus() {
  const [updateState, setUpdateState] = useState<UpdateState>("checking");

  useEffect(() => {
    let mounted = true;

    const checkRegistration = async () => {
      if (!("serviceWorker" in navigator)) {
        if (mounted) setUpdateState("unavailable");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (mounted) {
          setUpdateState(registration?.waiting ? "ready" : "current");
        }
      } catch {
        if (mounted) setUpdateState("unavailable");
      }
    };

    const handleUpdateReady = () => {
      if (mounted) setUpdateState("ready");
    };

    window.addEventListener(UPDATE_READY_EVENT, handleUpdateReady);
    void checkRegistration();
    return () => {
      mounted = false;
      window.removeEventListener(UPDATE_READY_EVENT, handleUpdateReady);
    };
  }, []);

  const statusLabel =
    updateState === "ready"
      ? "Update ready"
      : updateState === "checking"
        ? "Checking…"
        : updateState === "current"
          ? "Up to date"
          : "Build";

  return (
    <div
      className={`buildStatus buildStatus-${updateState}`}
      data-build-id={__APP_BUILD_ID__}
      aria-live="polite"
    >
      <span className="buildStatusText">
        <span>Build {__APP_BUILD_ID__}</span>
        <span className="buildStatusLabel">{statusLabel}</span>
      </span>
      {updateState === "ready" && (
        <button
          type="button"
          className="buildStatusAction"
          onClick={() => window.location.reload()}
        >
          RELOAD
        </button>
      )}
    </div>
  );
}
