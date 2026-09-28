/**
 * Self-heal for the deploy race.
 *
 * A client that was open across a deploy asks for a chunk the new build
 * removed; Hosting answers with the SPA shell, `import()` rejects, and the app
 * breaks. The fix for that is a fresh document: a navigation is network-first
 * and the HTML is no-cache, so one reload picks up the new build and the chunk
 * resolves.
 *
 * The dangerous part is the loop. A device with no network reloads, the cached
 * shell comes back, the same chunk fails, and it reloads forever — a battery
 * drain and a support ticket. So the guard is deliberately conservative: at
 * most ONE auto-reload per session, tracked in sessionStorage, cleared only
 * when a build actually mounts. Anything else falls through to the error
 * boundary, which offers a human a reload button.
 *
 * Data safety: a reload discards in-memory state. Workout sets are written to
 * Firestore's persistent local cache as they are logged, so the risk is bounded
 * to the very last unsynced set — and the alternative (a permanently broken
 * app) is worse.
 */

/** sessionStorage key. Presence of the value means "already reloaded". */
export const CHUNK_RELOAD_KEY = "gym-progress-ai:chunk-reload";

/**
 * Real messages from the browsers this app targets, plus the loader wording
 * from Vite/Rollup. Kept as data so the table is readable and testable.
 */
const CHUNK_FAILURE_PATTERNS: RegExp[] = [
  /failed to fetch dynamically imported module/i, // Chromium / Vite
  /error loading dynamically imported module/i, // Firefox / Safari
  /importing a module script failed/i, // Safari
  /failed to load module script/i, // includes the MIME-type variant
  /unable to preload css/i,
  /error loading chunk/i,
  /loading chunk [\w-]+ failed/i,
  /dynamically imported module/i, // backstop
];

/** True when an error message means "a chunk could not be loaded". */
export function looksLikeChunkFailure(message: unknown): boolean {
  if (typeof message !== "string" || message.length === 0) return false;
  return CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export type RecoveryOutcome =
  | "reloading" // reload triggered
  | "already-tried" // guard tripped; the error boundary should handle it
  | "not-a-chunk-failure" // unrelated error; do nothing
  | "unavailable"; // storage and reload both unusable; do nothing

export interface RecoveryDeps {
  /** Injected for tests; defaults to sessionStorage. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Injected for tests; defaults to a real page reload. */
  reload?: () => void;
}

/**
 * Guards against two failures racing in the same document (for example the
 * error boundary and the pre-React probe both noticing). Survives a module
 * reload of this file, which sessionStorage alone would not.
 */
let reloadedInThisDocument = false;

function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Safari can throw on access when storage is disabled.
    return null;
  }
}

function defaultReload(): () => void {
  return () => window.location.reload();
}

/**
 * Reloads the page at most once per session when `reason` looks like a failed
 * chunk load. Returns what it decided so callers (and tests) can tell the
 * difference between "healed" and "gave up".
 */
export function attemptChunkRecovery(
  reason: unknown,
  deps: RecoveryDeps = {},
): RecoveryOutcome {
  if (!looksLikeChunkFailure(reason)) return "not-a-chunk-failure";
  if (reloadedInThisDocument) return "already-tried";

  const storage = deps.storage !== undefined ? deps.storage : defaultStorage();
  if (storage) {
    try {
      if (storage.getItem(CHUNK_RELOAD_KEY)) return "already-tried";
      // Recorded before reloading: if the reload throws or is blocked, we have
      // still spent the single attempt and must not spend it again.
      storage.setItem(
        CHUNK_RELOAD_KEY,
        JSON.stringify({ reason: String(reason).slice(0, 200), at: Date.now() }),
      );
    } catch {
      // Storage is unusable; the in-document flag still prevents a loop.
    }
  }

  reloadedInThisDocument = true;
  try {
    (deps.reload ?? defaultReload())();
    return "reloading";
  } catch {
    return "unavailable";
  }
}

/**
 * Called once a build has actually mounted. A healthy build means the marker
 * is stale, so the next genuine chunk failure may use its one reload.
 */
export function clearChunkRecovery(deps: RecoveryDeps = {}): void {
  reloadedInThisDocument = false;
  const storage = deps.storage !== undefined ? deps.storage : defaultStorage();
  try {
    storage?.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // Nothing to do; the in-document flag is already reset.
  }
}

/** Test seam: reset the module-level guard between cases. */
export function resetChunkRecoveryForTests(): void {
  reloadedInThisDocument = false;
}
