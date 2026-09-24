import { useEffect, useState } from "react";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";

export type SyncState = "saved" | "syncing" | "offline";

/**
 * SAVED = local write acknowledged and online.
 * SYNCING = writes queued but not yet from the server.
 * OFFLINE = device has no network; writes persist locally and sync later.
 */
export function useSyncStatus(
  db: Firestore | null,
  watchPath: string | null,
): SyncState {
  const [state, setState] = useState<SyncState>("saved");

  useEffect(() => {
    const evaluate = (pending: boolean) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) setState("offline");
      else if (pending) setState("syncing");
      else setState("saved");
    };

    const onNetwork = () => evaluate(false);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);

    let unsub: (() => void) | undefined;
    if (db && watchPath) {
      unsub = onSnapshot(doc(db, watchPath), (snap) => {
        evaluate(snap.metadata.hasPendingWrites);
      });
    }
    return () => {
      unsub?.();
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, [db, watchPath]);

  return state;
}
