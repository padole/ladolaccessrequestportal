import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art" style={{ backgroundImage: 'url(/hero.jpeg)' }}>
        <h2>LADOL Integrated Logistics Free Zone Enterprise</h2>
      </div>
      <div className="auth-panel">
        <ThemeToggle floating />
        <div className="auth-box">
          <Link to="/"><img className="logo" src="/ladol-logo.jpg" alt="LADOL" /></Link>
          <div className="stack-sm">
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
