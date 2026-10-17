import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/auth';
import { ThemeToggle } from '../components/ThemeToggle';

const STEPS = [
  { title: 'Submit a request', body: 'Enter visitor details, dates and purpose, and optionally attach supporting documents.' },
  { title: 'Get reviewed', body: 'An Access Controller approves or rejects it. You are notified by email either way.' },
  { title: 'Access the base', body: 'An Access Admin checks the approved request at the entrance before letting the visitor in.' },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="landing-nav">
        <img src="/ladol-logo.jpg" alt="LADOL" />
        <div className="row">
          <ThemeToggle />
          {user ? (
            <Link className="btn btn-primary" to="/dashboard">Go to dashboard</Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">Sign in</Link>
              <Link className="btn btn-primary" to="/register">Create account</Link>
            </>
          )}
        </div>
      </header>
      <section className="hero" style={{ backgroundImage: 'url(/hero.jpeg)' }}>
        <div className="hero-inner">
          <span className="eyebrow">LADOL Access Request Portal</span>
          <h1>No access, no entry.</h1>
          <p>Request and track site access to the Lagos Deep Offshore Logistics Base, all in one place.</p>
          <div className="row" style={{ marginTop: 28, flexWrap: 'wrap' }}>
            <Link className="btn btn-gold" to={user ? '/requests/new' : '/login'}>Get started</Link>
            {!user && <Link className="btn btn-outline" to="/register">Register</Link>}
          </div>
        </div>
      </section>
      <section className="steps">
        {STEPS.map((s, i) => (
          <div className="step" key={s.title}>
            <span className="num">{i + 1}</span>
            <div className="stack-sm">
              <h3>{s.title}</h3>
              <p className="muted">{s.body}</p>
            </div>
          </div>
        ))}
      </section>
      <footer className="footer">© {new Date().getFullYear()} LADOL. All rights reserved.</footer>
    </div>
  );
}
