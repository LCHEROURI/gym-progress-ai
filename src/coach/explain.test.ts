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
    expect(out.model).toBe("gemini-2.5-flash");
  });

  it("falls back to the deterministic reason on any failure", async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error("network"));
    const out = await explainSuggestion(app, { rule: "keep" }, "Keep it at 70 lb.");
    expect(out.reason).toBe("Keep it at 70 lb.");
    expect(out.model).toBe("deterministic");
  });

  it("falls back when the model returns nothing", async () => {
    mocks.generateContent.mockResolvedValueOnce({ response: { text: () => "   " } });
    const out = await explainSuggestion(app, {}, "fallback text");
    expect(out.reason).toBe("fallback text");
  });
});
