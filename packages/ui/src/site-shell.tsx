import type { ReactNode } from 'react';
export type SiteShellProps = {
  children: ReactNode;
  subtitle?: string;
  navigation?: ReadonlyArray<{ href: string; label: string }>;
};
export function SiteShell({ children, navigation = [], subtitle }: SiteShellProps) {
  return <div className="fisher-shell">
    <a href="#main-content" className="fisher-skip">Skip to main content</a>
    <header className="fisher-header">
      <div className="fisher-header-inner">
        <a className="fisher-brand" href="/" aria-label="Fisher Healthcare home">
          <span className="fisher-brand-symbol" aria-hidden="true">+</span>
          <span><strong>Fisher Healthcare</strong>{subtitle && <small>{subtitle}</small>}</span>
        </a>
        {navigation.length > 0 && <nav aria-label="Main navigation" className="fisher-nav">
          {navigation.map(item => <a href={item.href} key={item.href}>{item.label}</a>)}
        </nav>}
      </div>
    </header>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="fisher-footer">
      <div className="fisher-container">
        <strong>Fisher Healthcare</strong>
        <p>Healthcare diagnostics and sample collection, designed around people.</p>
        <small>© {new Date().getFullYear()} Fisher Healthcare · Lagos, Nigeria</small>
      </div>
    </footer>
  </div>;
}
