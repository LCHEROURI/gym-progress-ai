import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging";
import { saveFcmToken } from "../data/fcm-tokens";

export type PushEnableResult = "on" | "denied" | "unsupported";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/**
 * Turn on push reminders for this device: permission → FCM token against our
 * own service worker → Zod-validated save with the device's time zone (so
 * reminder times fire at the device's wall clock). Failures throw with copy
 * the user can act on; "denied"/"unsupported" are not errors.
 */
export async function enablePushReminders(input: {
  app: FirebaseApp;
  db: Firestore;
  uid: string;
}): Promise<PushEnableResult> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    throw new Error(
      "Push key missing — set VITE_FCM_VAPID_KEY (Firebase console → Cloud Messaging → Web Push certificates) and rebuild.",
    );
  }
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(input.app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    throw new Error(
      "The browser issued no push token. Check this site's notification settings and try again.",
    );
  }
  await saveFcmToken({ db: input.db }, input.uid, {
    token,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return "on";
}
