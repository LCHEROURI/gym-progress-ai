import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Behavioral tests for the service worker's cache guard.
 *
 * The bug being locked down: Hosting rewrites unmatched paths to /index.html,
 * so a chunk deleted by a deploy answers 200 text/html. The pre-v4 worker wrote
 * that response into the cache under the chunk's .js URL, so every later load
 * replayed HTML into a module import — permanently, since the cache name never
 * changed. String assertions cannot catch that, so these tests execute the real
 * sw.js against fake caches and a fake fetch.
 */

const ORIGIN = "https://app.test";
const swSource = readFileSync("public/sw.js", "utf8");

class FakeResponse {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly contentType: string,
    readonly type = "basic",
  ) {}
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  headers = {
    get: (name: string) =>
      name.toLowerCase() === "content-type" ? this.contentType : null,
  };
  clone() {
    return this;
  }
}

const html = (body = "<!doctype html>") => new FakeResponse(200, body, "text/html");
const js = (body = "export const a=1;") =>
  new FakeResponse(200, body, "text/javascript");
const css = () => new FakeResponse(200, "body{}", "text/css");
const notFound = () => new FakeResponse(404, "not found", "text/html");

interface Harness {
  /** Requests whose responses were written to the cache. */
  written: Map<string, FakeResponse>;
  /** Current cache contents, keyed by request URL. */
  store: Map<string, FakeResponse>;
  deleted: string[];
  fetchCalls: string[];
  respond: (url: string, options?: { mode?: string; method?: string }) => Promise<FakeResponse>;
}

/** Runs sw.js in a sandbox and returns a handle for driving fetch events. */
function installWorker(options: {
  network?: (url: string) => FakeResponse | Promise<FakeResponse>;
  seed?: Record<string, FakeResponse>;
  offline?: boolean;
}): Harness {
  const store = new Map<string, FakeResponse>(Object.entries(options.seed ?? {}));
  const written = new Map<string, FakeResponse>();
  const deleted: string[] = [];
  const fetchCalls: string[] = [];

  const keyOf = (request: { url: string } | string) =>
    typeof request === "string" ? request : request.url;
  const cache = {
    put: (request: { url: string }, response: FakeResponse) => {
      store.set(keyOf(request), response);
      written.set(keyOf(request), response);
      return Promise.resolve();
    },
    match: (request: { url: string } | string) => Promise.resolve(store.get(keyOf(request))),
    delete: (request: { url: string } | string) => {
      deleted.push(keyOf(request));
      return Promise.resolve(store.delete(keyOf(request)));
    },
  };
  const caches = {
    open: () => Promise.resolve(cache),
    match: (request: { url: string } | string) => Promise.resolve(store.get(keyOf(request))),
    keys: () => Promise.resolve([swCacheName(swSource)]),
    delete: () => Promise.resolve(true),
  };

  const defaultNetwork = (url: string) => (url.endsWith(".js") ? js() : html());
  const fetchImpl = (request: { url: string }) => {
    fetchCalls.push(request.url);
    if (options.offline) return Promise.reject(new Error("offline"));
    return Promise.resolve((options.network ?? defaultNetwork)(request.url));
  };

  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners[type] = handler;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    registration: { showNotification: () => Promise.resolve() },
    location: { origin: ORIGIN },
  };

  // eslint-disable-next-line no-new-func -- executing the shipped worker is the point
  const run = new Function("self", "caches", "fetch", "URL", "Response", swSource);
  run(self, caches, fetchImpl, URL, FakeResponse);

  const harness: Harness = {
    written,
    store,
    deleted,
    fetchCalls,
    respond: async (url, opts = {}) => {
      let promise: Promise<unknown> | undefined;
      listeners.fetch({
        request: { url, method: opts.method ?? "GET", mode: opts.mode ?? "no-cors" },
        respondWith: (p: Promise<unknown>) => {
          promise = p;
        },
      });
      if (!promise) throw new Error(`worker did not respond for ${url}`);
      return (await promise) as FakeResponse;
    },
  };
  return harness;
}

function swCacheName(source: string): string {
  return /const CACHE = "([^"]+)"/.exec(source)?.[1] ?? "";
}

