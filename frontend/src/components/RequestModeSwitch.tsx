import { Link } from 'react-router-dom';
import { User, Users } from 'lucide-react';

/** Switch the New request page between one visitor and a group of visitors. */
export function RequestModeSwitch({ mode }: { mode: 'single' | 'group' }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Request type">
      <Link role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'active' : ''} to="/requests/new">
        <User size={16} /> Single visitor
      </Link>
      <Link role="tab" aria-selected={mode === 'group'} className={mode === 'group' ? 'active' : ''} to="/requests/new?mode=group">
        <Users size={16} /> Group of visitors
      </Link>
    </div>
  );
}
