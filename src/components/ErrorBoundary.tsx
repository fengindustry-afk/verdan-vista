import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary clears its error and re-renders children. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in the subtree so one broken page shows a
 * recoverable fallback instead of white-screening the whole app. Placed around
 * the routed page content; `resetKey` (the current path) lets navigating away
 * clear the error automatically.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Route (or other reset key) changed after an error — recover automatically.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong on this page</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error stopped this page from rendering. Your data is safe — try again, or
            navigate to another page.
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-muted px-4 py-3 text-left text-[11px] text-muted-foreground">
            {this.state.error.message}
          </pre>
        )}
      </div>
    );
  }
}
