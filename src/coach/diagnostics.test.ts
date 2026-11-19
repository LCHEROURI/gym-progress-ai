import { describe, expect, it } from "vitest";
import { classifyCoachError } from "./diagnostics";

const RAW_SECRET = "API key AIza-not-a-real-key leaked in the failure payload";

describe("classifyCoachError", () => {
  it("detects an App Check refusal from the provider", () => {
    const d = classifyCoachError(
      new Error("Permission denied: App Check token is invalid."),
      "active",
    );
    expect(d.category).toBe("app-check");
    expect(d.detail).toContain("App Check");
  });

  it("blames App Check when it is not active and the provider refuses the request", () => {
    const d = classifyCoachError(new Error("403 PERMISSION_DENIED"), "failed");
    expect(d.category).toBe("app-check");
  });

  it("classifies authentication failures", () => {
    const d = classifyCoachError(new Error("401 UNAUTHENTICATED"), "active");
    expect(d.category).toBe("auth");
    expect(d.detail).toContain("authorized");
  });

  it("classifies quota exhaustion", () => {
    const d = classifyCoachError(
      new Error("429 RESOURCE_EXHAUSTED: quota exceeded for project x"),
      "active",
    );
    expect(d.category).toBe("quota");
  });

  it("classifies model provisioning errors", () => {
    const d = classifyCoachError(
      new Error("404 Not Found: models/gemini-2.5-flash is not enabled"),
      "active",
    );
    expect(d.category).toBe("model");
  });

  it("classifies API unavailability", () => {
    const d = classifyCoachError(new Error("503 Service Unavailable"), "active");
    expect(d.category).toBe("api-unavailable");
  });

  it("classifies network failures", () => {
    const d = classifyCoachError(new TypeError("Failed to fetch"), "active");
    expect(d.category).toBe("network");
  });

  it("classifies non-Error throwables without crashing", () => {
    expect(classifyCoachError("some plain string failure", "active").category).toBe("unknown");
    expect(classifyCoachError(undefined, "active").category).toBe("unknown");
    expect(classifyCoachError({ message: "429 too many requests" }, "active").category).toBe(
      "quota",
    );
  });

  it("falls back to unknown without exposing the raw error", () => {
    const d = classifyCoachError(new Error(RAW_SECRET), "active");
    expect(d.category).toBe("unknown");
    expect(d).toMatchObject({ category: "unknown", detail: expect.any(String), code: "Error" });
    expect(d.hint).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain("AIza-not-a-real-key");
  });

  it("never includes the raw error message in any diagnostic", () => {
    for (const status of ["active", "failed", "disabled", "emulator"] as const) {
      const d = classifyCoachError(new Error(RAW_SECRET), status);
      expect(JSON.stringify(d)).not.toContain("AIza-not-a-real-key");
      expect(JSON.stringify(d)).not.toContain("failure payload");
      const allowedKeys = ["category", "detail", "code", "hint"];
      expect(Object.keys(d).every((key) => allowedKeys.includes(key))).toBe(true);
    }
  });

  it("surfaces a structured error code from a FirebaseError-like object", () => {
    const d = classifyCoachError(
      { code: "ai/request-error", name: "FirebaseError", message: "unrecognized refusal" },
      "active",
    );
    expect(d.code).toBe("ai/request-error");
    expect(d.category).toBe("unknown");
    expect(d.detail).toBe("The AI service refused the request.");
  });

  it("falls back to the error name and then unknown when no code exists", () => {
    expect(classifyCoachError(new TypeError("Failed to fetch"), "active").code).toBe(
      "TypeError",
    );
    expect(classifyCoachError("plain string failure", "active").code).toBe("unknown");
    expect(classifyCoachError(undefined, "active").code).toBe("unknown");
  });

  it("omits the hint when the message contains credential-like text", () => {
    const d = classifyCoachError(
      new Error("Request failed: API key AIzaSyABC123 rejected"),
      "active",
    );
    expect(d.hint).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain("AIzaSyABC123");
  });

  it("strips URLs, key/value credentials and project ids from the hint", () => {
    const d = classifyCoachError(
      new Error(
        "quota exceeded for project gym-progress-ai-lcherouri at https://example.com/x?token=abc",
      ),
      "active",
    );
    expect(d.hint).toBe("quota exceeded");
    expect(JSON.stringify(d)).not.toContain("gym-progress-ai-lcherouri");
    expect(JSON.stringify(d)).not.toContain("example.com");
  });
});
