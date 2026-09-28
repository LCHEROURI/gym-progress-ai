import { Component, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
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
