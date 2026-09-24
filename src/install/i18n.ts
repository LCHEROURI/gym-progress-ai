import type { IosBrowser } from "./iosBrowser";

export type Lang = "en" | "es" | "fr" | "de";

/**
 * Install steps as illustrated-step slices. Every slice is a VERBATIM piece of
 * the original one-sentence wording: `steps` is derived by joining share +
 * home + add (+ note) with single spaces, so the diagram captions and the
 * sentence can never drift apart. The quoted phrases are real iOS UI labels,
 * localized by iOS itself and verified against Apple's localized iPhone
 * guides (2026-09-24): fr « Sur l'écran d'accueil », de „Zum Home-Bildschirm",
 * es « Añadir a pantalla de inicio ». Labels we could not verify per language
 * (the iOS 26 "Web App" choice, "Edit Actions") are paraphrased, never
 * quoted — same rule as the locked English copy in IosInstallHint.test.tsx.
 */
export interface StepSlices {
  /** Step 1: reach the share sheet (browser-specific). */
  share: Record<IosBrowser, string>;
  /** Step 2: the share-sheet row (verified iOS label quoted). */
  home: Record<IosBrowser, string>;
  /** Step 3: confirm — Add plus the "Web App" choice (paraphrased off English). */
  add: Record<IosBrowser, string>;
  /** Optional fallback note (Safari's Edit Actions quirk). */
  note: Partial<Record<IosBrowser, string>>;
}

export interface InstallCopy {
  /** Derived from `slices` — the exact one-sentence wording. */
  steps: Record<IosBrowser, string>;
  slices: StepSlices;
  tail: string;
  nudge: string;
  dismiss: string;
  close: string;
}

const BROWSERS: readonly IosBrowser[] = [
  "safari",
  "chrome",
  "firefox",
  "edge",
  "other",
];

function joinSlices(slices: StepSlices): Record<IosBrowser, string> {
  const steps = {} as Record<IosBrowser, string>;
  for (const b of BROWSERS) {
    steps[b] = [slices.share[b], slices.home[b], slices.add[b], slices.note[b]]
      .filter(Boolean)
      .join(" ");
  }
  return steps;
}

function copy(
  slices: StepSlices,
  tail: string,
  nudge: string,
  dismiss: string,
  close: string,
): InstallCopy {
  return { slices, steps: joinSlices(slices), tail, nudge, dismiss, close };
}

/**
 * Install steps per device language. The quoted phrases are real iOS UI labels,
 * localized by iOS itself and verified against Apple's localized iPhone guides
 * (2026-09-24): fr « Sur l'écran d'accueil », de „Zum Home-Bildschirm", es
 * « Añadir a pantalla de inicio ». Labels we could not verify per language
 * (the iOS 26 "Web App" choice, "Edit Actions") are paraphrased, never quoted —
 * same rule as the locked English copy in IosInstallHint.test.tsx.
 */
