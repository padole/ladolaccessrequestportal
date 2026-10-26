"""Sign in with Microsoft 365 (Entra ID) for staff of the organisation.

The browser is sent to Microsoft's own sign-in page; the portal never sees the
Microsoft password. On the way back we accept only accounts from our tenant with
an allowed email domain, link them to an existing portal account by email, or
create a new User account on first sign-in.
"""
import warnings
from datetime import datetime
from urllib.parse import urlencode

import msal
import requests as http
from flask import current_app, redirect, request, session
from flask_login import login_user

from myapp.api import api_bp
from myapp.api.utils import clean, frontend_url
from myapp.models import Role, User, db

SCOPES = ['User.Read']
GRAPH_ME = ('https://graph.microsoft.com/v1.0/me'
            '?$select=givenName,surname,jobTitle,mobilePhone,businessPhones')
FLOW_KEY = 'ms_auth_flow'
NEXT_KEY = 'ms_auth_next'
# Staff signing in with Microsoft work for the organisation itself.
STAFF_COMPANY = 'Ladol'
UNAVAILABLE = 'Microsoft sign-in is not available right now. Please try again later or use your email and password.'


def microsoft_enabled():
    cfg = current_app.config
    return bool(cfg.get('MS_TENANT_ID') and cfg.get('MS_CLIENT_ID') and cfg.get('MS_CLIENT_SECRET'))


def _client():
    cfg = current_app.config
    return msal.ConfidentialClientApplication(
        cfg['MS_CLIENT_ID'],
        client_credential=cfg['MS_CLIENT_SECRET'],
        authority=f"https://login.microsoftonline.com/{cfg['MS_TENANT_ID']}",
    )


def _redirect_uri():
    return frontend_url('api/auth/microsoft/callback')


def _fail(message):
    """Back to the sign-in page with a message it shows."""
    return redirect(frontend_url('login') + '?' + urlencode({'ms_error': message}))


def _safe_next(value):
    # Only same-site paths, so the sign-in can't be used to bounce users elsewhere.
    value = clean(value)
    return value if value.startswith('/') and not value.startswith('//') and '\\' not in value else '/dashboard'


def _graph_profile(access_token):
    """Job title and phone from Microsoft 365; never fails the sign-in."""
    try:
        res = http.get(GRAPH_ME, headers={'Authorization': f'Bearer {access_token}'}, timeout=10)
        return res.json() if res.ok else {}
    except (http.RequestException, ValueError):
        current_app.logger.warning('Could not read the Microsoft 365 profile', exc_info=True)
        return {}


def _split_name(claims, profile):
    first = clean(profile.get('givenName'))
    last = clean(profile.get('surname'))
    if not first:
        parts = clean(claims.get('name')).split(' ', 1)
        first, last = parts[0], last or (parts[1] if len(parts) > 1 else '')
    return first or 'Staff', last


@api_bp.get('/auth/microsoft/login')
def microsoft_login():
    if not microsoft_enabled():
        return _fail('Microsoft sign-in is not set up on this portal.')
    with warnings.catch_warnings():
        # MSAL suggests response_mode=form_post, but that cross-site POST would arrive without
        # our SameSite=Lax session cookie. The code in the query is single-use and needs PKCE
        # plus the client secret to redeem, so the default query mode is safe here.
        warnings.filterwarnings('ignore', message="response_mode='form_post'")
        try:
            flow = _client().initiate_auth_code_flow(SCOPES, redirect_uri=_redirect_uri(), prompt='select_account')
        except Exception:  # Microsoft unreachable, or a wrong MS_TENANT_ID
            current_app.logger.exception('Could not start Microsoft sign-in')
            return _fail(UNAVAILABLE)
    session[FLOW_KEY] = flow
    session[NEXT_KEY] = _safe_next(request.args.get('next'))
    return redirect(flow['auth_uri'])


@api_bp.get('/auth/microsoft/callback')
def microsoft_callback():
    flow = session.pop(FLOW_KEY, None)
    next_path = session.pop(NEXT_KEY, '/dashboard')
    if not microsoft_enabled():
        return _fail('Microsoft sign-in is not set up on this portal.')
    if request.args.get('error'):
        # e.g. the user cancelled, or the organisation hasn't granted consent.
        if request.args.get('error') == 'access_denied':
            return _fail('Microsoft sign-in was cancelled.')
        return _fail(f"Microsoft sign-in failed: {clean(request.args.get('error_description'))[:200] or request.args['error']}")
    if not flow:
        return _fail('Your sign-in session expired. Please try again.')

    try:
        client = _client()
    except Exception:
        current_app.logger.exception('Could not reach Microsoft')
        return _fail(UNAVAILABLE)
    try:
        # Checks the state, nonce and PKCE values that tie this reply to our request.
        result = client.acquire_token_by_auth_code_flow(flow, request.args.to_dict())
    except ValueError:
        return _fail('Your sign-in session expired. Please try again.')
    if 'error' in result:
        current_app.logger.warning('Microsoft token error: %s', result.get('error_description'))
        return _fail('Microsoft sign-in failed. Please try again.')

    cfg = current_app.config
    claims = result.get('id_token_claims') or {}
    if claims.get('tid') != cfg['MS_TENANT_ID']:
        return _fail('Only accounts from our organisation can sign in with Microsoft.')
    email = clean(claims.get('preferred_username') or claims.get('email')).lower()
    oid = clean(claims.get('oid'))
    domains = cfg['MS_ALLOWED_DOMAINS']
    if not oid or '@' not in email or (domains and email.rsplit('@', 1)[1] not in domains):
        allowed = ' or '.join(f'@{d}' for d in domains) or 'organisation'
        return _fail(f'Sign in with your {allowed} Microsoft 365 account.')

    user = (User.query.filter_by(ms_oid=oid).first()
            or User.query.filter(db.func.lower(User.user_email) == email).first())
    if user and user.ms_oid and user.ms_oid != oid:
        return _fail('This email is linked to a different Microsoft account. Contact an Access Controller.')

    profile = _graph_profile(result.get('access_token', ''))
    phone = clean(profile.get('mobilePhone')) or clean(next(iter(profile.get('businessPhones') or []), ''))
    if user is None:
        first, last = _split_name(claims, profile)
        user = User(
            user_fname=first[:100], user_lname=last[:100], user_email=email,
            user_phone=phone[:100], user_job_title=clean(profile.get('jobTitle'))[:200],
            user_company=STAFF_COMPANY, role=Role.USER.value,  # never grants a higher role
        )
        db.session.add(user)
    elif not user.is_active:
        return _fail('This account has been disabled. Please contact an administrator.')
    else:
        # Fill gaps from Microsoft 365, but never overwrite what the user entered.
        user.user_job_title = user.user_job_title or clean(profile.get('jobTitle'))[:200]
        user.user_phone = user.user_phone or phone[:100]
    user.ms_oid = oid
    user.last_login_at = datetime.utcnow()
    db.session.commit()
    login_user(user)

    if not (user.user_job_title and user.user_phone):
        return redirect(frontend_url('account') + '?complete=1')
    return redirect(frontend_url(next_path))
