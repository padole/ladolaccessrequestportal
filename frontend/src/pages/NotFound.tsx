import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

export default function NotFound() {
  return (
    <div className="center-fill" style={{ minHeight: '100%', flexDirection: 'column', gap: 12 }}>
      <ThemeToggle floating />
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      <Link className="btn btn-primary" to="/">Go home</Link>
    </div>
  );
}
