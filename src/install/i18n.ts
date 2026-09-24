import type { IosBrowser } from "./iosBrowser";

export type Lang = "en" | "es" | "fr" | "de";

export interface InstallCopy {
  steps: Record<IosBrowser, string>;
  tail: string;
  nudge: string;
  dismiss: string;
  close: string;
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
  en: {
    steps: {
      safari:
        "In Safari, tap the Share button, then “Add to Home Screen”, then Add — choose “Web App” if asked. Don’t see the option? Scroll to Edit Actions and add it.",
      chrome:
        "In Chrome, tap Share to the right of the address bar, then “Add to Home Screen”, then Add — choose “Web App” if asked.",
      firefox:
        "In Firefox, tap the ☰ menu, then Share, then “Add to Home Screen”, then Add — choose “Web App” if asked.",
      edge:
        "In Edge, tap the Share icon (the box with an arrow), then “Add to Home Screen”, then Add — choose “Web App” if asked.",
      other:
        "In your browser, open Share, then tap “Add to Home Screen”, then Add — choose “Web App” if asked.",
    },
    tail: "The app opens full screen from your Home Screen.",
    nudge: "Get the app: open Share and tap “Add to Home Screen”, then Add.",
    dismiss: "DISMISS",
    close: "CLOSE",
  },
  fr: {
    steps: {
      safari:
        "Dans Safari, appuyez sur Partager, puis touchez « Sur l’écran d’accueil », puis Ajouter — choisissez l’app web si on vous le demande. Vous ne voyez pas l’option ? Vous pouvez l’ajouter dans la liste.",
      chrome:
        "Dans Chrome, appuyez sur Partager à droite de la barre d’adresse, puis touchez « Sur l’écran d’accueil », puis Ajouter — choisissez l’app web si on vous le demande.",
      firefox:
        "Dans Firefox, appuyez sur le menu ☰, puis Partager, puis « Sur l’écran d’accueil », puis Ajouter — choisissez l’app web si on vous le demande.",
      edge:
        "Dans Edge, appuyez sur l’icône Partager (le carré avec une flèche), puis « Sur l’écran d’accueil », puis Ajouter — choisissez l’app web si on vous le demande.",
      other:
        "Dans votre navigateur, ouvrez Partager, puis touchez « Sur l’écran d’accueil », puis Ajouter — choisissez l’app web si on vous le demande.",
    },
    tail: "L’app s’ouvre en plein écran depuis votre écran d’accueil.",
    nudge:
      "Installez l’app : ouvrez Partager et touchez « Sur l’écran d’accueil », puis Ajouter.",
    dismiss: "IGNORER",
    close: "FERMER",
  },
  es: {
    steps: {
      safari:
        "En Safari, toca Compartir, luego « Añadir a pantalla de inicio », luego Añadir — elige la aplicación web si te lo piden. ¿No ves la opción? Puedes añadirla en la lista.",
      chrome:
        "En Chrome, toca Compartir a la derecha de la barra de direcciones, luego « Añadir a pantalla de inicio », luego Añadir — elige la aplicación web si te lo piden.",
      firefox:
        "En Firefox, toca el menú ☰, luego Compartir, luego « Añadir a pantalla de inicio », luego Añadir — elige la aplicación web si te lo piden.",
      edge:
        "En Edge, toca el icono Compartir (el cuadro con una flecha), luego « Añadir a pantalla de inicio », luego Añadir — elige la aplicación web si te lo piden.",
      other:
        "En tu navegador, abre Compartir y toca « Añadir a pantalla de inicio », luego Añadir — elige la aplicación web si te lo piden.",
    },
    tail: "La app se abre a pantalla completa desde tu pantalla de inicio.",
    nudge:
      "Consigue la app: abre Compartir y toca « Añadir a pantalla de inicio », luego Añadir.",
    dismiss: "OMITIR",
    close: "CERRAR",
  },
  de: {
    steps: {
      safari:
        "Tippe in Safari auf Teilen, dann auf „Zum Home-Bildschirm“, dann auf Hinzufügen — wähle bei Aufforderung die Web-App. Die Option fehlt? Du kannst sie unten in der Liste hinzufügen.",
      chrome:
        "Tippe in Chrome rechts neben der Adressleiste auf Teilen, dann auf „Zum Home-Bildschirm“, dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
      firefox:
        "Tippe in Firefox auf das Menü ☰, dann auf Teilen, dann auf „Zum Home-Bildschirm“, dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
      edge:
        "Tippe in Edge auf das Teilen-Symbol (das Quadrat mit Pfeil), dann auf „Zum Home-Bildschirm“, dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
      other:
        "Öffne in deinem Browser Teilen, tippe auf „Zum Home-Bildschirm“, dann auf Hinzufügen — wähle bei Aufforderung die Web-App.",
    },
    tail: "Die App öffnet sich im Vollbild über deinen Home-Bildschrim.",
    nudge:
      "Hol dir die App: öffne Teilen und tippe auf „Zum Home-Bildschirm“, dann auf Hinzufügen.",
    dismiss: "IGNORIEREN",
    close: "SCHLIESSEN",
  },
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
