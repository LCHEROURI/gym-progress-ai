import { describe, expect, it } from "vitest";
import { INSTALL_COPY, detectLang, installCopy } from "./i18n";

describe("detectLang", () => {
  it("follows the device language list and falls back to English", () => {
    expect(detectLang(["fr-FR", "en-US"])).toBe("fr");
    expect(detectLang(["es-419"])).toBe("es");
    expect(detectLang(["de-DE"])).toBe("de");
    expect(detectLang(["pt-BR", "en"])).toBe("en");
    expect(detectLang(["he-IL"])).toBe("en");
    expect(detectLang([])).toBe("en");
    expect(detectLang(undefined)).toBe("en");
    expect(detectLang([undefined])).toBe("en");
  });

  it("returns the matching dictionary", () => {
    expect(installCopy(["fr-CA"])).toBe(INSTALL_COPY.fr);
    expect(installCopy()).toBe(INSTALL_COPY.en);
  });
});

describe("INSTALL_COPY", () => {
  it("is complete in every language", () => {
    for (const copy of Object.values(INSTALL_COPY)) {
      const strings = [
        ...Object.values(copy.steps),
        copy.tail,
        copy.nudge,
        copy.dismiss,
      ];
      for (const s of strings) expect(s.length).toBeGreaterThan(0);
    }
  });

  it("quotes the verified share-sheet label per language (locked)", () => {
    // iOS localizes its own UI labels; verified against Apple's localized
    // iPhone guides (2026-09-24): fr « Sur l'écran d'accueil » (guide
    // iph42ab2f3a7), de „Zum Home-Bildschirm", es « Añadir a pantalla de
    // inicio » (current share-sheet wording). Change only when the OS UI
    // changes — same policy as the locked English copy.
    expect(INSTALL_COPY.fr.steps.safari).toContain("« Sur l’écran d’accueil »");
    expect(INSTALL_COPY.de.steps.safari).toContain("„Zum Home-Bildschirm“");
    expect(INSTALL_COPY.es.steps.safari).toContain("« Añadir a pantalla de inicio »");
    expect(INSTALL_COPY.en.steps.safari).toContain("“Add to Home Screen”");
  });

  it("never quotes unverified per-language labels", () => {
    // The iOS 26 install choice and the share-sheet fallback are paraphrased
    // outside English — quoting them without vendor evidence would mislead.
    for (const lang of ["fr", "es", "de"] as const) {
      expect(INSTALL_COPY[lang].steps.safari).not.toContain("Web App”");
      expect(INSTALL_COPY[lang].steps.safari).not.toContain("Edit Actions");
    }
  });
});
