import type { InstallEventInput } from "../data/install-events";

type Recorder = (input: InstallEventInput) => void;
let recorder: Recorder | null = null;

/** Bind the Firestore recorder once the user session is known. */
export function bindInstallEventRecorder(r: Recorder | null): void {
  recorder = r;
}

/** Never let observability break the install flow. */
export function trackInstallEvent(input: InstallEventInput): void {
  try {
    recorder?.(input);
  } catch {
    // fire-and-forget analytics
  }
}
