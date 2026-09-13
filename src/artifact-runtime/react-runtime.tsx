/**
 * Runs React artifacts inside the sandboxed cellar-artifact:// iframe.
 * Bundled as a standalone IIFE so artifacts work offline with no CDN access.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import * as Lucide from 'lucide-react';
import { transform } from 'sucrase';

const modules: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': { createRoot },
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': Lucide,
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) return <ErrorView error={this.state.error} />;
    return this.props.children;
  }
}

function ErrorView({ error }: { error: unknown }) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20, color: '#b42318' }}>
      <strong>This artifact could not run</strong>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8, color: '#5c1f16' }}>{message}</pre>
    </div>
  );
}

function mount(source: string): void {
  const container = document.getElementById('root');
  if (!container) return;
  const root = createRoot(container);
  try {
    const { code } = transform(source, { transforms: ['jsx', 'typescript', 'imports'], production: true, jsxRuntime: 'classic' });
    const module = { exports: {} as Record<string, unknown> };
    const require = (name: string) => {
      if (name in modules) return modules[name];
      throw new Error(`"${name}" is not available in Cellar artifacts. Available: ${Object.keys(modules).join(', ')}`);
    };
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', 'React', code)(require, module, module.exports, React);
    const exported = module.exports;
    const Component = (exported.default ?? Object.values(exported).find((v) => typeof v === 'function')) as React.ComponentType | undefined;
    if (!Component) throw new Error('No React component was exported. Add `export default function App() { … }`.');
    root.render(
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>,
    );
  } catch (err) {
    root.render(<ErrorView error={err} />);
  }
}

(window as unknown as { CellarArtifact: { mount: typeof mount } }).CellarArtifact = { mount };