describe("sw.js cache guard — poisoned responses are never written", () => {
  it("caches a real script response", async () => {
    const w = installWorker({ network: () => js() });
    await w.respond(`${ORIGIN}/assets/index-abc.js`);
    expect(w.store.get(`${ORIGIN}/assets/index-abc.js`)).toBeDefined();
  });

  it("refuses to cache HTML served for a deleted chunk — the deploy race", async () => {
    // This is the exact failure: deploy N+1 removed the file, the catch-all
    // rewrite answered 200 text/html.
    const w = installWorker({ network: () => html("<!doctype html><div id=root>") });
    const res = await w.respond(`${ORIGIN}/assets/index-oldhash.js`);

    expect(w.written.size).toBe(0);
    expect(w.store.has(`${ORIGIN}/assets/index-oldhash.js`)).toBe(false);
    // The page still gets the response; we just refuse to remember it.
    expect(res.ok).toBe(true);
  });

  it("refuses to cache a 404", async () => {
    const w = installWorker({ network: () => notFound() });
    await w.respond(`${ORIGIN}/assets/gone.js`);
    expect(w.written.size).toBe(0);
  });

  it("refuses to cache a 500", async () => {
    const w = installWorker({ network: () => new FakeResponse(500, "boom", "text/html") });
    await w.respond(`${ORIGIN}/index.html`);
    expect(w.written.size).toBe(0);
  });

  it("caches a real stylesheet response", async () => {
    const w = installWorker({ network: () => css() });
    await w.respond(`${ORIGIN}/assets/index-abc.css`);
    expect(w.written.size).toBe(1);
    expect(w.store.get(`${ORIGIN}/assets/index-abc.css`)?.headers.get("content-type")).toBe(
      "text/css",
    );
  });

  it("refuses to cache a stylesheet slot filled with HTML", async () => {
    const w = installWorker({ network: () => html() });
    await w.respond(`${ORIGIN}/assets/index-abc.css`);
    expect(w.written.size).toBe(0);
  });

  it("accepts a content type with parameters, e.g. 'text/javascript; charset=utf-8'", async () => {
    const w = installWorker({
      network: () => new FakeResponse(200, "export const a=1;", "text/javascript; charset=utf-8"),
    });
    await w.respond(`${ORIGIN}/assets/index-abc.js`);
    expect(w.written.size).toBe(1);
  });

  it("accepts the 'module' content type", async () => {
    const w = installWorker({ network: () => new FakeResponse(200, "x", "module") });
    await w.respond(`${ORIGIN}/assets/index-abc.js`);
    expect(w.written.size).toBe(1);
  });

  it("refuses to cache an opaque cross-origin-style response", async () => {
    const w = installWorker({ network: () => new FakeResponse(200, "", "", "opaque") });
    await w.respond(`${ORIGIN}/assets/index-abc.js`);
    expect(w.written.size).toBe(0);
  });

  it("still caches icons and the manifest, whatever their type", async () => {
    const w = installWorker({ network: () => new FakeResponse(200, "png-bytes", "image/png") });
    await w.respond(`${ORIGIN}/icons/icon-192.png`);
    expect(w.written.size).toBe(1);
  });
});

describe("sw.js cache guard — already-poisoned clients self-heal", () => {
  const poisoned = `${ORIGIN}/assets/index-oldhash.js`;

  it("drops a poisoned entry instead of replaying it", async () => {
    // Seeded the way a pre-v4 worker would have left it: HTML under a .js URL.
    const w = installWorker({
      seed: { [poisoned]: html("<!doctype html>") },
      network: () => js(),
    });

    const res = await w.respond(poisoned);

    expect(w.deleted).toContain(poisoned);
    expect(res.headers.get("content-type")).toBe("text/javascript");
    expect(w.store.get(poisoned)?.headers.get("content-type")).toBe("text/javascript");
  });

  it("serves a healthy cached entry without touching the network", async () => {
    const w = installWorker({
      seed: { [poisoned]: js() },
      network: () => js("fresh"),
    });

    const res = await w.respond(poisoned);

    expect(w.fetchCalls).toEqual([]);
    expect(res.body).toBe("export const a=1;");
  });

  it("heals a poisoned entry even while offline, by deleting it", async () => {
    // A user with no network still must not be served HTML as a module. The
    // delete happens before the fetch, so the next online load is clean.
    const w = installWorker({
      seed: { [poisoned]: html() },
      network: () => js(),
      offline: true,
    });

    await expect(w.respond(poisoned)).rejects.toThrow("offline");
    expect(w.deleted).toContain(poisoned);
    expect(w.store.has(poisoned)).toBe(false);
  });
});

describe("sw.js navigation and scope rules still hold", () => {
  it("caches a successful navigation for offline use", async () => {
    const w = installWorker({ network: () => html() });
    await w.respond(`${ORIGIN}/`, { mode: "navigate" });
    expect(w.store.get(`${ORIGIN}/`)).toBeDefined();
  });

  it("serves the cached shell when the network fails", async () => {
    const w = installWorker({
      seed: { "/index.html": html("<!doctype html>offline shell") },
      offline: true,
    });
    const res = await w.respond(`${ORIGIN}/`, { mode: "navigate" });
    expect(res.body).toBe("<!doctype html>offline shell");
  });

  it("does not intercept cross-origin traffic", async () => {
    // Firebase Auth/Firestore traffic must reach the network untouched.
    const w = installWorker({ network: () => js() });
    await expect(w.respond("https://firestore.googleapis.com/v1/x")).rejects.toThrow(
      /did not respond/,
    );
    expect(w.fetchCalls).toEqual([]);
  });

  it("ignores non-GET requests", async () => {
    const w = installWorker({ network: () => js() });
    let responded = false;
    try {
      await w.respond(`${ORIGIN}/api/thing`, { method: "POST" });
      responded = true;
    } catch {
      responded = false;
    }
    expect(responded).toBe(false);
    expect(w.fetchCalls).toEqual([]);
  });
});

describe("sw.js version and structure", () => {
  it("is on a cache version newer than the poisoning era (v3)", () => {
    // v4 flushes the poisoned caches that v3 wrote on activate.
    expect(swCacheName(swSource)).toBe("gym-progress-ai-v4");
  });

  it("still never touches Firebase traffic or imports anything", () => {
    expect(swSource).toContain("url.origin !== self.location.origin");
    expect(swSource).not.toContain("importScripts");
    expect(swSource).not.toContain("firebase");
  });

  it("guards both the write path and the read path", () => {
    expect(swSource).toContain("isCacheable(response, kind)");
    expect(swSource).toContain("isCacheable(hit, kind)");
    expect(swSource).toContain("cache.delete(request)");
  });
});
