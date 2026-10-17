import re
from functools import wraps

from flask import current_app, jsonify, request
from flask_login import current_user, login_required
from flask_mail import Message

from myapp import mail

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
MIN_PASSWORD_LENGTH = 8


class ApiError(Exception):
    def __init__(self, message, status=400, fields=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.fields = fields or {}


def error(message, status=400, fields=None):
    body = {'error': message}
    if fields:
        body['fields'] = fields
    return jsonify(body), status


def controller_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if not current_user.is_controller:
            return error('Access Controller role required', 403)
        return view(*args, **kwargs)
    return wrapped


def requester_required(view):
    """Access Admins only view requests; they cannot create or edit them."""
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if not current_user.can_create_requests:
            return error('Your role can view requests but not create or change them.', 403)
        return view(*args, **kwargs)
    return wrapped


def payload():
    """JSON body or form fields, whichever the client sent."""
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()


def clean(value):
    return value.strip() if isinstance(value, str) else ''


def password_problem(password):
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return f'Password must be at least {MIN_PASSWORD_LENGTH} characters.'
    if not re.search(r'[A-Za-z]', password) or not re.search(r'\d', password):
        return 'Password must contain letters and numbers.'
    return None


def paginate(query, default_per_page=10):
    page = max(request.args.get('page', 1, type=int), 1)
    per_page = min(max(request.args.get('per_page', default_per_page, type=int), 1), 100)
    result = query.paginate(page=page, per_page=per_page, error_out=False)
    return result, {'page': result.page, 'per_page': per_page, 'total': result.total, 'pages': result.pages}


def frontend_url(path):
    base = current_app.config.get('FRONTEND_URL') or request.host_url
    return base.rstrip('/') + '/' + path.lstrip('/')


def send_email(subject, recipients, body, html=None):
    """Send mail without ever failing the request that triggered it."""
    recipients = [r for r in recipients if r]
    if not recipients:
        return False
    try:
        mail.send(Message(subject=subject, recipients=recipients, body=body, html=html))
        return True
    except Exception:  # noqa: BLE001 - mail outages must not break the API
        current_app.logger.exception('Failed to send email "%s"', subject)
        return False
