import { useEffect, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { enablePushReminders, pushSupported } from "./push";

type PushStatus =
  | "idle"
  | "working"
  | "on"
  | "denied"
  | "unsupported";

/**
 * Settings section that arms push workout reminders on this device. Already-
 * granted devices re-register on mount so tokens stay fresh. Each device opts
 * in on its own — reminders follow the times set above, in the device's zone.
 */
export default function PushReminders({
  app,
  db,
  uid,
}: {
  app: FirebaseApp;
  db: Firestore;
  uid: string;
}) {
  const [status, setStatus] = useState<PushStatus>(() =>
    !pushSupported()
      ? "unsupported"
      : Notification.permission === "granted"
        ? "on"
        : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const enable = () => {
    setStatus("working");
    setError(null);
    enablePushReminders({ app, db, uid })
      .then((result) => setStatus(result))
      .catch((e: unknown) => {
        setStatus("idle");
        setError(e instanceof Error ? e.message : "Could not turn on reminders.");
      });
  };

  // Token refresh for devices that already allowed notifications.
  useEffect(() => {
    if (status === "on") enable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-label="Push reminders">
      <h3 className="sectionTitle">PUSH REMINDERS</h3>
      <p className="tip">
        A nudge on Mon/Wed/Fri at the times above, on this device. Each device
        needs to be turned on separately.
      </p>
      {status === "on" && <p>Push reminders are ON for this device.</p>}
      {status === "denied" && (
        <p role="alert">
          Notifications are blocked. Allow notifications for this site in your
          browser settings, then tap again.
        </p>
      )}
      {status === "unsupported" && (
        <p>This browser can&rsquo;t receive push notifications.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {(status === "idle" || status === "denied" || status === "working") && (
        <button
          type="button"
          className="secondaryButton"
          onClick={enable}
          disabled={status === "working"}
        >
          {status === "working" ? "TURNING ON…" : "ENABLE PUSH REMINDERS"}
        </button>
      )}
    </section>
  );
}
