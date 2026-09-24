export type InstallStatus = "installed" | "not-installed";

export interface StatusEnv {
  /** Installed PWA: `display-mode: standalone` matches. */
  standalone: boolean;
  /** iOS Safari Home Screen mode (apple-mobile-web-app-capable). */
  appleStandalone: boolean;
  /** The browser reported `appinstalled` during this session. */
  installedThisSession: boolean;
}

/** Installed once it runs from the Home Screen or the browser confirmed install. */
export function getInstallStatus(env: StatusEnv): InstallStatus {
  return env.standalone || env.appleStandalone || env.installedThisSession
    ? "installed"
    : "not-installed";
}
