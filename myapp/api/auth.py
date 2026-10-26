from datetime import datetime

from flask import current_app, jsonify
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from myapp.api import api_bp
from myapp.api.utils import (EMAIL_RE, REGISTRATION_COMPANIES, clean, error, frontend_url, password_problem, payload,
                             send_email)
from myapp.models import Role, User, db

RESET_SALT = 'password-reset'
RESET_MAX_AGE = 3600


def _serializer():
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt=RESET_SALT)


def _pwd_fingerprint(user):
    # Embedding part of the current hash makes a reset link single-use:
    # once the password changes, the old link no longer verifies.
    return (user.user_pwd or '')[-12:]


def _find_by_email(email):
    return User.query.filter(db.func.lower(User.user_email) == email.lower()).first()


@api_bp.get('/auth/csrf')
def csrf_token():
    return jsonify(csrf_token=generate_csrf())


@api_bp.get('/auth/me')
def me():
    from myapp.api.microsoft import microsoft_enabled
    sign_in = {'microsoft': microsoft_enabled(), 'microsoft_domains': current_app.config['MS_ALLOWED_DOMAINS']}
    if not current_user.is_authenticated:
        return jsonify(user=None, sign_in=sign_in)
    return jsonify(user=current_user.to_dict(), sign_in=sign_in)


@api_bp.post('/auth/login')
def login():
    data = payload()
    email = clean(data.get('email')).lower()
    password = data.get('password') or ''
    if not email or not password:
        return error('Email and password are required.')
    user = _find_by_email(email)
    if not user or not user.check_password(password):
        return error('Invalid email or password.', 401)
    if not user.is_active:
        return error('This account has been disabled. Please contact an administrator.', 403)
    login_user(user, remember=bool(data.get('remember')))
    user.last_login_at = datetime.utcnow()
    db.session.commit()
    return jsonify(user=user.to_dict())


@api_bp.post('/auth/logout')
def logout():
    logout_user()
    return jsonify(ok=True)


@api_bp.post('/auth/register')
def register():
    data = payload()
    fields = {
        'first_name': clean(data.get('first_name')),
        'last_name': clean(data.get('last_name')),
        'email': clean(data.get('email')).lower(),
        'phone': clean(data.get('phone')),
        'job_title': clean(data.get('job_title'))[:200],
        'company': clean(data.get('company'))[:200],
    }
    password = data.get('password') or ''
    problems = {k: 'This field is required.' for k, v in fields.items() if not v}
    if fields['company'] and fields['company'] not in REGISTRATION_COMPANIES:
        problems['company'] = 'Choose your company from the list.'
    if fields['email'] and not EMAIL_RE.match(fields['email']):
        problems['email'] = 'Enter a valid email address.'
    if pw := password_problem(password):
        problems['password'] = pw
    if password != data.get('confirm_password'):
        problems['confirm_password'] = 'Passwords do not match.'
    if not problems.get('email') and _find_by_email(fields['email']):
        problems['email'] = 'An account with this email already exists.'
    if problems:
        return error('Please fix the highlighted fields.', 422, problems)

    user = User(
        user_fname=fields['first_name'],
        user_lname=fields['last_name'],
        user_email=fields['email'],
        user_phone=fields['phone'],
        user_job_title=fields['job_title'],
        user_company=fields['company'],
        role=Role.USER.value,  # self-registration never grants admin
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(user=user.to_dict()), 201


@api_bp.post('/auth/forgot-password')
def forgot_password():
    email = clean(payload().get('email')).lower()
    if not EMAIL_RE.match(email):
        return error('Enter a valid email address.', 422, {'email': 'Enter a valid email address.'})
    user = _find_by_email(email)
    if user and user.is_active:
        token = _serializer().dumps({'uid': user.user_id, 'fp': _pwd_fingerprint(user)})
        link = frontend_url(f'reset-password/{token}')
        send_email(
            'Reset your Ladol Access password',
            [user.user_email],
            f'Hello {user.user_fname},\n\nReset your password using this link (valid for 1 hour):\n{link}\n\n'
            'If you did not request this, you can ignore this email.',
        )
    # Same response either way so the endpoint cannot be used to discover accounts.
    return jsonify(message='If that email is registered, a reset link is on its way.')


@api_bp.post('/auth/reset-password')
def reset_password():
    data = payload()
    try:
        info = _serializer().loads(data.get('token') or '', max_age=RESET_MAX_AGE)
    except SignatureExpired:
        return error('This reset link has expired. Please request a new one.')
    except BadSignature:
        return error('This reset link is invalid.')
    user = db.session.get(User, info.get('uid'))
    if not user or info.get('fp') != _pwd_fingerprint(user):
        return error('This reset link has already been used or is invalid.')
    password = data.get('password') or ''
    if pw := password_problem(password):
        return error(pw, 422, {'password': pw})
    if password != data.get('confirm_password'):
        return error('Passwords do not match.', 422, {'confirm_password': 'Passwords do not match.'})
    user.set_password(password)
    db.session.commit()
    return jsonify(message='Your password has been reset. You can now sign in.')


@api_bp.post('/auth/change-password')
@login_required
def change_password():
    data = payload()
    if not current_user.check_password(data.get('current_password') or ''):
        return error('Current password is incorrect.', 422, {'current_password': 'Current password is incorrect.'})
    password = data.get('new_password') or ''
    if pw := password_problem(password):
        return error(pw, 422, {'new_password': pw})
    if password != data.get('confirm_password'):
        return error('Passwords do not match.', 422, {'confirm_password': 'Passwords do not match.'})
    current_user.set_password(password)
    db.session.commit()
    return jsonify(message='Password changed successfully.')


@api_bp.patch('/auth/profile')
@login_required
def update_profile():
    data = payload()
    updates = {
        'user_fname': clean(data.get('first_name')),
        'user_lname': clean(data.get('last_name')),
        'user_phone': clean(data.get('phone')),
        'user_job_title': clean(data.get('job_title'))[:200],
        'user_company': clean(data.get('company'))[:200],
    }
    names = {'user_fname': 'first_name', 'user_lname': 'last_name', 'user_phone': 'phone',
             'user_job_title': 'job_title', 'user_company': 'company'}
    problems = {names[k]: 'This field is required.' for k, v in updates.items() if not v}
    # Existing users may keep a company from before the list existed; new choices must come from it.
    company = updates['user_company']
    if company and company != current_user.user_company and company not in REGISTRATION_COMPANIES:
        problems['company'] = 'Choose your company from the list.'
    if problems:
        return error('Please fix the highlighted fields.', 422, problems)
    for attr, value in updates.items():
        setattr(current_user, attr, value)
    db.session.commit()
    return jsonify(user=current_user.to_dict())
