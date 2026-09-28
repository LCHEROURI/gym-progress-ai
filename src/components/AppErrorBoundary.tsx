import { Component, type ReactNode } from "react";
import { reportRenderFailure } from "../shared/boot-monitor";
import { attemptChunkRecovery } from "../shared/chunk-recovery";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    // The pre-React probe already reported "never mounted" for this crash by
    // now; this replaces that generic timeout with the real cause.
    const message = error instanceof Error ? error.message : String(error);
    reportRenderFailure(message);

    // A failed chunk load is usually just a stale shell from before a deploy:
    // one reload fetches the new build and the chunk resolves. The recovery
    // guard allows a single attempt per session, so a device with no network
    // cannot loop — it lands on the error UI below instead.
    if (attemptChunkRecovery(message) === "reloading") return;
  }

  render() {
    if (this.state.hasError) {
      return (
        <main>
          <h1>Gym Progress AI</h1>
          <section aria-labelledby="app-error-title">
            <h2 id="app-error-title">We couldn’t load the app</h2>
            <p role="alert">
              Reload this page to try again. If the issue continues, check your
              connection and reopen the app.
            </p>
            <button
              className="primaryButton"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
