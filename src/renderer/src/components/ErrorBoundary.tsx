import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Without this, a single render error unmounts the whole React root and leaves a blank window — and a
 * packaged Electron build has no address bar to reload from, so the only way out is quitting the app.
 * Anything the model authored (tool arguments, markdown, design elements, board blocks) is rendered
 * somewhere below here, so an unexpected shape should cost a panel, not the session.
 */
export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? 'Something went wrong.');
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 overflow-auto p-8">
      <div className="w-full max-w-xl space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong in the interface</h1>
        <p className="text-sm text-muted-foreground">
          Your conversations and files are safe — this is only the window that failed to draw. Try again, and if it keeps happening, reload.
        </p>
        <pre className="selectable max-h-48 overflow-auto rounded-lg border border-divider bg-code px-3 py-2 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap text-fg-2">{message}</pre>
        {stack && (
          <details className="text-[12px] text-muted-foreground">
            <summary className="cursor-pointer select-none py-1">Technical details</summary>
            <pre className="selectable mt-1 max-h-64 overflow-auto rounded-lg border border-divider bg-code px-3 py-2 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-fg-2">{stack}</pre>
          </details>
        )}
        <div className="flex gap-2 pt-1">
          {onRetry && (
            <button onClick={onRetry} className="rounded-lg border border-divider px-3 py-1.5 text-sm text-foreground hover:bg-hover">
              Try again
            </button>
          )}
          <button onClick={() => window.location.reload()} className="rounded-lg border border-divider px-3 py-1.5 text-sm text-foreground hover:bg-hover">
            Reload Cellar
          </button>
        </div>
      </div>
    </div>
  );
}

interface State {
  error: unknown;
}

/** Catches render errors above the router, which covers the quick-entry window too. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Renderer error boundary caught:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
