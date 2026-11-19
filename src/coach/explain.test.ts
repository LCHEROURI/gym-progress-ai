import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  getAI: () => ({}),
  getGenerativeModel: () => ({ generateContent: mocks.generateContent }),
}));

import { explainSuggestion } from "./explain";

const app = {} as never;

describe("explainSuggestion", () => {
  it("returns the model's one-liner when available", async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: { text: () => "Your legs are ready for five more pounds." },
    });
    const out = await explainSuggestion(app, { rule: "progress" }, "fallback");
    expect(out.reason).toBe("Your legs are ready for five more pounds.");
    expect(out.source).toBe("model");
    expect(out.diagnostic).toBeNull();
    expect(out.model).toBe("gemini-2.5-flash");
  });

  it("falls back to the deterministic reason with safe diagnostics and warning on failure", async () => {
    const raw =
      "429 RESOURCE_EXHAUSTED: quota exceeded for project gym-progress-ai-lcherouri";
    mocks.generateContent.mockRejectedValueOnce(new Error(raw));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await explainSuggestion(app, { rule: "keep" }, "Keep it at 70 lb.");
      expect(out.reason).toBe("Keep it at 70 lb.");
      expect(out.source).toBe("deterministic");
      expect(out.model).toBe("deterministic");
      expect(out.diagnostic?.category).toBe("quota");
      expect(out.diagnostic?.detail).toContain("quota");
      expect(out.diagnostic?.code).toBe("Error");
      expect(out.diagnostic?.hint).toBe("429 RESOURCE_EXHAUSTED: quota exceeded");
      expect(JSON.stringify(out)).not.toContain("gym-progress-ai-lcherouri");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("gym-progress-ai-lcherouri");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toBe("[coach] Gemini explanation failed");
      expect(warn.mock.calls[0]?.[1]).toEqual({
        category: "quota",
        detail: expect.any(String),
        code: "Error",
        hint: "429 RESOURCE_EXHAUSTED: quota exceeded",
        model: "gemini-2.5-flash",
        promptVersion: "weight-explanation-v2",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("falls back with a model diagnostic when the model returns nothing", async () => {
    mocks.generateContent.mockResolvedValueOnce({ response: { text: () => "   " } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await explainSuggestion(app, {}, "fallback text");
      expect(out.reason).toBe("fallback text");
      expect(out.source).toBe("deterministic");
      expect(out.model).toBe("deterministic");
      expect(out.diagnostic?.category).toBe("model");
      expect(out.diagnostic?.detail).toContain("empty answer");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toBe("[coach] Gemini explanation returned no text");
    } finally {
      warn.mockRestore();
    }
  });
});