export const INSTALL_COPY: Record<Lang, InstallCopy> = {
  en: copy(
    {
      share: {
        safari: "In Safari, tap the Share button,",
        chrome: "In Chrome, tap Share to the right of the address bar,",
        firefox: "In Firefox, tap the ☰ menu, then Share,",
        edge: "In Edge, tap the Share icon (the box with an arrow),",
        other: "In your browser, open Share, then tap",
      },
      home: {
        safari: "then “Add to Home Screen”,",
        chrome: "then “Add to Home Screen”,",
        firefox: "then “Add to Home Screen”,",
        edge: "then “Add to Home Screen”,",
        other: "“Add to Home Screen”,",
      },
      add: {
        safari: "then Add — choose “Web App” if asked.",
        chrome: "then Add — choose “Web App” if asked.",
        firefox: "then Add — choose “Web App” if asked.",
        edge: "then Add — choose “Web App” if asked.",
        other: "then Add — choose “Web App” if asked.",
      },
      note: {
        safari: "Don’t see the option? Scroll to Edit Actions and add it.",
      },
    },
    "The app opens full screen from your Home Screen.",
    "Get the app: open Share and tap “Add to Home Screen”, then Add.",
    "DISMISS",
    "CLOSE",
  ),
  fr: copy(
    {
      share: {
        safari: "Dans Safari, appuyez sur Partager,",
        chrome: "Dans Chrome, appuyez sur Partager à droite de la barre d’adresse,",
        firefox: "Dans Firefox, appuyez sur le menu ☰, puis Partager,",
        edge: "Dans Edge, appuyez sur l’icône Partager (le carré avec une flèche),",
        other: "Dans votre navigateur, ouvrez Partager,",
      },
      home: {
        safari: "puis touchez « Sur l’écran d’accueil »,",
        chrome: "puis touchez « Sur l’écran d’accueil »,",
        firefox: "puis touchez « Sur l’écran d’accueil »,",
        edge: "puis touchez « Sur l’écran d’accueil »,",
        other: "puis touchez « Sur l’écran d’accueil »,",
      },
      add: {
        safari: "puis Ajouter — choisissez l’app web si on vous le demande.",
        chrome: "puis Ajouter — choisissez l’app web si on vous le demande.",
        firefox: "puis Ajouter — choisissez l’app web si on vous le demande.",
        edge: "puis Ajouter — choisissez l’app web si on vous le demande.",
        other: "puis Ajouter — choisissez l’app web si on vous le demande.",
      },
      note: {
        safari:
          "Vous ne voyez pas l’option ? Vous pouvez l’ajouter dans la liste.",
      },
    },
    "L’app s’ouvre en plein écran depuis votre écran d’accueil.",
    "Installez l’app : ouvrez Partager et touchez « Sur l’écran d’accueil », puis Ajouter.",
    "IGNORER",
    "FERMER",
  ),
  es: copy(
    {
      share: {
        safari: "En Safari, toca Compartir,",
        chrome: "En Chrome, toca Compartir a la derecha de la barra de direcciones,",
        firefox: "En Firefox, toca el menú ☰, luego Compartir,",
        edge: "En Edge, toca el icono Compartir (el cuadro con una flecha),",
        other: "En tu navegador, abre Compartir,",
      },
      home: {
        safari: "luego « Añadir a pantalla de inicio »,",
        chrome: "luego « Añadir a pantalla de inicio »,",
        firefox: "luego « Añadir a pantalla de inicio »,",
        edge: "luego « Añadir a pantalla de inicio »,",
        other: "y toca « Añadir a pantalla de inicio »,",
      },
      add: {
        safari: "luego Añadir — elige la aplicación web si te lo piden.",
        chrome: "luego Añadir — elige la aplicación web si te lo piden.",
        firefox: "luego Añadir — elige la aplicación web si te lo piden.",
        edge: "luego Añadir — elige la aplicación web si te lo piden.",
        other: "luego Añadir — elige la aplicación web si te lo piden.",
      },
      note: {
        safari: "¿No ves la opción? Puedes añadirla en la lista.",
      },
    },
    "La app se abre a pantalla completa desde tu pantalla de inicio.",
    "Consigue la app: abre Compartir y toca « Añadir a pantalla de inicio », luego Añadir.",
    "OMITIR",
    "CERRAR",
  ),
  de: copy(
    {
      share: {
        safari: "Tippe in Safari auf Teilen,",
        chrome: "Tippe in Chrome rechts neben der Adressleiste auf Teilen,",
        firefox: "Tippe in Firefox auf das Menü ☰, dann auf Teilen,",
        edge: "Tippe in Edge auf das Teilen-Symbol (das Quadrat mit Pfeil),",
        other: "Öffne in deinem Browser Teilen,",
      },
      home: {
        safari: "dann auf „Zum Home-Bildschirm“,",
        chrome: "dann auf „Zum Home-Bildschirm“,",
        firefox: "dann auf „Zum Home-Bildschirm“,",
        edge: "dann auf „Zum Home-Bildschirm“,",
        other: "tippe auf „Zum Home-Bildschirm“,",
      },
      add: {
        safari: "dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
        chrome: "dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
        firefox: "dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
        edge: "dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
        other: "dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
      },
      note: {
        safari: "Die Option fehlt? Du kannst sie unten in der Liste hinzufügen.",
      },
    },
    "Die App öffnet sich im Vollbild über deinen Home-Bildschrim.",
    "Hol dir die App: öffne Teilen und tippe auf „Zum Home-Bildschirm“, dann auf Hinzufügen.",
    "IGNORIEREN",
    "SCHLIESSEN",
  ),
};

/** First supported language in the device list; English otherwise. */
export function detectLang(
  languages: readonly (string | undefined)[] | undefined,
): Lang {
  for (const tag of languages ?? []) {
    const base = (tag ?? "").split("-")[0].toLowerCase();
    if (base in INSTALL_COPY) return base as Lang;
  }
  return "en";
}

export function installCopy(
  languages?: readonly (string | undefined)[],
): InstallCopy {
  return INSTALL_COPY[detectLang(languages)];
}
