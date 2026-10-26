import { useAuth } from '../hooks/auth';

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** "Sign in with Microsoft" for staff; hidden when the portal has no Entra ID app configured. */
export function MicrosoftSignIn({ next }: { next?: string }) {
  const { signIn } = useAuth();
  if (!signIn.microsoft) return null;
  const domains = signIn.microsoft_domains.map((d) => `@${d}`).join(' or ');
  // A full-page navigation: the server redirects to Microsoft and back.
  const href = `/api/auth/microsoft/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <div className="stack-sm">
      <a className="btn btn-block btn-microsoft" href={href}>
        <MicrosoftLogo /> Sign in with Microsoft
      </a>
      {domains && <p className="faint small center">Staff with an {domains} Microsoft 365 account.</p>}
      <div className="auth-divider"><span>or use your email and password</span></div>
    </div>
  );
}
