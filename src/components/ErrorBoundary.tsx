/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/ErrorBoundary.tsx — a safety net around the whole app
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT IT DOES
 *  If any component throws while rendering, React unmounts the ENTIRE app and
 *  leaves a blank page. An "error boundary" catches that and shows a friendly
 *  message with a way out instead.
 *
 *  ("Error boundary" must be a class component — it's the one thing hooks can't
 *  do yet. That's why this file looks different from the others.)
 *
 *  THE WAY OUT
 *    Try again     re-render (fixes one-off glitches)
 *    Reset & reload  clears everything this app saved in the browser
 *                    (draft, closet copy, taste log…) and reloads. Useful if a
 *                    corrupt saved value is what's crashing the app. If you've
 *                    connected Supabase, your closet comes back from there.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Visible in the browser's developer console for debugging.
    console.error("App crashed:", error, info.componentStack);
  }

  private resetAndReload = () => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("wtw."))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.hash = "/home";
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" role="alert" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <p className="eyebrow">Something snagged</p>
        <h2>That didn&apos;t go to plan</h2>
        <p>
          The page hit an unexpected error. Your saved outfits are safe. You can try again, or reset the local data
          this app keeps in your browser.
        </p>
        <code style={{ fontSize: 12, color: "var(--muted)", maxWidth: 520, wordBreak: "break-word" }}>
          {this.state.error.message}
        </code>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost" onClick={this.resetAndReload}>
            Reset &amp; reload
          </button>
        </div>
      </div>
    );
  }
}
